import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.110.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type ConnectorAction = "save" | "status" | "connect" | "disconnect" | "send-test" | "retry-message";

type RequestBody = {
  action?: ConnectorAction;
  tenantId?: string;
  phone?: string;
  messageId?: string;
  settings?: Record<string, unknown>;
};

const connectorActions = new Set<ConnectorAction>([
  "save",
  "status",
  "connect",
  "disconnect",
  "send-test",
  "retry-message",
]);

const editableBooleanFields = [
  "enabled",
  "notify_client_booking",
  "notify_professional_booking",
  "notify_client_cancellation",
  "notify_professional_cancellation",
  "notify_client_reschedule",
  "notify_professional_reschedule",
  "reminder_enabled",
] as const;

const editableTemplateFields = [
  "client_booking_template",
  "professional_booking_template",
  "client_reminder_template",
  "client_cancellation_template",
  "professional_cancellation_template",
  "client_reschedule_template",
  "professional_reschedule_template",
] as const;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function environmentKey(jsonName: string, legacyNames: string[]): string | undefined {
  const keySet = Deno.env.get(jsonName);
  if (keySet) {
    try {
      const parsed = JSON.parse(keySet) as Record<string, string>;
      if (parsed.default) return parsed.default;
      const first = Object.values(parsed).find(Boolean);
      if (first) return first;
    } catch {
      // Continue with legacy variable names.
    }
  }

  for (const name of legacyNames) {
    const value = Deno.env.get(name);
    if (value) return value;
  }
  return undefined;
}

function digits(value: unknown) {
  return String(value ?? "").replace(/\D/g, "");
}

function text(value: unknown, maxLength: number) {
  return String(value ?? "")
    .trim()
    .slice(0, maxLength);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function connectorStatus(value: unknown) {
  const normalized = text(value, 40);
  return new Set([
    "not_connected",
    "connecting",
    "qr",
    "connected",
    "disconnected",
    "logged_out",
    "connector_error",
  ]).has(normalized)
    ? normalized
    : "connector_error";
}

async function ensureSettings(admin: SupabaseClient, tenantId: string) {
  const { data: existing, error } = await admin
    .from("tenant_whatsapp_settings")
    .select("*")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error) throw error;
  if (existing) return existing;

  const { data, error: insertError } = await admin
    .from("tenant_whatsapp_settings")
    .insert({ tenant_id: tenantId, session_id: tenantId })
    .select("*")
    .single();
  if (insertError) throw insertError;
  return data;
}

async function connectorRequest(
  sessionId: string,
  pathname: string,
  options: {
    method?: string;
    body?: Record<string, unknown>;
    timeoutMs?: number;
  } = {},
) {
  const baseUrl = text(Deno.env.get("LINKUP_WHATSAPP_CONNECTOR_URL"), 1000).replace(/\/+$/, "");
  const secret = Deno.env.get("LINKUP_WHATSAPP_CONNECTOR_SECRET") ?? "";
  if (!baseUrl || !secret) {
    return {
      ok: false,
      configured: false,
      connected: false,
      status: "connector_error",
      error:
        "O serviço do WhatsApp ainda não foi conectado ao Render. Configure a URL e o segredo no Lovable Cloud.",
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 15_000);
  try {
    const response = await fetch(`${baseUrl}/stores/${encodeURIComponent(sessionId)}${pathname}`, {
      method: options.method ?? "GET",
      headers: {
        "Content-Type": "application/json",
        "x-linkup-connector-secret": secret,
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
    });
    const decodedPayload: unknown = await response.json().catch(() => ({}));
    const payload = isRecord(decodedPayload) ? decodedPayload : {};
    return {
      ...payload,
      ok: response.ok,
      configured: true,
      statusCode: response.status,
      error: response.ok ? "" : payload?.error || `O conector respondeu ${response.status}.`,
    };
  } catch (error) {
    const timeoutError = error instanceof DOMException && error.name === "AbortError";
    return {
      ok: false,
      configured: true,
      connected: false,
      status: "connector_error",
      error: timeoutError
        ? "O serviço do WhatsApp demorou para responder."
        : "O serviço do WhatsApp no Render está indisponível.",
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function cacheConnectorStatus(
  admin: SupabaseClient,
  tenantId: string,
  payload: Record<string, unknown>,
) {
  const status = connectorStatus(
    payload.status ?? (payload.connected ? "connected" : "disconnected"),
  );
  const { error } = await admin
    .from("tenant_whatsapp_settings")
    .update({
      connection_status: status,
      connected_phone: digits(payload.phone) || null,
      last_connection_error: text(payload.error ?? payload.lastError, 1000) || null,
      last_status_at: new Date().toISOString(),
    })
    .eq("tenant_id", tenantId);
  if (error) console.error("[whatsapp-connector] status cache", error);
}

async function authorizeTenant(admin: SupabaseClient, userId: string, tenantId: string) {
  const { data: roles, error } = await admin
    .from("user_roles")
    .select("role, tenant_id")
    .eq("user_id", userId);
  if (error) throw error;

  return (roles ?? []).some(
    (role) =>
      role.role === "super_admin" ||
      (role.tenant_id === tenantId && (role.role === "owner" || role.role === "staff")),
  );
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (request.method !== "POST") {
    return json({ error: "Método não permitido." }, 405);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const publishableKey = environmentKey("SUPABASE_PUBLISHABLE_KEYS", [
      "SUPABASE_ANON_KEY",
      "SUPABASE_PUBLISHABLE_KEY",
    ]);
    const serviceRoleKey = environmentKey("SUPABASE_SECRET_KEYS", [
      "SUPABASE_SERVICE_ROLE_KEY",
      "SUPABASE_SECRET_KEY",
    ]);
    if (!supabaseUrl || !publishableKey || !serviceRoleKey) {
      return json(
        {
          error: "O backend do Lovable Cloud não está conectado corretamente.",
        },
        500,
      );
    }

    const authorization = request.headers.get("Authorization");
    const token = authorization?.replace(/^Bearer\s+/i, "");
    if (!authorization || !token) {
      return json({ error: "Sessão não encontrada." }, 401);
    }

    const callerClient = createClient(supabaseUrl, publishableKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: caller, error: callerError } = await callerClient.auth.getUser(token);
    if (callerError || !caller.user) {
      return json({ error: "Sessão inválida ou expirada." }, 401);
    }

    let decodedBody: unknown;
    try {
      decodedBody = await request.json();
    } catch {
      return json({ error: "Envie um corpo JSON válido." }, 400);
    }
    if (!isRecord(decodedBody)) {
      return json({ error: "Formato da requisição inválido." }, 400);
    }

    const body = decodedBody as RequestBody;
    const tenantId = text(body.tenantId, 80);
    const actionValue = text(body.action, 40);
    if (!tenantId || !actionValue) {
      return json({ error: "Empresa ou ação não informada." }, 400);
    }
    if (!isUuid(tenantId)) {
      return json({ error: "Identificador da empresa inválido." }, 400);
    }
    if (!connectorActions.has(actionValue as ConnectorAction)) {
      return json({ error: "Ação inválida." }, 400);
    }
    const action = actionValue as ConnectorAction;

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    if (!(await authorizeTenant(admin, caller.user.id, tenantId))) {
      return json(
        {
          error: "Você não tem permissão para configurar o WhatsApp desta loja.",
        },
        403,
      );
    }

    const { data: tenant, error: tenantError } = await admin
      .from("tenants")
      .select("id, name, slug, whatsapp")
      .eq("id", tenantId)
      .maybeSingle();
    if (tenantError) throw tenantError;
    if (!tenant) return json({ error: "Loja não encontrada." }, 404);

    let settings = await ensureSettings(admin, tenantId);
    const sessionId = settings.session_id || tenantId;

    if (action === "save") {
      const incoming = body.settings ?? {};
      if (!isRecord(incoming)) {
        return json({ error: "Configurações inválidas." }, 400);
      }
      const update: Record<string, unknown> = {};

      for (const field of editableBooleanFields) {
        if (typeof incoming[field] === "boolean") {
          update[field] = incoming[field];
        }
      }
      for (const field of editableTemplateFields) {
        if (field in incoming) {
          const template = text(incoming[field], 4000);
          if (!template) {
            return json(
              {
                error: "Os modelos de mensagem não podem ficar vazios.",
              },
              400,
            );
          }
          update[field] = template;
        }
      }

      if ("responsible_whatsapp" in incoming) {
        const phone = digits(incoming.responsible_whatsapp);
        if (phone && phone.length < 10) {
          return json(
            {
              error: "Informe um WhatsApp válido para o responsável.",
            },
            400,
          );
        }
        update.responsible_whatsapp = phone || null;
      }
      if ("reminder_minutes_before" in incoming) {
        const reminder = Number(incoming.reminder_minutes_before);
        if (!Number.isInteger(reminder) || reminder < 5 || reminder > 10080) {
          return json(
            {
              error: "O lembrete deve ficar entre 5 minutos e 7 dias antes.",
            },
            400,
          );
        }
        update.reminder_minutes_before = reminder;
      }

      const { data, error } = await admin
        .from("tenant_whatsapp_settings")
        .update(update)
        .eq("tenant_id", tenantId)
        .select("*")
        .single();
      if (error) throw error;
      return json({ ok: true, settings: data });
    }

    if (action === "retry-message") {
      const messageId = text(body.messageId, 80);
      if (!messageId) return json({ error: "Mensagem não informada." }, 400);
      if (!isUuid(messageId)) {
        return json({ error: "Identificador da mensagem inválido." }, 400);
      }

      const { data, error } = await admin
        .from("whatsapp_message_queue")
        .update({
          status: "pending",
          scheduled_for: new Date().toISOString(),
          attempts: 0,
          locked_at: null,
          sent_at: null,
          provider_message_id: null,
          rendered_message: null,
          last_error: null,
        })
        .eq("id", messageId)
        .eq("tenant_id", tenantId)
        .eq("status", "failed")
        .select("id")
        .maybeSingle();
      if (error) throw error;
      if (!data) {
        return json({ error: "Mensagem não disponível para reenvio." }, 409);
      }
      return json({ ok: true, messageId });
    }

    let result: Record<string, unknown>;
    if (action === "status") {
      result = await connectorRequest(sessionId, "/status");
    } else if (action === "connect") {
      result = await connectorRequest(sessionId, "/connect", {
        method: "POST",
      });
    } else if (action === "disconnect") {
      result = await connectorRequest(sessionId, "/session", {
        method: "DELETE",
      });
    } else if (action === "send-test") {
      const phone =
        digits(body.phone) || digits(settings.responsible_whatsapp) || digits(tenant.whatsapp);
      if (phone.length < 10) {
        return json(
          {
            error: "Informe o WhatsApp do responsável para receber o teste.",
          },
          400,
        );
      }
      result = await connectorRequest(sessionId, "/send", {
        method: "POST",
        body: {
          phone,
          message: `Teste LinkUp Salão: o WhatsApp da ${tenant.name} está conectado e pronto para avisar clientes e profissionais.`,
          kind: "salon_test",
          tenantId,
        },
      });
    } else {
      return json({ error: "Ação inválida." }, 400);
    }

    if (action !== "send-test") {
      await cacheConnectorStatus(admin, tenantId, result);
      settings = {
        ...settings,
        connection_status: connectorStatus(
          result.status ?? (result.connected ? "connected" : "disconnected"),
        ),
        connected_phone: digits(result.phone) || null,
        last_connection_error: text(result.error ?? result.lastError, 1000) || null,
        last_status_at: new Date().toISOString(),
      };
    }

    return json(
      {
        ...result,
        settings,
        sessionId,
        ok: Boolean(result.ok),
      },
      result.configured === false ? 503 : 200,
    );
  } catch (error) {
    console.error("[whatsapp-connector]", error);
    const message =
      error instanceof Error ? error.message : "Não foi possível acessar o módulo de WhatsApp.";
    const migrationMissing = /tenant_whatsapp_settings|whatsapp_message_queue/i.test(message);
    return json(
      {
        error: migrationMissing
          ? "A estrutura SQL do módulo de WhatsApp ainda não foi aplicada."
          : message,
      },
      500,
    );
  }
});

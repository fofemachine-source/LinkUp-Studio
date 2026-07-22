import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import webpush from "web-push";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-linkup-worker-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type PushAction = "public-key" | "dispatch-appointment";

type RequestBody = {
  action?: PushAction;
  appointmentId?: string;
  secret?: string;
};

type AppNotification = {
  id: string;
  tenant_id: string;
  recipient_user_id: string;
  title: string;
  body: string;
  data: Record<string, unknown> | null;
};

type PushSubscriptionRow = {
  id: string;
  tenant_id: string;
  user_id: string;
  endpoint: string;
  subscription: Record<string, unknown>;
};

type WebPushError = Error & {
  statusCode?: number;
  body?: string;
};

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

function text(value: unknown, maxLength = 2000) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLength);
}

function safeSecretMatch(provided: unknown, expected: string) {
  const providedText = text(provided, 500);
  if (!expected || !providedText || providedText.length !== expected.length) return false;

  let diff = 0;
  for (let index = 0; index < expected.length; index += 1) {
    diff |= expected.charCodeAt(index) ^ providedText.charCodeAt(index);
  }
  return diff === 0;
}

function getVapidConfig() {
  const publicKey =
    Deno.env.get("VAPID_PUBLIC_KEY") || Deno.env.get("LINKUP_PUSH_VAPID_PUBLIC_KEY") || "";
  const privateKey =
    Deno.env.get("VAPID_PRIVATE_KEY") || Deno.env.get("LINKUP_PUSH_VAPID_PRIVATE_KEY") || "";
  const subject =
    Deno.env.get("VAPID_SUBJECT") ||
    Deno.env.get("LINKUP_PUSH_VAPID_SUBJECT") ||
    "mailto:suporte@linkupstudio.app";

  return {
    publicKey: publicKey.trim(),
    privateKey: privateKey.trim(),
    subject: subject.trim(),
    configured: Boolean(publicKey.trim() && privateKey.trim()),
  };
}

function createAdminClient(): SupabaseClient {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = environmentKey("SUPABASE_SECRET_KEYS", [
    "SUPABASE_SERVICE_ROLE_KEY",
    "SUPABASE_SECRET_KEY",
  ]);

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Backend Supabase não configurado.");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function dispatchAppointmentPush(admin: SupabaseClient, appointmentId: string) {
  const vapid = getVapidConfig();
  if (!vapid.configured) {
    return {
      ok: true,
      skipped: true,
      reason: "vapid_not_configured",
      checked: 0,
      sent: 0,
      failed: 0,
      disabled: 0,
    };
  }

  webpush.setVapidDetails(vapid.subject, vapid.publicKey, vapid.privateKey);

  const { data: notifications, error: notificationsError } = await admin
    .from("app_notifications")
    .select("id, tenant_id, recipient_user_id, title, body, data")
    .eq("appointment_id", appointmentId)
    .eq("kind", "appointment_created");

  if (notificationsError) throw notificationsError;

  const rows = ((notifications ?? []) as AppNotification[]).filter((row) => row.recipient_user_id);
  if (rows.length === 0) {
    return { ok: true, checked: 0, sent: 0, failed: 0, disabled: 0 };
  }

  const notificationByUser = new Map(rows.map((row) => [row.recipient_user_id, row]));
  const recipientIds = [...notificationByUser.keys()];

  const { data: subscriptions, error: subscriptionsError } = await admin
    .from("push_subscriptions")
    .select("id, tenant_id, user_id, endpoint, subscription")
    .eq("enabled", true)
    .in("user_id", recipientIds);

  if (subscriptionsError) throw subscriptionsError;

  let sent = 0;
  let failed = 0;
  let disabled = 0;
  const checked = (subscriptions ?? []).length;

  for (const subscriptionRow of (subscriptions ?? []) as PushSubscriptionRow[]) {
    const notification = notificationByUser.get(subscriptionRow.user_id);
    if (!notification || notification.tenant_id !== subscriptionRow.tenant_id) continue;

    try {
      await webpush.sendNotification(
        subscriptionRow.subscription as webpush.PushSubscription,
        JSON.stringify({
          title: notification.title,
          body: notification.body,
          icon: "/favicon.ico",
          badge: "/favicon.ico",
          tag: `appointment-${appointmentId}`,
          url: text((notification.data ?? {}).url, 300) || "/app/agenda",
          data: {
            ...(notification.data ?? {}),
            notificationId: notification.id,
            appointmentId,
          },
        }),
      );
      sent += 1;
    } catch (error) {
      const pushError = error as WebPushError;
      failed += 1;

      if (pushError.statusCode === 404 || pushError.statusCode === 410) {
        disabled += 1;
        await admin
          .from("push_subscriptions")
          .update({ enabled: false, last_seen_at: new Date().toISOString() })
          .eq("id", subscriptionRow.id);
      } else {
        console.error("Falha ao enviar Push de agendamento.", {
          subscriptionId: subscriptionRow.id,
          statusCode: pushError.statusCode,
          body: pushError.body,
          message: pushError.message,
        });
      }
    }
  }

  return { ok: true, checked, sent, failed, disabled };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS")
    return new Response(null, { status: 204, headers: corsHeaders });
  if (request.method !== "POST") return json({ ok: false, error: "Método inválido." }, 405);

  try {
    let decoded: unknown = {};
    try {
      decoded = await request.json();
    } catch {
      decoded = {};
    }

    const body = (decoded && typeof decoded === "object" ? decoded : {}) as RequestBody;
    const action = body.action || "public-key";

    if (action === "public-key") {
      const vapid = getVapidConfig();
      return json({
        ok: true,
        configured: Boolean(vapid.publicKey),
        publicKey: vapid.publicKey || null,
      });
    }

    const expectedSecret =
      Deno.env.get("LINKUP_PUSH_WORKER_SECRET") ||
      Deno.env.get("LINKUP_WHATSAPP_CONNECTOR_SECRET") ||
      "";
    const suppliedSecret =
      request.headers.get("x-linkup-worker-secret") ||
      request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ||
      body.secret;

    if (!safeSecretMatch(suppliedSecret, expectedSecret)) {
      return json({ ok: false, error: "Não autorizado." }, 401);
    }

    if (action !== "dispatch-appointment") {
      return json({ ok: false, error: "Ação inválida." }, 400);
    }

    const appointmentId = text(body.appointmentId, 80);
    if (!appointmentId) return json({ ok: false, error: "Agendamento não informado." }, 400);

    const admin = createAdminClient();
    const result = await dispatchAppointmentPush(admin, appointmentId);
    return json(result);
  } catch (error) {
    console.error("Erro na Edge Function appointment-push.", error);
    return json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Erro interno.",
      },
      500,
    );
  }
});

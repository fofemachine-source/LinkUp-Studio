import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.110.1";

const externalReferencePrefix = "linkupstudio:b2b:v1";

type BillingEnvironment = "sandbox" | "production";
type BillingSettings = {
  enabled: boolean;
  environment: BillingEnvironment;
  default_billing_type: string;
  issue_days_before: number;
  fine_percentage: number | string;
  interest_percentage: number | string;
  discount_percentage: number | string;
  discount_due_days: number;
};

type WorkerBody = {
  action?: "run" | "process-events" | "generate-charges" | "apply-suspensions";
  environment?: BillingEnvironment;
  limit?: number;
  secret?: string;
};

type JsonRecord = Record<string, unknown>;

class ProviderError extends Error {
  status: number;
  payload: unknown;

  constructor(message: string, status: number, payload: unknown) {
    super(message);
    this.name = "ProviderError";
    this.status = status;
    this.payload = payload;
  }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
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

function safeSecretMatch(candidate: unknown, expected: string) {
  const left = String(candidate ?? "");
  const right = String(expected ?? "");
  if (!left || !right) return false;
  const leftBytes = new TextEncoder().encode(left);
  const rightBytes = new TextEncoder().encode(right);
  if (leftBytes.length !== rightBytes.length) return false;
  let difference = 0;
  for (let index = 0; index < leftBytes.length; index += 1) {
    difference |= leftBytes[index] ^ rightBytes[index];
  }
  return difference === 0;
}

function text(value: unknown, maxLength: number) {
  return String(value ?? "")
    .trim()
    .slice(0, maxLength);
}

function digits(value: unknown) {
  return String(value ?? "").replace(/\D/g, "");
}

function numberValue(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function baseUrl(environment: BillingEnvironment) {
  return environment === "production"
    ? "https://api.asaas.com/v3"
    : "https://api-sandbox.asaas.com/v3";
}

function apiKey(environment: BillingEnvironment) {
  const environmentSpecific =
    environment === "production"
      ? Deno.env.get("ASAAS_PRODUCTION_API_KEY")
      : Deno.env.get("ASAAS_SANDBOX_API_KEY");
  return environmentSpecific || Deno.env.get("ASAAS_API_KEY") || "";
}

function providerErrorMessage(payload: unknown, status: number) {
  if (isRecord(payload) && Array.isArray(payload.errors)) {
    const messages = payload.errors
      .map((entry) => (isRecord(entry) ? text(entry.description ?? entry.code, 300) : ""))
      .filter(Boolean);
    if (messages.length) return messages.join(" ");
  }
  return `O Asaas respondeu com status ${status}.`;
}

async function providerRequest(
  environment: BillingEnvironment,
  pathname: string,
  options: { method?: string; body?: JsonRecord; timeoutMs?: number } = {},
) {
  const key = apiKey(environment);
  if (!key) throw new ProviderError("Chave Asaas não configurada.", 503, null);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 20_000);
  try {
    const response = await fetch(`${baseUrl(environment)}${pathname}`, {
      method: options.method ?? "GET",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        access_token: key,
        "user-agent": "LinkUpStudio/1.0",
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
    });
    if (response.status === 204) return {} as JsonRecord;
    const raw = await response.text();
    let payload: unknown = {};
    try {
      payload = raw ? JSON.parse(raw) : {};
    } catch {
      payload = { message: raw.slice(0, 1000) };
    }
    if (!response.ok) {
      throw new ProviderError(
        providerErrorMessage(payload, response.status),
        response.status,
        payload,
      );
    }
    return isRecord(payload) ? payload : ({} as JsonRecord);
  } catch (error) {
    if (error instanceof ProviderError) throw error;
    const timedOut = error instanceof DOMException && error.name === "AbortError";
    throw new ProviderError(
      timedOut ? "O Asaas demorou para responder." : "Não foi possível acessar o Asaas.",
      timedOut ? 504 : 502,
      null,
    );
  } finally {
    clearTimeout(timeout);
  }
}

async function sha256(value: unknown) {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function addDays(date: string, days: number) {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function addMonthsMinusDay(date: string, months: number) {
  const source = new Date(`${date}T00:00:00.000Z`);
  const targetMonth = source.getUTCMonth() + Math.max(1, Math.floor(months));
  const targetYear = source.getUTCFullYear() + Math.floor(targetMonth / 12);
  const normalizedMonth = ((targetMonth % 12) + 12) % 12;
  const lastTargetDay = new Date(Date.UTC(targetYear, normalizedMonth + 1, 0)).getUTCDate();
  const nextPeriod = new Date(
    Date.UTC(targetYear, normalizedMonth, Math.min(source.getUTCDate(), lastTargetDay)),
  );
  nextPeriod.setUTCDate(nextPeriod.getUTCDate() - 1);
  return nextPeriod.toISOString().slice(0, 10);
}

function customerReference(tenantId: string) {
  return `${externalReferencePrefix}:tenant:${tenantId}`;
}

function chargeReference(tenantId: string, chargeId: string) {
  return `${externalReferencePrefix}:tenant:${tenantId}:charge:${chargeId}`;
}

async function listByExternalReference(
  environment: BillingEnvironment,
  resource: "customers" | "payments",
  externalReference: string,
) {
  const query = new URLSearchParams({ externalReference, limit: "100", offset: "0" });
  const payload = await providerRequest(environment, `/${resource}?${query.toString()}`);
  return Array.isArray(payload.data) ? payload.data.filter(isRecord) : [];
}

function customerPayload(customer: JsonRecord, tenantName: string) {
  const cpfCnpj = digits(customer.cpf_cnpj);
  if (![11, 14].includes(cpfCnpj.length)) {
    throw new ProviderError("Pagador sem CPF/CNPJ válido.", 422, null);
  }
  const payload: JsonRecord = {
    name: text(customer.legal_name || tenantName, 120),
    cpfCnpj,
    externalReference: text(customer.external_reference, 300),
    notificationDisabled: Boolean(customer.notification_disabled),
  };
  const email = text(customer.email, 180);
  const phone = digits(customer.phone);
  if (email) payload.email = email;
  if (phone) payload.mobilePhone = phone;
  for (const [source, target, maxLength] of [
    ["address", "address", 200],
    ["address_number", "addressNumber", 40],
    ["complement", "complement", 100],
    ["province", "province", 100],
    ["postal_code", "postalCode", 20],
    ["city", "city", 120],
    ["state", "state", 2],
  ] as const) {
    const value = text(customer[source], maxLength);
    if (value) payload[target] = value;
  }
  return payload;
}

async function ensureProviderCustomer(
  admin: SupabaseClient,
  environment: BillingEnvironment,
  customer: JsonRecord,
  tenantName: string,
) {
  const payload = customerPayload(customer, tenantName);
  const currentId = text(customer.provider_customer_id, 100);
  let providerCustomer: JsonRecord | null = null;
  if (currentId) {
    try {
      providerCustomer = await providerRequest(
        environment,
        `/customers/${encodeURIComponent(currentId)}`,
        { method: "PUT", body: payload },
      );
    } catch (error) {
      if (!(error instanceof ProviderError) || error.status !== 404) throw error;
    }
  }
  if (!providerCustomer) {
    const matches = await listByExternalReference(
      environment,
      "customers",
      text(customer.external_reference, 300),
    );
    if (matches[0]) {
      providerCustomer = await providerRequest(
        environment,
        `/customers/${encodeURIComponent(text(matches[0].id, 100))}`,
        { method: "PUT", body: payload },
      );
    } else {
      providerCustomer = await providerRequest(environment, "/customers", {
        method: "POST",
        body: payload,
      });
    }
  }
  const customerId = text(providerCustomer.id, 100);
  if (!customerId) throw new ProviderError("Asaas não retornou o cliente.", 502, providerCustomer);
  const { error } = await admin
    .from("tenant_billing_provider_customers")
    .update({
      provider_customer_id: customerId,
      sync_status: "synced",
      last_synced_at: new Date().toISOString(),
      last_error: null,
    })
    .eq("id", customer.id);
  if (error) throw error;
  return customerId;
}

function providerEventType(value: unknown) {
  const map: Record<string, string> = {
    PENDING: "PAYMENT_UPDATED",
    CONFIRMED: "PAYMENT_CONFIRMED",
    RECEIVED: "PAYMENT_RECEIVED",
    OVERDUE: "PAYMENT_OVERDUE",
    REFUND_IN_PROGRESS: "PAYMENT_REFUND_IN_PROGRESS",
    REFUNDED: "PAYMENT_REFUNDED",
    PARTIALLY_REFUNDED: "PAYMENT_PARTIALLY_REFUNDED",
    DELETED: "PAYMENT_DELETED",
    RESTORED: "PAYMENT_RESTORED",
    CREDIT_CARD_CAPTURE_REFUSED: "PAYMENT_CREDIT_CARD_CAPTURE_REFUSED",
    CHARGEBACK_REQUESTED: "PAYMENT_CHARGEBACK_REQUESTED",
    CHARGEBACK_DISPUTE: "PAYMENT_CHARGEBACK_DISPUTE",
    AWAITING_CHARGEBACK_REVERSAL: "PAYMENT_AWAITING_CHARGEBACK_REVERSAL",
    DUNNING_RECEIVED: "PAYMENT_DUNNING_RECEIVED",
  };
  return map[text(value, 100).toUpperCase()] ?? "PAYMENT_UPDATED";
}

function chargeMetadata(payment: JsonRecord) {
  return {
    provider_payment_id: text(payment.id, 100) || null,
    invoice_url: text(payment.invoiceUrl, 1000) || null,
    bank_slip_url: text(payment.bankSlipUrl, 1000) || null,
    last_synced_at: new Date().toISOString(),
    error_message: null,
  };
}

async function applyPaymentState(admin: SupabaseClient, chargeId: string, payment: JsonRecord) {
  const { error: metadataError } = await admin
    .from("platform_billing_charges")
    .update(chargeMetadata(payment))
    .eq("id", chargeId);
  if (metadataError) throw metadataError;

  const eventType = providerEventType(payment.status);
  const paymentId = text(payment.id, 100);
  const { data, error } = await admin.rpc("apply_platform_billing_charge_state", {
    p_charge_id: chargeId,
    p_event_type: eventType,
    p_provider_event_id: `snapshot:${chargeId}:${paymentId || "unknown"}:${eventType}`,
    p_provider_event_at: new Date().toISOString(),
    p_provider_payment_id: paymentId || null,
    p_invoice_url: text(payment.invoiceUrl, 1000) || null,
    p_bank_slip_url: text(payment.bankSlipUrl, 1000) || null,
    p_source: "worker",
    p_event_row_id: null,
  });
  if (error) throw error;
  return data;
}

function paymentPayload(customerId: string, charge: JsonRecord, settings: BillingSettings) {
  const payload: JsonRecord = {
    customer: customerId,
    billingType: text(charge.billing_type || settings.default_billing_type, 30),
    value: numberValue(charge.amount),
    dueDate: text(charge.due_date, 10),
    description: text(charge.description || "Licença LinkUp Studio", 500),
    externalReference: text(charge.external_reference, 300),
  };
  const fine = numberValue(settings.fine_percentage);
  const interest = numberValue(settings.interest_percentage);
  const discount = numberValue(settings.discount_percentage);
  if (fine > 0) payload.fine = { value: fine, type: "PERCENTAGE" };
  if (interest > 0) payload.interest = { value: interest, type: "PERCENTAGE" };
  if (discount > 0) {
    payload.discount = {
      value: discount,
      type: "PERCENTAGE",
      dueDateLimitDays: Math.max(0, Number(settings.discount_due_days || 0)),
    };
  }
  return payload;
}

async function completeOperation(
  admin: SupabaseClient,
  operationId: string,
  status: "succeeded" | "failed" | "unknown",
  providerResourceId: string | null,
  response: unknown,
  error: string | null,
) {
  const { error: rpcError } = await admin.rpc("complete_platform_billing_provider_operation", {
    p_operation_id: operationId,
    p_status: status,
    p_provider_resource_id: providerResourceId,
    p_response_payload: isRecord(response) ? response : {},
    p_error: error,
  });
  if (rpcError) throw rpcError;
}

async function issueChargeSafely(
  admin: SupabaseClient,
  environment: BillingEnvironment,
  charge: JsonRecord,
  settings: BillingSettings,
) {
  let customerId = text(charge.provider_customer_id, 100);
  if (!customerId) {
    const [{ data: customer, error: customerError }, { data: tenant, error: tenantError }] =
      await Promise.all([
        admin
          .from("tenant_billing_provider_customers")
          .select("*")
          .eq("tenant_id", charge.tenant_id)
          .eq("provider", "asaas")
          .eq("environment", environment)
          .maybeSingle(),
        admin.from("tenants").select("name").eq("id", charge.tenant_id).maybeSingle(),
      ]);
    if (customerError) throw customerError;
    if (tenantError) throw tenantError;
    if (!customer) throw new Error("Perfil de cobrança do salão não configurado.");
    customerId = await ensureProviderCustomer(
      admin,
      environment,
      customer as JsonRecord,
      text(tenant?.name, 160),
    );
  }

  const requestPayload = paymentPayload(customerId, charge, settings);
  const { data: operation, error: operationError } = await admin.rpc(
    "begin_platform_billing_provider_operation",
    {
      p_environment: environment,
      p_operation_key: charge.idempotency_key,
      p_operation_type: "create_payment",
      p_tenant_id: charge.tenant_id,
      p_contract_id: charge.contract_id,
      p_charge_id: charge.id,
      p_request_fingerprint: await sha256(requestPayload),
      p_request_payload: requestPayload,
    },
  );
  if (operationError) throw operationError;
  if (operation?.conflict) throw new Error("Chave idempotente reutilizada com dados diferentes.");
  if (!operation?.proceed && operation?.inProgress) {
    return { inProgress: true, recovered: false };
  }

  const operationId = text(operation?.operationId, 80);
  let payment: JsonRecord | null = isRecord(operation?.response)
    ? (operation.response as JsonRecord)
    : null;
  let recovered = Boolean(payment && text(payment.id, 100));
  if (!payment || !text(payment.id, 100)) {
    const found = await listByExternalReference(
      environment,
      "payments",
      text(charge.external_reference, 300),
    );
    payment = found[0] ?? null;
    recovered = Boolean(payment);
  }

  if (!payment) {
    try {
      payment = await providerRequest(environment, "/payments", {
        method: "POST",
        body: requestPayload,
        timeoutMs: 25_000,
      });
    } catch (error) {
      const found = await listByExternalReference(
        environment,
        "payments",
        text(charge.external_reference, 300),
      ).catch(() => []);
      payment = found[0] ?? null;
      if (!payment) {
        if (operationId && operation?.proceed) {
          await completeOperation(
            admin,
            operationId,
            error instanceof ProviderError && [502, 504].includes(error.status)
              ? "unknown"
              : "failed",
            null,
            {},
            error instanceof Error ? error.message : "Falha no Asaas.",
          );
        }
        throw error;
      }
      recovered = true;
    }
  }

  if (operationId && operation?.proceed) {
    await completeOperation(
      admin,
      operationId,
      "succeeded",
      text(payment.id, 100) || null,
      payment,
      null,
    );
  }
  await applyPaymentState(admin, text(charge.id, 80), payment);
  return { inProgress: false, recovered };
}

async function processEvents(
  admin: SupabaseClient,
  environment: BillingEnvironment,
  limit: number,
) {
  const workerId = crypto.randomUUID();
  const { data: claimed, error: claimError } = await admin.rpc(
    "claim_platform_billing_webhook_events",
    { p_environment: environment, p_limit: limit, p_worker_id: workerId },
  );
  if (claimError) throw claimError;
  const events = Array.isArray(claimed?.events) ? claimed.events.filter(isRecord) : [];
  const result = { claimed: events.length, processed: 0, ignored: 0, failed: 0 };
  for (const event of events) {
    try {
      const { data, error } = await admin.rpc("apply_platform_billing_charge_state", {
        p_charge_id: event.charge_id,
        p_event_type: event.event_type,
        p_provider_event_id: event.provider_event_id,
        p_provider_event_at: event.provider_created_at || event.received_at,
        p_provider_payment_id: event.provider_payment_id,
        p_invoice_url: null,
        p_bank_slip_url: null,
        p_source: "webhook",
        p_event_row_id: event.id,
      });
      if (error) throw error;
      if (data?.status === "ignored") result.ignored += 1;
      else result.processed += 1;
    } catch (error) {
      const attempts = Math.max(1, numberValue(event.attempts, 1));
      const retrySeconds = Math.min(3600, 30 * 2 ** Math.max(0, attempts - 1));
      const message = error instanceof Error ? error.message : "Falha ao processar evento.";
      const { error: failError } = await admin.rpc("fail_platform_billing_webhook_event", {
        p_event_row_id: event.id,
        p_error: message.slice(0, 4000),
        p_retry_after_seconds: retrySeconds,
      });
      if (failError) console.error("[asaas-worker] event fail state", failError.message);
      result.failed += 1;
    }
  }
  return result;
}

async function generateCharges(
  admin: SupabaseClient,
  environment: BillingEnvironment,
  settings: BillingSettings,
  limit: number,
) {
  const cutoff = addDays(
    new Date().toISOString().slice(0, 10),
    Math.max(0, numberValue(settings.issue_days_before, 7)),
  );
  const { data: contracts, error } = await admin
    .from("platform_billing_contracts")
    .select("*, tenants(id,name), platform_billing_plans(id,name)")
    .in("status", ["trialing", "active", "past_due"])
    .eq("auto_renew", true)
    .eq("cancel_at_period_end", false)
    .not("next_due_date", "is", null)
    .lte("next_due_date", cutoff)
    .order("next_due_date", { ascending: true })
    .limit(limit);
  if (error) throw error;

  const result = { due: contracts?.length ?? 0, created: 0, recovered: 0, reused: 0, failed: 0 };
  for (const contract of (contracts ?? []) as JsonRecord[]) {
    let operationId = "";
    let localChargeId = "";
    try {
      const tenantId = text(contract.tenant_id, 80);
      const contractId = text(contract.id, 80);
      const dueDate = text(contract.next_due_date, 10);
      const intervalMonths = Math.max(1, numberValue(contract.interval_months_snapshot, 1));
      const coverageStart = dueDate;
      const coverageEnd = addMonthsMinusDay(coverageStart, intervalMonths);
      const idempotencyKey = `auto:${environment}:${contractId}:${coverageStart}:${coverageEnd}`;

      const { data: existing, error: existingError } = await admin
        .from("platform_billing_charges")
        .select("*")
        .eq("provider", "asaas")
        .eq("environment", environment)
        .eq("idempotency_key", idempotencyKey)
        .maybeSingle();
      if (existingError) throw existingError;
      if (existing) {
        if (["creating", "failed"].includes(text(existing.status, 40))) {
          const recovered = await issueChargeSafely(
            admin,
            environment,
            existing as JsonRecord,
            settings,
          );
          if (recovered.inProgress) result.reused += 1;
          else result.recovered += 1;
        } else {
          result.reused += 1;
        }
        continue;
      }

      const { data: customer, error: customerError } = await admin
        .from("tenant_billing_provider_customers")
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("provider", "asaas")
        .eq("environment", environment)
        .maybeSingle();
      if (customerError) throw customerError;
      if (!customer) throw new Error("Perfil de cobrança do salão não configurado.");
      const tenant = isRecord(contract.tenants) ? contract.tenants : {};
      const customerId = await ensureProviderCustomer(
        admin,
        environment,
        customer,
        text(tenant.name, 160),
      );

      localChargeId = crypto.randomUUID();
      const externalReference = chargeReference(tenantId, localChargeId);
      const { data: localCharge, error: insertError } = await admin
        .from("platform_billing_charges")
        .insert({
          id: localChargeId,
          tenant_id: tenantId,
          contract_id: contractId,
          plan_id: contract.plan_id,
          provider: "asaas",
          environment,
          provider_customer_id: customerId,
          external_reference: externalReference,
          idempotency_key: idempotencyKey,
          source: "automatic",
          billing_type: contract.billing_type || settings.default_billing_type,
          amount: contract.amount_snapshot,
          due_date: dueDate,
          coverage_start: coverageStart,
          coverage_end: coverageEnd,
          description: `Licença LinkUp Studio — ${coverageStart} a ${coverageEnd}`,
          status: "creating",
        })
        .select("*")
        .single();
      if (insertError) {
        if (insertError.code === "23505") {
          result.reused += 1;
          continue;
        }
        throw insertError;
      }

      const requestPayload = paymentPayload(customerId, localCharge, settings);
      const { data: operation, error: operationError } = await admin.rpc(
        "begin_platform_billing_provider_operation",
        {
          p_environment: environment,
          p_operation_key: idempotencyKey,
          p_operation_type: "create_payment",
          p_tenant_id: tenantId,
          p_contract_id: contractId,
          p_charge_id: localChargeId,
          p_request_fingerprint: await sha256(requestPayload),
          p_request_payload: requestPayload,
        },
      );
      if (operationError) throw operationError;
      operationId = text(operation?.operationId, 80);
      if (operation?.conflict)
        throw new Error("Chave idempotente reutilizada com dados diferentes.");
      if (!operation?.proceed && operation?.inProgress) {
        result.reused += 1;
        continue;
      }

      let payment: JsonRecord | null = null;
      const found = await listByExternalReference(environment, "payments", externalReference);
      if (found[0]) payment = found[0];
      if (!payment) {
        try {
          payment = await providerRequest(environment, "/payments", {
            method: "POST",
            body: requestPayload,
            timeoutMs: 25_000,
          });
        } catch (providerError) {
          const recovered = await listByExternalReference(
            environment,
            "payments",
            externalReference,
          ).catch(() => []);
          if (recovered[0]) payment = recovered[0];
          else {
            const unknown =
              providerError instanceof ProviderError && [502, 504].includes(providerError.status);
            if (operationId) {
              await completeOperation(
                admin,
                operationId,
                unknown ? "unknown" : "failed",
                null,
                {},
                providerError instanceof Error ? providerError.message : "Falha no Asaas.",
              );
            }
            throw providerError;
          }
        }
      }

      const providerPaymentId = text(payment.id, 100);
      if (operationId) {
        await completeOperation(
          admin,
          operationId,
          "succeeded",
          providerPaymentId || null,
          payment,
          null,
        );
      }
      await applyPaymentState(admin, localChargeId, payment);
      result.created += 1;
    } catch (error) {
      if (localChargeId) {
        await admin
          .from("platform_billing_charges")
          .update({
            status: "failed",
            error_message:
              error instanceof Error ? error.message.slice(0, 1000) : "Falha ao gerar cobrança.",
          })
          .eq("id", localChargeId)
          .eq("status", "creating");
      }
      result.failed += 1;
      console.error(
        "[asaas-worker] charge generation",
        error instanceof Error ? error.message : "unknown error",
      );
    }
  }
  return result;
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return json({ ok: false, error: "Método não permitido." }, 405);
  let runAdmin: SupabaseClient | null = null;
  let runId = "";
  try {
    let decoded: unknown = {};
    try {
      decoded = await request.json();
    } catch {
      decoded = {};
    }
    const body = isRecord(decoded) ? (decoded as WorkerBody) : {};
    const expectedSecret = Deno.env.get("ASAAS_WORKER_SECRET") || "";
    const suppliedSecret =
      request.headers.get("x-linkup-worker-secret") ||
      request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ||
      body.secret;
    if (!safeSecretMatch(suppliedSecret, expectedSecret)) {
      return json({ ok: false, error: "Não autorizado." }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = environmentKey("SUPABASE_SECRET_KEYS", [
      "SUPABASE_SERVICE_ROLE_KEY",
      "SUPABASE_SECRET_KEY",
    ]);
    if (!supabaseUrl || !serviceRoleKey) {
      return json({ ok: false, error: "Backend não configurado." }, 500);
    }
    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    runAdmin = admin;
    const { data: settingsRow, error: settingsError } = await admin
      .from("platform_billing_settings")
      .select("*")
      .eq("id", "global")
      .single();
    if (settingsError) throw settingsError;
    const settings = settingsRow as BillingSettings;
    const activeEnvironment: BillingEnvironment =
      settings.environment === "production" ? "production" : "sandbox";
    const requestedEnvironment: BillingEnvironment | null =
      body.environment === "production" || body.environment === "sandbox" ? body.environment : null;
    const action = body.action || "run";
    if (!new Set(["run", "process-events", "generate-charges", "apply-suspensions"]).has(action)) {
      return json({ ok: false, error: "Ação inválida." }, 400);
    }
    const requestedLimit = numberValue(body.limit, 25);
    const limit = Math.min(100, Math.max(1, Math.floor(requestedLimit)));
    const result: JsonRecord = { ok: true, environment: activeEnvironment };
    runId = crypto.randomUUID();
    const { error: runStartError } = await admin.from("platform_billing_worker_runs").insert({
      id: runId,
      environment: activeEnvironment,
      action,
      status: "running",
      started_at: new Date().toISOString(),
    });
    if (runStartError) throw runStartError;

    if (action === "run" || action === "process-events") {
      if (requestedEnvironment) {
        result.events = await processEvents(admin, requestedEnvironment, limit);
      } else {
        const [sandbox, production] = await Promise.all([
          processEvents(admin, "sandbox", limit),
          processEvents(admin, "production", limit),
        ]);
        result.events = { sandbox, production };
      }
    }
    if (action === "run" || action === "generate-charges") {
      result.generation = settings.enabled
        ? await generateCharges(admin, activeEnvironment, settings, limit)
        : { skipped: true, reason: "billing_disabled" };
    }
    if (action === "run" || action === "apply-suspensions") {
      if (settings.enabled) {
        const { data, error } = await admin.rpc("apply_platform_billing_suspensions", {
          p_as_of: new Date().toISOString().slice(0, 10),
        });
        if (error) throw error;
        result.suspended = numberValue(data, 0);
      } else {
        result.suspended = { skipped: true, reason: "billing_disabled" };
      }
    }
    const { error: runCompleteError } = await admin
      .from("platform_billing_worker_runs")
      .update({
        status: "succeeded",
        completed_at: new Date().toISOString(),
        summary: result,
        error_message: null,
      })
      .eq("id", runId);
    if (runCompleteError) throw runCompleteError;
    return json(result);
  } catch (error) {
    console.error("[asaas-worker]", error instanceof Error ? error.message : "unknown error");
    if (runAdmin && runId) {
      await runAdmin
        .from("platform_billing_worker_runs")
        .update({
          status: "failed",
          completed_at: new Date().toISOString(),
          error_message:
            error instanceof Error ? error.message.slice(0, 4000) : "Falha desconhecida.",
        })
        .eq("id", runId);
    }
    return json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Falha no worker de cobrança.",
      },
      500,
    );
  }
});

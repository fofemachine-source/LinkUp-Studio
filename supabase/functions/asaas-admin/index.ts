import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.110.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const externalReferencePrefix = "linkupstudio:b2b:v1";
const webhookNamePrefix = "LinkUp Studio B2B";
const webhookEvents = [
  "PAYMENT_CREATED",
  "PAYMENT_UPDATED",
  "PAYMENT_AWAITING_RISK_ANALYSIS",
  "PAYMENT_APPROVED_BY_RISK_ANALYSIS",
  "PAYMENT_AUTHORIZED",
  "PAYMENT_RESTORED",
  "PAYMENT_REPROVED_BY_RISK_ANALYSIS",
  "PAYMENT_CREDIT_CARD_CAPTURE_REFUSED",
  "PAYMENT_CONFIRMED",
  "PAYMENT_RECEIVED",
  "PAYMENT_DUNNING_RECEIVED",
  "PAYMENT_OVERDUE",
  "PAYMENT_DELETED",
  "PAYMENT_REFUND_IN_PROGRESS",
  "PAYMENT_REFUNDED",
  "PAYMENT_RECEIVED_IN_CASH_UNDONE",
  "PAYMENT_PARTIALLY_REFUNDED",
  "PAYMENT_REFUND_DENIED",
  "PAYMENT_CHARGEBACK_REQUESTED",
  "PAYMENT_CHARGEBACK_DISPUTE",
  "PAYMENT_AWAITING_CHARGEBACK_REVERSAL",
] as const;

type BillingEnvironment = "sandbox" | "production";
type BillingType = "UNDEFINED" | "PIX" | "BOLETO" | "CREDIT_CARD";
type AdminAction =
  | "status"
  | "save-settings"
  | "save-plan"
  | "save-contract"
  | "test-connection"
  | "configure-webhook"
  | "sync-customer"
  | "create-charge"
  | "refresh-charge"
  | "cancel-charge"
  | "pix-qrcode";

type RequestBody = {
  action?: string;
  tenantId?: string;
  contractId?: string;
  status?: string;
  chargeId?: string;
  idempotencyKey?: string;
  amount?: number | string;
  dueDate?: string;
  billingType?: BillingType;
  coverageStart?: string;
  coverageEnd?: string;
  description?: string;
  charge?: Record<string, unknown>;
  settings?: Record<string, unknown>;
  plan?: Record<string, unknown>;
  contract?: Record<string, unknown>;
  customer?: Record<string, unknown>;
};

type BillingSettings = {
  enabled: boolean;
  environment: BillingEnvironment;
  default_billing_type: BillingType;
  issue_days_before: number;
  grace_days: number;
  auto_suspend: boolean;
  fine_percentage: number | string;
  interest_percentage: number | string;
  discount_percentage: number | string;
  discount_due_days: number;
  notification_disabled: boolean;
  whatsapp_enabled?: boolean;
  platform_trial_reminder_enabled?: boolean;
  platform_trial_reminder_days_before?: number[];
  platform_payment_reminder_enabled?: boolean;
  platform_payment_reminder_days_before?: number[];
  platform_payment_confirmation_enabled?: boolean;
  platform_overdue_enabled?: boolean;
  platform_overdue_days_after?: number[];
  platform_notification_time?: string;
  platform_trial_reminder_template?: string;
  platform_payment_reminder_template?: string;
  platform_payment_confirmation_template?: string;
  platform_overdue_template?: string;
  webhook_id: string | null;
  webhook_environment: BillingEnvironment | null;
  webhook_status: string;
  webhook_last_synced_at: string | null;
};

type AsaasPayload = Record<string, unknown>;

class AsaasRequestError extends Error {
  status: number;
  payload: unknown;

  constructor(message: string, status: number, payload: unknown) {
    super(message);
    this.name = "AsaasRequestError";
    this.status = status;
    this.payload = payload;
  }
}

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

function text(value: unknown, maxLength: number) {
  return String(value ?? "")
    .trim()
    .slice(0, maxLength);
}

function digits(value: unknown) {
  return String(value ?? "").replace(/\D/g, "");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function isIsoDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function numberValue(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function billingEnvironment(value: unknown): BillingEnvironment {
  return value === "production" ? "production" : "sandbox";
}

function billingType(value: unknown, fallback: BillingType = "UNDEFINED"): BillingType {
  const normalized = text(value, 30).toUpperCase();
  return new Set(["UNDEFINED", "PIX", "BOLETO", "CREDIT_CARD"]).has(normalized)
    ? (normalized as BillingType)
    : fallback;
}

function inputValue(input: Record<string, unknown>, snakeName: string, camelName: string) {
  if (Object.prototype.hasOwnProperty.call(input, snakeName)) return input[snakeName];
  if (Object.prototype.hasOwnProperty.call(input, camelName)) return input[camelName];
  return undefined;
}

function dayOffsets(
  value: unknown,
  fieldLabel: string,
  minimum: number,
  direction: "asc" | "desc",
) {
  if (!Array.isArray(value)) {
    throw new AsaasRequestError(`Informe os dias de ${fieldLabel}.`, 400, null);
  }
  const normalized = Array.from(
    new Set(
      value
        .map((entry) => Math.floor(numberValue(entry, Number.NaN)))
        .filter((entry) => Number.isInteger(entry)),
    ),
  );
  if (
    normalized.length < 1 ||
    normalized.length > 10 ||
    normalized.some((entry) => entry < minimum || entry > 365)
  ) {
    throw new AsaasRequestError(
      `Os dias de ${fieldLabel} precisam ter entre 1 e 10 valores de ${minimum} a 365.`,
      400,
      null,
    );
  }
  normalized.sort((left, right) => (direction === "asc" ? left - right : right - left));
  return normalized;
}

function notificationTime(value: unknown) {
  const normalized = text(value || "09:00", 5);
  if (!/^\d{2}:\d{2}$/.test(normalized)) {
    throw new AsaasRequestError("Informe um horário válido para os avisos.", 400, null);
  }
  const [hours, minutes] = normalized.split(":").map(Number);
  if (hours > 23 || minutes > 59) {
    throw new AsaasRequestError("Informe um horário válido para os avisos.", 400, null);
  }
  return normalized;
}

function messageTemplate(value: unknown, fieldLabel: string) {
  const normalized = text(value, 3900);
  if (!normalized) throw new AsaasRequestError(`Informe o modelo de ${fieldLabel}.`, 400, null);
  return normalized;
}

function normalizeAction(value: unknown): AdminAction | null {
  const action = text(value, 80).toLowerCase();
  const aliases: Record<string, AdminAction> = {
    status: "status",
    "configuration-status": "status",
    "save-settings": "save-settings",
    "save-plan": "save-plan",
    "save-contract": "save-contract",
    "test-connection": "test-connection",
    "configure-webhook": "configure-webhook",
    "sync-webhook": "configure-webhook",
    "sync-customer": "sync-customer",
    "create-charge": "create-charge",
    "refresh-charge": "refresh-charge",
    "cancel-charge": "cancel-charge",
    "pix-qrcode": "pix-qrcode",
  };
  return aliases[action] ?? null;
}

function asaasBaseUrl(environment: BillingEnvironment) {
  return environment === "production"
    ? "https://api.asaas.com/v3"
    : "https://api-sandbox.asaas.com/v3";
}

function asaasApiKey(environment: BillingEnvironment) {
  const environmentSpecific =
    environment === "production"
      ? Deno.env.get("ASAAS_PRODUCTION_API_KEY")
      : Deno.env.get("ASAAS_SANDBOX_API_KEY");
  return environmentSpecific || Deno.env.get("ASAAS_API_KEY") || "";
}

function asaasWebhookToken(environment: BillingEnvironment) {
  const environmentSpecific =
    environment === "production"
      ? Deno.env.get("ASAAS_PRODUCTION_WEBHOOK_TOKEN")
      : Deno.env.get("ASAAS_SANDBOX_WEBHOOK_TOKEN");
  return environmentSpecific || Deno.env.get("ASAAS_WEBHOOK_TOKEN") || "";
}

function webhookTokensAreUnambiguous() {
  const sandbox = Deno.env.get("ASAAS_SANDBOX_WEBHOOK_TOKEN") || "";
  const production = Deno.env.get("ASAAS_PRODUCTION_WEBHOOK_TOKEN") || "";
  return !(sandbox && production && sandbox === production);
}

function asaasErrorMessage(payload: unknown, status: number) {
  if (isRecord(payload) && Array.isArray(payload.errors)) {
    const messages = payload.errors
      .map((entry) => (isRecord(entry) ? text(entry.description ?? entry.code, 300) : ""))
      .filter(Boolean);
    if (messages.length) return messages.join(" ");
  }
  if (isRecord(payload)) {
    const message = text(payload.message ?? payload.error ?? payload.description, 500);
    if (message) return message;
  }
  return `O Asaas respondeu com status ${status}.`;
}

async function asaasRequest(
  environment: BillingEnvironment,
  pathname: string,
  options: { method?: string; body?: Record<string, unknown>; timeoutMs?: number } = {},
) {
  const apiKey = asaasApiKey(environment);
  if (!apiKey) {
    throw new AsaasRequestError(
      `A chave do Asaas para ${environment === "production" ? "produção" : "sandbox"} não foi configurada.`,
      503,
      null,
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 20_000);
  try {
    const response = await fetch(`${asaasBaseUrl(environment)}${pathname}`, {
      method: options.method ?? "GET",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        access_token: apiKey,
        "user-agent": "LinkUpStudio/1.0",
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
    });
    if (response.status === 204) return {} as AsaasPayload;

    const raw = await response.text();
    let payload: unknown = {};
    if (raw) {
      try {
        payload = JSON.parse(raw);
      } catch {
        payload = { message: raw.slice(0, 1000) };
      }
    }
    if (!response.ok) {
      throw new AsaasRequestError(
        asaasErrorMessage(payload, response.status),
        response.status,
        payload,
      );
    }
    return isRecord(payload) ? payload : ({} as AsaasPayload);
  } catch (error) {
    if (error instanceof AsaasRequestError) throw error;
    const timedOut = error instanceof DOMException && error.name === "AbortError";
    throw new AsaasRequestError(
      timedOut ? "O Asaas demorou para responder." : "Não foi possível acessar o Asaas.",
      timedOut ? 504 : 502,
      null,
    );
  } finally {
    clearTimeout(timeout);
  }
}

async function getSettings(admin: SupabaseClient): Promise<BillingSettings> {
  const { data, error } = await admin
    .from("platform_billing_settings")
    .select("*")
    .eq("id", "global")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("As configurações de cobrança B2B ainda não foram criadas.");
  return data as BillingSettings;
}

async function assertSuperAdmin(admin: SupabaseClient, userId: string) {
  const { data, error } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "super_admin")
    .limit(1);
  if (error) throw error;
  if (!data?.length) {
    throw new AsaasRequestError(
      "Apenas o ADM Owner pode gerenciar cobranças da plataforma.",
      403,
      null,
    );
  }
}

async function saveSettings(admin: SupabaseClient, input: Record<string, unknown>, userId: string) {
  const patch: Record<string, unknown> = { updated_by: userId };
  if (Object.prototype.hasOwnProperty.call(input, "enabled")) {
    patch.enabled = Boolean(input.enabled);
  }
  if (Object.prototype.hasOwnProperty.call(input, "environment")) {
    const nextEnvironment = billingEnvironment(input.environment);
    const { data: current, error: currentError } = await admin
      .from("platform_billing_settings")
      .select("environment,webhook_id,webhook_environment")
      .eq("id", "global")
      .single();
    if (currentError) throw currentError;
    patch.environment = nextEnvironment;
    if (
      current.environment !== nextEnvironment ||
      (current.webhook_id && current.webhook_environment !== nextEnvironment)
    ) {
      patch.webhook_id = null;
      patch.webhook_environment = null;
      patch.webhook_status = "not_configured";
      patch.webhook_last_synced_at = null;
    }
  }
  const defaultBillingType = input.default_billing_type ?? input.defaultBillingType;
  if (defaultBillingType !== undefined) {
    patch.default_billing_type = billingType(defaultBillingType);
  }
  for (const [field, minimum, maximum] of [
    ["issue_days_before", 0, 90],
    ["grace_days", 0, 90],
    ["discount_due_days", 0, 90],
    ["fine_percentage", 0, 100],
    ["interest_percentage", 0, 100],
    ["discount_percentage", 0, 100],
  ] as const) {
    const camelField = field.replace(/_([a-z])/g, (_match, letter: string) => letter.toUpperCase());
    const rawValue = input[field] ?? input[camelField];
    if (rawValue === undefined) continue;
    const value = numberValue(rawValue, Number.NaN);
    if (!Number.isFinite(value) || value < minimum || value > maximum) {
      throw new AsaasRequestError(`Valor inválido para ${field}.`, 400, null);
    }
    patch[field] = ["issue_days_before", "grace_days", "discount_due_days"].includes(field)
      ? Math.floor(value)
      : value;
  }
  for (const field of ["auto_suspend", "notification_disabled"] as const) {
    const camelField = field.replace(/_([a-z])/g, (_match, letter: string) => letter.toUpperCase());
    const rawValue = input[field] ?? input[camelField];
    if (rawValue !== undefined) patch[field] = Boolean(rawValue);
  }

  for (const [snakeName, camelName] of [
    ["whatsapp_enabled", "whatsappEnabled"],
    ["platform_trial_reminder_enabled", "platformTrialReminderEnabled"],
    ["platform_payment_reminder_enabled", "platformPaymentReminderEnabled"],
    ["platform_payment_confirmation_enabled", "platformPaymentConfirmationEnabled"],
    ["platform_overdue_enabled", "platformOverdueEnabled"],
  ] as const) {
    const rawValue = inputValue(input, snakeName, camelName);
    if (rawValue !== undefined) patch[snakeName] = Boolean(rawValue);
  }

  const notificationTimeValue = inputValue(
    input,
    "platform_notification_time",
    "platformNotificationTime",
  );
  if (notificationTimeValue !== undefined) {
    patch.platform_notification_time = notificationTime(notificationTimeValue);
  }

  const trialDays = inputValue(
    input,
    "platform_trial_reminder_days_before",
    "platformTrialReminderDaysBefore",
  );
  if (trialDays !== undefined) {
    patch.platform_trial_reminder_days_before = dayOffsets(
      trialDays,
      "aviso de teste grátis",
      0,
      "desc",
    );
  }
  const paymentReminderDays = inputValue(
    input,
    "platform_payment_reminder_days_before",
    "platformPaymentReminderDaysBefore",
  );
  if (paymentReminderDays !== undefined) {
    patch.platform_payment_reminder_days_before = dayOffsets(
      paymentReminderDays,
      "lembrete de mensalidade",
      0,
      "desc",
    );
  }
  const overdueDays = inputValue(input, "platform_overdue_days_after", "platformOverdueDaysAfter");
  if (overdueDays !== undefined) {
    patch.platform_overdue_days_after = dayOffsets(overdueDays, "inadimplência", 1, "asc");
  }

  for (const [snakeName, camelName, label] of [
    ["platform_trial_reminder_template", "platformTrialReminderTemplate", "teste grátis"],
    ["platform_payment_reminder_template", "platformPaymentReminderTemplate", "mensalidade"],
    [
      "platform_payment_confirmation_template",
      "platformPaymentConfirmationTemplate",
      "pagamento confirmado",
    ],
    ["platform_overdue_template", "platformOverdueTemplate", "inadimplência"],
  ] as const) {
    const rawValue = inputValue(input, snakeName, camelName);
    if (rawValue !== undefined) patch[snakeName] = messageTemplate(rawValue, label);
  }
  const { data, error } = await admin
    .from("platform_billing_settings")
    .update(patch)
    .eq("id", "global")
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

async function savePlan(admin: SupabaseClient, input: Record<string, unknown>, userId: string) {
  const id = text(input.id, 80);
  const code = text(input.code, 60).toLowerCase();
  const name = text(input.name, 120);
  const amount = numberValue(input.amount, Number.NaN);
  const intervalMonths = Math.floor(numberValue(input.interval_months ?? input.intervalMonths, 1));
  if (id && !isUuid(id)) throw new AsaasRequestError("Plano inválido.", 400, null);
  if (!/^[a-z0-9][a-z0-9_-]{1,59}$/.test(code)) {
    throw new AsaasRequestError("Use um código de plano válido.", 400, null);
  }
  if (!name) throw new AsaasRequestError("Informe o nome do plano.", 400, null);
  if (!Number.isFinite(amount) || amount < 0) {
    throw new AsaasRequestError("Informe um valor de plano válido.", 400, null);
  }
  if (intervalMonths < 1 || intervalMonths > 120) {
    throw new AsaasRequestError("Informe um intervalo de plano válido.", 400, null);
  }
  const payload = {
    ...(id ? { id } : {}),
    code,
    name,
    description: text(input.description, 1000) || null,
    interval_months: intervalMonths,
    amount,
    active: input.active !== false,
    sort_order: Math.floor(numberValue(input.sort_order ?? input.sortOrder, 0)),
    updated_by: userId,
    ...(!id ? { created_by: userId } : {}),
  };
  const query = id
    ? admin.from("platform_billing_plans").update(payload).eq("id", id)
    : admin.from("platform_billing_plans").insert(payload);
  const { data, error } = await query.select("*").single();
  if (error) throw error;
  return data;
}

function optionalDate(value: unknown, fieldLabel: string) {
  const normalized = text(value, 10);
  if (!normalized) return null;
  if (!isIsoDate(normalized)) {
    throw new AsaasRequestError(`Data inválida em ${fieldLabel}.`, 400, null);
  }
  return normalized;
}

function addMonthsMinusDay(dateValue: string, months: number) {
  const source = new Date(`${dateValue}T00:00:00.000Z`);
  const targetMonth = source.getUTCMonth() + Math.max(1, Math.floor(months));
  const targetYear = source.getUTCFullYear() + Math.floor(targetMonth / 12);
  const normalizedMonth = ((targetMonth % 12) + 12) % 12;
  const lastTargetDay = new Date(Date.UTC(targetYear, normalizedMonth + 1, 0)).getUTCDate();
  const clampedDay = Math.min(source.getUTCDate(), lastTargetDay);
  const nextPeriod = new Date(Date.UTC(targetYear, normalizedMonth, clampedDay));
  nextPeriod.setUTCDate(nextPeriod.getUTCDate() - 1);
  return nextPeriod.toISOString().slice(0, 10);
}

async function saveContract(
  admin: SupabaseClient,
  input: Record<string, unknown>,
  customerInput: Record<string, unknown>,
  userId: string,
  settings: BillingSettings,
) {
  const tenantId = text(input.tenantId ?? input.tenant_id, 80);
  const planId = text(input.planId ?? input.plan_id, 80);
  if (!isUuid(tenantId)) throw new AsaasRequestError("Salão inválido.", 400, null);
  if (!isUuid(planId)) throw new AsaasRequestError("Plano inválido.", 400, null);

  const [{ data: tenant, error: tenantError }, { data: plan, error: planError }] =
    await Promise.all([
      admin.from("tenants").select("id,name").eq("id", tenantId).maybeSingle(),
      admin.from("platform_billing_plans").select("*").eq("id", planId).maybeSingle(),
    ]);
  if (tenantError) throw tenantError;
  if (planError) throw planError;
  if (!tenant) throw new AsaasRequestError("Salão não encontrado.", 404, null);
  if (!plan) throw new AsaasRequestError("Plano não encontrado.", 404, null);

  const environment = billingEnvironment(settings.environment);
  const cpfCnpj = digits(customerInput.cpfCnpj ?? customerInput.cpf_cnpj);
  if (cpfCnpj && ![11, 14].includes(cpfCnpj.length)) {
    throw new AsaasRequestError("Informe um CPF ou CNPJ válido.", 400, null);
  }
  const customerPayload = {
    tenant_id: tenantId,
    provider: "asaas",
    environment,
    external_reference: customerReference(tenantId),
    legal_name:
      text(customerInput.legalName ?? customerInput.legal_name, 160) || text(tenant.name, 160),
    cpf_cnpj: cpfCnpj || null,
    email: text(customerInput.email, 180) || null,
    phone: digits(customerInput.phone) || null,
    address: text(customerInput.address, 200) || null,
    address_number: text(customerInput.addressNumber ?? customerInput.address_number, 40) || null,
    complement: text(customerInput.complement, 100) || null,
    province: text(customerInput.province, 100) || null,
    postal_code: digits(customerInput.postalCode ?? customerInput.postal_code) || null,
    city: text(customerInput.city, 120) || null,
    state: text(customerInput.state, 2).toUpperCase() || null,
    preferred_billing_type: billingType(
      customerInput.preferredBillingType ?? customerInput.preferred_billing_type,
      settings.default_billing_type,
    ),
    notification_disabled:
      customerInput.notificationDisabled ??
      customerInput.notification_disabled ??
      settings.notification_disabled,
    sync_status: "pending",
    last_error: null,
    updated_by: userId,
  };
  const { data: currentCustomer, error: customerReadError } = await admin
    .from("tenant_billing_provider_customers")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("provider", "asaas")
    .eq("environment", environment)
    .maybeSingle();
  if (customerReadError) throw customerReadError;
  const customerQuery = currentCustomer
    ? admin
        .from("tenant_billing_provider_customers")
        .update(customerPayload)
        .eq("id", currentCustomer.id)
    : admin
        .from("tenant_billing_provider_customers")
        .insert({ ...customerPayload, created_by: userId });
  const { data: customer, error: customerError } = await customerQuery.select("*").single();
  if (customerError) throw customerError;

  const amount = numberValue(
    input.amountSnapshot ?? input.amount_snapshot,
    numberValue(plan.amount),
  );
  const intervalMonths = Math.floor(
    numberValue(
      input.intervalMonthsSnapshot ?? input.interval_months_snapshot,
      numberValue(plan.interval_months, 1),
    ),
  );
  const dueDay = Math.floor(numberValue(input.dueDay ?? input.due_day, 10));
  if (!(amount >= 0)) throw new AsaasRequestError("Valor contratual inválido.", 400, null);
  if (intervalMonths < 1 || intervalMonths > 120) {
    throw new AsaasRequestError("Intervalo contratual inválido.", 400, null);
  }
  if (dueDay < 1 || dueDay > 28) {
    throw new AsaasRequestError("O dia de vencimento precisa estar entre 1 e 28.", 400, null);
  }

  const today = new Date().toISOString().slice(0, 10);
  const startsOn = optionalDate(input.startsOn ?? input.starts_on, "início") || today;
  const periodStart =
    optionalDate(input.currentPeriodStart ?? input.current_period_start, "início do período") ||
    startsOn;
  const periodEnd =
    optionalDate(input.currentPeriodEnd ?? input.current_period_end, "fim do período") ||
    addMonthsMinusDay(periodStart, intervalMonths);
  const status = text(input.status, 30) || "active";
  if (!new Set(["trialing", "active", "past_due", "suspended", "cancelled"]).has(status)) {
    throw new AsaasRequestError("Status contratual inválido.", 400, null);
  }
  const requestedNextDueDate = optionalDate(
    input.nextDueDate ?? input.next_due_date,
    "próximo vencimento",
  );
  const requestedTrialStartsOn = optionalDate(
    input.trialStartsOn ?? input.trial_starts_on,
    "início do teste",
  );
  const requestedTrialEndsOn = optionalDate(
    input.trialEndsOn ?? input.trial_ends_on,
    "fim do teste",
  );
  const trialStartsOn =
    status === "trialing" ? requestedTrialStartsOn || startsOn : requestedTrialStartsOn;
  const trialEndsOn =
    status === "trialing"
      ? requestedTrialEndsOn || requestedNextDueDate || periodEnd
      : requestedTrialEndsOn;
  if (status === "trialing") {
    if (!trialStartsOn || !trialEndsOn) {
      throw new AsaasRequestError("Informe o início e o fim do teste grátis.", 400, null);
    }
    if (trialEndsOn < trialStartsOn) {
      throw new AsaasRequestError(
        "O fim do teste precisa ser igual ou posterior ao início.",
        400,
        null,
      );
    }
  }
  const nextDueDate =
    status === "trialing"
      ? requestedNextDueDate || trialEndsOn || periodStart
      : requestedNextDueDate || periodStart;

  const contractId = text(input.id, 80);
  if (contractId && !isUuid(contractId)) {
    throw new AsaasRequestError("Contrato inválido.", 400, null);
  }
  let existingContractId = contractId;
  if (!existingContractId) {
    const { data: existing, error } = await admin
      .from("platform_billing_contracts")
      .select("id")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    existingContractId = existing?.id || "";
  }
  const contractPayload = {
    tenant_id: tenantId,
    plan_id: planId,
    status,
    amount_snapshot: amount,
    interval_months_snapshot: intervalMonths,
    billing_type: billingType(
      input.billingType ?? input.billing_type,
      customer.preferred_billing_type || settings.default_billing_type,
    ),
    due_day: dueDay,
    starts_on: startsOn,
    current_period_start: periodStart,
    current_period_end: periodEnd,
    next_due_date: nextDueDate,
    trial_starts_on: trialStartsOn,
    trial_ends_on: trialEndsOn,
    auto_renew: input.autoRenew ?? input.auto_renew ?? true,
    cancel_at_period_end: input.cancelAtPeriodEnd ?? input.cancel_at_period_end ?? false,
    updated_by: userId,
  };
  const contractQuery = existingContractId
    ? admin.from("platform_billing_contracts").update(contractPayload).eq("id", existingContractId)
    : admin.from("platform_billing_contracts").insert({ ...contractPayload, created_by: userId });
  const { data: contract, error: contractError } = await contractQuery.select("*").single();
  if (contractError) throw contractError;
  return { contract, customer };
}

function customerReference(tenantId: string) {
  return `${externalReferencePrefix}:tenant:${tenantId}`;
}

function chargeReference(tenantId: string, chargeId: string) {
  return `${externalReferencePrefix}:tenant:${tenantId}:charge:${chargeId}`;
}

async function listAsaasByExternalReference(
  environment: BillingEnvironment,
  resource: "customers" | "payments",
  externalReference: string,
) {
  const query = new URLSearchParams({ externalReference, limit: "100", offset: "0" });
  const payload = await asaasRequest(environment, `/${resource}?${query.toString()}`);
  return Array.isArray(payload.data) ? payload.data.filter(isRecord) : [];
}

async function sha256(value: unknown) {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function completeProviderOperation(
  admin: SupabaseClient,
  operationId: string,
  status: "succeeded" | "failed" | "unknown",
  providerResourceId: string | null,
  response: unknown,
  errorMessage: string | null,
) {
  const { error } = await admin.rpc("complete_platform_billing_provider_operation", {
    p_operation_id: operationId,
    p_status: status,
    p_provider_resource_id: providerResourceId,
    p_response_payload: isRecord(response) ? response : {},
    p_error: errorMessage,
  });
  if (error) throw error;
}

async function getTenantAndCustomer(
  admin: SupabaseClient,
  tenantId: string,
  environment: BillingEnvironment,
) {
  const [{ data: tenant, error: tenantError }, { data: customer, error: customerError }] =
    await Promise.all([
      admin.from("tenants").select("id,name,status").eq("id", tenantId).maybeSingle(),
      admin
        .from("tenant_billing_provider_customers")
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("provider", "asaas")
        .eq("environment", environment)
        .maybeSingle(),
    ]);
  if (tenantError) throw tenantError;
  if (customerError) throw customerError;
  if (!tenant) throw new AsaasRequestError("Salão não encontrado.", 404, null);
  if (!customer) {
    throw new AsaasRequestError(
      "Complete o perfil de cobrança deste salão antes de sincronizá-lo com o Asaas.",
      422,
      null,
    );
  }
  return {
    tenant: tenant as Record<string, unknown>,
    customer: customer as Record<string, unknown>,
  };
}

function buildCustomerPayload(
  tenant: Record<string, unknown>,
  customerRecord: Record<string, unknown>,
  settings: BillingSettings,
) {
  const cpfCnpj = digits(customerRecord.cpf_cnpj);
  if (![11, 14].includes(cpfCnpj.length)) {
    throw new AsaasRequestError(
      "Informe um CPF ou CNPJ válido no perfil de cobrança do salão.",
      422,
      null,
    );
  }
  const tenantId = text(tenant.id, 80);
  const payload: Record<string, unknown> = {
    name: text(customerRecord.legal_name || tenant.name, 120),
    cpfCnpj,
    externalReference: customerReference(tenantId),
    notificationDisabled: Boolean(
      customerRecord.notification_disabled ?? settings.notification_disabled,
    ),
  };
  const email = text(customerRecord.email, 180);
  const phone = digits(customerRecord.phone);
  if (email) payload.email = email;
  if (phone) payload.mobilePhone = phone;
  for (const [localField, providerField, maxLength] of [
    ["address", "address", 200],
    ["address_number", "addressNumber", 40],
    ["complement", "complement", 100],
    ["province", "province", 100],
    ["postal_code", "postalCode", 20],
    ["city", "city", 120],
    ["state", "state", 2],
  ] as const) {
    const value = text(customerRecord[localField], maxLength);
    if (value) payload[providerField] = value;
  }
  return payload;
}

async function syncCustomer(admin: SupabaseClient, tenantId: string, settings: BillingSettings) {
  const { tenant, customer: customerRecord } = await getTenantAndCustomer(
    admin,
    tenantId,
    settings.environment,
  );
  const payload = buildCustomerPayload(tenant, customerRecord, settings);
  let customer: AsaasPayload | null = null;
  const currentCustomerId = text(customerRecord.provider_customer_id, 100);

  if (currentCustomerId) {
    try {
      customer = await asaasRequest(
        settings.environment,
        `/customers/${encodeURIComponent(currentCustomerId)}`,
        { method: "PUT", body: payload },
      );
    } catch (error) {
      if (!(error instanceof AsaasRequestError) || error.status !== 404) throw error;
    }
  }

  if (!customer) {
    const matches = await listAsaasByExternalReference(
      settings.environment,
      "customers",
      customerReference(tenantId),
    );
    if (matches.length) {
      const customerId = text(matches[0].id, 100);
      customer = await asaasRequest(
        settings.environment,
        `/customers/${encodeURIComponent(customerId)}`,
        { method: "PUT", body: payload },
      );
    } else {
      customer = await asaasRequest(settings.environment, "/customers", {
        method: "POST",
        body: payload,
      });
    }
  }

  const customerId = text(customer.id, 100);
  if (!customerId) {
    throw new AsaasRequestError("O Asaas não retornou o identificador do cliente.", 502, customer);
  }
  const { data: updatedCustomer, error } = await admin
    .from("tenant_billing_provider_customers")
    .update({
      provider_customer_id: customerId,
      sync_status: "synced",
      last_synced_at: new Date().toISOString(),
      last_error: null,
    })
    .eq("id", customerRecord.id)
    .select("*")
    .single();
  if (error) throw error;

  return {
    customer: {
      id: customerId,
      name: text(customer.name, 200),
      externalReference: text(customer.externalReference, 300),
    },
    customerRecord: updatedCustomer,
  };
}

function providerEventType(value: unknown) {
  const normalized = text(value, 80).toUpperCase();
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
    AWAITING_RISK_ANALYSIS: "PAYMENT_AWAITING_RISK_ANALYSIS",
    APPROVED_BY_RISK_ANALYSIS: "PAYMENT_APPROVED_BY_RISK_ANALYSIS",
    AUTHORIZED: "PAYMENT_AUTHORIZED",
    REPROVED_BY_RISK_ANALYSIS: "PAYMENT_REPROVED_BY_RISK_ANALYSIS",
    CREDIT_CARD_CAPTURE_REFUSED: "PAYMENT_CREDIT_CARD_CAPTURE_REFUSED",
    CHARGEBACK_REQUESTED: "PAYMENT_CHARGEBACK_REQUESTED",
    CHARGEBACK_DISPUTE: "PAYMENT_CHARGEBACK_DISPUTE",
    AWAITING_CHARGEBACK_REVERSAL: "PAYMENT_AWAITING_CHARGEBACK_REVERSAL",
    DUNNING_RECEIVED: "PAYMENT_DUNNING_RECEIVED",
  };
  return map[normalized] ?? "PAYMENT_UPDATED";
}

function chargeMetadataFromPayment(payment: AsaasPayload) {
  return {
    provider_payment_id: text(payment.id, 100) || null,
    invoice_url: text(payment.invoiceUrl, 1000) || null,
    bank_slip_url: text(payment.bankSlipUrl, 1000) || null,
    last_synced_at: new Date().toISOString(),
    error_message: null,
  };
}

async function applyPaymentState(
  admin: SupabaseClient,
  chargeId: string,
  payment: AsaasPayload,
  source: "admin" | "worker" | "system" = "admin",
) {
  const { error: metadataError } = await admin
    .from("platform_billing_charges")
    .update(chargeMetadataFromPayment(payment))
    .eq("id", chargeId);
  if (metadataError) throw metadataError;

  const eventType = providerEventType(payment.status);
  const paymentId = text(payment.id, 100);
  const { error: stateError } = await admin.rpc("apply_platform_billing_charge_state", {
    p_charge_id: chargeId,
    p_event_type: eventType,
    p_provider_event_id: `snapshot:${chargeId}:${paymentId || "unknown"}:${eventType}`,
    p_provider_event_at: new Date().toISOString(),
    p_provider_payment_id: paymentId || null,
    p_invoice_url: text(payment.invoiceUrl, 1000) || null,
    p_bank_slip_url: text(payment.bankSlipUrl, 1000) || null,
    p_source: source,
    p_event_row_id: null,
  });
  if (stateError) throw stateError;

  const { data, error } = await admin
    .from("platform_billing_charges")
    .select("*")
    .eq("id", chargeId)
    .single();
  if (error) throw error;
  return data;
}

function paymentPayload(
  customerId: string,
  charge: Record<string, unknown>,
  settings: BillingSettings,
) {
  const payload: Record<string, unknown> = {
    customer: customerId,
    billingType: billingType(charge.billing_type, settings.default_billing_type),
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

async function findProviderPayment(environment: BillingEnvironment, externalReference: string) {
  const matches = await listAsaasByExternalReference(environment, "payments", externalReference);
  return matches[0] ?? null;
}

async function issueChargeSafely(
  admin: SupabaseClient,
  charge: Record<string, unknown>,
  settings: BillingSettings,
) {
  const environment = billingEnvironment(charge.environment);
  let customerId = text(charge.provider_customer_id, 100);
  if (!customerId) {
    const synced = await syncCustomer(admin, text(charge.tenant_id, 80), {
      ...settings,
      environment,
    });
    customerId = text(synced.customer.id, 100);
  }

  const requestPayload = paymentPayload(customerId, charge, settings);
  const { data: operation, error: operationError } = await admin.rpc(
    "begin_platform_billing_provider_operation",
    {
      p_environment: environment,
      p_operation_key: text(charge.idempotency_key, 200),
      p_operation_type: "create_payment",
      p_tenant_id: charge.tenant_id,
      p_contract_id: charge.contract_id,
      p_charge_id: charge.id,
      p_request_fingerprint: await sha256(requestPayload),
      p_request_payload: requestPayload,
    },
  );
  if (operationError) throw operationError;
  if (operation?.conflict) {
    throw new AsaasRequestError("Chave idempotente reutilizada com dados diferentes.", 409, null);
  }
  if (!operation?.proceed && operation?.inProgress) {
    return { charge, reused: true, inProgress: true, recovered: false };
  }

  const operationId = text(operation?.operationId, 80);
  let payment: AsaasPayload | null = isRecord(operation?.response)
    ? (operation.response as AsaasPayload)
    : null;
  let recovered = Boolean(payment && text(payment.id, 100));
  if (!payment || !text(payment.id, 100)) {
    payment = await findProviderPayment(environment, text(charge.external_reference, 300));
    recovered = Boolean(payment);
  }

  if (!payment) {
    try {
      payment = await asaasRequest(environment, "/payments", {
        method: "POST",
        body: requestPayload,
        timeoutMs: 25_000,
      });
    } catch (error) {
      payment = await findProviderPayment(environment, text(charge.external_reference, 300)).catch(
        () => null,
      );
      if (!payment) {
        const providerFailure = error instanceof AsaasRequestError ? error : null;
        if (operationId && operation?.proceed) {
          await completeProviderOperation(
            admin,
            operationId,
            providerFailure && [502, 504].includes(providerFailure.status) ? "unknown" : "failed",
            null,
            {},
            error instanceof Error ? error.message : "Falha ao emitir cobrança.",
          );
        }
        await admin
          .from("platform_billing_charges")
          .update({
            status: "failed",
            error_message:
              error instanceof Error ? error.message.slice(0, 1000) : "Falha ao emitir cobrança.",
          })
          .eq("id", charge.id);
        throw error;
      }
      recovered = true;
    }
  }

  if (operationId && operation?.proceed) {
    await completeProviderOperation(
      admin,
      operationId,
      "succeeded",
      text(payment.id, 100) || null,
      payment,
      null,
    );
  }

  const reconciled = await applyPaymentState(admin, text(charge.id, 80), payment, "admin");
  return {
    charge: reconciled,
    reused: Boolean(operation?.duplicate || recovered),
    inProgress: false,
    recovered,
  };
}

async function createCharge(
  admin: SupabaseClient,
  body: RequestBody,
  userId: string,
  settings: BillingSettings,
) {
  if (!settings.enabled) {
    throw new AsaasRequestError("Ative a cobrança Asaas antes de emitir cobranças.", 409, null);
  }
  const input = isRecord(body.charge) ? body.charge : (body as Record<string, unknown>);
  const tenantId = text(input.tenantId ?? input.tenant_id ?? body.tenantId, 80);
  const idempotencyKey = text(
    input.idempotencyKey ?? input.idempotency_key ?? body.idempotencyKey,
    200,
  );
  if (!isUuid(tenantId)) throw new AsaasRequestError("Salão inválido.", 400, null);

  const requestedContractId = text(input.contractId ?? input.contract_id, 80);
  let contractQuery = admin
    .from("platform_billing_contracts")
    .select("*")
    .eq("tenant_id", tenantId);
  contractQuery = requestedContractId
    ? contractQuery.eq("id", requestedContractId)
    : contractQuery.in("status", ["trialing", "active", "past_due"]);
  const { data: contracts, error: contractError } = await contractQuery
    .order("created_at", { ascending: false })
    .limit(1);
  if (contractError) throw contractError;
  const contract = contracts?.[0] as Record<string, unknown> | undefined;
  if (!contract) {
    throw new AsaasRequestError("Este salão ainda não possui contrato de cobrança.", 422, null);
  }

  const dueDate = text(
    input.dueDate ?? input.due_date ?? body.dueDate ?? contract.next_due_date,
    10,
  );
  const amount = numberValue(input.amount ?? body.amount, numberValue(contract.amount_snapshot));
  if (!isIsoDate(dueDate))
    throw new AsaasRequestError("Informe uma data de vencimento válida.", 400, null);
  if (!(amount > 0))
    throw new AsaasRequestError("Informe um valor de cobrança maior que zero.", 400, null);

  if (idempotencyKey) {
    const { data: existing, error } = await admin
      .from("platform_billing_charges")
      .select("*")
      .eq("provider", "asaas")
      .eq("environment", settings.environment)
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle();
    if (error) throw error;
    if (existing) {
      if (["creating", "failed"].includes(text(existing.status, 40))) {
        return await issueChargeSafely(admin, existing, settings);
      }
      return { charge: existing, reused: true };
    }
  }

  const { customer: customerRecord } = await getTenantAndCustomer(
    admin,
    tenantId,
    settings.environment,
  );
  const customerSync = await syncCustomer(admin, tenantId, settings);
  const customerId = text(customerSync.customer.id, 100);
  const chargeId = crypto.randomUUID();
  const externalReference = chargeReference(tenantId, chargeId);
  const planId = text(input.planId ?? input.plan_id ?? contract.plan_id, 80) || null;
  const coverageStart =
    optionalDate(
      input.coverageStart ?? input.coverage_start ?? body.coverageStart,
      "início da competência",
    ) ||
    text(contract.next_due_date ?? contract.current_period_start, 10) ||
    dueDate;
  const coverageEnd =
    optionalDate(
      input.coverageEnd ?? input.coverage_end ?? body.coverageEnd,
      "fim da competência",
    ) || addMonthsMinusDay(coverageStart, numberValue(contract.interval_months_snapshot, 1));
  const localPayload = {
    id: chargeId,
    tenant_id: tenantId,
    contract_id: contract.id,
    plan_id: planId,
    provider: "asaas",
    environment: settings.environment,
    provider_customer_id: customerId || text(customerRecord.provider_customer_id, 100),
    external_reference: externalReference,
    idempotency_key: idempotencyKey || `charge:create:${settings.environment}:${chargeId}`,
    source: "manual",
    billing_type: billingType(
      input.billingType ?? input.billing_type ?? body.billingType,
      settings.default_billing_type,
    ),
    amount,
    due_date: dueDate,
    coverage_start: coverageStart,
    coverage_end: coverageEnd,
    description: text(input.description ?? body.description ?? "Licença LinkUp Studio", 500),
    status: "creating",
    created_by: userId,
    updated_by: userId,
  };
  const { data: localCharge, error: insertError } = await admin
    .from("platform_billing_charges")
    .insert(localPayload)
    .select("*")
    .single();
  if (insertError) {
    if (insertError.code === "23505") {
      let existingQuery = admin
        .from("platform_billing_charges")
        .select("*")
        .eq("provider", "asaas")
        .eq("environment", settings.environment);
      existingQuery = idempotencyKey
        ? existingQuery.eq("idempotency_key", idempotencyKey)
        : existingQuery
            .eq("contract_id", contract.id)
            .eq("coverage_start", coverageStart)
            .eq("coverage_end", coverageEnd);
      const { data: existing } = await existingQuery.maybeSingle();
      if (existing) {
        if (["creating", "failed"].includes(text(existing.status, 40))) {
          return await issueChargeSafely(admin, existing, settings);
        }
        return { charge: existing, reused: true };
      }
    }
    throw insertError;
  }

  return await issueChargeSafely(admin, localCharge, settings);
}

async function getLocalCharge(admin: SupabaseClient, chargeId: string) {
  if (!isUuid(chargeId)) throw new AsaasRequestError("Cobrança inválida.", 400, null);
  const { data, error } = await admin
    .from("platform_billing_charges")
    .select("*")
    .eq("id", chargeId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new AsaasRequestError("Cobrança não encontrada.", 404, null);
  return data as Record<string, unknown>;
}

async function refreshCharge(admin: SupabaseClient, chargeId: string, settings: BillingSettings) {
  const charge = await getLocalCharge(admin, chargeId);
  const environment = billingEnvironment(charge.environment);
  let payment: AsaasPayload | null = null;
  const paymentId = text(charge.provider_payment_id, 100);
  if (paymentId) {
    payment = await asaasRequest(environment, `/payments/${encodeURIComponent(paymentId)}`);
  } else {
    payment = await findProviderPayment(environment, text(charge.external_reference, 300));
  }
  if (!payment) throw new AsaasRequestError("A cobrança ainda não existe no Asaas.", 404, null);
  return await applyPaymentState(admin, chargeId, payment, "admin");
}

async function cancelCharge(admin: SupabaseClient, chargeId: string, settings: BillingSettings) {
  const charge = await getLocalCharge(admin, chargeId);
  const environment = billingEnvironment(charge.environment);
  let paymentId = text(charge.provider_payment_id, 100);
  if (!paymentId) {
    const recovered = await findProviderPayment(environment, text(charge.external_reference, 300));
    paymentId = text(recovered?.id, 100);
  }
  if (paymentId) {
    try {
      await asaasRequest(environment, `/payments/${encodeURIComponent(paymentId)}`, {
        method: "DELETE",
      });
    } catch (error) {
      if (error instanceof AsaasRequestError && error.status === 404) {
        throw new AsaasRequestError(
          "O Asaas não confirmou o cancelamento: a cobrança não foi localizada. Atualize o status antes de tentar novamente.",
          409,
          error.payload,
        );
      }
      throw error;
    }
  }
  return await applyPaymentState(
    admin,
    chargeId,
    { id: paymentId || null, status: "DELETED" },
    "admin",
  );
}

function sanitizedWebhook(value: Record<string, unknown>) {
  return {
    id: text(value.id, 120) || null,
    name: text(value.name, 200) || webhookNamePrefix,
    url: text(value.url, 1000) || null,
    enabled: value.enabled !== false,
    interrupted: Boolean(value.interrupted),
  };
}

async function configureWebhook(admin: SupabaseClient, settings: BillingSettings) {
  const supabaseUrl = text(Deno.env.get("SUPABASE_URL"), 1000).replace(/\/+$/, "");
  const token = asaasWebhookToken(settings.environment);
  const email = text(Deno.env.get("ASAAS_WEBHOOK_EMAIL"), 180);
  if (!supabaseUrl) throw new AsaasRequestError("URL do backend não configurada.", 500, null);
  if (!webhookTokensAreUnambiguous()) {
    throw new AsaasRequestError(
      "Use tokens de webhook diferentes para sandbox e produção.",
      503,
      null,
    );
  }
  if (token.length < 32 || token.length > 255) {
    throw new AsaasRequestError(
      `Configure ${
        settings.environment === "production"
          ? "ASAAS_PRODUCTION_WEBHOOK_TOKEN"
          : "ASAAS_SANDBOX_WEBHOOK_TOKEN"
      } ou ASAAS_WEBHOOK_TOKEN com 32 a 255 caracteres antes de publicar o webhook.`,
      503,
      null,
    );
  }
  if (!email) {
    throw new AsaasRequestError(
      "Configure ASAAS_WEBHOOK_EMAIL para receber alertas de falha do Asaas.",
      503,
      null,
    );
  }

  const url = `${supabaseUrl}/functions/v1/asaas-webhook`;
  const projectRef = new URL(supabaseUrl).hostname.split(".")[0] || "unknown";
  const webhookName = `${webhookNamePrefix} · ${projectRef} · ${settings.environment}`;
  const listed = await asaasRequest(settings.environment, "/webhooks?limit=100&offset=0");
  const webhooks = Array.isArray(listed.data) ? listed.data.filter(isRecord) : [];
  const configuredId =
    settings.webhook_environment === settings.environment ? text(settings.webhook_id, 120) : "";
  const stored = configuredId
    ? webhooks.find((entry) => text(entry.id, 120) === configuredId)
    : undefined;
  if (stored && text(stored.url, 1000) !== url) {
    throw new AsaasRequestError(
      "O webhook salvo aponta para outro projeto. Remova o ID antigo antes de configurar este endpoint.",
      409,
      null,
    );
  }
  const exactUrlMatches = webhooks.filter((entry) => text(entry.url, 1000) === url);
  if (!stored && exactUrlMatches.length > 1) {
    throw new AsaasRequestError(
      "Existem webhooks duplicados para este endpoint no Asaas. Remova os duplicados antes de continuar.",
      409,
      null,
    );
  }
  const existing = stored ?? exactUrlMatches[0];
  const payload: Record<string, unknown> = {
    name: webhookName,
    url,
    email,
    enabled: true,
    interrupted: false,
    apiVersion: 3,
    authToken: token,
    sendType: "SEQUENTIALLY",
    events: webhookEvents,
  };
  const webhook = existing
    ? await asaasRequest(
        settings.environment,
        `/webhooks/${encodeURIComponent(text(existing.id, 120))}`,
        { method: "PUT", body: payload },
      )
    : await asaasRequest(settings.environment, "/webhooks", { method: "POST", body: payload });
  const webhookId = text(webhook.id, 120);
  const { error } = await admin
    .from("platform_billing_settings")
    .update({
      webhook_id: webhookId || null,
      webhook_environment: settings.environment,
      webhook_status: webhook.interrupted ? "interrupted" : "active",
      webhook_last_synced_at: new Date().toISOString(),
    })
    .eq("id", "global");
  if (error) throw error;
  return sanitizedWebhook(webhook);
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (request.method !== "POST") return json({ ok: false, error: "Método não permitido." }, 405);

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
        { ok: false, error: "O backend do Lovable Cloud não está conectado corretamente." },
        500,
      );
    }

    const authorization = request.headers.get("Authorization") || "";
    const token = authorization.replace(/^Bearer\s+/i, "");
    if (!token) return json({ ok: false, error: "Sessão não encontrada." }, 401);

    const callerClient = createClient(supabaseUrl, publishableKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: caller, error: callerError } = await callerClient.auth.getUser(token);
    if (callerError || !caller.user) {
      return json({ ok: false, error: "Sessão inválida ou expirada." }, 401);
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    await assertSuperAdmin(admin, caller.user.id);

    let decoded: unknown;
    try {
      decoded = await request.json();
    } catch {
      return json({ ok: false, error: "Envie um corpo JSON válido." }, 400);
    }
    if (!isRecord(decoded)) return json({ ok: false, error: "Requisição inválida." }, 400);
    const body = decoded as RequestBody;
    const action = normalizeAction(body.action);
    if (!action) return json({ ok: false, error: "Ação inválida." }, 400);

    const settings = await getSettings(admin);
    const environment = billingEnvironment(settings.environment);
    settings.environment = environment;

    if (action === "status") {
      const apiKeyConfigured = Boolean(asaasApiKey(environment));
      const webhookTokenConfigured =
        Boolean(asaasWebhookToken(environment)) && webhookTokensAreUnambiguous();
      const webhookBelongsToEnvironment = settings.webhook_environment === environment;
      const webhookConfiguredForEnvironment =
        webhookBelongsToEnvironment &&
        Boolean(settings.webhook_id) &&
        settings.webhook_status === "active";
      const workerSecretConfigured = Boolean(Deno.env.get("ASAAS_WORKER_SECRET"));
      const { data: workerHealth, error: workerHealthError } = await admin.rpc(
        "get_platform_billing_worker_health",
      );
      const worker = isRecord(workerHealth)
        ? workerHealth
        : {
            schedulerConfigured: false,
            healthy: false,
            status: "health_unavailable",
            schedule: null,
            lastRunAt: null,
            lastSuccessAt: null,
            error: workerHealthError?.message || "Não foi possível consultar o worker.",
          };
      return json({
        ok: true,
        status: {
          enabled: Boolean(settings.enabled),
          environment,
          apiKeyConfigured,
          webhookTokenConfigured,
          workerSecretConfigured,
          webhook: {
            id: webhookBelongsToEnvironment ? settings.webhook_id : null,
            environment: settings.webhook_environment,
            status: webhookBelongsToEnvironment ? settings.webhook_status : "not_configured",
            lastSyncedAt: webhookBelongsToEnvironment ? settings.webhook_last_synced_at : null,
            endpoint: `${supabaseUrl.replace(/\/+$/, "")}/functions/v1/asaas-webhook`,
          },
          worker,
          ready:
            apiKeyConfigured &&
            webhookTokenConfigured &&
            webhookConfiguredForEnvironment &&
            workerSecretConfigured &&
            worker.schedulerConfigured === true,
        },
      });
    }

    if (action === "save-settings") {
      if (!isRecord(body.settings)) {
        return json({ ok: false, error: "Configurações inválidas." }, 400);
      }
      return json({
        ok: true,
        settings: await saveSettings(admin, body.settings, caller.user.id),
      });
    }

    if (action === "save-plan") {
      if (!isRecord(body.plan)) return json({ ok: false, error: "Plano inválido." }, 400);
      return json({ ok: true, plan: await savePlan(admin, body.plan, caller.user.id) });
    }

    if (action === "save-contract") {
      if (!isRecord(body.contract) || !isRecord(body.customer)) {
        return json({ ok: false, error: "Contrato ou pagador inválido." }, 400);
      }
      return json({
        ok: true,
        ...(await saveContract(admin, body.contract, body.customer, caller.user.id, settings)),
      });
    }

    if (action === "test-connection") {
      const result = await asaasRequest(environment, "/customers?limit=1&offset=0");
      return json({
        ok: true,
        connection: {
          environment,
          reachable: true,
          customerCount: numberValue(result.totalCount, 0),
        },
      });
    }

    if (action === "configure-webhook") {
      return json({ ok: true, webhook: await configureWebhook(admin, settings) });
    }

    if (action === "sync-customer") {
      const tenantId = text(body.tenantId, 80);
      if (!isUuid(tenantId)) return json({ ok: false, error: "Salão inválido." }, 400);
      const result = await syncCustomer(admin, tenantId, settings);
      return json({ ok: true, ...result });
    }

    if (action === "create-charge") {
      return json({ ok: true, ...(await createCharge(admin, body, caller.user.id, settings)) });
    }

    const chargeId = text(body.chargeId, 80);
    if (!isUuid(chargeId)) return json({ ok: false, error: "Cobrança inválida." }, 400);
    if (action === "refresh-charge") {
      return json({ ok: true, charge: await refreshCharge(admin, chargeId, settings) });
    }
    if (action === "cancel-charge") {
      return json({ ok: true, charge: await cancelCharge(admin, chargeId, settings) });
    }

    const charge = await getLocalCharge(admin, chargeId);
    const chargeEnvironment = billingEnvironment(charge.environment);
    const paymentId = text(charge.provider_payment_id, 100);
    if (!paymentId)
      return json({ ok: false, error: "Cobrança ainda não sincronizada com o Asaas." }, 409);
    const qrCode = await asaasRequest(
      chargeEnvironment,
      `/payments/${encodeURIComponent(paymentId)}/pixQrCode`,
    );
    return json({
      ok: true,
      pix: {
        encodedImage: text(qrCode.encodedImage, 2_000_000),
        payload: text(qrCode.payload, 10_000),
        expirationDate: text(qrCode.expirationDate, 100) || null,
      },
    });
  } catch (error) {
    console.error("[asaas-admin]", error instanceof Error ? error.message : "Falha desconhecida");
    if (error instanceof AsaasRequestError) {
      return json(
        { ok: false, error: error.message },
        error.status >= 400 && error.status < 600 ? error.status : 500,
      );
    }
    return json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Não foi possível processar a cobrança.",
      },
      500,
    );
  }
});

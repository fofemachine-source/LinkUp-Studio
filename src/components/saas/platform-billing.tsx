import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  BadgeCheck,
  Banknote,
  Building2,
  CalendarClock,
  CheckCircle2,
  CreditCard,
  ExternalLink,
  FileText,
  Link2,
  Loader2,
  MessageCircle,
  Pencil,
  Plus,
  QrCode,
  ReceiptText,
  RefreshCw,
  Save,
  ShieldCheck,
  TestTube2,
  Trash2,
  WalletCards,
} from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { brl } from "@/lib/format";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

type BillingType = "UNDEFINED" | "PIX" | "BOLETO" | "CREDIT_CARD";
type BillingEnvironment = "sandbox" | "production";
type BillingQueryResult = { data: unknown; error: unknown };
type BillingQuery = PromiseLike<BillingQueryResult> & {
  select(columns?: string): BillingQuery;
  eq(column: string, value: unknown): BillingQuery;
  maybeSingle(): Promise<BillingQueryResult>;
  order(column: string, options?: { ascending?: boolean }): BillingQuery;
  limit(value: number): BillingQuery;
};

const billingDb = supabase as unknown as {
  from(table: string): BillingQuery;
};

type AsaasAdminStatusResponse = {
  ok: boolean;
  status: {
    enabled: boolean;
    environment: BillingEnvironment;
    apiKeyConfigured: boolean;
    webhookTokenConfigured: boolean;
    workerSecretConfigured: boolean;
    worker?: {
      schedulerConfigured: boolean;
      healthy: boolean;
      lastRunAt?: string | null;
      lastSuccessAt?: string | null;
      status?: string | null;
      schedule?: string | null;
      error?: string | null;
    };
    ready: boolean;
    webhook: { id?: string | null; status: string; lastSyncedAt?: string | null; endpoint: string };
  };
};

type AsaasActionResponse = {
  ok: boolean;
  payload?: string;
  pix?: { payload?: string; encodedImage?: string; expirationDate?: string | null };
  pixCopyPaste?: string;
  encodedPayload?: string;
  data?: { payload?: string };
};

type BillingSettings = {
  id: string;
  enabled: boolean;
  environment: BillingEnvironment;
  default_billing_type: BillingType;
  issue_days_before: number;
  grace_days: number;
  auto_suspend: boolean;
  fine_percentage: number;
  interest_percentage: number;
  discount_percentage: number;
  discount_due_days: number;
  notification_disabled: boolean;
  whatsapp_enabled: boolean;
  platform_trial_reminder_enabled: boolean;
  platform_trial_reminder_days_before: number[];
  platform_payment_reminder_enabled: boolean;
  platform_payment_reminder_days_before: number[];
  platform_payment_confirmation_enabled: boolean;
  platform_overdue_enabled: boolean;
  platform_overdue_days_after: number[];
  platform_notification_time: string;
  platform_trial_reminder_template: string;
  platform_payment_reminder_template: string;
  platform_payment_confirmation_template: string;
  platform_overdue_template: string;
  webhook_id?: string | null;
  webhook_status: string;
  webhook_last_synced_at?: string | null;
};

type BillingPlan = {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  interval_months: number;
  amount: number;
  active: boolean;
  sort_order: number;
};

type TenantSummary = {
  id: string;
  name: string;
  slug: string;
  status: string;
  plan?: string | null;
  plan_expires_at?: string | null;
};

type ProviderCustomer = {
  id: string;
  tenant_id: string;
  provider: string;
  environment: BillingEnvironment;
  provider_customer_id?: string | null;
  external_reference: string;
  legal_name?: string | null;
  cpf_cnpj?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  address_number?: string | null;
  complement?: string | null;
  province?: string | null;
  postal_code?: string | null;
  city?: string | null;
  state?: string | null;
  preferred_billing_type: BillingType;
  notification_disabled: boolean;
  sync_status: string;
  last_synced_at?: string | null;
  last_error?: string | null;
};

type BillingContract = {
  id: string;
  tenant_id: string;
  plan_id?: string | null;
  status: "trialing" | "active" | "past_due" | "suspended" | "cancelled";
  amount_snapshot: number;
  interval_months_snapshot: number;
  billing_type: BillingType;
  due_day: number;
  starts_on: string;
  current_period_start?: string | null;
  current_period_end?: string | null;
  next_due_date?: string | null;
  trial_starts_on?: string | null;
  trial_ends_on?: string | null;
  auto_renew: boolean;
  cancel_at_period_end: boolean;
};

type BillingClient = {
  tenant: TenantSummary;
  contract?: BillingContract | null;
  customer?: ProviderCustomer | null;
};

type BillingCharge = {
  id: string;
  tenant_id: string;
  plan_id?: string | null;
  provider_payment_id?: string | null;
  billing_type: BillingType;
  amount: number;
  due_date: string;
  coverage_start?: string | null;
  coverage_end?: string | null;
  description?: string | null;
  status: string;
  invoice_url?: string | null;
  bank_slip_url?: string | null;
  confirmed_at?: string | null;
  received_at?: string | null;
  created_at: string;
  error_message?: string | null;
  tenant?: TenantSummary | TenantSummary[] | null;
};

type ChargeAction = "refresh-charge" | "cancel-charge" | "pix-qrcode";
type ChargeActionHandler = (action: ChargeAction, charge: BillingCharge) => Promise<void>;

const settingsFallback: BillingSettings = {
  id: "global",
  enabled: false,
  environment: "sandbox",
  default_billing_type: "UNDEFINED",
  issue_days_before: 7,
  grace_days: 3,
  auto_suspend: false,
  fine_percentage: 0,
  interest_percentage: 0,
  discount_percentage: 0,
  discount_due_days: 0,
  notification_disabled: true,
  whatsapp_enabled: false,
  platform_trial_reminder_enabled: false,
  platform_trial_reminder_days_before: [3, 1, 0],
  platform_payment_reminder_enabled: false,
  platform_payment_reminder_days_before: [3, 1, 0],
  platform_payment_confirmation_enabled: false,
  platform_overdue_enabled: false,
  platform_overdue_days_after: [1, 3, 7],
  platform_notification_time: "09:00",
  platform_trial_reminder_template: `⏳ *Olá, {cliente}!* Seu teste grátis da *{plataforma}* termina em *{vencimento}*.

Para evitar a suspensão do acesso ao seu salão, regularize sua assinatura até essa data.

💳 Plano: *{plano}*
💰 Valor: *{valor}*`,
  platform_payment_reminder_template: `🔔 *Olá, {cliente}!*

Sua mensalidade da *{plataforma}* vence em *{vencimento}*.

💳 Plano: *{plano}*
💰 Valor: *{valor}*

Se o pagamento já foi realizado, desconsidere esta mensagem.`,
  platform_payment_confirmation_template: `✅ *Pagamento confirmado, {cliente}!*

Recebemos *{valor}* referente ao plano *{plano}* da *{plataforma}*.

📅 Próximo vencimento: *{proximo_vencimento}*

Seu acesso permanece ativo. Obrigado pela confiança!`,
  platform_overdue_template: `⚠️ *Olá, {cliente}.*

Identificamos uma pendência na mensalidade da *{plataforma}*.

📅 Vencimento: *{vencimento}*
💰 Valor: *{valor}*
⏳ Atraso: *{dias_atraso} dia(s)*

Regularize para evitar a suspensão do acesso ao seu salão.`,
  webhook_status: "not_configured",
};

const chargeStatus: Record<string, { label: string; className: string }> = {
  draft: { label: "Rascunho", className: "bg-slate-100 text-slate-700" },
  creating: { label: "Criando", className: "bg-indigo-100 text-indigo-700" },
  pending: { label: "Aguardando", className: "bg-amber-100 text-amber-800" },
  confirmed: { label: "Confirmada", className: "bg-emerald-100 text-emerald-700" },
  received: { label: "Recebida", className: "bg-emerald-100 text-emerald-700" },
  overdue: { label: "Vencida", className: "bg-rose-100 text-rose-700" },
  refunded: { label: "Estornada", className: "bg-violet-100 text-violet-700" },
  refund_pending: { label: "Estorno em andamento", className: "bg-violet-100 text-violet-700" },
  partially_refunded: { label: "Estorno parcial", className: "bg-violet-100 text-violet-700" },
  cancelled: { label: "Cancelada", className: "bg-slate-100 text-slate-500" },
  failed: { label: "Falhou", className: "bg-rose-100 text-rose-700" },
  disputed: { label: "Em disputa", className: "bg-rose-100 text-rose-700" },
};

const billingTypeLabels: Record<BillingType, string> = {
  UNDEFINED: "Cliente escolhe na fatura",
  PIX: "PIX",
  BOLETO: "Boleto",
  CREDIT_CARD: "Cartão de crédito",
};

function one<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}

function localDate(value?: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(`${value.slice(0, 10)}T12:00:00`));
}

function localDateTime(value?: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function numberValue(value: unknown) {
  const result = Number(value ?? 0);
  return Number.isFinite(result) ? result : 0;
}

function arrayValue(value: unknown, fallback: number[]) {
  if (!Array.isArray(value)) return fallback;
  return value.map(Number).filter((item) => Number.isInteger(item));
}

function normalizeDayList(value: number[], minimum: number, direction: "asc" | "desc") {
  const normalized = Array.from(
    new Set(
      value
        .map((item) => Math.floor(Number(item)))
        .filter((item) => Number.isInteger(item) && item >= minimum && item <= 365),
    ),
  );
  normalized.sort((left, right) => (direction === "asc" ? left - right : right - left));
  return normalized.slice(0, 10);
}

function dayListEquals(left: number[], right: number[]) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function timeField(value?: string | null) {
  return String(value || "09:00").slice(0, 5);
}

function addDaysIso(dateValue: string, days: number) {
  const date = new Date(`${dateValue}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function errorMessage(error: unknown, fallback = "Não foi possível concluir a operação.") {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error && "message" in error) return String(error.message);
  return fallback;
}

async function functionErrorMessage(
  error: unknown,
  fallback = "Nao foi possivel concluir a operacao.",
) {
  const typed = error as { message?: string; context?: Response };
  let message = typed?.message || fallback;
  const response = typed?.context;
  if (response && typeof response.clone === "function") {
    try {
      const payload = (await response.clone().json()) as {
        error?: string;
        message?: string;
        details?: string;
      };
      message = payload.error || payload.message || payload.details || message;
    } catch {
      // Mantem a mensagem original quando a Edge Function nao retorna JSON.
    }
  }
  return message;
}

async function invokeAsaas<T = Record<string, unknown>>(
  action: string,
  payload: Record<string, unknown> = {},
) {
  const { data, error } = await supabase.functions.invoke("asaas-admin", {
    body: { action, ...payload },
  });
  if (error) throw new Error(await functionErrorMessage(error));
  if (data?.error) throw new Error(String(data.error));
  return data as T;
}

export function PlatformBillingTab() {
  const queryClient = useQueryClient();
  const [section, setSection] = useState("overview");
  const [chargeDialog, setChargeDialog] = useState(false);
  const [clientDialog, setClientDialog] = useState<BillingClient | null>(null);
  const [planDialog, setPlanDialog] = useState<BillingPlan | "new" | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const settingsQuery = useQuery({
    queryKey: ["platform-billing-settings"],
    queryFn: async () => {
      const { data, error } = await billingDb
        .from("platform_billing_settings")
        .select("*")
        .eq("id", "global")
        .maybeSingle();
      if (error) throw error;
      const row = (data as Partial<BillingSettings> | null) ?? {};
      return {
        ...settingsFallback,
        ...row,
        platform_trial_reminder_days_before: normalizeDayList(
          arrayValue(
            row.platform_trial_reminder_days_before,
            settingsFallback.platform_trial_reminder_days_before,
          ),
          0,
          "desc",
        ),
        platform_payment_reminder_days_before: normalizeDayList(
          arrayValue(
            row.platform_payment_reminder_days_before,
            settingsFallback.platform_payment_reminder_days_before,
          ),
          0,
          "desc",
        ),
        platform_overdue_days_after: normalizeDayList(
          arrayValue(row.platform_overdue_days_after, settingsFallback.platform_overdue_days_after),
          1,
          "asc",
        ),
        platform_notification_time: timeField(row.platform_notification_time),
      };
    },
  });

  const plansQuery = useQuery({
    queryKey: ["platform-billing-plans"],
    queryFn: async () => {
      const { data, error } = await billingDb
        .from("platform_billing_plans")
        .select("*")
        .order("sort_order")
        .order("name");
      if (error) throw error;
      return (data as BillingPlan[] | null) ?? [];
    },
  });

  const billingTenantsQuery = useQuery({
    queryKey: ["platform-billing-tenants"],
    queryFn: async () => {
      const { data, error } = await billingDb
        .from("tenants")
        .select("id,name,slug,status,plan,plan_expires_at")
        .order("name");
      if (error) throw error;
      return (data as TenantSummary[] | null) ?? [];
    },
  });

  const customersQuery = useQuery({
    queryKey: ["tenant-billing-provider-customers"],
    queryFn: async () => {
      const { data, error } = await billingDb
        .from("tenant_billing_provider_customers")
        .select("*")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return (data as ProviderCustomer[] | null) ?? [];
    },
  });

  const contractsQuery = useQuery({
    queryKey: ["platform-billing-contracts"],
    queryFn: async () => {
      const { data, error } = await billingDb
        .from("platform_billing_contracts")
        .select("*")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return (data as BillingContract[] | null) ?? [];
    },
  });

  const chargesQuery = useQuery({
    queryKey: ["platform-billing-charges"],
    queryFn: async () => {
      const { data, error } = await billingDb
        .from("platform_billing_charges")
        .select("*, tenant:tenants(id,name,slug,status)")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data as BillingCharge[] | null) ?? [];
    },
  });

  const integrationQuery = useQuery({
    queryKey: ["asaas-admin-status"],
    queryFn: () => invokeAsaas<AsaasAdminStatusResponse>("status"),
    retry: false,
  });

  const settings = settingsQuery.data ?? settingsFallback;
  const plans = plansQuery.data ?? [];
  const customers = useMemo(() => customersQuery.data ?? [], [customersQuery.data]);
  const contracts = useMemo(() => contractsQuery.data ?? [], [contractsQuery.data]);
  const charges = useMemo(() => chargesQuery.data ?? [], [chargesQuery.data]);
  const clients = useMemo(
    () =>
      (billingTenantsQuery.data ?? []).map((tenant) => ({
        tenant,
        contract: contracts.find((contract) => contract.tenant_id === tenant.id) ?? null,
        customer:
          customers.find(
            (customer) =>
              customer.tenant_id === tenant.id &&
              customer.provider === "asaas" &&
              customer.environment === settings.environment,
          ) ?? null,
      })),
    [billingTenantsQuery.data, contracts, customers, settings.environment],
  );
  const loading =
    settingsQuery.isLoading ||
    plansQuery.isLoading ||
    billingTenantsQuery.isLoading ||
    customersQuery.isLoading ||
    contractsQuery.isLoading ||
    chargesQuery.isLoading;
  const firstError =
    settingsQuery.error ||
    plansQuery.error ||
    billingTenantsQuery.error ||
    customersQuery.error ||
    contractsQuery.error ||
    chargesQuery.error;

  const refreshBilling = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["platform-billing-settings"] }),
      queryClient.invalidateQueries({ queryKey: ["platform-billing-plans"] }),
      queryClient.invalidateQueries({ queryKey: ["platform-billing-tenants"] }),
      queryClient.invalidateQueries({ queryKey: ["tenant-billing-provider-customers"] }),
      queryClient.invalidateQueries({ queryKey: ["platform-billing-contracts"] }),
      queryClient.invalidateQueries({ queryKey: ["platform-billing-charges"] }),
      queryClient.invalidateQueries({ queryKey: ["asaas-admin-status"] }),
      queryClient.invalidateQueries({ queryKey: ["saas-billing-dashboard"] }),
    ]);
  };

  const metrics = useMemo(() => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const received = charges
      .filter((charge) => {
        return (
          charge.status === "received" &&
          charge.received_at &&
          new Date(charge.received_at) >= monthStart
        );
      })
      .reduce((total, charge) => total + numberValue(charge.amount), 0);
    const awaiting = charges
      .filter((charge) => ["draft", "creating", "pending"].includes(charge.status))
      .reduce((total, charge) => total + numberValue(charge.amount), 0);
    const overdue = charges
      .filter((charge) => charge.status === "overdue")
      .reduce((total, charge) => total + numberValue(charge.amount), 0);
    const mrr = contracts
      .filter((contract) => ["trialing", "active", "past_due"].includes(contract.status))
      .reduce((total, contract) => {
        return (
          total +
          numberValue(contract.amount_snapshot) /
            Math.max(1, numberValue(contract.interval_months_snapshot))
        );
      }, 0);
    return { received, awaiting, overdue, mrr };
  }, [charges, contracts]);

  async function chargeAction(action: ChargeAction, charge: BillingCharge) {
    if (action === "cancel-charge" && !window.confirm("Cancelar esta cobrança também no Asaas?"))
      return;
    setBusy(`${action}:${charge.id}`);
    try {
      const result = await invokeAsaas<AsaasActionResponse>(action, { chargeId: charge.id });
      if (action === "pix-qrcode") {
        const pix = String(
          result?.payload ??
            result?.pix?.payload ??
            result?.pixCopyPaste ??
            result?.encodedPayload ??
            result?.data?.payload ??
            "",
        );
        if (!pix) throw new Error("O Asaas ainda não disponibilizou o código PIX desta cobrança.");
        await navigator.clipboard.writeText(pix);
        toast.success("Código PIX copiado.");
      } else {
        toast.success(action === "cancel-charge" ? "Cobrança cancelada." : "Cobrança atualizada.");
      }
      await refreshBilling();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(null);
    }
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="flex min-h-64 items-center justify-center gap-3 text-sm text-slate-500">
          <Loader2 className="h-5 w-5 animate-spin" /> Carregando financeiro da plataforma…
        </CardContent>
      </Card>
    );
  }

  if (firstError) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>O módulo financeiro ainda não está disponível</AlertTitle>
        <AlertDescription>
          {errorMessage(
            firstError,
            "Aplique a migração do financeiro da plataforma e tente novamente.",
          )}
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 rounded-xl border bg-white p-5 shadow-sm md:flex-row md:items-center">
        <div className="flex-1">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-indigo-600">
            <ShieldCheck className="h-4 w-4" /> Cobrança B2B da plataforma
          </div>
          <h2 className="mt-1 text-2xl font-bold text-slate-950">Financeiro &amp; Cobranças</h2>
          <p className="mt-1 max-w-3xl text-sm text-slate-500">
            Controle os planos e as cobranças que a LinkUp Studio emite para os salões clientes.
            Este módulo não recebe pagamentos dos consumidores finais.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => void refreshBilling()}>
            <RefreshCw className="mr-2 h-4 w-4" /> Atualizar
          </Button>
          <Button
            className="bg-indigo-600 hover:bg-indigo-700"
            onClick={() => setChargeDialog(true)}
          >
            <Plus className="mr-2 h-4 w-4" /> Nova cobrança
          </Button>
        </div>
      </div>

      <Tabs
        value={section}
        onValueChange={setSection}
        orientation="vertical"
        className="grid items-start gap-5 lg:grid-cols-[220px_minmax(0,1fr)]"
      >
        <TabsList className="sticky top-5 grid h-auto w-full gap-1 border bg-white p-2 shadow-sm">
          <BillingNav value="overview" icon={<WalletCards />} label="Visão financeira" />
          <BillingNav value="charges" icon={<ReceiptText />} label="Cobranças" />
          <BillingNav value="clients" icon={<Building2 />} label="Clientes & contratos" />
          <BillingNav value="plans" icon={<CreditCard />} label="Planos comerciais" />
          <BillingNav value="integration" icon={<Link2 />} label="Integração Asaas" />
        </TabsList>

        <div className="min-w-0">
          <TabsContent value="overview" className="m-0 space-y-5">
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <BillingMetric
                icon={<Banknote />}
                label="Recebido no mês"
                value={brl(metrics.received)}
                tone="emerald"
              />
              <BillingMetric
                icon={<CalendarClock />}
                label="A receber"
                value={brl(metrics.awaiting)}
                tone="amber"
              />
              <BillingMetric
                icon={<AlertCircle />}
                label="Vencido"
                value={brl(metrics.overdue)}
                tone="rose"
              />
              <BillingMetric
                icon={<RefreshCw />}
                label="Receita mensal recorrente"
                value={brl(metrics.mrr)}
                tone="indigo"
              />
            </div>
            <Card>
              <CardHeader className="flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-base">Cobranças recentes</CardTitle>
                  <p className="mt-1 text-sm text-slate-500">
                    Valores reais registrados no financeiro B2B.
                  </p>
                </div>
                <Button variant="outline" size="sm" onClick={() => setSection("charges")}>
                  Ver todas
                </Button>
              </CardHeader>
              <CardContent>
                <ChargesTable
                  charges={charges.slice(0, 6)}
                  busy={busy}
                  onAction={chargeAction}
                  compact
                />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="charges" className="m-0">
            <ChargesPanel
              charges={charges}
              busy={busy}
              onAction={chargeAction}
              onCreate={() => setChargeDialog(true)}
            />
          </TabsContent>

          <TabsContent value="clients" className="m-0">
            <ClientsPanel clients={clients} plans={plans} onEdit={setClientDialog} />
          </TabsContent>

          <TabsContent value="plans" className="m-0">
            <PlansPanel plans={plans} onEdit={setPlanDialog} />
          </TabsContent>

          <TabsContent value="integration" className="m-0">
            <IntegrationPanel
              settings={settings}
              tenants={billingTenantsQuery.data ?? []}
              status={integrationQuery.data}
              statusError={integrationQuery.error}
              busy={busy}
              setBusy={setBusy}
              onSaved={refreshBilling}
            />
          </TabsContent>
        </div>
      </Tabs>

      <CreateChargeDialog
        open={chargeDialog}
        onOpenChange={setChargeDialog}
        clients={clients}
        plans={plans}
        onDone={refreshBilling}
      />
      <ClientContractDialog
        client={clientDialog}
        plans={plans}
        environment={settings.environment}
        onOpenChange={(open) => !open && setClientDialog(null)}
        onDone={refreshBilling}
      />
      <PlanDialog
        plan={planDialog}
        onOpenChange={(open) => !open && setPlanDialog(null)}
        onDone={refreshBilling}
      />
    </div>
  );
}

function BillingNav({
  value,
  icon,
  label,
}: {
  value: string;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <TabsTrigger
      value={value}
      className="w-full justify-start px-3 py-2.5 text-left data-[state=active]:bg-indigo-600 data-[state=active]:text-white [&_svg]:mr-2 [&_svg]:h-4 [&_svg]:w-4"
    >
      {icon}
      {label}
    </TabsTrigger>
  );
}

function BillingMetric({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone: string;
}) {
  const colors: Record<string, string> = {
    emerald: "bg-emerald-50 text-emerald-700",
    amber: "bg-amber-50 text-amber-700",
    rose: "bg-rose-50 text-rose-700",
    indigo: "bg-indigo-50 text-indigo-700",
  };
  return (
    <Card>
      <CardContent className="p-5">
        <div
          className={`mb-4 flex h-10 w-10 items-center justify-center rounded-xl ${colors[tone]} [&_svg]:h-5 [&_svg]:w-5`}
        >
          {icon}
        </div>
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
        <p className="mt-1 text-2xl font-bold text-slate-950">{value}</p>
      </CardContent>
    </Card>
  );
}

function ChargeBadge({ status }: { status: string }) {
  const item = chargeStatus[status] ?? { label: status, className: "bg-slate-100 text-slate-700" };
  return (
    <Badge variant="secondary" className={`border-0 ${item.className}`}>
      {item.label}
    </Badge>
  );
}

function ChargesPanel({
  charges,
  busy,
  onAction,
  onCreate,
}: {
  charges: BillingCharge[];
  busy: string | null;
  onAction: ChargeActionHandler;
  onCreate: () => void;
}) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const filtered = useMemo(
    () =>
      charges.filter((charge) => {
        const tenant = one(charge.tenant);
        const matchesQuery =
          !query.trim() ||
          `${tenant?.name ?? ""} ${charge.description ?? ""} ${charge.provider_payment_id ?? ""}`
            .toLowerCase()
            .includes(query.trim().toLowerCase());
        return matchesQuery && (status === "all" || charge.status === status);
      }),
    [charges, query, status],
  );
  return (
    <Card>
      <CardHeader className="gap-4 xl:flex-row xl:items-end">
        <div className="flex-1">
          <CardTitle className="text-base">Cobranças emitidas</CardTitle>
          <p className="mt-1 text-sm text-slate-500">
            Acompanhe vencimentos, pagamentos e faturas do Asaas.
          </p>
        </div>
        <Input
          className="xl:w-72"
          placeholder="Buscar salão ou cobrança…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="xl:w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os status</SelectItem>
            {Object.entries(chargeStatus).map(([value, item]) => (
              <SelectItem key={value} value={value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button onClick={onCreate} className="bg-indigo-600 hover:bg-indigo-700">
          <Plus className="mr-2 h-4 w-4" /> Nova
        </Button>
      </CardHeader>
      <CardContent>
        <ChargesTable charges={filtered} busy={busy} onAction={onAction} />
      </CardContent>
    </Card>
  );
}

function ChargesTable({
  charges,
  busy,
  onAction,
  compact = false,
}: {
  charges: BillingCharge[];
  busy: string | null;
  onAction: ChargeActionHandler;
  compact?: boolean;
}) {
  if (!charges.length)
    return (
      <div className="rounded-lg border border-dashed p-8 text-center text-sm text-slate-500">
        Nenhuma cobrança encontrada.
      </div>
    );
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Salão</TableHead>
          <TableHead>Vencimento</TableHead>
          <TableHead>Valor</TableHead>
          <TableHead>Status</TableHead>
          {!compact && <TableHead>Forma</TableHead>}
          <TableHead className="text-right">Ações</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {charges.map((charge) => {
          const tenant = one(charge.tenant);
          const waiting = busy?.endsWith(charge.id);
          return (
            <TableRow key={charge.id}>
              <TableCell>
                <div className="font-semibold text-slate-900">
                  {tenant?.name ?? "Salão removido"}
                </div>
                <div className="max-w-56 truncate text-xs text-slate-500">
                  {charge.description || charge.provider_payment_id || "Cobrança LinkUp Studio"}
                </div>
              </TableCell>
              <TableCell>{localDate(charge.due_date)}</TableCell>
              <TableCell className="font-semibold">{brl(charge.amount)}</TableCell>
              <TableCell>
                <ChargeBadge status={charge.status} />
              </TableCell>
              {!compact && (
                <TableCell>
                  {billingTypeLabels[charge.billing_type] ?? charge.billing_type}
                </TableCell>
              )}
              <TableCell>
                <div className="flex justify-end gap-1">
                  {charge.invoice_url && (
                    <Button asChild variant="ghost" size="icon" title="Abrir fatura">
                      <a href={charge.invoice_url} target="_blank" rel="noreferrer">
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    </Button>
                  )}
                  {charge.provider_payment_id && charge.status === "pending" && (
                    <Button
                      variant="ghost"
                      size="icon"
                      title="Copiar PIX"
                      disabled={waiting}
                      onClick={() => onAction("pix-qrcode", charge)}
                    >
                      <QrCode className="h-4 w-4" />
                    </Button>
                  )}
                  {charge.provider_payment_id && (
                    <Button
                      variant="ghost"
                      size="icon"
                      title="Atualizar no Asaas"
                      disabled={waiting}
                      onClick={() => onAction("refresh-charge", charge)}
                    >
                      {waiting ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <RefreshCw className="h-4 w-4" />
                      )}
                    </Button>
                  )}
                  {charge.provider_payment_id && ["pending", "overdue"].includes(charge.status) && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-rose-600"
                      title="Cancelar"
                      disabled={waiting}
                      onClick={() => onAction("cancel-charge", charge)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

function ClientsPanel({
  clients,
  plans,
  onEdit,
}: {
  clients: BillingClient[];
  plans: BillingPlan[];
  onEdit: (client: BillingClient) => void;
}) {
  const [query, setQuery] = useState("");
  const filtered = clients.filter(({ tenant, customer }) => {
    return (
      !query.trim() ||
      `${tenant.name} ${customer?.legal_name ?? ""} ${customer?.cpf_cnpj ?? ""}`
        .toLowerCase()
        .includes(query.toLowerCase())
    );
  });
  return (
    <Card>
      <CardHeader className="gap-4 md:flex-row md:items-end">
        <div className="flex-1">
          <CardTitle className="text-base">Clientes &amp; contratos</CardTitle>
          <p className="mt-1 text-sm text-slate-500">
            Dados fiscais e regras de cobrança de cada salão.
          </p>
        </div>
        <Input
          className="md:w-72"
          placeholder="Buscar salão, razão social ou CPF/CNPJ…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Salão</TableHead>
              <TableHead>Plano</TableHead>
              <TableHead>Próximo vencimento</TableHead>
              <TableHead>Cliente Asaas</TableHead>
              <TableHead>Situação</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((client) => {
              const { tenant, contract, customer } = client;
              const plan = plans.find((item) => item.id === contract?.plan_id);
              const active =
                contract && ["trialing", "active", "past_due"].includes(contract.status);
              const statusClass =
                contract?.status === "trialing"
                  ? "bg-amber-100 text-amber-700"
                  : active
                    ? "bg-emerald-100 text-emerald-700"
                    : "bg-slate-100 text-slate-600";
              return (
                <TableRow key={tenant.id}>
                  <TableCell>
                    <div className="font-semibold">{tenant.name}</div>
                    <div className="text-xs text-slate-500">/{tenant.slug}</div>
                  </TableCell>
                  <TableCell>
                    {plan?.name ?? "Sem plano"}
                    <div className="text-xs text-slate-500">
                      {contract ? brl(contract.amount_snapshot) : "Sem contrato"}
                    </div>
                  </TableCell>
                  <TableCell>
                    {localDate(contract?.next_due_date)}
                    {contract?.status === "trialing" && (
                      <div className="text-xs text-amber-700">
                        Teste até {localDate(contract.trial_ends_on)}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    {customer?.provider_customer_id ? (
                      <BadgeCheck className="h-5 w-5 text-emerald-600" />
                    ) : (
                      <span className="text-xs text-amber-700">Pendente</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className={statusClass}>
                      {contract?.status === "past_due"
                        ? "Em atraso"
                        : contract?.status === "suspended"
                          ? "Suspenso"
                          : contract?.status === "trialing"
                            ? "Em teste"
                            : active
                              ? "Ativo"
                              : "Sem contrato"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" onClick={() => onEdit(client)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        {!filtered.length && (
          <div className="p-8 text-center text-sm text-slate-500">Nenhum contrato encontrado.</div>
        )}
      </CardContent>
    </Card>
  );
}

function PlansPanel({
  plans,
  onEdit,
}: {
  plans: BillingPlan[];
  onEdit: (plan: BillingPlan | "new") => void;
}) {
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <div>
          <CardTitle className="text-base">Planos comerciais</CardTitle>
          <p className="mt-1 text-sm text-slate-500">
            Valores cobrados pela LinkUp Studio aos salões.
          </p>
        </div>
        <Button onClick={() => onEdit("new")} className="bg-indigo-600 hover:bg-indigo-700">
          <Plus className="mr-2 h-4 w-4" /> Novo plano
        </Button>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 md:grid-cols-2">
          {plans.map((plan) => (
            <div key={plan.id} className="rounded-xl border p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <Badge
                    variant="secondary"
                    className={
                      plan.active
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-slate-100 text-slate-600"
                    }
                  >
                    {plan.active ? "Ativo" : "Inativo"}
                  </Badge>
                  <h3 className="mt-3 text-lg font-bold">{plan.name}</h3>
                  <p className="mt-1 text-sm text-slate-500">
                    {plan.description || "Sem descrição"}
                  </p>
                </div>
                <Button variant="ghost" size="icon" onClick={() => onEdit(plan)}>
                  <Pencil className="h-4 w-4" />
                </Button>
              </div>
              <div className="mt-5 flex items-end justify-between">
                <div>
                  <span className="text-2xl font-bold">{brl(plan.amount)}</span>
                  <span className="text-sm text-slate-500">
                    {" "}
                    / {plan.interval_months === 1 ? "mês" : `${plan.interval_months} meses`}
                  </span>
                </div>
                <code className="rounded bg-slate-100 px-2 py-1 text-xs">{plan.code}</code>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function IntegrationPanel({
  settings,
  tenants,
  status,
  statusError,
  busy,
  setBusy,
  onSaved,
}: {
  settings: BillingSettings;
  tenants: TenantSummary[];
  status: AsaasAdminStatusResponse | undefined;
  statusError: unknown;
  busy: string | null;
  setBusy: (value: string | null) => void;
  onSaved: () => Promise<void>;
}) {
  const [form, setForm] = useState(settings);
  useEffect(() => setForm(settings), [settings]);
  const integrationStatus: Partial<AsaasAdminStatusResponse["status"]> = status?.status ?? {};
  const configured = Boolean(integrationStatus.apiKeyConfigured);
  const webhookToken = Boolean(integrationStatus.webhookTokenConfigured);
  const workerProtection = Boolean(integrationStatus.workerSecretConfigured);
  const workerStatus = integrationStatus.worker;
  const automationActive = Boolean(workerStatus?.schedulerConfigured && workerStatus?.healthy);
  const settingsDirty =
    form.enabled !== settings.enabled ||
    form.environment !== settings.environment ||
    form.default_billing_type !== settings.default_billing_type ||
    form.issue_days_before !== settings.issue_days_before ||
    form.grace_days !== settings.grace_days ||
    form.auto_suspend !== settings.auto_suspend ||
    form.fine_percentage !== settings.fine_percentage ||
    form.interest_percentage !== settings.interest_percentage ||
    form.discount_percentage !== settings.discount_percentage ||
    form.discount_due_days !== settings.discount_due_days ||
    form.notification_disabled !== settings.notification_disabled ||
    form.whatsapp_enabled !== settings.whatsapp_enabled ||
    form.platform_trial_reminder_enabled !== settings.platform_trial_reminder_enabled ||
    !dayListEquals(
      form.platform_trial_reminder_days_before,
      settings.platform_trial_reminder_days_before,
    ) ||
    form.platform_payment_reminder_enabled !== settings.platform_payment_reminder_enabled ||
    !dayListEquals(
      form.platform_payment_reminder_days_before,
      settings.platform_payment_reminder_days_before,
    ) ||
    form.platform_payment_confirmation_enabled !== settings.platform_payment_confirmation_enabled ||
    form.platform_overdue_enabled !== settings.platform_overdue_enabled ||
    !dayListEquals(form.platform_overdue_days_after, settings.platform_overdue_days_after) ||
    timeField(form.platform_notification_time) !== timeField(settings.platform_notification_time) ||
    form.platform_trial_reminder_template !== settings.platform_trial_reminder_template ||
    form.platform_payment_reminder_template !== settings.platform_payment_reminder_template ||
    form.platform_payment_confirmation_template !==
      settings.platform_payment_confirmation_template ||
    form.platform_overdue_template !== settings.platform_overdue_template;
  const workerDetail = !workerProtection
    ? "Secret ASAAS_WORKER_SECRET ausente"
    : !workerStatus?.schedulerConfigured
      ? "Agendamento automático não provisionado"
      : automationActive
        ? `Ativo · último sucesso ${localDateTime(workerStatus.lastSuccessAt ?? workerStatus.lastRunAt)}`
        : workerStatus.lastRunAt
          ? `Sem sucesso recente · última execução ${localDateTime(workerStatus.lastRunAt)}`
          : "Agendado, mas ainda sem execução confirmada";
  async function save() {
    setBusy("settings");
    try {
      await invokeAsaas("save-settings", {
        settings: {
          enabled: form.enabled,
          environment: form.environment,
          defaultBillingType: form.default_billing_type,
          issueDaysBefore: form.issue_days_before,
          graceDays: form.grace_days,
          autoSuspend: form.auto_suspend,
          finePercentage: form.fine_percentage,
          interestPercentage: form.interest_percentage,
          discountPercentage: form.discount_percentage,
          discountDueDays: form.discount_due_days,
          notificationDisabled: form.notification_disabled,
          whatsappEnabled: form.whatsapp_enabled,
          platformTrialReminderEnabled: form.platform_trial_reminder_enabled,
          platformTrialReminderDaysBefore: form.platform_trial_reminder_days_before,
          platformPaymentReminderEnabled: form.platform_payment_reminder_enabled,
          platformPaymentReminderDaysBefore: form.platform_payment_reminder_days_before,
          platformPaymentConfirmationEnabled: form.platform_payment_confirmation_enabled,
          platformOverdueEnabled: form.platform_overdue_enabled,
          platformOverdueDaysAfter: form.platform_overdue_days_after,
          platformNotificationTime: timeField(form.platform_notification_time),
          platformTrialReminderTemplate: form.platform_trial_reminder_template,
          platformPaymentReminderTemplate: form.platform_payment_reminder_template,
          platformPaymentConfirmationTemplate: form.platform_payment_confirmation_template,
          platformOverdueTemplate: form.platform_overdue_template,
        },
      });
      toast.success("Configuração financeira salva.");
      await onSaved();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(null);
    }
  }
  async function remote(action: "test-connection" | "configure-webhook") {
    if (settingsDirty) {
      toast.error("Salve a configuração antes de testar ou configurar o webhook.");
      return;
    }
    setBusy(action);
    try {
      await invokeAsaas(action);
      toast.success(
        action === "test-connection"
          ? "Conexão com o Asaas validada."
          : "Webhook do Asaas configurado.",
      );
      await onSaved();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(null);
    }
  }
  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Estado da integração</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <StatusTile
            ok={configured}
            label="Chave da API"
            detail={configured ? "Configurada com segurança" : "Secret ASAAS_API_KEY ausente"}
          />
          <StatusTile
            ok={webhookToken}
            label="Token do webhook"
            detail={webhookToken ? "Configurado" : "Secret ASAAS_WEBHOOK_TOKEN ausente"}
          />
          <StatusTile
            ok={workerProtection}
            label="Proteção do motor"
            detail={workerProtection ? "Secret configurado" : "Secret ASAAS_WORKER_SECRET ausente"}
          />
          <StatusTile ok={automationActive} label="Automação ativa" detail={workerDetail} />
          <StatusTile
            ok={settings.webhook_status === "active"}
            label="Webhook"
            detail={
              settings.webhook_status === "active"
                ? `Ativo · ${localDateTime(settings.webhook_last_synced_at)}`
                : "Ainda não sincronizado"
            }
          />
        </CardContent>
      </Card>
      {Boolean(statusError) && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Não foi possível verificar os Secrets</AlertTitle>
          <AlertDescription>{errorMessage(statusError)}</AlertDescription>
        </Alert>
      )}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Regras da cobrança</CardTitle>
          <p className="text-sm text-slate-500">
            Os valores secretos nunca são exibidos no navegador.
          </p>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="flex items-center justify-between rounded-lg border p-4">
              <div>
                <Label>Integração ativa</Label>
                <p className="text-xs text-slate-500">Libera a emissão de cobranças.</p>
              </div>
              <Switch
                checked={form.enabled}
                onCheckedChange={(enabled) => setForm({ ...form, enabled })}
              />
            </div>
            <div>
              <Label>Ambiente</Label>
              <Select
                value={form.environment}
                onValueChange={(environment: BillingEnvironment) =>
                  setForm({ ...form, environment })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sandbox">Sandbox (testes)</SelectItem>
                  <SelectItem value="production">Produção</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Forma padrão</Label>
              <BillingTypeSelect
                value={form.default_billing_type}
                onValueChange={(default_billing_type) => setForm({ ...form, default_billing_type })}
              />
            </div>
            <NumberField
              label="Emitir quantos dias antes"
              value={form.issue_days_before}
              min={0}
              max={90}
              onChange={(issue_days_before) => setForm({ ...form, issue_days_before })}
            />
            <NumberField
              label="Carência após o vencimento (dias)"
              value={form.grace_days}
              min={0}
              max={90}
              onChange={(grace_days) => setForm({ ...form, grace_days })}
            />
            <NumberField
              label="Multa (%)"
              value={form.fine_percentage}
              min={0}
              max={100}
              step="0.01"
              onChange={(fine_percentage) => setForm({ ...form, fine_percentage })}
            />
            <NumberField
              label="Juros ao mês (%)"
              value={form.interest_percentage}
              min={0}
              max={100}
              step="0.01"
              onChange={(interest_percentage) => setForm({ ...form, interest_percentage })}
            />
            <NumberField
              label="Desconto (%)"
              value={form.discount_percentage}
              min={0}
              max={100}
              step="0.01"
              onChange={(discount_percentage) => setForm({ ...form, discount_percentage })}
            />
            <NumberField
              label="Dias para o desconto"
              value={form.discount_due_days}
              min={0}
              max={90}
              onChange={(discount_due_days) => setForm({ ...form, discount_due_days })}
            />
            <div className="flex items-center justify-between rounded-lg border p-4">
              <div>
                <Label>Suspender automaticamente</Label>
                <p className="text-xs text-slate-500">
                  Bloqueia o salão após a carência configurada.
                </p>
              </div>
              <Switch
                checked={form.auto_suspend}
                onCheckedChange={(auto_suspend) => setForm({ ...form, auto_suspend })}
              />
            </div>
          </div>
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div>
              <Label>Notificações do próprio Asaas desativadas</Label>
              <p className="text-xs text-slate-500">
                Evita mensagens duplicadas enquanto a LinkUp controla a comunicação.
              </p>
            </div>
            <Switch
              checked={form.notification_disabled}
              onCheckedChange={(notification_disabled) =>
                setForm({ ...form, notification_disabled })
              }
            />
          </div>

          <section className="space-y-4 rounded-xl border border-indigo-100 bg-indigo-50/40 p-4">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div className="flex gap-3">
                <span className="mt-1 inline-flex h-9 w-9 items-center justify-center rounded-full bg-indigo-100 text-indigo-700">
                  <MessageCircle className="h-4 w-4" />
                </span>
                <div>
                  <h3 className="font-semibold text-slate-900">Avisos automáticos por WhatsApp</h3>
                  <p className="max-w-2xl text-sm text-slate-600">
                    Mensagens B2B enviadas pela matriz para os salões clientes: teste grátis,
                    vencimentos, pagamento confirmado e inadimplência.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 rounded-lg border bg-white px-4 py-3">
                <div className="text-right">
                  <Label>Avisos ativos</Label>
                  <p className="text-xs text-slate-500">Usa o WhatsApp Owner/Matriz.</p>
                </div>
                <Switch
                  checked={form.whatsapp_enabled}
                  onCheckedChange={(whatsapp_enabled) => setForm({ ...form, whatsapp_enabled })}
                />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-lg border bg-white p-4">
                <Label>Remetente dos avisos B2B</Label>
                <p className="mt-2 text-sm font-medium text-slate-900">WhatsApp Owner / Matriz</p>
                <p className="mt-1 text-xs text-slate-500">
                  Conecte o QR Code em SaaS &gt; WhatsApp. Esse numero envia avisos financeiros da
                  LinkUp Studio para os saloes clientes.
                </p>
              </div>
              <div>
                <Label>Enviar a partir de</Label>
                <Input
                  type="time"
                  disabled={!form.whatsapp_enabled}
                  value={timeField(form.platform_notification_time)}
                  onChange={(event) =>
                    setForm({ ...form, platform_notification_time: event.target.value })
                  }
                />
                <p className="mt-1 text-xs text-slate-500">
                  O robô roda a cada minuto, mas só enfileira esses avisos depois desse horário.
                </p>
              </div>
            </div>


            <div className="grid gap-4 xl:grid-cols-2">
              <MessageRuleCard
                title="Teste grátis perto do fim"
                description="Avise antes do fim do teste para o salão pagar antes da suspensão."
                checked={form.platform_trial_reminder_enabled}
                onCheckedChange={(platform_trial_reminder_enabled) =>
                  setForm({ ...form, platform_trial_reminder_enabled })
                }
                disabled={!form.whatsapp_enabled}
                daysLabel="Dias antes do fim do teste"
                days={form.platform_trial_reminder_days_before}
                daysMinimum={0}
                daysDirection="desc"
                onDaysChange={(platform_trial_reminder_days_before) =>
                  setForm({ ...form, platform_trial_reminder_days_before })
                }
                template={form.platform_trial_reminder_template}
                onTemplateChange={(platform_trial_reminder_template) =>
                  setForm({ ...form, platform_trial_reminder_template })
                }
              />
              <MessageRuleCard
                title="Mensalidade perto do vencimento"
                description="Lembrete de mensalidade ainda em aberto, antes ou no dia do vencimento."
                checked={form.platform_payment_reminder_enabled}
                onCheckedChange={(platform_payment_reminder_enabled) =>
                  setForm({ ...form, platform_payment_reminder_enabled })
                }
                disabled={!form.whatsapp_enabled}
                daysLabel="Dias antes do vencimento"
                days={form.platform_payment_reminder_days_before}
                daysMinimum={0}
                daysDirection="desc"
                onDaysChange={(platform_payment_reminder_days_before) =>
                  setForm({ ...form, platform_payment_reminder_days_before })
                }
                template={form.platform_payment_reminder_template}
                onTemplateChange={(platform_payment_reminder_template) =>
                  setForm({ ...form, platform_payment_reminder_template })
                }
              />
              <MessageRuleCard
                title="Pagamento confirmado"
                description="Mensagem enviada quando o webhook/worker marca a cobrança como paga."
                checked={form.platform_payment_confirmation_enabled}
                onCheckedChange={(platform_payment_confirmation_enabled) =>
                  setForm({ ...form, platform_payment_confirmation_enabled })
                }
                disabled={!form.whatsapp_enabled}
                template={form.platform_payment_confirmation_template}
                onTemplateChange={(platform_payment_confirmation_template) =>
                  setForm({ ...form, platform_payment_confirmation_template })
                }
              />
              <MessageRuleCard
                title="Inadimplência"
                description="Avisos depois do vencimento enquanto a cobrança continuar em aberto."
                checked={form.platform_overdue_enabled}
                onCheckedChange={(platform_overdue_enabled) =>
                  setForm({ ...form, platform_overdue_enabled })
                }
                disabled={!form.whatsapp_enabled}
                daysLabel="Dias após o vencimento"
                days={form.platform_overdue_days_after}
                daysMinimum={1}
                daysDirection="asc"
                onDaysChange={(platform_overdue_days_after) =>
                  setForm({ ...form, platform_overdue_days_after })
                }
                template={form.platform_overdue_template}
                onTemplateChange={(platform_overdue_template) =>
                  setForm({ ...form, platform_overdue_template })
                }
              />
            </div>

            <div className="rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-600">
              Variáveis aceitas: {"{cliente}"}, {"{salao}"}, {"{plataforma}"}, {"{plano}"},{" "}
              {"{valor}"}, {"{vencimento}"}, {"{dias}"}, {"{dias_para_vencimento}"},{" "}
              {"{dias_atraso}"}, {"{data_pagamento}"} e {"{proximo_vencimento}"}.
            </div>
          </section>

          <div className="flex flex-wrap gap-2">
            <Button
              className="bg-indigo-600 hover:bg-indigo-700"
              disabled={busy === "settings"}
              onClick={save}
            >
              {busy === "settings" ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              Salvar configuração
            </Button>
            <Button
              variant="outline"
              disabled={Boolean(busy) || settingsDirty}
              onClick={() => remote("test-connection")}
            >
              <TestTube2 className="mr-2 h-4 w-4" />
              Testar conexão
            </Button>
            <Button
              variant="outline"
              disabled={Boolean(busy) || settingsDirty}
              onClick={() => remote("configure-webhook")}
            >
              <Link2 className="mr-2 h-4 w-4" />
              Configurar webhook
            </Button>
          </div>
          {settingsDirty && (
            <p className="text-xs font-medium text-amber-700">
              Existem alterações locais. Salve o ambiente e as regras antes de testar a conexão ou
              configurar o webhook.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function DayListField({
  label,
  value,
  minimum,
  direction,
  disabled,
  onChange,
}: {
  label: string;
  value: number[];
  minimum: number;
  direction: "asc" | "desc";
  disabled?: boolean;
  onChange: (value: number[]) => void;
}) {
  return (
    <div>
      <Label>{label}</Label>
      <Input
        disabled={disabled}
        value={value.join(", ")}
        placeholder={minimum === 0 ? "Ex: 7, 3, 1, 0" : "Ex: 1, 3, 7"}
        onChange={(event) => {
          const parsed = event.target.value
            .split(/[\s,;]+/)
            .map((part) => Number(part))
            .filter((part) => Number.isInteger(part));
          onChange(normalizeDayList(parsed, minimum, direction));
        }}
      />
      <p className="mt-1 text-xs text-slate-500">
        Separe por vírgula. Use 0 para enviar no próprio dia.
      </p>
    </div>
  );
}

function MessageRuleCard({
  title,
  description,
  checked,
  onCheckedChange,
  disabled,
  daysLabel,
  days,
  daysMinimum = 0,
  daysDirection = "desc",
  onDaysChange,
  template,
  onTemplateChange,
}: {
  title: string;
  description: string;
  checked: boolean;
  onCheckedChange: (value: boolean) => void;
  disabled?: boolean;
  daysLabel?: string;
  days?: number[];
  daysMinimum?: number;
  daysDirection?: "asc" | "desc";
  onDaysChange?: (value: number[]) => void;
  template: string;
  onTemplateChange: (value: string) => void;
}) {
  const ruleDisabled = Boolean(disabled || !checked);
  return (
    <div className="space-y-3 rounded-xl border bg-white p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h4 className="font-semibold text-slate-900">{title}</h4>
          <p className="text-xs text-slate-500">{description}</p>
        </div>
        <Switch checked={checked} disabled={disabled} onCheckedChange={onCheckedChange} />
      </div>
      {days && onDaysChange && daysLabel && (
        <DayListField
          label={daysLabel}
          value={days}
          minimum={daysMinimum}
          direction={daysDirection}
          disabled={ruleDisabled}
          onChange={onDaysChange}
        />
      )}
      <div>
        <Label>Modelo da mensagem</Label>
        <Textarea
          rows={7}
          disabled={ruleDisabled}
          value={template}
          onChange={(event) => onTemplateChange(event.target.value)}
        />
      </div>
    </div>
  );
}

function StatusTile({ ok, label, detail }: { ok: boolean; label: string; detail: string }) {
  return (
    <div
      className={`rounded-lg border p-4 ${ok ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}
    >
      <div className="flex items-center gap-2 font-semibold">
        {ok ? (
          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
        ) : (
          <AlertCircle className="h-4 w-4 text-amber-600" />
        )}
        {label}
      </div>
      <p className="mt-1 text-xs text-slate-600">{detail}</p>
    </div>
  );
}

function BillingTypeSelect({
  value,
  onValueChange,
}: {
  value: BillingType;
  onValueChange: (value: BillingType) => void;
}) {
  return (
    <Select value={value} onValueChange={(next) => onValueChange(next as BillingType)}>
      <SelectTrigger>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {Object.entries(billingTypeLabels).map(([key, label]) => (
          <SelectItem key={key} value={key}>
            {label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  step = "1",
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step?: string;
}) {
  return (
    <div>
      <Label>{label}</Label>
      <Input
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) =>
          onChange(Math.min(max, Math.max(min, numberValue(event.target.value))))
        }
      />
    </div>
  );
}

function CreateChargeDialog({
  open,
  onOpenChange,
  clients,
  plans,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clients: BillingClient[];
  plans: BillingPlan[];
  onDone: () => Promise<void>;
}) {
  const [form, setForm] = useState({
    tenantId: "",
    amount: "",
    dueDate: "",
    billingType: "UNDEFINED" as BillingType,
    description: "Mensalidade LinkUp Studio",
  });
  const [busy, setBusy] = useState(false);
  const selected = useMemo(
    () => clients.find((client) => client.tenant.id === form.tenantId),
    [clients, form.tenantId],
  );
  useEffect(() => {
    if (!selected?.contract) return;
    const { contract, customer } = selected;
    const plan = plans.find((item) => item.id === contract.plan_id);
    setForm((current) => ({
      ...current,
      amount: String(contract.amount_snapshot ?? plan?.amount ?? ""),
      billingType: contract.billing_type ?? customer?.preferred_billing_type ?? "UNDEFINED",
      dueDate: contract.next_due_date ?? "",
    }));
  }, [plans, selected]);
  async function create() {
    if (!form.tenantId || !form.dueDate || numberValue(form.amount) <= 0)
      return toast.error("Informe salão, valor e vencimento.");
    setBusy(true);
    try {
      await invokeAsaas("create-charge", {
        tenantId: form.tenantId,
        amount: numberValue(form.amount),
        dueDate: form.dueDate,
        billingType: form.billingType,
        description: form.description.trim() || null,
      });
      toast.success("Cobrança emitida com sucesso.");
      onOpenChange(false);
      setForm({
        tenantId: "",
        amount: "",
        dueDate: "",
        billingType: "UNDEFINED",
        description: "Mensalidade LinkUp Studio",
      });
      await onDone();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Emitir cobrança para um salão</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-2 md:grid-cols-2">
          <div className="md:col-span-2">
            <Label>Salão cliente</Label>
            <Select
              value={form.tenantId}
              onValueChange={(tenantId) => setForm({ ...form, tenantId })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione o salão" />
              </SelectTrigger>
              <SelectContent>
                {clients
                  .filter(
                    (item) =>
                      item.contract &&
                      ["trialing", "active", "past_due"].includes(item.contract.status),
                  )
                  .map((client) => (
                    <SelectItem key={client.tenant.id} value={client.tenant.id}>
                      {client.tenant.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Valor</Label>
            <Input
              type="number"
              min="0.01"
              step="0.01"
              value={form.amount}
              onChange={(event) => setForm({ ...form, amount: event.target.value })}
            />
          </div>
          <div>
            <Label>Vencimento</Label>
            <Input
              type="date"
              value={form.dueDate}
              onChange={(event) => setForm({ ...form, dueDate: event.target.value })}
            />
          </div>
          <div className="md:col-span-2">
            <Label>Forma de pagamento</Label>
            <BillingTypeSelect
              value={form.billingType}
              onValueChange={(billingType) => setForm({ ...form, billingType })}
            />
          </div>
          <div className="md:col-span-2 rounded-lg border border-indigo-100 bg-indigo-50 p-3 text-xs text-indigo-800">
            A competência será calculada pelo backend a partir do próximo vencimento do contrato. O
            período vigente nunca será cobrado novamente.
          </div>
          <div className="md:col-span-2">
            <Label>Descrição na fatura</Label>
            <Textarea
              value={form.description}
              onChange={(event) => setForm({ ...form, description: event.target.value })}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button className="bg-indigo-600 hover:bg-indigo-700" disabled={busy} onClick={create}>
            {busy ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <FileText className="mr-2 h-4 w-4" />
            )}
            Emitir no Asaas
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type ClientContractForm = {
  tenantId: string;
  planId: string;
  status: BillingContract["status"];
  amountSnapshot: number;
  intervalMonthsSnapshot: number;
  billingType: BillingType;
  dueDay: number;
  startsOn: string;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  nextDueDate: string;
  trialStartsOn: string;
  trialEndsOn: string;
  autoRenew: boolean;
  cancelAtPeriodEnd: boolean;
  legalName: string;
  cpfCnpj: string;
  email: string;
  phone: string;
  address: string;
  addressNumber: string;
  complement: string;
  province: string;
  postalCode: string;
  city: string;
  state: string;
  preferredBillingType: BillingType;
  notificationDisabled: boolean;
};

function clientForm(client: BillingClient, plans: BillingPlan[]): ClientContractForm {
  const plan = plans.find((item) => item.id === client.contract?.plan_id) ?? plans[0];
  const today = new Date().toISOString().slice(0, 10);
  const trialStartsOn =
    client.contract?.trial_starts_on ??
    (client.contract?.status === "trialing"
      ? client.contract.starts_on || client.contract.current_period_start || today
      : "");
  const trialEndsOn =
    client.contract?.trial_ends_on ??
    (client.contract?.status === "trialing"
      ? client.contract.next_due_date || client.contract.current_period_end || addDaysIso(today, 7)
      : "");
  return {
    tenantId: client.tenant.id,
    planId: client.contract?.plan_id ?? plan?.id ?? "",
    status: client.contract?.status ?? "active",
    amountSnapshot: numberValue(client.contract?.amount_snapshot ?? plan?.amount),
    intervalMonthsSnapshot: numberValue(
      client.contract?.interval_months_snapshot ?? plan?.interval_months ?? 1,
    ),
    billingType:
      client.contract?.billing_type ?? client.customer?.preferred_billing_type ?? "UNDEFINED",
    dueDay: numberValue(client.contract?.due_day ?? 10),
    startsOn: client.contract?.starts_on ?? today,
    currentPeriodStart: client.contract?.current_period_start ?? "",
    currentPeriodEnd: client.contract?.current_period_end ?? "",
    nextDueDate: client.contract?.next_due_date ?? "",
    trialStartsOn,
    trialEndsOn,
    autoRenew: client.contract?.auto_renew ?? true,
    cancelAtPeriodEnd: client.contract?.cancel_at_period_end ?? false,
    legalName: client.customer?.legal_name ?? client.tenant.name,
    cpfCnpj: client.customer?.cpf_cnpj ?? "",
    email: client.customer?.email ?? "",
    phone: client.customer?.phone ?? "",
    address: client.customer?.address ?? "",
    addressNumber: client.customer?.address_number ?? "",
    complement: client.customer?.complement ?? "",
    province: client.customer?.province ?? "",
    postalCode: client.customer?.postal_code ?? "",
    city: client.customer?.city ?? "",
    state: client.customer?.state ?? "",
    preferredBillingType: client.customer?.preferred_billing_type ?? "UNDEFINED",
    notificationDisabled: client.customer?.notification_disabled ?? true,
  };
}

function ClientContractDialog({
  client,
  plans,
  environment,
  onOpenChange,
  onDone,
}: {
  client: BillingClient | null;
  plans: BillingPlan[];
  environment: BillingEnvironment;
  onOpenChange: (open: boolean) => void;
  onDone: () => Promise<void>;
}) {
  const [form, setForm] = useState<ClientContractForm | null>(
    client ? clientForm(client, plans) : null,
  );
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => setForm(client ? clientForm(client, plans) : null), [client, plans]);
  if (!form || !client) return null;
  const suspended = client.contract?.status === "suspended";

  async function persist(syncAfter: boolean) {
    if (!form) return;
    const currentForm = form;
    const cpfCnpj = currentForm.cpfCnpj.replace(/\D/g, "");
    if (cpfCnpj && ![11, 14].includes(cpfCnpj.length))
      return toast.error("Informe um CPF ou CNPJ válido.");
    if (!currentForm.planId || currentForm.amountSnapshot < 0)
      return toast.error("Selecione um plano e informe um valor válido.");
    if (currentForm.status === "trialing") {
      if (!currentForm.trialStartsOn || !currentForm.trialEndsOn) {
        return toast.error("Informe o início e o fim do teste grátis.");
      }
      if (currentForm.trialEndsOn < currentForm.trialStartsOn) {
        return toast.error("O fim do teste precisa ser igual ou posterior ao início.");
      }
    }
    setBusy(syncAfter ? "sync" : "save");
    try {
      const effectiveNextDueDate =
        currentForm.status === "trialing"
          ? currentForm.nextDueDate || currentForm.trialEndsOn
          : currentForm.nextDueDate || null;
      await invokeAsaas("save-contract", {
        contract: {
          tenantId: currentForm.tenantId,
          planId: currentForm.planId,
          status: currentForm.status,
          amountSnapshot: currentForm.amountSnapshot,
          intervalMonthsSnapshot: currentForm.intervalMonthsSnapshot,
          billingType: currentForm.billingType,
          dueDay: currentForm.dueDay,
          startsOn: currentForm.startsOn,
          currentPeriodStart: currentForm.currentPeriodStart || null,
          currentPeriodEnd: currentForm.currentPeriodEnd || null,
          nextDueDate: effectiveNextDueDate,
          trialStartsOn: currentForm.trialStartsOn || null,
          trialEndsOn: currentForm.trialEndsOn || null,
          autoRenew: currentForm.autoRenew,
          cancelAtPeriodEnd: currentForm.cancelAtPeriodEnd,
        },
        customer: {
          environment,
          legalName: currentForm.legalName.trim(),
          cpfCnpj: cpfCnpj || null,
          email: currentForm.email.trim() || null,
          phone: currentForm.phone.replace(/\D/g, "") || null,
          address: currentForm.address.trim() || null,
          addressNumber: currentForm.addressNumber.trim() || null,
          complement: currentForm.complement.trim() || null,
          province: currentForm.province.trim() || null,
          postalCode: currentForm.postalCode.replace(/\D/g, "") || null,
          city: currentForm.city.trim() || null,
          state: currentForm.state.trim().toUpperCase() || null,
          preferredBillingType: currentForm.preferredBillingType,
          notificationDisabled: currentForm.notificationDisabled,
        },
      });
      if (syncAfter) await invokeAsaas("sync-customer", { tenantId: currentForm.tenantId });
      toast.success(syncAfter ? "Contrato salvo e cliente sincronizado." : "Contrato atualizado.");
      await onDone();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Dialog open={Boolean(client)} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Cliente &amp; contrato · {client.tenant.name}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-2 md:grid-cols-2">
          <div className="md:col-span-2 text-xs font-bold uppercase tracking-wide text-indigo-600">
            Dados da cobrança
          </div>
          <div>
            <Label>Plano</Label>
            <Select
              value={form.planId}
              onValueChange={(planId) => {
                const plan = plans.find((item) => item.id === planId);
                setForm({
                  ...form,
                  planId,
                  amountSnapshot: plan?.amount ?? form.amountSnapshot,
                  intervalMonthsSnapshot: plan?.interval_months ?? form.intervalMonthsSnapshot,
                });
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                {plans.map((plan) => (
                  <SelectItem key={plan.id} value={plan.id}>
                    {plan.name} · {brl(plan.amount)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Status do contrato</Label>
            <Select
              value={form.status}
              disabled={suspended}
              onValueChange={(status) => {
                const nextStatus = status as BillingContract["status"];
                if (nextStatus !== "trialing") {
                  setForm({ ...form, status: nextStatus });
                  return;
                }
                const start =
                  form.trialStartsOn || form.startsOn || new Date().toISOString().slice(0, 10);
                const end = form.trialEndsOn || form.nextDueDate || addDaysIso(start, 7);
                setForm({
                  ...form,
                  status: nextStatus,
                  trialStartsOn: start,
                  trialEndsOn: end,
                  nextDueDate: form.nextDueDate || end,
                });
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="trialing">Em teste</SelectItem>
                <SelectItem value="active">Ativo</SelectItem>
                <SelectItem value="past_due">Em atraso</SelectItem>
                <SelectItem value="suspended" disabled>
                  Suspenso pelo financeiro
                </SelectItem>
                <SelectItem value="cancelled">Cancelado</SelectItem>
              </SelectContent>
            </Select>
            {suspended && (
              <p className="mt-1 text-xs text-amber-700">
                A reativação ocorre automaticamente quando uma cobrança válida é confirmada pelo
                Asaas. Não é possível liberar somente alterando este campo.
              </p>
            )}
          </div>
          <div>
            <Label>Valor contratado</Label>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={form.amountSnapshot}
              onChange={(event) =>
                setForm({ ...form, amountSnapshot: numberValue(event.target.value) })
              }
            />
          </div>
          <div>
            <Label>Periodicidade (meses)</Label>
            <Input
              type="number"
              min="1"
              max="120"
              value={form.intervalMonthsSnapshot}
              onChange={(event) =>
                setForm({ ...form, intervalMonthsSnapshot: numberValue(event.target.value) })
              }
            />
          </div>
          <div>
            <Label>Dia de vencimento</Label>
            <Input
              type="number"
              min="1"
              max="28"
              value={form.dueDay}
              onChange={(event) => setForm({ ...form, dueDay: numberValue(event.target.value) })}
            />
          </div>
          <div>
            <Label>Próximo vencimento</Label>
            <Input
              type="date"
              value={form.nextDueDate}
              onChange={(event) => setForm({ ...form, nextDueDate: event.target.value })}
            />
          </div>
          {form.status === "trialing" && (
            <div className="md:col-span-2 rounded-2xl border border-amber-200 bg-amber-50/70 p-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <Label>Início do teste grátis</Label>
                  <Input
                    type="date"
                    value={form.trialStartsOn}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        trialStartsOn: event.target.value,
                      })
                    }
                  />
                </div>
                <div>
                  <Label>Fim do teste grátis</Label>
                  <Input
                    type="date"
                    value={form.trialEndsOn}
                    onChange={(event) => {
                      const trialEndsOn = event.target.value;
                      setForm({
                        ...form,
                        trialEndsOn,
                        nextDueDate: form.nextDueDate || trialEndsOn,
                      });
                    }}
                  />
                </div>
              </div>
              <p className="mt-3 text-xs leading-relaxed text-amber-800">
                No teste grátis, o fim do teste também vira a data-base para cobrança e lembretes.
                Se a data passar sem pagamento confirmado, o worker financeiro suspende o contrato e
                bloqueia o acesso do salão.
              </p>
            </div>
          )}
          <div className="md:col-span-2">
            <Label>Forma de pagamento</Label>
            <BillingTypeSelect
              value={form.billingType}
              onValueChange={(billingType) => setForm({ ...form, billingType })}
            />
          </div>
          <ToggleRow
            label="Renovação automática"
            detail="Gera a próxima cobrança pelo motor da LinkUp."
            checked={form.autoRenew}
            onCheckedChange={(autoRenew) => setForm({ ...form, autoRenew })}
          />
          <ToggleRow
            label="Cancelar ao fim do período"
            detail="Mantém o acesso até o encerramento da vigência."
            checked={form.cancelAtPeriodEnd}
            onCheckedChange={(cancelAtPeriodEnd) => setForm({ ...form, cancelAtPeriodEnd })}
          />

          <div className="md:col-span-2 mt-2 text-xs font-bold uppercase tracking-wide text-indigo-600">
            Pagador no Asaas
          </div>
          <div className="md:col-span-2">
            <Label>Razão social / nome fiscal</Label>
            <Input
              value={form.legalName}
              onChange={(event) => setForm({ ...form, legalName: event.target.value })}
            />
          </div>
          <div>
            <Label>CPF / CNPJ</Label>
            <Input
              value={form.cpfCnpj}
              onChange={(event) => setForm({ ...form, cpfCnpj: event.target.value })}
            />
          </div>
          <div>
            <Label>E-mail financeiro</Label>
            <Input
              type="email"
              value={form.email}
              onChange={(event) => setForm({ ...form, email: event.target.value })}
            />
          </div>
          <div>
            <Label>Telefone</Label>
            <Input
              value={form.phone}
              onChange={(event) => setForm({ ...form, phone: event.target.value })}
            />
          </div>
          <div>
            <Label>CEP</Label>
            <Input
              value={form.postalCode}
              onChange={(event) => setForm({ ...form, postalCode: event.target.value })}
            />
          </div>
          <div>
            <Label>Endereço</Label>
            <Input
              value={form.address}
              onChange={(event) => setForm({ ...form, address: event.target.value })}
            />
          </div>
          <div>
            <Label>Número / complemento</Label>
            <div className="grid grid-cols-2 gap-2">
              <Input
                value={form.addressNumber}
                onChange={(event) => setForm({ ...form, addressNumber: event.target.value })}
              />
              <Input
                value={form.complement}
                onChange={(event) => setForm({ ...form, complement: event.target.value })}
              />
            </div>
          </div>
          <div>
            <Label>Bairro</Label>
            <Input
              value={form.province}
              onChange={(event) => setForm({ ...form, province: event.target.value })}
            />
          </div>
          <div>
            <Label>Cidade / UF</Label>
            <div className="grid grid-cols-[1fr_80px] gap-2">
              <Input
                value={form.city}
                onChange={(event) => setForm({ ...form, city: event.target.value })}
              />
              <Input
                maxLength={2}
                value={form.state}
                onChange={(event) => setForm({ ...form, state: event.target.value })}
              />
            </div>
          </div>
          <div className="md:col-span-2">
            <Label>Forma preferida do pagador</Label>
            <BillingTypeSelect
              value={form.preferredBillingType}
              onValueChange={(preferredBillingType) => setForm({ ...form, preferredBillingType })}
            />
          </div>
          <div className="md:col-span-2">
            <ToggleRow
              label="Desativar comunicações do Asaas"
              detail="A LinkUp Studio permanece responsável pelas mensagens."
              checked={form.notificationDisabled}
              onCheckedChange={(notificationDisabled) => setForm({ ...form, notificationDisabled })}
            />
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" disabled={Boolean(busy)} onClick={() => persist(true)}>
            {busy === "sync" ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Salvar e sincronizar
          </Button>
          <Button
            className="bg-indigo-600 hover:bg-indigo-700"
            disabled={Boolean(busy)}
            onClick={() => persist(false)}
          >
            {busy === "save" ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            Salvar contrato
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ToggleRow({
  label,
  detail,
  checked,
  onCheckedChange,
}: {
  label: string;
  detail: string;
  checked: boolean;
  onCheckedChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between rounded-lg border p-4">
      <div>
        <Label>{label}</Label>
        <p className="text-xs text-slate-500">{detail}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}

type BillingPlanForm = Omit<BillingPlan, "id"> & { id?: string };

function emptyPlanForm(): BillingPlanForm {
  return {
    code: "",
    name: "",
    description: "",
    interval_months: 1,
    amount: 0,
    active: true,
    sort_order: 0,
  };
}

function PlanDialog({
  plan,
  onOpenChange,
  onDone,
}: {
  plan: BillingPlan | "new" | null;
  onOpenChange: (open: boolean) => void;
  onDone: () => Promise<void>;
}) {
  const initial: BillingPlanForm | null = plan === "new" ? emptyPlanForm() : plan;
  const [form, setForm] = useState<BillingPlanForm | null>(initial);
  const [busy, setBusy] = useState(false);
  useEffect(() => setForm(plan === "new" ? emptyPlanForm() : plan), [plan]);
  if (!form) return null;
  async function save() {
    if (!form) return;
    const currentForm = form;
    if (!currentForm.code.trim() || !currentForm.name.trim() || numberValue(currentForm.amount) < 0)
      return toast.error("Preencha código, nome e valor.");
    setBusy(true);
    try {
      await invokeAsaas("save-plan", {
        plan: {
          id: plan === "new" ? null : currentForm.id,
          code: currentForm.code
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9_-]/g, "-"),
          name: currentForm.name.trim(),
          description: currentForm.description?.trim() || null,
          intervalMonths: numberValue(currentForm.interval_months),
          amount: numberValue(currentForm.amount),
          active: currentForm.active,
          sortOrder: numberValue(currentForm.sort_order),
        },
      });
      toast.success("Plano salvo.");
      onOpenChange(false);
      await onDone();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog open={Boolean(plan)} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{plan === "new" ? "Novo plano comercial" : "Editar plano"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-2 md:grid-cols-2">
          <div>
            <Label>Código interno</Label>
            <Input
              disabled={plan !== "new"}
              value={form.code}
              onChange={(event) => setForm({ ...form, code: event.target.value })}
            />
          </div>
          <div>
            <Label>Nome</Label>
            <Input
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
            />
          </div>
          <div>
            <Label>Valor</Label>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={form.amount}
              onChange={(event) => setForm({ ...form, amount: numberValue(event.target.value) })}
            />
          </div>
          <div>
            <Label>Periodicidade (meses)</Label>
            <Input
              type="number"
              min="1"
              max="120"
              value={form.interval_months}
              onChange={(event) =>
                setForm({ ...form, interval_months: numberValue(event.target.value) })
              }
            />
          </div>
          <div className="md:col-span-2">
            <Label>Descrição</Label>
            <Textarea
              value={form.description ?? ""}
              onChange={(event) => setForm({ ...form, description: event.target.value })}
            />
          </div>
          <div>
            <Label>Ordem de exibição</Label>
            <Input
              type="number"
              value={form.sort_order}
              onChange={(event) =>
                setForm({ ...form, sort_order: numberValue(event.target.value) })
              }
            />
          </div>
          <ToggleRow
            label="Plano ativo"
            detail="Pode ser atribuído a novos salões."
            checked={form.active}
            onCheckedChange={(active) => setForm({ ...form, active })}
          />
        </div>
        <DialogFooter>
          <Button className="bg-indigo-600 hover:bg-indigo-700" disabled={busy} onClick={save}>
            {busy ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            Salvar plano
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

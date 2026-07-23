/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  BadgeDollarSign,
  CalendarClock,
  Check,
  CircleDollarSign,
  Clock3,
  Copy,
  Crown,
  FileText,
  Gift,
  ImagePlus,
  LayoutDashboard,
  MessageCircle,
  MoreHorizontal,
  PackageCheck,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Trash2,
  UserRound,
  UsersRound,
  WalletCards,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentTenant } from "@/hooks/use-tenant";
import { brl, cpfMask } from "@/lib/format";
import { buildPixPayload } from "@/lib/pix";
import { QrCode } from "@/lib/qr";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { ImageCropDialog } from "@/components/ui/image-crop-dialog";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
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

const db = supabase as any;

type PlanBenefit = {
  id?: string;
  benefit_type: string;
  service_id?: string | null;
  product_id?: string | null;
  name: string;
  description?: string | null;
  quantity?: number | null;
  discount_pct?: number | null;
  active?: boolean;
};

type Plan = {
  id: string;
  tenant_id: string;
  name: string;
  description?: string | null;
  category?: string | null;
  image_url?: string | null;
  status: string;
  model: string;
  session_limit?: number | null;
  max_per_month?: number | null;
  max_per_week?: number | null;
  max_per_day?: number | null;
  allow_multiple_same_day: boolean;
  allow_reschedule: boolean;
  allow_cancellation: boolean;
  allow_rollover: boolean;
  sessions_expire: boolean;
  session_validity_days?: number | null;
  duration_days?: number | null;
  price: number;
  billing_cycle: string;
  discount_allowed: boolean;
  discount_value: number;
  coupon_allowed: boolean;
  enrollment_fee_allowed: boolean;
  enrollment_fee: number;
  booking_show_name: boolean;
  booking_show_benefits: boolean;
  booking_show_remaining: boolean;
  booking_show_validity: boolean;
  booking_show_discount: boolean;
  included_services_only: boolean;
  allow_extras: boolean;
  financial_category_id?: string | null;
  cost_center?: string | null;
  financial_account_id?: string | null;
  billing_mode: string;
  pix_enabled: boolean;
  asaas_enabled: boolean;
  automatic_settlement: boolean;
  automatic_renewal: boolean;
  automatic_notifications: boolean;
};

type Contract = {
  id: string;
  tenant_id: string;
  plan_id: string;
  client_id?: string | null;
  subscriber_name: string;
  cpf?: string | null;
  whatsapp?: string | null;
  status: string;
  starts_at: string;
  ends_at?: string | null;
  next_due_at?: string | null;
  price: number;
  sessions_total?: number | null;
  sessions_used: number;
  sessions_remaining?: number | null;
  auto_renew: boolean;
  notes?: string | null;
};

type ModuleData = {
  plans: Plan[];
  benefits: PlanBenefitWithPlan[];
  contracts: Contract[];
  usages: any[];
  charges: any[];
  services: any[];
  products: any[];
  clients: any[];
  professionals: any[];
  categories: any[];
  accounts: any[];
  settings: any | null;
};

type PlanBenefitWithPlan = PlanBenefit & { plan_id: string; tenant_id: string };

const SAO_PAULO_TIME_ZONE = "America/Sao_Paulo";

function saoPauloDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: SAO_PAULO_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function dateKeyDayNumber(value: string) {
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  if (![year, month, day].every(Number.isFinite)) return null;
  return Math.floor(Date.UTC(year, month - 1, day) / 86_400_000);
}

function dueDateInfo(value?: string | null) {
  if (!value) {
    return {
      days: null as number | null,
      label: "Sem vencimento",
      className: "border-slate-200 bg-slate-50 text-slate-600",
    };
  }

  const dueDay = dateKeyDayNumber(value);
  const currentDay = dateKeyDayNumber(saoPauloDateKey());
  if (dueDay === null || currentDay === null) {
    return {
      days: null as number | null,
      label: "Data inválida",
      className: "border-slate-200 bg-slate-50 text-slate-600",
    };
  }

  const days = dueDay - currentDay;
  if (days < 0) {
    const overdueDays = Math.abs(days);
    return {
      days,
      label: `Vencida há ${overdueDays} ${overdueDays === 1 ? "dia" : "dias"}`,
      className: "border-red-200 bg-red-50 text-red-700",
    };
  }
  if (days === 0) {
    return {
      days,
      label: "Vence hoje",
      className: "border-rose-200 bg-rose-50 text-rose-700",
    };
  }
  if (days <= 3) {
    return {
      days,
      label: `Vence em ${days} ${days === 1 ? "dia" : "dias"}`,
      className: "border-orange-200 bg-orange-50 text-orange-700",
    };
  }
  if (days <= 7) {
    return {
      days,
      label: `Vence em ${days} dias`,
      className: "border-amber-200 bg-amber-50 text-amber-700",
    };
  }
  if (days <= 15) {
    return {
      days,
      label: `Vence em ${days} dias`,
      className: "border-blue-200 bg-blue-50 text-blue-700",
    };
  }
  return {
    days,
    label: `Vence em ${days} dias`,
    className: "border-slate-200 bg-slate-50 text-slate-600",
  };
}

function DueDateIndicator({
  value,
  showDate = true,
}: {
  value?: string | null;
  showDate?: boolean;
}) {
  const due = dueDateInfo(value);
  return (
    <div className="flex min-w-max flex-col items-start gap-1">
      {showDate && <span className="text-sm">{dateLabel(value)}</span>}
      <Badge variant="outline" className={due.className}>
        <Clock3 className="mr-1 h-3 w-3" />
        {due.label}
      </Badge>
    </div>
  );
}

function ChargeDateIndicator({ charge }: { charge: any }) {
  if (charge?.status !== "paid") {
    return <DueDateIndicator value={charge?.due_date} />;
  }

  const paidDate = charge?.paid_at ?? charge?.updated_at ?? charge?.due_date;

  return (
    <div className="flex min-w-max flex-col items-start gap-1">
      <span className="text-sm">Pago em {dateLabel(paidDate)}</span>
      {charge?.due_date && (
        <span className="text-xs text-muted-foreground">
          Vencia em {dateLabel(charge.due_date)}
        </span>
      )}
      <Badge variant="outline" className={statusClass("paid")}>
        <Check className="mr-1 h-3 w-3" />
        Recebida
      </Badge>
    </div>
  );
}

function isOpenCharge(charge: any) {
  return ["pending", "overdue"].includes(charge?.status);
}

function isProofPending(charge: any) {
  return charge?.proof_status === "pending_review";
}

function findOpenCharge(charges: any[], subscriptionId: string) {
  return charges
    .filter((charge) => charge.subscription_id === subscriptionId && isOpenCharge(charge))
    .sort((a, b) => {
      const proofPriority = Number(isProofPending(b)) - Number(isProofPending(a));
      if (proofPriority) return proofPriority;
      return String(a.due_date ?? "").localeCompare(String(b.due_date ?? ""));
    })[0];
}

function ProofStatusBadge({ charge }: { charge: any }) {
  if (!charge?.proof_storage_path && charge?.proof_status === "none") return null;
  const status = charge?.proof_status ?? "none";
  const config =
    status === "pending_review"
      ? {
          label: "Aguardando confirmação",
          className: "border-amber-200 bg-amber-50 text-amber-700",
        }
      : status === "approved"
        ? {
            label: "Comprovante aprovado",
            className: "border-emerald-200 bg-emerald-50 text-emerald-700",
          }
        : status === "rejected"
          ? {
              label: "Comprovante recusado",
              className: "border-red-200 bg-red-50 text-red-700",
            }
          : {
              label: "Comprovante enviado",
              className: "border-blue-200 bg-blue-50 text-blue-700",
            };
  return (
    <Badge variant="outline" className={config.className}>
      <FileText className="mr-1 h-3 w-3" />
      {config.label}
    </Badge>
  );
}

function fillMessageTemplate(template: string, values: Record<string, string>) {
  return Object.entries(values).reduce(
    (message, [key, value]) => message.replaceAll(`{${key}}`, value),
    template,
  );
}

function subscriptionWhatsAppMessage(
  contract: Contract,
  plan: Plan | undefined,
  charge: any,
  settings: any,
) {
  const due = dueDateInfo(charge?.due_date ?? contract.next_due_at);
  const template =
    due.days !== null && due.days < 0
      ? settings?.overdue_message ||
        "Olá, {cliente}. Identificamos uma pendência na assinatura {plano}, vencida em {vencimento}. Valor: {valor}."
      : settings?.billing_message ||
        "Olá, {cliente}! Sua assinatura {plano} vence em {vencimento}. Valor: {valor}.";
  return fillMessageTemplate(template, {
    cliente: contract.subscriber_name,
    plano: plan?.name ?? "assinatura",
    vencimento: dateLabel(charge?.due_date ?? contract.next_due_at),
    valor: brl(charge?.amount ?? contract.price),
    dias: due.days === null ? "" : String(Math.abs(due.days)),
  });
}

function notifySubscriptionClient(
  contract: Contract,
  plan: Plan | undefined,
  charge: any,
  settings: any,
) {
  if (!contract.whatsapp) {
    toast.error("Cliente sem WhatsApp cadastrado.");
    return;
  }
  const digits = contract.whatsapp.replace(/\D/g, "");
  const phone = digits.startsWith("55") && digits.length >= 12 ? digits : `55${digits}`;
  const message = subscriptionWhatsAppMessage(contract, plan, charge, settings);
  window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, "_blank");
}

async function viewSubscriptionProof(charge: any) {
  if (!charge?.proof_storage_path) {
    toast.error("Esta cobrança ainda não possui comprovante.");
    return;
  }

  const preview = window.open("about:blank", "_blank");
  const { data, error } = await supabase.storage
    .from("subscription-payment-proofs")
    .createSignedUrl(charge.proof_storage_path, 600);
  if (error || !data?.signedUrl) {
    preview?.close();
    toast.error(error?.message ?? "Não foi possível abrir o comprovante.");
    return;
  }
  if (preview) {
    preview.opener = null;
    preview.location.href = data.signedUrl;
  } else {
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }
}

async function confirmSubscriptionPayment(charge: any) {
  const accepted = window.confirm(
    `Confirmar o pagamento de ${brl(charge.amount)} com vencimento em ${dateLabel(
      charge.due_date,
    )}?\n\nEssa ação dará baixa no financeiro e renovará o saldo de sessões do cliente.`,
  );
  if (!accepted) return false;

  const { data, error } = await db.rpc("confirm_subscription_payment", {
    p_tenant_id: charge.tenant_id,
    p_charge_id: charge.id,
    p_payment_method: charge.proof_storage_path ? "pix" : "manual",
    p_notes: charge.proof_storage_path
      ? "Comprovante revisado e pagamento confirmado pela gestão."
      : "Pagamento declarado manualmente pela gestão.",
  });
  if (error) {
    toast.error(error.message);
    return false;
  }

  if ((data as any)?.subscription_status === "overdue") {
    toast.success(
      "Pagamento registrado no financeiro. A assinatura continua vencida porque ainda há outra cobrança em aberto.",
    );
  } else {
    toast.success("Pagamento confirmado. Sessões renovadas e lançamento financeiro atualizado.");
  }
  return true;
}

async function rejectSubscriptionProof(charge: any) {
  const reason = window.prompt("Informe o motivo da recusa do comprovante:");
  if (!reason?.trim()) return false;

  const { error } = await db.rpc("reject_subscription_payment_proof", {
    p_tenant_id: charge.tenant_id,
    p_charge_id: charge.id,
    p_reason: reason.trim(),
  });
  if (error) {
    toast.error(error.message);
    return false;
  }
  toast.success("Comprovante recusado. O cliente poderá enviar um novo arquivo.");
  return true;
}

const today = saoPauloDateKey();
const monthStart = `${today.slice(0, 7)}-01`;

const statusLabels: Record<string, string> = {
  active: "Ativa",
  pending_activation: "Aguardando pagamento",
  inactive: "Inativa",
  overdue: "Vencida",
  suspended: "Suspensa",
  canceled: "Cancelada",
  expired: "Expirada",
  pending: "Pendente",
  paid: "Recebida",
  refunded: "Estornada",
};

const modelLabels: Record<string, string> = {
  recurring: "Recorrente",
  session_package: "Pacote de sessões",
  fixed_period: "Plano por período",
};

const cycleLabels: Record<string, string> = {
  weekly: "Semanal",
  biweekly: "Quinzenal",
  monthly: "Mensal",
  yearly: "Anual",
  one_time: "Pagamento único",
};

function dateLabel(value?: string | null) {
  if (!value) return "—";
  const clean = value.slice(0, 10);
  const [year, month, day] = clean.split("-");
  return `${day}/${month}/${year}`;
}

function statusClass(status: string) {
  if (status === "active" || status === "paid")
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "overdue" || status === "canceled" || status === "expired")
    return "border-red-200 bg-red-50 text-red-700";
  if (status === "pending" || status === "pending_activation")
    return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-slate-200 bg-slate-50 text-slate-600";
}

function selectClassName() {
  return "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50";
}

function nullableNumber(value: string | number | null | undefined) {
  if (value === "" || value === null || value === undefined) return null;
  const result = Number(value);
  return Number.isFinite(result) ? result : null;
}

async function loadModuleData(tenantId: string): Promise<ModuleData> {
  const [
    plans,
    benefits,
    contracts,
    usages,
    charges,
    services,
    products,
    clients,
    professionals,
    categories,
    accounts,
    settings,
  ] = await Promise.all([
    db
      .from("subscription_plans")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false }),
    db.from("subscription_plan_benefits").select("*").eq("tenant_id", tenantId).order("created_at"),
    db
      .from("client_subscriptions")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false }),
    db
      .from("subscription_usages")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("used_at", { ascending: false })
      .limit(500),
    db
      .from("subscription_charges")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("due_date", { ascending: false })
      .limit(500),
    db
      .from("services")
      .select("id,name,price,active")
      .eq("tenant_id", tenantId)
      .eq("active", true)
      .order("name"),
    db
      .from("products")
      .select("id,name,price,active")
      .eq("tenant_id", tenantId)
      .eq("active", true)
      .order("name"),
    db
      .from("clients")
      .select("id,full_name,whatsapp,email,cpf,is_subscriber")
      .eq("tenant_id", tenantId)
      .order("full_name"),
    db
      .from("professionals")
      .select("id,full_name,active")
      .eq("tenant_id", tenantId)
      .eq("active", true)
      .order("full_name"),
    db
      .from("financial_categories")
      .select("id,name,movement_kind,active")
      .eq("tenant_id", tenantId)
      .eq("movement_kind", "in")
      .eq("active", true)
      .order("name"),
    db
      .from("financial_accounts")
      .select("id,name,active")
      .eq("tenant_id", tenantId)
      .eq("active", true)
      .order("name"),
    db.from("subscription_module_settings").select("*").eq("tenant_id", tenantId).maybeSingle(),
  ]);

  const allResults = [
    plans,
    benefits,
    contracts,
    usages,
    charges,
    services,
    products,
    clients,
    professionals,
    categories,
    accounts,
    settings,
  ];
  const failed = allResults.find((result) => result.error);
  if (failed?.error) throw failed.error;

  return {
    plans: plans.data ?? [],
    benefits: benefits.data ?? [],
    contracts: contracts.data ?? [],
    usages: usages.data ?? [],
    charges: charges.data ?? [],
    services: services.data ?? [],
    products: products.data ?? [],
    clients: clients.data ?? [],
    professionals: professionals.data ?? [],
    categories: categories.data ?? [],
    accounts: accounts.data ?? [],
    settings: settings.data ?? null,
  };
}

export function SubscriptionsModule() {
  const { data: tenant } = useCurrentTenant();
  const tenantId = tenant?.id;
  const queryClient = useQueryClient();
  const [tab, setTab] = useState("dashboard");
  const [planDialog, setPlanDialog] = useState<Plan | true | null>(null);
  const [contractDialog, setContractDialog] = useState(false);
  const [usageDialog, setUsageDialog] = useState(false);
  const [selectedContract, setSelectedContract] = useState<Contract | null>(null);
  const [pixCharge, setPixCharge] = useState<any | null>(null);

  const moduleQuery = useQuery({
    queryKey: ["subscriptions-module", tenantId],
    enabled: !!tenantId,
    queryFn: () => loadModuleData(tenantId!),
  });

  const data = moduleQuery.data;
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ["subscriptions-module", tenantId] });

  return (
    <div className="mx-auto max-w-[1500px] space-y-6 pb-12">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-amber-600">
            <Crown className="h-4 w-4" />
            Gestão recorrente
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">Assinaturas</h1>
          <p className="mt-1 max-w-3xl text-muted-foreground">
            Crie planos, protocolos e pacotes personalizados, acompanhe o consumo e integre as
            cobranças ao financeiro.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={() => void moduleQuery.refetch()}
            disabled={moduleQuery.isFetching}
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${moduleQuery.isFetching ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
          <Button
            variant="outline"
            onClick={() => setContractDialog(true)}
            disabled={!data?.plans.length}
          >
            <UserRound className="mr-2 h-4 w-4" />
            Vincular cliente
          </Button>
          <Button onClick={() => setPlanDialog(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Nova assinatura
          </Button>
        </div>
      </div>

      {moduleQuery.error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Estrutura de Assinaturas ainda não está disponível</AlertTitle>
          <AlertDescription>
            Aplique as migrations 20260716170000_subscription_management_erp.sql e
            20260716180000_subscription_payment_proofs.sql no Supabase, depois recarregue esta
            página. Detalhe: {(moduleQuery.error as Error).message}
          </AlertDescription>
        </Alert>
      )}

      <Tabs value={tab} onValueChange={setTab}>
        <div className="overflow-x-auto pb-1">
          <TabsList className="h-auto min-w-max justify-start rounded-xl bg-muted/60 p-1">
            <TabsTrigger value="dashboard" className="gap-2 px-4 py-2.5">
              <LayoutDashboard className="h-4 w-4" /> Dashboard
            </TabsTrigger>
            <TabsTrigger value="plans" className="gap-2 px-4 py-2.5">
              <Sparkles className="h-4 w-4" /> Assinaturas
            </TabsTrigger>
            <TabsTrigger value="clients" className="gap-2 px-4 py-2.5">
              <UsersRound className="h-4 w-4" /> Clientes assinantes
            </TabsTrigger>
            <TabsTrigger value="usages" className="gap-2 px-4 py-2.5">
              <PackageCheck className="h-4 w-4" /> Utilizações
            </TabsTrigger>
            <TabsTrigger value="finance" className="gap-2 px-4 py-2.5">
              <WalletCards className="h-4 w-4" /> Financeiro
            </TabsTrigger>
            <TabsTrigger value="settings" className="gap-2 px-4 py-2.5">
              <Settings2 className="h-4 w-4" /> Configurações
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="dashboard" className="mt-6">
          <DashboardTab data={data} />
        </TabsContent>
        <TabsContent value="plans" className="mt-6">
          <PlansTab
            data={data}
            onNew={() => setPlanDialog(true)}
            onEdit={(plan) => setPlanDialog(plan)}
            onRefresh={refresh}
          />
        </TabsContent>
        <TabsContent value="clients" className="mt-6">
          <ClientsTab
            data={data}
            onNew={() => setContractDialog(true)}
            onOpen={setSelectedContract}
            onRefresh={refresh}
          />
        </TabsContent>
        <TabsContent value="usages" className="mt-6">
          <UsagesTab data={data} onNew={() => setUsageDialog(true)} />
        </TabsContent>
        <TabsContent value="finance" className="mt-6">
          <FinanceTab data={data} onRefresh={refresh} onPix={setPixCharge} />
        </TabsContent>
        <TabsContent value="settings" className="mt-6">
          <SettingsTab tenantId={tenantId} settings={data?.settings} onRefresh={refresh} />
        </TabsContent>
      </Tabs>

      <PlanWizard
        open={!!planDialog}
        plan={planDialog === true ? null : planDialog}
        tenantId={tenantId}
        data={data}
        onClose={() => setPlanDialog(null)}
        onSaved={() => {
          setPlanDialog(null);
          refresh();
          setTab("plans");
        }}
      />
      <ContractDialog
        open={contractDialog}
        tenantId={tenantId}
        data={data}
        onClose={() => setContractDialog(false)}
        onSaved={() => {
          setContractDialog(false);
          refresh();
          setTab("clients");
        }}
      />
      <ManualUsageDialog
        open={usageDialog}
        data={data}
        onClose={() => setUsageDialog(false)}
        onSaved={() => {
          setUsageDialog(false);
          refresh();
        }}
      />
      <ContractDetailDialog
        contract={selectedContract}
        data={data}
        onClose={() => setSelectedContract(null)}
        onRefresh={refresh}
        onPix={setPixCharge}
      />
      <ChargePixDialog
        charge={pixCharge}
        tenant={tenant}
        data={data}
        onClose={() => setPixCharge(null)}
      />
    </div>
  );
}

function DashboardTab({ data }: { data?: ModuleData }) {
  const [start, setStart] = useState(monthStart);
  const [end, setEnd] = useState(today);
  const contracts = data?.contracts ?? [];
  const allCharges = data?.charges ?? [];
  const charges = allCharges.filter((charge) => charge.due_date >= start && charge.due_date <= end);
  const usages = (data?.usages ?? []).filter((usage) => {
    const day = usage.used_at.slice(0, 10);
    return day >= start && day <= end;
  });
  const active = contracts.filter((contract) => contract.status === "active");
  const overdue = contracts.filter((contract) => contract.status === "overdue");
  const expected = charges
    .filter((charge) => !["canceled", "refunded"].includes(charge.status))
    .reduce((sum, charge) => sum + Number(charge.amount), 0);
  const received = charges
    .filter((charge) => charge.status === "paid")
    .reduce((sum, charge) => sum + Number(charge.amount), 0);
  const monthlyRevenue = active
    .filter(
      (contract) =>
        data?.plans.find((plan) => plan.id === contract.plan_id)?.billing_cycle === "monthly",
    )
    .reduce((sum, contract) => sum + Number(contract.price), 0);
  const remaining = active.reduce(
    (sum, contract) => sum + Number(contract.sessions_remaining ?? 0),
    0,
  );
  const averageTicket = active.length
    ? active.reduce((sum, contract) => sum + Number(contract.price), 0) / active.length
    : 0;
  const upcoming = [...contracts]
    .filter(
      (contract) =>
        (contract.next_due_at || findOpenCharge(allCharges, contract.id)?.due_date) &&
        ["active", "overdue"].includes(contract.status),
    )
    .sort((a, b) => {
      const aDue = findOpenCharge(allCharges, a.id)?.due_date ?? a.next_due_at;
      const bDue = findOpenCharge(allCharges, b.id)?.due_date ?? b.next_due_at;
      return String(aDue).localeCompare(String(bDue));
    })
    .slice(0, 6);

  const metrics = [
    {
      label: "Assinaturas ativas",
      value: String(active.length),
      detail: `${data?.plans.filter((plan) => plan.status === "active").length ?? 0} planos disponíveis`,
      icon: ShieldCheck,
      tone: "text-emerald-600 bg-emerald-50",
    },
    {
      label: "Assinaturas vencidas",
      value: String(overdue.length),
      detail: "Exigem acompanhamento",
      icon: AlertCircle,
      tone: "text-red-600 bg-red-50",
    },
    {
      label: "Receita recorrente mensal",
      value: brl(monthlyRevenue),
      detail: "Contratos mensais ativos",
      icon: RefreshCw,
      tone: "text-blue-600 bg-blue-50",
    },
    {
      label: "Receita prevista",
      value: brl(expected),
      detail: `${charges.length} cobranças no período`,
      icon: CalendarClock,
      tone: "text-amber-600 bg-amber-50",
    },
    {
      label: "Receita recebida",
      value: brl(received),
      detail: "Baixas confirmadas",
      icon: CircleDollarSign,
      tone: "text-emerald-600 bg-emerald-50",
    },
    {
      label: "Sessões consumidas",
      value: String(usages.reduce((sum, usage) => sum + Number(usage.quantity), 0)),
      detail: "No período selecionado",
      icon: PackageCheck,
      tone: "text-violet-600 bg-violet-50",
    },
    {
      label: "Sessões restantes",
      value: String(remaining),
      detail: "Saldo dos contratos ativos",
      icon: Gift,
      tone: "text-cyan-600 bg-cyan-50",
    },
    {
      label: "Ticket médio",
      value: brl(averageTicket),
      detail: "Assinaturas ativas",
      icon: BadgeDollarSign,
      tone: "text-slate-700 bg-slate-100",
    },
  ];

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="flex flex-col gap-4 p-5 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="text-sm font-semibold">Visão do período</div>
            <p className="text-sm text-muted-foreground">
              Os indicadores financeiros consideram o vencimento das cobranças.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <div className="space-y-1">
              <Label>De</Label>
              <Input type="date" value={start} onChange={(event) => setStart(event.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Até</Label>
              <Input type="date" value={end} onChange={(event) => setEnd(event.target.value)} />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric) => (
          <Card key={metric.label}>
            <CardContent className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {metric.label}
                  </p>
                  <p className="mt-2 text-2xl font-semibold">{metric.value}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{metric.detail}</p>
                </div>
                <div className={`rounded-xl p-2.5 ${metric.tone}`}>
                  <metric.icon className="h-5 w-5" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Saúde da receita</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div>
              <div className="mb-2 flex justify-between text-sm">
                <span>Recebido sobre o previsto</span>
                <strong>{expected ? Math.round((received / expected) * 100) : 0}%</strong>
              </div>
              <Progress value={expected ? Math.min(100, (received / expected) * 100) : 0} />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-xl bg-muted/50 p-4">
                <span className="text-xs text-muted-foreground">Previsto</span>
                <strong className="mt-1 block">{brl(expected)}</strong>
              </div>
              <div className="rounded-xl bg-emerald-50 p-4">
                <span className="text-xs text-emerald-700">Recebido</span>
                <strong className="mt-1 block text-emerald-700">{brl(received)}</strong>
              </div>
              <div className="rounded-xl bg-amber-50 p-4">
                <span className="text-xs text-amber-700">Pendente</span>
                <strong className="mt-1 block text-amber-700">
                  {brl(Math.max(0, expected - received))}
                </strong>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Próximos vencimentos</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {upcoming.map((contract) => (
                <div
                  key={contract.id}
                  className="flex items-center justify-between gap-3 rounded-xl border p-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{contract.subscriber_name}</p>
                    <div className="mt-1">
                      <DueDateIndicator
                        value={
                          findOpenCharge(allCharges, contract.id)?.due_date ?? contract.next_due_at
                        }
                      />
                    </div>
                  </div>
                  <strong className="text-sm">{brl(contract.price)}</strong>
                </div>
              ))}
              {!upcoming.length && <EmptyLine text="Nenhum vencimento futuro cadastrado." />}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function PlansTab({
  data,
  onNew,
  onEdit,
  onRefresh,
}: {
  data?: ModuleData;
  onNew: () => void;
  onEdit: (plan: Plan) => void;
  onRefresh: () => void;
}) {
  const [search, setSearch] = useState("");
  const plans = (data?.plans ?? []).filter((plan) =>
    `${plan.name} ${plan.category ?? ""}`.toLowerCase().includes(search.toLowerCase()),
  );

  async function togglePlan(plan: Plan) {
    const { error } = await db
      .from("subscription_plans")
      .update({ status: plan.status === "active" ? "inactive" : "active" })
      .eq("id", plan.id);
    if (error) return toast.error(error.message);
    toast.success("Status do plano atualizado.");
    onRefresh();
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full max-w-md">
          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Buscar plano ou categoria..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <Button onClick={onNew}>
          <Plus className="mr-2 h-4 w-4" />
          Nova assinatura
        </Button>
      </div>

      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {plans.map((plan) => {
          const planBenefits =
            data?.benefits.filter((benefit) => benefit.plan_id === plan.id && benefit.active) ?? [];
          const contracts =
            data?.contracts.filter(
              (contract) => contract.plan_id === plan.id && contract.status === "active",
            ) ?? [];
          return (
            <Card key={plan.id} className="overflow-hidden">
              <div className="h-1.5 bg-gradient-to-r from-amber-500 via-amber-400 to-yellow-300" />
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className={statusClass(plan.status)}>
                        {statusLabels[plan.status]}
                      </Badge>
                      <Badge variant="secondary">{modelLabels[plan.model]}</Badge>
                    </div>
                    <h3 className="truncate text-lg font-semibold">{plan.name}</h3>
                    <p className="mt-1 line-clamp-2 min-h-10 text-sm text-muted-foreground">
                      {plan.description || "Sem descrição."}
                    </p>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button size="icon" variant="ghost">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => onEdit(plan)}>
                        <Pencil className="mr-2 h-4 w-4" />
                        Editar
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => void togglePlan(plan)}>
                        {plan.status === "active" ? "Inativar plano" : "Ativar plano"}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                <div className="my-5 flex items-end justify-between">
                  <div>
                    <span className="text-2xl font-semibold">{brl(plan.price)}</span>
                    <span className="text-sm text-muted-foreground">
                      {" "}
                      / {cycleLabels[plan.billing_cycle]?.toLowerCase()}
                    </span>
                  </div>
                  <div className="text-right text-xs text-muted-foreground">
                    <strong className="block text-base text-foreground">{contracts.length}</strong>
                    clientes ativos
                  </div>
                </div>
                <Separator />
                <div className="mt-4 space-y-2">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Benefícios</span>
                    <span>{planBenefits.length}</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {planBenefits.slice(0, 4).map((benefit) => (
                      <Badge key={benefit.id} variant="secondary" className="font-normal">
                        {benefit.name}
                      </Badge>
                    ))}
                    {planBenefits.length > 4 && (
                      <Badge variant="outline">+{planBenefits.length - 4}</Badge>
                    )}
                    {!planBenefits.length && (
                      <span className="text-xs text-muted-foreground">
                        Nenhum benefício configurado.
                      </span>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
      {!plans.length && (
        <EmptyState
          icon={Sparkles}
          title="Nenhum plano encontrado"
          description="Crie uma assinatura recorrente, um pacote de sessões ou um plano por período."
          action="Criar primeira assinatura"
          onAction={onNew}
        />
      )}
    </div>
  );
}

function ClientsTab({
  data,
  onNew,
  onOpen,
  onRefresh,
}: {
  data?: ModuleData;
  onNew: () => void;
  onOpen: (contract: Contract) => void;
  onRefresh: () => void;
}) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [busyChargeId, setBusyChargeId] = useState<string | null>(null);
  const contracts = (data?.contracts ?? []).filter((contract) => {
    const matchesSearch =
      `${contract.subscriber_name} ${contract.cpf ?? ""} ${contract.whatsapp ?? ""}`
        .toLowerCase()
        .includes(search.toLowerCase());
    return matchesSearch && (filter === "all" || contract.status === filter);
  });

  async function setStatus(contract: Contract, status: string) {
    const payload: any = { status };
    if (status === "suspended") payload.suspended_at = new Date().toISOString();
    if (status === "canceled") payload.canceled_at = new Date().toISOString();
    const { error } = await db.from("client_subscriptions").update(payload).eq("id", contract.id);
    if (error) return toast.error(error.message);
    toast.success(`Assinatura ${statusLabels[status].toLowerCase()}.`);
    onRefresh();
  }

  async function markPaid(charge: any) {
    setBusyChargeId(charge.id);
    try {
      if (await confirmSubscriptionPayment(charge)) onRefresh();
    } finally {
      setBusyChargeId(null);
    }
  }

  async function rejectProof(charge: any) {
    setBusyChargeId(charge.id);
    try {
      if (await rejectSubscriptionProof(charge)) onRefresh();
    } finally {
      setBusyChargeId(null);
    }
  }

  return (
    <Card>
      <CardHeader className="gap-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <CardTitle>Clientes assinantes</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Contratos, saldos, vencimentos e situação de cada cliente.
            </p>
          </div>
          <Button onClick={onNew}>
            <Plus className="mr-2 h-4 w-4" />
            Vincular cliente
          </Button>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Buscar por nome, CPF ou WhatsApp..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <select
            className={`${selectClassName()} sm:w-48`}
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
          >
            <option value="all">Todas as situações</option>
            <option value="pending_activation">Aguardando pagamento</option>
            <option value="active">Ativas</option>
            <option value="overdue">Vencidas</option>
            <option value="suspended">Suspensas</option>
            <option value="canceled">Canceladas</option>
          </select>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cliente</TableHead>
                <TableHead>Plano</TableHead>
                <TableHead>Situação</TableHead>
                <TableHead>Vencimento e prazo</TableHead>
                <TableHead>Utilização</TableHead>
                <TableHead>Valor</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {contracts.map((contract) => {
                const plan = data?.plans.find((item) => item.id === contract.plan_id);
                const used = Number(contract.sessions_used ?? 0);
                const total = Number(contract.sessions_total ?? 0);
                const openCharge = findOpenCharge(data?.charges ?? [], contract.id);
                const dueDate = openCharge?.due_date ?? contract.next_due_at;
                return (
                  <TableRow
                    key={contract.id}
                    className="cursor-pointer"
                    onClick={() => onOpen(contract)}
                  >
                    <TableCell>
                      <div className="font-medium">{contract.subscriber_name}</div>
                      <div className="text-xs text-muted-foreground">
                        {contract.whatsapp || cpfMask(contract.cpf ?? "")}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">{plan?.name ?? "Plano removido"}</div>
                      <div className="text-xs text-muted-foreground">
                        {plan ? modelLabels[plan.model] : ""}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex min-w-max flex-col items-start gap-1">
                        <Badge variant="outline" className={statusClass(contract.status)}>
                          {statusLabels[contract.status] ?? contract.status}
                        </Badge>
                        {openCharge && <ProofStatusBadge charge={openCharge} />}
                        {openCharge?.proof_status === "rejected" &&
                          openCharge.proof_rejection_reason && (
                            <span className="max-w-48 text-xs text-red-600">
                              {openCharge.proof_rejection_reason}
                            </span>
                          )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <DueDateIndicator value={dueDate} />
                    </TableCell>
                    <TableCell className="min-w-36">
                      {contract.sessions_total === null || contract.sessions_total === undefined ? (
                        <span className="text-sm text-muted-foreground">Sem limite global</span>
                      ) : (
                        <>
                          <div className="mb-1 flex justify-between text-xs">
                            <span>{used} usadas</span>
                            <span>{contract.sessions_remaining ?? 0} restantes</span>
                          </div>
                          <Progress value={total ? (used / total) * 100 : 0} className="h-1.5" />
                        </>
                      )}
                    </TableCell>
                    <TableCell className="font-medium">{brl(contract.price)}</TableCell>
                    <TableCell className="text-right" onClick={(event) => event.stopPropagation()}>
                      <div className="flex min-w-max justify-end gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            notifySubscriptionClient(contract, plan, openCharge, data?.settings)
                          }
                        >
                          <MessageCircle className="mr-1 h-4 w-4" />
                          Notificar
                        </Button>
                        {openCharge?.proof_storage_path && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => void viewSubscriptionProof(openCharge)}
                          >
                            <FileText className="mr-1 h-4 w-4" />
                            Ver comprovante
                          </Button>
                        )}
                        {openCharge && (
                          <Button
                            size="sm"
                            onClick={() => void markPaid(openCharge)}
                            disabled={busyChargeId === openCharge.id}
                          >
                            <Check className="mr-1 h-4 w-4" />
                            {busyChargeId === openCharge.id ? "Confirmando..." : "Declarar pago"}
                          </Button>
                        )}
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button size="icon" variant="ghost">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => onOpen(contract)}>
                              Abrir painel
                            </DropdownMenuItem>
                            {isProofPending(openCharge) && (
                              <DropdownMenuItem
                                className="text-red-600"
                                onClick={() => void rejectProof(openCharge)}
                              >
                                Recusar comprovante
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuSeparator />
                            {contract.status !== "suspended" && (
                              <DropdownMenuItem
                                onClick={() => void setStatus(contract, "suspended")}
                              >
                                Suspender
                              </DropdownMenuItem>
                            )}
                            {contract.status !== "canceled" && (
                              <DropdownMenuItem
                                className="text-red-600"
                                onClick={() => void setStatus(contract, "canceled")}
                              >
                                Cancelar
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
        {!contracts.length && <EmptyLine text="Nenhum cliente assinante encontrado." />}
      </CardContent>
    </Card>
  );
}

function UsagesTab({ data, onNew }: { data?: ModuleData; onNew: () => void }) {
  const [search, setSearch] = useState("");
  const usages = (data?.usages ?? []).filter((usage) => {
    const contract = data?.contracts.find((item) => item.id === usage.subscription_id);
    const service = data?.services.find((item) => item.id === usage.service_id);
    return `${contract?.subscriber_name ?? ""} ${service?.name ?? ""}`
      .toLowerCase()
      .includes(search.toLowerCase());
  });

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>Utilizações</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Consumos automáticos no fechamento da comanda e ajustes manuais.
            </p>
          </div>
          <Button onClick={onNew}>
            <Plus className="mr-2 h-4 w-4" />
            Registrar utilização
          </Button>
        </div>
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Buscar cliente ou serviço..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data e hora</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Plano</TableHead>
                <TableHead>Benefício / serviço</TableHead>
                <TableHead>Profissional</TableHead>
                <TableHead>Quantidade</TableHead>
                <TableHead>Saldo após uso</TableHead>
                <TableHead>Origem</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {usages.map((usage) => {
                const contract = data?.contracts.find((item) => item.id === usage.subscription_id);
                const plan = data?.plans.find((item) => item.id === contract?.plan_id);
                const service = data?.services.find((item) => item.id === usage.service_id);
                const benefit = data?.benefits.find((item) => item.id === usage.benefit_id);
                const professional = data?.professionals.find(
                  (item) => item.id === usage.professional_id,
                );
                return (
                  <TableRow key={usage.id}>
                    <TableCell>
                      {new Date(usage.used_at).toLocaleString("pt-BR", {
                        dateStyle: "short",
                        timeStyle: "short",
                      })}
                    </TableCell>
                    <TableCell className="font-medium">
                      {contract?.subscriber_name ?? "Cliente removido"}
                    </TableCell>
                    <TableCell>{plan?.name ?? "—"}</TableCell>
                    <TableCell>{service?.name ?? benefit?.name ?? "Utilização"}</TableCell>
                    <TableCell>{professional?.full_name ?? "—"}</TableCell>
                    <TableCell>{usage.quantity}</TableCell>
                    <TableCell>{usage.remaining_after ?? "Ilimitado"}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        {usage.source === "checkout"
                          ? "Comanda"
                          : usage.source === "booking"
                            ? "Agendamento"
                            : "Manual"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
        {!usages.length && <EmptyLine text="Nenhuma utilização registrada." />}
      </CardContent>
    </Card>
  );
}

function FinanceTab({
  data,
  onRefresh,
  onPix,
}: {
  data?: ModuleData;
  onRefresh: () => void;
  onPix: (charge: any) => void;
}) {
  const [filter, setFilter] = useState("all");
  const [busyChargeId, setBusyChargeId] = useState<string | null>(null);
  const charges = (data?.charges ?? []).filter((charge) => {
    if (filter === "all") return true;
    if (filter === "proof_pending") return isProofPending(charge);
    return charge.status === filter;
  });
  const expected = charges
    .filter((charge) => !["canceled", "refunded"].includes(charge.status))
    .reduce((sum, charge) => sum + Number(charge.amount), 0);
  const received = charges
    .filter((charge) => charge.status === "paid")
    .reduce((sum, charge) => sum + Number(charge.amount), 0);

  async function markPaid(charge: any) {
    setBusyChargeId(charge.id);
    try {
      if (await confirmSubscriptionPayment(charge)) onRefresh();
    } finally {
      setBusyChargeId(null);
    }
  }

  async function rejectProof(charge: any) {
    setBusyChargeId(charge.id);
    try {
      if (await rejectSubscriptionProof(charge)) onRefresh();
    } finally {
      setBusyChargeId(null);
    }
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard
          label="Previsto"
          value={brl(expected)}
          detail="Cobranças exibidas"
          icon={CalendarClock}
          tone="text-amber-600 bg-amber-50"
        />
        <MetricCard
          label="Recebido"
          value={brl(received)}
          detail="Baixado no fluxo de caixa"
          icon={CircleDollarSign}
          tone="text-emerald-600 bg-emerald-50"
        />
        <MetricCard
          label="Em aberto"
          value={brl(Math.max(0, expected - received))}
          detail="Pendente ou vencido"
          icon={Clock3}
          tone="text-red-600 bg-red-50"
        />
      </div>
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>Cobranças de assinaturas</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                Cada cobrança alimenta Contas a Receber, Fluxo de Caixa e DRE.
              </p>
            </div>
            <select
              className={`${selectClassName()} sm:w-48`}
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
            >
              <option value="all">Todas</option>
              <option value="proof_pending">Aguardando confirmação</option>
              <option value="pending">Pendentes</option>
              <option value="overdue">Vencidas</option>
              <option value="paid">Recebidas</option>
              <option value="canceled">Canceladas</option>
            </select>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Vencimento</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Plano</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Comprovante</TableHead>
                  <TableHead>Valor</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {charges.map((charge) => {
                  const contract = data?.contracts.find(
                    (item) => item.id === charge.subscription_id,
                  );
                  const plan = data?.plans.find((item) => item.id === contract?.plan_id);
                  return (
                    <TableRow key={charge.id}>
                      <TableCell>
                        <ChargeDateIndicator charge={charge} />
                      </TableCell>
                      <TableCell className="font-medium">
                        {contract?.subscriber_name ?? "Cliente removido"}
                      </TableCell>
                      <TableCell>{plan?.name ?? "—"}</TableCell>
                      <TableCell>{charge.description ?? "Mensalidade"}</TableCell>
                      <TableCell>
                        <div className="flex min-w-max flex-col items-start gap-1">
                          <Badge variant="outline" className={statusClass(charge.status)}>
                            {statusLabels[charge.status] ?? charge.status}
                          </Badge>
                          <ProofStatusBadge charge={charge} />
                        </div>
                      </TableCell>
                      <TableCell>
                        {charge.proof_storage_path ? (
                          <div className="flex max-w-56 flex-col items-start gap-1">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => void viewSubscriptionProof(charge)}
                            >
                              <FileText className="mr-1 h-4 w-4" />
                              Ver comprovante
                            </Button>
                            <span className="max-w-full truncate text-xs text-muted-foreground">
                              {charge.proof_file_name ?? "Arquivo enviado pelo cliente"}
                            </span>
                            {charge.proof_status === "rejected" &&
                              charge.proof_rejection_reason && (
                                <span className="text-xs text-red-600">
                                  {charge.proof_rejection_reason}
                                </span>
                              )}
                          </div>
                        ) : (
                          <span className="text-sm text-muted-foreground">Não enviado</span>
                        )}
                      </TableCell>
                      <TableCell className="font-medium">{brl(charge.amount)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex min-w-max justify-end gap-2">
                          {isOpenCharge(charge) && (
                            <Button
                              size="sm"
                              onClick={() => void markPaid(charge)}
                              disabled={busyChargeId === charge.id}
                            >
                              <Check className="mr-1 h-4 w-4" />
                              {busyChargeId === charge.id ? "Confirmando..." : "Declarar pago"}
                            </Button>
                          )}
                          {isProofPending(charge) && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-red-600"
                              onClick={() => void rejectProof(charge)}
                              disabled={busyChargeId === charge.id}
                            >
                              Recusar
                            </Button>
                          )}
                          {isOpenCharge(charge) && (
                            <Button size="sm" variant="outline" onClick={() => onPix(charge)}>
                              PIX
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          {!charges.length && <EmptyLine text="Nenhuma cobrança encontrada." />}
        </CardContent>
      </Card>
    </div>
  );
}

function SettingsTab({
  tenantId,
  settings,
  onRefresh,
}: {
  tenantId?: string;
  settings: any;
  onRefresh: () => void;
}) {
  const [form, setForm] = useState(() => ({
    grace_days: settings?.grace_days ?? 0,
    default_validity_days: settings?.default_validity_days ?? 30,
    default_allow_reschedule: settings?.default_allow_reschedule ?? true,
    default_allow_cancellation: settings?.default_allow_cancellation ?? true,
    default_allow_rollover: settings?.default_allow_rollover ?? false,
    whatsapp_enabled: settings?.whatsapp_enabled ?? true,
    renewal_rule: settings?.renewal_rule ?? "",
    cancellation_policy: settings?.cancellation_policy ?? "",
    usage_policy: settings?.usage_policy ?? "",
    billing_message:
      settings?.billing_message ??
      "Olá, {cliente}! Sua assinatura {plano} vence em {vencimento}. Valor: {valor}.",
    payment_confirmation_message:
      settings?.payment_confirmation_message ??
      "Pagamento confirmado! Sua assinatura {plano} está ativa até {validade}.",
    overdue_message:
      settings?.overdue_message ??
      "Olá, {cliente}. Identificamos uma pendência na assinatura {plano}.",
  }));
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!settings) return;
    setForm({
      grace_days: settings.grace_days ?? 0,
      default_validity_days: settings.default_validity_days ?? 30,
      default_allow_reschedule: settings.default_allow_reschedule ?? true,
      default_allow_cancellation: settings.default_allow_cancellation ?? true,
      default_allow_rollover: settings.default_allow_rollover ?? false,
      whatsapp_enabled: settings.whatsapp_enabled ?? true,
      renewal_rule: settings.renewal_rule ?? "",
      cancellation_policy: settings.cancellation_policy ?? "",
      usage_policy: settings.usage_policy ?? "",
      billing_message: settings.billing_message ?? "",
      payment_confirmation_message: settings.payment_confirmation_message ?? "",
      overdue_message: settings.overdue_message ?? "",
    });
  }, [settings]);

  async function save() {
    if (!tenantId) return;
    setBusy(true);
    const { error } = await db
      .from("subscription_module_settings")
      .upsert({ tenant_id: tenantId, ...form, asaas_enabled: false }, { onConflict: "tenant_id" });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Configurações de Assinaturas salvas.");
    onRefresh();
  }

  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Regras padrão</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Período de carência (dias)">
              <Input
                type="number"
                min={0}
                value={form.grace_days}
                onChange={(event) => setForm({ ...form, grace_days: Number(event.target.value) })}
              />
            </Field>
            <Field label="Validade padrão (dias)">
              <Input
                type="number"
                min={1}
                value={form.default_validity_days}
                onChange={(event) =>
                  setForm({ ...form, default_validity_days: Number(event.target.value) })
                }
              />
            </Field>
          </div>
          <SwitchField
            label="Permitir reagendamento por padrão"
            checked={form.default_allow_reschedule}
            onChange={(value) => setForm({ ...form, default_allow_reschedule: value })}
          />
          <SwitchField
            label="Permitir cancelamento por padrão"
            checked={form.default_allow_cancellation}
            onChange={(value) => setForm({ ...form, default_allow_cancellation: value })}
          />
          <SwitchField
            label="Permitir acúmulo de sessões por padrão"
            checked={form.default_allow_rollover}
            onChange={(value) => setForm({ ...form, default_allow_rollover: value })}
          />
          <SwitchField
            label="Integração com WhatsApp"
            checked={form.whatsapp_enabled}
            onChange={(value) => setForm({ ...form, whatsapp_enabled: value })}
          />
          <Field label="Regras de renovação">
            <Textarea
              rows={3}
              value={form.renewal_rule}
              onChange={(event) => setForm({ ...form, renewal_rule: event.target.value })}
            />
          </Field>
          <Field label="Política de cancelamento">
            <Textarea
              rows={3}
              value={form.cancellation_policy}
              onChange={(event) => setForm({ ...form, cancellation_policy: event.target.value })}
            />
          </Field>
          <Field label="Política de utilização">
            <Textarea
              rows={3}
              value={form.usage_policy}
              onChange={(event) => setForm({ ...form, usage_policy: event.target.value })}
            />
          </Field>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Mensagens automáticas</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <Alert>
            <MessageCircle className="h-4 w-4" />
            <AlertTitle>Mensagens administradas pela matriz</AlertTitle>
            <AlertDescription>
              Os textos, dias, quantidade de avisos e horário de envio são definidos no menu
              WhatsApp do LinkUp Studio. Aqui o salão apenas ativa ou desativa a automação de
              Assinaturas. As mensagens abaixo permanecem preservadas como referência.
            </AlertDescription>
          </Alert>
          <Field label="Lembrete de cobrança (somente leitura)">
            <Textarea rows={5} value={form.billing_message} readOnly className="bg-muted/40" />
          </Field>
          <Field label="Confirmação de pagamento (somente leitura)">
            <Textarea
              rows={5}
              value={form.payment_confirmation_message}
              readOnly
              className="bg-muted/40"
            />
          </Field>
          <Field label="Aviso de inadimplência (somente leitura)">
            <Textarea rows={5} value={form.overdue_message} readOnly className="bg-muted/40" />
          </Field>
          <Button className="w-full" onClick={() => void save()} disabled={busy}>
            {busy ? "Salvando..." : "Salvar configurações"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

type PlanForm = Omit<Plan, "id" | "tenant_id"> & { benefits: PlanBenefit[] };

function emptyPlan(): PlanForm {
  return {
    name: "",
    description: "",
    category: "",
    image_url: "",
    status: "active",
    model: "recurring",
    session_limit: 4,
    max_per_month: 4,
    max_per_week: null,
    max_per_day: 1,
    allow_multiple_same_day: false,
    allow_reschedule: true,
    allow_cancellation: true,
    allow_rollover: false,
    sessions_expire: true,
    session_validity_days: 30,
    duration_days: 30,
    price: 0,
    billing_cycle: "monthly",
    discount_allowed: false,
    discount_value: 0,
    coupon_allowed: false,
    enrollment_fee_allowed: false,
    enrollment_fee: 0,
    booking_show_name: true,
    booking_show_benefits: true,
    booking_show_remaining: true,
    booking_show_validity: true,
    booking_show_discount: true,
    included_services_only: true,
    allow_extras: true,
    financial_category_id: null,
    cost_center: "",
    financial_account_id: null,
    billing_mode: "recurring",
    pix_enabled: true,
    asaas_enabled: false,
    automatic_settlement: false,
    automatic_renewal: true,
    automatic_notifications: true,
    benefits: [],
  };
}

function PlanWizard({
  open,
  plan,
  tenantId,
  data,
  onClose,
  onSaved,
}: {
  open: boolean;
  plan: Plan | null;
  tenantId?: string;
  data?: ModuleData;
  onClose: () => void;
  onSaved: () => void;
}) {
  const initial = useMemo<PlanForm>(() => {
    if (!plan) return emptyPlan();
    return {
      ...emptyPlan(),
      ...plan,
      benefits: (data?.benefits ?? [])
        .filter((benefit) => benefit.plan_id === plan.id)
        .map(({ plan_id: _planId, tenant_id: _tenantId, ...benefit }) => benefit),
    };
  }, [plan, data?.benefits]);
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<PlanForm>(initial);
  const [busy, setBusy] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [cropSource, setCropSource] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [benefitType, setBenefitType] = useState("service");
  const [benefitRef, setBenefitRef] = useState("");
  const [benefitName, setBenefitName] = useState("");

  useEffect(() => {
    if (!imageFile) {
      setImagePreview(null);
      return;
    }
    const preview = URL.createObjectURL(imageFile);
    setImagePreview(preview);
    return () => URL.revokeObjectURL(preview);
  }, [imageFile]);

  useEffect(() => {
    if (!open) return;
    setForm(initial);
    setImageFile(null);
    setCropSource(null);
    setStep(1);
    setBenefitType("service");
    setBenefitRef("");
    setBenefitName("");
  }, [open, plan?.id, initial]);

  function close() {
    setStep(1);
    setForm(emptyPlan());
    setImageFile(null);
    setCropSource(null);
    onClose();
  }

  function selectImage(file?: File) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      return toast.error("Selecione um arquivo de imagem.");
    }
    if (file.size > 5 * 1024 * 1024) {
      return toast.error("A imagem deve ter no máximo 5 MB.");
    }
    setCropSource(file);
  }

  function removeImage() {
    setImageFile(null);
    setForm({ ...form, image_url: "" });
  }

  function canContinue() {
    if (step === 1 && !form.name.trim())
      return (toast.error("Informe o nome da assinatura."), false);
    if (step === 3 && !form.benefits.length)
      return (toast.error("Adicione ao menos um benefício."), false);
    if (step === 5 && Number(form.price) < 0)
      return (toast.error("Informe um valor válido."), false);
    return true;
  }

  function addBenefit() {
    const collection =
      benefitType === "service" ? data?.services : benefitType === "product" ? data?.products : [];
    const reference = collection?.find((item) => item.id === benefitRef);
    const name = reference?.name || benefitName.trim();
    if (!name) return toast.error("Selecione ou informe o benefício.");
    setForm({
      ...form,
      benefits: [
        ...form.benefits,
        {
          benefit_type: benefitType,
          service_id: benefitType === "service" ? benefitRef : null,
          product_id: benefitType === "product" ? benefitRef : null,
          name,
          quantity: 1,
          discount_pct: benefitType.startsWith("discount") ? 10 : null,
          active: true,
        },
      ],
    });
    setBenefitRef("");
    setBenefitName("");
  }

  async function save() {
    if (!tenantId || !canContinue()) return;
    setBusy(true);
    const { benefits, ...planForm } = form;
    let imageUrl = planForm.image_url || null;
    if (imageFile) {
      const safeName = imageFile.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `${tenantId}/subscription-plans/${Date.now()}-${safeName}`;
      const { error: uploadError } = await supabase.storage.from("assets").upload(path, imageFile, {
        contentType: imageFile.type || "image/jpeg",
      });
      if (uploadError) {
        setBusy(false);
        return toast.error(`Erro ao enviar a imagem: ${uploadError.message}`);
      }
      const { data: signed, error: signedError } = await supabase.storage
        .from("assets")
        .createSignedUrl(path, 60 * 60 * 24 * 365 * 5);
      if (signedError || !signed?.signedUrl) {
        setBusy(false);
        return toast.error("A imagem foi enviada, mas o link de exibição não pôde ser criado.");
      }
      imageUrl = signed.signedUrl;
    }
    const payload = {
      ...planForm,
      tenant_id: tenantId,
      session_limit: nullableNumber(planForm.session_limit),
      max_per_month: nullableNumber(planForm.max_per_month),
      max_per_week: nullableNumber(planForm.max_per_week),
      max_per_day: nullableNumber(planForm.max_per_day),
      session_validity_days: planForm.sessions_expire
        ? nullableNumber(planForm.session_validity_days)
        : null,
      duration_days:
        planForm.model === "fixed_period" ? nullableNumber(planForm.duration_days) : null,
      image_url: imageUrl,
      financial_category_id: planForm.financial_category_id || null,
      financial_account_id: planForm.financial_account_id || null,
      cost_center: planForm.cost_center || null,
      asaas_enabled: false,
      automatic_settlement: false,
    };

    let planId = plan?.id;
    const result = planId
      ? await db.from("subscription_plans").update(payload).eq("id", planId).select("id").single()
      : await db.from("subscription_plans").insert(payload).select("id").single();
    if (result.error) {
      setBusy(false);
      return toast.error(result.error.message);
    }
    planId = result.data.id;

    if (plan?.id) {
      const removed = await db.from("subscription_plan_benefits").delete().eq("plan_id", planId);
      if (removed.error) {
        setBusy(false);
        return toast.error(removed.error.message);
      }
    }
    const benefitPayloads = benefits.map((benefit) => ({
      tenant_id: tenantId,
      plan_id: planId,
      benefit_type: benefit.benefit_type,
      service_id: benefit.service_id || null,
      product_id: benefit.product_id || null,
      name: benefit.name,
      description: benefit.description || null,
      quantity: nullableNumber(benefit.quantity),
      discount_pct: nullableNumber(benefit.discount_pct),
      active: true,
    }));
    if (benefitPayloads.length) {
      const savedBenefits = await db.from("subscription_plan_benefits").insert(benefitPayloads);
      if (savedBenefits.error) {
        setBusy(false);
        return toast.error(savedBenefits.error.message);
      }
    }
    setBusy(false);
    toast.success(plan ? "Assinatura atualizada." : "Assinatura criada.");
    onSaved();
  }

  const stepTitles = [
    "Informações",
    "Modelo",
    "Benefícios",
    "Utilização",
    "Valores",
    "Agendamento",
    "Financeiro",
  ];

  return (
    <>
      <Dialog open={open} onOpenChange={(value) => !value && close()}>
        <DialogContent className="max-h-[94vh] max-w-5xl overflow-hidden p-0">
          <DialogHeader className="border-b px-6 py-5">
            <DialogTitle>{plan ? "Editar assinatura" : "Nova assinatura"}</DialogTitle>
            <DialogDescription>
              Etapa {step} de 7 · {stepTitles[step - 1]}
            </DialogDescription>
          </DialogHeader>
          <div className="grid min-h-0 md:grid-cols-[220px_1fr]">
            <div className="hidden border-r bg-muted/30 p-4 md:block">
              <div className="space-y-1">
                {stepTitles.map((title, index) => {
                  const number = index + 1;
                  return (
                    <button
                      key={title}
                      type="button"
                      onClick={() => number <= step && setStep(number)}
                      className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm ${number === step ? "bg-background font-medium shadow-sm" : number < step ? "text-emerald-700" : "text-muted-foreground"}`}
                    >
                      <span
                        className={`grid h-6 w-6 place-items-center rounded-full border text-xs ${number < step ? "border-emerald-600 bg-emerald-600 text-white" : number === step ? "border-amber-500 bg-amber-500 text-white" : ""}`}
                      >
                        {number < step ? <Check className="h-3.5 w-3.5" /> : number}
                      </span>
                      {title}
                    </button>
                  );
                })}
              </div>
            </div>
            <ScrollArea className="h-[62vh]">
              <div className="p-6">
                {step === 1 && (
                  <div className="space-y-5">
                    <StepHeading
                      title="Informações básicas"
                      description="Defina como o plano será apresentado ao time e aos clientes."
                    />
                    <div className="grid gap-4 md:grid-cols-2">
                      <Field label="Nome da assinatura *">
                        <Input
                          value={form.name}
                          onChange={(event) => setForm({ ...form, name: event.target.value })}
                          placeholder="Ex.: Clube da Beleza Premium"
                        />
                      </Field>
                      <Field label="Categoria">
                        <Input
                          value={form.category ?? ""}
                          onChange={(event) => setForm({ ...form, category: event.target.value })}
                          placeholder="VIP, Protocolo, Pacote..."
                        />
                      </Field>
                    </div>
                    <Field label="Descrição">
                      <Textarea
                        rows={4}
                        value={form.description ?? ""}
                        onChange={(event) => setForm({ ...form, description: event.target.value })}
                        placeholder="Explique a proposta e para quem este plano foi criado."
                      />
                    </Field>
                    <Field label="Imagem da assinatura (opcional)">
                      <div className="rounded-xl border border-dashed bg-muted/20 p-4">
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                          <div className="grid h-28 w-full shrink-0 place-items-center overflow-hidden rounded-lg border bg-background sm:w-36">
                            {imagePreview || form.image_url ? (
                              <img
                                src={imagePreview || form.image_url || ""}
                                alt="Pré-visualização da assinatura"
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <div className="flex flex-col items-center gap-2 text-muted-foreground">
                                <ImagePlus className="h-7 w-7" />
                                <span className="text-xs">Sem imagem</span>
                              </div>
                            )}
                          </div>
                          <div className="flex-1 space-y-3">
                            <div>
                              <p className="text-sm font-medium">Escolha uma foto da galeria</p>
                              <p className="mt-1 text-xs text-muted-foreground">
                                JPG, PNG ou WEBP, com no máximo 5 MB.
                              </p>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <Button type="button" variant="outline" asChild>
                                <label className="cursor-pointer">
                                  <ImagePlus className="mr-2 h-4 w-4" />
                                  {imagePreview || form.image_url ? "Trocar foto" : "Escolher foto"}
                                  <input
                                    type="file"
                                    accept="image/jpeg,image/png,image/webp"
                                    className="sr-only"
                                    onChange={(event) => {
                                      selectImage(event.target.files?.[0]);
                                      event.currentTarget.value = "";
                                    }}
                                  />
                                </label>
                              </Button>
                              {(imagePreview || form.image_url) && (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  className="text-destructive hover:text-destructive"
                                  onClick={removeImage}
                                >
                                  <Trash2 className="mr-2 h-4 w-4" />
                                  Remover
                                </Button>
                              )}
                            </div>
                            {imageFile && (
                              <p className="truncate text-xs text-emerald-700">
                                {imageFile.name} pronta para envio
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    </Field>
                    <SwitchField
                      label="Plano ativo"
                      description="Planos inativos não podem receber novos clientes."
                      checked={form.status === "active"}
                      onChange={(value) =>
                        setForm({ ...form, status: value ? "active" : "inactive" })
                      }
                    />
                  </div>
                )}
                {step === 2 && (
                  <div className="space-y-5">
                    <StepHeading
                      title="Modelo da assinatura"
                      description="Escolha a lógica comercial. Nenhum modelo é fixo e as regras serão configuradas nas próximas etapas."
                    />
                    <div className="grid gap-4 lg:grid-cols-3">
                      {[
                        {
                          value: "recurring",
                          title: "Assinatura recorrente",
                          description: "Cobranças periódicas e renovação contínua.",
                          icon: RefreshCw,
                        },
                        {
                          value: "session_package",
                          title: "Pacote de sessões",
                          description: "Quantidade limitada, sem renovação obrigatória.",
                          icon: PackageCheck,
                        },
                        {
                          value: "fixed_period",
                          title: "Plano por período",
                          description: "Benefícios válidos por uma janela determinada.",
                          icon: CalendarClock,
                        },
                      ].map((option) => (
                        <button
                          type="button"
                          key={option.value}
                          onClick={() => setForm({ ...form, model: option.value })}
                          className={`rounded-2xl border p-5 text-left transition ${form.model === option.value ? "border-amber-500 bg-amber-50 ring-2 ring-amber-500/15" : "hover:border-slate-300 hover:bg-muted/30"}`}
                        >
                          <option.icon
                            className={`mb-4 h-6 w-6 ${form.model === option.value ? "text-amber-600" : "text-muted-foreground"}`}
                          />
                          <strong className="block">{option.title}</strong>
                          <span className="mt-2 block text-sm text-muted-foreground">
                            {option.description}
                          </span>
                        </button>
                      ))}
                    </div>
                    {form.model === "fixed_period" && (
                      <Field label="Duração do plano (dias)">
                        <Input
                          type="number"
                          min={1}
                          value={form.duration_days ?? ""}
                          onChange={(event) =>
                            setForm({ ...form, duration_days: nullableNumber(event.target.value) })
                          }
                        />
                      </Field>
                    )}
                  </div>
                )}
                {step === 3 && (
                  <div className="space-y-5">
                    <StepHeading
                      title="Benefícios"
                      description="Adicione serviços, produtos, descontos, brindes e vantagens personalizadas sem limite."
                    />
                    <Card className="bg-muted/25">
                      <CardContent className="grid gap-3 p-4 md:grid-cols-[190px_1fr_auto]">
                        <select
                          className={selectClassName()}
                          value={benefitType}
                          onChange={(event) => {
                            setBenefitType(event.target.value);
                            setBenefitRef("");
                          }}
                        >
                          <option value="service">Serviço</option>
                          <option value="product">Produto</option>
                          <option value="discount_service">Desconto em serviço</option>
                          <option value="discount_product">Desconto em produto</option>
                          <option value="priority">Atendimento prioritário</option>
                          <option value="gift">Brinde</option>
                          <option value="custom">Outro benefício</option>
                        </select>
                        {benefitType === "service" || benefitType === "product" ? (
                          <select
                            className={selectClassName()}
                            value={benefitRef}
                            onChange={(event) => setBenefitRef(event.target.value)}
                          >
                            <option value="">Selecione...</option>
                            {(benefitType === "service" ? data?.services : data?.products)?.map(
                              (item) => (
                                <option key={item.id} value={item.id}>
                                  {item.name} · {brl(item.price)}
                                </option>
                              ),
                            )}
                          </select>
                        ) : (
                          <Input
                            value={benefitName}
                            onChange={(event) => setBenefitName(event.target.value)}
                            placeholder="Nome do benefício"
                          />
                        )}
                        <Button type="button" onClick={addBenefit}>
                          <Plus className="mr-1 h-4 w-4" />
                          Adicionar
                        </Button>
                      </CardContent>
                    </Card>
                    <div className="space-y-3">
                      {form.benefits.map((benefit, index) => (
                        <div
                          key={`${benefit.name}-${index}`}
                          className="grid gap-3 rounded-xl border p-4 md:grid-cols-[1fr_110px_110px_auto] md:items-end"
                        >
                          <div>
                            <div className="font-medium">{benefit.name}</div>
                            <div className="text-xs text-muted-foreground">
                              {benefit.benefit_type.replaceAll("_", " ")}
                            </div>
                          </div>
                          <Field label="Quantidade">
                            <Input
                              type="number"
                              min={1}
                              value={benefit.quantity ?? ""}
                              onChange={(event) => {
                                const next = [...form.benefits];
                                next[index] = {
                                  ...benefit,
                                  quantity: nullableNumber(event.target.value),
                                };
                                setForm({ ...form, benefits: next });
                              }}
                            />
                          </Field>
                          {benefit.benefit_type.startsWith("discount") ? (
                            <Field label="Desconto %">
                              <Input
                                type="number"
                                min={0}
                                max={100}
                                value={benefit.discount_pct ?? ""}
                                onChange={(event) => {
                                  const next = [...form.benefits];
                                  next[index] = {
                                    ...benefit,
                                    discount_pct: nullableNumber(event.target.value),
                                  };
                                  setForm({ ...form, benefits: next });
                                }}
                              />
                            </Field>
                          ) : (
                            <div />
                          )}
                          <Button
                            size="icon"
                            variant="ghost"
                            className="text-red-600"
                            onClick={() =>
                              setForm({
                                ...form,
                                benefits: form.benefits.filter(
                                  (_, itemIndex) => itemIndex !== index,
                                ),
                              })
                            }
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                      {!form.benefits.length && (
                        <EmptyLine text="Adicione o primeiro benefício do plano." />
                      )}
                    </div>
                  </div>
                )}
                {step === 4 && (
                  <div className="space-y-5">
                    <StepHeading
                      title="Regras de utilização"
                      description="Defina limites gerais e a política de consumo das sessões."
                    />
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                      <Field label="Sessões totais">
                        <Input
                          type="number"
                          min={1}
                          value={form.session_limit ?? ""}
                          onChange={(event) =>
                            setForm({ ...form, session_limit: nullableNumber(event.target.value) })
                          }
                          placeholder="Ilimitado"
                        />
                      </Field>
                      <Field label="Máximo por mês">
                        <Input
                          type="number"
                          min={1}
                          value={form.max_per_month ?? ""}
                          onChange={(event) =>
                            setForm({ ...form, max_per_month: nullableNumber(event.target.value) })
                          }
                          placeholder="Sem limite"
                        />
                      </Field>
                      <Field label="Máximo por semana">
                        <Input
                          type="number"
                          min={1}
                          value={form.max_per_week ?? ""}
                          onChange={(event) =>
                            setForm({ ...form, max_per_week: nullableNumber(event.target.value) })
                          }
                          placeholder="Sem limite"
                        />
                      </Field>
                      <Field label="Máximo por dia">
                        <Input
                          type="number"
                          min={1}
                          value={form.max_per_day ?? ""}
                          onChange={(event) =>
                            setForm({ ...form, max_per_day: nullableNumber(event.target.value) })
                          }
                          placeholder="Sem limite"
                        />
                      </Field>
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      <SwitchField
                        label="Mais de uma sessão no mesmo dia"
                        checked={form.allow_multiple_same_day}
                        onChange={(value) => setForm({ ...form, allow_multiple_same_day: value })}
                      />
                      <SwitchField
                        label="Permitir reagendamento"
                        checked={form.allow_reschedule}
                        onChange={(value) => setForm({ ...form, allow_reschedule: value })}
                      />
                      <SwitchField
                        label="Permitir cancelamento"
                        checked={form.allow_cancellation}
                        onChange={(value) => setForm({ ...form, allow_cancellation: value })}
                      />
                      <SwitchField
                        label="Permitir acúmulo de sessões"
                        checked={form.allow_rollover}
                        onChange={(value) => setForm({ ...form, allow_rollover: value })}
                      />
                      <SwitchField
                        label="Sessões expiram"
                        checked={form.sessions_expire}
                        onChange={(value) => setForm({ ...form, sessions_expire: value })}
                      />
                    </div>
                    {form.sessions_expire && (
                      <Field label="Validade das sessões (dias)">
                        <Input
                          className="max-w-xs"
                          type="number"
                          min={1}
                          value={form.session_validity_days ?? ""}
                          onChange={(event) =>
                            setForm({
                              ...form,
                              session_validity_days: nullableNumber(event.target.value),
                            })
                          }
                        />
                      </Field>
                    )}
                  </div>
                )}
                {step === 5 && (
                  <div className="space-y-5">
                    <StepHeading
                      title="Valores"
                      description="Configure preço, periodicidade, descontos, cupons e taxa de adesão."
                    />
                    <div className="grid gap-4 md:grid-cols-2">
                      <Field label="Valor da assinatura">
                        <CurrencyInput
                          value={form.price}
                          onChange={(value) => setForm({ ...form, price: value })}
                        />
                      </Field>
                      <Field label="Periodicidade">
                        <select
                          className={selectClassName()}
                          value={form.billing_cycle}
                          onChange={(event) =>
                            setForm({ ...form, billing_cycle: event.target.value })
                          }
                        >
                          <option value="monthly">Mensal</option>
                          <option value="biweekly">Quinzenal</option>
                          <option value="weekly">Semanal</option>
                          <option value="yearly">Anual</option>
                          <option value="one_time">Pagamento único</option>
                        </select>
                      </Field>
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      <SwitchField
                        label="Permitir desconto"
                        checked={form.discount_allowed}
                        onChange={(value) => setForm({ ...form, discount_allowed: value })}
                      />
                      <SwitchField
                        label="Permitir cupom"
                        checked={form.coupon_allowed}
                        onChange={(value) => setForm({ ...form, coupon_allowed: value })}
                      />
                      <SwitchField
                        label="Cobrar taxa de adesão"
                        checked={form.enrollment_fee_allowed}
                        onChange={(value) => setForm({ ...form, enrollment_fee_allowed: value })}
                      />
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      {form.discount_allowed && (
                        <Field label="Valor máximo de desconto">
                          <CurrencyInput
                            value={form.discount_value}
                            onChange={(value) => setForm({ ...form, discount_value: value })}
                          />
                        </Field>
                      )}
                      {form.enrollment_fee_allowed && (
                        <Field label="Valor da adesão">
                          <CurrencyInput
                            value={form.enrollment_fee}
                            onChange={(value) => setForm({ ...form, enrollment_fee: value })}
                          />
                        </Field>
                      )}
                    </div>
                  </div>
                )}
                {step === 6 && (
                  <div className="space-y-5">
                    <StepHeading
                      title="Agendamento online"
                      description="Escolha o que o assinante verá e como serviços extras serão tratados."
                    />
                    <div className="grid gap-3 md:grid-cols-2">
                      <SwitchField
                        label="Exibir nome da assinatura"
                        checked={form.booking_show_name}
                        onChange={(value) => setForm({ ...form, booking_show_name: value })}
                      />
                      <SwitchField
                        label="Exibir benefícios"
                        checked={form.booking_show_benefits}
                        onChange={(value) => setForm({ ...form, booking_show_benefits: value })}
                      />
                      <SwitchField
                        label="Exibir sessões restantes"
                        checked={form.booking_show_remaining}
                        onChange={(value) => setForm({ ...form, booking_show_remaining: value })}
                      />
                      <SwitchField
                        label="Exibir validade"
                        checked={form.booking_show_validity}
                        onChange={(value) => setForm({ ...form, booking_show_validity: value })}
                      />
                      <SwitchField
                        label="Exibir desconto disponível"
                        checked={form.booking_show_discount}
                        onChange={(value) => setForm({ ...form, booking_show_discount: value })}
                      />
                      <SwitchField
                        label="Agendar somente serviços incluídos"
                        checked={form.included_services_only}
                        onChange={(value) => setForm({ ...form, included_services_only: value })}
                      />
                      <SwitchField
                        label="Permitir serviços extras"
                        description="O excedente será cobrado na comanda."
                        checked={form.allow_extras}
                        onChange={(value) => setForm({ ...form, allow_extras: value })}
                      />
                    </div>
                  </div>
                )}
                {step === 7 && (
                  <div className="space-y-5">
                    <StepHeading
                      title="Financeiro"
                      description="Mapeie a receita e defina como a cobrança será gerada e baixada."
                    />
                    <div className="grid gap-4 md:grid-cols-2">
                      <Field label="Categoria financeira">
                        <select
                          className={selectClassName()}
                          value={form.financial_category_id ?? ""}
                          onChange={(event) =>
                            setForm({ ...form, financial_category_id: event.target.value || null })
                          }
                        >
                          <option value="">Categoria padrão de Assinaturas</option>
                          {data?.categories.map((item) => (
                            <option key={item.id} value={item.id}>
                              {item.name}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <Field label="Conta financeira">
                        <select
                          className={selectClassName()}
                          value={form.financial_account_id ?? ""}
                          onChange={(event) =>
                            setForm({ ...form, financial_account_id: event.target.value || null })
                          }
                        >
                          <option value="">Conta padrão</option>
                          {data?.accounts.map((item) => (
                            <option key={item.id} value={item.id}>
                              {item.name}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <Field label="Centro de custo">
                        <Input
                          value={form.cost_center ?? ""}
                          onChange={(event) =>
                            setForm({ ...form, cost_center: event.target.value })
                          }
                          placeholder="Ex.: Comercial / Assinaturas"
                        />
                      </Field>
                      <Field label="Modelo de cobrança">
                        <select
                          className={selectClassName()}
                          value={form.billing_mode}
                          onChange={(event) =>
                            setForm({ ...form, billing_mode: event.target.value })
                          }
                        >
                          <option value="recurring">Cobrança recorrente</option>
                          <option value="manual">Cobrança manual</option>
                        </select>
                      </Field>
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      <SwitchField
                        label="Integração com PIX"
                        checked={form.pix_enabled}
                        onChange={(value) => setForm({ ...form, pix_enabled: value })}
                      />
                      <SwitchField
                        label="Renovação automática"
                        checked={form.automatic_renewal}
                        onChange={(value) => setForm({ ...form, automatic_renewal: value })}
                      />
                      <SwitchField
                        label="Notificações automáticas"
                        checked={form.automatic_notifications}
                        onChange={(value) => setForm({ ...form, automatic_notifications: value })}
                      />
                    </div>
                    <Alert>
                      <ShieldCheck className="h-4 w-4" />
                      <AlertTitle>Fluxo financeiro configurado</AlertTitle>
                      <AlertDescription>
                        Ao vincular um cliente, o sistema gera a cobrança em Contas a Receber.
                        Quando ela for baixada manualmente, o valor entra no Caixa, na receita
                        recorrente e na DRE.
                      </AlertDescription>
                    </Alert>
                  </div>
                )}
              </div>
            </ScrollArea>
          </div>
          <DialogFooter className="border-t px-6 py-4">
            <div className="flex w-full justify-between">
              <Button variant="ghost" onClick={step === 1 ? close : () => setStep(step - 1)}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                {step === 1 ? "Cancelar" : "Voltar"}
              </Button>
              {step < 7 ? (
                <Button onClick={() => canContinue() && setStep(step + 1)}>
                  Continuar
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              ) : (
                <Button onClick={() => void save()} disabled={busy}>
                  {busy ? "Salvando..." : plan ? "Salvar alterações" : "Criar assinatura"}
                  <Check className="ml-2 h-4 w-4" />
                </Button>
              )}
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ImageCropDialog
        file={cropSource}
        aspect={4 / 3}
        outputWidth={1200}
        onCancel={() => setCropSource(null)}
        onConfirm={(croppedFile) => {
          setImageFile(croppedFile);
          setCropSource(null);
        }}
      />
    </>
  );
}

function ContractDialog({
  open,
  tenantId,
  data,
  onClose,
  onSaved,
}: {
  open: boolean;
  tenantId?: string;
  data?: ModuleData;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [clientId, setClientId] = useState("");
  const [planId, setPlanId] = useState("");
  const [startsAt, setStartsAt] = useState(today);
  const [nextDueAt, setNextDueAt] = useState(today);
  const [endsAt, setEndsAt] = useState("");
  const [cpf, setCpf] = useState("");
  const [price, setPrice] = useState(0);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const plan = data?.plans.find((item) => item.id === planId);

  function choosePlan(id: string) {
    setPlanId(id);
    const selected = data?.plans.find((item) => item.id === id);
    if (selected) setPrice(Number(selected.price));
  }

  function chooseClient(id: string) {
    setClientId(id);
    const selected = data?.clients.find((item) => item.id === id);
    setCpf(selected?.cpf ?? "");
  }

  async function save() {
    const client = data?.clients.find((item) => item.id === clientId);
    if (!tenantId || !client || !plan) return toast.error("Selecione o cliente e o plano.");
    const cleanCpf = cpf.replace(/\D/g, "");
    if (cleanCpf.length !== 11)
      return toast.error("Informe um CPF válido para o reconhecimento no agendamento online.");
    if (!Number.isFinite(price) || price < 0) return toast.error("Informe um valor válido.");
    const enrollmentFee = plan.enrollment_fee_allowed ? Number(plan.enrollment_fee || 0) : 0;
    const firstChargeAmount = price + enrollmentFee;
    const requiresPayment = firstChargeAmount > 0;
    if (requiresPayment && !nextDueAt)
      return toast.error("Informe o vencimento da primeira cobrança.");
    setBusy(true);
    const payload = {
      tenant_id: tenantId,
      plan_id: plan.id,
      client_id: client.id,
      subscriber_name: client.full_name,
      cpf: cleanCpf,
      whatsapp: client.whatsapp,
      status: requiresPayment ? "pending_activation" : "active",
      starts_at: startsAt,
      ends_at:
        endsAt ||
        (plan.model === "fixed_period" && plan.duration_days
          ? new Date(new Date(`${startsAt}T12:00:00`).getTime() + plan.duration_days * 86400000)
              .toISOString()
              .slice(0, 10)
          : null),
      next_due_at: nextDueAt || null,
      price,
      enrollment_fee: enrollmentFee,
      sessions_total: plan.session_limit,
      sessions_used: 0,
      sessions_remaining: requiresPayment ? 0 : plan.session_limit,
      auto_renew: plan.automatic_renewal,
      notes: notes || null,
    };
    const contractResult = await db
      .from("client_subscriptions")
      .insert(payload)
      .select("id")
      .single();
    if (contractResult.error) {
      setBusy(false);
      return toast.error(contractResult.error.message);
    }

    const rollbackContract = async () =>
      db
        .from("client_subscriptions")
        .delete()
        .eq("id", contractResult.data.id)
        .eq("tenant_id", tenantId);

    if (requiresPayment) {
      const charge = await db.from("subscription_charges").insert({
        tenant_id: tenantId,
        subscription_id: contractResult.data.id,
        client_id: client.id,
        amount: firstChargeAmount,
        due_date: nextDueAt,
        status: nextDueAt < today ? "overdue" : "pending",
        billing_period_start: startsAt,
        billing_period_end: endsAt || null,
        description:
          enrollmentFee > 0
            ? `Assinatura · ${plan.name} · inclui taxa de adesão`
            : `Assinatura · ${plan.name}`,
      });
      if (charge.error) {
        const rollback = await rollbackContract();
        setBusy(false);
        return toast.error(
          rollback.error
            ? `A cobrança falhou e o contrato não pôde ser desfeito: ${charge.error.message}`
            : `A cobrança falhou e o contrato foi desfeito: ${charge.error.message}`,
        );
      }
    }

    const clientResult = await db
      .from("clients")
      .update({ cpf: cleanCpf, is_subscriber: true })
      .eq("id", client.id)
      .eq("tenant_id", tenantId)
      .select("id")
      .maybeSingle();
    if (clientResult.error || !clientResult.data) {
      setBusy(false);
      return toast.error(
        `Contrato e cobrança criados, mas não foi possível atualizar o cadastro do cliente: ${clientResult.error?.message ?? "registro não encontrado"}`,
      );
    }

    setBusy(false);
    toast.success(
      requiresPayment
        ? "Cliente vinculado. A assinatura será ativada após a confirmação do pagamento."
        : "Cliente vinculado. Assinatura gratuita ativada.",
    );
    onSaved();
  }

  return (
    <Dialog open={open} onOpenChange={(value) => !value && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Vincular cliente a uma assinatura</DialogTitle>
          <DialogDescription>Crie o contrato e a primeira cobrança financeira.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2 md:grid-cols-2">
          <Field label="Cliente">
            <select
              className={selectClassName()}
              value={clientId}
              onChange={(event) => chooseClient(event.target.value)}
            >
              <option value="">Selecione...</option>
              {data?.clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.full_name} {client.whatsapp ? `· ${client.whatsapp}` : ""}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Assinatura">
            <select
              className={selectClassName()}
              value={planId}
              onChange={(event) => choosePlan(event.target.value)}
            >
              <option value="">Selecione...</option>
              {data?.plans
                .filter((item) => item.status === "active")
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} · {brl(item.price)}
                  </option>
                ))}
            </select>
          </Field>
          <Field label="Início">
            <Input
              type="date"
              value={startsAt}
              onChange={(event) => setStartsAt(event.target.value)}
            />
          </Field>
          <Field label="Próximo vencimento">
            <Input
              type="date"
              value={nextDueAt}
              onChange={(event) => setNextDueAt(event.target.value)}
            />
          </Field>
          <Field label="CPF do assinante">
            <Input
              value={cpfMask(cpf)}
              onChange={(event) => setCpf(event.target.value)}
              placeholder="000.000.000-00"
            />
          </Field>
          <Field label="Fim do contrato (opcional)">
            <Input type="date" value={endsAt} onChange={(event) => setEndsAt(event.target.value)} />
          </Field>
          <Field label="Valor contratado">
            <Input
              type="number"
              min={0}
              step="0.01"
              value={price}
              onChange={(event) => setPrice(Number(event.target.value))}
            />
          </Field>
          <div className="md:col-span-2">
            <Field label="Observações">
              <Textarea value={notes} onChange={(event) => setNotes(event.target.value)} />
            </Field>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={() => void save()} disabled={busy}>
            {busy ? "Salvando..." : "Criar contrato"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ManualUsageDialog({
  open,
  data,
  onClose,
  onSaved,
}: {
  open: boolean;
  data?: ModuleData;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [contractId, setContractId] = useState("");
  const [benefitId, setBenefitId] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [professionalId, setProfessionalId] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const contract = data?.contracts.find((item) => item.id === contractId);
  const benefits =
    data?.benefits.filter((item) => item.plan_id === contract?.plan_id && item.active) ?? [];

  function chooseBenefit(id: string) {
    setBenefitId(id);
    const benefit = benefits.find((item) => item.id === id);
    setServiceId(benefit?.service_id ?? "");
  }

  async function save() {
    if (!contractId) return toast.error("Selecione o assinante.");
    setBusy(true);
    const { error } = await db.rpc("register_subscription_usage", {
      p_subscription_id: contractId,
      p_benefit_id: benefitId || null,
      p_service_id: serviceId || null,
      p_professional_id: professionalId || null,
      p_quantity: quantity,
      p_used_at: new Date().toISOString(),
      p_notes: notes || null,
      p_source: "manual",
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Utilização registrada e saldo atualizado.");
    onSaved();
  }

  return (
    <Dialog open={open} onOpenChange={(value) => !value && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Registrar utilização</DialogTitle>
          <DialogDescription>
            Use para ajustes manuais. O fechamento de comandas consome o benefício automaticamente.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Field label="Cliente assinante">
            <select
              className={selectClassName()}
              value={contractId}
              onChange={(event) => {
                setContractId(event.target.value);
                setBenefitId("");
                setServiceId("");
              }}
            >
              <option value="">Selecione...</option>
              {data?.contracts
                .filter((item) => item.status === "active")
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.subscriber_name} · saldo {item.sessions_remaining ?? "ilimitado"}
                  </option>
                ))}
            </select>
          </Field>
          <Field label="Benefício">
            <select
              className={selectClassName()}
              value={benefitId}
              onChange={(event) => chooseBenefit(event.target.value)}
            >
              <option value="">Utilização geral</option>
              {benefits.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Profissional">
              <select
                className={selectClassName()}
                value={professionalId}
                onChange={(event) => setProfessionalId(event.target.value)}
              >
                <option value="">Não informado</option>
                {data?.professionals.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.full_name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Quantidade">
              <Input
                type="number"
                min={1}
                value={quantity}
                onChange={(event) => setQuantity(Number(event.target.value))}
              />
            </Field>
          </div>
          <Field label="Observações">
            <Textarea value={notes} onChange={(event) => setNotes(event.target.value)} />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={() => void save()} disabled={busy}>
            {busy ? "Registrando..." : "Registrar utilização"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ContractDetailDialog({
  contract,
  data,
  onClose,
  onRefresh,
  onPix,
}: {
  contract: Contract | null;
  data?: ModuleData;
  onClose: () => void;
  onRefresh: () => void;
  onPix: (charge: any) => void;
}) {
  const [busyChargeId, setBusyChargeId] = useState<string | null>(null);
  const plan = data?.plans.find((item) => item.id === contract?.plan_id);
  const usages = data?.usages.filter((item) => item.subscription_id === contract?.id) ?? [];
  const charges = data?.charges.filter((item) => item.subscription_id === contract?.id) ?? [];
  const pendingCharge = contract ? findOpenCharge(charges, contract.id) : null;
  const received = charges
    .filter((item) => item.status === "paid")
    .reduce((sum, item) => sum + Number(item.amount), 0);

  async function updateStatus(status: string) {
    if (!contract) return;
    const payload: any = { status };
    if (status === "canceled") payload.canceled_at = new Date().toISOString();
    if (status === "suspended") payload.suspended_at = new Date().toISOString();
    const { error } = await db.from("client_subscriptions").update(payload).eq("id", contract.id);
    if (error) return toast.error(error.message);
    toast.success("Situação atualizada.");
    onRefresh();
    onClose();
  }

  async function markPaid(charge: any) {
    setBusyChargeId(charge.id);
    try {
      if (await confirmSubscriptionPayment(charge)) {
        onRefresh();
        onClose();
      }
    } finally {
      setBusyChargeId(null);
    }
  }

  async function rejectProof(charge: any) {
    setBusyChargeId(charge.id);
    try {
      if (await rejectSubscriptionProof(charge)) {
        onRefresh();
        onClose();
      }
    } finally {
      setBusyChargeId(null);
    }
  }

  return (
    <Dialog open={!!contract} onOpenChange={(value) => !value && onClose()}>
      <DialogContent className="max-h-[92vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{contract?.subscriber_name}</DialogTitle>
          <DialogDescription>
            {plan?.name} · contratado em {dateLabel(contract?.starts_at)}
          </DialogDescription>
        </DialogHeader>
        {contract && (
          <div className="space-y-6">
            <div className="flex flex-wrap gap-2">
              {pendingCharge && (
                <Button
                  size="sm"
                  onClick={() => void markPaid(pendingCharge)}
                  disabled={busyChargeId === pendingCharge.id}
                >
                  <Check className="mr-1 h-4 w-4" />
                  {busyChargeId === pendingCharge.id ? "Confirmando..." : "Declarar pago"}
                </Button>
              )}
              {pendingCharge?.proof_storage_path && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void viewSubscriptionProof(pendingCharge)}
                >
                  <FileText className="mr-1 h-4 w-4" />
                  Ver comprovante
                </Button>
              )}
              {isProofPending(pendingCharge) && (
                <Button
                  size="sm"
                  variant="outline"
                  className="text-red-600"
                  onClick={() => void rejectProof(pendingCharge)}
                  disabled={busyChargeId === pendingCharge.id}
                >
                  Recusar comprovante
                </Button>
              )}
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  notifySubscriptionClient(contract, plan, pendingCharge, data?.settings)
                }
              >
                <MessageCircle className="mr-1 h-4 w-4" />
                Notificar
              </Button>
              {pendingCharge && (
                <Button size="sm" variant="outline" onClick={() => onPix(pendingCharge)}>
                  Gerar PIX
                </Button>
              )}
              <Button size="sm" variant="outline" onClick={() => void updateStatus("suspended")}>
                Suspender
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="text-red-600"
                onClick={() => void updateStatus("canceled")}
              >
                Cancelar
              </Button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <SmallStat
                label="Situação"
                value={statusLabels[contract.status] ?? contract.status}
              />
              <SmallStat
                label="Próximo vencimento"
                value={`${dateLabel(
                  pendingCharge?.due_date ?? contract.next_due_at,
                )} · ${dueDateInfo(pendingCharge?.due_date ?? contract.next_due_at).label}`}
              />
              <SmallStat label="Receita gerada" value={brl(received)} />
              <SmallStat
                label="Sessões restantes"
                value={contract.sessions_remaining?.toString() ?? "Ilimitado"}
              />
            </div>
            <Tabs defaultValue="usage">
              <TabsList>
                <TabsTrigger value="usage">Utilizações</TabsTrigger>
                <TabsTrigger value="finance">Financeiro</TabsTrigger>
                <TabsTrigger value="notes">Observações</TabsTrigger>
              </TabsList>
              <TabsContent value="usage" className="mt-4 space-y-2">
                {usages.map((usage) => (
                  <div
                    key={usage.id}
                    className="flex justify-between rounded-xl border p-3 text-sm"
                  >
                    <div>
                      <strong>
                        {data?.services.find((item) => item.id === usage.service_id)?.name ??
                          data?.benefits.find((item) => item.id === usage.benefit_id)?.name ??
                          "Utilização"}
                      </strong>
                      <p className="text-xs text-muted-foreground">
                        {new Date(usage.used_at).toLocaleString("pt-BR")}
                      </p>
                    </div>
                    <span>{usage.quantity} sessão(ões)</span>
                  </div>
                ))}
                {!usages.length && <EmptyLine text="Sem utilizações." />}
              </TabsContent>
              <TabsContent value="finance" className="mt-4 space-y-2">
                {charges.map((charge) => (
                  <div
                    key={charge.id}
                    className="flex flex-col gap-3 rounded-xl border p-3 text-sm sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div>
                      <strong>{charge.description ?? "Cobrança"}</strong>
                      <div className="mt-1">
                        <ChargeDateIndicator charge={charge} />
                      </div>
                      <div className="mt-2">
                        <ProofStatusBadge charge={charge} />
                      </div>
                      {charge.proof_status === "rejected" && charge.proof_rejection_reason && (
                        <p className="mt-1 text-xs text-red-600">{charge.proof_rejection_reason}</p>
                      )}
                    </div>
                    <div className="space-y-2 sm:text-right">
                      <div>
                        <strong>{brl(charge.amount)}</strong>
                        <Badge variant="outline" className={`ml-2 ${statusClass(charge.status)}`}>
                          {statusLabels[charge.status]}
                        </Badge>
                      </div>
                      <div className="flex flex-wrap justify-end gap-2">
                        {charge.proof_storage_path && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => void viewSubscriptionProof(charge)}
                          >
                            <FileText className="mr-1 h-4 w-4" />
                            Ver comprovante
                          </Button>
                        )}
                        {isOpenCharge(charge) && (
                          <Button
                            size="sm"
                            onClick={() => void markPaid(charge)}
                            disabled={busyChargeId === charge.id}
                          >
                            <Check className="mr-1 h-4 w-4" />
                            Declarar pago
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
                {!charges.length && <EmptyLine text="Sem cobranças." />}
              </TabsContent>
              <TabsContent value="notes" className="mt-4">
                <div className="rounded-xl border bg-muted/20 p-4 text-sm whitespace-pre-wrap">
                  {contract.notes || "Nenhuma observação cadastrada."}
                </div>
              </TabsContent>
            </Tabs>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ChargePixDialog({
  charge,
  tenant,
  data,
  onClose,
}: {
  charge: any | null;
  tenant: any;
  data?: ModuleData;
  onClose: () => void;
}) {
  const contract = data?.contracts.find((item) => item.id === charge?.subscription_id);
  const key = String(tenant?.pix_key || "").trim();
  const amount = Number(charge?.amount ?? 0);
  let payload = "";
  if (charge && key) {
    try {
      payload = buildPixPayload({
        key,
        merchant: String(tenant?.pix_holder || tenant?.name || "SALAO").slice(0, 25),
        city: String(tenant?.city || "SAO PAULO").slice(0, 15),
        amount,
        txid: String(charge.id)
          .replace(/[^a-zA-Z0-9]/g, "")
          .slice(0, 25),
      });
    } catch {
      payload = "";
    }
  }
  return (
    <Dialog open={!!charge} onOpenChange={(value) => !value && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>PIX da assinatura</DialogTitle>
          <DialogDescription>
            {contract?.subscriber_name} · vencimento {dateLabel(charge?.due_date)}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 text-center">
          <div className="text-3xl font-semibold text-amber-600">{brl(amount)}</div>
          {payload ? (
            <div className="flex justify-center">
              <QrCode value={payload} size={220} />
            </div>
          ) : (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Cadastre uma chave PIX válida nas configurações do salão.
              </AlertDescription>
            </Alert>
          )}
          <Button
            className="w-full"
            disabled={!payload}
            onClick={() => {
              void navigator.clipboard.writeText(payload);
              toast.success("Código PIX copiado.");
            }}
          >
            <Copy className="mr-2 h-4 w-4" />
            Copiar código PIX
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function MetricCard({
  label,
  value,
  detail,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string;
  detail: string;
  icon: any;
  tone: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-start justify-between p-5">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {label}
          </p>
          <p className="mt-2 text-2xl font-semibold">{value}</p>
          <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
        </div>
        <div className={`rounded-xl p-2.5 ${tone}`}>
          <Icon className="h-5 w-5" />
        </div>
      </CardContent>
    </Card>
  );
}

function SmallStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border bg-muted/20 p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 font-semibold">{value}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function CurrencyInput({
  value,
  onChange,
}: {
  value: number | null | undefined;
  onChange: (value: number) => void;
}) {
  return (
    <Input
      type="text"
      inputMode="numeric"
      autoComplete="off"
      value={brl(value)}
      onChange={(event) => {
        const digits = event.target.value.replace(/\D/g, "").slice(0, 14);
        onChange(Number(digits || "0") / 100);
        const input = event.currentTarget;
        requestAnimationFrame(() => {
          const end = input.value.length;
          input.setSelectionRange(end, end);
        });
      }}
      onFocus={(event) => {
        const input = event.currentTarget;
        requestAnimationFrame(() => {
          const end = input.value.length;
          input.setSelectionRange(end, end);
        });
      }}
      aria-label="Valor em reais"
    />
  );
}

function SwitchField({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border p-4">
      <div>
        <div className="text-sm font-medium">{label}</div>
        {description && <div className="mt-1 text-xs text-muted-foreground">{description}</div>}
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

function StepHeading({ title, description }: { title: string; description: string }) {
  return (
    <div>
      <h3 className="text-xl font-semibold">{title}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

function EmptyLine({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
      {text}
    </div>
  );
}

function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  onAction,
}: {
  icon: any;
  title: string;
  description: string;
  action: string;
  onAction: () => void;
}) {
  return (
    <Card className="md:col-span-2 xl:col-span-3">
      <CardContent className="flex flex-col items-center p-12 text-center">
        <div className="mb-4 rounded-2xl bg-amber-50 p-4 text-amber-600">
          <Icon className="h-7 w-7" />
        </div>
        <h3 className="font-semibold">{title}</h3>
        <p className="mt-1 max-w-md text-sm text-muted-foreground">{description}</p>
        <Button className="mt-5" onClick={onAction}>
          <Plus className="mr-2 h-4 w-4" />
          {action}
        </Button>
      </CardContent>
    </Card>
  );
}

import { createFileRoute, redirect, useNavigate, Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  createTenant,
  setTenantStatus,
  getTenantOwner,
  updateTenant,
} from "@/lib/tenants.functions";
import {
  ShieldCheck,
  Plus,
  Search,
  TrendingUp,
  Building2,
  DollarSign,
  Database,
  Terminal,
  Settings2,
  Pencil,
  Trash2,
  ExternalLink,
  Server,
  MessageCircle,
  Save,
  Send,
  RefreshCw,
  Clock3,
} from "lucide-react";
import { useState, useMemo, useEffect, type ReactNode } from "react";
import { toast } from "sonner";
import { dateBR, brl } from "@/lib/format";
import { validateProjectPassword } from "@/lib/password-policy";
import { normalizeWhatsAppFormatting } from "@/lib/whatsapp-format";
import { getPublicBookingUrl } from "@/lib/public-booking-url";
import { PlatformBillingTab } from "@/components/saas/platform-billing";
import { PlatformWhatsAppSettings } from "@/components/whatsapp/platform-whatsapp-settings";

const whatsappTemplateFields = [
  { key: "client_registration_template", title: "Novo cadastro", label: "Mensagem para o cliente" },
  { key: "client_booking_template", title: "Novo agendamento", label: "Mensagem para o cliente" },
  {
    key: "professional_booking_template",
    title: "Novo agendamento",
    label: "Mensagem para o profissional",
  },
  { key: "client_reminder_template", title: "Lembrete", label: "Mensagem para o cliente" },
  { key: "client_cancellation_template", title: "Cancelamento", label: "Mensagem para o cliente" },
  {
    key: "professional_cancellation_template",
    title: "Cancelamento",
    label: "Mensagem para o profissional",
  },
  { key: "client_reschedule_template", title: "Reagendamento", label: "Mensagem para o cliente" },
  {
    key: "professional_reschedule_template",
    title: "Reagendamento",
    label: "Mensagem para o profissional",
  },
  {
    key: "subscription_payment_reminder_template",
    title: "Assinaturas",
    label: "Lembrete de pagamento",
  },
  {
    key: "subscription_payment_confirmation_template",
    title: "Assinaturas",
    label: "Pagamento confirmado",
  },
  { key: "subscription_overdue_template", title: "Assinaturas", label: "Aviso de inadimplência" },
] as const;

type WhatsappTemplateKey = (typeof whatsappTemplateFields)[number]["key"];
type WhatsappTemplateForm = Record<WhatsappTemplateKey, string>;

type WhatsappSubscriptionRules = {
  subscription_payment_reminder_enabled: boolean;
  subscription_payment_reminder_days_before: number[];
  subscription_payment_confirmation_enabled: boolean;
  subscription_overdue_enabled: boolean;
  subscription_overdue_days_after: number[];
  subscription_notification_time: string;
};

const defaultWhatsappSubscriptionRules: WhatsappSubscriptionRules = {
  subscription_payment_reminder_enabled: false,
  subscription_payment_reminder_days_before: [3, 1, 0],
  subscription_payment_confirmation_enabled: false,
  subscription_overdue_enabled: false,
  subscription_overdue_days_after: [1, 3, 7],
  subscription_notification_time: "09:00",
};

const defaultWhatsappTemplates: WhatsappTemplateForm = {
  client_registration_template: `🎉 *Tudo pronto, {cliente}!*

Seu cadastro no(a) *{salao}* foi confirmado com sucesso.

Agora você pode acessar com seu *CPF* e *senha* para agendar com mais rapidez.

✨ Esperamos por você em breve!`,
  client_booking_template: `🎉 *Agendamento confirmado, {cliente}!*

Seu atendimento no(a) *{salao}* está reservado.

📅 *Data:* {data}
🕒 *Horário:* {hora}
👤 *Profissional:* {profissional}
💼 *Serviço:* {servico}

Para cancelar: {link_cancelamento}`,
  professional_booking_template: `📅 *Olá, {profissional}! Você recebeu um novo agendamento.*

👤 *Cliente:* {cliente}
💼 *Serviço:* {servico}
📆 *Data:* {data}
🕒 *Horário:* {hora}

✨ Desejamos um excelente atendimento!`,
  client_reminder_template: `⏰ *Olá, {cliente}! Este é um lembrete do seu agendamento.*

Seu atendimento no(a) *{salao}* está se aproximando!

📅 *Data:* {data}
🕒 *Horário:* {hora}
👤 *Profissional:* {profissional}
💼 *Serviço:* {servico}

✨ Estamos preparando tudo para receber você. Até breve!`,
  client_cancellation_template: `📢 *Olá, {cliente}.*

Seu agendamento no(a) *{salao}*, previsto para *{data}* às *{hora}*, foi cancelado.

Se desejar, você pode realizar um novo agendamento.`,
  professional_cancellation_template: `📅 *Olá, {profissional}.*

O agendamento de *{cliente}*, previsto para *{data}* às *{hora}*, foi cancelado.

✅ Sua agenda foi atualizada automaticamente.`,
  client_reschedule_template: `📅 *Olá, {cliente}! Seu agendamento foi atualizado.*

Confira os novos detalhes no(a) *{salao}*:

📅 *Data:* {data}
🕒 *Horário:* {hora}
👤 *Profissional:* {profissional}
💼 *Serviço:* {servico}`,
  professional_reschedule_template: `📅 *Olá, {profissional}! Houve uma atualização em sua agenda.*

👤 *Cliente:* {cliente}
💼 *Serviço:* {servico}
📅 *Data:* {data}
🕒 *Horário:* {hora}

✅ Sua agenda já foi atualizada automaticamente.`,
  subscription_payment_reminder_template: `🔔 *Olá, {cliente}!*

Sua assinatura *{plano}* no(a) *{salao}* vence em *{vencimento}*.

💳 *Valor:* {valor}

Se você já realizou o pagamento, desconsidere esta mensagem.`,
  subscription_payment_confirmation_template: `✅ *Pagamento confirmado, {cliente}!*

Recebemos *{valor}* referente à sua assinatura *{plano}* no(a) *{salao}*.

📅 *Próximo vencimento:* {proximo_vencimento}

Obrigado pela confiança!`,
  subscription_overdue_template: `⚠️ *Olá, {cliente}.*

Identificamos uma pendência na assinatura *{plano}* no(a) *{salao}*.

📅 *Vencimento:* {vencimento}
💳 *Valor:* {valor}
⏳ *Atraso:* {dias_atraso} dia(s)

Entre em contato com o salão para regularizar.`,
};

const whatsappTemplateColumns = [
  "id",
  ...whatsappTemplateFields.map((field) => field.key),
  ...Object.keys(defaultWhatsappSubscriptionRules),
  "updated_at",
].join(",");

const tenantWhatsappTemplateColumns = [
  "tenant_id",
  "message_templates_source",
  ...whatsappTemplateFields.map((field) => field.key),
  ...Object.keys(defaultWhatsappSubscriptionRules),
].join(",");

export const Route = createFileRoute("/saas")({
  ssr: false,
  beforeLoad: async () => {
    const { data: userRes } = await supabase.auth.getUser();
    if (!userRes.user) throw redirect({ to: "/saas-login" });
    const { data } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userRes.user.id)
      .eq("role", "super_admin");
    if (!data || data.length === 0) throw redirect({ to: "/app" });
    return {};
  },
  component: SaasPanel,
});

function SaasPanel() {
  const nav = useNavigate();
  const qc = useQueryClient();
  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    nav({ to: "/saas-login" });
  }
  const { data: user } = useQuery({
    queryKey: ["saas-user"],
    queryFn: async () => (await supabase.auth.getUser()).data.user,
  });
  const displayName =
    (user?.user_metadata?.full_name as string) || user?.email?.split("@")[0] || "Super Admin";

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b">
        <div className="max-w-[1600px] mx-auto px-6 py-4 flex items-center gap-4">
          <div className="h-12 w-12 rounded-xl bg-indigo-100 flex items-center justify-center">
            <ShieldCheck className="h-6 w-6 text-indigo-600" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h1 className="font-bold text-lg text-slate-900">
                Central Administrativa LinkUp Studio
              </h1>
              <span className="text-[10px] font-bold bg-indigo-600 text-white px-2 py-0.5 rounded">
                MATRIZ
              </span>
            </div>
            <p className="text-xs text-slate-500">
              Gestão de clientes, cobranças e operações da plataforma
            </p>
          </div>
          <div className="text-right">
            <div className="font-semibold text-slate-900 capitalize">{displayName}</div>
            <span className="inline-block mt-0.5 text-[10px] font-bold text-indigo-700 bg-indigo-100 px-2 py-0.5 rounded">
              SUPER ADMINISTRATOR
            </span>
          </div>
          <div className="flex flex-col gap-1">
            <Link
              to="/app"
              className="text-xs px-3 py-1.5 rounded-md border border-slate-300 hover:bg-slate-50 text-center"
            >
              Ir para meu app
            </Link>
            <button
              onClick={signOut}
              className="text-xs px-3 py-1.5 rounded-md border border-slate-300 hover:bg-slate-50"
            >
              Mudar de Usuário / Sair
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-[1600px] mx-auto px-6 py-6">
        <Tabs
          defaultValue="dashboard"
          orientation="vertical"
          className="grid items-start gap-6 lg:grid-cols-[250px_minmax(0,1fr)]"
        >
          <TabsList className="sticky top-6 grid h-auto grid-cols-2 gap-1 border bg-white p-2 shadow-sm lg:grid-cols-1">
            <TabsTrigger
              value="dashboard"
              className="w-full justify-start data-[state=active]:bg-indigo-600 data-[state=active]:text-white px-3 py-2.5"
            >
              <TrendingUp className="h-4 w-4 mr-2" />
              Visão Geral
            </TabsTrigger>
            <TabsTrigger
              value="empresas"
              className="w-full justify-start data-[state=active]:bg-indigo-600 data-[state=active]:text-white px-3 py-2.5"
            >
              <Building2 className="h-4 w-4 mr-2" />
              Empresas / Clientes
            </TabsTrigger>
            <TabsTrigger
              value="whatsapp"
              className="w-full justify-start data-[state=active]:bg-indigo-600 data-[state=active]:text-white px-3 py-2.5"
            >
              <MessageCircle className="h-4 w-4 mr-2" />
              WhatsApp
            </TabsTrigger>
            <TabsTrigger
              value="financeiro"
              className="w-full justify-start data-[state=active]:bg-indigo-600 data-[state=active]:text-white px-3 py-2.5"
            >
              <DollarSign className="h-4 w-4 mr-2" />
              Financeiro & Cobranças
            </TabsTrigger>
            <TabsTrigger
              value="backups"
              className="w-full justify-start data-[state=active]:bg-indigo-600 data-[state=active]:text-white px-3 py-2.5"
            >
              <Database className="h-4 w-4 mr-2" />
              Backups de Segurança
            </TabsTrigger>
            <TabsTrigger
              value="logs"
              className="w-full justify-start data-[state=active]:bg-indigo-600 data-[state=active]:text-white px-3 py-2.5"
            >
              <Terminal className="h-4 w-4 mr-2" />
              Logs & Auditorias
            </TabsTrigger>
            <TabsTrigger
              value="dev"
              className="w-full justify-start data-[state=active]:bg-indigo-600 data-[state=active]:text-white px-3 py-2.5"
            >
              <Settings2 className="h-4 w-4 mr-2" />
              Painel Desenvolvedor
            </TabsTrigger>
          </TabsList>

          <div className="min-w-0">
            <TabsContent value="dashboard" className="m-0">
              <DashboardTab />
            </TabsContent>
            <TabsContent value="empresas" className="m-0">
              <EmpresasTab />
            </TabsContent>
            <TabsContent value="whatsapp" className="m-0">
              <WhatsAppAdminTab />
            </TabsContent>
            <TabsContent value="financeiro" className="m-0">
              <PlatformBillingTab />
            </TabsContent>
            <TabsContent value="backups" className="m-0">
              <SimpleCard
                title="Backups de Segurança"
                desc="Backups automáticos por tenant, exportação e restauração pontual."
              />
            </TabsContent>
            <TabsContent value="logs" className="m-0">
              <SimpleCard
                title="Logs & Auditorias"
                desc="Trilhas de auditoria de acesso, alterações e exportações por tenant."
              />
            </TabsContent>
            <TabsContent value="dev" className="m-0">
              <SimpleCard
                title="Painel Desenvolvedor"
                desc="Chaves de API, webhooks e diagnósticos técnicos por tenant."
              />
            </TabsContent>
          </div>
        </Tabs>
      </main>
    </div>
  );
}

function SimpleCard({ title, desc }: any) {
  return (
    <Card>
      <CardContent className="p-10 text-center">
        <Server className="h-10 w-10 text-slate-300 mx-auto mb-3" />
        <h3 className="font-semibold text-slate-900">{title}</h3>
        <p className="text-sm text-slate-500 mt-1">{desc}</p>
      </CardContent>
    </Card>
  );
}

type BillingDashboardContract = {
  status: string;
  amount_snapshot?: number | null;
  amount?: number | null;
  interval_months_snapshot?: number | null;
  interval_months?: number | null;
  billing_interval_months?: number | null;
};

type BillingDashboardCharge = {
  amount?: number | null;
  status: string;
  confirmed_at?: string | null;
  received_at?: string | null;
};

type BillingDashboardQueryResult = { data: unknown; error: unknown };
type BillingDashboardQuery = PromiseLike<BillingDashboardQueryResult> & {
  select(columns?: string): BillingDashboardQuery;
};

const billingDashboardDb = supabase as unknown as {
  from(table: string): BillingDashboardQuery;
};

function DashboardTab() {
  const { data: tenants } = useQuery({
    queryKey: ["all-tenants"],
    queryFn: async () => (await supabase.from("tenants").select("*")).data ?? [],
  });
  const { data: billing } = useQuery({
    queryKey: ["saas-billing-dashboard"],
    queryFn: async () => {
      const [contractsResponse, chargesResponse] = await Promise.all([
        billingDashboardDb.from("platform_billing_contracts").select("*"),
        billingDashboardDb
          .from("platform_billing_charges")
          .select("amount,status,confirmed_at,received_at"),
      ]);

      // A central continua utilizável antes da aplicação da migration, mas
      // nunca inventa receita: a ausência das tabelas financeiras resulta em zero.
      return {
        contracts: contractsResponse.error
          ? []
          : ((contractsResponse.data as BillingDashboardContract[] | null) ?? []),
        charges: chargesResponse.error
          ? []
          : ((chargesResponse.data as BillingDashboardCharge[] | null) ?? []),
      };
    },
    retry: false,
  });
  const active = (tenants ?? []).filter((tenant) => tenant.status === "active").length;
  const blocked = (tenants ?? []).filter((tenant) => tenant.status !== "active").length;
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const contractedMonthly = (billing?.contracts ?? [])
    .filter((contract) => ["trialing", "active", "past_due"].includes(contract.status))
    .reduce((total, contract) => {
      const amount = Number(contract.amount_snapshot ?? contract.amount ?? 0);
      const interval = Math.max(
        1,
        Number(
          contract.interval_months_snapshot ??
            contract.interval_months ??
            contract.billing_interval_months ??
            1,
        ),
      );
      return total + amount / interval;
    }, 0);
  const receivedThisMonth = (billing?.charges ?? [])
    .filter((charge) => {
      return (
        charge.status === "received" &&
        charge.received_at &&
        new Date(charge.received_at) >= monthStart
      );
    })
    .reduce((total, charge) => total + Number(charge.amount ?? 0), 0);
  const overdue = (billing?.charges ?? [])
    .filter((charge) => charge.status === "overdue")
    .reduce((total, charge) => total + Number(charge.amount ?? 0), 0);
  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Metric label="Empresas ativas" value={String(active)} tone="emerald" />
        <Metric label="Empresas bloqueadas" value={String(blocked)} tone="rose" />
        <Metric label="Receita contratada / mês" value={brl(contractedMonthly)} tone="indigo" />
        <Metric label="Recebido no mês" value={brl(receivedThisMonth)} tone="emerald" />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Metric
          label="Total de salões cadastrados"
          value={String(tenants?.length ?? 0)}
          tone="indigo"
        />
        <Metric label="Cobranças vencidas" value={brl(overdue)} tone="rose" />
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "emerald" | "rose" | "indigo" | "amber";
}) {
  const tones: Record<"emerald" | "rose" | "indigo" | "amber", string> = {
    emerald: "bg-emerald-50 text-emerald-700",
    rose: "bg-rose-50 text-rose-700",
    indigo: "bg-indigo-50 text-indigo-700",
    amber: "bg-amber-50 text-amber-700",
  };
  return (
    <Card>
      <CardContent className="p-5">
        <div
          className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded inline-block ${tones[tone]}`}
        >
          {label}
        </div>
        <div className="text-2xl font-bold mt-3 text-slate-900">{value}</div>
      </CardContent>
    </Card>
  );
}

function normalizeWhatsappTemplates(row?: Record<string, unknown> | null): WhatsappTemplateForm {
  const next = { ...defaultWhatsappTemplates };
  for (const field of whatsappTemplateFields) {
    const value = row?.[field.key];
    if (typeof value === "string" && value.trim()) {
      next[field.key] = normalizeWhatsAppFormatting(value);
    }
  }
  return next;
}

function normalizeDayOffsets(
  value: unknown,
  minimum: number,
  fallback: number[],
  direction: "asc" | "desc",
) {
  const source = Array.isArray(value) ? value : fallback;
  const unique = Array.from(
    new Set(
      source.map(Number).filter((day) => Number.isInteger(day) && day >= minimum && day <= 365),
    ),
  );
  const normalized = unique.length ? unique : fallback;
  return [...normalized].sort((left, right) => (direction === "asc" ? left - right : right - left));
}

function normalizeSubscriptionRules(
  row?: Record<string, unknown> | null,
): WhatsappSubscriptionRules {
  const time = String(
    row?.subscription_notification_time ??
      defaultWhatsappSubscriptionRules.subscription_notification_time,
  ).slice(0, 5);
  return {
    subscription_payment_reminder_enabled:
      typeof row?.subscription_payment_reminder_enabled === "boolean"
        ? row.subscription_payment_reminder_enabled
        : defaultWhatsappSubscriptionRules.subscription_payment_reminder_enabled,
    subscription_payment_reminder_days_before: normalizeDayOffsets(
      row?.subscription_payment_reminder_days_before,
      0,
      defaultWhatsappSubscriptionRules.subscription_payment_reminder_days_before,
      "desc",
    ),
    subscription_payment_confirmation_enabled:
      typeof row?.subscription_payment_confirmation_enabled === "boolean"
        ? row.subscription_payment_confirmation_enabled
        : defaultWhatsappSubscriptionRules.subscription_payment_confirmation_enabled,
    subscription_overdue_enabled:
      typeof row?.subscription_overdue_enabled === "boolean"
        ? row.subscription_overdue_enabled
        : defaultWhatsappSubscriptionRules.subscription_overdue_enabled,
    subscription_overdue_days_after: normalizeDayOffsets(
      row?.subscription_overdue_days_after,
      1,
      defaultWhatsappSubscriptionRules.subscription_overdue_days_after,
      "asc",
    ),
    subscription_notification_time: /^([01]\d|2[0-3]):[0-5]\d$/.test(time)
      ? time
      : defaultWhatsappSubscriptionRules.subscription_notification_time,
  };
}

function renderWhatsappTemplate(template: string, tenant?: any) {
  const variables: Record<string, string> = {
    cliente: "Cliente Teste",
    profissional: "Profissional Teste",
    salao: tenant?.name || "LinkUp Studio",
    servico: "Corte masculino",
    data: "18/07/2026",
    hora: "09:00",
    link_cancelamento: "https://linkup.studio/cancelar/teste",
    plano: "Plano VIP Mensal",
    valor: "R$ 150,00",
    vencimento: "21/07/2026",
    proximo_vencimento: "21/08/2026",
    data_pagamento: "18/07/2026",
    dias_para_vencimento: "3",
    dias_atraso: "3",
    dias: "3",
    validade: "21/08/2026",
  };
  return normalizeWhatsAppFormatting(
    template.replace(
      /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}|\{\s*([a-zA-Z0-9_]+)\s*\}/g,
      (_match, doubleKey, singleKey) =>
        variables[String(doubleKey || singleKey || "").toLowerCase()] ?? "",
    ),
  );
}

function cleanPhone(value: string) {
  return value.replace(/\D/g, "");
}

function WhatsAppAdminTab() {
  const qc = useQueryClient();
  const [selectedTenantId, setSelectedTenantId] = useState("");
  const [templateSource, setTemplateSource] = useState<"global" | "custom">("global");
  const [globalForm, setGlobalForm] = useState<WhatsappTemplateForm>(defaultWhatsappTemplates);
  const [tenantForm, setTenantForm] = useState<WhatsappTemplateForm>(defaultWhatsappTemplates);
  const [globalRules, setGlobalRules] = useState<WhatsappSubscriptionRules>(
    defaultWhatsappSubscriptionRules,
  );
  const [tenantRules, setTenantRules] = useState<WhatsappSubscriptionRules>(
    defaultWhatsappSubscriptionRules,
  );
  const [testPhone, setTestPhone] = useState("");
  const [testTemplate, setTestTemplate] = useState<WhatsappTemplateKey>(
    "professional_booking_template",
  );
  const [testTenantId, setTestTenantId] = useState("");
  const [busy, setBusy] = useState<"global" | "tenant" | "test" | null>(null);

  const tenantsQuery = useQuery({
    queryKey: ["all-tenants-whatsapp"],
    queryFn: async () =>
      (await supabase.from("tenants").select("id,name,slug,whatsapp,status").order("name")).data ??
      [],
  });

  const globalQuery = useQuery({
    queryKey: ["whatsapp-global-templates"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("whatsapp_global_templates")
        .select(whatsappTemplateColumns)
        .eq("id", "global")
        .maybeSingle();
      if (error) throw error;
      return data as Record<string, unknown> | null;
    },
  });

  const tenantQuery = useQuery({
    queryKey: ["tenant-whatsapp-template-source", selectedTenantId],
    enabled: Boolean(selectedTenantId),
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("tenant_whatsapp_settings")
        .select(tenantWhatsappTemplateColumns)
        .eq("tenant_id", selectedTenantId)
        .maybeSingle();
      if (error) throw error;
      return data as (Record<string, unknown> & { message_templates_source?: string }) | null;
    },
  });

  const tenantSettingsQuery = useQuery({
    queryKey: ["tenant-whatsapp-template-settings"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("tenant_whatsapp_settings")
        .select(tenantWhatsappTemplateColumns);
      if (error) throw error;
      return (data ?? []) as Array<
        Record<string, unknown> & { tenant_id?: string; message_templates_source?: string }
      >;
    },
  });

  const tenants = tenantsQuery.data ?? [];
  const tenantSettings = tenantSettingsQuery.data ?? [];
  const testTenant = tenants.find((tenant: any) => tenant.id === testTenantId);
  const testTenantSettings = tenantSettings.find((settings) => settings.tenant_id === testTenantId);
  const testUsesCustom = testTenantSettings?.message_templates_source === "custom";
  const testForm = testUsesCustom
    ? normalizeWhatsappTemplates({ ...globalForm, ...testTenantSettings })
    : globalForm;
  const testPreview = renderWhatsappTemplate(testForm[testTemplate], testTenant);

  useEffect(() => {
    if (globalQuery.data) {
      setGlobalForm(normalizeWhatsappTemplates(globalQuery.data));
      setGlobalRules(normalizeSubscriptionRules(globalQuery.data));
    }
  }, [globalQuery.data]);

  useEffect(() => {
    if (templateSource === "global") {
      if (selectedTenantId) setSelectedTenantId("");
      return;
    }
    if (!selectedTenantId && tenants[0]?.id) setSelectedTenantId(tenants[0].id);
  }, [selectedTenantId, templateSource, tenants]);

  useEffect(() => {
    if (!testTenantId && tenants[0]?.id) setTestTenantId(tenants[0].id);
  }, [testTenantId, tenants]);

  useEffect(() => {
    if (!selectedTenantId) return;
    if (!tenantQuery.data) {
      setTenantForm(globalForm);
      setTenantRules(globalRules);
      return;
    }
    setTenantForm(normalizeWhatsappTemplates({ ...globalForm, ...tenantQuery.data }));
    setTenantRules(normalizeSubscriptionRules({ ...globalRules, ...tenantQuery.data }));
  }, [globalForm, globalRules, selectedTenantId, tenantQuery.data]);

  async function saveGlobalTemplates() {
    setBusy("global");
    try {
      const normalizedForm = normalizeWhatsappTemplates(globalForm);
      const normalizedRules = normalizeSubscriptionRules(globalRules);
      setGlobalForm(normalizedForm);
      setGlobalRules(normalizedRules);
      const { error } = await (supabase as any)
        .from("whatsapp_global_templates")
        .upsert({ id: "global", ...normalizedForm, ...normalizedRules }, { onConflict: "id" });
      if (error) throw error;
      toast.success("Modelo global salvo para todos os salões.");
      await qc.invalidateQueries({ queryKey: ["whatsapp-global-templates"] });
    } catch (error: any) {
      toast.error(error.message || "Não foi possível salvar o modelo global.");
    } finally {
      setBusy(null);
    }
  }

  async function saveTenantTemplates() {
    if (!selectedTenantId) return toast.error("Selecione um salão.");
    setBusy("tenant");
    try {
      const payload: Record<string, unknown> = {
        tenant_id: selectedTenantId,
        session_id: selectedTenantId,
        message_templates_source: templateSource,
      };
      if (templateSource === "custom") {
        const normalizedForm = normalizeWhatsappTemplates(tenantForm);
        const normalizedRules = normalizeSubscriptionRules(tenantRules);
        setTenantForm(normalizedForm);
        setTenantRules(normalizedRules);
        Object.assign(payload, normalizedForm, normalizedRules);
      }

      const { error } = await (supabase as any)
        .from("tenant_whatsapp_settings")
        .upsert(payload, { onConflict: "tenant_id" });
      if (error) throw error;
      toast.success(
        templateSource === "custom"
          ? "Mensagem personalizada salva para este salão."
          : "Este salão voltou a usar o modelo global.",
      );
      await qc.invalidateQueries({
        queryKey: ["tenant-whatsapp-template-source", selectedTenantId],
      });
      await qc.invalidateQueries({ queryKey: ["tenant-whatsapp-template-settings"] });
    } catch (error: any) {
      toast.error(error.message || "Não foi possível salvar a personalização.");
    } finally {
      setBusy(null);
    }
  }

  async function sendTemplateTest() {
    if (!testTenantId) return toast.error("Selecione a loja que vai abastecer os dados do teste.");
    const phone = cleanPhone(testPhone);
    if (phone.length < 10) return toast.error("Informe um WhatsApp válido para receber o teste.");
    const message = testPreview.trim().slice(0, 3900);
    if (!message) return toast.error("O modelo escolhido está vazio.");
    const requestId = crypto.randomUUID();

    setBusy("test");
    try {
      const { data, error } = await supabase.functions.invoke("whatsapp-connector", {
        body: {
          action: "send-template-test",
          tenantId: testTenantId,
          phone,
          message,
          templateKey: testTemplate,
          requestId,
        },
      });
      if (error) throw error;
      if ((data as any)?.ok === false || (data as any)?.error) {
        throw new Error((data as any)?.error || "O conector não confirmou o envio.");
      }
      const acknowledgement = (data as any)?.testAcknowledgement;
      if (
        acknowledgement?.mode !== "template" ||
        acknowledgement?.requestId !== requestId ||
        acknowledgement?.templateKey !== testTemplate ||
        acknowledgement?.messageLength !== message.length
      ) {
        throw new Error(
          "A Edge Function publicada está desatualizada e não confirmou o modelo escolhido. Republique whatsapp-connector e tente novamente.",
        );
      }
      toast.success("Mensagem de teste enviada.");
    } catch (error: any) {
      toast.error(error.message || "Não foi possível enviar o teste.");
    } finally {
      setBusy(null);
    }
  }

  if (globalQuery.error) {
    return (
      <SimpleCard
        title="WhatsApp ainda sem SQL"
        desc="Aplique a migration de modelos globais no Supabase/Lovable para habilitar a configuração da matriz."
      />
    );
  }

  return (
    <div className="space-y-5">
      <PlatformWhatsAppSettings />

      <Card>
        <CardContent className="p-6">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-indigo-700">
                <MessageCircle className="h-4 w-4" />
                WhatsApp da matriz
              </div>
              <h2 className="mt-2 text-2xl font-bold text-slate-900">Modelos de mensagens</h2>
              <p className="mt-1 max-w-3xl text-sm text-slate-500">
                O modelo global vale para todos os salões automaticamente. Quando um salão precisar
                de texto próprio, salve uma personalização só para ele.
              </p>
            </div>
            <Button
              className="bg-indigo-600 hover:bg-indigo-700"
              onClick={() => void globalQuery.refetch()}
              disabled={globalQuery.isFetching}
            >
              <RefreshCw
                className={`mr-2 h-4 w-4 ${globalQuery.isFetching ? "animate-spin" : ""}`}
              />
              Atualizar
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-5 xl:grid-cols-2">
        <Card>
          <CardContent className="space-y-4 p-6">
            <div>
              <h3 className="text-lg font-semibold text-slate-900">Padrão global</h3>
              <p className="text-sm text-slate-500">
                Alterar aqui muda o texto usado por todos os salões que estiverem herdando o padrão.
              </p>
            </div>
            <TemplateEditor form={globalForm} onChange={setGlobalForm} />
            <SubscriptionCadenceEditor rules={globalRules} onChange={setGlobalRules} />
            <div className="flex justify-end">
              <Button
                className="bg-indigo-600 hover:bg-indigo-700"
                onClick={() => void saveGlobalTemplates()}
                disabled={busy === "global"}
              >
                <Save className="mr-2 h-4 w-4" />
                Salvar padrão global
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-4 p-6">
            <div>
              <h3 className="text-lg font-semibold text-slate-900">Personalização por salão</h3>
              <p className="text-sm text-slate-500">
                Escolha um salão e decida se ele usa o padrão global ou uma mensagem própria.
              </p>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <Label>Modelo usado</Label>
                <Select
                  value={templateSource}
                  onValueChange={(value) => setTemplateSource(value as "global" | "custom")}
                >
                  <SelectTrigger className="bg-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="global">Padrão da matriz</SelectItem>
                    <SelectItem value="custom">Personalizado deste salão</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Salão</Label>
                <Select
                  value={selectedTenantId}
                  onValueChange={setSelectedTenantId}
                  disabled={templateSource === "global"}
                >
                  <SelectTrigger className="bg-white disabled:cursor-not-allowed disabled:opacity-60">
                    <SelectValue placeholder="Selecione um salão" />
                  </SelectTrigger>
                  <SelectContent>
                    {tenants.map((tenant: any) => (
                      <SelectItem key={tenant.id} value={tenant.id}>
                        {tenant.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {templateSource === "custom" ? (
              <div className="space-y-5">
                <TemplateEditor form={tenantForm} onChange={setTenantForm} />
                <SubscriptionCadenceEditor rules={tenantRules} onChange={setTenantRules} />
              </div>
            ) : (
              <div className="rounded-xl border border-dashed bg-slate-50 p-5 text-sm text-slate-600">
                Quando o modelo usado é <strong>Padrão da matriz</strong>, nenhum salão específico
                precisa ser escolhido: todos os salões que não tiverem personalização herdam este
                texto.
              </div>
            )}

            <div className="flex justify-end">
              <Button
                className="bg-indigo-600 hover:bg-indigo-700"
                onClick={() => void saveTenantTemplates()}
                disabled={
                  busy === "tenant" ||
                  tenantQuery.isFetching ||
                  templateSource === "global" ||
                  !selectedTenantId
                }
              >
                <Save className="mr-2 h-4 w-4" />
                Salvar personalização do salão
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="space-y-4 p-6">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">Enviar teste</h3>
            <p className="text-sm text-slate-500">
              Escolha o modelo e a loja cadastrada que vai preencher os dados dinâmicos do teste.
            </p>
          </div>
          <div className="grid gap-3 md:grid-cols-[1fr_240px_260px_180px]">
            <div>
              <Label>Número destinatário</Label>
              <Input
                value={testPhone}
                onChange={(e) => setTestPhone(e.target.value)}
                placeholder="(91) 99999-9999"
                className="bg-white"
              />
            </div>
            <div>
              <Label>Modelo para teste</Label>
              <Select
                value={testTemplate}
                onValueChange={(value) => setTestTemplate(value as WhatsappTemplateKey)}
              >
                <SelectTrigger className="bg-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {whatsappTemplateFields.map((field) => (
                    <SelectItem key={field.key} value={field.key}>
                      {field.title} · {field.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Loja usada no teste</Label>
              <Select value={testTenantId} onValueChange={setTestTenantId}>
                <SelectTrigger className="bg-white">
                  <SelectValue placeholder="Selecione uma loja" />
                </SelectTrigger>
                <SelectContent>
                  {tenants.map((tenant: any) => (
                    <SelectItem key={tenant.id} value={tenant.id}>
                      {tenant.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="mt-1 text-[11px] text-slate-500">
                {testUsesCustom
                  ? "Usando texto personalizado desta loja."
                  : "Usando padrão da matriz para esta loja."}
              </p>
            </div>
            <div className="flex items-end">
              <Button
                className="w-full bg-indigo-600 hover:bg-indigo-700"
                onClick={() => void sendTemplateTest()}
                disabled={busy === "test" || !testTenantId}
              >
                <Send className="mr-2 h-4 w-4" />
                Enviar teste
              </Button>
            </div>
          </div>
          <div>
            <Label>Prévia da mensagem</Label>
            <Textarea
              rows={7}
              readOnly
              value={testPreview}
              className="mt-1 bg-slate-50 font-mono text-xs"
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function TemplateEditor({
  form,
  onChange,
}: {
  form: WhatsappTemplateForm;
  onChange: (next: WhatsappTemplateForm) => void;
}) {
  return (
    <div className="grid gap-4">
      {whatsappTemplateFields.map((field) => (
        <div key={field.key} className="space-y-1.5">
          <Label>
            {field.title} · {field.label}
          </Label>
          <Textarea
            rows={
              field.key === "professional_booking_template" || field.key.startsWith("subscription_")
                ? 7
                : 4
            }
            value={form[field.key]}
            onChange={(event) => onChange({ ...form, [field.key]: event.target.value })}
            className="bg-white"
          />
        </div>
      ))}
      <p className="text-xs text-slate-500">
        Variáveis disponíveis: {"{cliente}, {profissional}, {salao}, {servico}, "}
        {"{data}, {hora}, {link_cancelamento}, {plano}, {valor}, {vencimento}, "}
        {"{proximo_vencimento}, {data_pagamento}, {dias_para_vencimento}, "}
        {"{dias_atraso}, {dias}, {validade}"}.
      </p>
      <p className="text-xs text-slate-500">
        Para destacar em negrito no WhatsApp, use um asterisco de cada lado: <code>*texto*</code>.
        Se você colar <code>**texto**</code>, o sistema corrigirá automaticamente ao salvar e
        enviar.
      </p>
    </div>
  );
}

function SubscriptionCadenceEditor({
  rules,
  onChange,
}: {
  rules: WhatsappSubscriptionRules;
  onChange: (next: WhatsappSubscriptionRules) => void;
}) {
  return (
    <section className="space-y-4 rounded-xl border border-indigo-100 bg-indigo-50/40 p-4">
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-indigo-100 p-2 text-indigo-700">
          <Clock3 className="h-4 w-4" />
        </div>
        <div>
          <h4 className="font-semibold text-slate-900">Régua automática de Assinaturas</h4>
          <p className="text-xs text-slate-500">
            Defina os dias manualmente; a quantidade cadastrada determina o total de mensagens. As
            regras começam desativadas e só entram em operação quando você ligar cada chave.
          </p>
        </div>
      </div>

      <AutomationRule
        label="Lembretes antes do vencimento"
        description={`${rules.subscription_payment_reminder_days_before.length} envio(s) por cobrança`}
        checked={rules.subscription_payment_reminder_enabled}
        onCheckedChange={(subscription_payment_reminder_enabled) =>
          onChange({ ...rules, subscription_payment_reminder_enabled })
        }
      >
        <DayOffsetsEditor
          label="Dias antes"
          value={rules.subscription_payment_reminder_days_before}
          minimum={0}
          direction="desc"
          disabled={!rules.subscription_payment_reminder_enabled}
          onChange={(subscription_payment_reminder_days_before) =>
            onChange({ ...rules, subscription_payment_reminder_days_before })
          }
        />
      </AutomationRule>

      <AutomationRule
        label="Confirmação de pagamento"
        description="1 envio imediato após a baixa ser confirmada"
        checked={rules.subscription_payment_confirmation_enabled}
        onCheckedChange={(subscription_payment_confirmation_enabled) =>
          onChange({ ...rules, subscription_payment_confirmation_enabled })
        }
      />

      <AutomationRule
        label="Avisos de inadimplência"
        description={`${rules.subscription_overdue_days_after.length} envio(s) por cobrança vencida`}
        checked={rules.subscription_overdue_enabled}
        onCheckedChange={(subscription_overdue_enabled) =>
          onChange({ ...rules, subscription_overdue_enabled })
        }
      >
        <DayOffsetsEditor
          label="Dias depois"
          value={rules.subscription_overdue_days_after}
          minimum={1}
          direction="asc"
          disabled={!rules.subscription_overdue_enabled}
          onChange={(subscription_overdue_days_after) =>
            onChange({ ...rules, subscription_overdue_days_after })
          }
        />
      </AutomationRule>

      <div className="max-w-xs space-y-1.5">
        <Label>Horário dos lembretes e avisos</Label>
        <Input
          type="time"
          value={rules.subscription_notification_time}
          onChange={(event) =>
            onChange({ ...rules, subscription_notification_time: event.target.value })
          }
          className="bg-white"
        />
        <p className="text-[11px] text-slate-500">
          A confirmação de pagamento não espera esse horário: ela é enviada imediatamente.
        </p>
      </div>
    </section>
  );
}

function AutomationRule({
  label,
  description,
  checked,
  onCheckedChange,
  children,
}: {
  label: string;
  description: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  children?: ReactNode;
}) {
  return (
    <div className="space-y-3 rounded-lg border bg-white p-3">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-slate-900">{label}</p>
          <p className="text-xs text-slate-500">{description}</p>
        </div>
        <Switch checked={checked} onCheckedChange={onCheckedChange} />
      </div>
      {children}
    </div>
  );
}

function DayOffsetsEditor({
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
  disabled: boolean;
  onChange: (next: number[]) => void;
}) {
  const normalize = (next: number[]) => normalizeDayOffsets(next, minimum, value, direction);
  const updateAt = (index: number, raw: string) => {
    const next = [...value];
    next[index] = Math.min(365, Math.max(minimum, Number(raw) || minimum));
    onChange(normalize(next));
  };
  const addOffset = () => {
    const candidate = Array.from({ length: 366 - minimum }, (_, index) => index + minimum).find(
      (day) => !value.includes(day),
    );
    if (candidate !== undefined) onChange(normalize([...value, candidate]));
  };

  return (
    <div className={disabled ? "opacity-50" : ""}>
      <div className="mb-2 flex items-center justify-between gap-3">
        <Label className="text-xs">{label}</Label>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled || value.length >= 10}
          onClick={addOffset}
        >
          <Plus className="mr-1 h-3.5 w-3.5" />
          Adicionar envio
        </Button>
      </div>
      <div className="flex flex-wrap gap-2">
        {value.map((day, index) => (
          <div key={`${day}-${index}`} className="flex items-center rounded-md border bg-slate-50">
            <Input
              type="number"
              min={minimum}
              max={365}
              value={day}
              disabled={disabled}
              onChange={(event) => updateAt(index, event.target.value)}
              className="h-9 w-20 border-0 bg-transparent text-center shadow-none"
            />
            <span className="pr-2 text-xs text-slate-500">dia(s)</span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-rose-600"
              disabled={disabled || value.length === 1}
              onClick={() => onChange(value.filter((_, itemIndex) => itemIndex !== index))}
              aria-label={`Remover envio de ${day} dias`}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}

function EmpresasTab() {
  const qc = useQueryClient();
  const create = useServerFn(createTenant);
  const setStatus = useServerFn(setTenantStatus);
  const [open, setOpen] = useState(false);
  const [editingTenant, setEditingTenant] = useState<any>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const { data: tenants } = useQuery({
    queryKey: ["all-tenants"],
    queryFn: async () =>
      (await supabase.from("tenants").select("*").order("created_at", { ascending: false })).data ??
      [],
  });

  const filtered = useMemo(
    () =>
      (tenants ?? []).filter((t: any) => {
        const okStatus = statusFilter === "all" || t.status === statusFilter;
        const q = search.toLowerCase().trim();
        const okQ =
          !q ||
          t.name?.toLowerCase().includes(q) ||
          t.slug?.toLowerCase().includes(q) ||
          t.whatsapp?.includes(q);
        return okStatus && okQ;
      }),
    [tenants, search, statusFilter],
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row gap-3 md:items-center">
        <div className="flex-1 relative">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 bg-white"
            placeholder="Buscar barbearias por nome, dono, CPF..."
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px] bg-white">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os Status</SelectItem>
            <SelectItem value="active">Ativos</SelectItem>
            <SelectItem value="blocked">Bloqueados</SelectItem>
          </SelectContent>
        </Select>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="bg-indigo-600 hover:bg-indigo-700">
              <Plus className="h-4 w-4 mr-2" />
              Cadastrar Empresa
            </Button>
          </DialogTrigger>
          <NewTenantDialog
            create={create}
            onDone={() => {
              setOpen(false);
              qc.invalidateQueries({ queryKey: ["all-tenants"] });
            }}
          />
        </Dialog>
        <Dialog
          open={!!editingTenant}
          onOpenChange={(v) => {
            if (!v) setEditingTenant(null);
          }}
        >
          {editingTenant && (
            <EditTenantDialog
              tenant={editingTenant}
              onDone={() => {
                setEditingTenant(null);
                qc.invalidateQueries({ queryKey: ["all-tenants"] });
              }}
            />
          )}
        </Dialog>
      </div>

      <div className="space-y-3">
        {filtered.length === 0 && (
          <Card>
            <CardContent className="p-8 text-center text-sm text-slate-500">
              Nenhuma barbearia encontrada.
            </CardContent>
          </Card>
        )}
        {filtered.map((t: any) => (
          <div key={t.id} className="bg-slate-900 text-white rounded-xl p-5">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-3">
                  <h3 className="font-bold text-lg">{t.name}</h3>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase ${t.status === "active" ? "bg-emerald-500" : "bg-amber-500"} text-white`}
                  >
                    {t.status === "active" ? "Ativo" : "Bloqueado"}
                  </span>
                </div>
                <p className="text-xs text-slate-300 mt-1">
                  Slug: <span className="font-mono">{t.slug}</span>
                  {t.whatsapp && ` • ${t.whatsapp}`}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <a
                  href={getPublicBookingUrl(t.slug)}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs px-3 py-1.5 rounded-md bg-white/10 hover:bg-white/20 flex items-center gap-1"
                >
                  Link reservas <ExternalLink className="h-3 w-3" />
                </a>
                <button
                  onClick={async () => {
                    await setStatus({
                      data: { id: t.id, status: t.status === "active" ? "blocked" : "active" },
                    });
                    qc.invalidateQueries({ queryKey: ["all-tenants"] });
                  }}
                  className="text-xs px-3 py-1.5 rounded-md bg-amber-500 hover:bg-amber-600 text-white font-semibold"
                >
                  {t.status === "active" ? "Bloquear" : "Liberar Acesso"}
                </button>
                <button className="text-xs px-3 py-1.5 rounded-md bg-white/10 hover:bg-white/20 flex items-center gap-1">
                  <Database className="h-3 w-3" /> Backup
                </button>
                <button
                  onClick={() => setEditingTenant(t)}
                  className="h-8 w-8 rounded-md bg-white/10 hover:bg-white/20 flex items-center justify-center"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button className="h-8 w-8 rounded-md bg-rose-500/80 hover:bg-rose-50 flex items-center justify-center">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-5 pt-4 border-t border-white/10">
              <div>
                <div className="text-[10px] font-bold uppercase text-slate-400">
                  Plano contratado
                </div>
                <div className="text-sm font-semibold mt-1">
                  {t.plan === "yearly" ? "Anual (R$ 49,90/ano)" : "Mensal (R$ 49,90/mês)"}
                </div>
              </div>
              <div>
                <div className="text-[10px] font-bold uppercase text-slate-400">Vencimento</div>
                <div className="text-sm font-semibold mt-1">
                  {t.plan_expires_at ? dateBR(t.plan_expires_at) : "—"}
                </div>
              </div>
              <div>
                <div className="text-[10px] font-bold uppercase text-slate-400">Limites</div>
                <div className="text-sm font-semibold mt-1">Ilimitado</div>
              </div>
              <div>
                <div className="text-[10px] font-bold uppercase text-slate-400">White Label</div>
                <div className="text-sm font-semibold mt-1 text-indigo-300">
                  Ativado (Logo, Cores)
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

type TenantBillingCustomerForm = {
  legalName: string;
  cpfCnpj: string;
  email: string;
  phone: string;
  postalCode: string;
  address: string;
  addressNumber: string;
  complement: string;
  province: string;
  city: string;
  state: string;
};

const emptyTenantBillingCustomer: TenantBillingCustomerForm = {
  legalName: "",
  cpfCnpj: "",
  email: "",
  phone: "",
  postalCode: "",
  address: "",
  addressNumber: "",
  complement: "",
  province: "",
  city: "",
  state: "",
};

function onlyDigits(value: string) {
  return value.replace(/\D/g, "");
}

function tenantBillingCustomerPayload(form: TenantBillingCustomerForm) {
  return {
    legalName: form.legalName.trim(),
    cpfCnpj: onlyDigits(form.cpfCnpj),
    email: form.email.toLowerCase().trim(),
    phone: onlyDigits(form.phone),
    postalCode: onlyDigits(form.postalCode),
    address: form.address.trim(),
    addressNumber: form.addressNumber.trim(),
    complement: form.complement.trim(),
    province: form.province.trim(),
    city: form.city.trim(),
    state: form.state.trim().toUpperCase(),
    preferredBillingType: "UNDEFINED" as const,
    notificationDisabled: true,
  };
}

function tenantBillingMissingFields(form: TenantBillingCustomerForm) {
  const missing: string[] = [];
  const cpfCnpj = onlyDigits(form.cpfCnpj);
  const phone = onlyDigits(form.phone);
  const postalCode = onlyDigits(form.postalCode);
  if (!form.legalName.trim()) missing.push("razão social/nome fiscal");
  if (![11, 14].includes(cpfCnpj.length)) missing.push("CPF/CNPJ");
  if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) missing.push("e-mail financeiro");
  if (phone.length < 10) missing.push("WhatsApp financeiro");
  if (postalCode.length !== 8) missing.push("CEP");
  if (!form.address.trim()) missing.push("endereço");
  if (!form.addressNumber.trim()) missing.push("número");
  if (!form.province.trim()) missing.push("bairro");
  if (!form.city.trim()) missing.push("cidade");
  if (form.state.trim().length !== 2) missing.push("UF");
  return missing;
}

function tenantBillingCustomerFromRow(row: any, fallbackName: string): TenantBillingCustomerForm {
  return {
    legalName: row?.legal_name ?? fallbackName,
    cpfCnpj: row?.cpf_cnpj ?? "",
    email: row?.email ?? "",
    phone: row?.phone ?? "",
    postalCode: row?.postal_code ?? "",
    address: row?.address ?? "",
    addressNumber: row?.address_number ?? "",
    complement: row?.complement ?? "",
    province: row?.province ?? "",
    city: row?.city ?? "",
    state: row?.state ?? "",
  };
}

function TenantBillingFields({
  value,
  onChange,
}: {
  value: TenantBillingCustomerForm;
  onChange: (next: TenantBillingCustomerForm) => void;
}) {
  const update = (patch: Partial<TenantBillingCustomerForm>) => onChange({ ...value, ...patch });
  return (
    <div className="rounded-xl border border-indigo-100 bg-indigo-50/40 p-4">
      <div className="mb-4">
        <div className="text-xs font-bold uppercase tracking-wide text-indigo-600">
          Dados fiscais / Asaas
        </div>
        <p className="mt-1 text-xs text-slate-500">
          Estes dados preparam o cliente para checkout e cobranças da LinkUp Studio.
        </p>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <Label>Razão social / nome fiscal *</Label>
          <Input
            value={value.legalName}
            onChange={(event) => update({ legalName: event.target.value })}
          />
        </div>
        <div>
          <Label>CPF / CNPJ *</Label>
          <Input
            value={value.cpfCnpj}
            onChange={(event) => update({ cpfCnpj: event.target.value })}
          />
        </div>
        <div>
          <Label>E-mail financeiro *</Label>
          <Input
            type="email"
            value={value.email}
            onChange={(event) => update({ email: event.target.value })}
          />
        </div>
        <div>
          <Label>WhatsApp financeiro *</Label>
          <Input value={value.phone} onChange={(event) => update({ phone: event.target.value })} />
        </div>
        <div>
          <Label>CEP *</Label>
          <Input
            value={value.postalCode}
            onChange={(event) => update({ postalCode: event.target.value })}
          />
        </div>
        <div>
          <Label>Endereço *</Label>
          <Input
            value={value.address}
            onChange={(event) => update({ address: event.target.value })}
          />
        </div>
        <div>
          <Label>Número *</Label>
          <Input
            value={value.addressNumber}
            onChange={(event) => update({ addressNumber: event.target.value })}
          />
        </div>
        <div>
          <Label>Complemento</Label>
          <Input
            value={value.complement}
            onChange={(event) => update({ complement: event.target.value })}
          />
        </div>
        <div>
          <Label>Bairro *</Label>
          <Input
            value={value.province}
            onChange={(event) => update({ province: event.target.value })}
          />
        </div>
        <div className="grid grid-cols-[1fr_82px] gap-2">
          <div>
            <Label>Cidade *</Label>
            <Input value={value.city} onChange={(event) => update({ city: event.target.value })} />
          </div>
          <div>
            <Label>UF *</Label>
            <Input
              maxLength={2}
              value={value.state}
              onChange={(event) => update({ state: event.target.value.toUpperCase().slice(0, 2) })}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function EditTenantDialog({ tenant, onDone }: { tenant: any; onDone: () => void }) {
  const getOwner = useServerFn(getTenantOwner);
  const update = useServerFn(updateTenant);
  const [f, setF] = useState({
    name: tenant.name,
    slug: tenant.slug,
    whatsapp: tenant.whatsapp ?? "",
    plan: tenant.plan ?? "monthly",
    owner_email: "",
    owner_password: "",
    billing_customer: { ...emptyTenantBillingCustomer, legalName: tenant.name },
  });
  const [loadingOwner, setLoadingOwner] = useState(true);

  useEffect(() => {
    getOwner({ data: { tenantId: tenant.id } })
      .then((res) => {
        if (res) {
          setF((prev) => ({ ...prev, owner_email: res.email }));
        }
      })
      .finally(() => setLoadingOwner(false));
  }, [tenant.id]);

  useEffect(() => {
    let active = true;
    supabase
      .from("tenant_billing_provider_customers")
      .select("*")
      .eq("tenant_id", tenant.id)
      .eq("provider", "asaas")
      .order("environment", { ascending: false })
      .then(({ data }) => {
        if (!active) return;
        const rows = data ?? [];
        const row = rows.find((item: any) => item.environment === "production") ?? rows[0];
        setF((prev) => ({
          ...prev,
          billing_customer: tenantBillingCustomerFromRow(row, tenant.name),
        }));
      });
    return () => {
      active = false;
    };
  }, [tenant.id, tenant.name]);

  async function save() {
    try {
      if (f.owner_password) {
        const passwordError = validateProjectPassword(f.owner_password);
        if (passwordError) return toast.error(passwordError);
      }
      const missingBilling = tenantBillingMissingFields(f.billing_customer);
      if (missingBilling.length) {
        return toast.error(`Complete os dados fiscais: ${missingBilling.join(", ")}.`);
      }
      await update({
        data: {
          id: tenant.id,
          name: f.name,
          slug: f.slug,
          whatsapp: f.whatsapp || undefined,
          plan: f.plan as "monthly" | "yearly",
          owner_email: f.owner_email || undefined,
          owner_password: f.owner_password || undefined,
          billing_customer: tenantBillingCustomerPayload(f.billing_customer),
        },
      });
      toast.success("Empresa atualizada com sucesso!");
      onDone();
    } catch (e: any) {
      toast.error(e.message || "Erro ao salvar alterações");
    }
  }

  return (
    <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
      <DialogHeader>
        <DialogTitle>Editar Barbearia: {tenant.name}</DialogTitle>
      </DialogHeader>
      <div className="space-y-3 py-2">
        <div>
          <Label>Nome da barbearia</Label>
          <Input
            value={f.name}
            onChange={(e) =>
              setF({
                ...f,
                name: e.target.value,
                billing_customer: f.billing_customer.legalName
                  ? f.billing_customer
                  : { ...f.billing_customer, legalName: e.target.value },
                slug: e.target.value
                  .toLowerCase()
                  .normalize("NFD")
                  .replace(/[\u0300-\u036f]/g, "")
                  .replace(/[^a-z0-9]/g, "-")
                  .replace(/-+/g, "-")
                  .replace(/^-|-$/g, ""),
              })
            }
          />
        </div>
        <div>
          <Label>Slug (URL do agendamento)</Label>
          <Input value={f.slug} onChange={(e) => setF({ ...f, slug: e.target.value })} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>WhatsApp</Label>
            <Input value={f.whatsapp} onChange={(e) => setF({ ...f, whatsapp: e.target.value })} />
          </div>
          <div>
            <Label>Plano</Label>
            <Select value={f.plan} onValueChange={(v) => setF({ ...f, plan: v })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="monthly">Mensal</SelectItem>
                <SelectItem value="yearly">Anual</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Email do dono</Label>
            <Input
              type="email"
              disabled={loadingOwner}
              placeholder={loadingOwner ? "Carregando..." : "Email de acesso"}
              value={f.owner_email}
              onChange={(e) => setF({ ...f, owner_email: e.target.value })}
            />
          </div>
          <div>
            <Label>Nova senha (deixe vazio se não mudar)</Label>
            <Input
              type="password"
              autoComplete="new-password"
              placeholder="Mínimo de 8 caracteres"
              value={f.owner_password}
              onChange={(e) => setF({ ...f, owner_password: e.target.value })}
            />
            <p className="mt-1 text-[10px] text-slate-500">
              A única exigência é ter no mínimo 8 caracteres.
            </p>
          </div>
        </div>
        <TenantBillingFields
          value={f.billing_customer}
          onChange={(billing_customer) => setF({ ...f, billing_customer })}
        />
      </div>
      <DialogFooter>
        <Button className="bg-indigo-600 hover:bg-indigo-700" onClick={save}>
          Salvar Alterações
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

function NewTenantDialog({ create, onDone }: any) {
  const [f, setF] = useState({
    name: "",
    slug: "",
    whatsapp: "",
    plan: "monthly",
    owner_email: "",
    owner_password: "",
    billing_customer: { ...emptyTenantBillingCustomer },
  });
  async function save() {
    if (!f.owner_email.trim()) return toast.error("Informe o e-mail do proprietário.");
    const passwordError = validateProjectPassword(f.owner_password);
    if (passwordError) return toast.error(passwordError);
    const missingBilling = tenantBillingMissingFields(f.billing_customer);
    if (missingBilling.length) {
      return toast.error(`Complete os dados fiscais: ${missingBilling.join(", ")}.`);
    }
    try {
      await create({
        data: {
          ...f,
          owner_email: f.owner_email.trim(),
          billing_customer: tenantBillingCustomerPayload(f.billing_customer),
        } as any,
      });
      toast.success("Empresa cadastrada");
      onDone();
    } catch (e: any) {
      toast.error(e.message || "Erro ao cadastrar empresa");
    }
  }
  return (
    <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
      <DialogHeader>
        <DialogTitle>Cadastrar nova empresa</DialogTitle>
      </DialogHeader>
      <div className="space-y-3">
        <div>
          <Label>Nome da barbearia</Label>
          <Input
            value={f.name}
            onChange={(e) =>
              setF({
                ...f,
                name: e.target.value,
                billing_customer: f.billing_customer.legalName
                  ? f.billing_customer
                  : { ...f.billing_customer, legalName: e.target.value },
                slug: e.target.value
                  .toLowerCase()
                  .normalize("NFD")
                  .replace(/[\u0300-\u036f]/g, "")
                  .replace(/[^a-z0-9]/g, "-")
                  .replace(/-+/g, "-")
                  .replace(/^-|-$/g, ""),
              })
            }
          />
        </div>
        <div>
          <Label>Slug (URL do agendamento)</Label>
          <Input value={f.slug} onChange={(e) => setF({ ...f, slug: e.target.value })} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>WhatsApp</Label>
            <Input value={f.whatsapp} onChange={(e) => setF({ ...f, whatsapp: e.target.value })} />
          </div>
          <div>
            <Label>Plano</Label>
            <Select value={f.plan} onValueChange={(v) => setF({ ...f, plan: v })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="monthly">Mensal</SelectItem>
                <SelectItem value="yearly">Anual</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Email do dono</Label>
            <Input
              type="email"
              value={f.owner_email}
              onChange={(e) => setF({ ...f, owner_email: e.target.value })}
            />
          </div>
          <div>
            <Label>Senha inicial</Label>
            <Input
              type="password"
              autoComplete="new-password"
              placeholder="Mínimo de 8 caracteres"
              value={f.owner_password}
              onChange={(e) => setF({ ...f, owner_password: e.target.value })}
            />
            <p className="mt-1 text-[10px] text-slate-500">
              A única exigência é ter no mínimo 8 caracteres.
            </p>
          </div>
        </div>
        <TenantBillingFields
          value={f.billing_customer}
          onChange={(billing_customer) => setF({ ...f, billing_customer })}
        />
      </div>
      <DialogFooter>
        <Button className="bg-indigo-600 hover:bg-indigo-700" onClick={save}>
          Cadastrar Empresa
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

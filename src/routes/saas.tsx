import { createFileRoute, redirect, useNavigate, Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { createTenant, setTenantStatus, getTenantOwner, updateTenant } from "@/lib/tenants.functions";
import { ShieldCheck, Plus, Search, TrendingUp, Building2, DollarSign, Database, Terminal, Settings2, Pencil, Trash2, ExternalLink, Server, MessageCircle, Save, Send, RefreshCw } from "lucide-react";
import { useState, useMemo, useEffect } from "react";
import { toast } from "sonner";
import { dateBR, brl } from "@/lib/format";
import { validateProjectPassword } from "@/lib/password-policy";

const whatsappTemplateFields = [
  { key: "client_registration_template", title: "Novo cadastro", label: "Mensagem para o cliente" },
  { key: "client_booking_template", title: "Novo agendamento", label: "Mensagem para o cliente" },
  { key: "professional_booking_template", title: "Novo agendamento", label: "Mensagem para o profissional" },
  { key: "client_reminder_template", title: "Lembrete", label: "Mensagem para o cliente" },
  { key: "client_cancellation_template", title: "Cancelamento", label: "Mensagem para o cliente" },
  { key: "professional_cancellation_template", title: "Cancelamento", label: "Mensagem para o profissional" },
  { key: "client_reschedule_template", title: "Reagendamento", label: "Mensagem para o cliente" },
  { key: "professional_reschedule_template", title: "Reagendamento", label: "Mensagem para o profissional" },
] as const;

type WhatsappTemplateKey = (typeof whatsappTemplateFields)[number]["key"];
type WhatsappTemplateForm = Record<WhatsappTemplateKey, string>;

const defaultWhatsappTemplates: WhatsappTemplateForm = {
  client_registration_template:
    "Olá, {cliente}! Seu cadastro em {salao} foi confirmado. Agora você pode entrar com seu CPF e senha para agendar com mais rapidez.",
  client_booking_template:
    "Olá, {cliente}! Seu agendamento em {salao} está confirmado para {data} às {hora}, com {profissional}. Serviço: {servico}. Para cancelar: {link_cancelamento}",
  professional_booking_template:
    `📅 *Olá, {profissional}! Você recebeu um novo agendamento.*

👤 Cliente: *{cliente}*
💼 Serviço: *{servico}*
📆 Data: *{data}*
🕒 Horário: *{hora}*

✨ Desejamos um excelente atendimento!`,
  client_reminder_template:
    "Olá, {cliente}! Passando para lembrar que seu atendimento em {salao} será em {data} às {hora}, com {profissional}. Serviço: {servico}.",
  client_cancellation_template:
    "Olá, {cliente}. Seu agendamento em {salao}, marcado para {data} às {hora}, foi cancelado.",
  professional_cancellation_template:
    "Olá, {profissional}. O agendamento de {cliente}, em {data} às {hora}, foi cancelado.",
  client_reschedule_template:
    "Olá, {cliente}! Seu agendamento em {salao} foi atualizado para {data} às {hora}, com {profissional}. Serviço: {servico}.",
  professional_reschedule_template:
    "Olá, {profissional}. O agendamento de {cliente} foi atualizado para {data} às {hora}. Serviço: {servico}.",
};

const whatsappTemplateColumns = [
  "id",
  ...whatsappTemplateFields.map((field) => field.key),
  "updated_at",
].join(",");

const tenantWhatsappTemplateColumns = [
  "tenant_id",
  "message_templates_source",
  ...whatsappTemplateFields.map((field) => field.key),
].join(",");

export const Route = createFileRoute("/saas")({
  ssr: false,
  beforeLoad: async () => {
    const { data: userRes } = await supabase.auth.getUser();
    if (!userRes.user) throw redirect({ to: "/saas-login" });
    const { data } = await supabase.from("user_roles").select("role").eq("user_id", userRes.user.id).eq("role", "super_admin");
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
  const { data: user } = useQuery({ queryKey: ["saas-user"], queryFn: async () => (await supabase.auth.getUser()).data.user });
  const displayName = (user?.user_metadata?.full_name as string) || user?.email?.split("@")[0] || "Super Admin";

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b">
        <div className="max-w-[1400px] mx-auto px-6 py-4 flex items-center gap-4">
          <div className="h-12 w-12 rounded-xl bg-indigo-100 flex items-center justify-center">
            <ShieldCheck className="h-6 w-6 text-indigo-600" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h1 className="font-bold text-lg text-slate-900">SaaS Professional Console</h1>
              <span className="text-[10px] font-bold bg-emerald-500 text-white px-2 py-0.5 rounded">PRO</span>
            </div>
            <p className="text-xs text-slate-500">Sistema de Multi-Tenant, Auditorias, White Label & Backups</p>
          </div>
          <div className="text-right">
            <div className="font-semibold text-slate-900 capitalize">{displayName}</div>
            <span className="inline-block mt-0.5 text-[10px] font-bold text-indigo-700 bg-indigo-100 px-2 py-0.5 rounded">SUPER ADMINISTRATOR</span>
          </div>
          <div className="flex flex-col gap-1">
            <Link to="/app" className="text-xs px-3 py-1.5 rounded-md border border-slate-300 hover:bg-slate-50 text-center">Ir para meu app</Link>
            <button onClick={signOut} className="text-xs px-3 py-1.5 rounded-md border border-slate-300 hover:bg-slate-50">Mudar de Usuário / Sair</button>
          </div>
        </div>
      </header>

      <main className="max-w-[1400px] mx-auto px-6 py-6">
        <Tabs defaultValue="empresas">
          <TabsList className="bg-white border shadow-sm p-1 h-auto flex-wrap justify-start gap-1">
            <TabsTrigger value="dashboard" className="data-[state=active]:bg-indigo-600 data-[state=active]:text-white px-4 py-2"><TrendingUp className="h-4 w-4 mr-2"/>Dashboard SaaS</TabsTrigger>
            <TabsTrigger value="empresas" className="data-[state=active]:bg-indigo-600 data-[state=active]:text-white px-4 py-2"><Building2 className="h-4 w-4 mr-2"/>Empresas / Clientes</TabsTrigger>
            <TabsTrigger value="whatsapp" className="data-[state=active]:bg-indigo-600 data-[state=active]:text-white px-4 py-2"><MessageCircle className="h-4 w-4 mr-2"/>WhatsApp</TabsTrigger>
            <TabsTrigger value="financeiro" className="data-[state=active]:bg-indigo-600 data-[state=active]:text-white px-4 py-2"><DollarSign className="h-4 w-4 mr-2"/>Financeiro & Cobranças</TabsTrigger>
            <TabsTrigger value="backups" className="data-[state=active]:bg-indigo-600 data-[state=active]:text-white px-4 py-2"><Database className="h-4 w-4 mr-2"/>Backups de Segurança</TabsTrigger>
            <TabsTrigger value="logs" className="data-[state=active]:bg-indigo-600 data-[state=active]:text-white px-4 py-2"><Terminal className="h-4 w-4 mr-2"/>Logs & Auditorias</TabsTrigger>
            <TabsTrigger value="dev" className="data-[state=active]:bg-indigo-600 data-[state=active]:text-white px-4 py-2"><Settings2 className="h-4 w-4 mr-2"/>Painel Desenvolvedor</TabsTrigger>
          </TabsList>

          <TabsContent value="dashboard" className="mt-6"><DashboardTab /></TabsContent>
          <TabsContent value="empresas" className="mt-6"><EmpresasTab /></TabsContent>
          <TabsContent value="whatsapp" className="mt-6"><WhatsAppAdminTab /></TabsContent>
          <TabsContent value="financeiro" className="mt-6"><SimpleCard title="Financeiro & Cobranças" desc="Controle mensal/anual, inadimplência e emissão de cobranças em breve." /></TabsContent>
          <TabsContent value="backups" className="mt-6"><SimpleCard title="Backups de Segurança" desc="Backups automáticos por tenant, exportação e restauração pontual." /></TabsContent>
          <TabsContent value="logs" className="mt-6"><SimpleCard title="Logs & Auditorias" desc="Trilhas de auditoria de acesso, alterações e exportações por tenant." /></TabsContent>
          <TabsContent value="dev" className="mt-6"><SimpleCard title="Painel Desenvolvedor" desc="Chaves de API, webhooks e diagnósticos técnicos por tenant." /></TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

function SimpleCard({ title, desc }: any) {
  return <Card><CardContent className="p-10 text-center"><Server className="h-10 w-10 text-slate-300 mx-auto mb-3"/><h3 className="font-semibold text-slate-900">{title}</h3><p className="text-sm text-slate-500 mt-1">{desc}</p></CardContent></Card>;
}

function DashboardTab() {
  const { data: tenants } = useQuery({ queryKey: ["all-tenants"], queryFn: async () => (await supabase.from("tenants").select("*")).data ?? [] });
  const active = (tenants ?? []).filter((t:any)=>t.status==="active").length;
  const blocked = (tenants ?? []).filter((t:any)=>t.status!=="active").length;
  return (
    <div className="grid md:grid-cols-4 gap-4">
      <Metric label="Empresas ativas" value={String(active)} tone="emerald" />
      <Metric label="Empresas bloqueadas" value={String(blocked)} tone="rose" />
      <Metric label="Total de tenants" value={String(tenants?.length ?? 0)} tone="indigo" />
      <Metric label="Receita estimada / mês" value={brl(active * 49.9)} tone="amber" />
    </div>
  );
}

function Metric({ label, value, tone }: any) {
  const tones: any = { emerald: "bg-emerald-50 text-emerald-700", rose: "bg-rose-50 text-rose-700", indigo: "bg-indigo-50 text-indigo-700", amber: "bg-amber-50 text-amber-700" };
  return <Card><CardContent className="p-5"><div className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded inline-block ${tones[tone]}`}>{label}</div><div className="text-2xl font-bold mt-3 text-slate-900">{value}</div></CardContent></Card>;
}

function normalizeWhatsappTemplates(row?: Record<string, unknown> | null): WhatsappTemplateForm {
  const next = { ...defaultWhatsappTemplates };
  for (const field of whatsappTemplateFields) {
    const value = row?.[field.key];
    if (typeof value === "string" && value.trim()) next[field.key] = value;
  }
  return next;
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
  };
  return template.replace(
    /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}|\{\s*([a-zA-Z0-9_]+)\s*\}/g,
    (_match, doubleKey, singleKey) => variables[String(doubleKey || singleKey || "").toLowerCase()] ?? "",
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
  const [testPhone, setTestPhone] = useState("");
  const [testTemplate, setTestTemplate] = useState<WhatsappTemplateKey>("professional_booking_template");
  const [busy, setBusy] = useState<"global" | "tenant" | "test" | null>(null);

  const tenantsQuery = useQuery({
    queryKey: ["all-tenants-whatsapp"],
    queryFn: async () =>
      (await supabase.from("tenants").select("id,name,slug,whatsapp,status").order("name")).data ?? [],
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

  const tenants = tenantsQuery.data ?? [];
  const selectedTenant = tenants.find((tenant: any) => tenant.id === selectedTenantId);
  const previewForm = templateSource === "custom" ? tenantForm : globalForm;
  const testPreview = renderWhatsappTemplate(previewForm[testTemplate], selectedTenant);

  useEffect(() => {
    if (globalQuery.data) setGlobalForm(normalizeWhatsappTemplates(globalQuery.data));
  }, [globalQuery.data]);

  useEffect(() => {
    if (!selectedTenantId && tenants[0]?.id) setSelectedTenantId(tenants[0].id);
  }, [selectedTenantId, tenants]);

  useEffect(() => {
    if (!selectedTenantId) return;
    if (!tenantQuery.data) {
      setTemplateSource("global");
      setTenantForm(globalForm);
      return;
    }
    const nextSource = tenantQuery.data.message_templates_source === "custom" ? "custom" : "global";
    setTemplateSource(nextSource);
    setTenantForm(normalizeWhatsappTemplates({ ...globalForm, ...tenantQuery.data }));
  }, [globalForm, selectedTenantId, tenantQuery.data]);

  async function saveGlobalTemplates() {
    setBusy("global");
    try {
      const { error } = await (supabase as any)
        .from("whatsapp_global_templates")
        .upsert({ id: "global", ...globalForm }, { onConflict: "id" });
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
      if (templateSource === "custom") Object.assign(payload, tenantForm);

      const { error } = await (supabase as any)
        .from("tenant_whatsapp_settings")
        .upsert(payload, { onConflict: "tenant_id" });
      if (error) throw error;
      toast.success(
        templateSource === "custom"
          ? "Mensagem personalizada salva para este salão."
          : "Este salão voltou a usar o modelo global.",
      );
      await qc.invalidateQueries({ queryKey: ["tenant-whatsapp-template-source", selectedTenantId] });
    } catch (error: any) {
      toast.error(error.message || "Não foi possível salvar a personalização.");
    } finally {
      setBusy(null);
    }
  }

  async function sendTemplateTest() {
    if (!selectedTenantId) return toast.error("Selecione um salão para usar a conexão WhatsApp.");
    const phone = cleanPhone(testPhone);
    if (phone.length < 10) return toast.error("Informe um WhatsApp válido para receber o teste.");

    setBusy("test");
    try {
      const { data, error } = await supabase.functions.invoke("whatsapp-connector", {
        body: {
          action: "send-test",
          tenantId: selectedTenantId,
          phone,
          message: testPreview,
        },
      });
      if (error) throw error;
      if ((data as any)?.ok === false || (data as any)?.error) {
        throw new Error((data as any)?.error || "O conector não confirmou o envio.");
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
              <RefreshCw className={`mr-2 h-4 w-4 ${globalQuery.isFetching ? "animate-spin" : ""}`} />
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
                <Label>Salão</Label>
                <Select value={selectedTenantId} onValueChange={setSelectedTenantId}>
                  <SelectTrigger className="bg-white"><SelectValue placeholder="Selecione um salão" /></SelectTrigger>
                  <SelectContent>
                    {tenants.map((tenant: any) => (
                      <SelectItem key={tenant.id} value={tenant.id}>{tenant.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Modelo usado</Label>
                <Select value={templateSource} onValueChange={(value) => setTemplateSource(value as "global" | "custom")}>
                  <SelectTrigger className="bg-white"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="global">Padrão da matriz</SelectItem>
                    <SelectItem value="custom">Personalizado deste salão</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {templateSource === "custom" ? (
              <TemplateEditor form={tenantForm} onChange={setTenantForm} />
            ) : (
              <div className="rounded-xl border border-dashed bg-slate-50 p-5 text-sm text-slate-600">
                Este salão está herdando automaticamente o padrão global. Qualquer mudança no padrão
                da matriz já passa a valer para ele.
              </div>
            )}

            <div className="flex justify-end">
              <Button
                className="bg-indigo-600 hover:bg-indigo-700"
                onClick={() => void saveTenantTemplates()}
                disabled={busy === "tenant" || tenantQuery.isFetching}
              >
                <Save className="mr-2 h-4 w-4" />
                Salvar regra do salão
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
              O teste usa a conexão WhatsApp do salão selecionado acima e envia o modelo já renderizado.
            </p>
          </div>
          <div className="grid gap-3 md:grid-cols-[1fr_220px_180px]">
            <div>
              <Label>Número destinatário</Label>
              <Input value={testPhone} onChange={e=>setTestPhone(e.target.value)} placeholder="(91) 99999-9999" className="bg-white" />
            </div>
            <div>
              <Label>Modelo para teste</Label>
              <Select value={testTemplate} onValueChange={(value) => setTestTemplate(value as WhatsappTemplateKey)}>
                <SelectTrigger className="bg-white"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {whatsappTemplateFields.map((field) => (
                    <SelectItem key={field.key} value={field.key}>{field.title} · {field.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button
                className="w-full bg-indigo-600 hover:bg-indigo-700"
                onClick={() => void sendTemplateTest()}
                disabled={busy === "test" || !selectedTenantId}
              >
                <Send className="mr-2 h-4 w-4" />
                Enviar teste
              </Button>
            </div>
          </div>
          <div>
            <Label>Prévia da mensagem</Label>
            <Textarea rows={7} readOnly value={testPreview} className="mt-1 bg-slate-50 font-mono text-xs" />
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
          <Label>{field.title} · {field.label}</Label>
          <Textarea
            rows={field.key === "professional_booking_template" ? 7 : 4}
            value={form[field.key]}
            onChange={(event) => onChange({ ...form, [field.key]: event.target.value })}
            className="bg-white"
          />
        </div>
      ))}
      <p className="text-xs text-slate-500">
        Variáveis disponíveis: {"{cliente}, {profissional}, {salao}, {servico}, "}
        {"{data}, {hora}, {link_cancelamento}"}.
      </p>
    </div>
  );
}

function EmpresasTab() {
  const qc = useQueryClient();
  const create = useServerFn(createTenant); const setStatus = useServerFn(setTenantStatus);
  const [open, setOpen] = useState(false);
  const [editingTenant, setEditingTenant] = useState<any>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const { data: tenants } = useQuery({ queryKey: ["all-tenants"], queryFn: async () => (await supabase.from("tenants").select("*").order("created_at", { ascending: false })).data ?? [] });

  const filtered = useMemo(() => (tenants ?? []).filter((t:any) => {
    const okStatus = statusFilter === "all" || t.status === statusFilter;
    const q = search.toLowerCase().trim();
    const okQ = !q || t.name?.toLowerCase().includes(q) || t.slug?.toLowerCase().includes(q) || t.whatsapp?.includes(q);
    return okStatus && okQ;
  }), [tenants, search, statusFilter]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row gap-3 md:items-center">
        <div className="flex-1 relative">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/>
          <Input value={search} onChange={e=>setSearch(e.target.value)} className="pl-9 bg-white" placeholder="Buscar barbearias por nome, dono, CPF..."/>
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px] bg-white"><SelectValue/></SelectTrigger>
          <SelectContent><SelectItem value="all">Todos os Status</SelectItem><SelectItem value="active">Ativos</SelectItem><SelectItem value="blocked">Bloqueados</SelectItem></SelectContent>
        </Select>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button className="bg-indigo-600 hover:bg-indigo-700"><Plus className="h-4 w-4 mr-2"/>Cadastrar Empresa</Button></DialogTrigger>
          <NewTenantDialog create={create} onDone={()=>{setOpen(false);qc.invalidateQueries({queryKey:["all-tenants"]});}}/>
        </Dialog>
        <Dialog open={!!editingTenant} onOpenChange={(v)=>{if(!v)setEditingTenant(null);}}>
          {editingTenant && <EditTenantDialog tenant={editingTenant} onDone={()=>{setEditingTenant(null);qc.invalidateQueries({queryKey:["all-tenants"]});}}/>}
        </Dialog>
      </div>

      <div className="space-y-3">
        {filtered.length === 0 && <Card><CardContent className="p-8 text-center text-sm text-slate-500">Nenhuma barbearia encontrada.</CardContent></Card>}
        {filtered.map((t:any) => (
          <div key={t.id} className="bg-slate-900 text-white rounded-xl p-5">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-3">
                  <h3 className="font-bold text-lg">{t.name}</h3>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase ${t.status==="active"?"bg-emerald-500":"bg-amber-500"} text-white`}>{t.status==="active"?"Ativo":"Bloqueado"}</span>
                </div>
                <p className="text-xs text-slate-300 mt-1">Slug: <span className="font-mono">{t.slug}</span>{t.whatsapp && ` • ${t.whatsapp}`}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <a href={`/booking/${t.slug}`} target="_blank" className="text-xs px-3 py-1.5 rounded-md bg-white/10 hover:bg-white/20 flex items-center gap-1">Link reservas <ExternalLink className="h-3 w-3"/></a>
                <button onClick={async()=>{await setStatus({data:{id:t.id,status:t.status==="active"?"blocked":"active"}});qc.invalidateQueries({queryKey:["all-tenants"]});}} className="text-xs px-3 py-1.5 rounded-md bg-amber-500 hover:bg-amber-600 text-white font-semibold">{t.status==="active"?"Bloquear":"Liberar Acesso"}</button>
                <button className="text-xs px-3 py-1.5 rounded-md bg-white/10 hover:bg-white/20 flex items-center gap-1"><Database className="h-3 w-3"/> Backup</button>
                <button onClick={()=>setEditingTenant(t)} className="h-8 w-8 rounded-md bg-white/10 hover:bg-white/20 flex items-center justify-center"><Pencil className="h-3.5 w-3.5"/></button>
                <button className="h-8 w-8 rounded-md bg-rose-500/80 hover:bg-rose-50 flex items-center justify-center"><Trash2 className="h-3.5 w-3.5"/></button>
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-5 pt-4 border-t border-white/10">
              <div><div className="text-[10px] font-bold uppercase text-slate-400">Plano contratado</div><div className="text-sm font-semibold mt-1">{t.plan === "yearly" ? "Anual (R$ 49,90/ano)" : "Mensal (R$ 49,90/mês)"}</div></div>
              <div><div className="text-[10px] font-bold uppercase text-slate-400">Vencimento</div><div className="text-sm font-semibold mt-1">{t.plan_expires_at ? dateBR(t.plan_expires_at) : "—"}</div></div>
              <div><div className="text-[10px] font-bold uppercase text-slate-400">Limites</div><div className="text-sm font-semibold mt-1">Ilimitado</div></div>
              <div><div className="text-[10px] font-bold uppercase text-slate-400">White Label</div><div className="text-sm font-semibold mt-1 text-indigo-300">Ativado (Logo, Cores)</div></div>
            </div>
          </div>
        ))}
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
    owner_password: ""
  });
  const [loadingOwner, setLoadingOwner] = useState(true);

  useEffect(() => {
    getOwner({ data: { tenantId: tenant.id } })
      .then((res) => {
        if (res) {
          setF(prev => ({ ...prev, owner_email: res.email }));
        }
      })
      .finally(() => setLoadingOwner(false));
  }, [tenant.id]);

  async function save() {
    try {
      if (f.owner_password) {
        const passwordError = validateProjectPassword(f.owner_password);
        if (passwordError) return toast.error(passwordError);
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
        }
      });
      toast.success("Empresa atualizada com sucesso!");
      onDone();
    } catch (e: any) {
      toast.error(e.message || "Erro ao salvar alterações");
    }
  }

  return (
    <DialogContent className="sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>Editar Barbearia: {tenant.name}</DialogTitle>
      </DialogHeader>
      <div className="space-y-3 py-2">
        <div>
          <Label>Nome da barbearia</Label>
          <Input value={f.name} onChange={e=>setF({...f,name:e.target.value,slug:e.target.value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]/g,"-").replace(/-+/g,"-").replace(/^-|-$/g,"")})}/>
        </div>
        <div>
          <Label>Slug (URL do agendamento)</Label>
          <Input value={f.slug} onChange={e=>setF({...f,slug:e.target.value})}/>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>WhatsApp</Label>
            <Input value={f.whatsapp} onChange={e=>setF({...f,whatsapp:e.target.value})}/>
          </div>
          <div>
            <Label>Plano</Label>
            <Select value={f.plan} onValueChange={v=>setF({...f,plan:v})}>
              <SelectTrigger><SelectValue/></SelectTrigger>
              <SelectContent>
                <SelectItem value="monthly">Mensal</SelectItem>
                <SelectItem value="yearly">Anual</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Email do dono</Label>
            <Input type="email" disabled={loadingOwner} placeholder={loadingOwner ? "Carregando..." : "Email de acesso"} value={f.owner_email} onChange={e=>setF({...f,owner_email:e.target.value})}/>
          </div>
          <div>
            <Label>Nova senha (deixe vazio se não mudar)</Label>
            <Input type="password" autoComplete="new-password" placeholder="Mínimo de 8 caracteres" value={f.owner_password} onChange={e=>setF({...f,owner_password:e.target.value})}/>
            <p className="mt-1 text-[10px] text-slate-500">A única exigência é ter no mínimo 8 caracteres.</p>
          </div>
        </div>
      </div>
      <DialogFooter>
        <Button className="bg-indigo-600 hover:bg-indigo-700" onClick={save}>Salvar Alterações</Button>
      </DialogFooter>
    </DialogContent>
  );
}

function NewTenantDialog({ create, onDone }: any) {
  const [f, setF] = useState({ name: "", slug: "", whatsapp: "", plan: "monthly", owner_email: "", owner_password: "" });
  async function save() {
    if (!f.owner_email.trim()) return toast.error("Informe o e-mail do proprietário.");
    const passwordError = validateProjectPassword(f.owner_password);
    if (passwordError) return toast.error(passwordError);
    try {
      await create({ data: { ...f, owner_email: f.owner_email.trim() } as any });
      toast.success("Empresa cadastrada");
      onDone();
    } catch (e: any) {
      toast.error(e.message || "Erro ao cadastrar empresa");
    }
  }
  return (<DialogContent><DialogHeader><DialogTitle>Cadastrar nova empresa</DialogTitle></DialogHeader>
    <div className="space-y-3">
      <div><Label>Nome da barbearia</Label><Input value={f.name} onChange={e=>setF({...f,name:e.target.value,slug:e.target.value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]/g,"-").replace(/-+/g,"-").replace(/^-|-$/g,"")})}/></div>
      <div><Label>Slug (URL do agendamento)</Label><Input value={f.slug} onChange={e=>setF({...f,slug:e.target.value})}/></div>
      <div className="grid grid-cols-2 gap-3">
        <div><Label>WhatsApp</Label><Input value={f.whatsapp} onChange={e=>setF({...f,whatsapp:e.target.value})}/></div>
        <div><Label>Plano</Label><Select value={f.plan} onValueChange={v=>setF({...f,plan:v})}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="monthly">Mensal</SelectItem><SelectItem value="yearly">Anual</SelectItem></SelectContent></Select></div>
        <div><Label>Email do dono</Label><Input type="email" value={f.owner_email} onChange={e=>setF({...f,owner_email:e.target.value})}/></div>
        <div>
          <Label>Senha inicial</Label>
          <Input type="password" autoComplete="new-password" placeholder="Mínimo de 8 caracteres" value={f.owner_password} onChange={e=>setF({...f,owner_password:e.target.value})}/>
          <p className="mt-1 text-[10px] text-slate-500">A única exigência é ter no mínimo 8 caracteres.</p>
        </div>
      </div>
    </div>
    <DialogFooter><Button className="bg-indigo-600 hover:bg-indigo-700" onClick={save}>Cadastrar Empresa</Button></DialogFooter>
  </DialogContent>);
}

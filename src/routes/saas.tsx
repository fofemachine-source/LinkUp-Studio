import { createFileRoute, redirect, useNavigate, Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { createTenant, setTenantStatus, getTenantOwner, updateTenant } from "@/lib/tenants.functions";
import { ShieldCheck, Plus, Search, TrendingUp, Building2, DollarSign, Database, Terminal, Settings2, Pencil, Trash2, ExternalLink, Server } from "lucide-react";
import { useState, useMemo } from "react";
import { toast } from "sonner";
import { dateBR, brl } from "@/lib/format";

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
            <TabsTrigger value="financeiro" className="data-[state=active]:bg-indigo-600 data-[state=active]:text-white px-4 py-2"><DollarSign className="h-4 w-4 mr-2"/>Financeiro & Cobranças</TabsTrigger>
            <TabsTrigger value="backups" className="data-[state=active]:bg-indigo-600 data-[state=active]:text-white px-4 py-2"><Database className="h-4 w-4 mr-2"/>Backups de Segurança</TabsTrigger>
            <TabsTrigger value="logs" className="data-[state=active]:bg-indigo-600 data-[state=active]:text-white px-4 py-2"><Terminal className="h-4 w-4 mr-2"/>Logs & Auditorias</TabsTrigger>
            <TabsTrigger value="dev" className="data-[state=active]:bg-indigo-600 data-[state=active]:text-white px-4 py-2"><Settings2 className="h-4 w-4 mr-2"/>Painel Desenvolvedor</TabsTrigger>
          </TabsList>

          <TabsContent value="dashboard" className="mt-6"><DashboardTab /></TabsContent>
          <TabsContent value="empresas" className="mt-6"><EmpresasTab /></TabsContent>
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

import { useEffect } from "react";

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
            <Input type="text" placeholder="Senha de acesso" value={f.owner_password} onChange={e=>setF({...f,owner_password:e.target.value})}/>
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
  return (<DialogContent><DialogHeader><DialogTitle>Cadastrar nova empresa</DialogTitle></DialogHeader>
    <div className="space-y-3">
      <div><Label>Nome da barbearia</Label><Input value={f.name} onChange={e=>setF({...f,name:e.target.value,slug:e.target.value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]/g,"-").replace(/-+/g,"-").replace(/^-|-$/g,"")})}/></div>
      <div><Label>Slug (URL do agendamento)</Label><Input value={f.slug} onChange={e=>setF({...f,slug:e.target.value})}/></div>
      <div className="grid grid-cols-2 gap-3">
        <div><Label>WhatsApp</Label><Input value={f.whatsapp} onChange={e=>setF({...f,whatsapp:e.target.value})}/></div>
        <div><Label>Plano</Label><Select value={f.plan} onValueChange={v=>setF({...f,plan:v})}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="monthly">Mensal</SelectItem><SelectItem value="yearly">Anual</SelectItem></SelectContent></Select></div>
        <div><Label>Email do dono</Label><Input type="email" value={f.owner_email} onChange={e=>setF({...f,owner_email:e.target.value})}/></div>
        <div><Label>Senha inicial</Label><Input type="text" value={f.owner_password} onChange={e=>setF({...f,owner_password:e.target.value})}/></div>
      </div>
    </div>
    <DialogFooter><Button className="bg-indigo-600 hover:bg-indigo-700" onClick={async()=>{try{await create({data:f as any});toast.success("Empresa cadastrada");onDone();}catch(e:any){toast.error(e.message);}}}>Cadastrar Empresa</Button></DialogFooter>
  </DialogContent>);
}

import { createFileRoute, redirect, Outlet } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { createTenant, setTenantStatus } from "@/lib/tenants.functions";
import { Server, Plus, Building2, ExternalLink, LogOut } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { dateBR } from "@/lib/format";
import { useNavigate, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/saas")({
  ssr: false,
  beforeLoad: async () => {
    const { data: userRes } = await supabase.auth.getUser();
    if (!userRes.user) throw redirect({ to: "/auth" });
    const { data } = await supabase.from("user_roles").select("role").eq("user_id", userRes.user.id).eq("role", "super_admin");
    if (!data || data.length === 0) throw redirect({ to: "/app" });
    return {};
  },
  component: SaasPanel,
});

function SaasPanel() {
  const qc = useQueryClient(); const nav = useNavigate();
  const create = useServerFn(createTenant); const setStatus = useServerFn(setTenantStatus);
  const [open, setOpen] = useState(false);
  const { data: tenants } = useQuery({ queryKey: ["all-tenants"], queryFn: async () => (await supabase.from("tenants").select("*").order("created_at", { ascending: false })).data ?? [] });

  async function signOut() { await supabase.auth.signOut(); nav({ to: "/auth" }); }

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="h-16 border-b bg-background flex items-center px-6 gap-4">
        <Server className="h-6 w-6 text-primary" />
        <div><div className="font-semibold">Painel SaaS</div><div className="text-xs text-muted-foreground">Ernesth Soluções — Multi-tenant</div></div>
        <div className="flex-1"/>
        <Link to="/app" className="text-sm text-muted-foreground hover:text-foreground">Meu app</Link>
        <Button variant="ghost" size="sm" onClick={signOut}><LogOut className="h-4 w-4 mr-2"/>Sair</Button>
      </header>
      <main className="p-6 md:p-8 max-w-[1400px] mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div><h1 className="text-3xl font-semibold">Barbearias cadastradas</h1><p className="text-muted-foreground">{tenants?.length ?? 0} tenants no sistema.</p></div>
          <Dialog open={open} onOpenChange={setOpen}><DialogTrigger asChild><Button size="lg"><Plus className="h-4 w-4 mr-2"/>Nova Barbearia</Button></DialogTrigger>
            <NewTenantDialog create={create} onDone={()=>{setOpen(false);qc.invalidateQueries({queryKey:["all-tenants"]});}}/></Dialog>
        </div>
        <Card><CardContent className="p-6">
          <Table><TableHeader><TableRow><TableHead>Barbearia</TableHead><TableHead>Slug</TableHead><TableHead>Plano</TableHead><TableHead>Vencimento</TableHead><TableHead>Status</TableHead><TableHead>Link</TableHead><TableHead></TableHead></TableRow></TableHeader>
            <TableBody>{(tenants ?? []).map((t:any) => (
              <TableRow key={t.id}>
                <TableCell className="font-medium flex items-center gap-2"><Building2 className="h-4 w-4 text-muted-foreground"/>{t.name}</TableCell>
                <TableCell className="font-mono text-xs">{t.slug}</TableCell>
                <TableCell>{t.plan === "yearly" ? "Anual" : "Mensal"}</TableCell>
                <TableCell>{t.plan_expires_at ? dateBR(t.plan_expires_at) : "—"}</TableCell>
                <TableCell><span className={`text-xs px-2 py-0.5 rounded-full ${t.status==="active"?"bg-success/10 text-success":"bg-destructive/10 text-destructive"}`}>{t.status}</span></TableCell>
                <TableCell><a href={`/booking/${t.slug}`} target="_blank" className="text-primary text-xs hover:underline flex items-center gap-1">Reservas <ExternalLink className="h-3 w-3"/></a></TableCell>
                <TableCell><Button size="sm" variant="outline" onClick={async()=>{await setStatus({data:{id:t.id,status:t.status==="active"?"blocked":"active"}});qc.invalidateQueries({queryKey:["all-tenants"]});}}>{t.status==="active"?"Bloquear":"Ativar"}</Button></TableCell>
              </TableRow>
            ))}</TableBody></Table>
        </CardContent></Card>
      </main>
    </div>
  );
}

function NewTenantDialog({ create, onDone }: any) {
  const [f, setF] = useState({ name: "", slug: "", whatsapp: "", plan: "monthly", owner_email: "", owner_password: "" });
  return (<DialogContent><DialogHeader><DialogTitle>Nova barbearia</DialogTitle></DialogHeader>
    <div className="space-y-3">
      <div><Label>Nome</Label><Input value={f.name} onChange={e=>setF({...f,name:e.target.value,slug:e.target.value.toLowerCase().normalize("NFD").replace(/[^a-z0-9]/g,"-").replace(/-+/g,"-").replace(/^-|-$/g,"")})}/></div>
      <div><Label>Slug (URL do agendamento)</Label><Input value={f.slug} onChange={e=>setF({...f,slug:e.target.value})}/></div>
      <div className="grid grid-cols-2 gap-3">
        <div><Label>WhatsApp</Label><Input value={f.whatsapp} onChange={e=>setF({...f,whatsapp:e.target.value})}/></div>
        <div><Label>Plano</Label><Select value={f.plan} onValueChange={v=>setF({...f,plan:v})}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="monthly">Mensal</SelectItem><SelectItem value="yearly">Anual</SelectItem></SelectContent></Select></div>
        <div><Label>Email dono</Label><Input value={f.owner_email} onChange={e=>setF({...f,owner_email:e.target.value})}/></div>
        <div><Label>Senha dono</Label><Input value={f.owner_password} onChange={e=>setF({...f,owner_password:e.target.value})}/></div>
      </div>
    </div>
    <DialogFooter><Button onClick={async()=>{try{await create({data:f as any});toast.success("Barbearia criada");onDone();}catch(e:any){toast.error(e.message);}}}>Criar</Button></DialogFooter>
  </DialogContent>);
}

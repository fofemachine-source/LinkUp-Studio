import { createFileRoute, Navigate } from "@tanstack/react-router";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useCurrentTenant, useUserRole } from "@/hooks/use-tenant";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, Users, Scissors, Sparkles, Package, UserCog } from "lucide-react";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { brl } from "@/lib/format";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { createProfessionalAccess } from "@/lib/professionals.functions";
import { useServerFn } from "@tanstack/react-start";

export const Route = createFileRoute("/_authenticated/app/cadastros")({ component: CadastrosPage });

function CadastrosPage() {
  const { data: tenant } = useCurrentTenant();
  const { data: role, isLoading } = useUserRole(tenant?.id);

  if (!isLoading && role === "barber") {
    return <Navigate to="/app/agenda" replace />;
  }

  return (
    <div className="space-y-6 max-w-[1400px] mx-auto">
      <div>
        <h1 className="text-3xl font-semibold">Cadastros</h1>
        <p className="text-muted-foreground">Clientes, profissionais, serviços, produtos e usuários.</p>
      </div>
      <Tabs defaultValue="clients">
        <TabsList className="flex w-full overflow-x-auto justify-start md:grid md:grid-cols-5 max-w-2xl h-auto p-1 gap-1 md:gap-0 scrollbar-none bg-muted/40">
          <TabsTrigger value="clients" className="whitespace-nowrap"><Users className="h-4 w-4 mr-2" />Clientes</TabsTrigger>
          <TabsTrigger value="pros" className="whitespace-nowrap"><Scissors className="h-4 w-4 mr-2" />Profissionais</TabsTrigger>
          <TabsTrigger value="services" className="whitespace-nowrap"><Sparkles className="h-4 w-4 mr-2" />Serviços</TabsTrigger>
          <TabsTrigger value="products" className="whitespace-nowrap"><Package className="h-4 w-4 mr-2" />Produtos</TabsTrigger>
          <TabsTrigger value="users" className="whitespace-nowrap"><UserCog className="h-4 w-4 mr-2" />Usuários</TabsTrigger>
        </TabsList>
        <TabsContent value="clients"><ClientsTab /></TabsContent>
        <TabsContent value="pros"><ProsTab /></TabsContent>
        <TabsContent value="services"><ServicesTab /></TabsContent>
        <TabsContent value="products"><ProductsTab /></TabsContent>
        <TabsContent value="users"><UsersTab /></TabsContent>
      </Tabs>
    </div>
  );
}

function useTenantId() { return useCurrentTenant().data?.id; }

function ClientsTab() {
  const tenantId = useTenantId(); const qc = useQueryClient();
  const [open, setOpen] = useState(false); const [edit, setEdit] = useState<any>(null);
  const { data } = useQuery({ queryKey: ["clients", tenantId], enabled: !!tenantId, queryFn: async () => (await supabase.from("clients").select("*").eq("tenant_id", tenantId!).order("full_name")).data ?? [] });
  
  const { data: subscribers } = useQuery({
    queryKey: ["subs-sync-cadastros", tenantId],
    enabled: !!tenantId,
    queryFn: async () => (await supabase.from("subscribers").select("*").eq("tenant_id", tenantId!)).data ?? []
  });

  useEffect(() => {
    if (!data || !subscribers || subscribers.length === 0) return;

    const sync = async () => {
      let needsRefetch = false;
      for (const sub of subscribers) {
        const cleanSubPhone = sub.whatsapp?.replace(/\D/g, "");
        const existingClient = data.find((c: any) => 
          (sub.client_id && c.id === sub.client_id) || 
          (cleanSubPhone && c.whatsapp?.replace(/\D/g, "") === cleanSubPhone)
        );

        if (existingClient) {
          if (!existingClient.is_subscriber) {
            await supabase.from("clients").update({ is_subscriber: true }).eq("id", existingClient.id);
            needsRefetch = true;
          }
          if (!sub.client_id) {
            await supabase.from("subscribers").update({ client_id: existingClient.id }).eq("id", sub.id);
          }
        } else {
          // Insert client
          const { data: newClient } = await supabase
            .from("clients")
            .insert({
              tenant_id: tenantId!,
              full_name: sub.full_name,
              whatsapp: cleanSubPhone || null,
              is_subscriber: true
            })
            .select("id")
            .single();

          if (newClient) {
            await supabase.from("subscribers").update({ client_id: newClient.id }).eq("id", sub.id);
            needsRefetch = true;
          }
        }
      }
      if (needsRefetch) {
        qc.invalidateQueries({ queryKey: ["clients"] });
      }
    };
    sync();
  }, [data, subscribers, tenantId, qc]);

  return (
    <Card className="premium-card"><CardContent className="p-6 space-y-4">
      <div className="flex justify-between"><h3 className="font-semibold">{data?.length ?? 0} clientes</h3>
        <Dialog open={open} onOpenChange={(v)=>{setOpen(v); if(!v) setEdit(null);}}><DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" />Novo</Button></DialogTrigger>
          <ClientDialog key={edit?.id ?? "new"} client={edit} tenantId={tenantId} onDone={()=>{setOpen(false); setEdit(null); qc.invalidateQueries({queryKey:["clients"]});}}/></Dialog></div>
      <div className="overflow-x-auto -mx-6 px-6 md:mx-0 md:px-0">
        <Table><TableHeader><TableRow><TableHead>Nome</TableHead><TableHead>WhatsApp</TableHead><TableHead>Email</TableHead><TableHead>VIP</TableHead><TableHead></TableHead></TableRow></TableHeader>
          <TableBody>{(data ?? []).map((c: any) => (
            <TableRow key={c.id}><TableCell className="font-medium whitespace-nowrap">{c.full_name}</TableCell><TableCell className="whitespace-nowrap">{c.whatsapp}</TableCell><TableCell className="text-muted-foreground whitespace-nowrap">{c.email}</TableCell>
            <TableCell className="whitespace-nowrap">{c.is_subscriber && <span className="text-xs px-2.5 py-1 rounded bg-emerald-500/20 text-emerald-800 dark:text-emerald-300 font-bold">Assinante</span>}</TableCell>
            <TableCell className="text-right whitespace-nowrap"><Button size="icon" variant="ghost" onClick={()=>{setEdit(c);setOpen(true);}}><Pencil className="h-4 w-4"/></Button>
            <Button size="icon" variant="ghost" onClick={async()=>{if(confirm("Excluir?")){await supabase.from("clients").delete().eq("id",c.id);qc.invalidateQueries({queryKey:["clients"]});}}}><Trash2 className="h-4 w-4"/></Button></TableCell></TableRow>
          ))}</TableBody></Table>
      </div>
    </CardContent></Card>
  );
}

function ClientDialog({ client, tenantId, onDone }: any) {
  const [f, setF] = useState({ 
    full_name: client?.full_name ?? "", 
    whatsapp: client?.whatsapp ?? "", 
    email: client?.email ?? "", 
    address: client?.address ?? "", 
    notes: client?.notes ?? "",
    is_subscriber: client?.is_subscriber ?? false
  });
  async function save() {
    const payload = { ...f, tenant_id: tenantId };
    const { error } = client ? await supabase.from("clients").update(f).eq("id", client.id) : await supabase.from("clients").insert(payload);
    if (error) return toast.error(error.message);
    toast.success("Salvo"); onDone();
  }
  return (<DialogContent><DialogHeader><DialogTitle>{client?"Editar":"Novo"} cliente</DialogTitle></DialogHeader>
    <div className="space-y-3">
      <div><Label>Nome</Label><Input value={f.full_name} onChange={e=>setF({...f,full_name:e.target.value})}/></div>
      <div className="grid grid-cols-2 gap-3"><div><Label>WhatsApp</Label><Input value={f.whatsapp} onChange={e=>setF({...f,whatsapp:e.target.value})}/></div>
      <div><Label>Email</Label><Input value={f.email} onChange={e=>setF({...f,email:e.target.value})}/></div></div>
      <div><Label>Endereço</Label><Input value={f.address} onChange={e=>setF({...f,address:e.target.value})}/></div>
      <div><Label>Observações</Label><Input value={f.notes} onChange={e=>setF({...f,notes:e.target.value})}/></div>
      <div className="flex items-center gap-2 pt-2">
        <Switch id="client-is-subscriber" checked={f.is_subscriber} onCheckedChange={(v)=>setF({...f,is_subscriber:v})}/>
        <Label htmlFor="client-is-subscriber" className="cursor-pointer select-none">Cliente Assinante / VIP</Label>
      </div>
    </div><DialogFooter><Button onClick={save}>Salvar</Button></DialogFooter></DialogContent>);
}

function ProsTab() {
  const tenantId = useTenantId(); const qc = useQueryClient();
  const [open, setOpen] = useState(false); const [edit, setEdit] = useState<any>(null);
  const { data } = useQuery({ queryKey: ["pros-all", tenantId], enabled: !!tenantId, queryFn: async () => (await supabase.from("professionals").select("*").eq("tenant_id", tenantId!).order("full_name")).data ?? [] });
  return (
    <Card className="premium-card"><CardContent className="p-6 space-y-4">
      <div className="flex justify-between"><h3 className="font-semibold">{data?.length ?? 0} profissionais</h3>
        <Dialog open={open} onOpenChange={(v)=>{setOpen(v); if(!v) setEdit(null);}}><DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" />Novo</Button></DialogTrigger>
          <ProDialog key={edit?.id ?? "new"} pro={edit} tenantId={tenantId} onDone={()=>{setOpen(false);setEdit(null);qc.invalidateQueries({queryKey:["pros-all"]});qc.invalidateQueries({queryKey:["pros"]});}}/></Dialog></div>
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {(data ?? []).map((p:any) => (
          <div key={p.id} className="p-4 rounded-xl border flex items-center gap-3 bg-card premium-card">
            <Avatar className="h-14 w-14"><AvatarImage src={p.photo_url ?? undefined}/><AvatarFallback className="bg-primary/10 text-primary font-semibold">{p.full_name.split(" ").map((w:string)=>w[0]).slice(0,2).join("")}</AvatarFallback></Avatar>
            <div className="flex-1 min-w-0"><div className="font-medium truncate">{p.full_name}</div><div className="text-xs text-muted-foreground">{p.role_label} • {p.commission_pct}% comissão</div></div>
            <Button size="icon" variant="ghost" onClick={()=>{setEdit(p);setOpen(true);}}><Pencil className="h-4 w-4"/></Button>
          </div>
        ))}
      </div>
    </CardContent></Card>
  );
}

function validateAccessPassword(password: string) {
  if (password.length < 8) return "A senha precisa ter pelo menos 8 caracteres.";
  return null;
}

function friendlyAccessError(error: any) {
  const message = String(error?.message ?? "");
  if (/weak password|weak and easy to guess|known to be weak|password.*guess/i.test(message)) {
    return "A proteção contra senhas vazadas está ativa no Auth. Desative a opção Password HIBP Check para aceitar esta senha.";
  }
  return message || "Não foi possível criar o acesso ao sistema.";
}

function ProDialog({ pro, tenantId, onDone }: any) {
  const createAccess = useServerFn(createProfessionalAccess);
  const [f, setF] = useState({
    full_name: pro?.full_name ?? "",
    role_label: pro?.role_label ?? "Barbeiro",
    whatsapp: pro?.whatsapp ?? "",
    email: pro?.email ?? "",
    specialty: pro?.specialty ?? "",
    commission_pct: pro?.commission_pct ?? 45,
    lunch_start: pro?.lunch_start ?? "12:00",
    lunch_end: pro?.lunch_end ?? "13:00",
    photo_url: pro?.photo_url ?? "",
    active: pro?.active ?? true,
    work_days: pro?.work_days ?? [1,2,3,4,5,6],
    blocked_dates: pro?.blocked_dates ?? [],
  });
  const [file, setFile] = useState<File | null>(null);
  const [allowAccess, setAllowAccess] = useState(Boolean(pro?.auth_user_id));
  const [accessPassword, setAccessPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [newBlockedDate, setNewBlockedDate] = useState("");
  const dayNames = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
  const previewUrl = file ? URL.createObjectURL(file) : f.photo_url;
  async function save() {
    if (saving) return;
    if (!tenantId) return toast.error("Empresa não carregada. Recarregue a página e tente novamente.");
    if (!f.full_name.trim()) return toast.error("Informe o nome do colaborador");
    if (allowAccess && !f.email.trim()) return toast.error("Informe o e-mail para liberar acesso ao sistema");
    if (allowAccess && (!pro?.auth_user_id || accessPassword)) {
      const passwordError = validateAccessPassword(accessPassword);
      if (passwordError) return toast.error(passwordError);
    }
    setSaving(true);
    let photo_url = f.photo_url;
    if (file) {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `${tenantId}/pros/${Date.now()}-${safeName}`;
      const { error } = await supabase.storage.from("assets").upload(path, file, { upsert: true, contentType: file.type || "image/jpeg" });
      if (error) {
        setSaving(false);
        return toast.error("Erro no upload: " + error.message);
      }
      const { data: signed, error: signedError } = await supabase.storage.from("assets").createSignedUrl(path, 60 * 60 * 24 * 365 * 5);
      if (signedError || !signed?.signedUrl) {
        setSaving(false);
        return toast.error("Foto enviada, mas não foi possível gerar o link de exibição.");
      }
      photo_url = signed.signedUrl;
    }
    const payload: any = { ...f, photo_url, tenant_id: tenantId };
    const saved = pro
      ? await supabase.from("professionals").update({ ...f, photo_url }).eq("id", pro.id).select("id").single()
      : await supabase.from("professionals").insert(payload).select("id").single();
    const { data: savedPro, error } = saved;
    if (error) {
      setSaving(false);
      return toast.error(error.message);
    }
    if (allowAccess) {
      try {
        await createAccess({
          data: {
            tenantId,
            professionalId: savedPro.id,
            fullName: f.full_name,
            email: f.email,
            password: accessPassword || undefined,
          },
        });
      } catch (err: any) {
        toast.warning(`Profissional salvo, mas o acesso não foi criado. ${friendlyAccessError(err)}`);
        setSaving(false);
        onDone();
        return;
      }
    }
    toast.success("Salvo");
    setSaving(false);
    onDone();
  }
  return (<DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle className="flex items-center gap-2 text-primary uppercase text-sm tracking-wide">✓ {pro?"Editar":"Novo"} Registro</DialogTitle></DialogHeader>
    <div className="space-y-4">
      <div>
        <Label className="text-xs uppercase tracking-wide text-muted-foreground">Nome Colaborador</Label>
        <Input value={f.full_name} onChange={e=>setF({...f,full_name:e.target.value})} placeholder="Ex.: Richard Lyan"/>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><Label className="text-xs uppercase tracking-wide text-muted-foreground">WhatsApp</Label><Input value={f.whatsapp} onChange={e=>setF({...f,whatsapp:e.target.value})} placeholder="(99) 99999-9999"/></div>
        <div><Label className="text-xs uppercase tracking-wide text-muted-foreground">E-mail</Label><Input type="email" value={f.email} onChange={e=>setF({...f,email:e.target.value})} placeholder="email@exemplo.com"/></div>
        <div><Label className="text-xs uppercase tracking-wide text-muted-foreground">Cargo / Categoria</Label><Input value={f.role_label} onChange={e=>setF({...f,role_label:e.target.value})} placeholder="Barbeiro Sênior"/></div>
        <div><Label className="text-xs uppercase tracking-wide text-muted-foreground">Especialidade</Label><Input value={f.specialty} onChange={e=>setF({...f,specialty:e.target.value})} placeholder="Navalhado, pigmentação..."/></div>
        <div><Label className="text-xs uppercase tracking-wide text-muted-foreground">Comissão Padrão (%)</Label><Input type="number" value={f.commission_pct} onChange={e=>setF({...f,commission_pct:Number(e.target.value)})}/></div>
        <div><Label className="text-xs uppercase tracking-wide text-muted-foreground">Situação Cadastral</Label>
          <select className="w-full h-10 px-3 rounded-md border bg-background" value={f.active?"1":"0"} onChange={e=>setF({...f,active:e.target.value==="1"})}>
            <option value="1">Ativo Operando</option><option value="0">Inativo</option>
          </select>
        </div>
        <div><Label className="text-xs uppercase tracking-wide text-muted-foreground">Início Almoço</Label><Input type="time" value={f.lunch_start} onChange={e=>setF({...f,lunch_start:e.target.value})}/></div>
        <div><Label className="text-xs uppercase tracking-wide text-muted-foreground">Término Almoço</Label><Input type="time" value={f.lunch_end} onChange={e=>setF({...f,lunch_end:e.target.value})}/></div>
      </div>
      
      <div>
        <Label className="text-xs uppercase tracking-wide text-muted-foreground block mb-2">Dias de trabalho (Semanal)</Label>
        <div className="flex flex-wrap gap-1.5">
          {[1,2,3,4,5,6,7].map(d => (
            <button
              key={d}
              type="button"
              onClick={() => setF({
                ...f,
                work_days: f.work_days.includes(d) 
                  ? f.work_days.filter((x: number) => x !== d) 
                  : [...f.work_days, d].sort()
              })}
              className={`h-9 px-3 rounded-lg border text-xs font-semibold ${
                f.work_days.includes(d)
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-border hover:bg-muted"
              }`}
            >
              {dayNames[d % 7]}
            </button>
          ))}
        </div>
      </div>

      <div className="border rounded-lg p-3 space-y-2">
        <Label className="text-xs uppercase tracking-wide text-muted-foreground block">Folgas Específicas / Bloqueio de Datas</Label>
        <div className="flex gap-2">
          <Input 
            type="date" 
            value={newBlockedDate} 
            onChange={(e)=>setNewBlockedDate(e.target.value)} 
            className="max-w-[180px] h-9 text-xs"
          />
          <Button 
            type="button" 
            variant="outline"
            size="sm"
            onClick={() => {
              if (!newBlockedDate) return;
              if (f.blocked_dates.includes(newBlockedDate)) return toast.error("Data já adicionada.");
              setF({ ...f, blocked_dates: [...f.blocked_dates, newBlockedDate].sort() });
              setNewBlockedDate("");
            }}
            className="h-9 text-xs"
          >
            Adicionar Folga
          </Button>
        </div>
        <div className="flex flex-wrap gap-1.5 mt-2">
          {f.blocked_dates.map((dateStr: string) => {
            const [y, m, d] = dateStr.split("-");
            return (
              <div key={dateStr} className="flex items-center gap-1 text-[11px] px-2 py-1 rounded-md border bg-muted text-foreground">
                <span>{`${d}/${m}/${y}`}</span>
                <button 
                  type="button" 
                  onClick={() => setF({ ...f, blocked_dates: f.blocked_dates.filter((x: string) => x !== dateStr) })}
                  className="text-destructive font-bold hover:scale-110 px-1"
                >
                  ×
                </button>
              </div>
            );
          })}
          {f.blocked_dates.length === 0 && <span className="text-[10px] text-muted-foreground italic">Nenhuma data bloqueada cadastrada.</span>}
        </div>
      </div>
      <div>
        <Label className="text-xs uppercase tracking-wide text-muted-foreground">Foto do profissional</Label>
        <div className="flex items-center gap-3 p-3 rounded-md border">
          {previewUrl ? (
            <div className="relative">
              <img src={previewUrl} className="h-16 w-16 rounded-md object-cover"/>
              <button type="button" onClick={()=>{setF({...f,photo_url:""});setFile(null);}} className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-destructive text-destructive-foreground text-xs flex items-center justify-center">×</button>
            </div>
          ) : (
            <div className="h-16 w-16 rounded-md bg-muted flex items-center justify-center text-muted-foreground text-xs">Sem foto</div>
          )}
          <div className="flex-1">
            <Input type="file" accept="image/*" onChange={(e)=>setFile(e.target.files?.[0]??null)}/>
            <p className="text-[11px] text-muted-foreground mt-1">Carregue foto quadrada para exibição perfeita no quadrante de horários.</p>
            {file && <p className="text-[11px] text-primary mt-1">✓ {file.name} pronto para upload</p>}
          </div>
        </div>
      </div>
      <div className="rounded-md border p-3 space-y-3">
        <div className="flex items-center gap-2"><Switch checked={allowAccess} onCheckedChange={setAllowAccess}/><Label>Acessa o sistema também</Label></div>
        {allowAccess && (
          <div className="grid grid-cols-2 gap-3">
            <div><Label className="text-xs uppercase tracking-wide text-muted-foreground">Login / E-mail</Label><Input type="email" value={f.email} onChange={e=>setF({...f,email:e.target.value})} placeholder="email@exemplo.com"/></div>
            <div>
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">Senha de acesso</Label>
              <Input type="password" autoComplete="new-password" value={accessPassword} onChange={e=>setAccessPassword(e.target.value)} placeholder={pro?.auth_user_id ? "Nova senha opcional" : "Mínimo de 8 caracteres"}/>
              <p className="mt-1 text-[10px] text-muted-foreground">A única exigência é ter no mínimo 8 caracteres.</p>
            </div>
          </div>
        )}
      </div>
    </div>
    <DialogFooter className="gap-2"><Button variant="outline" onClick={onDone} disabled={saving}>Fechar</Button><Button onClick={save} disabled={saving}>{saving ? "SALVANDO..." : "SALVAR MUDANÇAS"}</Button></DialogFooter></DialogContent>);
}

function ServicesTab() {
  const tenantId = useTenantId(); const qc = useQueryClient();
  const [open, setOpen] = useState(false); const [edit, setEdit] = useState<any>(null);
  const { data } = useQuery({ queryKey: ["services-all", tenantId], enabled: !!tenantId, queryFn: async () => (await supabase.from("services").select("*").eq("tenant_id", tenantId!).order("name")).data ?? [] });
  return (<Card className="premium-card"><CardContent className="p-6 space-y-4">
    <div className="flex justify-between"><h3 className="font-semibold">{data?.length ?? 0} serviços</h3>
      <Dialog open={open} onOpenChange={(v)=>{setOpen(v); if(!v) setEdit(null);}}><DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2"/>Novo</Button></DialogTrigger>
        <ServiceDialog key={edit?.id ?? "new"} svc={edit} tenantId={tenantId} onDone={()=>{setOpen(false);setEdit(null);qc.invalidateQueries({queryKey:["services-all"]});}}/></Dialog></div>
    <div className="overflow-x-auto -mx-6 px-6 md:mx-0 md:px-0">
      <Table><TableHeader><TableRow><TableHead>Nome</TableHead><TableHead>Preço</TableHead><TableHead>Duração</TableHead><TableHead>VIP</TableHead><TableHead></TableHead></TableRow></TableHeader>
        <TableBody>{(data ?? []).map((s:any) => (
          <TableRow key={s.id}><TableCell className="font-medium whitespace-nowrap">{s.name}</TableCell><TableCell className="whitespace-nowrap">{brl(s.price)}</TableCell><TableCell className="whitespace-nowrap">{s.duration_min} min</TableCell>
          <TableCell className="whitespace-nowrap">{s.vip_only && <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary">VIP</span>}</TableCell>
          <TableCell className="text-right whitespace-nowrap">
            <Button size="icon" variant="ghost" onClick={()=>{setEdit(s);setOpen(true);}}><Pencil className="h-4 w-4"/></Button>
            <Button size="icon" variant="ghost" onClick={async()=>{if(confirm("Deseja realmente excluir este serviço?")){await supabase.from("services").delete().eq("id",s.id);qc.invalidateQueries({queryKey:["services-all"]});toast.success("Serviço excluído!");}}}><Trash2 className="h-4 w-4"/></Button>
          </TableCell></TableRow>
        ))}</TableBody></Table>
    </div>
  </CardContent></Card>);
}

function ServiceDialog({ svc, tenantId, onDone }: any) {
  const [f, setF] = useState({ name: svc?.name ?? "", category: svc?.category ?? "", price: svc?.price ?? 0, duration_min: svc?.duration_min ?? 30, vip_only: svc?.vip_only ?? false, active: svc?.active ?? true });
  const suggestions = ["Cabelo", "Barba", "Combo", "Coloração", "Sobrancelha", "Tratamento", "Infantil"];
  async function save() {
    const { error } = svc ? await supabase.from("services").update(f).eq("id", svc.id) : await supabase.from("services").insert({ ...f, tenant_id: tenantId });
    if (error) return toast.error(error.message);
    toast.success("Salvo"); onDone();
  }
  return (<DialogContent><DialogHeader><DialogTitle>{svc?"Editar":"Novo"} serviço</DialogTitle></DialogHeader>
    <div className="space-y-3">
      <div><Label>Nome</Label><Input value={f.name} onChange={e=>setF({...f,name:e.target.value})}/></div>
      <div>
        <Label>Categoria (digite ou escolha)</Label>
        <Input list="svc-categories" value={f.category} onChange={e=>setF({...f,category:e.target.value})} placeholder="Ex: Cabelo, Barba, Combo..." />
        <datalist id="svc-categories">{suggestions.map(s => <option key={s} value={s} />)}</datalist>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><Label>Preço</Label><Input type="number" step="0.01" value={f.price} onChange={e=>setF({...f,price:Number(e.target.value)})}/></div>
        <div><Label>Duração (min)</Label><Input type="number" value={f.duration_min} onChange={e=>setF({...f,duration_min:Number(e.target.value)})}/></div>
      </div>
      <div className="flex items-center gap-2"><Switch checked={f.vip_only} onCheckedChange={(v)=>setF({...f,vip_only:v})}/><Label>Exclusivo VIP</Label></div>
    </div><DialogFooter><Button onClick={save}>Salvar</Button></DialogFooter></DialogContent>);
}


function ProductsTab() {
  const tenantId = useTenantId(); const qc = useQueryClient();
  const [open, setOpen] = useState(false); const [edit, setEdit] = useState<any>(null);
  const { data } = useQuery({ queryKey: ["products-all", tenantId], enabled: !!tenantId, queryFn: async () => (await supabase.from("products").select("*").eq("tenant_id", tenantId!).order("name")).data ?? [] });
  return (<Card className="premium-card"><CardContent className="p-6 space-y-4">
    <div className="flex justify-between"><h3 className="font-semibold">{data?.length ?? 0} produtos</h3>
      <Dialog open={open} onOpenChange={(v)=>{setOpen(v); if(!v) setEdit(null);}}><DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" />Novo</Button></DialogTrigger>
        <ProductDialog key={edit?.id ?? "new"} product={edit} tenantId={tenantId} onDone={()=>{setOpen(false); setEdit(null); qc.invalidateQueries({queryKey:["products-all"]});}}/></Dialog></div>
    <div className="overflow-x-auto -mx-6 px-6 md:mx-0 md:px-0">
      <Table><TableHeader><TableRow><TableHead>Nome</TableHead><TableHead>Custo</TableHead><TableHead>Preço</TableHead><TableHead>Estoque</TableHead><TableHead></TableHead></TableRow></TableHeader>
        <TableBody>{(data ?? []).map((p:any)=>(<TableRow key={p.id}><TableCell className="font-medium whitespace-nowrap">{p.name}</TableCell><TableCell className="whitespace-nowrap text-muted-foreground">{brl(p.cost_price)}</TableCell><TableCell className="whitespace-nowrap">{brl(p.price)}</TableCell><TableCell className="whitespace-nowrap">{p.stock}</TableCell>
          <TableCell className="text-right whitespace-nowrap">
            <Button size="icon" variant="ghost" onClick={()=>{setEdit(p);setOpen(true);}}><Pencil className="h-4 w-4"/></Button>
            <Button size="icon" variant="ghost" onClick={async()=>{if(confirm("Excluir?")){await supabase.from("products").delete().eq("id",p.id);qc.invalidateQueries({queryKey:["products-all"]});}}}><Trash2 className="h-4 w-4"/></Button>
          </TableCell></TableRow>))}</TableBody></Table>
    </div>
  </CardContent></Card>);
}

function ProductDialog({ product, tenantId, onDone }: any) {
  const [f, setF] = useState({ name: product?.name ?? "", cost_price: product?.cost_price ?? 0, price: product?.price ?? 0, stock: product?.stock ?? 0 });
  async function save() {
    const payload = { ...f, tenant_id: tenantId };
    const { error } = product 
      ? await supabase.from("products").update(f).eq("id", product.id) 
      : await supabase.from("products").insert(payload);
    if (error) return toast.error(error.message);
    toast.success("Salvo"); onDone();
  }
  return (<DialogContent><DialogHeader><DialogTitle>{product ? "Editar" : "Novo"} produto</DialogTitle></DialogHeader>
    <div className="space-y-3">
      <div><Label>Nome</Label><Input value={f.name} onChange={e=>setF({...f,name:e.target.value})}/></div>
      <div className="grid grid-cols-3 gap-3">
        <div><Label>Custo</Label><Input type="number" step="0.01" value={f.cost_price} onChange={e=>setF({...f,cost_price:Number(e.target.value)})}/></div>
        <div><Label>Preço</Label><Input type="number" step="0.01" value={f.price} onChange={e=>setF({...f,price:Number(e.target.value)})}/></div>
        <div><Label>Estoque</Label><Input type="number" value={f.stock} onChange={e=>setF({...f,stock:Number(e.target.value)})}/></div>
      </div>
    </div><DialogFooter><Button onClick={save}>Salvar</Button></DialogFooter></DialogContent>);
}

function UsersTab() {
  return (<Card className="premium-card"><CardContent className="p-6 text-sm text-muted-foreground">Convide usuários criando uma nova conta pelo login. O primeiro cadastro vira "dono"; os demais viram "staff". Gerenciamento avançado em breve.</CardContent></Card>);
}

import { createFileRoute } from "@tanstack/react-router";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useCurrentTenant } from "@/hooks/use-tenant";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, Users, Scissors, Sparkles, Package, UserCog } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { brl } from "@/lib/format";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { createProfessionalAccess } from "@/lib/professionals.functions";
import { useServerFn } from "@tanstack/react-start";

export const Route = createFileRoute("/_authenticated/app/cadastros")({ component: CadastrosPage });

function CadastrosPage() {
  return (
    <div className="space-y-6 max-w-[1400px] mx-auto">
      <div>
        <h1 className="text-3xl font-semibold">Cadastros</h1>
        <p className="text-muted-foreground">Clientes, profissionais, serviços, produtos e usuários.</p>
      </div>
      <Tabs defaultValue="clients">
        <TabsList className="grid grid-cols-5 max-w-2xl">
          <TabsTrigger value="clients"><Users className="h-4 w-4 mr-2" />Clientes</TabsTrigger>
          <TabsTrigger value="pros"><Scissors className="h-4 w-4 mr-2" />Profissionais</TabsTrigger>
          <TabsTrigger value="services"><Sparkles className="h-4 w-4 mr-2" />Serviços</TabsTrigger>
          <TabsTrigger value="products"><Package className="h-4 w-4 mr-2" />Produtos</TabsTrigger>
          <TabsTrigger value="users"><UserCog className="h-4 w-4 mr-2" />Usuários</TabsTrigger>
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
  return (
    <Card><CardContent className="p-6 space-y-4">
      <div className="flex justify-between"><h3 className="font-semibold">{data?.length ?? 0} clientes</h3>
        <Dialog open={open} onOpenChange={(v)=>{setOpen(v); if(!v) setEdit(null);}}><DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" />Novo</Button></DialogTrigger>
          <ClientDialog client={edit} tenantId={tenantId} onDone={()=>{setOpen(false); setEdit(null); qc.invalidateQueries({queryKey:["clients"]});}}/></Dialog></div>
      <Table><TableHeader><TableRow><TableHead>Nome</TableHead><TableHead>WhatsApp</TableHead><TableHead>Email</TableHead><TableHead>VIP</TableHead><TableHead></TableHead></TableRow></TableHeader>
        <TableBody>{(data ?? []).map((c: any) => (
          <TableRow key={c.id}><TableCell className="font-medium">{c.full_name}</TableCell><TableCell>{c.whatsapp}</TableCell><TableCell className="text-muted-foreground">{c.email}</TableCell>
          <TableCell>{c.is_subscriber && <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary">VIP</span>}</TableCell>
          <TableCell className="text-right"><Button size="icon" variant="ghost" onClick={()=>{setEdit(c);setOpen(true);}}><Pencil className="h-4 w-4"/></Button>
          <Button size="icon" variant="ghost" onClick={async()=>{if(confirm("Excluir?")){await supabase.from("clients").delete().eq("id",c.id);qc.invalidateQueries({queryKey:["clients"]});}}}><Trash2 className="h-4 w-4"/></Button></TableCell></TableRow>
        ))}</TableBody></Table>
    </CardContent></Card>
  );
}

function ClientDialog({ client, tenantId, onDone }: any) {
  const [f, setF] = useState({ full_name: client?.full_name ?? "", whatsapp: client?.whatsapp ?? "", email: client?.email ?? "", address: client?.address ?? "", notes: client?.notes ?? "" });
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
    </div><DialogFooter><Button onClick={save}>Salvar</Button></DialogFooter></DialogContent>);
}

function ProsTab() {
  const tenantId = useTenantId(); const qc = useQueryClient();
  const [open, setOpen] = useState(false); const [edit, setEdit] = useState<any>(null);
  const { data } = useQuery({ queryKey: ["pros-all", tenantId], enabled: !!tenantId, queryFn: async () => (await supabase.from("professionals").select("*").eq("tenant_id", tenantId!).order("full_name")).data ?? [] });
  return (
    <Card><CardContent className="p-6 space-y-4">
      <div className="flex justify-between"><h3 className="font-semibold">{data?.length ?? 0} profissionais</h3>
        <Dialog open={open} onOpenChange={(v)=>{setOpen(v); if(!v) setEdit(null);}}><DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" />Novo</Button></DialogTrigger>
          <ProDialog key={edit?.id ?? "new"} pro={edit} tenantId={tenantId} onDone={()=>{setOpen(false);setEdit(null);qc.invalidateQueries({queryKey:["pros-all"]});qc.invalidateQueries({queryKey:["pros"]});}}/></Dialog></div>
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {(data ?? []).map((p:any) => (
          <div key={p.id} className="p-4 rounded-xl border flex items-center gap-3">
            <Avatar className="h-14 w-14"><AvatarImage src={p.photo_url ?? undefined}/><AvatarFallback className="bg-primary/10 text-primary font-semibold">{p.full_name.split(" ").map((w:string)=>w[0]).slice(0,2).join("")}</AvatarFallback></Avatar>
            <div className="flex-1 min-w-0"><div className="font-medium truncate">{p.full_name}</div><div className="text-xs text-muted-foreground">{p.role_label} • {p.commission_pct}% comissão</div></div>
            <Button size="icon" variant="ghost" onClick={()=>{setEdit(p);setOpen(true);}}><Pencil className="h-4 w-4"/></Button>
          </div>
        ))}
      </div>
    </CardContent></Card>
  );
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
  });
  const [file, setFile] = useState<File | null>(null);
  const [allowAccess, setAllowAccess] = useState(Boolean(pro?.auth_user_id));
  const [accessPassword, setAccessPassword] = useState("");
  const previewUrl = file ? URL.createObjectURL(file) : f.photo_url;
  async function save() {
    if (!tenantId) return toast.error("Empresa não carregada. Recarregue a página e tente novamente.");
    if (!f.full_name.trim()) return toast.error("Informe o nome do colaborador");
    if (allowAccess && !f.email.trim()) return toast.error("Informe o e-mail para liberar acesso ao sistema");
    if (allowAccess && !pro?.auth_user_id && accessPassword.length < 6) return toast.error("A senha de acesso precisa ter no mínimo 6 caracteres");
    let photo_url = f.photo_url;
    if (file) {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `${tenantId}/pros/${Date.now()}-${safeName}`;
      const { error } = await supabase.storage.from("assets").upload(path, file, { upsert: true, contentType: file.type || "image/jpeg" });
      if (error) return toast.error("Erro no upload: " + error.message);
      const { data: signed, error: signedError } = await supabase.storage.from("assets").createSignedUrl(path, 60 * 60 * 24 * 365 * 5);
      if (signedError || !signed?.signedUrl) return toast.error("Foto enviada, mas não foi possível gerar o link de exibição.");
      photo_url = signed.signedUrl;
    }
    const payload: any = { ...f, photo_url, tenant_id: tenantId };
    const saved = pro
      ? await supabase.from("professionals").update({ ...f, photo_url }).eq("id", pro.id).select("id").single()
      : await supabase.from("professionals").insert(payload).select("id").single();
    const { data: savedPro, error } = saved;
    if (error) return toast.error(error.message);
    if (allowAccess) {
      try {
        await createAccess({
          data: {
            tenantId,
            professionalId: savedPro.id,
            fullName: f.full_name,
            email: f.email,
            password: accessPassword || "123456",
          },
        });
      } catch (err: any) {
        return toast.error(err.message ?? "Profissional salvo, mas o acesso não foi criado.");
      }
    }
    toast.success("Salvo"); onDone();
  }
  return (<DialogContent className="max-w-2xl"><DialogHeader><DialogTitle className="flex items-center gap-2 text-primary uppercase text-sm tracking-wide">✓ {pro?"Editar":"Novo"} Registro</DialogTitle></DialogHeader>
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
        <Label className="text-xs uppercase tracking-wide text-muted-foreground">Foto do Barbeiro</Label>
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
            <div><Label className="text-xs uppercase tracking-wide text-muted-foreground">Senha de acesso</Label><Input type="text" value={accessPassword} onChange={e=>setAccessPassword(e.target.value)} placeholder={pro?.auth_user_id ? "Nova senha opcional" : "Mínimo 6 caracteres"}/></div>
          </div>
        )}
      </div>
    </div>
    <DialogFooter className="gap-2"><Button variant="outline" onClick={onDone}>Fechar</Button><Button onClick={save}>SALVAR MUDANÇAS</Button></DialogFooter></DialogContent>);
}

function ServicesTab() {
  const tenantId = useTenantId(); const qc = useQueryClient();
  const [open, setOpen] = useState(false); const [edit, setEdit] = useState<any>(null);
  const { data } = useQuery({ queryKey: ["services-all", tenantId], enabled: !!tenantId, queryFn: async () => (await supabase.from("services").select("*").eq("tenant_id", tenantId!).order("name")).data ?? [] });
  return (<Card><CardContent className="p-6 space-y-4">
    <div className="flex justify-between"><h3 className="font-semibold">{data?.length ?? 0} serviços</h3>
      <Dialog open={open} onOpenChange={(v)=>{setOpen(v); if(!v) setEdit(null);}}><DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2"/>Novo</Button></DialogTrigger>
        <ServiceDialog svc={edit} tenantId={tenantId} onDone={()=>{setOpen(false);setEdit(null);qc.invalidateQueries({queryKey:["services-all"]});}}/></Dialog></div>
    <Table><TableHeader><TableRow><TableHead>Nome</TableHead><TableHead>Preço</TableHead><TableHead>Duração</TableHead><TableHead>VIP</TableHead><TableHead></TableHead></TableRow></TableHeader>
      <TableBody>{(data ?? []).map((s:any) => (
        <TableRow key={s.id}><TableCell className="font-medium">{s.name}</TableCell><TableCell>{brl(s.price)}</TableCell><TableCell>{s.duration_min} min</TableCell>
        <TableCell>{s.vip_only && <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary">VIP</span>}</TableCell>
        <TableCell className="text-right"><Button size="icon" variant="ghost" onClick={()=>{setEdit(s);setOpen(true);}}><Pencil className="h-4 w-4"/></Button></TableCell></TableRow>
      ))}</TableBody></Table>
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
  const [open, setOpen] = useState(false);
  const { data } = useQuery({ queryKey: ["products-all", tenantId], enabled: !!tenantId, queryFn: async () => (await supabase.from("products").select("*").eq("tenant_id", tenantId!).order("name")).data ?? [] });
  const [f, setF] = useState({ name: "", price: 0, stock: 0 });
  return (<Card><CardContent className="p-6 space-y-4">
    <div className="flex justify-between"><h3 className="font-semibold">{data?.length ?? 0} produtos</h3>
      <Dialog open={open} onOpenChange={setOpen}><DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2"/>Novo</Button></DialogTrigger>
        <DialogContent><DialogHeader><DialogTitle>Novo produto</DialogTitle></DialogHeader>
          <div className="space-y-3"><div><Label>Nome</Label><Input value={f.name} onChange={e=>setF({...f,name:e.target.value})}/></div>
          <div className="grid grid-cols-2 gap-3"><div><Label>Preço</Label><Input type="number" step="0.01" value={f.price} onChange={e=>setF({...f,price:Number(e.target.value)})}/></div>
          <div><Label>Estoque</Label><Input type="number" value={f.stock} onChange={e=>setF({...f,stock:Number(e.target.value)})}/></div></div></div>
          <DialogFooter><Button onClick={async()=>{const{error}=await supabase.from("products").insert({...f,tenant_id:tenantId!});if(error)toast.error(error.message);else{toast.success("Salvo");setOpen(false);setF({name:"",price:0,stock:0});qc.invalidateQueries({queryKey:["products-all"]});}}}>Salvar</Button></DialogFooter>
        </DialogContent></Dialog></div>
    <Table><TableHeader><TableRow><TableHead>Nome</TableHead><TableHead>Preço</TableHead><TableHead>Estoque</TableHead></TableRow></TableHeader>
      <TableBody>{(data ?? []).map((p:any)=>(<TableRow key={p.id}><TableCell>{p.name}</TableCell><TableCell>{brl(p.price)}</TableCell><TableCell>{p.stock}</TableCell></TableRow>))}</TableBody></Table>
  </CardContent></Card>);
}

function UsersTab() {
  return (<Card><CardContent className="p-6 text-sm text-muted-foreground">Convide usuários criando uma nova conta pelo login. O primeiro cadastro vira "dono"; os demais viram "staff". Gerenciamento avançado em breve.</CardContent></Card>);
}

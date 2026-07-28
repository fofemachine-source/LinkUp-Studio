/* eslint-disable @typescript-eslint/no-explicit-any */
import { createFileRoute } from "@tanstack/react-router";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useCurrentTenant, useTenantAccess } from "@/hooks/use-tenant";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, Users, Scissors, Sparkles, Package, UserCog, KeyRound, ImageIcon, BriefcaseBusiness, ShieldCheck, CalendarCheck, Eye, BellRing } from "lucide-react";
import { useMemo, useState, useEffect } from "react";
import { toast } from "sonner";
import { brl, cpfMask } from "@/lib/format";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ImageCropDialog } from "@/components/ui/image-crop-dialog";
import { deleteProfessional } from "@/lib/professionals.functions";
import { useServerFn } from "@tanstack/react-start";
import {
  projectPasswordAuthErrorMessage,
  validateProjectPassword,
} from "@/lib/password-policy";
import { isValidCustomerCpf } from "@/lib/customer-auth";
import {
  DEFAULT_BOOKING_WORK_DAYS,
  normalizeBookingWeekdays,
} from "@/lib/booking-weekdays";
import {
  ACCESS_PERMISSION_OPTIONS,
  ACCESS_PROFILES,
  DEFAULT_PROFILE_PERMISSIONS,
  type AccessProfile,
  hasAccessPermission,
} from "@/lib/access-control";

export const Route = createFileRoute("/_authenticated/app/cadastros")({ component: CadastrosPage });

function CadastrosPage() {
  const { data: access } = useTenantAccess();
  const canClients = hasAccessPermission(access, "clients");
  const canManageStaff = hasAccessPermission(access, "manage_staff");
  const canServices = hasAccessPermission(access, "services");
  const canProducts = hasAccessPermission(access, "products");
  const initialTab = canClients
    ? "clients"
    : canManageStaff
      ? "pros"
      : canServices
        ? "services"
        : "products";

  return (
    <div className="space-y-6 max-w-[1400px] mx-auto">
      <div>
        <h1 className="text-3xl font-semibold">Cadastros</h1>
        <p className="text-muted-foreground">Clientes, profissionais, serviços, produtos e usuários.</p>
      </div>
      <Tabs defaultValue={initialTab}>
        <TabsList className="flex w-full overflow-x-auto justify-start max-w-3xl h-auto p-1 gap-1 scrollbar-none bg-muted/40">
          {canClients && <TabsTrigger value="clients" className="whitespace-nowrap"><Users className="h-4 w-4 mr-2" />Clientes</TabsTrigger>}
          {canManageStaff && <TabsTrigger value="pros" className="whitespace-nowrap"><Scissors className="h-4 w-4 mr-2" />Profissionais</TabsTrigger>}
          {canManageStaff && <TabsTrigger value="positions" className="whitespace-nowrap"><BriefcaseBusiness className="h-4 w-4 mr-2" />Cargos</TabsTrigger>}
          {canServices && <TabsTrigger value="services" className="whitespace-nowrap"><Sparkles className="h-4 w-4 mr-2" />Serviços</TabsTrigger>}
          {canProducts && <TabsTrigger value="products" className="whitespace-nowrap"><Package className="h-4 w-4 mr-2" />Produtos</TabsTrigger>}
          {canManageStaff && <TabsTrigger value="users" className="whitespace-nowrap"><UserCog className="h-4 w-4 mr-2" />Usuários</TabsTrigger>}
        </TabsList>
        {canClients && <TabsContent value="clients"><ClientsTab /></TabsContent>}
        {canManageStaff && <TabsContent value="pros"><ProsTab /></TabsContent>}
        {canManageStaff && <TabsContent value="positions"><PositionsTab /></TabsContent>}
        {canServices && <TabsContent value="services"><ServicesTab /></TabsContent>}
        {canProducts && <TabsContent value="products"><ProductsTab /></TabsContent>}
        {canManageStaff && <TabsContent value="users"><UsersTab /></TabsContent>}
      </Tabs>
    </div>
  );
}

function useTenantId() { return useCurrentTenant().data?.id; }

function currencyInputValue(value: unknown) {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount) && amount > 0 ? brl(amount) : "";
}

function currencyInputToNumber(value: unknown) {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (!digits) return 0;
  return Number(digits) / 100;
}

function formatCurrencyInput(value: string) {
  const digits = value.replace(/\D/g, "");
  if (!digits) return "";
  return brl(Number(digits) / 100);
}

function ClientsTab() {
  const tenantId = useTenantId(); const qc = useQueryClient();
  const [open, setOpen] = useState(false); const [edit, setEdit] = useState<any>(null);
  const [issuingAccessCodeFor, setIssuingAccessCodeFor] = useState<string | null>(null);
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

  async function copyAccessCode(code: string) {
    try {
      await navigator.clipboard.writeText(code);
      return true;
    } catch {
      const textArea = document.createElement("textarea");
      textArea.value = code;
      textArea.style.position = "fixed";
      textArea.style.opacity = "0";
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      const copied = document.execCommand("copy");
      textArea.remove();
      return copied;
    }
  }

  async function issueAccessCode(client: any) {
    if (!tenantId || issuingAccessCodeFor) return;
    if (!isValidCustomerCpf(String(client.cpf || ""))) {
      toast.error("Cadastre um CPF válido para liberar ou redefinir o acesso deste cliente.");
      return;
    }

    setIssuingAccessCodeFor(client.id);
    try {
      const { data: code, error } = await (supabase as any).rpc(
        "create_customer_booking_activation_code",
        { p_tenant_id: tenantId, p_client_id: client.id },
      );
      if (error || typeof code !== "string" || !code) {
        throw new Error(error?.message || "Não foi possível gerar o código de acesso.");
      }

      const copied = await copyAccessCode(code);
      toast.success(
        copied
          ? `Código ${code} copiado. Ele vale por 24h e libera ou redefine o acesso.`
          : `Código ${code}. Copie-o agora: ele vale por 24h e libera ou redefine o acesso.`,
        { duration: 12000 },
      );
    } catch (error: any) {
      toast.error(error?.message || "Não foi possível gerar o código de acesso.");
    } finally {
      setIssuingAccessCodeFor(null);
    }
  }

  return (
    <Card className="premium-card"><CardContent className="p-6 space-y-4">
      <div className="flex justify-between"><h3 className="font-semibold">{data?.length ?? 0} clientes</h3>
        <Dialog open={open} onOpenChange={(v)=>{setOpen(v); if(!v) setEdit(null);}}><DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" />Novo</Button></DialogTrigger>
          <ClientDialog key={edit?.id ?? "new"} client={edit} tenantId={tenantId} onDone={()=>{setOpen(false); setEdit(null); qc.invalidateQueries({queryKey:["clients"]});}}/></Dialog></div>
      <div className="overflow-x-auto -mx-6 px-6 md:mx-0 md:px-0">
        <Table><TableHeader><TableRow><TableHead>Nome</TableHead><TableHead>CPF</TableHead><TableHead>WhatsApp</TableHead><TableHead>Email</TableHead><TableHead>VIP</TableHead><TableHead></TableHead></TableRow></TableHeader>
          <TableBody>{(data ?? []).map((c: any) => (
            <TableRow key={c.id}><TableCell className="font-medium whitespace-nowrap">{c.full_name}</TableCell><TableCell className="whitespace-nowrap">{c.cpf ? cpfMask(c.cpf) : "—"}</TableCell><TableCell className="whitespace-nowrap">{c.whatsapp}</TableCell><TableCell className="text-muted-foreground whitespace-nowrap">{c.email}</TableCell>
            <TableCell className="whitespace-nowrap">{c.is_subscriber && <span className="text-xs px-2.5 py-1 rounded bg-emerald-500/20 text-emerald-800 dark:text-emerald-300 font-bold">Assinante</span>}</TableCell>
            <TableCell className="text-right whitespace-nowrap"><Button size="icon" variant="ghost" title="Liberar ou redefinir acesso" aria-label={`Liberar ou redefinir acesso de ${c.full_name}`} disabled={issuingAccessCodeFor === c.id} onClick={()=>issueAccessCode(c)}><KeyRound className="h-4 w-4"/></Button><Button size="icon" variant="ghost" onClick={()=>{setEdit(c);setOpen(true);}}><Pencil className="h-4 w-4"/></Button>
            <Button size="icon" variant="ghost" onClick={async()=>{if(confirm("Excluir?")){await supabase.from("clients").delete().eq("id",c.id);qc.invalidateQueries({queryKey:["clients"]});}}}><Trash2 className="h-4 w-4"/></Button></TableCell></TableRow>
          ))}</TableBody></Table>
      </div>
    </CardContent></Card>
  );
}

function ClientDialog({ client, tenantId, onDone }: any) {
  const [f, setF] = useState({ 
    full_name: client?.full_name ?? "", 
    cpf: cpfMask(client?.cpf ?? ""),
    whatsapp: client?.whatsapp ?? "", 
    email: client?.email ?? "", 
    address: client?.address ?? "", 
    notes: client?.notes ?? "",
    is_subscriber: client?.is_subscriber ?? false
  });
  async function save() {
    const cpf = f.cpf.replace(/\D/g, "");
    if (cpf && !isValidCustomerCpf(cpf)) {
      toast.error("Informe um CPF válido.");
      return;
    }
    const values = { ...f, cpf: cpf || null };
    const payload = { ...values, tenant_id: tenantId };
    const { error } = client ? await supabase.from("clients").update(values).eq("id", client.id) : await supabase.from("clients").insert(payload);
    if (error) return toast.error(error.message);
    toast.success("Salvo"); onDone();
  }
  return (<DialogContent><DialogHeader><DialogTitle>{client?"Editar":"Novo"} cliente</DialogTitle></DialogHeader>
    <div className="space-y-3">
      <div><Label>Nome</Label><Input value={f.full_name} onChange={e=>setF({...f,full_name:e.target.value})}/></div>
      <div className="grid grid-cols-2 gap-3"><div><Label>CPF</Label><Input inputMode="numeric" placeholder="000.000.000-00" value={f.cpf} onChange={e=>setF({...f,cpf:cpfMask(e.target.value)})}/></div>
      <div><Label>WhatsApp</Label><Input value={f.whatsapp} onChange={e=>setF({...f,whatsapp:e.target.value})}/></div></div>
      <div><Label>Email</Label><Input type="email" value={f.email} onChange={e=>setF({...f,email:e.target.value})}/></div>
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
  const { data: tenantAccess } = useTenantAccess();
  const canManageAccess =
    tenantAccess?.isSuperAdmin === true ||
    tenantAccess?.accessProfile === "owner" ||
    tenantAccess?.roles.some(
      (role) =>
        role.tenant_id === tenantId &&
        (role.role === "owner" || role.role === "super_admin"),
    ) === true;
  const removeProfessional = useServerFn(deleteProfessional);
  const [open, setOpen] = useState(false); const [edit, setEdit] = useState<any>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const { data } = useQuery({ queryKey: ["pros-all", tenantId], enabled: !!tenantId, queryFn: async () => (await supabase.from("professionals").select("*").eq("tenant_id", tenantId!).eq("active", true).order("full_name")).data ?? [] });
  async function refreshPublicCatalog(removedProfessionalId?: string) {
    if (removedProfessionalId) {
      qc.setQueriesData<any>({ queryKey: ["public-tenant"] }, (current: any) => {
        if (!current?.professionals) return current;
        return {
          ...current,
          professionals: current.professionals.filter(
            (professional: any) => professional.id !== removedProfessionalId,
          ),
        };
      });
    }
    await qc.invalidateQueries({ queryKey: ["public-tenant"] });
    window.localStorage.setItem("linkup:public-catalog-version", String(Date.now()));
  }
  async function openProfessional(p: any) {
    let currentProfessional = p;
    if (tenantId) {
      const { data: freshProfessional } = await supabase
        .from("professionals")
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("id", p.id)
        .maybeSingle();
      if (freshProfessional) {
        currentProfessional = freshProfessional;
        qc.setQueryData<any[]>(["pros-all", tenantId], (current) =>
          current?.map((item) => item.id === freshProfessional.id ? freshProfessional : item),
        );
      }
    }
    setEdit(currentProfessional);
    setOpen(true);
  }
  async function remove(p: any) {
    if (!tenantId || deletingId) return;
    const confirmed = window.confirm(
      `Excluir o cadastro de ${p.full_name}?\n\nSe houver agenda, vendas ou comissões vinculadas, o cadastro será arquivado para preservar o histórico.`,
    );
    if (!confirmed) return;
    setDeletingId(p.id);
    try {
      const result = await removeProfessional({
        data: { tenantId, professionalId: p.id },
      });
      toast.success(result.archived
        ? "Profissional arquivado. O histórico foi preservado."
        : "Cadastro do profissional excluído.");
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["pros-all"] }),
        qc.invalidateQueries({ queryKey: ["pros"] }),
        qc.invalidateQueries({ queryKey: ["pos-professionals"] }),
        qc.invalidateQueries({ queryKey: ["commission-professionals"] }),
        refreshPublicCatalog(p.id),
      ]);
    } catch (error: any) {
      toast.error(error?.message || "Não foi possível excluir o profissional.");
    } finally {
      setDeletingId(null);
    }
  }
  return (
    <Card className="premium-card"><CardContent className="p-6 space-y-4">
      <div className="flex justify-between"><h3 className="font-semibold">{data?.length ?? 0} profissionais</h3>
        <Dialog open={open} onOpenChange={(v)=>{setOpen(v); if(!v) setEdit(null);}}><DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" />Novo</Button></DialogTrigger>
          <ProDialog key={edit?.id ?? "new"} pro={edit} tenantId={tenantId} canManageAccess={canManageAccess} onDone={async()=>{
            setOpen(false);
            setEdit(null);
            await Promise.all([
              qc.invalidateQueries({queryKey:["pros-all", tenantId]}),
              qc.invalidateQueries({queryKey:["pros"]}),
              refreshPublicCatalog(),
            ]);
          }}/></Dialog></div>
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {(data ?? []).map((p:any) => (
          <div key={p.id} className="p-4 rounded-xl border flex items-center gap-3 bg-card premium-card">
            <Avatar className="h-14 w-14"><AvatarImage src={p.photo_url ?? undefined}/><AvatarFallback className="bg-primary/10 text-primary font-semibold">{p.full_name.split(" ").map((w:string)=>w[0]).slice(0,2).join("")}</AvatarFallback></Avatar>
            <div className="flex-1 min-w-0"><div className="font-medium truncate">{p.full_name}</div><div className="text-xs text-muted-foreground">{p.role_label} • {p.commission_pct}% comissão</div></div>
            <div className="flex items-center">
              <Button size="icon" variant="ghost" aria-label={`Editar ${p.full_name}`} onClick={()=>openProfessional(p)}><Pencil className="h-4 w-4"/></Button>
              {canManageAccess && (
                <Button
                  size="icon"
                  variant="ghost"
                  className="text-destructive hover:text-destructive"
                  aria-label={`Excluir ${p.full_name}`}
                  disabled={deletingId === p.id}
                  onClick={() => remove(p)}
                >
                  <Trash2 className="h-4 w-4"/>
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>
    </CardContent></Card>
  );
}

function PositionsTab() {
  const tenantId = useTenantId();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<any>(null);
  const [form, setForm] = useState({
    name: "",
    description: "",
    sort_order: 0,
    active: true,
  });
  const [saving, setSaving] = useState(false);

  const { data: positions = [] } = useQuery({
    queryKey: ["staff-positions", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("staff_positions")
        .select("*")
        .eq("tenant_id", tenantId)
        .order("sort_order")
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  function showDialog(position?: any) {
    setEdit(position ?? null);
    setForm({
      name: position?.name ?? "",
      description: position?.description ?? "",
      sort_order: Number(position?.sort_order ?? 0),
      active: position?.active ?? true,
    });
    setOpen(true);
  }

  async function save() {
    if (!tenantId || saving) return;
    const name = form.name.trim();
    if (!name) return toast.error("Informe o nome do cargo.");
    setSaving(true);
    const values = {
      tenant_id: tenantId,
      name,
      description: form.description.trim() || null,
      sort_order: Number(form.sort_order) || 0,
      active: form.active,
      updated_at: new Date().toISOString(),
    };
    const result = edit
      ? await (supabase as any)
          .from("staff_positions")
          .update(values)
          .eq("tenant_id", tenantId)
          .eq("id", edit.id)
      : await (supabase as any).from("staff_positions").insert(values);
    setSaving(false);
    if (result.error) return toast.error(result.error.message);
    toast.success(edit ? "Cargo atualizado." : "Cargo cadastrado.");
    setOpen(false);
    setEdit(null);
    await qc.invalidateQueries({ queryKey: ["staff-positions", tenantId] });
  }

  async function remove(position: any) {
    if (!tenantId) return;
    if (!window.confirm(`Excluir o cargo ${position.name}?`)) return;
    const { count, error: countError } = await (supabase as any)
      .from("professionals")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("position_id", position.id);
    if (countError) return toast.error(countError.message);
    if ((count ?? 0) > 0) {
      return toast.error(
        "Este cargo está vinculado a profissionais. Troque o cargo dessas pessoas antes de excluir.",
      );
    }
    const { error } = await (supabase as any)
      .from("staff_positions")
      .delete()
      .eq("tenant_id", tenantId)
      .eq("id", position.id);
    if (error) return toast.error(error.message);
    toast.success("Cargo excluído.");
    await qc.invalidateQueries({ queryKey: ["staff-positions", tenantId] });
  }

  return (
    <>
      <Card className="premium-card">
        <CardContent className="p-4 sm:p-6 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="font-semibold">Cargos da equipe</h3>
              <p className="text-sm text-muted-foreground">
                O cargo descreve a função. As permissões são definidas separadamente no acesso.
              </p>
            </div>
            <Button onClick={() => showDialog()} className="shrink-0">
              <Plus className="h-4 w-4 mr-2" />
              Novo cargo
            </Button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {positions.map((position: any) => (
              <div
                key={position.id}
                className="rounded-xl border bg-card p-4 flex items-start gap-3"
              >
                <div className="rounded-lg bg-primary/10 p-2 text-primary">
                  <BriefcaseBusiness className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-medium truncate">{position.name}</p>
                    {!position.active && (
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                        Inativo
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
                    {position.description || "Sem descrição."}
                  </p>
                </div>
                <div className="flex shrink-0">
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={`Editar ${position.name}`}
                    onClick={() => showDialog(position)}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="text-destructive hover:text-destructive"
                    aria-label={`Excluir ${position.name}`}
                    onClick={() => remove(position)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{edit ? "Editar cargo" : "Novo cargo"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Nome do cargo</Label>
              <Input
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
                placeholder="Ex.: Cabeleireira, Gerente, Recepção"
              />
            </div>
            <div>
              <Label>Descrição</Label>
              <Textarea
                value={form.description}
                onChange={(event) =>
                  setForm({ ...form, description: event.target.value })
                }
                placeholder="Descreva brevemente a função."
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label>Ordem</Label>
                <Input
                  type="number"
                  value={form.sort_order}
                  onChange={(event) =>
                    setForm({ ...form, sort_order: Number(event.target.value) })
                  }
                />
              </div>
              <div className="flex items-center justify-between rounded-lg border px-3 py-2">
                <div>
                  <Label htmlFor="position-active">Cargo ativo</Label>
                  <p className="text-xs text-muted-foreground">Disponível para novos vínculos.</p>
                </div>
                <Switch
                  id="position-active"
                  checked={form.active}
                  onCheckedChange={(active) => setForm({ ...form, active })}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving ? "Salvando..." : "Salvar cargo"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function friendlyAccessError(error: any) {
  return projectPasswordAuthErrorMessage(error, "Não foi possível criar o acesso ao sistema.");
}

async function updateProfessionalSystemAccess(input: {
  tenantId: string;
  professionalId: string;
  fullName: string;
  email: string;
  password?: string;
  enabled: boolean;
  accessProfile: AccessProfile;
  accessPermissions: string[];
  mustChangePassword: boolean;
  receiveOperationalNotifications: boolean;
}) {
  const { data, error } = await supabase.functions.invoke("manage-professional-access", {
    body: input,
  });

  if (error) {
    let message = error.message;
    const response = (error as any).context;
    if (typeof Response !== "undefined" && response instanceof Response) {
      try {
        const payload = await response.clone().json();
        message = payload?.error || message;
      } catch {
        // Mantém a mensagem original quando a resposta não é JSON.
      }
    }
    throw new Error(message);
  }
  if (!data?.ok) {
    throw new Error(data?.error || "Não foi possível atualizar o acesso ao sistema.");
  }

  return data as {
    ok: true;
    enabled: boolean;
    userId: string | null;
    created?: boolean;
    linkedExisting?: boolean;
    passwordReset?: boolean;
    mustChangePassword?: boolean;
    accessProfile?: AccessProfile;
    accessPermissions?: string[];
  };
}

function ProDialog({ pro, tenantId, onDone, canManageAccess }: any) {
  const qc = useQueryClient();
  const initialAccessProfile = (pro?.access_profile ??
    (pro?.auth_user_id ? "professional" : "professional")) as AccessProfile;
  const initialAccessPermissions =
    Array.isArray(pro?.access_permissions) && pro.access_permissions.length > 0
      ? pro.access_permissions
      : DEFAULT_PROFILE_PERMISSIONS[initialAccessProfile];
  const [f, setF] = useState<any>({
    full_name: pro?.full_name ?? "",
    role_label: pro?.role_label ?? "Barbeiro",
    position_id: pro?.position_id ?? "",
    whatsapp: pro?.whatsapp ?? "",
    email: pro?.email ?? "",
    specialty: pro?.specialty ?? "",
    commission_pct: pro?.commission_pct ?? 45,
    lunch_start: pro?.lunch_start ?? "12:00",
    lunch_end: pro?.lunch_end ?? "13:00",
    photo_url: pro?.photo_url ?? "",
    active: pro?.active ?? true,
    work_days: normalizeBookingWeekdays(pro?.work_days, DEFAULT_BOOKING_WORK_DAYS),
    blocked_dates: pro?.blocked_dates ?? [],
    access_profile: initialAccessProfile,
    access_permissions: [...initialAccessPermissions],
    available_for_booking: pro?.available_for_booking ?? pro?.active ?? true,
    show_on_booking: pro?.show_on_booking ?? pro?.active ?? true,
    receive_operational_notifications:
      pro?.receive_operational_notifications ??
      initialAccessPermissions.includes("receive_operational_notifications"),
    must_change_password: pro?.must_change_password ?? false,
  });
  const [file, setFile] = useState<File | null>(null);
  const [cropSource, setCropSource] = useState<File | null>(null);
  const [filePreviewUrl, setFilePreviewUrl] = useState<string | null>(null);
  const [professionalId, setProfessionalId] = useState<string | null>(pro?.id ?? null);
  const [persistedAuthUserId, setPersistedAuthUserId] = useState<string | null>(pro?.auth_user_id ?? null);
  const [allowAccess, setAllowAccess] = useState(Boolean(pro?.auth_user_id));
  const [accessPassword, setAccessPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [newBlockedDate, setNewBlockedDate] = useState("");
  const dayNames = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
  const { data: positions = [] } = useQuery({
    queryKey: ["staff-positions", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("staff_positions")
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("active", true)
        .order("sort_order")
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });
  useEffect(() => {
    if (!file) {
      setFilePreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setFilePreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  const previewUrl = filePreviewUrl || f.photo_url;
  const hasSystemAccess = Boolean(persistedAuthUserId);
  const systemAccessEnabled = allowAccess;
  function setAccessProfile(profile: AccessProfile) {
    const permissions = [...DEFAULT_PROFILE_PERMISSIONS[profile]];
    setF({
      ...f,
      access_profile: profile,
      access_permissions: permissions,
      receive_operational_notifications: permissions.includes(
        "receive_operational_notifications",
      ),
    });
  }

  function togglePermission(permission: string, checked: boolean) {
    const requiredForProfessional =
      f.access_profile === "professional" &&
      (permission === "own_agenda" || permission === "own_finance");
    if (requiredForProfessional && !checked) return;
    const current = new Set<string>(f.access_permissions ?? []);
    if (checked) current.add(permission);
    else current.delete(permission);
    const permissions = Array.from(current);
    setF({
      ...f,
      access_permissions: permissions,
      receive_operational_notifications:
        permission === "receive_operational_notifications"
          ? checked
          : f.receive_operational_notifications,
    });
  }

  const handleProfessionalImageFile = (selectedFile?: File) => {
    if (!selectedFile) return;
    const acceptedTypes = ["image/jpeg", "image/png", "image/webp"];
    if (!acceptedTypes.includes(selectedFile.type)) {
      toast.error("Use uma imagem JPG, PNG ou WEBP.");
      return;
    }
    if (selectedFile.size > 5 * 1024 * 1024) {
      toast.error("A imagem precisa ter no máximo 5 MB.");
      return;
    }
    setCropSource(selectedFile);
  };
  function updateProfessionalCache(savedProfessional: any) {
    qc.setQueryData<any[]>(["pros-all", tenantId], (current) => {
      if (!current) return [savedProfessional];
      const exists = current.some((item) => item.id === savedProfessional.id);
      const next = exists
        ? current.map((item) => item.id === savedProfessional.id ? { ...item, ...savedProfessional } : item)
        : [...current, savedProfessional];
      return next.sort((a, b) => String(a.full_name).localeCompare(String(b.full_name)));
    });
  }
  async function save() {
    if (saving) return;
    if (!tenantId) return toast.error("Empresa não carregada. Recarregue a página e tente novamente.");
    if (!f.full_name.trim()) return toast.error("Informe o nome do colaborador");
    if (
      !Number.isFinite(Number(f.commission_pct)) ||
      Number(f.commission_pct) < 0 ||
      Number(f.commission_pct) > 100
    ) {
      return toast.error("A comissão deve estar entre 0% e 100%.");
    }
    if (systemAccessEnabled && !f.email.trim()) return toast.error("Informe o e-mail para liberar acesso ao sistema");
    if (systemAccessEnabled && accessPassword) {
      const passwordError = validateProjectPassword(accessPassword);
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
    const normalizedForm: Record<string, unknown> = {
      ...f,
      work_days: normalizeBookingWeekdays(f.work_days, []),
    };
    delete normalizedForm.access_profile;
    delete normalizedForm.access_permissions;
    delete normalizedForm.must_change_password;
    delete normalizedForm.receive_operational_notifications;
    if (hasSystemAccess) delete normalizedForm.email;
    const payload: any = { ...normalizedForm, photo_url, tenant_id: tenantId };
    const saved = professionalId
      ? await supabase.from("professionals").update({ ...normalizedForm, photo_url }).eq("id", professionalId).select("id").single()
      : await supabase.from("professionals").insert(payload).select("id").single();
    const { data: savedPro, error } = saved;
    if (error) {
      setSaving(false);
      return toast.error(error.message);
    }
    setProfessionalId(savedPro.id);
    let authUserId = persistedAuthUserId;
    updateProfessionalCache({
      ...(pro ?? {}),
      ...normalizedForm,
      id: savedPro.id,
      tenant_id: tenantId,
      photo_url,
      auth_user_id: authUserId,
    });
    if (canManageAccess && (systemAccessEnabled || hasSystemAccess)) {
      try {
        const access = await updateProfessionalSystemAccess({
          tenantId,
          professionalId: savedPro.id,
          fullName: f.full_name,
          email: f.email,
          password: accessPassword || undefined,
          enabled: systemAccessEnabled,
          accessProfile: f.access_profile,
          accessPermissions: f.access_permissions,
          mustChangePassword:
            !hasSystemAccess && systemAccessEnabled
              ? true
              : Boolean(f.must_change_password),
          receiveOperationalNotifications: Boolean(
            f.receive_operational_notifications,
          ),
        });
        authUserId = access.userId;
        setPersistedAuthUserId(access.userId);
        setAllowAccess(access.enabled);
        setAccessPassword("");
        if (access.created) {
          toast.success(
            "Login criado. A senha provisória deverá ser trocada no primeiro acesso.",
          );
        } else if (access.passwordReset) {
          toast.success(
            "Senha provisória definida. O colaborador deverá criar uma senha pessoal no próximo acesso.",
          );
        } else if (access.linkedExisting && !hasSystemAccess) {
          toast.success("Login existente vinculado sem alterar a senha pessoal.");
        }
        updateProfessionalCache({
          ...(pro ?? {}),
          ...normalizedForm,
          id: savedPro.id,
          tenant_id: tenantId,
          photo_url,
          auth_user_id: access.enabled ? access.userId : null,
          access_profile: access.accessProfile ?? f.access_profile,
          access_permissions:
            access.accessPermissions ?? f.access_permissions,
          must_change_password: access.mustChangePassword ?? false,
        });
      } catch (err: any) {
        toast.warning(`Profissional salvo, mas o acesso não foi atualizado. ${friendlyAccessError(err)} Corrija e salve novamente.`);
        setSaving(false);
        return;
      }
    }
    const { data: persistedProfessional } = await supabase
      .from("professionals")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("id", savedPro.id)
      .maybeSingle();
    updateProfessionalCache(
      persistedProfessional
        ? { ...persistedProfessional, auth_user_id: persistedProfessional.auth_user_id ?? authUserId }
        : {
            ...(pro ?? {}),
            ...normalizedForm,
            id: savedPro.id,
            tenant_id: tenantId,
            photo_url,
            auth_user_id: authUserId,
          },
    );
    toast.success("Salvo");
    setSaving(false);
    await onDone();
  }
  return (<>
  <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle className="flex items-center gap-2 text-primary uppercase text-sm tracking-wide">✓ {pro?"Editar":"Novo"} Registro</DialogTitle></DialogHeader>
    <div className="space-y-4">
      <div>
        <Label className="text-xs uppercase tracking-wide text-muted-foreground">Nome Colaborador</Label>
        <Input value={f.full_name} onChange={e=>setF({...f,full_name:e.target.value})} placeholder="Ex.: Richard Lyan"/>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div><Label className="text-xs uppercase tracking-wide text-muted-foreground">WhatsApp</Label><Input value={f.whatsapp} onChange={e=>setF({...f,whatsapp:e.target.value})} placeholder="(99) 99999-9999"/></div>
        <div><Label className="text-xs uppercase tracking-wide text-muted-foreground">E-mail / Login</Label><Input type="email" value={f.email} disabled={hasSystemAccess} onChange={e=>setF({...f,email:e.target.value})} placeholder="email@exemplo.com"/></div>
        {canManageAccess && (
          <div>
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">
              Senha provisória de acesso
            </Label>
            <Input
              type="password"
              autoComplete="new-password"
              value={accessPassword}
              disabled={!systemAccessEnabled}
              onChange={(event) => setAccessPassword(event.target.value)}
              placeholder={
                systemAccessEnabled
                  ? "Defina a senha provisória"
                  : "Ative o acesso ao sistema"
              }
            />
            <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">
              Ao preencher, o colaborador entra com esta senha e será obrigado
              a criar uma senha pessoal no primeiro acesso.
            </p>
          </div>
        )}
        <div>
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">Cargo / Função</Label>
          <select
            className="w-full h-10 px-3 rounded-md border bg-background"
            value={f.position_id}
            onChange={(event) => {
              const position = positions.find(
                (item: any) => item.id === event.target.value,
              );
              setF({
                ...f,
                position_id: event.target.value || null,
                role_label: position?.name ?? f.role_label,
              });
            }}
          >
            <option value="">Selecione um cargo</option>
            {positions.map((position: any) => (
              <option key={position.id} value={position.id}>
                {position.name}
              </option>
            ))}
          </select>
          {positions.length === 0 && (
            <p className="mt-1 text-[10px] text-muted-foreground">
              Cadastre os cargos na aba Cargos.
            </p>
          )}
        </div>
        <div><Label className="text-xs uppercase tracking-wide text-muted-foreground">Especialidade</Label><Input value={f.specialty} onChange={e=>setF({...f,specialty:e.target.value})} placeholder="Navalhado, pigmentação..."/></div>
        <div><Label className="text-xs uppercase tracking-wide text-muted-foreground">Comissão Padrão (%)</Label><Input type="number" min="0" max="100" step="0.01" value={f.commission_pct} onChange={e=>setF({...f,commission_pct:e.target.value === "" ? 0 : Number(e.target.value)})}/><p className="mt-1 text-[10px] text-muted-foreground">Aplica-se a novos serviços concluídos. Lançamentos anteriores mantêm o percentual histórico.</p></div>
        <div><Label className="text-xs uppercase tracking-wide text-muted-foreground">Situação Cadastral</Label>
          <select className="w-full h-10 px-3 rounded-md border bg-background" value={f.active?"1":"0"} onChange={e=>setF({...f,active:e.target.value==="1"})}>
            <option value="1">Ativo Operando</option><option value="0">Inativo</option>
          </select>
        </div>
        <div><Label className="text-xs uppercase tracking-wide text-muted-foreground">Início Almoço</Label><Input type="time" value={f.lunch_start} onChange={e=>setF({...f,lunch_start:e.target.value})}/></div>
        <div><Label className="text-xs uppercase tracking-wide text-muted-foreground">Término Almoço</Label><Input type="time" value={f.lunch_end} onChange={e=>setF({...f,lunch_end:e.target.value})}/></div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="rounded-lg border p-3 flex items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 font-medium text-sm">
              <CalendarCheck className="h-4 w-4 text-primary" />
              Disponível para agendamento
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Permite selecionar esta pessoa em novos agendamentos internos.
            </p>
          </div>
          <Switch
            checked={Boolean(f.available_for_booking)}
            onCheckedChange={(available_for_booking) =>
              setF({
                ...f,
                available_for_booking,
                show_on_booking: available_for_booking
                  ? f.show_on_booking
                  : false,
              })
            }
          />
        </div>
        <div className="rounded-lg border p-3 flex items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 font-medium text-sm">
              <Eye className="h-4 w-4 text-primary" />
              Exibir na vitrine
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Mostra esta pessoa no link público de agendamento.
            </p>
          </div>
          <Switch
            checked={Boolean(f.show_on_booking)}
            disabled={!f.available_for_booking}
            onCheckedChange={(show_on_booking) =>
              setF({ ...f, show_on_booking })
            }
          />
        </div>
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
            <Input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e)=>{handleProfessionalImageFile(e.target.files?.[0] ?? undefined); e.currentTarget.value = "";}}/>
            <p className="text-[11px] text-muted-foreground mt-1">Ajuste o enquadramento antes do upload para a foto aparecer igual na agenda e no perfil.</p>
            {file && <p className="text-[11px] text-primary mt-1">✓ {file.name} pronto para upload</p>}
          </div>
        </div>
      </div>
      <div className="rounded-lg border p-4 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 font-medium">
              <KeyRound className="h-4 w-4 text-primary" />
              Acesso individual ao sistema
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              O acesso ao sistema é independente do cargo e da disponibilidade
              para agenda ou vitrine.
            </p>
          </div>
          <Switch
            checked={systemAccessEnabled}
            disabled={!canManageAccess}
            onCheckedChange={setAllowAccess}
          />
        </div>

        {!canManageAccess && (
          <p className="rounded-md bg-muted p-3 text-xs text-muted-foreground">
            Somente o proprietário pode criar, vincular, desativar ou alterar
            permissões de login.
          </p>
        )}

        {systemAccessEnabled && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                  Login / E-mail
                </Label>
                <Input
                  type="email"
                  value={f.email}
                  disabled={!canManageAccess || hasSystemAccess}
                  onChange={(event) => setF({ ...f, email: event.target.value })}
                  placeholder="email@exemplo.com"
                />
                {hasSystemAccess && (
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    Login já vinculado. A senha pertence ao próprio usuário.
                  </p>
                )}
              </div>
              <div>
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                  Papel no sistema
                </Label>
                <select
                  className="h-10 w-full rounded-md border bg-background px-3"
                  value={f.access_profile}
                  disabled={!canManageAccess}
                  onChange={(event) =>
                    setAccessProfile(event.target.value as AccessProfile)
                  }
                >
                  {ACCESS_PROFILES.map((profile) => (
                    <option key={profile.value} value={profile.value}>
                      {profile.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-primary" />
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                  Permissões
                </Label>
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {ACCESS_PERMISSION_OPTIONS.map((permission) => {
                  const requiredProfessionalPermission =
                    f.access_profile === "professional" &&
                    (permission.value === "own_agenda" ||
                      permission.value === "own_finance");
                  const locked =
                    !canManageAccess ||
                    f.access_profile === "owner" ||
                    requiredProfessionalPermission;
                  return (
                    <label
                      key={permission.value}
                      className="flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-xs"
                    >
                      <span>{permission.label}</span>
                      <Switch
                        checked={f.access_permissions.includes(permission.value)}
                        disabled={locked}
                        onCheckedChange={(checked) =>
                          togglePermission(permission.value, checked)
                        }
                      />
                    </label>
                  );
                })}
              </div>
              {f.access_profile === "professional" && (
                <p className="text-[10px] text-muted-foreground">
                  A própria agenda e o próprio resumo financeiro são garantias
                  mínimas deste papel. Dados financeiros de colegas e da loja
                  permanecem bloqueados.
                </p>
              )}
              {f.receive_operational_notifications && (
                <p className="flex items-center gap-2 text-[10px] text-muted-foreground">
                  <BellRing className="h-3.5 w-3.5" />
                  Este usuário receberá os alertas operacionais permitidos para
                  o papel configurado.
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
    <DialogFooter className="gap-2"><Button variant="outline" onClick={onDone} disabled={saving}>Fechar</Button><Button onClick={save} disabled={saving}>{saving ? "SALVANDO..." : "SALVAR MUDANÇAS"}</Button></DialogFooter></DialogContent>
    <ImageCropDialog
      file={cropSource}
      aspect={1}
      outputWidth={900}
      onCancel={() => setCropSource(null)}
      onConfirm={(croppedFile) => {
        setFile(croppedFile);
        setCropSource(null);
      }}
    />
  </>);
}

function ServicesTab() {
  const tenantId = useTenantId(); const qc = useQueryClient();
  const [open, setOpen] = useState(false); const [edit, setEdit] = useState<any>(null);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [categoryEdit, setCategoryEdit] = useState<any>(null);
  const { data } = useQuery({
    queryKey: ["services-all", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const result = await supabase
        .from("services")
        .select("*")
        .eq("tenant_id", tenantId!)
        .order("category", { ascending: true, nullsFirst: false })
        .order("display_order", { ascending: true, nullsFirst: false })
        .order("name");
      if (!result.error) return result.data ?? [];

      const canFallback = /display_order|schema cache|column/i.test(result.error.message);
      if (!canFallback) {
        toast.error(result.error.message);
        return [];
      }

      const legacyResult = await supabase
        .from("services")
        .select("*")
        .eq("tenant_id", tenantId!)
        .order("category", { ascending: true, nullsFirst: false })
        .order("name");
      if (legacyResult.error) {
        toast.error(legacyResult.error.message);
        return [];
      }
      return (legacyResult.data ?? []).map((service: any) => ({
        ...service,
        description: null,
        image_url: null,
        display_order: null,
      }));
    },
  });
  const { data: categories = [] } = useQuery({
    queryKey: ["service-categories", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const result = await (supabase as any)
        .from("service_categories")
        .select("*")
        .eq("tenant_id", tenantId!)
        .order("display_order", { ascending: true, nullsFirst: false })
        .order("name");
      if (!result.error) return result.data ?? [];

      const canFallback = /service_categories|schema cache|does not exist|could not find/i.test(result.error.message);
      if (!canFallback) toast.error(result.error.message);
      return [];
    },
  });
  const services = data ?? [];
  const normalizeCategoryName = (value: unknown) => String(value ?? "").trim().toLocaleLowerCase("pt-BR");
  const categoriesById = useMemo(
    () =>
      new Map<string, { id: string; name: string }>(
        (categories ?? []).map((category: any) => [
          String(category.id),
          { id: String(category.id), name: String(category.name ?? "") },
        ]),
      ),
    [categories],
  );
  const serviceCategoryName = (service: any) => {
    const linked = service.category_id ? categoriesById.get(service.category_id) : null;
    return linked?.name ?? service.category ?? "ServiÃ§os";
  };
  const deleteCategory = async (category: any) => {
    const usageCount = services.filter((service: any) => {
      if (service.category_id === category.id) return true;
      if (!service.category_id && normalizeCategoryName(service.category) === normalizeCategoryName(category.name)) return true;
      return false;
    }).length;
    if (usageCount > 0) {
      toast.error(`Categoria em uso por ${usageCount} serviÃ§o(s). Troque a categoria desses serviÃ§os antes de excluir.`);
      return;
    }
    if (!confirm(`Excluir a categoria "${category.name}"?`)) return;
    const { error } = await (supabase as any)
      .from("service_categories")
      .delete()
      .eq("id", category.id)
      .eq("tenant_id", tenantId);
    if (error) return toast.error(error.message);
    toast.success("Categoria excluÃ­da.");
    qc.invalidateQueries({ queryKey: ["service-categories", tenantId] });
  };
  return (<Card className="premium-card"><CardContent className="p-6 space-y-5">
    <div className="rounded-2xl border bg-muted/10 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="font-semibold">Categorias de serviços</h3>
          <p className="text-sm text-muted-foreground">Cadastre categorias e vincule os serviços para organizar a vitrine.</p>
        </div>
        <Dialog open={categoryOpen} onOpenChange={(v)=>{setCategoryOpen(v); if(!v) setCategoryEdit(null);}}>
          <DialogTrigger asChild><Button variant="outline"><Plus className="h-4 w-4 mr-2"/>Nova categoria</Button></DialogTrigger>
          <CategoryDialog
            key={categoryEdit?.id ?? "new-category"}
            category={categoryEdit}
            tenantId={tenantId}
            onDone={()=>{
              setCategoryOpen(false);
              setCategoryEdit(null);
              qc.invalidateQueries({ queryKey: ["service-categories", tenantId] });
              qc.invalidateQueries({ queryKey: ["services-all", tenantId] });
            }}
          />
        </Dialog>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {categories.length === 0 ? (
          <div className="w-full rounded-xl border border-dashed bg-background/70 p-4 text-sm text-muted-foreground">
            Nenhuma categoria cadastrada ainda. Crie pelo menos uma categoria para vincular aos serviços.
          </div>
        ) : (
          categories.map((category: any) => {
            const usageCount = services.filter((service: any) => service.category_id === category.id || (!service.category_id && normalizeCategoryName(service.category) === normalizeCategoryName(category.name))).length;
            return (
              <div key={category.id} className="flex items-center gap-2 rounded-full border bg-background px-3 py-2 text-sm shadow-sm">
                <span className="font-medium">{category.name}</span>
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{usageCount}</span>
                {!category.active && <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">Inativa</span>}
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={()=>{setCategoryEdit(category);setCategoryOpen(true);}}><Pencil className="h-3.5 w-3.5"/></Button>
                <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={()=>deleteCategory(category)}><Trash2 className="h-3.5 w-3.5"/></Button>
              </div>
            );
          })
        )}
      </div>
    </div>
    <div className="flex justify-between"><h3 className="font-semibold">{services.length} serviços</h3>
      <Dialog open={open} onOpenChange={(v)=>{setOpen(v); if(!v) setEdit(null);}}><DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2"/>Novo</Button></DialogTrigger>
        <ServiceDialog
          key={edit?.id ?? "new"}
          svc={edit}
          tenantId={tenantId}
          categories={categories}
          onDone={()=>{
            setOpen(false);
            setEdit(null);
            qc.invalidateQueries({queryKey:["services-all", tenantId]});
          }}
        /></Dialog></div>
    <div className="overflow-x-auto -mx-6 px-6 md:mx-0 md:px-0">
      <Table><TableHeader><TableRow><TableHead>Nome</TableHead><TableHead>Categoria</TableHead><TableHead>Preço</TableHead><TableHead>Duração</TableHead><TableHead>Ordem</TableHead><TableHead>VIP</TableHead><TableHead></TableHead></TableRow></TableHeader>
        <TableBody>{services.map((s:any) => (
          <TableRow key={s.id}><TableCell className="font-medium whitespace-nowrap">
            <div className="flex items-center gap-3">
              {s.image_url ? (
                <img src={s.image_url} alt="" className="h-10 w-10 rounded-xl object-cover" loading="lazy" />
              ) : (
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                  <ImageIcon className="h-4 w-4" />
                </div>
              )}
              <div>
                <div>{s.name}</div>
                {s.description && <div className="max-w-[240px] truncate text-xs font-normal text-muted-foreground">{s.description}</div>}
              </div>
            </div>
          </TableCell><TableCell className="whitespace-nowrap">{serviceCategoryName(s)}</TableCell><TableCell className="whitespace-nowrap">{brl(s.price)}</TableCell><TableCell className="whitespace-nowrap">{s.duration_min} min</TableCell><TableCell className="whitespace-nowrap">{s.display_order ?? "—"}</TableCell>
          <TableCell className="whitespace-nowrap">{s.vip_only && <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary">VIP</span>}</TableCell>
          <TableCell className="text-right whitespace-nowrap">
            <Button size="icon" variant="ghost" onClick={()=>{setEdit(s);setOpen(true);}}><Pencil className="h-4 w-4"/></Button>
            <Button size="icon" variant="ghost" onClick={async()=>{if(confirm("Deseja realmente excluir este serviço?")){await supabase.from("services").delete().eq("id",s.id);qc.invalidateQueries({queryKey:["services-all"]});toast.success("Serviço excluído!");}}}><Trash2 className="h-4 w-4"/></Button>
          </TableCell></TableRow>
        ))}</TableBody></Table>
    </div>
  </CardContent></Card>);
}

function CategoryDialog({ category, tenantId, onDone }: any) {
  const [f, setF] = useState({
    name: category?.name ?? "",
    description: category?.description ?? "",
    display_order: category?.display_order ?? "",
    active: category?.active ?? true,
  });
  const [saving, setSaving] = useState(false);
  async function save() {
    if (saving) return;
    if (!tenantId) return toast.error("Empresa não carregada. Recarregue a página e tente novamente.");
    if (!f.name.trim()) return toast.error("Informe o nome da categoria.");
    setSaving(true);
    const payload = {
      name: f.name.trim(),
      description: f.description.trim() || null,
      display_order: f.display_order === "" ? null : Number(f.display_order),
      active: Boolean(f.active),
    };
    const client = (supabase as any).from("service_categories");
    const { error } = category
      ? await client.update(payload).eq("id", category.id).eq("tenant_id", tenantId)
      : await client.insert({ ...payload, tenant_id: tenantId });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Categoria salva.");
    onDone();
  }
  return (
    <DialogContent className="max-w-lg">
      <DialogHeader><DialogTitle>{category ? "Editar" : "Nova"} categoria</DialogTitle></DialogHeader>
      <div className="space-y-3">
        <div><Label>Nome da categoria</Label><Input value={f.name} onChange={e=>setF({...f,name:e.target.value})} placeholder="Ex: Cabelo, Barba, Tratamentos..." /></div>
        <div><Label>Descrição opcional</Label><Textarea rows={3} value={f.description} onChange={e=>setF({...f,description:e.target.value})} placeholder="Texto interno para organizar os serviços." /></div>
        <div><Label>Ordem na vitrine</Label><Input type="number" value={f.display_order} onChange={e=>setF({...f,display_order:e.target.value === "" ? "" : Number(e.target.value)})} placeholder="Opcional" /></div>
        <div className="flex items-center gap-2"><Switch checked={f.active} onCheckedChange={(v)=>setF({...f,active:v})}/><Label>Ativa na vitrine</Label></div>
      </div>
      <DialogFooter><Button onClick={save} disabled={saving}>{saving ? "Salvando..." : "Salvar categoria"}</Button></DialogFooter>
    </DialogContent>
  );
}

function ServiceDialog({ svc, tenantId, categories = [], onDone }: any) {
  const [f, setF] = useState({
    name: svc?.name ?? "",
    category_id: svc?.category_id ?? "",
    category: svc?.category ?? "",
    description: svc?.description ?? "",
    image_url: svc?.image_url ?? "",
    display_order: svc?.display_order ?? "",
    price: currencyInputValue(svc?.price),
    duration_min: svc?.duration_min ?? 30,
    vip_only: svc?.vip_only ?? false,
    active: svc?.active ?? true,
  });
  const [file, setFile] = useState<File | null>(null);
  const [cropSource, setCropSource] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const previewUrl = useMemo(() => (file ? URL.createObjectURL(file) : f.image_url), [file, f.image_url]);
  const normalizeCategoryName = (value: unknown) => String(value ?? "").trim().toLocaleLowerCase("pt-BR");
  useEffect(() => {
    if (!file || !previewUrl) return;
    return () => URL.revokeObjectURL(previewUrl);
  }, [file, previewUrl]);
  useEffect(() => {
    if (f.category_id || !f.category || categories.length === 0) return;
    const match = categories.find((category: any) => normalizeCategoryName(category.name) === normalizeCategoryName(f.category));
    if (match) setF((current) => current.category_id ? current : { ...current, category_id: match.id });
  }, [categories, f.category, f.category_id]);
  const handleServiceImageFile = (selectedFile?: File) => {
    if (!selectedFile) {
      setFile(null);
      return;
    }
    const acceptedTypes = ["image/jpeg", "image/png", "image/webp"];
    if (!acceptedTypes.includes(selectedFile.type)) {
      toast.error("Use uma imagem JPG, PNG ou WEBP.");
      setFile(null);
      return;
    }
    if (selectedFile.size > 5 * 1024 * 1024) {
      toast.error("A imagem precisa ter no mÃ¡ximo 5 MB.");
      setFile(null);
      return;
    }
    setCropSource(selectedFile);
  };
  async function save() {
    if (saving) return;
    if (!tenantId) return toast.error("Empresa não carregada. Recarregue a página e tente novamente.");
    if (!f.name.trim()) return toast.error("Informe o nome do serviço.");
    setSaving(true);
    let image_url = f.image_url;
    if (file) {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `${tenantId}/services/${Date.now()}-${safeName}`;
      const { error: uploadError } = await supabase.storage.from("assets").upload(path, file, { upsert: true, contentType: file.type || "image/jpeg" });
      if (uploadError) {
        setSaving(false);
        return toast.error("Erro no upload: " + uploadError.message);
      }
      const { data: signed, error: signedError } = await supabase.storage.from("assets").createSignedUrl(path, 60 * 60 * 24 * 365 * 5);
      if (signedError || !signed?.signedUrl) {
        setSaving(false);
        return toast.error("Imagem enviada, mas não foi possível gerar o link de exibição.");
      }
      image_url = signed.signedUrl;
    }
    const selectedCategory = categories.find((category: any) => category.id === f.category_id);
    const payload = {
      name: f.name.trim(),
      category_id: f.category_id || null,
      category: (selectedCategory?.name ?? f.category.trim()) || null,
      description: f.description.trim() || null,
      image_url: image_url || null,
      display_order: f.display_order === "" ? null : Number(f.display_order),
      price: currencyInputToNumber(f.price),
      duration_min: Number(f.duration_min || 30),
      vip_only: Boolean(f.vip_only),
      active: Boolean(f.active),
    };
    const client = (supabase as any).from("services");
    const { error } = svc ? await client.update(payload).eq("id", svc.id) : await client.insert({ ...payload, tenant_id: tenantId });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Salvo"); onDone();
  }
  return (<>
  <DialogContent className="max-w-2xl"><DialogHeader><DialogTitle>{svc?"Editar":"Novo"} serviço</DialogTitle></DialogHeader>
    <div className="space-y-3">
      <div><Label>Nome</Label><Input value={f.name} onChange={e=>setF({...f,name:e.target.value})}/></div>
      <div><Label>Descrição</Label><Textarea rows={3} value={f.description} onChange={e=>setF({...f,description:e.target.value})} placeholder="Explique rapidamente o que está incluso neste serviço." /></div>
      <div>
        <Label>Categoria</Label>
        {categories.length > 0 ? (
          <select
            value={f.category_id}
            onChange={(event)=>{
              const category = categories.find((item: any) => item.id === event.target.value);
              setF({...f, category_id: event.target.value, category: category?.name ?? ""});
            }}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
          >
            <option value="">Sem categoria</option>
            {categories.filter((category: any) => category.active || category.id === f.category_id).map((category: any) => (
              <option key={category.id} value={category.id}>{category.name}{!category.active ? " (inativa)" : ""}</option>
            ))}
          </select>
        ) : (
          <Input value={f.category} onChange={e=>setF({...f,category:e.target.value})} placeholder="Cadastre categorias acima para vincular melhor." />
        )}
        <p className="mt-1 text-xs text-muted-foreground">As categorias cadastradas aqui aparecem agrupando os serviços na vitrine.</p>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div><Label>Preço</Label><Input type="text" inputMode="numeric" value={f.price} onChange={e=>setF({...f,price:formatCurrencyInput(e.target.value)})} placeholder="Digite o valor"/></div>
        <div><Label>Duração (min)</Label><Input type="number" value={f.duration_min} onChange={e=>setF({...f,duration_min:Number(e.target.value)})}/></div>
        <div><Label>Ordem</Label><Input type="number" value={f.display_order} onChange={e=>setF({...f,display_order:e.target.value === "" ? "" : Number(e.target.value)})} placeholder="Opcional"/></div>
      </div>
      <div className="rounded-xl border bg-muted/20 p-3">
        <Label>Imagem do serviço (opcional)</Label>
        <div className="mt-3 flex items-center gap-3">
          {previewUrl ? (
            <img src={previewUrl} alt="Prévia do serviço" className="h-20 w-24 rounded-xl object-cover" />
          ) : (
            <div className="flex h-20 w-24 items-center justify-center rounded-xl bg-background text-muted-foreground">
              <ImageIcon className="h-5 w-5" />
            </div>
          )}
          <div className="min-w-0 flex-1 space-y-2">
            <Input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event)=>{handleServiceImageFile(event.target.files?.[0] ?? undefined); event.currentTarget.value = "";}} />
            <p className="text-xs text-muted-foreground">Ajuste o enquadramento antes do upload. JPG, PNG ou WEBP, até 5 MB.</p>
            {(previewUrl || file) && (
              <Button type="button" variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={()=>{setF({...f,image_url:""});setFile(null);setCropSource(null);}}>
                Remover imagem
              </Button>
            )}
          </div>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex items-center gap-2"><Switch checked={f.vip_only} onCheckedChange={(v)=>setF({...f,vip_only:v})}/><Label>Exclusivo VIP</Label></div>
        <div className="flex items-center gap-2"><Switch checked={f.active} onCheckedChange={(v)=>setF({...f,active:v})}/><Label>Ativo na vitrine</Label></div>
      </div>
    </div><DialogFooter><Button onClick={save} disabled={saving}>{saving ? "Salvando..." : "Salvar"}</Button></DialogFooter></DialogContent>
    <ImageCropDialog
      file={cropSource}
      aspect={1}
      outputWidth={900}
      onCancel={() => setCropSource(null)}
      onConfirm={(croppedFile) => {
        setFile(croppedFile);
        setCropSource(null);
      }}
    />
  </>);
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
  return (
    <Card className="premium-card">
      <CardContent className="space-y-3 p-6">
        <div className="flex items-center gap-2 font-medium">
          <ShieldCheck className="h-4 w-4 text-primary" />
          Acessos vinculados aos profissionais
        </div>
        <p className="text-sm text-muted-foreground">
          Crie ou vincule o login individual na aba Profissionais. Ali o
          proprietário escolhe o papel, revisa cada permissão e decide,
          separadamente, se a pessoa participa da agenda e da vitrine.
        </p>
        <p className="text-xs text-muted-foreground">
          Contas novas ou senhas provisórias definidas pelo proprietário exigem
          a criação de uma senha pessoal no primeiro acesso.
        </p>
      </CardContent>
    </Card>
  );
}

/* eslint-disable @typescript-eslint/no-explicit-any */
import { createFileRoute, Navigate } from "@tanstack/react-router";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useCurrentTenant, useUserRole } from "@/hooks/use-tenant";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, Users, Scissors, Sparkles, Package, UserCog, KeyRound, ImageIcon } from "lucide-react";
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
          <ProDialog key={edit?.id ?? "new"} pro={edit} tenantId={tenantId} onDone={async()=>{
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
            </div>
          </div>
        ))}
      </div>
    </CardContent></Card>
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

  return data as { ok: true; enabled: boolean; userId: string | null };
}

function ProDialog({ pro, tenantId, onDone }: any) {
  const qc = useQueryClient();
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
    work_days: normalizeBookingWeekdays(pro?.work_days, DEFAULT_BOOKING_WORK_DAYS),
    blocked_dates: pro?.blocked_dates ?? [],
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
    if (systemAccessEnabled && !f.email.trim()) return toast.error("Informe o e-mail para liberar acesso ao sistema");
    if (systemAccessEnabled && (!persistedAuthUserId || accessPassword)) {
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
    const normalizedForm = {
      ...f,
      work_days: normalizeBookingWeekdays(f.work_days, []),
    };
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
    if (systemAccessEnabled || hasSystemAccess) {
      try {
        const access = await updateProfessionalSystemAccess({
          tenantId,
          professionalId: savedPro.id,
          fullName: f.full_name,
          email: f.email,
          password: accessPassword || undefined,
          enabled: systemAccessEnabled,
        });
        authUserId = access.userId;
        setPersistedAuthUserId(access.userId);
        setAllowAccess(access.enabled);
        updateProfessionalCache({
          ...(pro ?? {}),
          ...normalizedForm,
          id: savedPro.id,
          tenant_id: tenantId,
          photo_url,
          auth_user_id: access.enabled ? access.userId : null,
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
            <Input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e)=>{handleProfessionalImageFile(e.target.files?.[0] ?? undefined); e.currentTarget.value = "";}}/>
            <p className="text-[11px] text-muted-foreground mt-1">Ajuste o enquadramento antes do upload para a foto aparecer igual na agenda e no perfil.</p>
            {file && <p className="text-[11px] text-primary mt-1">✓ {file.name} pronto para upload</p>}
          </div>
        </div>
      </div>
      <div className="rounded-md border p-3 space-y-3">
        <div className="flex items-center gap-2">
          <Switch
            checked={systemAccessEnabled}
            onCheckedChange={setAllowAccess}
          />
          <Label>Acessa o sistema também</Label>
        </div>
        {systemAccessEnabled && (
          <div className="grid grid-cols-2 gap-3">
            <div><Label className="text-xs uppercase tracking-wide text-muted-foreground">Login / E-mail</Label><Input type="email" value={f.email} onChange={e=>setF({...f,email:e.target.value})} placeholder="email@exemplo.com"/></div>
            <div>
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">Senha de acesso</Label>
              <Input type="password" autoComplete="new-password" value={accessPassword} onChange={e=>setAccessPassword(e.target.value)} placeholder={hasSystemAccess ? "Nova senha opcional" : "Mínimo de 8 caracteres"}/>
              <p className="mt-1 text-[10px] text-muted-foreground">A única exigência é ter no mínimo 8 caracteres.</p>
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
    () => new Map((categories ?? []).map((category: any) => [category.id, category])),
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
  return (<Card className="premium-card"><CardContent className="p-6 text-sm text-muted-foreground">Convide usuários criando uma nova conta pelo login. O primeiro cadastro vira "dono"; os demais viram "staff". Gerenciamento avançado em breve.</CardContent></Card>);
}

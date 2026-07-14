import { createFileRoute } from "@tanstack/react-router";
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
import { Plus, Crown, Copy, MessageCircle } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { brl, cpfMask, dateBR } from "@/lib/format";
import { buildPixPayload } from "@/lib/pix";
import { QrCode } from "@/lib/qr";

export const Route = createFileRoute("/_authenticated/app/assinantes")({ component: SubscribersPage });

import React, { Component } from "react";

class ErrorBoundary extends Component<{children: React.ReactNode}, {hasError: boolean, err: any}> {
  constructor(props: any) { super(props); this.state = { hasError: false, err: null }; }
  static getDerivedStateFromError(err: any) { return { hasError: true, err }; }
  render() {
    if (this.state.hasError) return <DialogContent><div className="p-4 bg-red-100 text-red-600 rounded">Erro interno: {String(this.state.err?.message || this.state.err)}</div></DialogContent>;
    return this.props.children;
  }
}

function SubscribersPage() {
  const { data: tenant } = useCurrentTenant(); const tenantId = tenant?.id;
  const qc = useQueryClient(); 
  const [open, setOpen] = useState(false); 
  const [pixOpen, setPixOpen] = useState<any>(null);
  const [editingSub, setEditingSub] = useState<any>(null);

  const { data } = useQuery({ queryKey: ["subs", tenantId], enabled: !!tenantId, queryFn: async () => (await supabase.from("subscribers").select("*").eq("tenant_id", tenantId!).order("created_at", { ascending: false })).data ?? [] });

  const { data: completedAppts } = useQuery({
    queryKey: ["completed-appts-count", tenantId],
    enabled: !!tenantId,
    queryFn: async () => (await supabase.from("appointments").select("client_id, client_whatsapp, status").eq("tenant_id", tenantId!).eq("status", "completed")).data ?? []
  });

  async function toggleStatus(id: string, currentStatus: string) {
    const newStatus = currentStatus === "active" ? "inactive" : "active";
    const { error } = await supabase.from("subscribers").update({ status: newStatus }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Status atualizado!");
    qc.invalidateQueries({ queryKey: ["subs"] });
  }

  return (
    <div className="space-y-6 max-w-[1400px] mx-auto">
      <div className="flex justify-between items-start">
        <div><h1 className="text-3xl font-semibold flex items-center gap-2"><Crown className="h-7 w-7 text-primary" /> Assinantes VIP</h1>
          <p className="text-muted-foreground">Clientes com plano mensal ativo — pagamento via PIX.</p></div>
        <Dialog open={open} onOpenChange={setOpen}><DialogTrigger asChild><Button size="lg"><Plus className="h-4 w-4 mr-2"/>Novo Assinante</Button></DialogTrigger>
          <SubDialog tenantId={tenantId} onDone={()=>{setOpen(false);qc.invalidateQueries({queryKey:["subs"]});}}/></Dialog>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">TOTAL DE ASSINANTES</div><div className="text-2xl font-semibold mt-1">{data?.length ?? 0}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">ATIVOS</div><div className="text-2xl font-semibold mt-1 text-success">{data?.filter((s:any)=>s.status==="active").length ?? 0}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">RECEITA MENSAL</div><div className="text-2xl font-semibold mt-1 text-primary">{brl((data ?? []).filter((s:any)=>s.status==="active").reduce((a:number,b:any)=>a+Number(b.price||0),0))}</div></CardContent></Card>
      </div>

      <Card><CardContent className="p-6">
        <Table><TableHeader><TableRow><TableHead>Nome</TableHead><TableHead>CPF</TableHead><TableHead>WhatsApp</TableHead><TableHead>Plano</TableHead><TableHead>Vencimento</TableHead><TableHead>Cortes</TableHead><TableHead>Valor</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Ações</TableHead></TableRow></TableHeader>
          <TableBody>{(data ?? []).map((s:any) => {
            const parsedPlanName = (() => {
              try {
                if (s.plan?.startsWith("{") || s.plan?.startsWith("[")) {
                  return JSON.parse(s.plan).name;
                }
              } catch(e){}
              return s.plan;
            })();
            const formatNextDueAt = (dateStr?: string) => {
              if (!dateStr) return "-";
              const [y, m, d] = dateStr.split("-");
              return `${d}/${m}/${y}`;
            };
            const countCompleted = () => {
              if (!completedAppts) return 0;
              const cleanSubWa = s.whatsapp?.replace(/\D/g, "");
              return completedAppts.filter((a: any) => 
                (s.client_id && a.client_id === s.client_id) || 
                (cleanSubWa && a.client_whatsapp?.replace(/\D/g, "") === cleanSubWa)
              ).length;
            };
            const daysDiff = s.next_due_at ? Math.ceil((new Date(s.next_due_at + "T12:00:00").getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : null;
            const isNearExpiration = daysDiff !== null && daysDiff <= 5;
            
            const handleNotifyWhatsApp = () => {
              const formattedDate = s.next_due_at ? s.next_due_at.split("-").reverse().join("/") : "";
              const msg = `Olá, ${s.full_name}! Lembrança de sua assinatura VIP no plano "${parsedPlanName}". Ela vence no dia ${formattedDate}. Para continuar com o agendamento ilimitado e benefícios exclusivos, por favor, realize a renovação.`;
              const cleanPhone = s.whatsapp?.replace(/\D/g, "");
              window.open(`https://wa.me/55${cleanPhone}?text=${encodeURIComponent(msg)}`, "_blank");
            };

            return (
              <TableRow key={s.id}>
                <TableCell className="font-medium">{s.full_name}</TableCell>
                <TableCell className="font-mono text-xs">{cpfMask(s.cpf)}</TableCell>
                <TableCell>{s.whatsapp}</TableCell>
                <TableCell>{parsedPlanName}</TableCell>
                <TableCell>{formatNextDueAt(s.next_due_at)}</TableCell>
                <TableCell className="font-semibold text-center">{countCompleted()}</TableCell>
                <TableCell>{brl(s.price)}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Switch checked={s.status === "active"} onCheckedChange={() => toggleStatus(s.id, s.status)} />
                    <span className={`text-xs px-2 py-0.5 rounded-full ${s.status==="active"?"bg-success/10 text-success":"bg-muted text-muted-foreground"}`}>{s.status === "active" ? "Ativo" : "Inativo"}</span>
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-2">
                    <Button 
                      size="sm" 
                      variant={isNearExpiration ? "default" : "outline"} 
                      className={isNearExpiration ? "bg-emerald-600 hover:bg-emerald-700 text-white font-semibold" : "text-emerald-600 hover:text-emerald-700"}
                      onClick={handleNotifyWhatsApp}
                    >
                      <MessageCircle className="h-4 w-4 mr-1" /> Notificar
                    </Button>
                    <Button size="sm" variant="outline" onClick={()=>setEditingSub(s)}>Editar</Button>
                    <Button size="sm" variant="outline" onClick={()=>setPixOpen(s)}>Gerar PIX</Button>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}</TableBody></Table>
      </CardContent></Card>

      <Dialog open={!!editingSub} onOpenChange={(v)=>{if(!v)setEditingSub(null);}}>
        {editingSub && <SubDialog subscriber={editingSub} tenantId={tenantId} onDone={()=>{setEditingSub(null);qc.invalidateQueries({queryKey:["subs"]});}}/>}
      </Dialog>

      <Dialog open={!!pixOpen} onOpenChange={(v)=>{if(!v)setPixOpen(null);}}>
        <ErrorBoundary>
          {pixOpen && <PixDialog sub={pixOpen} tenant={tenant} />}
        </ErrorBoundary>
      </Dialog>
    </div>
  );
}

function SubDialog({ tenantId, onDone, subscriber }: { tenantId?: string; onDone: () => void; subscriber?: any }) {
  const [fullName, setFullName] = useState(subscriber?.full_name ?? "");
  const [cpf, setCpf] = useState(subscriber?.cpf ?? "");
  const [whatsapp, setWhatsapp] = useState(subscriber?.whatsapp ?? "");
  const [price, setPrice] = useState<number>(subscriber?.price ?? 89.90);
  
  // Parse plan JSON if possible
  let initialPlanName = "Corte VIP Mensal";
  let initialServices: string[] = [];
  let initialProId = "";
  
  if (subscriber?.plan) {
    try {
      if (subscriber.plan.startsWith("{") || subscriber.plan.startsWith("[")) {
        const parsed = JSON.parse(subscriber.plan);
        initialPlanName = parsed.name || subscriber.plan;
        initialServices = parsed.services || [];
        initialProId = parsed.professional_id || "";
      } else {
        initialPlanName = subscriber.plan;
      }
    } catch (e) {
      initialPlanName = subscriber.plan;
    }
  }
  
  const [planName, setPlanName] = useState(initialPlanName);
  const [selectedSvcs, setSelectedSvcs] = useState<string[]>(initialServices);
  const [proId, setProId] = useState<string>(initialProId);
  const [nextDueAt, setNextDueAt] = useState(subscriber?.next_due_at ?? "");
  const [busy, setBusy] = useState(false);

  const { data: services } = useQuery({ queryKey: ["svc-sub", tenantId], enabled: !!tenantId, queryFn: async () => (await supabase.from("services").select("*").eq("tenant_id", tenantId!).eq("active", true).order("name")).data ?? [] });
  const { data: pros } = useQuery({ queryKey: ["pro-sub", tenantId], enabled: !!tenantId, queryFn: async () => (await supabase.from("professionals").select("*").eq("tenant_id", tenantId!).eq("active", true).order("full_name")).data ?? [] });

  async function save() {
    if (!fullName.trim()) return toast.error("Informe o nome do assinante.");
    const cleanCpf = cpf.replace(/\D/g,"");
    if (cleanCpf.length !== 11) return toast.error("CPF inválido.");
    
    setBusy(true);
    try {
      const planPayload = JSON.stringify({
        name: planName,
        services: selectedSvcs,
        professional_id: proId
      });
      
      const cleanPhone = whatsapp.replace(/\D/g, "");

      // 1. Find or create client in clients table and mark as subscriber
      let finalClientId = subscriber?.client_id;
      if (!finalClientId && cleanPhone) {
        const { data: existingClient } = await supabase
          .from("clients")
          .select("id")
          .eq("tenant_id", tenantId!)
          .eq("whatsapp", cleanPhone)
          .maybeSingle();

        if (existingClient) {
          finalClientId = existingClient.id;
          await supabase.from("clients").update({ is_subscriber: true }).eq("id", finalClientId);
        } else {
          const { data: newClient } = await supabase
            .from("clients")
            .insert({
              tenant_id: tenantId!,
              full_name: fullName,
              whatsapp: cleanPhone,
              is_subscriber: true
            })
            .select("id")
            .single();
          if (newClient) finalClientId = newClient.id;
        }
      } else if (finalClientId) {
        await supabase.from("clients").update({ is_subscriber: true }).eq("id", finalClientId);
      }
      
      const payload = {
        tenant_id: tenantId!,
        client_id: finalClientId || null,
        full_name: fullName,
        cpf: cleanCpf,
        whatsapp: cleanPhone,
        plan: planPayload,
        price,
        status: subscriber?.status ?? "active",
        next_due_at: nextDueAt || null
      };

      let error;
      if (subscriber?.id) {
        const { error: err } = await supabase.from("subscribers").update(payload).eq("id", subscriber.id);
        error = err;
      } else {
        const { error: err } = await supabase.from("subscribers").insert(payload);
        error = err;
      }

      if (error) throw error;
      toast.success(subscriber ? "Assinante atualizado!" : "Assinante cadastrado!");
      onDone();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>{subscriber ? "Editar Assinante VIP" : "Novo Assinante VIP"}</DialogTitle>
      </DialogHeader>
      <div className="space-y-4 my-2">
        <div>
          <Label>Nome completo</Label>
          <Input value={fullName} onChange={e=>setFullName(e.target.value)} placeholder="Ex: João Silva" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>CPF</Label>
            <Input value={cpfMask(cpf)} onChange={e=>setCpf(e.target.value)} placeholder="000.000.000-00" />
          </div>
          <div>
            <Label>WhatsApp</Label>
            <Input value={whatsapp} onChange={e=>setWhatsapp(e.target.value)} placeholder="(99) 99999-9999" />
          </div>
        </div>
        
        <div className="border-t pt-4 space-y-4">
          <div className="text-sm font-semibold uppercase tracking-wider text-primary">Configurações do Plano</div>
          
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Label>Nome do Plano</Label>
              <Input value={planName} onChange={e=>setPlanName(e.target.value)} placeholder="Ex: Plano Mensal Corte" />
            </div>
            <div>
              <Label>Valor mensal</Label>
              <Input type="number" step="0.01" value={price} onChange={e=>setPrice(Number(e.target.value))} />
            </div>
            <div>
              <Label>Data de Vencimento</Label>
              <Input type="date" value={nextDueAt} onChange={e=>setNextDueAt(e.target.value)} />
            </div>
          </div>

          <div>
            <Label>Barbeiro Vinculado (Predefinido)</Label>
            <select 
              value={proId} 
              onChange={e=>setProId(e.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <option value="">Nenhum (Cliente escolhe na hora)</option>
              {(pros ?? []).map((p: any) => (
                <option key={p.id} value={p.id}>{p.full_name}</option>
              ))}
            </select>
          </div>

          <div>
            <Label className="mb-2 block">Serviços Inclusos no Plano</Label>
            <div className="border rounded-lg p-3 max-h-40 overflow-y-auto space-y-2 bg-muted/20">
              {(services ?? []).map((s: any) => (
                <label key={s.id} className="flex items-center gap-2 text-xs font-medium cursor-pointer py-1 hover:bg-muted/40 px-1 rounded transition-colors">
                  <input 
                    type="checkbox" 
                    checked={selectedSvcs.includes(s.id)}
                    onChange={(e) => {
                      let updatedSvcs = [];
                      if (e.target.checked) {
                        updatedSvcs = [...selectedSvcs, s.id];
                      } else {
                        updatedSvcs = selectedSvcs.filter(id => id !== s.id);
                      }
                      setSelectedSvcs(updatedSvcs);
                      
                      // Auto-sum prices of selected services
                      const sum = updatedSvcs.reduce((acc, id) => {
                        const matched = (services ?? []).find(x => x.id === id);
                        return acc + Number(matched?.price || 0);
                      }, 0);
                      setPrice(Number(sum.toFixed(2)));
                    }}
                    className="h-4 w-4 rounded border-input bg-background text-primary focus:ring-primary cursor-pointer"
                  />
                  <div className="flex-1 flex justify-between">
                    <span>{s.name}</span>
                    <span className="text-muted-foreground">{brl(s.price)}</span>
                  </div>
                </label>
              ))}
              {(services ?? []).length === 0 && (
                <div className="text-xs text-muted-foreground text-center py-2">Nenhum serviço disponível</div>
              )}
            </div>
          </div>
        </div>
      </div>
      <DialogFooter>
        <Button onClick={save} disabled={busy}>
          {busy ? "Salvando..." : "Salvar"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

function PixDialog({ sub, tenant }: { sub: any; tenant: any }) {
  const key = String(tenant?.pix_key || "05117727266").trim();
  const holder = String(tenant?.pix_holder || "ERNESTH F P COUTO SILVA").substring(0, 25);
  const cityStr = String(tenant?.city || "SAO PAULO").substring(0, 15);
  const txidStr = String(sub?.id || "TXID123").replace(/[^a-zA-Z0-9]/g, "").substring(0, 25);
  const amountNum = Number(sub?.price || 0);

  let payload = "";
  try {
    payload = buildPixPayload({ 
      key, 
      merchant: holder, 
      amount: amountNum, 
      city: cityStr, 
      txid: txidStr 
    });
  } catch (err) {
    console.error("Erro gerando PIX:", err);
  }

  const parsedPlanName = (() => {
    try {
      if (sub?.plan?.startsWith("{") || sub?.plan?.startsWith("[")) {
        return JSON.parse(sub.plan).name;
      }
    } catch(e){}
    return sub?.plan;
  })();

  return (<DialogContent><DialogHeader><DialogTitle>PIX — {sub?.full_name || "Assinante"}</DialogTitle></DialogHeader>
    <div className="space-y-4 text-center">
      <div className="text-3xl font-semibold text-primary">{brl(amountNum)}</div>
      <div className="text-xs text-muted-foreground">{parsedPlanName || "Plano VIP Mensal"}</div>
      <div className="flex justify-center">
        {payload ? <QrCode value={payload} size={240} /> : <div className="p-8 text-xs text-red-500 border rounded-lg">Erro ao gerar QRCode. Verifique as configurações do PIX.</div>}
      </div>
      <div className="p-3 bg-muted/50 rounded-lg text-left space-y-1 text-xs">
        <div><span className="text-muted-foreground">Chave:</span> <span className="font-mono">{key}</span></div>
        <div><span className="text-muted-foreground">Favorecido:</span> {holder}</div>
      </div>
      <Button disabled={!payload} className="w-full" onClick={()=>{navigator.clipboard.writeText(payload);toast.success("Código PIX copiado!");}}><Copy className="h-4 w-4 mr-2"/>COPIAR CÓDIGO PIX</Button>
    </div></DialogContent>);
}

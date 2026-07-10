import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCurrentTenant } from "@/hooks/use-tenant";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Plus, ChevronLeft, ChevronRight } from "lucide-react";
import { addDays, format, startOfDay, endOfDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useMemo, useState, useEffect } from "react";
import { toast } from "sonner";
import { brl } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/app/agenda")({ component: AgendaPage });

function AgendaPage() {
  const { data: tenant } = useCurrentTenant();
  const qc = useQueryClient();
  const [date, setDate] = useState(new Date());
  const [openNew, setOpenNew] = useState(false);
  const [editAppt, setEditAppt] = useState<any>(null);
  const [selectedSlot, setSelectedSlot] = useState<{ proId: string, time: string } | null>(null);
  const tenantId = tenant?.id;

  const { data: pros } = useQuery({
    queryKey: ["pros", tenantId], enabled: !!tenantId,
    queryFn: async () => (await supabase.from("professionals").select("*").eq("tenant_id", tenantId!).eq("active", true).order("full_name")).data ?? [],
  });

  const { data: appts } = useQuery({
    queryKey: ["appts", tenantId, format(date, "yyyy-MM-dd")], enabled: !!tenantId,
    queryFn: async () => (await supabase.from("appointments").select("*, services(name,duration_min), clients(full_name)").eq("tenant_id", tenantId!).gte("start_at", startOfDay(date).toISOString()).lte("start_at", endOfDay(date).toISOString()).order("start_at")).data ?? [],
  });

  const slotMin = tenant?.slot_minutes ?? 30;
  const times = useMemo(() => {
    const arr: string[] = [];
    for (let h = 8; h < 20; h++) for (let m = 0; m < 60; m += slotMin) arr.push(`${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`);
    return arr;
  }, [slotMin]);

  const bookingSlug = tenant?.slug || "ernesth";
  const bookingLink = typeof window !== "undefined"
    ? `${window.location.origin}/booking/${bookingSlug}`
    : `https://barber-pro-plus.lovable.app/booking/${bookingSlug}`;

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold">Agenda</h1>
          <p className="text-muted-foreground">Agendamentos por profissional.</p>
        </div>
        <Dialog open={openNew} onOpenChange={(v) => { setOpenNew(v); if(!v) setSelectedSlot(null); }}>
          <DialogTrigger asChild><Button size="lg" onClick={() => setSelectedSlot(null)}><Plus className="h-4 w-4 mr-2" /> NOVO AGENDAMENTO</Button></DialogTrigger>
          <NewAppointmentDialog key={selectedSlot ? `${selectedSlot.proId}-${selectedSlot.time}` : "new"} tenantId={tenantId} pros={pros ?? []} onDone={() => { setOpenNew(false); setSelectedSlot(null); qc.invalidateQueries({ queryKey: ["appts"] }); }} defaultDate={date} defaultProId={selectedSlot?.proId} defaultTime={selectedSlot?.time} />
        </Dialog>
      </div>

      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="p-4 flex flex-wrap items-center gap-3">
          <div className="flex-1 min-w-[240px]">
            <div className="text-xs font-semibold text-primary uppercase tracking-wide">Link de agendamento online</div>
            <div className="text-xs text-muted-foreground">Envie para os clientes agendarem sozinhos.</div>
          </div>
          <Input readOnly value={bookingLink} className="max-w-lg font-mono text-xs bg-background" />
          <Button variant="outline" onClick={() => { navigator.clipboard.writeText(bookingLink); toast.success("Link copiado"); }} disabled={!bookingLink}>Copiar</Button>
          <Button asChild disabled={!bookingLink}><a href={bookingLink} target="_blank" rel="noreferrer">Abrir</a></Button>
        </CardContent>
      </Card>


      <Card><CardContent className="p-4 flex items-center justify-between">
        <Button variant="ghost" size="icon" onClick={() => setDate(addDays(date, -1))}><ChevronLeft className="h-4 w-4" /></Button>
        <div className="text-center">
          <div className="text-lg font-semibold capitalize">{format(date, "EEEE, dd 'de' MMMM 'de' yyyy", { locale: ptBR })}</div>
          <button onClick={() => setDate(new Date())} className="text-xs text-primary hover:underline">Voltar para hoje</button>
        </div>
        <Button variant="ghost" size="icon" onClick={() => setDate(addDays(date, 1))}><ChevronRight className="h-4 w-4" /></Button>
      </CardContent></Card>

      <div className="overflow-x-auto">
        <div className="min-w-[600px]" style={{ display: "grid", gridTemplateColumns: `80px repeat(${(pros?.length || 1)}, minmax(200px, 1fr))` }}>
          <div className="p-2 text-xs font-semibold text-muted-foreground border-b" />
          {(pros ?? []).map((p: any) => (
            <div key={p.id} className="p-3 border-b border-l flex items-center gap-2">
              <Avatar className="h-9 w-9"><AvatarImage src={p.photo_url ?? undefined} /><AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">{p.full_name.split(" ").map((w:string)=>w[0]).slice(0,2).join("")}</AvatarFallback></Avatar>
              <div><div className="text-sm font-medium">{p.full_name}</div><div className="text-xs text-muted-foreground">{p.role_label}</div></div>
            </div>
          ))}
          {times.map((t) => (
            <>
              <div key={`t${t}`} className="text-xs text-muted-foreground p-2 border-b text-right">{t}</div>
              {(pros ?? []).map((p: any) => {
                const [h, m] = t.split(":").map(Number);
                const slotTs = new Date(date); slotTs.setHours(h, m, 0, 0);
                const slotEnd = new Date(slotTs.getTime() + slotMin * 60000);
                const a = (appts ?? []).find((x: any) => 
                  x.professional_id === p.id && 
                  x.status !== "no_show" && 
                  x.status !== "cancelled" &&
                  new Date(x.start_at) < slotEnd && 
                  new Date(x.end_at) > slotTs
                );
                const isStart = a && new Date(a.start_at).getTime() >= slotTs.getTime() && new Date(a.start_at).getTime() < slotEnd.getTime();
                return (
                  <div key={`${p.id}-${t}`} className="border-b border-l p-1 min-h-[54px]">
                    {a ? (
                      isStart ? (
                        <div onClick={() => setEditAppt(a)} className={`h-full rounded-lg p-2 text-xs cursor-pointer transition-colors ${
                          a.status === "completed"
                            ? "bg-success/15 border-l-4 border-success text-success-foreground hover:bg-success/25"
                            : "bg-primary/10 border-l-4 border-primary hover:bg-primary/20"
                        }`}>
                          <div className={`font-semibold truncate ${a.status === "completed" ? "text-success" : ""}`}>{a.client_name || a.clients?.full_name}</div>
                          <div className="text-muted-foreground truncate">
                            {a.services?.name}
                            {a.notes?.includes("Serviços:") 
                              ? ` + ${a.notes.split("Serviços:")[1].split("|")[0].trim()}` 
                              : ""}
                          </div>
                        </div>
                      ) : (
                        <div className="h-full rounded-lg bg-muted/20 border border-transparent p-2 text-xs text-muted-foreground/40 flex items-center justify-center cursor-not-allowed opacity-50 select-none">
                          Ocupado
                        </div>
                      )
                    ) : (
                      <div onClick={() => { setSelectedSlot({ proId: p.id, time: t }); setOpenNew(true); }} className="h-full rounded-lg border border-dashed border-transparent hover:border-primary/50 hover:bg-primary/5 grid place-items-center text-xs text-muted-foreground cursor-pointer opacity-0 hover:opacity-100">Livre</div>
                    )}
                  </div>
                );
              })}
            </>
          ))}
        </div>
      </div>

      {editAppt && (
        <Dialog open={editAppt} onOpenChange={(v) => !v && setEditAppt(null)}>
          <EditAppointmentDialog appt={editAppt} tenantId={tenantId} pros={pros ?? []} onDone={() => { setEditAppt(null); qc.invalidateQueries({ queryKey: ["appts"] }); }} onDelete={() => { setEditAppt(null); qc.invalidateQueries({ queryKey: ["appts"] }); }} appts={appts ?? []} />
        </Dialog>
      )}
    </div>
  );
}

function NewAppointmentDialog({ tenantId, pros, onDone, defaultDate, defaultProId, defaultTime }: { tenantId?: string; pros: any[]; onDone: () => void; defaultDate: Date; defaultProId?: string; defaultTime?: string }) {
  const navigate = useNavigate();
  const [clientId, setClientId] = useState<string>("");
  const [isRegisteringNewClient, setIsRegisteringNewClient] = useState(false);
  const [newClientName, setNewClientName] = useState("");
  const [newClientWa, setNewClientWa] = useState("");

  const [proId, setProId] = useState(defaultProId ?? "");
  const [dateStr, setDateStr] = useState(format(defaultDate, "yyyy-MM-dd"));
  const [time, setTime] = useState(defaultTime ?? "09:00");
  const [busy, setBusy] = useState(false);

  const [selectedSvcs, setSelectedSvcs] = useState<string[]>([]);
  const [selectedProds, setSelectedProds] = useState<string[]>([]);
  const [status, setStatus] = useState("pending");
  const [paymentMethod, setPaymentMethod] = useState<string>("");
  const [obs, setObs] = useState("");

  const { data: services } = useQuery({ queryKey: ["services-min", tenantId], enabled: !!tenantId, queryFn: async () => (await supabase.from("services").select("*").eq("tenant_id", tenantId!).eq("active", true)).data ?? [] });
  const { data: products } = useQuery({ queryKey: ["products-min", tenantId], enabled: !!tenantId, queryFn: async () => (await supabase.from("products").select("*").eq("tenant_id", tenantId!).eq("active", true)).data ?? [] });
  const { data: clients } = useQuery({ queryKey: ["clients-min", tenantId], enabled: !!tenantId, queryFn: async () => (await supabase.from("clients").select("*").eq("tenant_id", tenantId!)).data ?? [] });

  const totalTime = selectedSvcs.reduce((acc, id) => {
    const s = services?.find(x => x.id === id);
    return acc + (s?.duration_min ?? 0);
  }, 0);

  const totalSvcValue = selectedSvcs.reduce((acc, id) => {
    const s = services?.find(x => x.id === id);
    return acc + Number(s?.price ?? 0);
  }, 0);

  const totalProdValue = selectedProds.reduce((acc, id) => {
    const p = products?.find(x => x.id === id);
    return acc + Number(p?.price ?? 0);
  }, 0);

  const totalValue = totalSvcValue + totalProdValue;

  async function save() {
    setBusy(true);
    try {
      if (!clientId && !isRegisteringNewClient) throw new Error("Selecione um cliente.");
      if (selectedSvcs.length === 0) throw new Error("Selecione pelo menos um serviço.");
      if (status === "completed" && !paymentMethod) {
        throw new Error("Por favor, selecione a forma de pagamento para finalizar o agendamento.");
      }

      let finalClientId = clientId;
      let finalName = "";
      let finalWa = "";

      if (isRegisteringNewClient) {
        if (!newClientName.trim()) throw new Error("Informe o nome do novo cliente.");
        if (!newClientWa.trim()) throw new Error("Informe o WhatsApp do novo cliente.");
        
        const cleanWa = newClientWa.replace(/\D/g, "");
        let { data: existing } = await supabase.from("clients").select("id, full_name, whatsapp").eq("tenant_id", tenantId!).eq("whatsapp", cleanWa).maybeSingle();
        
        if (existing) {
          finalClientId = existing.id;
          finalName = existing.full_name;
          finalWa = existing.whatsapp || "";
        } else {
          const { data: newC, error: newCErr } = await supabase.from("clients").insert({
            tenant_id: tenantId!,
            full_name: newClientName,
            whatsapp: cleanWa
          }).select("id").single();
          if (newCErr) throw newCErr;
          finalClientId = newC.id;
          finalName = newClientName;
          finalWa = cleanWa;
        }
      } else {
        const client = clients?.find(c => c.id === clientId);
        finalName = client?.full_name || "Cliente";
        finalWa = client?.whatsapp || "";
      }
      
      const firstSvcId = selectedSvcs[0];
      
      // Calculate total duration of all selected services combined
      const totalDuration = selectedSvcs.reduce((acc, id) => {
        const s = services?.find(x => x.id === id);
        return acc + (s?.duration_min ?? 0);
      }, 0);
      
      const [h, m] = time.split(":").map(Number);
      const currentStart = new Date(dateStr + "T00:00:00"); 
      currentStart.setHours(h, m, 0, 0);
      const currentEnd = new Date(currentStart.getTime() + totalDuration * 60000);

      // Save additional services, products, and payment method inside notes column
      const additionalSvcs = selectedSvcs.slice(1).map(id => services?.find(s => s.id === id)?.name).filter(Boolean);
      const svcsText = additionalSvcs.length > 0 ? `Serviços: ${additionalSvcs.join(", ")}` : "";
      const prodNames = selectedProds.map(id => products?.find(p=>p.id===id)?.name).filter(Boolean).join(", ");
      const prodsText = prodNames ? `Produtos: ${prodNames}` : "";
      const payText = paymentMethod ? `Pagamento: ${paymentMethod}` : "";

      // 1. Auto Comanda Creation
      const paymentMapped: Record<string, string> = {
        "Pix": "pix",
        "Dinheiro": "cash",
        "Cartão de Crédito": "credit",
        "Cartão de Débito": "debit"
      };
      const mappedMethod = paymentMapped[paymentMethod] || "pix";

      const { data: countRes } = await supabase.from("commandas").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId!);
      const cmdNumber = (countRes as any)?.count ? (countRes as any).count + 1 : Math.floor(Math.random() * 10000);

      const { data: cmd, error: cmdErr } = await supabase.from("commandas").insert({
        tenant_id: tenantId!,
        client_name: finalName,
        number: cmdNumber,
        status: status === "completed" ? "closed" : "open",
        closed_at: status === "completed" ? new Date().toISOString() : null,
        subtotal: totalValue,
        total: totalValue,
        payment_method: status === "completed" ? mappedMethod : null
      }).select("*").single();

      if (cmdErr) throw cmdErr;

      const pro = pros.find((p: any) => p.id === proId);
      const commission_pct = pro?.commission_pct ?? 0;

      for (const sId of selectedSvcs) {
        const svc = services?.find(s => s.id === sId);
        if (!svc) continue;
        const commission_value = (Number(svc.price) * commission_pct) / 100;
        await supabase.from("commanda_items").insert({
          commanda_id: cmd.id, tenant_id: tenantId!, kind: "service", ref_id: sId,
          name: svc.name, quantity: 1, unit_price: svc.price, professional_id: proId || null,
          commission_pct, commission_value, commission_status: "pending"
        });
      }

      for (const pId of selectedProds) {
        const prod = products?.find(p => p.id === pId);
        if (!prod) continue;
        await supabase.from("commanda_items").insert({
          commanda_id: cmd.id, tenant_id: tenantId!, kind: "product", ref_id: pId,
          name: prod.name, quantity: 1, unit_price: prod.price, professional_id: null,
          commission_pct: 0, commission_value: 0, commission_status: "pending"
        });
      }

      if (status === "completed") {
        await supabase.from("cash_movements").insert({
          tenant_id: tenantId!, kind: "in", amount: totalValue, description: `Agendamento #${cmdNumber} — ${finalName}`
        });
      }

      const comandaText = `Comanda ID: ${cmd.id}`;
      const finalObs = [obs, svcsText, prodsText, payText, comandaText].filter(Boolean).join(" | ");

      const { error } = await supabase.from("appointments").insert({
        tenant_id: tenantId!, professional_id: proId, service_id: firstSvcId, client_id: finalClientId,
        client_name: finalName, client_whatsapp: finalWa.replace(/\D/g,""),
        start_at: currentStart.toISOString(), end_at: currentEnd.toISOString(),
        status: status, source: "manual", notes: finalObs
      });
      if (error) throw error;

      toast.success("Agendamento criado!");
      onDone();
      if (status === "completed") {
        navigate({ to: "/app/comandas" });
      }
    } catch (e:any) { toast.error(e.message); } finally { setBusy(false); }
  }

  const statuses = [
    {v: "pending", l: "AGENDADO"}, {v: "confirmed", l: "CONFIRMADO"},
    {v: "in_progress", l: "EM ATENDIMENTO"}, {v: "completed", l: "FINALIZADO"},
    {v: "cancelled", l: "CANCELADO"}, {v: "no_show", l: "FALTOU"}
  ];

  return (
    <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto p-0">
      <DialogHeader className="p-6 pb-4 border-b"><DialogTitle className="text-xl uppercase tracking-wide">Novo agendamento na fila</DialogTitle></DialogHeader>
      
      <div className="p-6 space-y-6">
        <div className="space-y-4">
          <div><Label className="text-xs uppercase text-muted-foreground font-semibold">Cliente</Label>
            <Select value={isRegisteringNewClient ? "new_client" : clientId} onValueChange={(val) => {
              if (val === "new_client") {
                setIsRegisteringNewClient(true);
                setClientId("");
              } else {
                setIsRegisteringNewClient(false);
                setClientId(val);
              }
            }}><SelectTrigger><SelectValue placeholder="Busque ou selecione um cliente..." /></SelectTrigger>
            <SelectContent>
              <SelectItem value="new_client" className="text-primary font-semibold font-medium">+ Cadastrar Novo Cliente</SelectItem>
              {clients?.map((c:any)=><SelectItem key={c.id} value={c.id}>{c.full_name} ({c.whatsapp})</SelectItem>)}
            </SelectContent></Select>
          </div>

          {isRegisteringNewClient && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4 bg-muted/40 border border-dashed rounded-xl animate-fade-in">
              <div>
                <Label className="text-xs uppercase text-muted-foreground font-semibold">Nome do Novo Cliente</Label>
                <Input value={newClientName} onChange={e=>setNewClientName(e.target.value)} placeholder="Nome completo do cliente" />
              </div>
              <div>
                <Label className="text-xs uppercase text-muted-foreground font-semibold">WhatsApp do Novo Cliente</Label>
                <Input value={newClientWa} onChange={e=>setNewClientWa(e.target.value)} placeholder="(99) 99999-9999" />
              </div>
            </div>
          )}
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div><Label className="text-xs uppercase text-muted-foreground font-semibold">Barbeiro</Label>
              <Select value={proId} onValueChange={setProId}><SelectTrigger><SelectValue placeholder="Escolha" /></SelectTrigger><SelectContent>{pros.map((p:any)=><SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>)}</SelectContent></Select>
            </div>
            <div><Label className="text-xs uppercase text-muted-foreground font-semibold">Dados</Label><Input type="date" value={dateStr} onChange={(e)=>setDateStr(e.target.value)} /></div>
            <div><Label className="text-xs uppercase text-muted-foreground font-semibold">Horário</Label><Input type="time" value={time} onChange={(e)=>setTime(e.target.value)} /></div>
          </div>
        </div>

        <div>
          <Label className="text-xs uppercase text-muted-foreground font-semibold mb-2 block">Serviços (Selecione um ou mais)</Label>
          <div className="border rounded-xl bg-background overflow-hidden divide-y">
            {services?.map((s:any) => {
              const sel = selectedSvcs.includes(s.id);
              return (
                <div key={s.id} onClick={()=>{
                  if(sel) setSelectedSvcs(selectedSvcs.filter(id=>id!==s.id));
                  else setSelectedSvcs([...selectedSvcs, s.id]);
                }} className={`flex items-center justify-between p-3 cursor-pointer text-sm transition-colors ${sel ? 'bg-primary/10' : 'hover:bg-muted/50'}`}>
                  <div className="flex items-center gap-3">
                    <div className={`h-4 w-4 rounded flex items-center justify-center border transition-colors ${sel?'bg-primary border-primary text-primary-foreground':'border-input'}`}>{sel && "✓"}</div>
                    <span className={sel ? "font-medium text-primary" : ""}>{s.name}</span>
                  </div>
                  <span className={sel ? "font-medium text-primary" : "text-muted-foreground"}>{brl(s.price)}</span>
                </div>
              )
            })}
            {services?.length === 0 && <div className="p-4 text-center text-xs text-muted-foreground">Nenhum serviço cadastrado.</div>}
          </div>
        </div>

        <div>
          <Label className="text-xs uppercase text-muted-foreground font-semibold mb-2 block">Produtos do Estoque (Opcional)</Label>
          <div className="border rounded-xl bg-background overflow-hidden divide-y">
            {products?.map((p:any) => {
              const sel = selectedProds.includes(p.id);
              return (
                <div key={p.id} onClick={()=>{
                  if(sel) setSelectedProds(selectedProds.filter(id=>id!==p.id));
                  else setSelectedProds([...selectedProds, p.id]);
                }} className={`flex items-center justify-between p-3 cursor-pointer text-sm transition-colors ${sel ? 'bg-primary/10' : 'hover:bg-muted/50'}`}>
                  <div className="flex items-center gap-3">
                    <div className={`h-4 w-4 rounded flex items-center justify-center border transition-colors ${sel?'bg-primary border-primary text-primary-foreground':'border-input'}`}>{sel && "✓"}</div>
                    <div>
                      <div className={sel ? "font-medium text-primary" : ""}>{p.name}</div>
                      <div className="text-xs text-muted-foreground">Estoque: {p.stock} un</div>
                    </div>
                  </div>
                  <span className={sel ? "font-medium text-primary" : "text-muted-foreground"}>{brl(p.price)}</span>
                </div>
              )
            })}
            {products?.length === 0 && <div className="p-4 text-center text-xs text-muted-foreground">Nenhum produto cadastrado.</div>}
          </div>
        </div>

        <div className="bg-primary/10 border border-primary/20 rounded-xl p-4 flex justify-between items-center text-primary">
          <div className="flex items-center gap-3">
            <div className="bg-primary/20 p-2 rounded-lg text-lg">✂️</div>
            <div>
              <div className="font-semibold text-sm">Resumo Estimado</div>
              <div className="text-xs opacity-80">Tempo de Cadeira: {totalTime} min</div>
            </div>
          </div>
          <div className="text-xl font-bold">{brl(totalValue)}</div>
        </div>

        <div>
          <Label className="text-xs uppercase text-muted-foreground font-semibold mb-2 block">Status do Agendamento</Label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {statuses.map(s => (
              <button key={s.v} type="button" onClick={()=>setStatus(s.v)} className={`text-xs font-semibold py-2 rounded-full border transition-colors ${status === s.v ? 'bg-primary border-primary text-primary-foreground' : 'bg-background border-border text-muted-foreground hover:border-primary/50'}`}>
                {s.l}
              </button>
            ))}
          </div>
        </div>

        <div>
          <Label className="text-xs uppercase text-muted-foreground font-semibold mb-2 block">Forma de Pagamento</Label>
          <Select value={paymentMethod} onValueChange={setPaymentMethod}>
            <SelectTrigger className="w-full bg-background">
              <SelectValue placeholder="Selecione a forma de pagamento (ex: Pix, Dinheiro)..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Pix">PIX</SelectItem>
              <SelectItem value="Dinheiro">Dinheiro</SelectItem>
              <SelectItem value="Cartão de Crédito">Cartão de Crédito</SelectItem>
              <SelectItem value="Cartão de Débito">Cartão de Débito</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label className="text-xs uppercase text-muted-foreground font-semibold mb-2 block">Observações / Alergias</Label>
          <textarea value={obs} onChange={e=>setObs(e.target.value)} placeholder="Ex: alergia a mentol, degradê navalhado nas laterais..." className="w-full min-h-[80px] p-3 rounded-xl border border-input bg-transparent text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" />
        </div>
      </div>
      
      <div className="p-6 pt-0 flex justify-end gap-3">
        <Button variant="outline" onClick={onDone} className="rounded-full">Fechar</Button>
        <Button onClick={save} disabled={busy || !clientId || !proId || selectedSvcs.length===0} className="rounded-full">CONFIRMAR RESERVA</Button>
      </div>
    </DialogContent>
  );
}

function EditAppointmentDialog({ appt, tenantId, pros, onDone, onDelete, appts }: { appt: any; tenantId?: string; pros: any[]; onDone: () => void; onDelete: () => void; appts: any[] }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [clientId, setClientId] = useState<string>(appt.client_id || "");
  const [isRegisteringNewClient, setIsRegisteringNewClient] = useState(false);
  const [newClientName, setNewClientName] = useState("");
  const [newClientWa, setNewClientWa] = useState("");

  const [proId, setProId] = useState(appt.professional_id || "");
  const [dateStr, setDateStr] = useState(format(new Date(appt.start_at), "yyyy-MM-dd"));
  const [time, setTime] = useState(format(new Date(appt.start_at), "HH:mm"));
  const [busy, setBusy] = useState(false);

  const [selectedSvcs, setSelectedSvcs] = useState<string[]>([]);
  const [selectedProds, setSelectedProds] = useState<string[]>([]);
  const [status, setStatus] = useState(appt.status || "pending");
  const [paymentMethod, setPaymentMethod] = useState<string>("");
  const [obs, setObs] = useState("");

  const { data: services } = useQuery({ queryKey: ["services-min", tenantId], enabled: !!tenantId, queryFn: async () => (await supabase.from("services").select("*").eq("tenant_id", tenantId!).eq("active", true)).data ?? [] });
  const { data: products } = useQuery({ queryKey: ["products-min", tenantId], enabled: !!tenantId, queryFn: async () => (await supabase.from("products").select("*").eq("tenant_id", tenantId!).eq("active", true)).data ?? [] });
  const { data: clients } = useQuery({ queryKey: ["clients-min", tenantId], enabled: !!tenantId, queryFn: async () => (await supabase.from("clients").select("*").eq("tenant_id", tenantId!)).data ?? [] });

  const chain = useMemo(() => {
    return getContiguousChain(appt, appts);
  }, [appt, appts]);

  useEffect(() => {
    if (services && services.length > 0 && appt.notes) {
      const notesText = appt.notes || "";
      const servicesList = [appt.service_id];
      if (notesText.includes("Serviços: ")) {
        const svcPart = notesText.split("Serviços: ")[1];
        if (svcPart) {
          const names = svcPart.split(" | ")[0].split(", ").map((s: string) => s.trim().toLowerCase());
          const matchingIds = services.filter((s: any) => names.includes((s.name || "").trim().toLowerCase())).map((s: any) => s.id);
          servicesList.push(...matchingIds);
        }
      }
      setSelectedSvcs(servicesList);
    } else {
      setSelectedSvcs([appt.service_id]);
    }
  }, [services, appt.notes, appt.service_id]);

  useEffect(() => {
    if (products && products.length > 0 && appt.notes) {
      const notesText = appt.notes || "";
      if (notesText.includes("Produtos: ")) {
        const prodPart = notesText.split("Produtos: ")[1];
        if (prodPart) {
          const names = prodPart.split(" | ")[0].split(", ").map((s: string) => s.trim().toLowerCase());
          const matchingIds = products.filter((p: any) => names.includes((p.name || "").trim().toLowerCase())).map((p: any) => p.id);
          setSelectedProds(matchingIds);
        }
      }
    }
  }, [products, appt.notes]);

  useEffect(() => {
    if (appt.notes) {
      const notesText = appt.notes || "";
      if (notesText.includes("Pagamento: ")) {
        const payPart = notesText.split("Pagamento: ")[1];
        if (payPart) {
          setPaymentMethod(payPart.split(" | ")[0].trim());
        }
      }
    }
  }, [appt.notes]);

  useEffect(() => {
    if (appt.notes !== undefined) {
      const raw = appt.notes || "";
      const parts = raw.split(" | ").filter((p: string) => !p.startsWith("Serviços:") && !p.startsWith("Produtos:") && !p.startsWith("Pagamento:"));
      setObs(parts.join(" | ").trim());
    }
  }, [appt.notes]);

  const totalTime = selectedSvcs.reduce((acc, id) => {
    const s = services?.find(x => x.id === id);
    return acc + (s?.duration_min ?? 0);
  }, 0);

  const totalSvcValue = selectedSvcs.reduce((acc, id) => {
    const s = services?.find(x => x.id === id);
    return acc + Number(s?.price ?? 0);
  }, 0);

  const totalProdValue = selectedProds.reduce((acc, id) => {
    const p = products?.find(x => x.id === id);
    return acc + Number(p?.price ?? 0);
  }, 0);

  const totalValue = totalSvcValue + totalProdValue;

  async function save() {
    setBusy(true);
    try {
      if (!clientId && !isRegisteringNewClient && !appt.client_name) throw new Error("Selecione um cliente.");
      if (selectedSvcs.length === 0) throw new Error("Selecione pelo menos um serviço.");
      if (status === "completed" && !paymentMethod) {
        throw new Error("Por favor, selecione a forma de pagamento para finalizar o agendamento.");
      }
      
      let finalClientId = clientId;
      let finalName = "";
      let finalWa = "";

      if (isRegisteringNewClient) {
        if (!newClientName.trim()) throw new Error("Informe o nome do novo cliente.");
        if (!newClientWa.trim()) throw new Error("Informe o WhatsApp do novo cliente.");
        
        const cleanWa = newClientWa.replace(/\D/g, "");
        let { data: existing } = await supabase.from("clients").select("id, full_name, whatsapp").eq("tenant_id", tenantId!).eq("whatsapp", cleanWa).maybeSingle();
        
        if (existing) {
          finalClientId = existing.id;
          finalName = existing.full_name;
          finalWa = existing.whatsapp || "";
        } else {
          const { data: newC, error: newCErr } = await supabase.from("clients").insert({
            tenant_id: tenantId!,
            full_name: newClientName,
            whatsapp: cleanWa
          }).select("id").single();
          if (newCErr) throw newCErr;
          finalClientId = newC.id;
          finalName = newClientName;
          finalWa = cleanWa;
        }
      } else {
        const client = clients?.find(c => c.id === clientId);
        finalName = client?.full_name || appt.client_name || "Cliente";
        finalWa = client?.whatsapp || appt.client_whatsapp || "";
      }
      
      const firstSvcId = selectedSvcs[0];
      const totalDuration = selectedSvcs.reduce((acc, id) => {
        const s = services?.find(x => x.id === id);
        return acc + (s?.duration_min ?? 0);
      }, 0);

      const [h, m] = time.split(":").map(Number);
      const currentStart = new Date(dateStr + "T00:00:00"); 
      currentStart.setHours(h, m, 0, 0);
      const currentEnd = new Date(currentStart.getTime() + totalDuration * 60000);

      const prodNames = selectedProds.map(id => products?.find(p=>p.id===id)?.name).filter(Boolean).join(", ");
      const prodsText = prodNames ? `Produtos: ${prodNames}` : "";
      const additionalSvcs = selectedSvcs.slice(1).map(id => services?.find(s => s.id === id)?.name).filter(Boolean);
      const svcsText = additionalSvcs.length > 0 ? `Serviços: ${additionalSvcs.join(", ")}` : "";
      const payText = paymentMethod ? `Pagamento: ${paymentMethod}` : "";

      // Extract existing comanda ID if present
      let cmdId = "";
      if (appt.notes && appt.notes.includes("Comanda ID: ")) {
        cmdId = appt.notes.split("Comanda ID: ")[1].split(" | ")[0].trim();
      }

      const paymentMapped: Record<string, string> = {
        "Pix": "pix",
        "Dinheiro": "cash",
        "Cartão de Crédito": "credit",
        "Cartão de Débito": "debit"
      };
      const mappedMethod = paymentMapped[paymentMethod] || "pix";

      // 1. Sync or Create Comanda
      let cmd: any = null;
      if (cmdId) {
        // Fetch existing comanda to check status
        const { data: existingCmd } = await supabase.from("commandas").select("*").eq("id", cmdId).maybeSingle();
        if (existingCmd) {
          cmd = existingCmd;
          // Update comanda details
          await supabase.from("commandas").update({
            client_name: finalName,
            status: status === "completed" ? "closed" : "open",
            closed_at: status === "completed" ? new Date().toISOString() : null,
            subtotal: totalValue,
            total: totalValue,
            payment_method: status === "completed" ? mappedMethod : null
          }).eq("id", cmdId);
          // Delete old items so we can re-insert updated ones
          await supabase.from("commanda_items").delete().eq("commanda_id", cmdId);
        }
      }

      if (!cmd) {
        // Create a new comanda
        const { data: countRes } = await supabase.from("commandas").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId!);
        const cmdNumber = (countRes as any)?.count ? (countRes as any).count + 1 : Math.floor(Math.random() * 10000);

        const { data: newCmd, error: cmdErr } = await supabase.from("commandas").insert({
          tenant_id: tenantId!, client_name: finalName, number: cmdNumber,
          status: status === "completed" ? "closed" : "open",
          closed_at: status === "completed" ? new Date().toISOString() : null,
          subtotal: totalValue, total: totalValue,
          payment_method: status === "completed" ? mappedMethod : null
        }).select("*").single();

        if (cmdErr) throw cmdErr;
        cmd = newCmd;
        cmdId = newCmd.id;
      }

      // Re-insert commanda items
      const pro = pros.find((p: any) => p.id === proId);
      const commission_pct = pro?.commission_pct ?? 0;

      for (const sId of selectedSvcs) {
        const svc = services?.find(s => s.id === sId);
        if (!svc) continue;
        const commission_value = (Number(svc.price) * commission_pct) / 100;
        await supabase.from("commanda_items").insert({
          commanda_id: cmdId, tenant_id: tenantId!, kind: "service", ref_id: sId,
          name: svc.name, quantity: 1, unit_price: svc.price, professional_id: proId || null,
          commission_pct, commission_value, commission_status: "pending"
        });
      }

      for (const pId of selectedProds) {
        const prod = products?.find(p => p.id === pId);
        if (!prod) continue;
        await supabase.from("commanda_items").insert({
          commanda_id: cmdId, tenant_id: tenantId!, kind: "product", ref_id: pId,
          name: prod.name, quantity: 1, unit_price: prod.price, professional_id: null,
          commission_pct: 0, commission_value: 0, commission_status: "pending"
        });
      }

      // Cash movement registry if transitioning to completed
      if (status === "completed" && appt.status !== "completed") {
        await supabase.from("cash_movements").insert({
          tenant_id: tenantId!, kind: "in", amount: totalValue, description: `Agendamento #${cmd.number} — ${finalName}`
        });
      }

      const comandaText = `Comanda ID: ${cmdId}`;
      const finalObs = [obs, svcsText, prodsText, payText, comandaText].filter(Boolean).join(" | ");

      // Delete all old appointments in the contiguous chain
      const idsToDelete = chain.map(x => x.id);
      const { error: delError } = await supabase.from("appointments").delete().in("id", idsToDelete);
      if (delError) throw delError;

      // Insert ONE single consolidated row
      const { error } = await supabase.from("appointments").insert({
        tenant_id: tenantId!, professional_id: proId, service_id: firstSvcId, client_id: finalClientId || null,
        client_name: finalName, client_whatsapp: finalWa.replace(/\D/g,""),
        start_at: currentStart.toISOString(), end_at: currentEnd.toISOString(),
        status: status, notes: finalObs
      });
      if (error) throw error;

      toast.success("Agendamento atualizado!");
      onDone();
      if (status === "completed" && appt.status !== "completed") {
        navigate({ to: "/app/comandas" });
      }
    } catch (e:any) { toast.error(e.message); } finally { setBusy(false); }
  }

  async function handleDelete() {
     if(!confirm("Deseja realmente excluir este agendamento (incluindo todos os serviços associados)?")) return;
     setBusy(true);
     const idsToDelete = chain.map(x => x.id);
     const { error } = await supabase.from("appointments").delete().in("id", idsToDelete);
     setBusy(false);
     if (error) toast.error(error.message);
     else { toast.success("Agendamento excluído!"); onDelete(); }
  }

  const statuses = [
    {v: "pending", l: "AGENDADO"}, {v: "confirmed", l: "CONFIRMADO"},
    {v: "in_progress", l: "EM ATENDIMENTO"}, {v: "completed", l: "FINALIZADO"},
    {v: "cancelled", l: "CANCELADO"}, {v: "no_show", l: "FALTOU"}
  ];

  return (
    <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto p-0">
      <DialogHeader className="p-6 pb-4 border-b"><DialogTitle className="text-xl uppercase tracking-wide">Alterar Agendamento</DialogTitle></DialogHeader>
      
      <div className="p-6 space-y-6">
        <div className="space-y-4">
          <div><Label className="text-xs uppercase text-muted-foreground font-semibold">Cliente</Label>
            <Select value={isRegisteringNewClient ? "new_client" : clientId} onValueChange={(val) => {
              if (val === "new_client") {
                setIsRegisteringNewClient(true);
                setClientId("");
              } else {
                setIsRegisteringNewClient(false);
                setClientId(val);
              }
            }}><SelectTrigger><SelectValue placeholder="Busque ou selecione um cliente..." /></SelectTrigger>
            <SelectContent>
              <SelectItem value="new_client" className="text-primary font-semibold font-medium">+ Cadastrar Novo Cliente</SelectItem>
              {clients?.map((c:any)=><SelectItem key={c.id} value={c.id}>{c.full_name} ({c.whatsapp})</SelectItem>)}
            </SelectContent></Select>
          </div>

          {isRegisteringNewClient && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4 bg-muted/40 border border-dashed rounded-xl animate-fade-in">
              <div>
                <Label className="text-xs uppercase text-muted-foreground font-semibold">Nome do Novo Cliente</Label>
                <Input value={newClientName} onChange={e=>setNewClientName(e.target.value)} placeholder="Nome completo" />
              </div>
              <div>
                <Label className="text-xs uppercase text-muted-foreground font-semibold">WhatsApp do Novo Cliente</Label>
                <Input value={newClientWa} onChange={e=>setNewClientWa(e.target.value)} placeholder="(99) 99999-9999" />
              </div>
            </div>
          )}
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div><Label className="text-xs uppercase text-muted-foreground font-semibold">Barbeiro</Label>
              <Select value={proId} onValueChange={setProId}><SelectTrigger><SelectValue placeholder="Escolha" /></SelectTrigger><SelectContent>{pros.map((p:any)=><SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>)}</SelectContent></Select>
            </div>
            <div><Label className="text-xs uppercase text-muted-foreground font-semibold">Dados</Label><Input type="date" value={dateStr} onChange={(e)=>setDateStr(e.target.value)} /></div>
            <div><Label className="text-xs uppercase text-muted-foreground font-semibold">Horário</Label><Input type="time" value={time} onChange={(e)=>setTime(e.target.value)} /></div>
          </div>
        </div>

        <div>
          <Label className="text-xs uppercase text-muted-foreground font-semibold mb-2 block">Serviços (Selecione um ou mais)</Label>
          <div className="border rounded-xl bg-background overflow-hidden divide-y">
            {services?.map((s:any) => {
              const sel = selectedSvcs.includes(s.id);
              return (
                <div key={s.id} onClick={()=>{
                  if(sel && selectedSvcs.length > 1) setSelectedSvcs(selectedSvcs.filter(id=>id!==s.id));
                  else if (!sel) setSelectedSvcs([...selectedSvcs, s.id]);
                }} className={`flex items-center justify-between p-3 cursor-pointer text-sm transition-colors ${sel ? 'bg-primary/10' : 'hover:bg-muted/50'}`}>
                  <div className="flex items-center gap-3">
                    <div className={`h-4 w-4 rounded flex items-center justify-center border transition-colors ${sel?'bg-primary border-primary text-primary-foreground':'border-input'}`}>{sel && "✓"}</div>
                    <span className={sel ? "font-medium text-primary" : ""}>{s.name}</span>
                  </div>
                  <span className={sel ? "font-medium text-primary" : "text-muted-foreground"}>{brl(s.price)}</span>
                </div>
              )
            })}
            {services?.length === 0 && <div className="p-4 text-center text-xs text-muted-foreground">Nenhum serviço cadastrado.</div>}
          </div>
        </div>

        <div>
          <Label className="text-xs uppercase text-muted-foreground font-semibold mb-2 block">Produtos do Estoque (Opcional)</Label>
          <div className="border rounded-xl bg-background overflow-hidden divide-y">
            {products?.map((p:any) => {
              const sel = selectedProds.includes(p.id);
              return (
                <div key={p.id} onClick={()=>{
                  if(sel) setSelectedProds(selectedProds.filter(id=>id!==p.id));
                  else setSelectedProds([...selectedProds, p.id]);
                }} className={`flex items-center justify-between p-3 cursor-pointer text-sm transition-colors ${sel ? 'bg-primary/10' : 'hover:bg-muted/50'}`}>
                  <div className="flex items-center gap-3">
                    <div className={`h-4 w-4 rounded flex items-center justify-center border transition-colors ${sel?'bg-primary border-primary text-primary-foreground':'border-input'}`}>{sel && "✓"}</div>
                    <div>
                      <div className={sel ? "font-medium text-primary" : ""}>{p.name}</div>
                      <div className="text-xs text-muted-foreground">Estoque: {p.stock} un</div>
                    </div>
                  </div>
                  <span className={sel ? "font-medium text-primary" : "text-muted-foreground"}>{brl(p.price)}</span>
                </div>
              )
            })}
            {products?.length === 0 && <div className="p-4 text-center text-xs text-muted-foreground">Nenhum produto cadastrado.</div>}
          </div>
        </div>

        <div className="bg-primary/10 border border-primary/20 rounded-xl p-4 flex justify-between items-center text-primary">
          <div className="flex items-center gap-3">
            <div className="bg-primary/20 p-2 rounded-lg text-lg">✂️</div>
            <div>
              <div className="font-semibold text-sm">Resumo Estimado</div>
              <div className="text-xs opacity-80">Tempo de Cadeira: {totalTime} min</div>
            </div>
          </div>
          <div className="text-xl font-bold">{brl(totalValue)}</div>
        </div>

        <div>
          <Label className="text-xs uppercase text-muted-foreground font-semibold mb-2 block">Status do Agendamento</Label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {statuses.map(s => (
              <button key={s.v} type="button" onClick={()=>setStatus(s.v)} className={`text-xs font-semibold py-2 rounded-full border transition-colors ${status === s.v ? 'bg-primary border-primary text-primary-foreground' : 'bg-background border-border text-muted-foreground hover:border-primary/50'}`}>
                {s.l}
              </button>
            ))}
          </div>
        </div>

        <div>
          <Label className="text-xs uppercase text-muted-foreground font-semibold mb-2 block">Forma de Pagamento</Label>
          <Select value={paymentMethod} onValueChange={setPaymentMethod}>
            <SelectTrigger className="w-full bg-background">
              <SelectValue placeholder="Selecione a forma de pagamento (ex: Pix, Dinheiro)..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Pix">PIX</SelectItem>
              <SelectItem value="Dinheiro">Dinheiro</SelectItem>
              <SelectItem value="Cartão de Crédito">Cartão de Crédito</SelectItem>
              <SelectItem value="Cartão de Débito">Cartão de Débito</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label className="text-xs uppercase text-muted-foreground font-semibold mb-2 block">Observações / Alergias</Label>
          <textarea value={obs} onChange={e=>setObs(e.target.value)} placeholder="Ex: alergia a mentol, degradê navalhado nas laterais..." className="w-full min-h-[80px] p-3 rounded-xl border border-input bg-transparent text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" />
        </div>
      </div>
      
      <div className="p-6 pt-0 flex justify-between gap-3">
        <Button variant="destructive" onClick={handleDelete} className="rounded-full bg-red-100 text-red-600 hover:bg-red-200 shadow-none border-none">Excluir</Button>
        <div className="flex gap-3">
            <Button variant="outline" onClick={onDone} className="rounded-full">Fechar</Button>
            <Button onClick={save} disabled={busy || (!clientId && !appt.client_name) || !proId || selectedSvcs.length===0} className="rounded-full">SALVAR MUDANÇAS</Button>
        </div>
      </div>
    </DialogContent>
  );
}

function getContiguousChain(appt: any, allAppts: any[]) {
  const sameGroup = allAppts.filter(x => 
    x.professional_id === appt.professional_id &&
    x.status !== "cancelled" && x.status !== "no_show" &&
    (appt.client_id ? x.client_id === appt.client_id : x.client_name === appt.client_name)
  );
  
  const chain = [appt];
  let added = true;
  while (added) {
    added = false;
    for (const x of sameGroup) {
      if (chain.some(c => c.id === x.id)) continue;
      const isContiguous = chain.some(c => 
        new Date(x.end_at).getTime() === new Date(c.start_at).getTime() ||
        new Date(x.start_at).getTime() === new Date(c.end_at).getTime()
      );
      if (isContiguous) {
        chain.push(x);
        added = true;
      }
    }
  }
  return chain.sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime());
}

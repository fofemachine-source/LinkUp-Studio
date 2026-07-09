import { createFileRoute } from "@tanstack/react-router";
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
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { brl } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/app/agenda")({ component: AgendaPage });

function AgendaPage() {
  const { data: tenant } = useCurrentTenant();
  const qc = useQueryClient();
  const [date, setDate] = useState(new Date());
  const [openNew, setOpenNew] = useState(false);
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
        <Dialog open={openNew} onOpenChange={setOpenNew}>
          <DialogTrigger asChild><Button size="lg"><Plus className="h-4 w-4 mr-2" /> NOVO AGENDAMENTO</Button></DialogTrigger>
          <NewAppointmentDialog tenantId={tenantId} pros={pros ?? []} onDone={() => { setOpenNew(false); qc.invalidateQueries({ queryKey: ["appts"] }); }} defaultDate={date} />
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
                const a = (appts ?? []).find((x: any) => x.professional_id === p.id && new Date(x.start_at).getTime() === slotTs.getTime());
                return (
                  <div key={`${p.id}-${t}`} className="border-b border-l p-1 min-h-[54px]">
                    {a ? (
                      <div className="h-full rounded-lg bg-primary/10 border-l-4 border-primary p-2 text-xs">
                        <div className="font-semibold truncate">{a.client_name || a.clients?.full_name}</div>
                        <div className="text-muted-foreground truncate">{a.services?.name}</div>
                      </div>
                    ) : (
                      <div className="h-full rounded-lg border border-dashed border-transparent hover:border-primary/50 hover:bg-primary/5 grid place-items-center text-xs text-muted-foreground cursor-pointer opacity-0 hover:opacity-100">Livre</div>
                    )}
                  </div>
                );
              })}
            </>
          ))}
        </div>
      </div>
    </div>
  );
}

function NewAppointmentDialog({ tenantId, pros, onDone, defaultDate }: { tenantId?: string; pros: any[]; onDone: () => void; defaultDate: Date }) {
  const [clientId, setClientId] = useState<string>("");
  const [proId, setProId] = useState("");
  const [dateStr, setDateStr] = useState(format(defaultDate, "yyyy-MM-dd"));
  const [time, setTime] = useState("09:00");
  const [busy, setBusy] = useState(false);

  const [selectedSvcs, setSelectedSvcs] = useState<string[]>([]);
  const [selectedProds, setSelectedProds] = useState<string[]>([]);
  const [status, setStatus] = useState("pending");
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
      if (!clientId) throw new Error("Selecione um cliente.");
      if (selectedSvcs.length === 0) throw new Error("Selecione pelo menos um serviço.");
      
      const client = clients?.find(c => c.id === clientId);
      const name = client?.full_name || "Cliente";
      const wa = client?.whatsapp || "";
      
      const [h, m] = time.split(":").map(Number);
      let currentStart = new Date(dateStr + "T00:00:00"); 
      currentStart.setHours(h, m, 0, 0);

      const prodNames = selectedProds.map(id => products?.find(p=>p.id===id)?.name).filter(Boolean).join(", ");
      const finalObs = [obs, prodNames ? `Produtos: ${prodNames}` : ""].filter(Boolean).join(" | ");

      for (let i = 0; i < selectedSvcs.length; i++) {
        const sId = selectedSvcs[i];
        const svc = services?.find(s => s.id === sId);
        const duration = svc?.duration_min ?? 30;
        const currentEnd = new Date(currentStart.getTime() + duration * 60000);
        
        const { error } = await supabase.from("appointments").insert({
          tenant_id: tenantId!, professional_id: proId, service_id: sId, client_id: clientId,
          client_name: name, client_whatsapp: wa.replace(/\D/g,""),
          start_at: currentStart.toISOString(), end_at: currentEnd.toISOString(),
          status: status, source: "manual", notes: i === 0 ? finalObs : null
        });
        if (error) throw error;
        
        currentStart = currentEnd;
      }

      toast.success("Agendamento criado!");
      onDone();
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
            <Select value={clientId} onValueChange={setClientId}><SelectTrigger><SelectValue placeholder="Busque ou selecione um cliente..." /></SelectTrigger>
            <SelectContent>{clients?.map((c:any)=><SelectItem key={c.id} value={c.id}>{c.full_name} ({c.whatsapp})</SelectItem>)}</SelectContent></Select>
          </div>
          
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

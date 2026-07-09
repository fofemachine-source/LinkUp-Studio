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

  const bookingLink = typeof window !== "undefined" && tenant?.slug
    ? `${window.location.origin}/booking/${tenant.slug}`
    : "";

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
  const [name, setName] = useState("");
  const [wa, setWa] = useState("");
  const [proId, setProId] = useState("");
  const [svcId, setSvcId] = useState("");
  const [dateStr, setDateStr] = useState(format(defaultDate, "yyyy-MM-dd"));
  const [time, setTime] = useState("09:00");
  const [busy, setBusy] = useState(false);

  const { data: services } = useQuery({
    queryKey: ["services-min", tenantId], enabled: !!tenantId,
    queryFn: async () => (await supabase.from("services").select("*").eq("tenant_id", tenantId!).eq("active", true)).data ?? [],
  });

  async function save() {
    setBusy(true);
    try {
      const [h, m] = time.split(":").map(Number);
      const start = new Date(dateStr + "T00:00:00"); start.setHours(h, m);
      const svc = services?.find((s:any) => s.id === svcId);
      const end = new Date(start.getTime() + (svc?.duration_min ?? 30) * 60000);
      const { error } = await supabase.from("appointments").insert({
        tenant_id: tenantId!, professional_id: proId, service_id: svcId,
        client_name: name, client_whatsapp: wa.replace(/\D/g,""),
        start_at: start.toISOString(), end_at: end.toISOString(),
        status: "confirmed", source: "manual",
      });
      if (error) throw error;
      toast.success("Agendamento criado");
      onDone();
    } catch (e:any) { toast.error(e.message); } finally { setBusy(false); }
  }

  return (
    <DialogContent>
      <DialogHeader><DialogTitle>Novo agendamento</DialogTitle></DialogHeader>
      <div className="space-y-3">
        <div><Label>Nome do cliente</Label><Input value={name} onChange={(e)=>setName(e.target.value)} /></div>
        <div><Label>WhatsApp</Label><Input value={wa} onChange={(e)=>setWa(e.target.value)} /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Profissional</Label>
            <Select value={proId} onValueChange={setProId}><SelectTrigger><SelectValue placeholder="Escolha" /></SelectTrigger><SelectContent>{pros.map((p:any)=><SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>)}</SelectContent></Select>
          </div>
          <div><Label>Serviço</Label>
            <Select value={svcId} onValueChange={setSvcId}><SelectTrigger><SelectValue placeholder="Escolha" /></SelectTrigger><SelectContent>{services?.map((s:any)=><SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent></Select>
          </div>
          <div><Label>Data</Label><Input type="date" value={dateStr} onChange={(e)=>setDateStr(e.target.value)} /></div>
          <div><Label>Hora</Label><Input type="time" value={time} onChange={(e)=>setTime(e.target.value)} /></div>
        </div>
      </div>
      <DialogFooter><Button onClick={save} disabled={busy || !name || !proId || !svcId}>Salvar</Button></DialogFooter>
    </DialogContent>
  );
}

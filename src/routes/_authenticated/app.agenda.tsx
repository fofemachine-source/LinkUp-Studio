import { createFileRoute } from "@tanstack/react-router";
import { useCurrentTenant } from "@/hooks/use-tenant";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Plus, ChevronLeft, ChevronRight, Crown } from "lucide-react";
import { addDays, format, startOfDay, endOfDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useMemo, useState, useEffect } from "react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { brl } from "@/lib/format";
import { syncAppointmentComanda } from "@/lib/commandas";
import { getPublicBookingUrl } from "@/lib/public-booking-url";
import {
  AgendaPremium,
  type AgendaAppointment,
  type AgendaViewMode,
} from "@/components/agenda/agenda-premium";

export const Route = createFileRoute("/_authenticated/app/agenda")({ component: AgendaPage });

function AgendaPage() {
  const { data: tenant } = useCurrentTenant();
  const qc = useQueryClient();
  const [date, setDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<AgendaViewMode>("day");
  const [openNew, setOpenNew] = useState(false);
  const [editAppt, setEditAppt] = useState<any>(null);
  const [selectedSlot, setSelectedSlot] = useState<{ proId: string; time: string } | null>(null);
  const [movingAppointmentId, setMovingAppointmentId] = useState<string | null>(null);
  const [premiumAgendaEnabled] = useState(true);
  const tenantId = tenant?.id;

  const rangeDays =
    viewMode === "week" ? 7 : viewMode === "threeDays" ? 3 : viewMode === "agenda" ? 14 : 1;
  const rangeEnd = endOfDay(addDays(date, rangeDays - 1));

  const { data: pros } = useQuery({
    queryKey: ["pros", tenantId], enabled: !!tenantId,
    queryFn: async () => (await supabase.from("professionals").select("*").eq("tenant_id", tenantId!).eq("active", true).order("full_name")).data ?? [],
  });

  const { data: appts } = useQuery({
    queryKey: ["appts", tenantId, format(date, "yyyy-MM-dd"), viewMode],
    enabled: !!tenantId,
    refetchInterval: 15_000,
    refetchOnWindowFocus: true,
    queryFn: async () =>
      (
        await supabase
          .from("appointments")
          .select("*, services(name,duration_min,price), clients(full_name,whatsapp,notes)")
          .eq("tenant_id", tenantId!)
          .gte("start_at", startOfDay(date).toISOString())
          .lte("start_at", rangeEnd.toISOString())
          .order("start_at")
      ).data ?? [],
  });

  const { data: servicesCatalog } = useQuery({
    queryKey: ["services-min", tenantId],
    enabled: !!tenantId,
    queryFn: async () =>
      (
        await supabase
          .from("services")
          .select("id,name,price,duration_min")
          .eq("tenant_id", tenantId!)
          .eq("active", true)
          .order("name")
      ).data ?? [],
  });

  const { data: productsCatalog } = useQuery({
    queryKey: ["products-min", tenantId],
    enabled: !!tenantId,
    queryFn: async () =>
      (
        await supabase
          .from("products")
          .select("id,name,price,cost_price")
          .eq("tenant_id", tenantId!)
          .eq("active", true)
          .order("name")
      ).data ?? [],
  });

  const { data: appointmentCommandas } = useQuery({
    queryKey: ["agenda-commandas", tenantId, format(date, "yyyy-MM-dd"), viewMode],
    enabled: !!tenantId,
    refetchInterval: 15_000,
    refetchOnWindowFocus: true,
    queryFn: async () =>
      (
        await supabase
          .from("commandas")
          .select("id,appointment_id,total,status,payment_method")
          .eq("tenant_id", tenantId!)
          .gte("scheduled_at", startOfDay(date).toISOString())
          .lte("scheduled_at", rangeEnd.toISOString())
      ).data ?? [],
  });

  const { data: clientHistory } = useQuery({
    queryKey: ["agenda-client-history", tenantId, format(date, "yyyy-MM-dd")],
    enabled: !!tenantId,
    queryFn: async () =>
      (
        await supabase
          .from("appointments")
          .select("id,client_id,client_name,start_at,end_at,status")
          .eq("tenant_id", tenantId!)
          .lte("start_at", rangeEnd.toISOString())
          .order("start_at", { ascending: false })
          .limit(750)
      ).data ?? [],
  });

  const { data: settings } = useQuery({
    queryKey: ["tenant-settings", tenantId],
    enabled: !!tenantId,
    queryFn: async () => (await supabase.from("tenant_settings").select("*").eq("tenant_id", tenantId!).maybeSingle()).data,
  });

  const slotMin = tenant?.slot_minutes ?? 30;
  const openHour = settings?.open_hour ?? 8;
  const closeHour = settings?.close_hour ?? 20;

  const isDayClosed = useMemo(() => {
    if (!settings) return false;
    const dateStr = format(date, "yyyy-MM-dd");
    const closedDates = (settings as any).closed_dates ?? [];
    if (closedDates.includes(dateStr)) return true;

    const dayOfWeek = date.getDay();
    const normalizedDay = dayOfWeek === 0 ? 7 : dayOfWeek;
    const workDays = settings.work_days ?? [1,2,3,4,5,6];
    if (!workDays.includes(normalizedDay)) return true;

    return false;
  }, [date, settings]);

  const times = useMemo(() => {
    const arr: string[] = [];
    for (let h = openHour; h <= closeHour; h++) {
      for (let m = 0; m < 60; m += slotMin) {
        if (h === closeHour && m > 0) break;
        arr.push(`${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`);
      }
    }
    return arr;
  }, [openHour, closeHour, slotMin]);

  const bookingSlug = tenant?.slug || "ernesth";
  const bookingLink = getPublicBookingUrl(bookingSlug);


  async function syncOperationalAppointment(appointment: AgendaAppointment) {
    if (!tenantId) throw new Error("Salão não identificado.");

    const serviceNames = parseAgendaNoteList(appointment.notes, "Serviços");
    const productNames = parseAgendaNoteList(appointment.notes, "Produtos");
    const serviceIds = [
      appointment.service_id,
      ...(servicesCatalog ?? [])
        .filter((service) => serviceNames.includes(service.name.trim().toLocaleLowerCase("pt-BR")))
        .map((service) => service.id),
    ].filter((id): id is string => Boolean(id));
    const productIds = (productsCatalog ?? [])
      .filter((product) => productNames.includes(product.name.trim().toLocaleLowerCase("pt-BR")))
      .map((product) => product.id);
    const paymentLabel = parseAgendaNoteValue(appointment.notes, "Pagamento");
    const paymentMap: Record<string, string> = {
      Pix: "pix",
      Dinheiro: "cash",
      "Cartão de Crédito": "credit",
      "Cartão de Débito": "debit",
      "Assinatura / VIP": "vip",
    };

    await syncAppointmentComanda(supabase, {
      appointmentId: appointment.id,
      tenantId,
      clientId: appointment.client_id ?? null,
      clientName: appointment.client_name || appointment.clients?.full_name || "Cliente",
      professionalId: appointment.professional_id,
      serviceIds: [...new Set(serviceIds)],
      productIds,
      services: servicesCatalog ?? [],
      products: productsCatalog ?? [],
      professionals: pros ?? [],
      scheduledAt: appointment.start_at,
      status: appointment.status,
      source: appointment.source === "online" ? "online" : "manual",
      paymentMethod: paymentMap[paymentLabel] ?? null,
    });
  }

  async function moveAppointment(
    appointment: AgendaAppointment,
    professionalId: string,
    time: string,
  ) {
    if (!tenantId) return;

    const targetProfessional = (pros ?? []).find(
      (professional) => professional.id === professionalId,
    );
    if (!targetProfessional || isAgendaProfessionalOff(targetProfessional, date)) {
      toast.error("Este profissional não está disponível nesta data.");
      return;
    }

    const [hour, minute] = time.split(":").map(Number);
    const start = new Date(date);
    start.setHours(hour, minute, 0, 0);
    const duration = Math.max(
      1,
      Math.round(
        (new Date(appointment.end_at).getTime() - new Date(appointment.start_at).getTime()) /
          60_000,
      ),
    );
    const end = new Date(start.getTime() + duration * 60_000);
    const hasConflict = (appts ?? []).some(
      (item) =>
        item.id !== appointment.id &&
        item.professional_id === professionalId &&
        item.status !== "cancelled" &&
        item.status !== "no_show" &&
        new Date(item.start_at) < end &&
        new Date(item.end_at) > start,
    );

    if (hasConflict) {
      toast.error("Este horário já está ocupado para o profissional selecionado.");
      return;
    }

    setMovingAppointmentId(appointment.id);
    try {
      const movedAppointment: AgendaAppointment = {
        ...appointment,
        professional_id: professionalId,
        start_at: start.toISOString(),
        end_at: end.toISOString(),
      };
      const { error } = await supabase
        .from("appointments")
        .update({
          professional_id: professionalId,
          start_at: movedAppointment.start_at,
          end_at: movedAppointment.end_at,
        })
        .eq("id", appointment.id)
        .eq("tenant_id", tenantId);
      if (error) throw error;

      await syncOperationalAppointment(movedAppointment);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["appts"] }),
        qc.invalidateQueries({ queryKey: ["agenda-commandas"] }),
      ]);
      toast.success(`Agendamento movido para ${format(start, "HH:mm")}.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível mover o agendamento.");
    } finally {
      setMovingAppointmentId(null);
    }
  }

  async function changeAppointmentStatus(appointment: AgendaAppointment, status: string) {
    if (!tenantId) return;
    setMovingAppointmentId(appointment.id);
    try {
      const { error } = await supabase
        .from("appointments")
        .update({ status })
        .eq("id", appointment.id)
        .eq("tenant_id", tenantId);
      if (error) throw error;
      await syncOperationalAppointment({ ...appointment, status });
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["appts"] }),
        qc.invalidateQueries({ queryKey: ["agenda-commandas"] }),
      ]);
      toast.success(status === "confirmed" ? "Agendamento confirmado." : "Agendamento cancelado.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Não foi possível atualizar o agendamento.",
      );
    } finally {
      setMovingAppointmentId(null);
    }
  }

  if (premiumAgendaEnabled) {
    return (
      <>
        <AgendaPremium
          date={date}
          viewMode={viewMode}
          professionals={pros ?? []}
          appointments={(appts ?? []) as AgendaAppointment[]}
          services={servicesCatalog ?? []}
          commandas={appointmentCommandas ?? []}
          clientHistory={clientHistory ?? []}
          openHour={openHour}
          closeHour={closeHour}
          slotMinutes={slotMin}
          isDayClosed={isDayClosed}
          bookingLink={bookingLink}
          movingAppointmentId={movingAppointmentId}
          onDateChange={setDate}
          onViewModeChange={setViewMode}
          onNewAppointment={(slot) => {
            setSelectedSlot(slot ? { proId: slot.professionalId, time: slot.time } : null);
            setOpenNew(true);
          }}
          onEditAppointment={(appointment) => setEditAppt(appointment)}
          onMoveAppointment={moveAppointment}
          onStatusChange={changeAppointmentStatus}
        />

        <Dialog
          open={openNew}
          onOpenChange={(open) => {
            setOpenNew(open);
            if (!open) setSelectedSlot(null);
          }}
        >
          <NewAppointmentDialog
            key={selectedSlot ? `${selectedSlot.proId}-${selectedSlot.time}` : "new-premium"}
            tenantId={tenantId}
            pros={pros ?? []}
            onDone={() => {
              setOpenNew(false);
              setSelectedSlot(null);
              qc.invalidateQueries({ queryKey: ["appts"] });
              qc.invalidateQueries({ queryKey: ["agenda-commandas"] });
            }}
            defaultDate={date}
            defaultProId={selectedSlot?.proId}
            defaultTime={selectedSlot?.time}
          />
        </Dialog>

        {editAppt && (
          <Dialog open={Boolean(editAppt)} onOpenChange={(open) => !open && setEditAppt(null)}>
            <EditAppointmentDialog
              appt={editAppt}
              tenantId={tenantId}
              pros={pros ?? []}
              onDone={() => {
                setEditAppt(null);
                qc.invalidateQueries({ queryKey: ["appts"] });
                qc.invalidateQueries({ queryKey: ["agenda-commandas"] });
              }}
              onDelete={() => {
                setEditAppt(null);
                qc.invalidateQueries({ queryKey: ["appts"] });
                qc.invalidateQueries({ queryKey: ["agenda-commandas"] });
              }}
              appts={(appts ?? []) as any[]}
            />
          </Dialog>
        )}
      </>
    );
  }
  return (
    <div className="space-y-6 max-w-[1600px] mx-auto">
      {isDayClosed && (
        <div className="p-3.5 bg-destructive/10 border border-destructive/20 text-destructive dark:bg-destructive/20 dark:text-red-300 rounded-xl text-xs font-semibold text-center uppercase tracking-wider animate-pulse flex items-center justify-center gap-2">
          <span>⚠️ A barbearia está fechada/de folga nesta data (configurado em Funcionamento).</span>
        </div>
      )}
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
          {(pros ?? []).map((p: any) => {
            const dateStr = format(date, "yyyy-MM-dd");
            const dayOfWeek = date.getDay();
            const normalizedDay = dayOfWeek === 0 ? 7 : dayOfWeek;
            const isProBlocked = p.blocked_dates?.includes(dateStr);
            const isProOffDay = !(p.work_days ?? [1,2,3,4,5,6]).includes(normalizedDay);
            const isProOff = isProBlocked || isProOffDay;

            return (
              <div key={p.id} className="p-3 border-b border-l flex items-center gap-2 relative">
                <Avatar className="h-9 w-9"><AvatarImage src={p.photo_url ?? undefined} /><AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">{p.full_name.split(" ").map((w:string)=>w[0]).slice(0,2).join("")}</AvatarFallback></Avatar>
                <div>
                  <div className="text-sm font-medium flex items-center gap-1.5">
                    {p.full_name}
                    {isProOff && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-red-500/20 text-red-500 dark:text-red-300 font-bold uppercase tracking-wider">
                        {isProBlocked ? "Bloqueado" : "Folga"}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">{p.role_label}</div>
                </div>
              </div>
            );
          })}
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
                
                const dateStr = format(date, "yyyy-MM-dd");
                const dayOfWeek = date.getDay();
                const normalizedDay = dayOfWeek === 0 ? 7 : dayOfWeek;
                const isProBlocked = p.blocked_dates?.includes(dateStr);
                const isProOffDay = !(p.work_days ?? [1,2,3,4,5,6]).includes(normalizedDay);
                const isProOff = isProBlocked || isProOffDay;

                return (
                  <div key={`${p.id}-${t}`} className="border-b border-l p-1 min-h-[54px]">
                    {a ? (
                      isStart ? (
                        <div onClick={() => setEditAppt(a)} className={`h-full rounded-lg p-2 text-xs cursor-pointer transition-colors ${
                          a.is_vip
                            ? "bg-blue-500/15 border-l-4 border-blue-500 text-blue-900 dark:text-blue-200 hover:bg-blue-500/25"
                            : a.status === "completed"
                              ? "bg-success/15 border-l-4 border-success text-success-foreground hover:bg-success/25"
                              : "bg-primary/10 border-l-4 border-primary hover:bg-primary/20"
                        }`}>
                          <div className="flex items-center justify-between text-[9px] text-muted-foreground/80 font-mono mb-0.5">
                            <span>{format(new Date(a.start_at), "HH:mm")} - {format(new Date(a.end_at), "HH:mm")}</span>
                          </div>
                          <div className={`font-semibold truncate ${a.status === "completed" ? "text-success" : ""}`}>{a.client_name || a.clients?.full_name}</div>
                          {a.is_vip && (
                            <div className="text-[9px] text-emerald-600 dark:text-emerald-400 font-bold uppercase tracking-wider mt-0.5">
                              Assinante
                            </div>
                          )}
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
                    ) : isProOff ? (
                      <div className="h-full rounded-lg bg-red-500/5 dark:bg-red-500/10 border border-red-500/10 p-2 text-[10px] text-red-500/70 font-bold flex items-center justify-center uppercase tracking-wider select-none">
                        {isProBlocked ? "Bloqueado" : "Folga"}
                      </div>
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
  const [clientId, setClientId] = useState<string>("");
  const [isRegisteringNewClient, setIsRegisteringNewClient] = useState(false);
  const [newClientName, setNewClientName] = useState("");
  const [newClientWa, setNewClientWa] = useState("");

  const [proId, setProId] = useState(defaultProId ?? "");
  const [dateStr, setDateStr] = useState(format(defaultDate, "yyyy-MM-dd"));
  const [time, setTime] = useState(defaultTime ?? "09:00");
  const [isVip, setIsVip] = useState(false);
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
  const hasClientData = isRegisteringNewClient
    ? Boolean(newClientName.trim() && newClientWa.trim())
    : Boolean(clientId);
  const canConfirmReservation = !busy && hasClientData && Boolean(proId) && selectedSvcs.length > 0;

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

      const paymentMapped: Record<string, string> = {
        "Pix": "pix",
        "Dinheiro": "cash",
        "Cartão de Crédito": "credit",
        "Cartão de Débito": "debit",
        "Assinatura / VIP": "vip",
      };
      const mappedMethod = paymentMapped[paymentMethod] ?? null;
      const finalObs = [obs, svcsText, prodsText, payText].filter(Boolean).join(" | ");

      const { data: appt, error } = await supabase.from("appointments").insert({
        tenant_id: tenantId!,
        professional_id: proId,
        service_id: firstSvcId,
        client_id: finalClientId || null,
        client_name: finalName,
        client_whatsapp: finalWa.replace(/\D/g, ""),
        start_at: currentStart.toISOString(),
        end_at: currentEnd.toISOString(),
        status,
        source: "manual",
        notes: finalObs,
        is_vip: isVip,
      }).select("id").single();
      if (error) throw error;

      try {
        await syncAppointmentComanda(supabase, {
          appointmentId: appt.id,
          tenantId: tenantId!,
          clientId: finalClientId || null,
          clientName: finalName,
          professionalId: proId,
          serviceIds: selectedSvcs,
          productIds: selectedProds,
          services: services ?? [],
          products: products ?? [],
          professionals: pros,
          scheduledAt: currentStart.toISOString(),
          status,
          source: "manual",
          paymentMethod: mappedMethod,
        });
      } catch (cmdError) {
        await supabase.from("appointments").delete().eq("id", appt.id);
        throw cmdError;
      }

      toast.success("Agendamento criado e comanda aberta!");
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
            <Select value={isRegisteringNewClient ? "new_client" : clientId} onValueChange={(val) => {
              if (val === "new_client") {
                setIsRegisteringNewClient(true);
                setClientId("");
                setIsVip(false);
              } else {
                setIsRegisteringNewClient(false);
                setClientId(val);
                const selectedClient = clients?.find((c: any) => c.id === val);
                setIsVip(selectedClient?.is_subscriber === true);
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
          <div className="flex items-center gap-2 pt-2">
            <Switch id="is-vip-appt" checked={isVip} onCheckedChange={setIsVip} />
            <Label htmlFor="is-vip-appt" className="text-xs font-semibold uppercase cursor-pointer flex items-center gap-1.5 select-none text-muted-foreground">
              <Crown className="h-3.5 w-3.5 text-amber-500 fill-amber-500/20" /> Agendamento VIP / Assinante
            </Label>
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
              <SelectItem value="Assinatura / VIP">Assinatura / VIP</SelectItem>
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
        <Button onClick={save} disabled={!canConfirmReservation} className="rounded-full">CONFIRMAR RESERVA</Button>
      </div>
    </DialogContent>
  );
}

function EditAppointmentDialog({ appt, tenantId, pros, onDone, onDelete, appts }: { appt: any; tenantId?: string; pros: any[]; onDone: () => void; onDelete: () => void; appts: any[] }) {
  const qc = useQueryClient();
  const [clientId, setClientId] = useState<string>(appt.client_id || "");
  const [isRegisteringNewClient, setIsRegisteringNewClient] = useState(false);
  const [newClientName, setNewClientName] = useState("");
  const [newClientWa, setNewClientWa] = useState("");

  const [proId, setProId] = useState(appt.professional_id || "");
  const [dateStr, setDateStr] = useState(format(new Date(appt.start_at), "yyyy-MM-dd"));
  const [time, setTime] = useState(format(new Date(appt.start_at), "HH:mm"));
  const [isVip, setIsVip] = useState(appt.is_vip || false);
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
      const parts = raw.split(" | ").filter((p: string) => !p.startsWith("Serviços:") && !p.startsWith("Produtos:") && !p.startsWith("Pagamento:") && !p.startsWith("Comanda ID:"));
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

      const paymentMapped: Record<string, string> = {
        "Pix": "pix",
        "Dinheiro": "cash",
        "Cartão de Crédito": "credit",
        "Cartão de Débito": "debit",
        "Assinatura / VIP": "vip",
      };
      const mappedMethod = paymentMapped[paymentMethod] ?? null;

      const finalObs = [obs, svcsText, prodsText, payText].filter(Boolean).join(" | ");

      const extraIdsToDelete = chain.map(x => x.id).filter((id) => id !== appt.id);
      if (extraIdsToDelete.length > 0) {
        await supabase.from("commandas").update({ status: "canceled" }).in("appointment_id", extraIdsToDelete).neq("status", "closed");
        const { error: delError } = await supabase.from("appointments").delete().in("id", extraIdsToDelete);
        if (delError) throw delError;
      }

      const { error } = await supabase.from("appointments").update({
        tenant_id: tenantId!,
        professional_id: proId,
        service_id: firstSvcId,
        client_id: finalClientId || null,
        client_name: finalName,
        client_whatsapp: finalWa.replace(/\D/g, ""),
        start_at: currentStart.toISOString(),
        end_at: currentEnd.toISOString(),
        status,
        notes: finalObs,
        source: appt.source ?? "manual",
        is_vip: isVip,
      }).eq("id", appt.id);
      if (error) throw error;

      await syncAppointmentComanda(supabase, {
        appointmentId: appt.id,
        tenantId: tenantId!,
        clientId: finalClientId || null,
        clientName: finalName,
        professionalId: proId,
        serviceIds: selectedSvcs,
        productIds: selectedProds,
        services: services ?? [],
        products: products ?? [],
        professionals: pros,
        scheduledAt: currentStart.toISOString(),
        status,
        source: appt.source === "online" ? "online" : "manual",
        paymentMethod: mappedMethod,
      });

      toast.success("Agendamento atualizado e comanda sincronizada!");
      onDone();
    } catch (e:any) { toast.error(e.message); } finally { setBusy(false); }
  }

  async function handleDelete() {
     if(!confirm("Deseja realmente excluir este agendamento (incluindo todos os serviços associados)?")) return;
     setBusy(true);
     const idsToDelete = chain.map(x => x.id);
     await supabase.from("commandas").update({ status: "canceled" }).in("appointment_id", idsToDelete).eq("status", "open");
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
          <div className="flex items-center gap-2 pt-2">
            <Switch id="is-vip-edit-appt" checked={isVip} onCheckedChange={setIsVip} />
            <Label htmlFor="is-vip-edit-appt" className="text-xs font-semibold uppercase cursor-pointer flex items-center gap-1.5 select-none text-muted-foreground">
              <Crown className="h-3.5 w-3.5 text-amber-500 fill-amber-500/20" /> Agendamento VIP / Assinante
            </Label>
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
              <SelectItem value="Assinatura / VIP">Assinatura / VIP</SelectItem>
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

function parseAgendaNoteValue(notes: string | null | undefined, label: string) {
  if (!notes) return "";
  const item = notes.split(" | ").find((part) => part.trim().startsWith(`${label}:`));
  return item?.slice(item.indexOf(":") + 1).trim() ?? "";
}

function parseAgendaNoteList(notes: string | null | undefined, label: string) {
  return parseAgendaNoteValue(notes, label)
    .split(",")
    .map((item) => item.trim().toLocaleLowerCase("pt-BR"))
    .filter(Boolean);
}

function isAgendaProfessionalOff(
  professional: { blocked_dates?: string[] | null; work_days?: number[] | null },
  date: Date,
) {
  const dateString = format(date, "yyyy-MM-dd");
  const normalizedDay = date.getDay() === 0 ? 7 : date.getDay();
  return (
    Boolean(professional.blocked_dates?.includes(dateString)) ||
    !(professional.work_days ?? [1, 2, 3, 4, 5, 6]).includes(normalizedDay)
  );
}

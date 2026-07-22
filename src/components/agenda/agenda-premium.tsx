import { AnimatePresence, motion } from "framer-motion";
import {
  Banknote,
  Bell,
  Cake,
  CalendarClock,
  CalendarDays,
  CalendarRange,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  Copy,
  Crown,
  ExternalLink,
  Gauge,
  Globe2,
  History,
  ListChecks,
  Pencil,
  Phone,
  Plus,
  QrCode as QrCodeIcon,
  Search,
  Scissors,
  ShoppingBag,
  Sparkles,
  StickyNote,
  Target,
  Timer,
  UserCheck,
  UserRoundSearch,
  UserRoundX,
  UsersRound,
  X,
} from "lucide-react";
import { addDays, differenceInMinutes, format, isSameDay, isToday, startOfDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useEffect, useMemo, useRef, useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { QrCode } from "@/lib/qr";
import { brl } from "@/lib/format";
import {
  bookingWeekdayFromDate,
  DEFAULT_BOOKING_WORK_DAYS,
  includesBookingWeekday,
} from "@/lib/booking-weekdays";

export type AgendaViewMode = "day" | "threeDays" | "week" | "agenda";

export type AgendaProfessional = {
  id: string;
  full_name: string;
  photo_url?: string | null;
  role_label?: string | null;
  specialty?: string | null;
  blocked_dates?: string[] | null;
  work_days?: number[] | null;
};

export type AgendaService = {
  id: string;
  name: string;
  price?: number | null;
  duration_min?: number | null;
};

export type AgendaAppointment = {
  id: string;
  client_id?: string | null;
  client_name?: string | null;
  client_whatsapp?: string | null;
  professional_id: string;
  service_id?: string | null;
  start_at: string;
  end_at: string;
  status?: string | null;
  notes?: string | null;
  source?: string | null;
  is_vip?: boolean | null;
  subscription_id?: string | null;
  services?: {
    name?: string | null;
    duration_min?: number | null;
    price?: number | null;
  } | null;
  clients?: {
    full_name?: string | null;
    whatsapp?: string | null;
    notes?: string | null;
  } | null;
};

export type AgendaComanda = {
  id: string;
  appointment_id?: string | null;
  total?: number | null;
  status?: string | null;
  payment_method?: string | null;
};

export type AgendaHistoryItem = {
  id: string;
  client_id?: string | null;
  client_name?: string | null;
  start_at: string;
  end_at: string;
  status?: string | null;
};

type AgendaPremiumProps = {
  date: Date;
  viewMode: AgendaViewMode;
  professionals: AgendaProfessional[];
  appointments: AgendaAppointment[];
  services: AgendaService[];
  commandas: AgendaComanda[];
  clientHistory: AgendaHistoryItem[];
  openHour: number;
  closeHour: number;
  slotMinutes: number;
  isDayClosed: boolean;
  bookingLink: string;
  movingAppointmentId?: string | null;
  onDateChange: (date: Date) => void;
  onViewModeChange: (mode: AgendaViewMode) => void;
  onNewAppointment: (slot?: { professionalId: string; time: string }) => void;
  onEditAppointment: (appointment: AgendaAppointment) => void;
  onMoveAppointment: (
    appointment: AgendaAppointment,
    professionalId: string,
    time: string,
  ) => Promise<void>;
  onStatusChange: (appointment: AgendaAppointment, status: string) => Promise<void>;
};

const STATUS_META: Record<string, { label: string; dot: string; border: string; soft: string }> = {
  pending: {
    label: "Aguardando",
    dot: "bg-amber-400",
    border: "border-l-amber-400",
    soft: "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300",
  },
  confirmed: {
    label: "Confirmado",
    dot: "bg-emerald-500",
    border: "border-l-emerald-500",
    soft: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300",
  },
  arrived: {
    label: "Chegou",
    dot: "bg-sky-500",
    border: "border-l-sky-500",
    soft: "bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-300",
  },
  in_progress: {
    label: "Em atendimento",
    dot: "bg-violet-500",
    border: "border-l-violet-500",
    soft: "bg-violet-50 text-violet-700 dark:bg-violet-500/10 dark:text-violet-300",
  },
  completed: {
    label: "Finalizado",
    dot: "bg-slate-400",
    border: "border-l-slate-400",
    soft: "bg-slate-100 text-slate-600 dark:bg-slate-500/15 dark:text-slate-300",
  },
  cancelled: {
    label: "Cancelado",
    dot: "bg-rose-500",
    border: "border-l-rose-500",
    soft: "bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300",
  },
  no_show: {
    label: "Não compareceu",
    dot: "bg-rose-400",
    border: "border-l-rose-400",
    soft: "bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300",
  },
};

const VIEW_OPTIONS: Array<{ value: AgendaViewMode; label: string }> = [
  { value: "day", label: "Dia" },
  { value: "threeDays", label: "3 dias" },
  { value: "week", label: "Semana" },
  { value: "agenda", label: "Agenda" },
];

const ACTIVE_STATUSES = new Set(["pending", "confirmed", "arrived", "in_progress"]);
const VISIBLE_STATUSES = new Set(["pending", "confirmed", "arrived", "in_progress", "completed"]);
const SLOT_HEIGHT = 72;

export function AgendaPremium({
  date,
  viewMode,
  professionals,
  appointments,
  services,
  commandas,
  clientHistory,
  openHour,
  closeHour,
  slotMinutes,
  isDayClosed,
  bookingLink,
  movingAppointmentId,
  onDateChange,
  onViewModeChange,
  onNewAppointment,
  onEditAppointment,
  onMoveAppointment,
  onStatusChange,
}: AgendaPremiumProps) {
  const [clientSearch, setClientSearch] = useState("");
  const [professionalSearch, setProfessionalSearch] = useState("");
  const [professionalFilter, setProfessionalFilter] = useState("all");
  const [serviceFilter, setServiceFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [draggedAppointmentId, setDraggedAppointmentId] = useState<string | null>(null);
  const [qrOpen, setQrOpen] = useState(false);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const commandasByAppointment = useMemo(
    () =>
      new Map(
        commandas.filter((item) => item.appointment_id).map((item) => [item.appointment_id!, item]),
      ),
    [commandas],
  );

  const visibleProfessionals = useMemo(() => {
    const query = normalizeSearch(professionalSearch);
    return professionals.filter((professional) => {
      if (professionalFilter !== "all" && professional.id !== professionalFilter) return false;
      if (!query) return true;
      return matchesSearch(query, [
        professional.full_name,
        professional.role_label,
        professional.specialty,
      ]);
    });
  }, [professionalFilter, professionalSearch, professionals]);

  const filteredAppointments = useMemo(() => {
    const query = normalizeSearch(clientSearch);
    return appointments.filter((appointment) => {
      if (
        query &&
        !matchesSearch(query, [
          getClientName(appointment),
          appointment.client_whatsapp,
          appointment.clients?.whatsapp,
          getServiceName(appointment),
        ])
      )
        return false;
      if (
        !visibleProfessionals.some(
          (professional) => professional.id === appointment.professional_id,
        )
      )
        return false;
      if (serviceFilter !== "all" && appointment.service_id !== serviceFilter) return false;
      if (statusFilter !== "all" && appointment.status !== statusFilter) return false;
      return true;
    });
  }, [
    appointments,
    clientSearch,
    serviceFilter,
    statusFilter,
    visibleProfessionals,
  ]);

  const clientSuggestions = useMemo(() => {
    const query = normalizeSearch(clientSearch);
    if (!query) return [];

    const uniqueClients = new Map<string, { value: string; label: string; description?: string }>();
    appointments.forEach((appointment) => {
      const label = getClientName(appointment);
      const phone = appointment.client_whatsapp || appointment.clients?.whatsapp || undefined;
      const key = normalizeSearch(label);
      if (
        !uniqueClients.has(key) &&
        matchesSearch(query, [label, phone, getServiceName(appointment)])
      ) {
        uniqueClients.set(key, {
          value: label,
          label,
          description: phone || getServiceName(appointment),
        });
      }
    });
    return [...uniqueClients.values()].slice(0, 6);
  }, [appointments, clientSearch]);

  const professionalSuggestions = useMemo(() => {
    const query = normalizeSearch(professionalSearch);
    if (!query) return [];
    return professionals
      .filter((professional) =>
        matchesSearch(query, [
          professional.full_name,
          professional.role_label,
          professional.specialty,
        ]),
      )
      .slice(0, 6)
      .map((professional) => ({
        value: professional.full_name,
        label: professional.full_name,
        description: professional.specialty || professional.role_label || "Profissional",
      }));
  }, [professionalSearch, professionals]);

  const dayAppointments = useMemo(
    () =>
      filteredAppointments.filter((appointment) => isSameDay(new Date(appointment.start_at), date)),
    [date, filteredAppointments],
  );

  const workingProfessionals = useMemo(
    () => professionals.filter((professional) => !isProfessionalOff(professional, date)),
    [date, professionals],
  );

  const metrics = useMemo(() => {
    const operational = appointments.filter(
      (appointment) =>
        isSameDay(new Date(appointment.start_at), date) &&
        VISIBLE_STATUSES.has(appointment.status ?? "pending"),
    );
    const totalAvailableMinutes =
      Math.max(0, closeHour - openHour) * 60 * workingProfessionals.length;
    const occupiedMinutes = operational.reduce(
      (total, appointment) =>
        total +
        Math.max(
          0,
          differenceInMinutes(new Date(appointment.end_at), new Date(appointment.start_at)),
        ),
      0,
    );
    const expectedRevenue = operational.reduce(
      (total, appointment) =>
        total + getAppointmentValue(appointment, commandasByAppointment, services),
      0,
    );
    const completed = operational.filter((appointment) => appointment.status === "completed");
    const realizedRevenue = completed.reduce(
      (total, appointment) =>
        total + getAppointmentValue(appointment, commandasByAppointment, services),
      0,
    );
    const averageDuration = operational.length
      ? Math.round(occupiedMinutes / operational.length)
      : 0;
    const totalSlots = Math.floor(totalAvailableMinutes / slotMinutes);
    const occupiedSlots = Math.ceil(occupiedMinutes / slotMinutes);

    return {
      appointments: operational.length,
      workingProfessionals: workingProfessionals.length,
      freeSlots: Math.max(0, totalSlots - occupiedSlots),
      occupancy: totalAvailableMinutes
        ? Math.min(100, Math.round((occupiedMinutes / totalAvailableMinutes) * 100))
        : 0,
      expectedRevenue,
      realizedRevenue,
      averageDuration,
    };
  }, [
    appointments,
    closeHour,
    commandasByAppointment,
    date,
    openHour,
    services,
    slotMinutes,
    workingProfessionals,
  ]);

  const kpis = [
    { label: "Atendimentos", value: String(metrics.appointments), icon: CalendarDays },
    { label: "Profissionais", value: String(metrics.workingProfessionals), icon: UsersRound },
    { label: "Horários livres", value: String(metrics.freeSlots), icon: Clock3 },
    { label: "Taxa de ocupação", value: `${metrics.occupancy}%`, icon: Gauge },
    { label: "Faturamento previsto", value: brl(metrics.expectedRevenue), icon: Banknote },
    { label: "Tempo médio", value: `${metrics.averageDuration} min`, icon: Timer },
  ];

  const step = viewMode === "week" ? 7 : viewMode === "threeDays" ? 3 : 1;
  const dateLabel = getDateLabel(date, viewMode);

  function changeDate(direction: number) {
    onDateChange(addDays(date, direction * step));
  }

  async function handleDrop(professionalId: string, time: string) {
    const appointment = appointments.find((item) => item.id === draggedAppointmentId);
    setDraggedAppointmentId(null);
    if (!appointment) return;
    await onMoveAppointment(appointment, professionalId, time);
  }

  return (
    <div className="mx-auto max-w-[1900px] space-y-4 pb-8">
      {isDayClosed && (
        <div className="flex items-center justify-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300">
          <UserRoundX className="h-4 w-4" />O salão está fechado nesta data conforme as
          configurações de funcionamento.
        </div>
      )}

      <section className="rounded-[28px] border border-border/70 bg-card p-4 shadow-[0_18px_55px_-40px_rgba(15,23,42,0.35)] sm:p-5">
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
          <div className="min-w-0 space-y-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  <Sparkles className="h-3.5 w-3.5 text-primary" /> Operação do dia
                </div>
                <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Agenda</h1>
                <p className="mt-1 capitalize text-sm text-muted-foreground">
                  {isToday(date) ? "Hoje" : format(date, "EEEE", { locale: ptBR })} •{" "}
                  {format(date, "dd 'de' MMMM", { locale: ptBR })}
                </p>
              </div>
              <div className="rounded-full border bg-muted/35 px-3 py-1.5 text-xs font-medium text-muted-foreground">
                Atualizado às {format(now, "HH:mm")}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5 md:grid-cols-3 2xl:grid-cols-6">
              {kpis.map((kpi, index) => {
                const Icon = kpi.icon;
                return (
                  <motion.div
                    key={kpi.label}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.035, duration: 0.28 }}
                    className="rounded-2xl border border-border/60 bg-background/80 p-3.5 shadow-[0_8px_24px_-22px_rgba(15,23,42,0.45)]"
                  >
                    <div className="mb-3 flex h-8 w-8 items-center justify-center rounded-xl bg-muted/70 text-muted-foreground">
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="truncate text-lg font-semibold tracking-tight">{kpi.value}</div>
                    <div className="mt-0.5 truncate text-[11px] font-medium text-muted-foreground">
                      {kpi.label}
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </div>

          <div className="flex flex-col gap-3 rounded-2xl border border-border/60 bg-muted/20 p-3.5">
            <Button className="h-11 rounded-xl shadow-sm" onClick={() => onNewAppointment()}>
              <Plus className="mr-2 h-4 w-4" /> Novo agendamento
            </Button>
            <div className="space-y-3 rounded-xl border bg-background p-3">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Globe2 className="h-4 w-4" />
                </div>
                <div>
                  <div className="text-xs font-semibold">Agendamento online</div>
                  <div className="text-[10px] text-muted-foreground">Página pública do salão</div>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 rounded-lg px-2 text-[10px]"
                  onClick={() => {
                    navigator.clipboard.writeText(bookingLink);
                  }}
                >
                  <Copy className="mr-1 h-3 w-3" /> Copiar
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 rounded-lg px-2 text-[10px]"
                  onClick={() => setQrOpen(true)}
                >
                  <QrCodeIcon className="mr-1 h-3 w-3" /> QR Code
                </Button>
                <Button
                  asChild
                  variant="outline"
                  size="sm"
                  className="h-8 rounded-lg px-2 text-[10px]"
                >
                  <a href={bookingLink} target="_blank" rel="noreferrer">
                    <ExternalLink className="mr-1 h-3 w-3" /> Abrir
                  </a>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-border/70 bg-card p-3 shadow-[0_12px_36px_-34px_rgba(15,23,42,0.4)]">
        <div className="flex flex-col gap-3 2xl:flex-row 2xl:items-center 2xl:justify-between">
          <div className="flex items-center gap-1.5">
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 rounded-xl"
              onClick={() => changeDate(-1)}
              aria-label="Período anterior"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              className="h-9 rounded-xl px-4"
              onClick={() => onDateChange(new Date())}
            >
              Hoje
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 rounded-xl"
              onClick={() => changeDate(1)}
              aria-label="Próximo período"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            <div className="ml-2 min-w-0">
              <div className="truncate text-sm font-semibold capitalize">{dateLabel}</div>
              <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                Visão operacional
              </div>
            </div>
          </div>

          <div className="inline-flex w-fit rounded-xl border bg-muted/45 p-1">
            {VIEW_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => onViewModeChange(option.value)}
                className={`relative rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${viewMode === option.value ? "text-foreground" : "text-muted-foreground hover:text-foreground"}`}
              >
                {viewMode === option.value && (
                  <motion.span
                    layoutId="agenda-view-pill"
                    className="absolute inset-0 rounded-lg border bg-background shadow-sm"
                    transition={{ type: "spring", stiffness: 420, damping: 32 }}
                  />
                )}
                <span className="relative z-10">{option.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-[1.2fr_1.1fr_0.95fr_0.95fr_0.9fr]">
          <FilterInput
            icon={Search}
            value={clientSearch}
            onChange={setClientSearch}
            placeholder="Pesquisar cliente"
            suggestions={clientSuggestions}
            resultLabel={`${filteredAppointments.length} agendamento${filteredAppointments.length === 1 ? "" : "s"}`}
          />
          <FilterInput
            icon={UserRoundSearch}
            value={professionalSearch}
            onChange={setProfessionalSearch}
            placeholder="Pesquisar profissional"
            suggestions={professionalSuggestions}
            resultLabel={`${visibleProfessionals.length} profissional${visibleProfessionals.length === 1 ? "" : "is"}`}
          />
          <Select value={professionalFilter} onValueChange={setProfessionalFilter}>
            <SelectTrigger className="h-9 rounded-xl bg-background text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os profissionais</SelectItem>
              {professionals.map((professional) => (
                <SelectItem key={professional.id} value={professional.id}>
                  {professional.full_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={serviceFilter} onValueChange={setServiceFilter}>
            <SelectTrigger className="h-9 rounded-xl bg-background text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os serviços</SelectItem>
              {services.map((service) => (
                <SelectItem key={service.id} value={service.id}>
                  {service.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-9 rounded-xl bg-background text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os status</SelectItem>
              {Object.entries(STATUS_META).map(([value, meta]) => (
                <SelectItem key={value} value={value}>
                  {meta.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </section>

      <div className="grid items-start gap-4 2xl:grid-cols-[minmax(0,1fr)_300px]">
        <AnimatePresence mode="wait">
          <motion.div
            key={viewMode}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.2 }}
            className="min-w-0"
          >
            {viewMode === "day" ? (
              <DayTimeline
                date={date}
                now={now}
                professionals={visibleProfessionals}
                appointments={dayAppointments}
                services={services}
                commandasByAppointment={commandasByAppointment}
                clientHistory={clientHistory}
                openHour={openHour}
                closeHour={closeHour}
                slotMinutes={slotMinutes}
                draggedAppointmentId={draggedAppointmentId}
                movingAppointmentId={movingAppointmentId}
                onDragStart={setDraggedAppointmentId}
                onDrop={handleDrop}
                onNewAppointment={onNewAppointment}
                onEditAppointment={onEditAppointment}
                onStatusChange={onStatusChange}
              />
            ) : (
              <RangeAgenda
                date={date}
                mode={viewMode}
                professionals={visibleProfessionals}
                appointments={filteredAppointments}
                services={services}
                commandasByAppointment={commandasByAppointment}
                onEditAppointment={onEditAppointment}
              />
            )}
          </motion.div>
        </AnimatePresence>

        <OperationsSidebar
          date={date}
          now={now}
          appointments={appointments.filter((appointment) =>
            isSameDay(new Date(appointment.start_at), date),
          )}
          professionals={professionals}
          metrics={metrics}
          commandasByAppointment={commandasByAppointment}
          services={services}
          onEditAppointment={onEditAppointment}
        />
      </div>

      <Dialog open={qrOpen} onOpenChange={setQrOpen}>
        <DialogContent className="max-w-sm rounded-3xl">
          <DialogHeader>
            <DialogTitle>Agendamento online</DialogTitle>
            <DialogDescription>
              Aponte a câmera para abrir a página pública do salão.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-center py-3">
            <QrCode value={bookingLink} size={220} />
          </div>
          <Button
            variant="outline"
            className="rounded-xl"
            onClick={() => navigator.clipboard.writeText(bookingLink)}
          >
            <Copy className="mr-2 h-4 w-4" /> Copiar link
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DayTimeline({
  date,
  now,
  professionals,
  appointments,
  services,
  commandasByAppointment,
  clientHistory,
  openHour,
  closeHour,
  slotMinutes,
  draggedAppointmentId,
  movingAppointmentId,
  onDragStart,
  onDrop,
  onNewAppointment,
  onEditAppointment,
  onStatusChange,
}: {
  date: Date;
  now: Date;
  professionals: AgendaProfessional[];
  appointments: AgendaAppointment[];
  services: AgendaService[];
  commandasByAppointment: Map<string, AgendaComanda>;
  clientHistory: AgendaHistoryItem[];
  openHour: number;
  closeHour: number;
  slotMinutes: number;
  draggedAppointmentId: string | null;
  movingAppointmentId?: string | null;
  onDragStart: (appointmentId: string | null) => void;
  onDrop: (professionalId: string, time: string) => void;
  onNewAppointment: (slot?: { professionalId: string; time: string }) => void;
  onEditAppointment: (appointment: AgendaAppointment) => void;
  onStatusChange: (appointment: AgendaAppointment, status: string) => Promise<void>;
}) {
  const allTimes = useMemo(
    () => buildTimes(openHour, closeHour, slotMinutes),
    [closeHour, openHour, slotMinutes],
  );
  const isTodayView = isToday(date);
  const nowSlotMinutes = isTodayView
    ? Math.floor((now.getHours() * 60 + now.getMinutes()) / slotMinutes) * slotMinutes
    : -1;
  const times = useMemo(() => {
    if (!isTodayView) return allTimes;
    return allTimes.filter((t) => {
      const [hh, mm] = t.split(":").map(Number);
      return hh * 60 + mm >= nowSlotMinutes;
    });
  }, [allTimes, isTodayView, nowSlotMinutes]);
  const timelineOpenMinutes = times.length > 0
    ? (() => { const [h, m] = times[0].split(":").map(Number); return h * 60 + m; })()
    : openHour * 60;
  const bodyHeight = times.length * SLOT_HEIGHT;
  const totalMinutes = Math.max(1, times.length * slotMinutes);
  const nowMinutes = now.getHours() * 60 + now.getMinutes() - timelineOpenMinutes;
  const nowTop = (nowMinutes / slotMinutes) * SLOT_HEIGHT;
  const showNowLine = isTodayView && nowMinutes >= 0 && nowMinutes <= totalMinutes;
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const scrollSignature = useMemo(
    () =>
      [
        format(date, "yyyy-MM-dd"),
        openHour,
        closeHour,
        slotMinutes,
        professionals.map((professional) => professional.id).join(","),
        appointments
          .map((appointment) => `${appointment.id}:${appointment.start_at}:${appointment.end_at}:${appointment.status}`)
          .join("|"),
      ].join("::"),
    [appointments, closeHour, date, openHour, professionals, slotMinutes],
  );

  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;

    const timer = window.setTimeout(() => {
      if (!isToday(date)) {
        container.scrollTo({ top: 0, behavior: "auto" });
        return;
      }

      const operationalAppointments = appointments
        .filter((appointment) => appointment.status !== "cancelled" && appointment.status !== "no_show")
        .sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime());

      const activeAppointment = operationalAppointments.find((appointment) => {
        const start = new Date(appointment.start_at);
        const end = new Date(appointment.end_at);
        return now >= start && now < end;
      });
      const nextAppointment = operationalAppointments.find(
        (appointment) => new Date(appointment.start_at) >= now,
      );

      const targetDate = activeAppointment
        ? new Date(activeAppointment.start_at)
        : nextAppointment
          ? new Date(nextAppointment.start_at)
          : now;
      const targetMinutes = targetDate.getHours() * 60 + targetDate.getMinutes() - openHour * 60;
      const targetTop = (Math.max(0, targetMinutes) / slotMinutes) * SLOT_HEIGHT;
      const comfortableOffset = Math.max(SLOT_HEIGHT * 2, 120);

      container.scrollTo({
        top: Math.max(0, targetTop - comfortableOffset),
        behavior: "smooth",
      });
    }, 80);

    return () => window.clearTimeout(timer);
  // A rolagem inicial usa o "agora" da abertura da tela, mas não acompanha cada minuto
  // para não roubar a rolagem manual do usuário enquanto ele trabalha na agenda.
  }, [appointments, date, openHour, scrollSignature, slotMinutes]);

  if (!professionals.length) {
    return (
      <EmptyState
        icon={UsersRound}
        title="Nenhum profissional encontrado"
        description="Ajuste os filtros para voltar a visualizar a equipe."
      />
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-border/70 bg-card shadow-[0_18px_55px_-45px_rgba(15,23,42,0.45)]">
      <div ref={scrollRef} className="max-h-[calc(100vh-230px)] overflow-auto scroll-smooth">
        <div style={{ minWidth: 72 + professionals.length * 258 }}>
          <div
            className="sticky top-0 z-30 grid border-b bg-card/95 backdrop-blur"
            style={{
              gridTemplateColumns: `72px repeat(${professionals.length}, minmax(258px, 1fr))`,
            }}
          >
            <div className="flex items-end justify-center p-3 text-[9px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Hora
            </div>
            {professionals.map((professional) => (
              <ProfessionalHeader
                key={professional.id}
                professional={professional}
                date={date}
                now={now}
                appointments={appointments.filter(
                  (appointment) => appointment.professional_id === professional.id,
                )}
                services={services}
                commandasByAppointment={commandasByAppointment}
              />
            ))}
          </div>

          <div
            className="relative grid"
            style={{
              gridTemplateColumns: `72px repeat(${professionals.length}, minmax(258px, 1fr))`,
              height: bodyHeight,
            }}
          >
            <div className="relative bg-muted/[0.12]">
              {times.map((time, index) => (
                <div
                  key={time}
                  className="absolute left-0 right-0 pr-3 text-right text-[10px] font-medium text-muted-foreground/65"
                  style={{ top: index * SLOT_HEIGHT - 6 }}
                >
                  {time}
                </div>
              ))}
            </div>

            {professionals.map((professional) => {
              const professionalAppointments = appointments.filter(
                (appointment) => {
                  if (appointment.professional_id !== professional.id) return false;
                  if (!isTodayView) return true;
                  // Hide past appointments already ended in the "now onward" view.
                  const end = new Date(appointment.end_at);
                  return end.getHours() * 60 + end.getMinutes() > nowSlotMinutes;
                },
              );
              const off = isProfessionalOff(professional, date);
              return (
                <div
                  key={professional.id}
                  className={`relative border-l ${off ? "bg-slate-100/50 dark:bg-slate-900/25" : "bg-card"}`}
                  style={{
                    backgroundImage: `repeating-linear-gradient(to bottom, transparent 0, transparent ${SLOT_HEIGHT - 1}px, color-mix(in oklab, var(--border) 75%, transparent) ${SLOT_HEIGHT - 1}px, color-mix(in oklab, var(--border) 75%, transparent) ${SLOT_HEIGHT}px)`,
                  }}
                >
                  {times.map((time, index) => (
                    <button
                      key={time}
                      type="button"
                      disabled={off}
                      className={`absolute left-0 right-0 z-[1] border-0 bg-transparent transition-colors ${draggedAppointmentId ? "hover:bg-primary/8" : "hover:bg-muted/25"}`}
                      style={{ top: index * SLOT_HEIGHT, height: SLOT_HEIGHT }}
                      onClick={() =>
                        !draggedAppointmentId &&
                        onNewAppointment({ professionalId: professional.id, time })
                      }
                      onDragOver={(event) => {
                        if (!off) event.preventDefault();
                      }}
                      onDrop={(event) => {
                        event.preventDefault();
                        if (!off) onDrop(professional.id, time);
                      }}
                      aria-label={`Criar agendamento com ${professional.full_name} às ${time}`}
                    />
                  ))}

                  {off && (
                    <div className="pointer-events-none absolute inset-0 z-[2] flex items-start justify-center pt-8">
                      <span className="rounded-full border bg-background/85 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                        Folga / bloqueado
                      </span>
                    </div>
                  )}

                  {professionalAppointments.map((appointment) => {
                    const start = new Date(appointment.start_at);
                    const end = new Date(appointment.end_at);
                    const activeNow = isToday(date) && now >= start && now < end;
                    const startMinutes = start.getHours() * 60 + start.getMinutes() - timelineOpenMinutes;
                    const duration = Math.max(slotMinutes, differenceInMinutes(end, start));
                    const top = Math.max(0, (startMinutes / slotMinutes) * SLOT_HEIGHT) + 4;
                    const height = Math.max(48, (duration / slotMinutes) * SLOT_HEIGHT - 8);
                    return (
                      <AppointmentCard
                        key={appointment.id}
                        appointment={appointment}
                        services={services}
                        comanda={commandasByAppointment.get(appointment.id)}
                        history={clientHistory}
                        top={top}
                        height={height}
                        dragging={draggedAppointmentId === appointment.id}
                        moving={movingAppointmentId === appointment.id}
                        activeNow={activeNow}
                        onDragStart={() => onDragStart(appointment.id)}
                        onDragEnd={() => onDragStart(null)}
                        onEdit={() => onEditAppointment(appointment)}
                        onStatusChange={(status) => onStatusChange(appointment, status)}
                      />
                    );
                  })}
                </div>
              );
            })}

            {showNowLine && (
              <div
                className="pointer-events-none absolute left-[58px] right-0 z-20 flex items-center"
                style={{ top: nowTop }}
              >
                <div className="h-2.5 w-2.5 rounded-full bg-rose-500 shadow-[0_0_0_3px_rgba(244,63,94,0.12)]" />
                <div className="h-px flex-1 bg-rose-500" />
                <span className="absolute left-3 -translate-y-4 rounded-full bg-rose-500 px-2 py-0.5 text-[9px] font-semibold text-white shadow-sm">
                  Agora • {format(now, "HH:mm")}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ProfessionalHeader({
  professional,
  date,
  now,
  appointments,
  services,
  commandasByAppointment,
}: {
  professional: AgendaProfessional;
  date: Date;
  now: Date;
  appointments: AgendaAppointment[];
  services: AgendaService[];
  commandasByAppointment: Map<string, AgendaComanda>;
}) {
  const off = isProfessionalOff(professional, date);
  const operationalAppointments = appointments.filter(
    (appointment) => appointment.status !== "cancelled" && appointment.status !== "no_show",
  );
  const active = operationalAppointments.find((appointment) => {
    const start = new Date(appointment.start_at);
    const end = new Date(appointment.end_at);
    return ACTIVE_STATUSES.has(appointment.status ?? "pending") && now >= start && now < end;
  });
  const next = operationalAppointments.find(
    (appointment) =>
      new Date(appointment.start_at) > now && ACTIVE_STATUSES.has(appointment.status ?? "pending"),
  );
  const revenue = operationalAppointments.reduce(
    (total, appointment) =>
      total + getAppointmentValue(appointment, commandasByAppointment, services),
    0,
  );
  const initials = getInitials(professional.full_name);

  return (
    <div className="border-l p-3.5">
      <div className="flex items-start gap-3">
        <div className="relative shrink-0">
          <Avatar className="h-10 w-10 border border-border/70 shadow-sm">
            <AvatarImage src={professional.photo_url ?? undefined} />
            <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">
              {initials}
            </AvatarFallback>
          </Avatar>
          <span
            className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-card ${off ? "bg-slate-400" : active ? "bg-violet-500" : "bg-emerald-500"}`}
          />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold">{professional.full_name}</div>
          <div className="truncate text-[10px] text-muted-foreground">
            {professional.specialty || professional.role_label || "Profissional"}
          </div>
          <div className="mt-2 flex items-center gap-1.5 text-[10px] font-medium">
            <span
              className={`h-1.5 w-1.5 rounded-full ${off ? "bg-slate-400" : active ? "bg-violet-500" : "bg-emerald-500"}`}
            />
            <span
              className={
                off
                  ? "text-slate-500"
                  : active
                    ? "text-violet-600 dark:text-violet-300"
                    : "text-emerald-600 dark:text-emerald-300"
              }
            >
              {off
                ? "Indisponível"
                : active
                  ? `Ocupado até ${format(new Date(active.end_at), "HH:mm")}`
                  : next
                    ? `Livre • próximo ${format(new Date(next.start_at), "HH:mm")}`
                    : "Livre hoje"}
            </span>
          </div>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between border-t pt-2 text-[10px] text-muted-foreground">
        <span>
          {operationalAppointments.length}{" "}
          {operationalAppointments.length === 1 ? "cliente" : "clientes"}
        </span>
        <span className="font-semibold text-foreground">{brl(revenue)}</span>
      </div>
    </div>
  );
}

function AppointmentCard({
  appointment,
  services,
  comanda,
  history,
  top,
  height,
  dragging,
  moving,
  activeNow,
  onDragStart,
  onDragEnd,
  onEdit,
  onStatusChange,
}: {
  appointment: AgendaAppointment;
  services: AgendaService[];
  comanda?: AgendaComanda;
  history: AgendaHistoryItem[];
  top: number;
  height: number;
  dragging: boolean;
  moving: boolean;
  activeNow: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onEdit: () => void;
  onStatusChange: (status: string) => Promise<void>;
}) {
  const status = STATUS_META[appointment.status ?? "pending"] ?? STATUS_META.pending;
  const isCancelled = appointment.status === "cancelled";
  const clientName = getClientName(appointment);
  const serviceName = getServiceName(appointment);
  const value = Number(
    comanda?.total ??
      services.find((service) => service.id === appointment.service_id)?.price ??
      appointment.services?.price ??
      0,
  );
  const paid =
    comanda?.status === "closed" || Boolean(getNoteSection(appointment.notes, "Pagamento"));
  const products = getNoteSection(appointment.notes, "Produtos");
  const observations = getVisibleNotes(appointment.notes);
  const clientVisits = history.filter((item) =>
    appointment.client_id
      ? item.client_id === appointment.client_id
      : item.client_name === appointment.client_name,
  );
  const lastVisit = clientVisits.find(
    (item) => new Date(item.start_at) < startOfDay(new Date(appointment.start_at)),
  );
  const averageTime = clientVisits.length
    ? Math.round(
        clientVisits.reduce(
          (total, item) =>
            total +
            Math.max(0, differenceInMinutes(new Date(item.end_at), new Date(item.start_at))),
          0,
        ) / clientVisits.length,
      )
    : differenceInMinutes(new Date(appointment.end_at), new Date(appointment.start_at));

  return (
    <HoverCard openDelay={180} closeDelay={120}>
      <HoverCardTrigger asChild>
        <motion.button
          layout
          type="button"
          draggable={!isCancelled}
          onDragStartCapture={(event) => {
            const transfer = (event.nativeEvent as DragEvent).dataTransfer;
            if (transfer) {
              transfer.effectAllowed = "move";
              transfer.setData("text/plain", appointment.id);
            }
            onDragStart();
          }}
          onDragEnd={onDragEnd}
          onClick={onEdit}
          initial={{ opacity: 0, scale: 0.985 }}
          animate={{ opacity: moving ? 0.55 : dragging ? 0.5 : 1, scale: dragging ? 0.98 : 1 }}
          exit={{ opacity: 0, scale: 0.98 }}
          whileHover={{ y: -1 }}
          className={`group absolute left-1.5 right-1.5 z-10 overflow-hidden rounded-xl border border-l-[3px] ${status.border} ${isCancelled ? "border-rose-200 bg-rose-50/90 dark:border-rose-500/30 dark:bg-rose-500/10" : "border-border/75 bg-card"} ${activeNow ? "ring-2 ring-primary/55 shadow-[0_18px_40px_-18px_rgba(245,158,11,0.55)]" : "shadow-[0_10px_26px_-20px_rgba(15,23,42,0.55)]"} p-2.5 text-left transition-shadow hover:z-20 hover:shadow-[0_16px_34px_-18px_rgba(15,23,42,0.45)]`}
          style={{ top, height }}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className={`truncate text-xs font-semibold ${isCancelled ? "text-rose-700 line-through dark:text-rose-300" : "text-foreground"}`}>{clientName}</div>
              <div className="mt-0.5 flex items-center gap-1 truncate text-[10px] text-muted-foreground">
                <Scissors className="h-2.5 w-2.5 shrink-0" /> {serviceName}
              </div>
            </div>
            <span className={`shrink-0 text-[10px] font-semibold ${isCancelled ? "text-rose-600 line-through dark:text-rose-300" : ""}`}>{brl(value)}</span>
          </div>
          {height >= 68 && (
            <div className="mt-1.5 flex items-center justify-between gap-2">
              <span className="text-[9px] font-medium text-muted-foreground">
                {format(new Date(appointment.start_at), "HH:mm")} —{" "}
                {format(new Date(appointment.end_at), "HH:mm")}
              </span>
              <div className="flex items-center gap-1">
                {isCancelled && (
                  <span className="rounded-full bg-rose-100 px-1.5 py-0.5 text-[8px] font-bold uppercase text-rose-700 dark:bg-rose-500/15 dark:text-rose-300">
                    Cancelado
                  </span>
                )}
                {appointment.is_vip && (
                  <Crown className="h-3 w-3 fill-amber-400/25 text-amber-500" />
                )}
                {paid && <CircleDollarSign className="h-3 w-3 text-emerald-500" />}
                <span className={`h-1.5 w-1.5 rounded-full ${status.dot}`} />
              </div>
            </div>
          )}
          {height >= 105 && (
            <div className="mt-2 flex items-center gap-1.5 border-t pt-1.5 text-[9px]">
              <span className={`rounded-full px-1.5 py-0.5 font-semibold ${status.soft}`}>
                {status.label}
              </span>
              {appointment.is_vip && (
                <span className="rounded-full bg-amber-50 px-1.5 py-0.5 font-semibold text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
                  VIP
                </span>
              )}
            </div>
          )}
        </motion.button>
      </HoverCardTrigger>
      <HoverCardContent
        side="right"
        align="start"
        sideOffset={10}
        className="w-[340px] rounded-2xl border-border/70 p-0 shadow-2xl"
      >
        <div className="border-b p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-sm font-semibold">{clientName}</div>
              <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                <Clock3 className="h-3.5 w-3.5" /> {format(new Date(appointment.start_at), "HH:mm")}{" "}
                — {format(new Date(appointment.end_at), "HH:mm")}
              </div>
            </div>
            <span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${status.soft}`}>
              {status.label}
            </span>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 p-4 text-xs">
          <DetailItem
            icon={Phone}
            label="Telefone"
            value={appointment.client_whatsapp || appointment.clients?.whatsapp || "Não informado"}
          />
          <DetailItem
            icon={History}
            label="Última visita"
            value={
              lastVisit ? format(new Date(lastVisit.start_at), "dd/MM/yyyy") : "Primeira visita"
            }
          />
          <DetailItem icon={Timer} label="Tempo médio" value={`${averageTime} min`} />
          <DetailItem
            icon={ListChecks}
            label="Histórico"
            value={`${clientVisits.length} atendimento${clientVisits.length === 1 ? "" : "s"}`}
          />
          <DetailItem
            icon={StickyNote}
            label="Observações"
            value={observations || "Sem observações"}
            full
          />
          <DetailItem
            icon={ShoppingBag}
            label="Produtos"
            value={products || "Nenhum produto"}
            full
          />
        </div>
        <div className="grid grid-cols-3 gap-2 border-t bg-muted/20 p-3">
          <Button variant="outline" size="sm" className="rounded-lg text-[10px]" onClick={onEdit}>
            <Pencil className="mr-1 h-3 w-3" /> Editar
          </Button>
          <Button variant="outline" size="sm" className="rounded-lg text-[10px]" onClick={onEdit}>
            <CalendarClock className="mr-1 h-3 w-3" /> Reagendar
          </Button>
          {appointment.status === "pending" ? (
            <Button
              size="sm"
              className="rounded-lg text-[10px]"
              onClick={() => onStatusChange("confirmed")}
            >
              <Check className="mr-1 h-3 w-3" /> Confirmar
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              className="rounded-lg text-[10px] text-rose-600 hover:text-rose-700"
              onClick={() => onStatusChange("cancelled")}
            >
              <X className="mr-1 h-3 w-3" /> Cancelar
            </Button>
          )}
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}

function RangeAgenda({
  date,
  mode,
  professionals,
  appointments,
  services,
  commandasByAppointment,
  onEditAppointment,
}: {
  date: Date;
  mode: AgendaViewMode;
  professionals: AgendaProfessional[];
  appointments: AgendaAppointment[];
  services: AgendaService[];
  commandasByAppointment: Map<string, AgendaComanda>;
  onEditAppointment: (appointment: AgendaAppointment) => void;
}) {
  const days = mode === "week" ? 7 : mode === "threeDays" ? 3 : 14;
  const dates = Array.from({ length: days }, (_, index) => addDays(date, index));

  if (mode === "agenda") {
    const sorted = [...appointments].sort(
      (a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime(),
    );
    return (
      <div className="rounded-2xl border bg-card p-4">
        <div className="mb-4 flex items-center gap-2">
          <ListChecks className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold">Próximos agendamentos</h2>
        </div>
        <div className="space-y-2">
          {sorted.map((appointment) => {
            const professional = professionals.find(
              (item) => item.id === appointment.professional_id,
            );
            const meta = STATUS_META[appointment.status ?? "pending"] ?? STATUS_META.pending;
            return (
              <button
                key={appointment.id}
                type="button"
                onClick={() => onEditAppointment(appointment)}
                className="flex w-full items-center gap-3 rounded-xl border border-border/60 p-3 text-left transition-colors hover:bg-muted/30"
              >
                <div className="w-14 shrink-0 text-center">
                  <div className="text-sm font-semibold">
                    {format(new Date(appointment.start_at), "dd")}
                  </div>
                  <div className="text-[9px] uppercase text-muted-foreground">
                    {format(new Date(appointment.start_at), "MMM", { locale: ptBR })}
                  </div>
                </div>
                <div className={`h-9 w-1 rounded-full ${meta.dot}`} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold">{getClientName(appointment)}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {format(new Date(appointment.start_at), "HH:mm")} •{" "}
                    {getServiceName(appointment)} • {professional?.full_name || "Profissional"}
                  </div>
                </div>
                <div className="text-xs font-semibold">
                  {brl(getAppointmentValue(appointment, commandasByAppointment, services))}
                </div>
              </button>
            );
          })}
          {!sorted.length && (
            <EmptyState
              icon={CalendarRange}
              title="Agenda livre"
              description="Não há agendamentos neste período."
              compact
            />
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-2xl border bg-card p-3">
      <div
        className="grid gap-3"
        style={{ minWidth: days * 230, gridTemplateColumns: `repeat(${days}, minmax(220px, 1fr))` }}
      >
        {dates.map((currentDate) => {
          const items = appointments
            .filter((appointment) => isSameDay(new Date(appointment.start_at), currentDate))
            .sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime());
          return (
            <div
              key={currentDate.toISOString()}
              className={`min-h-[440px] rounded-xl border p-2.5 ${isToday(currentDate) ? "border-primary/40 bg-primary/[0.025]" : "bg-muted/[0.12]"}`}
            >
              <div className="mb-3 flex items-center justify-between border-b pb-2">
                <div>
                  <div className="text-[10px] font-semibold uppercase text-muted-foreground">
                    {format(currentDate, "EEE", { locale: ptBR })}
                  </div>
                  <div className="text-lg font-semibold">{format(currentDate, "dd")}</div>
                </div>
                <span className="rounded-full bg-background px-2 py-1 text-[9px] font-medium text-muted-foreground">
                  {items.length} agend.
                </span>
              </div>
              <div className="space-y-2">
                {items.map((appointment) => {
                  const meta = STATUS_META[appointment.status ?? "pending"] ?? STATUS_META.pending;
                  return (
                    <button
                      key={appointment.id}
                      type="button"
                      onClick={() => onEditAppointment(appointment)}
                      className={`w-full rounded-xl border border-l-[3px] ${meta.border} bg-card p-2.5 text-left shadow-sm transition-transform hover:-translate-y-0.5`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-xs font-semibold">
                          {getClientName(appointment)}
                        </span>
                        <span className="text-[10px] font-semibold">
                          {format(new Date(appointment.start_at), "HH:mm")}
                        </span>
                      </div>
                      <div className="mt-1 truncate text-[10px] text-muted-foreground">
                        {getServiceName(appointment)}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function OperationsSidebar({
  date,
  now,
  appointments,
  professionals,
  metrics,
  commandasByAppointment,
  services,
  onEditAppointment,
}: {
  date: Date;
  now: Date;
  appointments: AgendaAppointment[];
  professionals: AgendaProfessional[];
  metrics: {
    appointments: number;
    workingProfessionals: number;
    freeSlots: number;
    occupancy: number;
    expectedRevenue: number;
    realizedRevenue: number;
    averageDuration: number;
  };
  commandasByAppointment: Map<string, AgendaComanda>;
  services: AgendaService[];
  onEditAppointment: (appointment: AgendaAppointment) => void;
}) {
  const upcoming = appointments
    .filter(
      (appointment) =>
        new Date(appointment.start_at) >= now &&
        ACTIVE_STATUSES.has(appointment.status ?? "pending"),
    )
    .sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime())
    .slice(0, 4);
  const late = isToday(date)
    ? appointments.filter(
        (appointment) =>
          new Date(appointment.start_at) < now &&
          ["pending", "confirmed"].includes(appointment.status ?? "pending"),
      )
    : [];
  const pending = appointments.filter((appointment) => appointment.status === "pending");
  const goalProgress = metrics.expectedRevenue
    ? Math.min(100, Math.round((metrics.realizedRevenue / metrics.expectedRevenue) * 100))
    : 0;

  return (
    <aside className="space-y-3 2xl:sticky 2xl:top-4">
      <div className="rounded-2xl border bg-card p-4 shadow-[0_14px_40px_-36px_rgba(15,23,42,0.45)]">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <div className="text-xs font-semibold">Hoje</div>
            <div className="text-[10px] capitalize text-muted-foreground">
              {format(date, "EEEE, dd MMM", { locale: ptBR })}
            </div>
          </div>
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Gauge className="h-4 w-4" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <MiniMetric label="Atendimentos" value={String(metrics.appointments)} />
          <MiniMetric label="Profissionais" value={String(metrics.workingProfessionals)} />
          <MiniMetric label="Ocupação" value={`${metrics.occupancy}%`} />
          <MiniMetric
            label="Atrasados"
            value={String(late.length)}
            tone={late.length ? "danger" : undefined}
          />
          <MiniMetric label="Previsto" value={brl(metrics.expectedRevenue)} wide />
          <MiniMetric label="Realizado" value={brl(metrics.realizedRevenue)} wide />
        </div>
      </div>

      <div className="rounded-2xl border bg-card p-4">
        <div className="mb-3 flex items-center gap-2">
          <CalendarClock className="h-4 w-4 text-primary" />
          <h3 className="text-xs font-semibold">Próximos clientes</h3>
          <span className="ml-auto text-[10px] text-muted-foreground">{upcoming.length}</span>
        </div>
        <div className="space-y-1.5">
          {upcoming.map((appointment) => {
            const professional = professionals.find(
              (item) => item.id === appointment.professional_id,
            );
            return (
              <button
                key={appointment.id}
                type="button"
                onClick={() => onEditAppointment(appointment)}
                className="flex w-full items-center gap-2 rounded-xl p-2 text-left hover:bg-muted/40"
              >
                <div className="w-10 shrink-0 rounded-lg bg-muted/60 py-1.5 text-center text-[10px] font-semibold">
                  {format(new Date(appointment.start_at), "HH:mm")}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[11px] font-semibold">
                    {getClientName(appointment)}
                  </div>
                  <div className="truncate text-[9px] text-muted-foreground">
                    {professional?.full_name || "Profissional"}
                  </div>
                </div>
                <span className="text-[9px] font-semibold">
                  {brl(getAppointmentValue(appointment, commandasByAppointment, services))}
                </span>
              </button>
            );
          })}
          {!upcoming.length && (
            <p className="rounded-xl bg-muted/25 p-3 text-center text-[10px] text-muted-foreground">
              Nenhum próximo atendimento.
            </p>
          )}
        </div>
      </div>

      <div className="rounded-2xl border bg-card p-4">
        <div className="mb-3 flex items-center gap-2">
          <Target className="h-4 w-4 text-primary" />
          <h3 className="text-xs font-semibold">Meta do dia</h3>
          <span className="ml-auto text-xs font-semibold">{goalProgress}%</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-muted">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${goalProgress}%` }}
            className="h-full rounded-full bg-primary"
          />
        </div>
        <div className="mt-2 flex justify-between text-[9px] text-muted-foreground">
          <span>{brl(metrics.realizedRevenue)} realizados</span>
          <span>{brl(metrics.expectedRevenue)} previstos</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <SidebarShortcut icon={ListChecks} label="Lista de espera" value={pending.length} />
        <SidebarShortcut
          icon={UserCheck}
          label="Encaixes"
          value={appointments.filter((item) => item.source === "manual").length}
        />
        <SidebarShortcut icon={Cake} label="Aniversariantes" value={0} />
        <SidebarShortcut icon={Bell} label="Notificações" value={late.length} />
      </div>
    </aside>
  );
}

function FilterInput({
  icon: Icon,
  value,
  onChange,
  placeholder,
  suggestions,
  resultLabel,
}: {
  icon: typeof Search;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  suggestions: Array<{ value: string; label: string; description?: string }>;
  resultLabel: string;
}) {
  const [focused, setFocused] = useState(false);
  const showSuggestions = focused && Boolean(value.trim());

  return (
    <div className="relative">
      <Icon className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder={placeholder}
        autoComplete="off"
        className="h-9 rounded-xl bg-background pl-9 pr-9 text-xs"
      />
      {value && (
        <button
          type="button"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => onChange("")}
          className="absolute right-2.5 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label={`Limpar ${placeholder.toLocaleLowerCase("pt-BR")}`}
        >
          <X className="h-3 w-3" />
        </button>
      )}

      {showSuggestions && (
        <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-50 overflow-hidden rounded-xl border bg-popover shadow-xl">
          <div className="flex items-center justify-between border-b px-3 py-2 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
            <span>Resultados enquanto você digita</span>
            <span>{resultLabel}</span>
          </div>
          {suggestions.length ? (
            <div className="p-1">
              {suggestions.map((suggestion) => (
                <button
                  key={`${placeholder}-${suggestion.value}`}
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    onChange(suggestion.value);
                    setFocused(false);
                  }}
                  className="flex w-full items-center justify-between gap-3 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-muted/60"
                >
                  <span className="truncate text-xs font-medium">{suggestion.label}</span>
                  {suggestion.description && (
                    <span className="max-w-[45%] truncate text-[9px] text-muted-foreground">
                      {suggestion.description}
                    </span>
                  )}
                </button>
              ))}
            </div>
          ) : (
            <div className="px-3 py-4 text-center text-xs text-muted-foreground">
              Nenhum resultado encontrado para “{value}”.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function DetailItem({
  icon: Icon,
  label,
  value,
  full,
}: {
  icon: typeof Phone;
  label: string;
  value: string;
  full?: boolean;
}) {
  return (
    <div className={`rounded-xl bg-muted/35 p-2.5 ${full ? "col-span-2" : ""}`}>
      <div className="mb-1 flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
        <Icon className="h-3 w-3" />
        {label}
      </div>
      <div className="line-clamp-2 text-[11px] font-medium">{value}</div>
    </div>
  );
}

function MiniMetric({
  label,
  value,
  wide,
  tone,
}: {
  label: string;
  value: string;
  wide?: boolean;
  tone?: "danger";
}) {
  return (
    <div
      className={`rounded-xl bg-muted/30 p-2.5 ${wide ? "col-span-2 flex items-center justify-between" : ""}`}
    >
      <div className="text-[9px] text-muted-foreground">{label}</div>
      <div className={`mt-0.5 text-sm font-semibold ${tone === "danger" ? "text-rose-600" : ""}`}>
        {value}
      </div>
    </div>
  );
}

function SidebarShortcut({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof ListChecks;
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-2xl border bg-card p-3">
      <div className="mb-2 flex items-center justify-between">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-sm font-semibold">{value}</span>
      </div>
      <div className="text-[9px] font-medium text-muted-foreground">{label}</div>
    </div>
  );
}

function EmptyState({
  icon: Icon,
  title,
  description,
  compact,
}: {
  icon: typeof UsersRound;
  title: string;
  description: string;
  compact?: boolean;
}) {
  return (
    <div
      className={`flex flex-col items-center justify-center rounded-2xl border border-dashed bg-card text-center ${compact ? "py-12" : "min-h-[520px]"}`}
    >
      <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
        <Icon className="h-5 w-5" />
      </div>
      <div className="text-sm font-semibold">{title}</div>
      <p className="mt-1 max-w-xs text-xs text-muted-foreground">{description}</p>
    </div>
  );
}

function buildTimes(openHour: number, closeHour: number, slotMinutes: number) {
  const result: string[] = [];
  for (let minutes = openHour * 60; minutes <= closeHour * 60; minutes += slotMinutes) {
    result.push(
      `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`,
    );
  }
  return result;
}

function isProfessionalOff(professional: AgendaProfessional, date: Date) {
  const dateString = format(date, "yyyy-MM-dd");
  const normalizedDay = bookingWeekdayFromDate(date);
  return (
    Boolean(professional.blocked_dates?.includes(dateString)) ||
    !includesBookingWeekday(professional.work_days, normalizedDay, DEFAULT_BOOKING_WORK_DAYS)
  );
}

function getAppointmentValue(
  appointment: AgendaAppointment,
  commandasByAppointment: Map<string, AgendaComanda>,
  services: AgendaService[],
) {
  return Number(
    commandasByAppointment.get(appointment.id)?.total ??
      services.find((service) => service.id === appointment.service_id)?.price ??
      appointment.services?.price ??
      0,
  );
}

function getClientName(appointment: AgendaAppointment) {
  return appointment.client_name || appointment.clients?.full_name || "Cliente sem nome";
}

function getServiceName(appointment: AgendaAppointment) {
  const additional = getNoteSection(appointment.notes, "Serviços");
  return [appointment.services?.name || "Serviço", additional].filter(Boolean).join(" + ");
}

function getNoteSection(notes: string | null | undefined, label: string) {
  if (!notes) return "";
  const part = notes.split(" | ").find((item) => item.trim().startsWith(`${label}:`));
  return part?.slice(part.indexOf(":") + 1).trim() ?? "";
}

function getVisibleNotes(notes: string | null | undefined) {
  if (!notes) return "";
  return notes
    .split(" | ")
    .filter(
      (item) =>
        !["Serviços:", "Produtos:", "Pagamento:", "Comanda ID:"].some((prefix) =>
          item.trim().startsWith(prefix),
        ),
    )
    .join(" • ")
    .trim();
}

function getInitials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function normalizeSearch(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/\s+/g, " ")
    .trim();
}

function matchesSearch(query: string, values: Array<string | null | undefined>) {
  const normalizedQuery = normalizeSearch(query);
  if (!normalizedQuery) return true;
  const searchableText = normalizeSearch(values.filter(Boolean).join(" "));
  const queryTokens = normalizedQuery.split(" ").filter(Boolean);
  const digits = normalizedQuery.replace(/\D/g, "");
  const searchableDigits = searchableText.replace(/\D/g, "");
  return (
    queryTokens.every((token) => searchableText.includes(token)) ||
    (digits.length >= 3 && searchableDigits.includes(digits))
  );
}

function getDateLabel(date: Date, mode: AgendaViewMode) {
  if (mode === "day") return format(date, "EEEE, dd 'de' MMMM 'de' yyyy", { locale: ptBR });
  const days = mode === "week" ? 6 : mode === "threeDays" ? 2 : 13;
  return `${format(date, "dd MMM", { locale: ptBR })} — ${format(addDays(date, days), "dd MMM yyyy", { locale: ptBR })}`;
}

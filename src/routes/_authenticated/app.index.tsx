import { createFileRoute, Navigate, redirect } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  addDays,
  differenceInCalendarDays,
  endOfDay,
  endOfMonth,
  format,
  isSameDay,
  startOfDay,
  startOfMonth,
  subDays,
  subMonths,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Award,
  Banknote,
  BarChart3,
  Calendar,
  CheckCircle2,
  Clock,
  Copy,
  CreditCard,
  DollarSign,
  ExternalLink,
  Filter,
  LineChart as LineChartIcon,
  Link2,
  PieChart as PieChartIcon,
  QrCodeIcon,
  RefreshCw,
  Scissors,
  Share2,
  Sparkles,
  Target,
  TimerReset,
  TrendingDown,
  TrendingUp,
  UserPlus,
  Users,
  Wallet,
  XCircle,
} from "lucide-react";
import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { QrCode } from "@/lib/qr";
import { brl } from "@/lib/format";
import { getPublicBookingUrl } from "@/lib/public-booking-url";
import { useCurrentTenant, useUserRole } from "@/hooks/use-tenant";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/app/")({
  beforeLoad: async () => {
    const { data: userRes } = await supabase.auth.getUser();
    const uid = userRes.user?.id;
    if (!uid) throw redirect({ to: "/auth", search: { redirect: "/app" } });

    const { data: profile } = await supabase
      .from("profiles")
      .select("active_tenant_id")
      .eq("id", uid)
      .maybeSingle();
    const { data: roles } = await supabase.from("user_roles").select("tenant_id, role").eq("user_id", uid);
    const tenantId = profile?.active_tenant_id ?? roles?.find((role) => role.tenant_id)?.tenant_id;
    if (!tenantId) return;

    const { data: userRole } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", uid)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (userRole?.role === "barber") {
      throw redirect({ to: "/app/agenda" });
    }
  },
  component: PainelGeral,
});

type PeriodPreset =
  | "today"
  | "yesterday"
  | "last7"
  | "last30"
  | "thisMonth"
  | "lastMonth"
  | "custom";

type DashboardFilters = {
  period: PeriodPreset;
  customStart: string;
  customEnd: string;
  professionalId: string;
  serviceId: string;
  paymentMethod: string;
  status: string;
  client: string;
  source: string;
};

type RangeInfo = {
  start: Date;
  end: Date;
  previousStart: Date;
  previousEnd: Date;
  label: string;
};

type ChartSeriesKey =
  | "revenue"
  | "appointments"
  | "cancellations"
  | "profit"
  | "ticket"
  | "newClients"
  | "commissions";

const periodOptions: Array<{ value: PeriodPreset; label: string }> = [
  { value: "today", label: "Hoje" },
  { value: "yesterday", label: "Ontem" },
  { value: "last7", label: "Últimos 7 dias" },
  { value: "last30", label: "Últimos 30 dias" },
  { value: "thisMonth", label: "Este mês" },
  { value: "lastMonth", label: "Mês passado" },
  { value: "custom", label: "Personalizado" },
];

const statusOptions = [
  { value: "all", label: "Todos os status" },
  { value: "pending", label: "Agendado" },
  { value: "confirmed", label: "Confirmado" },
  { value: "in_progress", label: "Em atendimento" },
  { value: "completed", label: "Finalizado" },
  { value: "cancelled", label: "Cancelado" },
  { value: "no_show", label: "Faltou" },
];

const paymentOptions = [
  { value: "all", label: "Todas as formas" },
  { value: "pix", label: "PIX" },
  { value: "cash", label: "Dinheiro" },
  { value: "debit", label: "Cartão débito" },
  { value: "credit", label: "Cartão crédito" },
  { value: "vip", label: "Assinatura VIP" },
];

const sourceOptions = [
  { value: "all", label: "Todas as origens" },
  { value: "manual", label: "Agenda interna" },
  { value: "online", label: "Link público" },
];

const chartSeries: Array<{ key: ChartSeriesKey; label: string; color: string }> = [
  { key: "revenue", label: "Receita", color: "var(--primary)" },
  { key: "appointments", label: "Atendimentos", color: "#2563eb" },
  { key: "cancellations", label: "Cancelamentos", color: "#ef4444" },
  { key: "profit", label: "Lucro", color: "#059669" },
  { key: "ticket", label: "Ticket médio", color: "#7c3aed" },
  { key: "newClients", label: "Novos clientes", color: "#f59e0b" },
  { key: "commissions", label: "Comissões", color: "#db2777" },
];

const paymentLabels: Record<string, string> = {
  pix: "PIX",
  cash: "Dinheiro",
  debit: "Cartão débito",
  credit: "Cartão crédito",
  vip: "Assinatura VIP",
};

const statusLabels: Record<string, string> = {
  pending: "Agendado",
  confirmed: "Confirmado",
  arrived: "Chegou",
  in_progress: "Em atendimento",
  completed: "Finalizado",
  cancelled: "Cancelado",
  canceled: "Cancelado",
  no_show: "Faltou",
  noshow: "Faltou",
};

const pieColors = ["var(--primary)", "#2563eb", "#10b981", "#f97316", "#8b5cf6", "#ef4444", "#14b8a6"];

const defaultFilters: DashboardFilters = {
  period: "today",
  customStart: format(new Date(), "yyyy-MM-dd"),
  customEnd: format(new Date(), "yyyy-MM-dd"),
  professionalId: "all",
  serviceId: "all",
  paymentMethod: "all",
  status: "all",
  client: "",
  source: "all",
};

function PainelGeral() {
  const { data: tenant } = useCurrentTenant();
  const tenantId = tenant?.id;
  const { data: role, isLoading: roleLoading } = useUserRole(tenantId);
  const [filters, setFilters] = useState<DashboardFilters>(defaultFilters);
  const [visibleSeries, setVisibleSeries] = useState<Record<ChartSeriesKey, boolean>>({
    revenue: true,
    appointments: true,
    cancellations: false,
    profit: true,
    ticket: false,
    newClients: false,
    commissions: false,
  });

  if (!roleLoading && role === "barber") {
    return <Navigate to="/app/agenda" replace />;
  }

  const range = useMemo(
    () => getRange(filters.period, filters.customStart, filters.customEnd),
    [filters.period, filters.customStart, filters.customEnd],
  );

  const bookingSlug = tenant?.slug || "linkup-studio";
  const bookingLink = getPublicBookingUrl(bookingSlug);

  const { data: userProfile } = useQuery({
    queryKey: ["dashboard-user-profile"],
    queryFn: async () => {
      const { data: userRes } = await supabase.auth.getUser();
      const uid = userRes.user?.id;
      if (!uid) return { name: "Gestor" };
      const { data } = await supabase.from("profiles").select("full_name").eq("id", uid).maybeSingle();
      const fallback = userRes.user?.email?.split("@")[0] || "Gestor";
      return { name: data?.full_name || fallback };
    },
  });

  const { data: options, isLoading: loadingOptions } = useQuery({
    queryKey: ["dashboard-options", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const [professionals, services, settings] = await Promise.all([
        supabase
          .from("professionals")
          .select("id,full_name,photo_url,role_label,commission_pct,active,whatsapp")
          .eq("tenant_id", tenantId!)
          .order("full_name"),
        supabase
          .from("services")
          .select("id,name,price,duration_min,active")
          .eq("tenant_id", tenantId!)
          .order("name"),
        supabase
          .from("tenant_settings")
          .select("open_hour,close_hour,work_days")
          .eq("tenant_id", tenantId!)
          .maybeSingle(),
      ]);
      return {
        professionals: professionals.data ?? [],
        services: services.data ?? [],
        settings: settings.data ?? null,
      };
    },
  });

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["dashboard-command-center", tenantId, filters, range.start.toISOString(), range.end.toISOString()],
    enabled: !!tenantId,
    queryFn: async () => loadDashboardData(tenantId!, filters, range, options, tenant),
  });

  const greeting = getGreeting(userProfile?.name);
  const monthlyTarget = null;
  const monthlyProgress = monthlyTarget ? Math.min(100, (data?.monthRevenue ?? 0) / monthlyTarget * 100) : 0;

  return (
    <div className="mx-auto max-w-[1600px] space-y-6 pb-10">
      <header className="overflow-hidden rounded-[2rem] border bg-gradient-to-br from-background via-background to-primary/10 p-6 shadow-sm md:p-8">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.28em] text-primary">
              <Sparkles className="h-4 w-4" />
              Central de comando
            </div>
            <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">Painel Geral</h1>
            <div>
              <p className="text-lg font-medium text-foreground">{greeting}</p>
              <p className="text-sm text-muted-foreground">Aqui está o resumo da sua operação em poucos segundos.</p>
            </div>
            <p className="text-xs text-muted-foreground">
              Última atualização: {data?.updatedAt ? format(data.updatedAt, "'Hoje às' HH:mm", { locale: ptBR }) : "carregando..."}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Badge variant="outline" className="rounded-full px-4 py-2">
              {range.label}
            </Badge>
            <Button
              onClick={() => refetch()}
              disabled={isFetching}
              className="rounded-full"
            >
              <RefreshCw className={`mr-2 h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
              Atualizar dados
            </Button>
          </div>
        </div>
      </header>

      <DashboardFiltersBar
        filters={filters}
        onChange={setFilters}
        professionals={options?.professionals ?? []}
        services={options?.services ?? []}
        loading={loadingOptions}
      />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          title={filters.period === "today" ? "Faturamento hoje" : "Faturamento no período"}
          value={brl(data?.periodRevenue)}
          icon={TrendingUp}
          trend={data?.revenueTrend}
          helper="Comparado ao período anterior"
          loading={isLoading}
          tone="primary"
        />
        <KpiCard
          title="Faturamento do mês"
          value={brl(data?.monthRevenue)}
          icon={DollarSign}
          helper={monthlyTarget ? `${Math.round(monthlyProgress)}% da meta` : "Meta mensal não configurada"}
          loading={isLoading}
          tone="success"
        />
        <KpiCard
          title="Lucro estimado"
          value={brl(data?.estimatedProfit)}
          icon={Wallet}
          trend={data?.profitTrend}
          helper={`${brl(data?.periodRevenue)} receita · ${brl((data?.periodExpenses ?? 0) + (data?.periodCommissions ?? 0))} custos/comissões`}
          loading={isLoading}
          tone="accent"
        />
        <KpiCard
          title="Ticket médio"
          value={brl(data?.averageTicket)}
          icon={CreditCard}
          trend={data?.ticketTrend}
          helper="Valor médio por atendimento fechado"
          loading={isLoading}
          tone="purple"
        />
        <KpiCard
          title={filters.period === "today" ? "Atendimentos hoje" : "Atendimentos"}
          value={String(data?.appointments.total ?? 0)}
          icon={Users}
          helper={`${data?.appointments.inProgress ?? 0} em andamento · ${data?.appointments.completed ?? 0} finalizados · ${data?.appointments.scheduled ?? 0} agendados`}
          loading={isLoading}
          tone="blue"
        />
        <KpiCard
          title="Comissões pendentes"
          value={brl(data?.pendingCommissions)}
          icon={Award}
          helper={`${data?.pendingCommissionProfessionals ?? 0} profissionais com valores em aberto`}
          loading={isLoading}
          tone="warning"
        />
        <KpiCard
          title="Novos clientes"
          value={String(data?.customers.newCustomers ?? 0)}
          icon={UserPlus}
          helper={`${data?.customers.returningCustomers ?? 0} retorno · ${data?.customers.inactiveCustomers ?? 0} inativos`}
          loading={isLoading}
          tone="success"
        />
        <OccupancyCard value={data?.occupancyRate ?? 0} loading={isLoading} />
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.4fr_0.9fr]">
        <GoalCard
          revenue={data?.monthRevenue ?? 0}
          target={monthlyTarget}
          progress={monthlyProgress}
          loading={isLoading}
        />
        <FinancialSummary data={data} loading={isLoading} />
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.45fr_0.85fr]">
        <MainChart
          data={data?.chart ?? []}
          visibleSeries={visibleSeries}
          onToggle={(key) => setVisibleSeries((current) => ({ ...current, [key]: !current[key] }))}
          loading={isLoading}
        />
        <SmartAgenda items={data?.smartAgenda ?? []} loading={isLoading} />
      </section>

      <section className="grid gap-6 xl:grid-cols-3">
        <SmartAlerts alerts={data?.alerts ?? []} loading={isLoading} />
        <RecentActivity items={data?.activities ?? []} loading={isLoading} />
        <BookingLinkCard bookingLink={bookingLink} />
      </section>

      <section className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <ProfessionalRanking professionals={data?.professionalRanking ?? []} loading={isLoading} />
        <HighlightProfessional professional={data?.highlightProfessional} loading={isLoading} />
      </section>

      <section className="grid gap-6 xl:grid-cols-3">
        <SimplePieCard
          title="Serviços mais vendidos"
          subtitle="Participação por quantidade de itens vendidos"
          icon={PieChartIcon}
          data={data?.topServices ?? []}
          loading={isLoading}
        />
        <SimplePieCard
          title="Formas de pagamento"
          subtitle="Valor recebido por método"
          icon={CreditCard}
          data={data?.paymentMethods ?? []}
          loading={isLoading}
          money
        />
        <VacantSlotsCard slots={data?.vacantSlots ?? []} loading={isLoading} />
      </section>

      <section className="grid gap-6 xl:grid-cols-3">
        <CustomerIntelligence data={data?.customers} loading={isLoading} />
        <CancellationCard data={data?.cancellations} loading={isLoading} />
        <NoShowCard data={data?.noShow} loading={isLoading} />
      </section>
    </div>
  );
}

function DashboardFiltersBar({
  filters,
  onChange,
  professionals,
  services,
  loading,
}: {
  filters: DashboardFilters;
  onChange: (filters: DashboardFilters) => void;
  professionals: any[];
  services: any[];
  loading: boolean;
}) {
  const patch = (partial: Partial<DashboardFilters>) => onChange({ ...filters, ...partial });

  return (
    <Card className="rounded-[1.5rem] border bg-card/95 shadow-sm">
      <CardContent className="space-y-4 p-4 md:p-5">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
          <Filter className="h-4 w-4 text-primary" />
          Filtros inteligentes
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {periodOptions.map((option) => (
            <Button
              key={option.value}
              type="button"
              variant={filters.period === option.value ? "default" : "outline"}
              size="sm"
              className="whitespace-nowrap rounded-full"
              onClick={() => patch({ period: option.value })}
            >
              {option.label}
            </Button>
          ))}
        </div>

        {filters.period === "custom" && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Input type="date" value={filters.customStart} onChange={(event) => patch({ customStart: event.target.value })} />
            <Input type="date" value={filters.customEnd} onChange={(event) => patch({ customEnd: event.target.value })} />
          </div>
        )}

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
          <Select value={filters.professionalId} onValueChange={(value) => patch({ professionalId: value })} disabled={loading}>
            <SelectTrigger><SelectValue placeholder="Profissional" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os profissionais</SelectItem>
              {professionals.map((professional) => (
                <SelectItem key={professional.id} value={professional.id}>{professional.full_name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={filters.serviceId} onValueChange={(value) => patch({ serviceId: value })} disabled={loading}>
            <SelectTrigger><SelectValue placeholder="Serviço" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os serviços</SelectItem>
              {services.map((service) => (
                <SelectItem key={service.id} value={service.id}>{service.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={filters.paymentMethod} onValueChange={(value) => patch({ paymentMethod: value })}>
            <SelectTrigger><SelectValue placeholder="Pagamento" /></SelectTrigger>
            <SelectContent>
              {paymentOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={filters.status} onValueChange={(value) => patch({ status: value })}>
            <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              {statusOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={filters.source} onValueChange={(value) => patch({ source: value })}>
            <SelectTrigger><SelectValue placeholder="Origem" /></SelectTrigger>
            <SelectContent>
              {sourceOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Input
            value={filters.client}
            onChange={(event) => patch({ client: event.target.value })}
            placeholder="Cliente"
          />
        </div>
      </CardContent>
    </Card>
  );
}

async function loadDashboardData(
  tenantId: string,
  filters: DashboardFilters,
  range: RangeInfo,
  options: { professionals: any[]; services: any[]; settings: any | null } | undefined,
  tenant: any,
) {
  const now = new Date();
  const todayStart = startOfDay(now);
  const todayEnd = endOfDay(now);
  const tomorrowStart = startOfDay(addDays(now, 1));
  const tomorrowEnd = endOfDay(addDays(now, 1));
  const monthStart = startOfMonth(now);
  const monthEnd = endOfMonth(now);
  const minStart = new Date(Math.min(range.previousStart.getTime(), subDays(now, 60).getTime(), monthStart.getTime()));
  const maxEnd = new Date(Math.max(range.end.getTime(), monthEnd.getTime(), tomorrowEnd.getTime()));

  const [
    appointmentsResult,
    commandasResult,
    clientsResult,
    cashResult,
    commissionEntriesResult,
    subscriptionsResult,
    paymentsResult,
  ] = await Promise.all([
    supabase
      .from("appointments")
      .select("id,client_id,professional_id,service_id,client_name,client_whatsapp,start_at,end_at,status,source,created_at,is_vip,notes,professionals(id,full_name,photo_url,role_label,commission_pct),services(id,name,price,duration_min)")
      .eq("tenant_id", tenantId)
      .gte("start_at", minStart.toISOString())
      .lte("start_at", maxEnd.toISOString())
      .order("start_at"),
    supabase
      .from("commandas")
      .select("id,number,client_id,client_name,status,subtotal,discount,addition,total,payment_method,closed_at,created_at,appointment_id")
      .eq("tenant_id", tenantId)
      .gte("created_at", minStart.toISOString())
      .lte("created_at", maxEnd.toISOString())
      .order("created_at", { ascending: false }),
    supabase
      .from("clients")
      .select("id,full_name,whatsapp,is_subscriber,created_at")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false }),
    supabase
      .from("cash_movements")
      .select("id,kind,amount,status,due_date,paid_at,movement_date,competence_date,payment_method,description,source,created_at")
      .eq("tenant_id", tenantId)
      .gte("competence_date", format(minStart, "yyyy-MM-dd"))
      .lte("competence_date", format(maxEnd, "yyyy-MM-dd"))
      .order("competence_date", { ascending: false }),
    supabase
      .from("commission_entries")
      .select("id,professional_id,commission_amount,status,due_date,competence_date,item_name,generated_at")
      .eq("tenant_id", tenantId)
      .order("due_date", { ascending: true }),
    supabase
      .from("client_subscriptions")
      .select("id,subscriber_name,status,next_due_at,price,created_at")
      .eq("tenant_id", tenantId)
      .order("next_due_at", { ascending: true }),
    supabase
      .from("commanda_payments")
      .select("id,commanda_id,method,amount,created_at")
      .eq("tenant_id", tenantId)
      .gte("created_at", minStart.toISOString())
      .lte("created_at", maxEnd.toISOString()),
  ]);

  if (appointmentsResult.error) throw appointmentsResult.error;
  if (commandasResult.error) throw commandasResult.error;
  if (clientsResult.error) throw clientsResult.error;
  if (cashResult.error) throw cashResult.error;

  const appointments = appointmentsResult.data ?? [];
  const commandas = commandasResult.data ?? [];
  const clients = clientsResult.data ?? [];
  const cashMovements = cashResult.data ?? [];
  const commissionEntries = commissionEntriesResult.data ?? [];
  const subscriptions = subscriptionsResult.data ?? [];
  const payments = paymentsResult.data ?? [];

  const commandaIds = commandas.map((item: any) => item.id);
  const { data: commandaItemsData } = commandaIds.length
    ? await supabase
        .from("commanda_items")
        .select("id,commanda_id,kind,ref_id,name,quantity,unit_price,unit_cost,professional_id,commission_value,commission_status,created_at")
        .eq("tenant_id", tenantId)
        .in("commanda_id", commandaIds)
    : { data: [] as any[] };
  const commandaItems = commandaItemsData ?? [];

  const filteredAppointments = appointments.filter((appointment: any) => matchAppointment(appointment, filters));
  const filteredCommandas = commandas.filter((commanda: any) =>
    matchClient(commanda.client_name, filters.client) &&
    matchPayment(commanda.payment_method, filters.paymentMethod) &&
    matchCommandaByItems(commanda, commandaItems, filters),
  );

  const periodAppointments = filteredAppointments.filter((appointment: any) =>
    isDateBetween(new Date(appointment.start_at), range.start, range.end),
  );
  const previousAppointments = filteredAppointments.filter((appointment: any) =>
    isDateBetween(new Date(appointment.start_at), range.previousStart, range.previousEnd),
  );
  const todayAppointments = filteredAppointments.filter((appointment: any) =>
    isDateBetween(new Date(appointment.start_at), todayStart, todayEnd),
  );
  const tomorrowAppointments = filteredAppointments.filter((appointment: any) =>
    isDateBetween(new Date(appointment.start_at), tomorrowStart, tomorrowEnd),
  );

  const periodCommandas = filteredCommandas.filter((commanda: any) =>
    commanda.status === "closed" && commanda.closed_at && isDateBetween(new Date(commanda.closed_at), range.start, range.end),
  );
  const previousCommandas = filteredCommandas.filter((commanda: any) =>
    commanda.status === "closed" && commanda.closed_at && isDateBetween(new Date(commanda.closed_at), range.previousStart, range.previousEnd),
  );
  const monthCommandas = filteredCommandas.filter((commanda: any) =>
    commanda.status === "closed" && commanda.closed_at && isDateBetween(new Date(commanda.closed_at), monthStart, monthEnd),
  );

  const periodCommandaIds = new Set(periodCommandas.map((commanda: any) => commanda.id));
  const previousCommandaIds = new Set(previousCommandas.map((commanda: any) => commanda.id));
  const monthCommandaIds = new Set(monthCommandas.map((commanda: any) => commanda.id));

  const periodItems = commandaItems.filter((item: any) => periodCommandaIds.has(item.commanda_id));
  const previousItems = commandaItems.filter((item: any) => previousCommandaIds.has(item.commanda_id));

  const periodCash = cashMovements.filter((movement: any) =>
    matchPayment(movement.payment_method, filters.paymentMethod) &&
    isDateBetween(dateFromMovement(movement), range.start, range.end),
  );
  const previousCash = cashMovements.filter((movement: any) =>
    matchPayment(movement.payment_method, filters.paymentMethod) &&
    isDateBetween(dateFromMovement(movement), range.previousStart, range.previousEnd),
  );
  const monthCash = cashMovements.filter((movement: any) =>
    matchPayment(movement.payment_method, filters.paymentMethod) &&
    isDateBetween(dateFromMovement(movement), monthStart, monthEnd),
  );

  const periodRevenue = sumCommandas(periodCommandas) + sumCash(periodCash, "in", "paid", true);
  const previousRevenue = sumCommandas(previousCommandas) + sumCash(previousCash, "in", "paid", true);
  const monthRevenue = sumCommandas(monthCommandas) + sumCash(monthCash, "in", "paid", true);
  const periodExpenses = sumCash(periodCash, "out", "paid", false);
  const previousExpenses = sumCash(previousCash, "out", "paid", false);
  const periodCommissions = sum(periodItems.map((item: any) => number(item.commission_value)));
  const previousCommissions = sum(previousItems.map((item: any) => number(item.commission_value)));
  const estimatedProfit = periodRevenue - periodExpenses - periodCommissions;
  const previousProfit = previousRevenue - previousExpenses - previousCommissions;
  const averageTicket = periodCommandas.length ? periodRevenue / periodCommandas.length : 0;
  const previousTicket = previousCommandas.length ? previousRevenue / previousCommandas.length : 0;

  const pendingCommissionItems = commandaItems.filter((item: any) => item.commission_status === "pending");
  const pendingCommissionEntries = commissionEntries.filter((entry: any) =>
    ["pending", "scheduled"].includes(String(entry.status ?? "pending")),
  );
  const pendingCommissions =
    sum(pendingCommissionItems.map((item: any) => number(item.commission_value))) +
    sum(pendingCommissionEntries.map((entry: any) => number(entry.commission_amount)));
  const pendingCommissionProfessionals = new Set([
    ...pendingCommissionItems.map((item: any) => item.professional_id).filter(Boolean),
    ...pendingCommissionEntries.map((entry: any) => entry.professional_id).filter(Boolean),
  ]).size;

  const appointmentStatus = {
    total: periodAppointments.length,
    inProgress: periodAppointments.filter((appointment: any) => appointment.status === "in_progress").length,
    completed: periodAppointments.filter((appointment: any) => appointment.status === "completed").length,
    scheduled: periodAppointments.filter((appointment: any) => ["pending", "confirmed"].includes(appointment.status ?? "pending")).length,
  };

  const periodClients = clients.filter((client: any) => isDateBetween(new Date(client.created_at), range.start, range.end));
  const clientIdsInPeriod = new Set(periodAppointments.map((appointment: any) => appointment.client_id).filter(Boolean));
  const newClientIds = new Set(periodClients.map((client: any) => client.id));
  const returningCustomers = [...clientIdsInPeriod].filter((clientId) => !newClientIds.has(clientId)).length;
  const activeClientIdsLast60 = new Set(
    filteredAppointments
      .filter((appointment: any) => new Date(appointment.start_at) >= subDays(now, 60))
      .map((appointment: any) => appointment.client_id)
      .filter(Boolean),
  );
  const inactiveCustomers = clients.filter((client: any) => !activeClientIdsLast60.has(client.id)).length;

  const occupancyRate = calculateOccupancy(
    periodAppointments,
    options?.professionals ?? [],
    options?.settings,
    tenant?.slot_minutes ?? 30,
    range.start,
    range.end,
    filters.professionalId,
  );

  const chart = buildChart(range, filteredAppointments, filteredCommandas, commandaItems, cashMovements, clients);
  const smartAgenda = buildSmartAgenda(
    filters.period === "today" ? todayAppointments : periodAppointments,
    now,
  );
  const topServices = buildServicesChart(periodItems, periodAppointments);
  const paymentMethods = buildPaymentChart(periodCommandas, payments);
  const professionalRanking = buildProfessionalRanking(options?.professionals ?? [], periodCommandas, periodItems);
  const highlightProfessional = professionalRanking[0] ?? null;
  const vacantSlots = buildVacantSlots(todayAppointments, options?.professionals ?? [], options?.settings, tenant?.slot_minutes ?? 30, now, filters.professionalId);
  const activities = buildActivities(periodAppointments, periodCommandas, clients, periodCash);
  const cancellations = buildCancellationStats(periodAppointments, previousAppointments);
  const noShow = buildNoShowStats(periodAppointments, previousAppointments);

  const receivableToday = sumCash(cashMovements.filter((movement: any) => movement.kind === "in" && movement.status === "pending" && sameDate(movement.due_date, now)), "in", "pending", false);
  const receivableWeek = sumCash(cashMovements.filter((movement: any) => movement.kind === "in" && movement.status === "pending" && isDateBetween(new Date(`${movement.due_date}T12:00:00`), todayStart, endOfDay(addDays(now, 7)))), "in", "pending", false);
  const receivableMonth = sumCash(cashMovements.filter((movement: any) => movement.kind === "in" && movement.status === "pending" && isDateBetween(new Date(`${movement.due_date}T12:00:00`), monthStart, monthEnd)), "in", "pending", false);
  const overdueBills = cashMovements.filter((movement: any) =>
    movement.kind === "out" &&
    movement.status === "pending" &&
    movement.due_date &&
    new Date(`${movement.due_date}T12:00:00`) < todayStart,
  );

  const expiringSubscriptions = subscriptions.filter((subscription: any) =>
    subscription.next_due_at &&
    isDateBetween(new Date(`${subscription.next_due_at}T12:00:00`), todayStart, endOfDay(addDays(now, 3))),
  );
  const commissionsDueToday = pendingCommissionEntries.filter((entry: any) => sameDate(entry.due_date, now));
  const professionalsTomorrowWithoutAgenda = (options?.professionals ?? [])
    .filter((professional: any) => professional.active !== false)
    .filter((professional: any) => !tomorrowAppointments.some((appointment: any) => appointment.professional_id === professional.id));
  const alerts = [
    {
      title: `${todayAppointments.filter((appointment: any) => appointment.status === "pending").length} clientes aguardando confirmação`,
      tone: "warning",
      show: todayAppointments.some((appointment: any) => appointment.status === "pending"),
    },
    {
      title: `${cashMovements.filter((movement: any) => movement.status === "pending").length} pagamentos pendentes`,
      tone: "info",
      show: cashMovements.some((movement: any) => movement.status === "pending"),
    },
    {
      title: `${commissionsDueToday.length} comissões vencem hoje`,
      tone: "danger",
      show: commissionsDueToday.length > 0,
    },
    {
      title: `${expiringSubscriptions.length} assinatura(s) vencem em até 3 dias`,
      tone: "warning",
      show: expiringSubscriptions.length > 0,
    },
    {
      title: `${vacantSlots.length} horários vagos hoje`,
      tone: "success",
      show: vacantSlots.length > 0,
    },
    {
      title: `${professionalsTomorrowWithoutAgenda.length} profissional(is) sem agenda amanhã`,
      tone: "muted",
      show: professionalsTomorrowWithoutAgenda.length > 0,
    },
  ].filter((alert) => alert.show);

  return {
    updatedAt: now,
    periodRevenue,
    previousRevenue,
    monthRevenue,
    revenueTrend: pctChange(periodRevenue, previousRevenue),
    profitTrend: pctChange(estimatedProfit, previousProfit),
    ticketTrend: pctChange(averageTicket, previousTicket),
    estimatedProfit,
    periodExpenses,
    periodCommissions,
    averageTicket,
    appointments: appointmentStatus,
    pendingCommissions,
    pendingCommissionProfessionals,
    occupancyRate,
    chart,
    smartAgenda,
    alerts,
    activities,
    professionalRanking,
    highlightProfessional,
    topServices,
    paymentMethods,
    vacantSlots,
    customers: {
      newCustomers: periodClients.length,
      returningCustomers,
      inactiveCustomers,
      birthdays: 0,
      noReturn60: inactiveCustomers,
      subscribers: clients.filter((client: any) => client.is_subscriber).length,
    },
    cancellations,
    noShow,
    finance: {
      entries: sumCash(periodCash, "in", "paid", false) + sumCommandas(periodCommandas),
      exits: periodExpenses,
      balance: periodRevenue - periodExpenses,
      receivableToday,
      receivableWeek,
      receivableMonth,
      overdueBills: overdueBills.length,
      overdueAmount: sum(overdueBills.map((movement: any) => number(movement.amount))),
    },
  };
}

function KpiCard({
  title,
  value,
  icon: Icon,
  trend,
  helper,
  loading,
  tone,
}: {
  title: string;
  value: string;
  icon: any;
  trend?: number | null;
  helper: string;
  loading: boolean;
  tone: "primary" | "success" | "warning" | "accent" | "purple" | "blue";
}) {
  const tones: Record<string, string> = {
    primary: "bg-primary/10 text-primary",
    success: "bg-emerald-500/10 text-emerald-600",
    warning: "bg-amber-500/15 text-amber-600",
    accent: "bg-cyan-500/10 text-cyan-600",
    purple: "bg-violet-500/10 text-violet-600",
    blue: "bg-blue-500/10 text-blue-600",
  };

  return (
    <Card className="group overflow-hidden rounded-[1.4rem] border bg-card shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <CardContent className="space-y-4 p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">{title}</div>
            {loading ? <Skeleton className="mt-3 h-8 w-28" /> : <div className="mt-2 text-2xl font-semibold tracking-tight">{value}</div>}
          </div>
          <div className={`rounded-2xl p-3 ${tones[tone]}`}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
        {loading ? (
          <Skeleton className="h-4 w-full" />
        ) : (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {typeof trend === "number" && (
              <TrendPill value={trend} />
            )}
            <span className="line-clamp-1">{helper}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function OccupancyCard({ value, loading }: { value: number; loading: boolean }) {
  return (
    <Card className="rounded-[1.4rem] border bg-card shadow-sm">
      <CardContent className="space-y-4 p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Taxa de ocupação</div>
            {loading ? <Skeleton className="mt-3 h-8 w-20" /> : <div className="mt-2 text-2xl font-semibold">{Math.round(value)}%</div>}
          </div>
          <div className="rounded-2xl bg-primary/10 p-3 text-primary">
            <TimerReset className="h-5 w-5" />
          </div>
        </div>
        {loading ? <Skeleton className="h-4 w-full" /> : <Progress value={Math.min(100, Math.max(0, value))} className="h-2" />}
        <p className="text-xs text-muted-foreground">Agenda preenchida dentro do horário de funcionamento.</p>
      </CardContent>
    </Card>
  );
}

function GoalCard({ revenue, target, progress, loading }: { revenue: number; target: number | null; progress: number; loading: boolean }) {
  return (
    <Card className="overflow-hidden rounded-[1.7rem] border bg-gradient-to-br from-primary/10 via-card to-card shadow-sm">
      <CardContent className="p-6">
        <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.22em] text-primary">
              <Target className="h-4 w-4" />
              Meta mensal
            </div>
            <h2 className="text-2xl font-semibold">{target ? `${Math.round(progress)}% atingido` : "Meta não configurada"}</h2>
            <p className="max-w-2xl text-sm text-muted-foreground">
              {target
                ? `Você realizou ${brl(revenue)} de ${brl(target)}. Mantendo o ritmo atual, o painel calcula a tendência conforme novos fechamentos entram no caixa.`
                : `Já realizado no mês: ${brl(revenue)}. Cadastre uma meta mensal quando essa configuração existir para acompanhar previsão de batimento.`}
            </p>
          </div>
          <div className="min-w-[220px] rounded-2xl border bg-background/70 p-4">
            {loading ? (
              <Skeleton className="h-20 w-full" />
            ) : (
              <>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Realizado</span>
                  <span className="font-semibold">{brl(revenue)}</span>
                </div>
                <Progress value={target ? progress : 0} className="mt-4 h-3" />
                <div className="mt-3 flex justify-between text-xs text-muted-foreground">
                  <span>{target ? `${Math.round(progress)}%` : "0%"}</span>
                  <span>{target ? brl(target) : "Sem meta"}</span>
                </div>
              </>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function FinancialSummary({ data, loading }: { data: any; loading: boolean }) {
  const finance = data?.finance;
  const rows = [
    ["Entradas", brl(finance?.entries), "text-emerald-600"],
    ["Saídas", brl(finance?.exits), "text-red-600"],
    ["Saldo", brl(finance?.balance), "text-foreground"],
    ["Receber hoje", brl(finance?.receivableToday), "text-primary"],
    ["Receber semana", brl(finance?.receivableWeek), "text-primary"],
    ["Receber mês", brl(finance?.receivableMonth), "text-primary"],
  ];

  return (
    <Card className="rounded-[1.7rem] border bg-card shadow-sm">
      <CardContent className="p-6">
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h3 className="font-semibold">Indicadores financeiros</h3>
            <p className="text-xs text-muted-foreground">Entradas, saídas, pendências e fluxo resumido.</p>
          </div>
          <Banknote className="h-5 w-5 text-primary" />
        </div>
        {loading ? (
          <div className="grid grid-cols-2 gap-3">
            {Array.from({ length: 6 }).map((_, index) => <Skeleton key={index} className="h-14" />)}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {rows.map(([label, value, color]) => (
              <div key={label} className="rounded-2xl border bg-muted/20 p-3">
                <div className="text-[11px] text-muted-foreground">{label}</div>
                <div className={`mt-1 text-base font-semibold ${color}`}>{value}</div>
              </div>
            ))}
          </div>
        )}
        <div className="mt-4 rounded-2xl border border-red-500/20 bg-red-500/5 p-3 text-sm">
          <span className="font-semibold text-red-600">{finance?.overdueBills ?? 0}</span>{" "}
          <span className="text-muted-foreground">contas vencidas · {brl(finance?.overdueAmount)}</span>
        </div>
      </CardContent>
    </Card>
  );
}

function MainChart({
  data,
  visibleSeries,
  onToggle,
  loading,
}: {
  data: any[];
  visibleSeries: Record<ChartSeriesKey, boolean>;
  onToggle: (key: ChartSeriesKey) => void;
  loading: boolean;
}) {
  return (
    <Card className="rounded-[1.7rem] border bg-card shadow-sm">
      <CardContent className="p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.22em] text-primary">
              <LineChartIcon className="h-4 w-4" />
              Gráfico principal
            </div>
            <h3 className="mt-2 text-xl font-semibold">Performance operacional</h3>
            <p className="text-sm text-muted-foreground">Ative ou desative séries para comparar receita, agenda e operação.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {chartSeries.map((series) => (
              <button
                key={series.key}
                type="button"
                onClick={() => onToggle(series.key)}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                  visibleSeries[series.key] ? "border-primary bg-primary text-primary-foreground" : "bg-background text-muted-foreground"
                }`}
              >
                {series.label}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-6 h-[360px]">
          {loading ? (
            <Skeleton className="h-full w-full rounded-2xl" />
          ) : (
            <ResponsiveContainer>
              <AreaChart data={data}>
                <defs>
                  {chartSeries.map((series) => (
                    <linearGradient key={series.key} id={`gradient-${series.key}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={series.color} stopOpacity={0.28} />
                      <stop offset="100%" stopColor={series.color} stopOpacity={0.02} />
                    </linearGradient>
                  ))}
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.35} />
                <XAxis dataKey="label" fontSize={11} axisLine={false} tickLine={false} />
                <YAxis fontSize={11} axisLine={false} tickLine={false} />
                <Tooltip formatter={(value: any, name: any) => formatChartTooltip(name, Number(value))} />
                <Legend />
                {chartSeries.map((series) =>
                  visibleSeries[series.key] ? (
                    <Area
                      key={series.key}
                      type="monotone"
                      dataKey={series.key}
                      name={series.label}
                      stroke={series.color}
                      strokeWidth={2.4}
                      fill={`url(#gradient-${series.key})`}
                    />
                  ) : null,
                )}
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function SmartAgenda({ items, loading }: { items: any[]; loading: boolean }) {
  return (
    <Card className="rounded-[1.7rem] border bg-card shadow-sm">
      <CardContent className="p-6">
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h3 className="font-semibold">Agenda inteligente</h3>
            <p className="text-xs text-muted-foreground">Quem está atendendo agora e quem chega em seguida.</p>
          </div>
          <Button asChild variant="outline" size="sm" className="rounded-full">
            <a href="/app/agenda">Ver agenda completa</a>
          </Button>
        </div>
        {loading ? (
          <div className="space-y-3">{Array.from({ length: 5 }).map((_, index) => <Skeleton key={index} className="h-16" />)}</div>
        ) : items.length === 0 ? (
          <EmptyState icon={Calendar} text="Nenhum agendamento dentro do filtro." />
        ) : (
          <div className="space-y-3">
            {items.slice(0, 8).map((item) => (
              <div key={item.id} className="flex items-center gap-3 rounded-2xl border bg-muted/20 p-3">
                <div className="rounded-xl bg-background px-3 py-2 text-center text-sm font-semibold">{item.time}</div>
                <div className={`h-10 w-1 rounded-full ${item.color}`} />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{item.client}</div>
                  <div className="truncate text-xs text-muted-foreground">{item.professional} · {item.service}</div>
                </div>
                <Badge variant="outline" className="whitespace-nowrap">{item.label}</Badge>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SmartAlerts({ alerts, loading }: { alerts: any[]; loading: boolean }) {
  const tones: Record<string, string> = {
    warning: "border-amber-500/30 bg-amber-500/10 text-amber-700",
    danger: "border-red-500/30 bg-red-500/10 text-red-700",
    info: "border-blue-500/30 bg-blue-500/10 text-blue-700",
    success: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700",
    muted: "border-muted bg-muted/40 text-muted-foreground",
  };
  return (
    <Card className="rounded-[1.7rem] border bg-card shadow-sm">
      <CardContent className="p-6">
        <div className="mb-5 flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-primary" />
          <h3 className="font-semibold">Alertas inteligentes</h3>
        </div>
        {loading ? (
          <div className="space-y-3">{Array.from({ length: 5 }).map((_, index) => <Skeleton key={index} className="h-12" />)}</div>
        ) : alerts.length === 0 ? (
          <EmptyState icon={CheckCircle2} text="Nenhum alerta crítico no momento." />
        ) : (
          <div className="space-y-3">
            {alerts.map((alert, index) => (
              <div key={`${alert.title}-${index}`} className={`rounded-2xl border px-4 py-3 text-sm font-medium ${tones[alert.tone] ?? tones.muted}`}>
                {alert.title}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function RecentActivity({ items, loading }: { items: any[]; loading: boolean }) {
  return (
    <Card className="rounded-[1.7rem] border bg-card shadow-sm">
      <CardContent className="p-6">
        <div className="mb-5 flex items-center gap-2">
          <Activity className="h-5 w-5 text-primary" />
          <h3 className="font-semibold">Atividades recentes</h3>
        </div>
        {loading ? (
          <div className="space-y-3">{Array.from({ length: 6 }).map((_, index) => <Skeleton key={index} className="h-12" />)}</div>
        ) : items.length === 0 ? (
          <EmptyState icon={Activity} text="Nenhuma atividade encontrada no filtro." />
        ) : (
          <div className="relative space-y-4 before:absolute before:left-[3.2rem] before:top-1 before:h-[calc(100%-0.5rem)] before:w-px before:bg-border">
            {items.slice(0, 20).map((item, index) => (
              <div key={`${item.date}-${index}`} className="relative grid grid-cols-[3rem_1fr] gap-4">
                <div className="text-xs font-semibold text-muted-foreground">{format(new Date(item.date), "HH:mm")}</div>
                <div className="rounded-2xl border bg-muted/20 p-3 text-sm">
                  <div className="font-medium">{item.text}</div>
                  <div className="text-xs text-muted-foreground">{item.type}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function BookingLinkCard({ bookingLink }: { bookingLink: string }) {
  const share = async () => {
    if (navigator.share) {
      await navigator.share({ title: "Agendamento LinkUp Studio", url: bookingLink });
      return;
    }
    await navigator.clipboard.writeText(bookingLink);
    toast.success("Link copiado para compartilhar.");
  };

  return (
    <Card className="rounded-[1.7rem] border bg-card shadow-sm">
      <CardContent className="p-6">
        <div className="mb-5 flex items-center gap-2">
          <Link2 className="h-5 w-5 text-primary" />
          <h3 className="font-semibold">Link de agendamento</h3>
        </div>
        <div className="flex gap-4">
          <div className="rounded-2xl border bg-white p-2">
            <QrCode value={bookingLink} size={92} />
          </div>
          <div className="min-w-0 flex-1 space-y-3">
            <div>
              <div className="text-xs font-semibold text-muted-foreground">Seu link</div>
              <div className="truncate rounded-xl border bg-muted/30 px-3 py-2 text-xs">{bookingLink}</div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" className="rounded-full" onClick={() => { navigator.clipboard.writeText(bookingLink); toast.success("Link copiado!"); }}>
                <Copy className="mr-2 h-4 w-4" /> Copiar
              </Button>
              <Button size="sm" variant="outline" className="rounded-full" onClick={share}>
                <Share2 className="mr-2 h-4 w-4" /> Compartilhar
              </Button>
              <Button asChild size="sm" variant="outline" className="rounded-full">
                <a href={bookingLink} target="_blank" rel="noreferrer"><ExternalLink className="mr-2 h-4 w-4" /> Abrir página</a>
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ProfessionalRanking({ professionals, loading }: { professionals: any[]; loading: boolean }) {
  return (
    <Card className="rounded-[1.7rem] border bg-card shadow-sm">
      <CardContent className="p-6">
        <div className="mb-5 flex items-center gap-2">
          <Award className="h-5 w-5 text-primary" />
          <h3 className="font-semibold">Ranking dos profissionais</h3>
        </div>
        {loading ? (
          <div className="space-y-3">{Array.from({ length: 5 }).map((_, index) => <Skeleton key={index} className="h-16" />)}</div>
        ) : professionals.length === 0 ? (
          <EmptyState icon={Scissors} text="Nenhum profissional com faturamento no filtro." />
        ) : (
          <div className="overflow-hidden rounded-2xl border">
            {professionals.slice(0, 8).map((professional, index) => (
              <div key={professional.id} className="grid grid-cols-[auto_1fr_auto] items-center gap-3 border-b p-3 last:border-b-0 md:grid-cols-[auto_1.2fr_0.8fr_0.7fr_0.7fr]">
                <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-primary/10 text-sm font-semibold text-primary">
                  {professional.photo ? <img src={professional.photo} alt="" className="h-full w-full object-cover" /> : index + 1}
                </div>
                <div className="min-w-0">
                  <div className="truncate font-medium">{professional.name}</div>
                  <div className="text-xs text-muted-foreground">Avaliação não registrada</div>
                </div>
                <div className="hidden text-sm font-semibold md:block">{brl(professional.revenue)}</div>
                <div className="hidden text-sm text-muted-foreground md:block">{professional.appointments} atend.</div>
                <div className="text-right text-sm font-semibold">{brl(professional.ticket)}</div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function HighlightProfessional({ professional, loading }: { professional: any; loading: boolean }) {
  return (
    <Card className="overflow-hidden rounded-[1.7rem] border bg-gradient-to-br from-primary/15 via-card to-card shadow-sm">
      <CardContent className="p-6">
        <div className="mb-5 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.22em] text-primary">
          <Sparkles className="h-4 w-4" />
          Profissional destaque
        </div>
        {loading ? (
          <Skeleton className="h-44 w-full rounded-2xl" />
        ) : !professional ? (
          <EmptyState icon={Award} text="Ainda não há destaque no período." />
        ) : (
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
            <div className="h-24 w-24 overflow-hidden rounded-3xl bg-primary/10">
              {professional.photo ? <img src={professional.photo} alt="" className="h-full w-full object-cover" /> : <Award className="m-8 h-8 w-8 text-primary" />}
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-2xl font-semibold">{professional.name}</h3>
              <p className="text-sm text-muted-foreground">Maior faturamento do período filtrado.</p>
              <div className="mt-4 grid grid-cols-3 gap-3">
                <MiniMetric label="Receita" value={brl(professional.revenue)} />
                <MiniMetric label="Atend." value={String(professional.appointments)} />
                <MiniMetric label="Ticket" value={brl(professional.ticket)} />
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SimplePieCard({ title, subtitle, icon: Icon, data, loading, money = false }: { title: string; subtitle: string; icon: any; data: any[]; loading: boolean; money?: boolean }) {
  return (
    <Card className="rounded-[1.7rem] border bg-card shadow-sm">
      <CardContent className="p-6">
        <div className="mb-5 flex items-start justify-between">
          <div>
            <h3 className="font-semibold">{title}</h3>
            <p className="text-xs text-muted-foreground">{subtitle}</p>
          </div>
          <Icon className="h-5 w-5 text-primary" />
        </div>
        {loading ? (
          <Skeleton className="h-56 w-full rounded-2xl" />
        ) : data.length === 0 ? (
          <EmptyState icon={PieChartIcon} text="Sem dados no período." />
        ) : (
          <>
            <div className="h-52">
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={data} dataKey="value" nameKey="name" innerRadius={money ? 48 : 0} outerRadius={78} paddingAngle={2}>
                    {data.map((entry, index) => <Cell key={entry.name} fill={pieColors[index % pieColors.length]} />)}
                  </Pie>
                  <Tooltip formatter={(value: any) => money ? brl(Number(value)) : `${value}`} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="space-y-2">
              {data.slice(0, 5).map((entry, index) => (
                <div key={entry.name} className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2 truncate">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: pieColors[index % pieColors.length] }} />
                    {entry.name}
                  </span>
                  <span className="font-semibold">{money ? brl(entry.value) : `${entry.value}`}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function VacantSlotsCard({ slots, loading }: { slots: any[]; loading: boolean }) {
  return (
    <Card className="rounded-[1.7rem] border bg-card shadow-sm">
      <CardContent className="p-6">
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h3 className="font-semibold">Horários ociosos</h3>
            <p className="text-xs text-muted-foreground">Primeiros horários livres de hoje.</p>
          </div>
          <Clock className="h-5 w-5 text-primary" />
        </div>
        {loading ? (
          <div className="space-y-3">{Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-12" />)}</div>
        ) : slots.length === 0 ? (
          <EmptyState icon={CheckCircle2} text="Sem horários vagos relevantes hoje." />
        ) : (
          <div className="space-y-3">
            {slots.slice(0, 6).map((slot) => (
              <div key={slot.time} className="flex items-center justify-between rounded-2xl border bg-muted/20 px-4 py-3">
                <div>
                  <div className="font-semibold">{slot.time}</div>
                  <div className="text-xs text-muted-foreground">{slot.available} profissional(is) livre(s)</div>
                </div>
                <Badge variant="outline">Livre</Badge>
              </div>
            ))}
            <Button variant="outline" className="w-full rounded-full" disabled>
              Divulgar horários
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function CustomerIntelligence({ data, loading }: { data: any; loading: boolean }) {
  return (
    <Card className="rounded-[1.7rem] border bg-card shadow-sm">
      <CardContent className="p-6">
        <div className="mb-5 flex items-center gap-2">
          <Users className="h-5 w-5 text-primary" />
          <h3 className="font-semibold">Clientes</h3>
        </div>
        {loading ? (
          <Skeleton className="h-44 w-full rounded-2xl" />
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <MiniMetric label="Novos" value={String(data?.newCustomers ?? 0)} />
            <MiniMetric label="Recorrentes" value={String(data?.returningCustomers ?? 0)} />
            <MiniMetric label="Inativos" value={String(data?.inactiveCustomers ?? 0)} />
            <MiniMetric label="Aniversariantes" value={String(data?.birthdays ?? 0)} />
            <MiniMetric label="+60 dias sem retorno" value={String(data?.noReturn60 ?? 0)} />
            <MiniMetric label="Assinantes" value={String(data?.subscribers ?? 0)} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function CancellationCard({ data, loading }: { data: any; loading: boolean }) {
  return (
    <MetricComparisonCard
      title="Cancelamentos"
      icon={XCircle}
      loading={loading}
      value={data?.period ?? 0}
      helper={`${data?.week ?? 0} na semana · ${data?.month ?? 0} no mês`}
      trend={data?.trend}
      tone="danger"
    />
  );
}

function NoShowCard({ data, loading }: { data: any; loading: boolean }) {
  return (
    <MetricComparisonCard
      title="No-show"
      icon={AlertTriangle}
      loading={loading}
      value={data?.period ?? 0}
      helper={`${data?.week ?? 0} na semana · ${data?.month ?? 0} no mês`}
      trend={data?.trend}
      tone="warning"
    />
  );
}

function MetricComparisonCard({ title, icon: Icon, value, helper, trend, loading, tone }: any) {
  const toneClass = tone === "danger" ? "bg-red-500/10 text-red-600" : "bg-amber-500/15 text-amber-600";
  return (
    <Card className="rounded-[1.7rem] border bg-card shadow-sm">
      <CardContent className="space-y-4 p-6">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">{title}</div>
            {loading ? <Skeleton className="mt-3 h-9 w-16" /> : <div className="mt-2 text-3xl font-semibold">{value}</div>}
          </div>
          <div className={`rounded-2xl p-3 ${toneClass}`}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
        {loading ? <Skeleton className="h-4 w-full" /> : (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <TrendPill value={trend ?? 0} />
            <span>{helper}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border bg-background/60 p-3">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="mt-1 text-sm font-semibold">{value}</div>
    </div>
  );
}

function TrendPill({ value }: { value: number | null | undefined }) {
  const safe = Number(value ?? 0);
  const positive = safe >= 0;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${positive ? "bg-emerald-500/10 text-emerald-600" : "bg-red-500/10 text-red-600"}`}>
      {positive ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
      {positive ? "+" : ""}{Math.round(safe)}%
    </span>
  );
}

function EmptyState({ icon: Icon, text }: { icon: any; text: string }) {
  return (
    <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">
      <Icon className="mx-auto mb-2 h-8 w-8 opacity-40" />
      {text}
    </div>
  );
}

function getRange(period: PeriodPreset, customStart: string, customEnd: string): RangeInfo {
  const now = new Date();
  let start = startOfDay(now);
  let end = endOfDay(now);
  let label = "Hoje";

  if (period === "yesterday") {
    start = startOfDay(subDays(now, 1));
    end = endOfDay(subDays(now, 1));
    label = "Ontem";
  } else if (period === "last7") {
    start = startOfDay(subDays(now, 6));
    label = "Últimos 7 dias";
  } else if (period === "last30") {
    start = startOfDay(subDays(now, 29));
    label = "Últimos 30 dias";
  } else if (period === "thisMonth") {
    start = startOfMonth(now);
    end = endOfDay(now);
    label = "Este mês";
  } else if (period === "lastMonth") {
    const previousMonth = subMonths(now, 1);
    start = startOfMonth(previousMonth);
    end = endOfMonth(previousMonth);
    label = "Mês passado";
  } else if (period === "custom" && customStart && customEnd) {
    start = startOfDay(new Date(`${customStart}T12:00:00`));
    end = endOfDay(new Date(`${customEnd}T12:00:00`));
    if (end < start) [start, end] = [end, start];
    label = `${format(start, "dd/MM")} a ${format(end, "dd/MM")}`;
  }

  const days = Math.max(1, differenceInCalendarDays(end, start) + 1);
  const previousEnd = endOfDay(subDays(start, 1));
  const previousStart = startOfDay(subDays(previousEnd, days - 1));
  return { start, end, previousStart, previousEnd, label };
}

function getGreeting(name?: string | null) {
  const hour = new Date().getHours();
  const firstName = String(name || "gestor").split(" ")[0];
  if (hour < 12) return `Bom dia, ${firstName}!`;
  if (hour < 18) return `Boa tarde, ${firstName}!`;
  return `Boa noite, ${firstName}!`;
}

function number(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}

function sumCommandas(commandas: any[]) {
  return sum(commandas.map((commanda: any) => number(commanda.total)));
}

function sumCash(rows: any[], kind: "in" | "out", status: "paid" | "pending", excludeComanda: boolean) {
  return sum(
    rows
      .filter((row: any) => row.kind === kind && row.status === status)
      .filter((row: any) => !excludeComanda || !["comanda", "checkout", "appointment"].includes(String(row.source ?? "")))
      .map((row: any) => number(row.amount)),
  );
}

function pctChange(current: number, previous: number) {
  if (!previous && !current) return 0;
  if (!previous) return 100;
  return ((current - previous) / Math.abs(previous)) * 100;
}

function isDateBetween(date: Date, start: Date, end: Date) {
  return date >= start && date <= end;
}

function sameDate(value: string | null | undefined, date: Date) {
  if (!value) return false;
  return isSameDay(new Date(`${value}T12:00:00`), date);
}

function dateFromMovement(movement: any) {
  return new Date(`${movement.competence_date ?? movement.movement_date ?? format(new Date(movement.created_at), "yyyy-MM-dd")}T12:00:00`);
}

function matchClient(clientName: string | null | undefined, search: string) {
  const term = search.trim().toLowerCase();
  if (!term) return true;
  return String(clientName ?? "").toLowerCase().includes(term);
}

function matchPayment(method: string | null | undefined, selected: string) {
  return selected === "all" || String(method ?? "").toLowerCase() === selected;
}

function matchAppointment(appointment: any, filters: DashboardFilters) {
  if (filters.professionalId !== "all" && appointment.professional_id !== filters.professionalId) return false;
  if (filters.serviceId !== "all" && appointment.service_id !== filters.serviceId) return false;
  if (filters.status !== "all" && appointment.status !== filters.status) return false;
  if (filters.source !== "all" && appointment.source !== filters.source) return false;
  if (!matchClient(appointment.client_name, filters.client)) return false;
  return true;
}

function matchCommandaByItems(commanda: any, items: any[], filters: DashboardFilters) {
  const related = items.filter((item: any) => item.commanda_id === commanda.id);
  if (filters.professionalId !== "all" && !related.some((item: any) => item.professional_id === filters.professionalId)) return false;
  if (filters.serviceId !== "all" && !related.some((item: any) => item.ref_id === filters.serviceId)) return false;
  return true;
}

function buildChart(range: RangeInfo, appointments: any[], commandas: any[], items: any[], cashRows: any[], clients: any[]) {
  const days = [];
  const totalDays = Math.max(1, differenceInCalendarDays(range.end, range.start) + 1);
  for (let index = 0; index < totalDays; index += 1) {
    const date = addDays(range.start, index);
    const dayStart = startOfDay(date);
    const dayEnd = endOfDay(date);
    const dayCommandas = commandas.filter((commanda: any) =>
      commanda.status === "closed" && commanda.closed_at && isDateBetween(new Date(commanda.closed_at), dayStart, dayEnd),
    );
    const dayIds = new Set(dayCommandas.map((commanda: any) => commanda.id));
    const dayItems = items.filter((item: any) => dayIds.has(item.commanda_id));
    const dayCash = cashRows.filter((movement: any) => isDateBetween(dateFromMovement(movement), dayStart, dayEnd));
    const dayAppointments = appointments.filter((appointment: any) => isDateBetween(new Date(appointment.start_at), dayStart, dayEnd));
    const revenue = sumCommandas(dayCommandas) + sumCash(dayCash, "in", "paid", true);
    const expenses = sumCash(dayCash, "out", "paid", false);
    const commissions = sum(dayItems.map((item: any) => number(item.commission_value)));
    const completed = dayAppointments.filter((appointment: any) => appointment.status === "completed").length;
    days.push({
      label: format(date, "dd/MM"),
      revenue,
      appointments: dayAppointments.length,
      cancellations: dayAppointments.filter((appointment: any) => ["cancelled", "canceled"].includes(appointment.status)).length,
      profit: revenue - expenses - commissions,
      ticket: completed ? revenue / completed : 0,
      newClients: clients.filter((client: any) => isDateBetween(new Date(client.created_at), dayStart, dayEnd)).length,
      commissions,
    });
  }
  return days;
}

function buildSmartAgenda(appointments: any[], now: Date) {
  return [...appointments]
    .sort((a: any, b: any) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime())
    .map((appointment: any) => {
      const start = new Date(appointment.start_at);
      const end = new Date(appointment.end_at);
      const minutes = Math.round((start.getTime() - now.getTime()) / 60000);
      const active = now >= start && now <= end && !["completed", "cancelled", "canceled", "no_show"].includes(appointment.status);
      const label = active
        ? "Em atendimento"
        : minutes > 0 && minutes <= 90
          ? `Chega em ${minutes} min`
          : statusLabels[appointment.status] ?? "Agendado";
      const color = active
        ? "bg-emerald-500"
        : appointment.status === "pending"
          ? "bg-amber-500"
          : appointment.status === "cancelled" || appointment.status === "canceled"
            ? "bg-red-500"
            : "bg-blue-500";
      return {
        id: appointment.id,
        time: format(start, "HH:mm"),
        client: appointment.client_name || "Cliente",
        professional: appointment.professionals?.full_name || "Profissional",
        service: appointment.services?.name || "Serviço",
        label,
        color,
      };
    });
}

function buildServicesChart(items: any[], appointments: any[]) {
  const map = new Map<string, number>();
  items.filter((item: any) => item.kind === "service").forEach((item: any) => {
    map.set(item.name || "Serviço", (map.get(item.name || "Serviço") ?? 0) + number(item.quantity || 1));
  });
  if (map.size === 0) {
    appointments.forEach((appointment: any) => {
      const name = appointment.services?.name || "Serviço";
      map.set(name, (map.get(name) ?? 0) + 1);
    });
  }
  return [...map.entries()]
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 6);
}

function buildPaymentChart(commandas: any[], payments: any[]) {
  const ids = new Set(commandas.map((commanda: any) => commanda.id));
  const map = new Map<string, number>();
  payments.filter((payment: any) => ids.has(payment.commanda_id)).forEach((payment: any) => {
    const label = paymentLabels[payment.method] ?? payment.method ?? "Não informado";
    map.set(label, (map.get(label) ?? 0) + number(payment.amount));
  });
  if (map.size === 0) {
    commandas.forEach((commanda: any) => {
      const label = paymentLabels[commanda.payment_method] ?? commanda.payment_method ?? "Não informado";
      map.set(label, (map.get(label) ?? 0) + number(commanda.total));
    });
  }
  return [...map.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
}

function buildProfessionalRanking(professionals: any[], commandas: any[], items: any[]) {
  const map = new Map<string, any>();
  professionals.forEach((professional: any) => {
    map.set(professional.id, {
      id: professional.id,
      name: professional.full_name,
      photo: professional.photo_url,
      revenue: 0,
      appointments: 0,
      ticket: 0,
    });
  });
  items.forEach((item: any) => {
    if (!item.professional_id || !map.has(item.professional_id)) return;
    const row = map.get(item.professional_id);
    row.revenue += number(item.unit_price) * number(item.quantity || 1);
    row.appointments += item.kind === "service" ? 1 : 0;
  });
  return [...map.values()]
    .map((row) => ({ ...row, ticket: row.appointments ? row.revenue / row.appointments : 0 }))
    .filter((row) => row.revenue > 0 || row.appointments > 0)
    .sort((a, b) => b.revenue - a.revenue);
}

function buildVacantSlots(appointments: any[], professionals: any[], settings: any, slotMinutes: number, now: Date, professionalFilter: string) {
  const activeProfessionals = professionals.filter((professional: any) =>
    professional.active !== false && (professionalFilter === "all" || professional.id === professionalFilter),
  );
  if (!activeProfessionals.length) return [];
  const openHour = Number(settings?.open_hour ?? 8);
  const closeHour = Number(settings?.close_hour ?? 20);
  const slots = [];
  const base = startOfDay(now);
  for (let hour = openHour; hour < closeHour; hour += 1) {
    for (let minute = 0; minute < 60; minute += Math.max(15, Number(slotMinutes || 30))) {
      const slot = new Date(base);
      slot.setHours(hour, minute, 0, 0);
      if (slot <= now) continue;
      const available = activeProfessionals.filter((professional: any) => {
        return !appointments.some((appointment: any) => {
          if (appointment.professional_id !== professional.id) return false;
          if (["cancelled", "canceled", "no_show", "completed"].includes(appointment.status)) return false;
          return slot >= new Date(appointment.start_at) && slot < new Date(appointment.end_at);
        });
      }).length;
      if (available > 0) slots.push({ time: format(slot, "HH:mm"), available });
      if (slots.length >= 8) return slots;
    }
  }
  return slots;
}

function buildActivities(appointments: any[], commandas: any[], clients: any[], cashRows: any[]) {
  const activities = [
    ...appointments.map((appointment: any) => ({
      date: appointment.created_at || appointment.start_at,
      type: "Agenda",
      text: `${appointment.client_name || "Cliente"} realizou agendamento ${appointment.source === "online" ? "online" : "interno"}.`,
    })),
    ...commandas.filter((commanda: any) => commanda.status === "closed").map((commanda: any) => ({
      date: commanda.closed_at || commanda.created_at,
      type: "Caixa",
      text: `Comanda #${commanda.number} fechada em ${brl(commanda.total)}.`,
    })),
    ...clients.map((client: any) => ({
      date: client.created_at,
      type: "Clientes",
      text: `Novo cliente cadastrado: ${client.full_name}.`,
    })),
    ...cashRows.map((movement: any) => ({
      date: movement.paid_at || movement.created_at,
      type: "Financeiro",
      text: `${movement.kind === "in" ? "Entrada" : "Saída"} registrada: ${brl(movement.amount)}.`,
    })),
  ];
  return activities
    .filter((item) => item.date)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 20);
}

function buildCancellationStats(periodAppointments: any[], previousAppointments: any[]) {
  const period = periodAppointments.filter((appointment: any) => ["cancelled", "canceled"].includes(appointment.status)).length;
  const previous = previousAppointments.filter((appointment: any) => ["cancelled", "canceled"].includes(appointment.status)).length;
  const now = new Date();
  const week = periodAppointments.filter((appointment: any) =>
    ["cancelled", "canceled"].includes(appointment.status) && new Date(appointment.start_at) >= subDays(now, 7),
  ).length;
  const month = periodAppointments.filter((appointment: any) =>
    ["cancelled", "canceled"].includes(appointment.status) && new Date(appointment.start_at) >= startOfMonth(now),
  ).length;
  return { period, week, month, trend: pctChange(period, previous) };
}

function buildNoShowStats(periodAppointments: any[], previousAppointments: any[]) {
  const period = periodAppointments.filter((appointment: any) => appointment.status === "no_show" || appointment.status === "noshow").length;
  const previous = previousAppointments.filter((appointment: any) => appointment.status === "no_show" || appointment.status === "noshow").length;
  const now = new Date();
  const week = periodAppointments.filter((appointment: any) =>
    (appointment.status === "no_show" || appointment.status === "noshow") && new Date(appointment.start_at) >= subDays(now, 7),
  ).length;
  const month = periodAppointments.filter((appointment: any) =>
    (appointment.status === "no_show" || appointment.status === "noshow") && new Date(appointment.start_at) >= startOfMonth(now),
  ).length;
  return { period, week, month, trend: pctChange(period, previous) };
}

function calculateOccupancy(appointments: any[], professionals: any[], settings: any, slotMinutes: number, start: Date, end: Date, professionalFilter: string) {
  const activeProfessionals = professionals.filter((professional: any) =>
    professional.active !== false && (professionalFilter === "all" || professional.id === professionalFilter),
  );
  if (!activeProfessionals.length) return 0;
  const openHour = Number(settings?.open_hour ?? 8);
  const closeHour = Number(settings?.close_hour ?? 20);
  const workDays = Array.isArray(settings?.work_days) ? settings.work_days : [1, 2, 3, 4, 5, 6];
  const days = differenceInCalendarDays(end, start) + 1;
  let availableMinutes = 0;
  for (let index = 0; index < days; index += 1) {
    const day = addDays(start, index);
    if (workDays.includes(day.getDay())) {
      availableMinutes += Math.max(0, closeHour - openHour) * 60 * activeProfessionals.length;
    }
  }
  if (!availableMinutes) return 0;
  const occupied = appointments
    .filter((appointment: any) => !["cancelled", "canceled", "no_show"].includes(appointment.status))
    .reduce((total: number, appointment: any) => {
      const startAt = new Date(appointment.start_at);
      const endAt = new Date(appointment.end_at);
      return total + Math.max(Number(slotMinutes || 30), (endAt.getTime() - startAt.getTime()) / 60000);
    }, 0);
  return Math.min(100, Math.max(0, (occupied / availableMinutes) * 100));
}

function formatChartTooltip(name: string, value: number) {
  if (["Receita", "Lucro", "Ticket médio", "Comissões"].includes(name)) return brl(value);
  return value;
}

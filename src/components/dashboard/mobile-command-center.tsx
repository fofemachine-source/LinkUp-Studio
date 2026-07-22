import { Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  BarChart3,
  CalendarDays,
  CalendarPlus,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  Filter,
  RefreshCw,
  Timer,
  Users,
  WalletCards,
} from "lucide-react";
import { type ReactNode, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { brl } from "@/lib/format";

type MobileCommandCenterProps = {
  data?: MobileDashboardData;
  loading: boolean;
  fetching: boolean;
  periodLabel: string;
  filtersContent: ReactNode;
  onRefresh: () => void;
};

type MobileAgendaItem = {
  id: string;
  time: string;
  client: string;
  service: string;
  professional: string;
  label: string;
  color: string;
};

export type MobileCommandCenterAlert = {
  title: string;
  tone: string;
  href?:
    | "/app"
    | "/app/agenda"
    | "/app/comandas"
    | "/app/financeiro"
    | "/app/comissoes"
    | "/app/assinantes";
};

type MobileDashboardData = {
  todayOperation?: {
    total?: number;
    inProgress?: number;
    completed?: number;
    delayed?: number;
  };
  smartAgenda?: MobileAgendaItem[];
  alerts?: MobileCommandCenterAlert[];
  mobileAlerts?: MobileCommandCenterAlert[];
  periodRevenue?: number;
  forecast?: { total?: number };
  averageTicket?: number;
  occupancyRate?: number;
  averageServiceMinutes?: number;
  cancellations?: { rate?: number };
};

const cardClass =
  "overflow-hidden rounded-[1.4rem] border border-border/70 bg-card shadow-[0_8px_28px_-22px_rgba(15,23,42,0.5)]";

export function MobileCommandCenter({
  data,
  loading,
  fetching,
  periodLabel,
  filtersContent,
  onRefresh,
}: MobileCommandCenterProps) {
  const [filtersOpen, setFiltersOpen] = useState(false);
  const operation = data?.todayOperation;
  const nextAppointment = data?.smartAgenda?.[0] ?? null;
  const upcomingAppointments = data?.smartAgenda?.slice(1, 5) ?? [];
  const alerts = data?.mobileAlerts ?? data?.alerts ?? [];

  return (
    <div className="-mx-3 space-y-4 pb-4">
      <section className="flex items-center justify-between gap-3 px-1">
        <div className="min-w-0">
          <p className="text-xs font-medium text-muted-foreground">Visão operacional</p>
          <h1 className="truncate text-xl font-semibold tracking-tight">Central de Comando</h1>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          disabled={fetching}
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full border bg-card text-muted-foreground transition-colors hover:text-foreground active:bg-muted disabled:opacity-50"
          aria-label="Atualizar Painel Geral"
        >
          <RefreshCw className={`h-4 w-4 ${fetching ? "animate-spin" : ""}`} />
        </button>
      </section>

      <Button
        asChild
        className="h-14 w-full justify-between rounded-2xl px-5 text-[15px] font-semibold shadow-sm"
      >
        <Link to="/app/agenda">
          <span className="flex items-center gap-3">
            <CalendarPlus className="h-5 w-5" />
            Novo Agendamento
          </span>
          <ChevronRight className="h-4 w-4" />
        </Link>
      </Button>

      <section className={cardClass}>
        <SectionHeading
          eyebrow="Agora"
          title="Operação de hoje"
          icon={<CalendarDays className="h-4 w-4" />}
        />
        <div className="grid grid-cols-2 border-t">
          <OperationMetric
            label="Agendamentos"
            value={operation?.total ?? 0}
            loading={loading}
            icon={<CalendarDays className="h-4 w-4" />}
          />
          <OperationMetric
            label="Em atendimento"
            value={operation?.inProgress ?? 0}
            loading={loading}
            icon={<Users className="h-4 w-4" />}
          />
          <OperationMetric
            label="Finalizados"
            value={operation?.completed ?? 0}
            loading={loading}
            icon={<CheckCircle2 className="h-4 w-4" />}
          />
          <OperationMetric
            label="Atrasados"
            value={operation?.delayed ?? 0}
            loading={loading}
            icon={<Clock3 className="h-4 w-4" />}
            danger={(operation?.delayed ?? 0) > 0}
          />
        </div>
      </section>

      <section className={cardClass}>
        <SectionHeading
          eyebrow={periodLabel}
          title="Resumo financeiro"
          icon={<WalletCards className="h-4 w-4" />}
        />
        <div className="grid grid-cols-3 gap-px border-t bg-border/70">
          <FinancialMetric label="Recebido" value={brl(data?.periodRevenue)} loading={loading} />
          <FinancialMetric label="Previsto" value={brl(data?.forecast?.total)} loading={loading} />
          <FinancialMetric
            label="Ticket médio"
            value={brl(data?.averageTicket)}
            loading={loading}
          />
        </div>
      </section>

      <section className={cardClass}>
        <SectionHeading
          eyebrow="Em seguida"
          title="Próximo atendimento"
          icon={<Clock3 className="h-4 w-4" />}
        />
        <div className="border-t p-4">
          {loading ? (
            <div className="space-y-3">
              <Skeleton className="h-6 w-32" />
              <Skeleton className="h-14 w-full rounded-xl" />
            </div>
          ) : nextAppointment ? (
            <>
              <div className="flex items-start gap-3">
                <div className="grid min-w-16 place-items-center rounded-2xl bg-primary px-3 py-3 text-primary-foreground">
                  <span className="text-lg font-semibold leading-none">{nextAppointment.time}</span>
                </div>
                <div className="min-w-0 flex-1 py-0.5">
                  <div className="truncate text-base font-semibold">{nextAppointment.client}</div>
                  <div className="mt-1 truncate text-sm text-muted-foreground">
                    {nextAppointment.service}
                  </div>
                  <div className="mt-0.5 truncate text-xs text-muted-foreground">
                    com {nextAppointment.professional}
                  </div>
                </div>
                <Badge variant="outline" className="max-w-24 truncate rounded-full text-[10px]">
                  {nextAppointment.label}
                </Badge>
              </div>
              <Button asChild variant="outline" className="mt-4 h-11 w-full rounded-xl">
                <Link to="/app/agenda">Abrir Atendimento</Link>
              </Button>
            </>
          ) : (
            <PositiveEmptyState
              title="Agenda livre por enquanto"
              description="Nenhum próximo atendimento encontrado neste período."
            />
          )}
        </div>
      </section>

      <section className={cardClass}>
        <SectionHeading
          eyebrow="Prioridades"
          title="Central de atenção"
          icon={<AlertTriangle className="h-4 w-4" />}
        />
        <div className="space-y-2 border-t p-3">
          {loading ? (
            Array.from({ length: 3 }).map((_, index) => (
              <Skeleton key={index} className="h-12 w-full rounded-xl" />
            ))
          ) : alerts.length > 0 ? (
            alerts.slice(0, 5).map((alert, index) => (
              <Link
                key={`${alert.title}-${index}`}
                to={alert.href ?? "/app"}
                className="flex min-h-12 items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors hover:bg-muted active:bg-muted"
              >
                <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${alertDot(alert.tone)}`} />
                <span className="min-w-0 flex-1 font-medium leading-snug">{alert.title}</span>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              </Link>
            ))
          ) : (
            <PositiveEmptyState
              title="Tudo sob controle"
              description="Nenhuma pendência operacional importante neste momento."
            />
          )}
        </div>
      </section>

      <section className={cardClass}>
        <div className="flex items-center justify-between gap-3 p-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary">
              Próximos horários
            </p>
            <h2 className="mt-1 text-base font-semibold">Próximos agendamentos</h2>
          </div>
          <Button asChild variant="ghost" size="sm" className="h-9 rounded-full px-3 text-xs">
            <Link to="/app/agenda">Ver Agenda Completa</Link>
          </Button>
        </div>
        <div className="border-t">
          {loading ? (
            <div className="space-y-2 p-3">
              {Array.from({ length: 3 }).map((_, index) => (
                <Skeleton key={index} className="h-14 w-full rounded-xl" />
              ))}
            </div>
          ) : upcomingAppointments.length > 0 ? (
            upcomingAppointments.map((item) => (
              <Link
                key={item.id}
                to="/app/agenda"
                className="flex min-h-16 items-center gap-3 border-b px-4 py-3 last:border-b-0 active:bg-muted"
              >
                <span className="w-12 shrink-0 text-sm font-semibold tabular-nums">
                  {item.time}
                </span>
                <span className={`h-9 w-1 shrink-0 rounded-full ${item.color}`} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{item.client}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {item.service} · {item.professional}
                  </span>
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              </Link>
            ))
          ) : (
            <div className="p-4">
              <PositiveEmptyState
                title="Sem outros horários próximos"
                description="A agenda completa continua disponível a qualquer momento."
              />
            </div>
          )}
        </div>
      </section>

      <section className={cardClass}>
        <SectionHeading
          eyebrow={periodLabel}
          title="Indicadores de desempenho"
          icon={<BarChart3 className="h-4 w-4" />}
        />
        <div className="grid grid-cols-2 border-t">
          <PerformanceMetric
            label="Ocupação"
            value={`${Math.round(data?.occupancyRate ?? 0)}%`}
            loading={loading}
            helper={
              <Progress
                value={Math.min(100, Math.max(0, data?.occupancyRate ?? 0))}
                className="mt-2 h-1.5"
              />
            }
            icon={<Users className="h-4 w-4" />}
          />
          <PerformanceMetric
            label="Tempo médio"
            value={`${Math.round(data?.averageServiceMinutes ?? 0)} min`}
            loading={loading}
            icon={<Timer className="h-4 w-4" />}
          />
          <PerformanceMetric
            label="Cancelamentos"
            value={`${Math.round(data?.cancellations?.rate ?? 0)}%`}
            loading={loading}
            icon={<AlertTriangle className="h-4 w-4" />}
          />
          <PerformanceMetric
            label="Faturamento"
            value={brl(data?.periodRevenue)}
            loading={loading}
            icon={<CircleDollarSign className="h-4 w-4" />}
          />
        </div>
      </section>

      <div>
        <button
          type="button"
          onClick={() => setFiltersOpen((current) => !current)}
          className="flex h-12 w-full items-center justify-between rounded-2xl border bg-card px-4 text-left transition-colors active:bg-muted"
          aria-expanded={filtersOpen}
        >
          <span className="flex min-w-0 items-center gap-3">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
              <Filter className="h-4 w-4" />
            </span>
            <span className="min-w-0">
              <span className="block text-xs text-muted-foreground">Período e filtros</span>
              <span className="block truncate text-sm font-semibold">{periodLabel}</span>
            </span>
          </span>
          <ChevronRight
            className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${filtersOpen ? "rotate-90" : ""}`}
          />
        </button>
        {filtersOpen ? <div className="mt-3">{filtersContent}</div> : null}
      </div>
    </div>
  );
}

function SectionHeading({
  eyebrow,
  title,
  icon,
}: {
  eyebrow: string;
  title: string;
  icon: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 p-4">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary">
          {eyebrow}
        </p>
        <h2 className="mt-1 text-base font-semibold tracking-tight">{title}</h2>
      </div>
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
        {icon}
      </span>
    </div>
  );
}

function OperationMetric({
  label,
  value,
  loading,
  icon,
  danger = false,
}: {
  label: string;
  value: number;
  loading: boolean;
  icon: ReactNode;
  danger?: boolean;
}) {
  return (
    <Link
      to="/app/agenda"
      className="min-h-24 border-b border-r p-3.5 transition-colors even:border-r-0 nth-[n+3]:border-b-0 active:bg-muted"
    >
      <div
        className={`flex items-center gap-2 text-xs ${danger ? "text-red-600" : "text-muted-foreground"}`}
      >
        {icon}
        <span>{label}</span>
      </div>
      {loading ? (
        <Skeleton className="mt-3 h-7 w-10" />
      ) : (
        <div className={`mt-2 text-2xl font-semibold ${danger ? "text-red-600" : ""}`}>{value}</div>
      )}
    </Link>
  );
}

function FinancialMetric({
  label,
  value,
  loading,
}: {
  label: string;
  value: string;
  loading: boolean;
}) {
  return (
    <div className="min-w-0 bg-card px-2.5 py-4 text-center">
      <div className="truncate text-[10px] font-medium text-muted-foreground">{label}</div>
      {loading ? (
        <Skeleton className="mx-auto mt-2 h-5 w-16" />
      ) : (
        <div className="mt-1 truncate text-sm font-semibold tracking-tight">{value}</div>
      )}
    </div>
  );
}

function PerformanceMetric({
  label,
  value,
  loading,
  icon,
  helper,
}: {
  label: string;
  value: string;
  loading: boolean;
  icon: ReactNode;
  helper?: ReactNode;
}) {
  return (
    <div className="min-h-28 border-b border-r p-3.5 even:border-r-0 nth-[n+3]:border-b-0">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {icon}
        <span>{label}</span>
      </div>
      {loading ? (
        <Skeleton className="mt-3 h-6 w-20" />
      ) : (
        <div className="mt-2 text-lg font-semibold">{value}</div>
      )}
      {helper}
    </div>
  );
}

function PositiveEmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-2xl bg-emerald-500/8 px-4 py-5 text-center">
      <CheckCircle2 className="mx-auto h-6 w-6 text-emerald-600" />
      <p className="mt-2 text-sm font-semibold">{title}</p>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{description}</p>
    </div>
  );
}

function alertDot(tone: string) {
  if (tone === "danger") return "bg-red-500";
  if (tone === "warning") return "bg-amber-500";
  if (tone === "success") return "bg-emerald-500";
  if (tone === "info") return "bg-blue-500";
  return "bg-muted-foreground";
}

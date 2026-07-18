import { Banknote, CalendarCheck2, CalendarDays, Crown, WalletCards } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { brl } from "@/lib/format";

export type RevenueForecastDay = {
  date: string;
  label: string;
  appointmentRevenue: number;
  subscriptionRevenue: number;
  otherReceivables: number;
  total: number;
  appointmentCount: number;
  vipCount: number;
};

export type RevenueForecastData = {
  periodLabel?: string;
  total: number;
  appointmentRevenue: number;
  subscriptionRevenue: number;
  otherReceivables: number;
  appointmentCount: number;
  vipCount: number;
  vipListValue: number;
  tomorrowRevenue: number;
  days: RevenueForecastDay[];
};

type RevenueForecastProps = {
  data?: RevenueForecastData | null;
  loading?: boolean;
};

const emptyForecast: RevenueForecastData = {
  total: 0,
  appointmentRevenue: 0,
  subscriptionRevenue: 0,
  otherReceivables: 0,
  appointmentCount: 0,
  vipCount: 0,
  vipListValue: 0,
  tomorrowRevenue: 0,
  days: [],
};

export function RevenueForecast({ data, loading = false }: RevenueForecastProps) {
  const forecast = data ?? emptyForecast;
  const periodLabel = forecast.periodLabel ?? "Próximos 7 dias";
  const hasDailyForecast = forecast.days.some((day) => day.total > 0);

  return (
    <Card className="overflow-hidden rounded-[1.7rem] border bg-card shadow-sm">
      <CardContent className="space-y-6 p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.22em] text-primary">
              <CalendarDays className="h-4 w-4" />
              {periodLabel}
            </div>
            <h2 className="mt-2 text-xl font-semibold">Previsão de faturamento</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Valores agendados ou com vencimento no período. A previsão ainda não representa
              dinheiro recebido.
            </p>
          </div>
          <Badge
            variant="outline"
            className="w-fit border-amber-300 bg-amber-50 px-3 py-1 text-amber-700"
          >
            Previsto, não recebido
          </Badge>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <ForecastMetric
            label="Total previsto"
            value={brl(forecast.total)}
            helper="Soma dos recebimentos esperados"
            icon={Banknote}
            loading={loading}
            tone="primary"
          />
          <ForecastMetric
            label="Previsto para amanhã"
            value={brl(forecast.tomorrowRevenue)}
            helper="Somente o próximo dia"
            icon={CalendarCheck2}
            loading={loading}
            tone="warning"
          />
          <ForecastMetric
            label="Agendamentos"
            value={String(forecast.appointmentCount)}
            helper="Atendimentos cobrados no período"
            icon={CalendarDays}
            loading={loading}
            tone="blue"
          />
          <ForecastMetric
            label="Atendimentos VIP"
            value={String(forecast.vipCount)}
            helper={`${brl(forecast.vipListValue)} em valor de tabela`}
            icon={Crown}
            loading={loading}
            tone="purple"
          />
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <CompositionMetric
            label="Atendimentos cobrados"
            value={forecast.appointmentRevenue}
            color="bg-primary"
            loading={loading}
          />
          <CompositionMetric
            label="Assinaturas a receber"
            value={forecast.subscriptionRevenue}
            color="bg-emerald-500"
            loading={loading}
          />
          <CompositionMetric
            label="Outros recebíveis"
            value={forecast.otherReceivables}
            color="bg-violet-500"
            loading={loading}
          />
        </div>

        <div className="rounded-2xl border bg-muted/15 p-4 sm:p-5">
          <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-sm font-semibold">Previsão por dia</h3>
              <p className="text-xs text-muted-foreground">
                Composição diária dos valores esperados.
              </p>
            </div>
            <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground sm:mt-0">
              <WalletCards className="h-4 w-4" />
              Sem misturar valores já realizados
            </div>
          </div>

          {loading ? (
            <Skeleton className="h-[280px] w-full rounded-2xl" />
          ) : forecast.days.length === 0 || !hasDailyForecast ? (
            <div className="grid h-[220px] place-items-center rounded-2xl border border-dashed bg-background/60 px-6 text-center">
              <div>
                <CalendarDays className="mx-auto mb-2 h-8 w-8 text-muted-foreground/50" />
                <p className="text-sm font-medium">
                  Nenhum valor previsto para {periodLabel.toLocaleLowerCase("pt-BR")}.
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Novos agendamentos e recebíveis aparecerão aqui automaticamente.
                </p>
              </div>
            </div>
          ) : (
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={forecast.days} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.35} />
                  <XAxis dataKey="label" fontSize={11} axisLine={false} tickLine={false} />
                  <YAxis
                    fontSize={11}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={compactCurrency}
                  />
                  <Tooltip
                    formatter={(value: number | string, name: string) => [brl(Number(value)), name]}
                    labelFormatter={(_, payload) => {
                      const day = payload?.[0]?.payload as RevenueForecastDay | undefined;
                      if (!day) return "";
                      const appointments = `${day.appointmentCount} agendamento${day.appointmentCount === 1 ? "" : "s"}`;
                      const vip = day.vipCount > 0 ? ` · ${day.vipCount} VIP` : "";
                      return `${day.label} · ${appointments}${vip}`;
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar
                    dataKey="appointmentRevenue"
                    name="Atendimentos"
                    stackId="forecast"
                    fill="var(--primary)"
                    radius={[0, 0, 0, 0]}
                  />
                  <Bar
                    dataKey="subscriptionRevenue"
                    name="Assinaturas"
                    stackId="forecast"
                    fill="#10b981"
                    radius={[0, 0, 0, 0]}
                  />
                  <Bar
                    dataKey="otherReceivables"
                    name="Outros recebíveis"
                    stackId="forecast"
                    fill="#8b5cf6"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-violet-500/20 bg-violet-500/5 px-4 py-3 text-xs text-muted-foreground">
          <span className="font-semibold text-foreground">Sobre os atendimentos VIP:</span>{" "}
          {forecast.vipCount > 0
            ? `${forecast.vipCount} atendimento${forecast.vipCount === 1 ? "" : "s"} somam ${brl(forecast.vipListValue)} em valor de tabela, mas não foram adicionados ao caixa previsto quando cobertos pela assinatura.`
            : "nenhum atendimento coberto por assinatura foi identificado neste período."}
        </div>
      </CardContent>
    </Card>
  );
}

function ForecastMetric({
  label,
  value,
  helper,
  icon: Icon,
  loading,
  tone,
}: {
  label: string;
  value: string;
  helper: string;
  icon: typeof Banknote;
  loading: boolean;
  tone: "primary" | "warning" | "blue" | "purple";
}) {
  const tones = {
    primary: "bg-primary/10 text-primary",
    warning: "bg-amber-500/15 text-amber-600",
    blue: "bg-blue-500/10 text-blue-600",
    purple: "bg-violet-500/10 text-violet-600",
  };

  return (
    <div className="rounded-2xl border bg-background/70 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
            {label}
          </div>
          {loading ? (
            <Skeleton className="mt-3 h-7 w-28" />
          ) : (
            <div className="mt-2 text-xl font-semibold tracking-tight">{value}</div>
          )}
        </div>
        <div className={`rounded-xl p-2.5 ${tones[tone]}`}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      {loading ? (
        <Skeleton className="mt-3 h-3 w-full" />
      ) : (
        <p className="mt-3 text-xs text-muted-foreground">{helper}</p>
      )}
    </div>
  );
}

function CompositionMetric({
  label,
  value,
  color,
  loading,
}: {
  label: string;
  value: number;
  color: string;
  loading: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border bg-background/60 px-4 py-3">
      <div className="flex min-w-0 items-center gap-3">
        <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${color}`} />
        <span className="truncate text-xs text-muted-foreground">{label}</span>
      </div>
      {loading ? (
        <Skeleton className="h-5 w-20" />
      ) : (
        <span className="whitespace-nowrap text-sm font-semibold">{brl(value)}</span>
      )}
    </div>
  );
}

function compactCurrency(value: number) {
  if (Math.abs(value) >= 1_000_000) return `R$ ${(value / 1_000_000).toFixed(1)} mi`;
  if (Math.abs(value) >= 1_000) return `R$ ${(value / 1_000).toFixed(0)} mil`;
  return `R$ ${Math.round(value)}`;
}

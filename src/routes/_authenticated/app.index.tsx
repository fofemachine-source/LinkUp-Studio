import { createFileRoute, Navigate, redirect } from "@tanstack/react-router";
import { useCurrentTenant, useUserRole } from "@/hooks/use-tenant";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { brl } from "@/lib/format";
import { TrendingUp, DollarSign, Users, Award, Copy, Plus, UserPlus, Link2, Calendar } from "lucide-react";
import { toast } from "sonner";
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid, Area, AreaChart } from "recharts";
import { format, subDays, startOfDay, endOfDay, startOfMonth } from "date-fns";
import { ptBR } from "date-fns/locale";

export const Route = createFileRoute("/_authenticated/app/")({
  beforeLoad: async () => {
    const { data: userRes } = await supabase.auth.getUser();
    const uid = userRes.user?.id;
    if (!uid) throw redirect({ to: "/auth" });

    const { data: profile } = await supabase.from("profiles").select("active_tenant_id").eq("id", uid).maybeSingle();
    const { data: roles } = await supabase.from("user_roles").select("tenant_id, role").eq("user_id", uid);
    const tenantId = profile?.active_tenant_id ?? roles?.find((r) => r.tenant_id)?.tenant_id;
    if (!tenantId) return;

    const { data: userRole } = await supabase.from("user_roles").select("role").eq("user_id", uid).eq("tenant_id", tenantId).maybeSingle();
    if (userRole?.role === "barber") {
      throw redirect({ to: "/app/agenda" });
    }
  },
  component: PainelGeral,
});

function PainelGeral() {
  const { data: tenant } = useCurrentTenant();
  const tenantId = tenant?.id;
  const { data: role, isLoading: roleLoading } = useUserRole(tenantId);

  if (!roleLoading && role === "barber") {
    return <Navigate to="/app/agenda" replace />;
  }

  const bookingSlug = tenant?.slug || "ernesth";
  const bookingLink = typeof window !== "undefined"
    ? `${window.location.origin}/booking/${bookingSlug}`
    : `https://barber-pro-plus.lovable.app/booking/${bookingSlug}`;

  const { data: stats } = useQuery({
    queryKey: ["dashboard-stats", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const today = new Date();
      const dayStart = startOfDay(today).toISOString();
      const dayEnd = endOfDay(today).toISOString();
      const monthStart = startOfMonth(today).toISOString();

      const [
        { data: dayCmds },
        { data: monthCmds },
        { data: allApptsToday },
        { data: commPending },
        { data: services },
        { data: products },
        { data: completedAppts }
      ] = await Promise.all([
        supabase.from("commandas").select("total").eq("tenant_id", tenantId!).eq("status", "closed").gte("closed_at", dayStart).lte("closed_at", dayEnd),
        supabase.from("commandas").select("total").eq("tenant_id", tenantId!).eq("status", "closed").gte("closed_at", monthStart),
        supabase.from("appointments").select("id").eq("tenant_id", tenantId!).gte("start_at", dayStart).lte("start_at", dayEnd),
        supabase.from("commanda_items").select("commission_value").eq("tenant_id", tenantId!).eq("commission_status", "pending"),
        supabase.from("services").select("*").eq("tenant_id", tenantId!),
        supabase.from("products").select("*").eq("tenant_id", tenantId!),
        supabase.from("appointments").select("*, professionals(commission_pct)").eq("tenant_id", tenantId!).eq("status", "completed").gte("start_at", monthStart)
      ]);

      const svcList = services ?? [];
      const prodList = products ?? [];

      function getApptTotal(appt: any) {
        let total = 0;
        const mainSvc = svcList.find(s => s.id === appt.service_id);
        total += Number(mainSvc?.price || 0);

        if (appt.notes && appt.notes.includes("Serviços: ")) {
          const svcPart = appt.notes.split("Serviços: ")[1];
          if (svcPart) {
            const names = svcPart.split(" | ")[0].split(", ").map((s: string) => s.trim().toLowerCase());
            names.forEach((name: string) => {
              const svc = svcList.find(s => (s.name || "").trim().toLowerCase() === name);
              if (svc) total += Number(svc.price || 0);
            });
          }
        }

        if (appt.notes && appt.notes.includes("Produtos: ")) {
          const prodPart = appt.notes.split("Produtos: ")[1];
          if (prodPart) {
            const names = prodPart.split(" | ")[0].split(", ").map((s: string) => s.trim().toLowerCase());
            names.forEach((name: string) => {
              const prod = prodList.find(p => (p.name || "").trim().toLowerCase() === name);
              if (prod) total += Number(prod.price || 0);
            });
          }
        }
        return total;
      }

      function getApptCommission(appt: any) {
        const pct = appt.professionals?.commission_pct ?? 0;
        let servicesVal = 0;
        const mainSvc = svcList.find(s => s.id === appt.service_id);
        servicesVal += Number(mainSvc?.price || 0);

        if (appt.notes && appt.notes.includes("Serviços: ")) {
          const svcPart = appt.notes.split("Serviços: ")[1];
          if (svcPart) {
            const names = svcPart.split(" | ")[0].split(", ").map((s: string) => s.trim().toLowerCase());
            names.forEach((name: string) => {
              const svc = svcList.find(s => (s.name || "").trim().toLowerCase() === name);
              if (svc) servicesVal += Number(svc.price || 0);
            });
          }
        }
        return (servicesVal * pct) / 100;
      }

      const apptsToday = (completedAppts ?? []).filter(a => new Date(a.start_at) >= new Date(dayStart) && new Date(a.start_at) <= new Date(dayEnd));
      const apptRevenueToday = apptsToday.reduce((acc, a) => acc + getApptTotal(a), 0);
      const apptRevenueMonth = (completedAppts ?? []).reduce((acc, a) => acc + getApptTotal(a), 0);

      const apptCommPending = (completedAppts ?? [])
        .filter(a => !(a.notes && a.notes.includes("Comissão: paid")))
        .reduce((acc, a) => acc + getApptCommission(a), 0);

      // last 7 days revenue
      const daysPromises = [];
      for (let i = 6; i >= 0; i--) {
        const d = subDays(today, i);
        const s = startOfDay(d).toISOString();
        const e = endOfDay(d).toISOString();
        daysPromises.push(
          supabase.from("commandas").select("total").eq("tenant_id", tenantId!).eq("status", "closed").gte("closed_at", s).lte("closed_at", e).then(({ data }) => {
            const cmdRev = (data ?? []).reduce((a, b: any) => a + Number(b.total || 0), 0);
            const apptRev = (completedAppts ?? [])
              .filter(a => new Date(a.start_at) >= new Date(s) && new Date(a.start_at) <= new Date(e))
              .reduce((acc, a) => acc + getApptTotal(a), 0);
            return { d: format(d, "dd/MM"), v: cmdRev + apptRev, order: -i };
          })
        );
      }
      const daysResults = await Promise.all(daysPromises);
      const days = daysResults.sort((a, b) => a.order - b.order).map(x => ({ d: x.d, v: x.v }));

      return {
        today: (dayCmds ?? []).reduce((a, b: any) => a + Number(b.total || 0), 0) + apptRevenueToday,
        month: (monthCmds ?? []).reduce((a, b: any) => a + Number(b.total || 0), 0) + apptRevenueMonth,
        appointments: allApptsToday?.length ?? 0,
        pendingCommission: (commPending ?? []).reduce((a, b: any) => a + Number(b.commission_value || 0), 0) + apptCommPending,
        chart: days,
      };
    },
  });

  const { data: upcoming } = useQuery({
    queryKey: ["upcoming-appts", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data } = await supabase.from("appointments")
        .select("id, start_at, client_name, professionals(full_name), services(name)")
        .eq("tenant_id", tenantId!).gte("start_at", new Date().toISOString()).order("start_at").limit(5);
      return data ?? [];
    },
  });

  return (
    <div className="space-y-6 max-w-[1400px] mx-auto">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Painel Geral</h1>
          <p className="text-muted-foreground mt-1">Bem-vindo de volta! Aqui está o resumo da sua barbearia hoje.</p>
        </div>

      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="FATURAMENTO HOJE" value={brl(stats?.today)} icon={TrendingUp} tone="info" />
        <StatCard title="FATURAMENTO MÊS" value={brl(stats?.month)} icon={DollarSign} tone="success" />
        <StatCard title="ATENDIMENTOS HOJE" value={String(stats?.appointments ?? 0)} icon={Users} tone="accent" />
        <StatCard title="COMISSÕES PENDENTES" value={brl(stats?.pendingCommission)} icon={Award} tone="warning" />
      </div>

      <Card className="premium-card">
        <CardContent className="p-6">
          <div className="flex items-center gap-2 text-primary text-xs font-semibold uppercase tracking-wide mb-2">
            <span className="h-2 w-2 rounded-full bg-primary animate-pulse" /> <Link2 className="h-3 w-3" /> Link de agendamento online
          </div>
          <h3 className="text-lg font-semibold">Compartilhe o link de reserva exclusivo com seus clientes para que eles agendem pelo celular!</h3>
          <p className="text-xs text-muted-foreground mt-1">O sistema aplica automaticamente as regras VIP e limites da sua agenda.</p>
          <div className="mt-4 flex flex-col md:flex-row gap-2">
            <Input readOnly value={bookingLink} className="font-mono text-xs" />
            <Button onClick={() => { navigator.clipboard.writeText(bookingLink); toast.success("Link copiado!"); }} disabled={!bookingLink}>
              <Copy className="h-4 w-4 mr-2" /> COPIAR
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 premium-card">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold">Faturamento últimos 7 dias</h3>
                <p className="text-xs text-muted-foreground">Visão consolidada de entradas líquidas diárias</p>
              </div>
              <span className="text-xs bg-primary/10 text-primary px-3 py-1 rounded-full font-medium">HISTÓRICO REAL</span>
            </div>
            <div className="h-72 mt-6">
              <ResponsiveContainer>
                <AreaChart data={stats?.chart ?? []}>
                  <defs>
                    <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} vertical={false} />
                  <XAxis dataKey="d" fontSize={11} axisLine={false} tickLine={false} />
                  <YAxis fontSize={11} axisLine={false} tickLine={false} tickFormatter={(v) => `R$ ${v}`} />
                  <Tooltip formatter={(v: any) => brl(v)} />
                  <Area type="monotone" dataKey="v" stroke="var(--primary)" strokeWidth={2.5} fill="url(#g)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="premium-card">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold">Próximos Agendamentos</h3>
              <button className="text-xs text-primary font-medium">Ver todos</button>
            </div>
            {(!upcoming || upcoming.length === 0) ? (
              <div className="border border-dashed rounded-xl p-8 text-center text-sm text-muted-foreground">
                <Calendar className="h-10 w-10 mx-auto mb-2 opacity-40" />
                nenhum agendamento futuro
              </div>
            ) : (
              <ul className="space-y-3">
                {upcoming.map((a: any) => (
                  <li key={a.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50">
                    <div className="stat-icon bg-primary/10 text-primary text-xs font-semibold">{format(new Date(a.start_at), "HH:mm")}</div>
                    <div className="min-w-0 flex-1">
                      <div className="font-medium truncate">{a.client_name}</div>
                      <div className="text-xs text-muted-foreground truncate">{a.services?.name} • {a.professionals?.full_name}</div>
                    </div>
                    <div className="text-xs text-muted-foreground">{format(new Date(a.start_at), "dd/MM", { locale: ptBR })}</div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StatCard({ title, value, icon: Icon, tone }: { title: string; value: string; icon: any; tone: "info" | "success" | "warning" | "accent" }) {
  const tones: Record<string, string> = {
    info: "bg-info/10 text-info",
    success: "bg-success/10 text-success",
    warning: "bg-warning/15 text-[oklch(0.55_0.15_60)]",
    accent: "bg-primary/10 text-primary",
  };
  return (
    <Card className="premium-card">
      <CardContent className="p-5 flex items-center gap-4">
        <div className={`stat-icon ${tones[tone]}`}><Icon className="h-5 w-5" /></div>
        <div>
          <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">{title}</div>
          <div className="text-xl font-semibold mt-0.5">{value}</div>
        </div>
      </CardContent>
    </Card>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent } from "@/components/ui/card";
import { useCurrentTenant } from "@/hooks/use-tenant";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { BarChart3, TrendingUp } from "lucide-react";
import { brl } from "@/lib/format";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, CartesianGrid, Tooltip } from "recharts";
import { format, subDays, startOfDay, endOfDay } from "date-fns";

export const Route = createFileRoute("/_authenticated/app/relatorios")({ component: RelPage });

function RelPage() {
  const tenantId = useCurrentTenant().data?.id;
  const { data } = useQuery({
    queryKey: ["report-30", tenantId], enabled: !!tenantId,
    queryFn: async () => {
      const startDate = subDays(startOfDay(new Date()), 29).toISOString();
      const endDate = endOfDay(new Date()).toISOString();

      const [
        { data: commandas },
        { data: appointments },
        { data: services },
        { data: products }
      ] = await Promise.all([
        supabase.from("commandas").select("total, closed_at").eq("tenant_id", tenantId!).eq("status", "closed").gte("closed_at", startDate).lte("closed_at", endDate),
        supabase.from("appointments").select("*").eq("tenant_id", tenantId!).eq("status", "completed").gte("start_at", startDate).lte("start_at", endDate),
        supabase.from("services").select("*").eq("tenant_id", tenantId!),
        supabase.from("products").select("*").eq("tenant_id", tenantId!)
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

      const days: any[] = [];
      for (let i = 29; i >= 0; i--) {
        const d = subDays(new Date(), i);
        const dayS = startOfDay(d);
        const dayE = endOfDay(d);

        const dayCmds = (commandas ?? []).filter(c => new Date(c.closed_at!) >= dayS && new Date(c.closed_at!) <= dayE);
        const dayAppts = (appointments ?? []).filter(a => new Date(a.start_at) >= dayS && new Date(a.start_at) <= dayE);

        const cmdTotal = dayCmds.reduce((a, b) => a + Number(b.total || 0), 0);
        const apptTotal = dayAppts.reduce((a, b) => a + getApptTotal(b), 0);

        days.push({ d: format(d, "dd/MM"), v: cmdTotal + apptTotal });
      }
      return days;
    },
  });
  const total = (data ?? []).reduce((a:number,b:any)=>a+b.v,0);
  return (<div className="space-y-6 max-w-[1400px] mx-auto">
    <div><h1 className="text-3xl font-semibold flex items-center gap-2"><BarChart3 className="h-7 w-7 text-primary"/>Relatórios</h1><p className="text-muted-foreground">Últimos 30 dias.</p></div>
    <Card><CardContent className="p-6">
      <div className="flex items-center gap-2 mb-2"><TrendingUp className="h-5 w-5 text-primary"/><h3 className="font-semibold">Faturamento diário</h3><span className="ml-auto text-2xl font-semibold text-primary">{brl(total)}</span></div>
      <div className="h-80"><ResponsiveContainer><BarChart data={data ?? []}>
        <CartesianGrid strokeDasharray="3 3" opacity={0.3} vertical={false}/>
        <XAxis dataKey="d" fontSize={11}/><YAxis fontSize={11} tickFormatter={(v)=>`R$${v}`}/><Tooltip formatter={(v:any)=>brl(v)}/>
        <Bar dataKey="v" fill="var(--primary)" radius={[6,6,0,0]}/>
      </BarChart></ResponsiveContainer></div>
    </CardContent></Card>
  </div>);
}

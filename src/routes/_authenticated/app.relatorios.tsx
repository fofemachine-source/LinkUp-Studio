import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent } from "@/components/ui/card";
import { useCurrentTenant, useUserRole } from "@/hooks/use-tenant";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { BarChart3, TrendingUp, Scissors, Award, Calendar, DollarSign, UserCheck, ShieldAlert, Sparkles, Clock, Users } from "lucide-react";
import { brl } from "@/lib/format";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, CartesianGrid, Tooltip } from "recharts";
import { format, subDays, startOfDay, endOfDay, startOfMonth } from "date-fns";
import { useState, useMemo, useEffect } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/app/relatorios")({ component: RelPage });

function RelPage() {
  const tenantId = useCurrentTenant().data?.id;
  const { data: role } = useUserRole(tenantId);
  const isPro = role === "barber";
  const isAdmin = role === "owner" || role === "staff" || role === "super_admin";

  const [period, setPeriod] = useState<"today" | "month" | "30days">("30days");
  const [selectedProId, setSelectedProId] = useState<string>("all");
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUserId(data.user?.id ?? null);
    });
  }, []);

  // Load current professional ID if the logged-in user is a pro (barber)
  const { data: myPro } = useQuery({
    queryKey: ["my-pro-report", tenantId, userId],
    enabled: !!tenantId && !!userId && isPro,
    queryFn: async () => {
      return (await supabase.from("professionals").select("*").eq("auth_user_id", userId!).maybeSingle()).data;
    }
  });

  const { data: reportData, isLoading } = useQuery({
    queryKey: ["report-dashboard", tenantId, period, selectedProId, isPro, myPro?.id],
    enabled: !!tenantId && (!isPro || !!myPro),
    queryFn: async () => {
      // Set date range based on period
      let startDateStr = "";
      const now = new Date();
      if (period === "today") {
        startDateStr = startOfDay(now).toISOString();
      } else if (period === "month") {
        startDateStr = startOfMonth(now).toISOString();
      } else {
        startDateStr = subDays(startOfDay(now), 29).toISOString();
      }
      const endDateStr = endOfDay(now).toISOString();

      // Determine professional filter
      let proFilter = selectedProId;
      if (isPro && myPro) {
        proFilter = myPro.id;
      }

      // Fetch appointments, commandas, professionals, services, subscribers
      const [
        { data: allAppts },
        { data: commandas },
        { data: pros },
        { data: services },
        { data: subscribers }
      ] = await Promise.all([
        supabase.from("appointments").select("*, services(id,name,price,duration_min), clients(id,full_name,is_subscriber)").eq("tenant_id", tenantId!).eq("status", "completed"),
        supabase.from("commandas").select("*, commanda_items(*)").eq("tenant_id", tenantId!).eq("status", "closed").gte("closed_at", startDateStr).lte("closed_at", endDateStr),
        supabase.from("professionals").select("*").eq("tenant_id", tenantId!),
        supabase.from("services").select("*").eq("tenant_id", tenantId!),
        supabase.from("subscribers").select("*").eq("tenant_id", tenantId!)
      ]);

      return {
        allAppts: allAppts ?? [],
        commandas: commandas ?? [],
        pros: pros ?? [],
        services: services ?? [],
        subscribers: subscribers ?? [],
        startDateStr,
        endDateStr,
        proFilter
      };
    }
  });

  const processed = useMemo(() => {
    if (!reportData) return null;
    const { allAppts, commandas, pros, services, subscribers, startDateStr, endDateStr, proFilter } = reportData;

    // Filter appointments in selected period
    const startRange = new Date(startDateStr);
    const endRange = new Date(endDateStr);

    let periodAppts = allAppts.filter(a => new Date(a.start_at) >= startRange && new Date(a.start_at) <= endRange);
    const linkedAppointmentIds = new Set(commandas.map((cmd: any) => cmd.appointment_id).filter(Boolean));

    // Apply professional filter
    if (proFilter !== "all") {
      periodAppts = periodAppts.filter(a => a.professional_id === proFilter);
    }

    // Daily billing chart data
    const chartData: { d: string; v: number }[] = [];
    const daysCount = period === "today" ? 1 : period === "month" ? new Date().getDate() : 30;

    for (let i = daysCount - 1; i >= 0; i--) {
      const d = subDays(new Date(), i);
      const dayS = startOfDay(d);
      const dayE = endOfDay(d);

      // Filter commandas closed in this day
      let dayCmds = commandas.filter(c => new Date(c.closed_at!) >= dayS && new Date(c.closed_at!) <= dayE);
      
      // Filter appointments on this day (that don't have associated commandas, to avoid double counting)
      let dayAppts = periodAppts.filter(a => {
        const apptDate = new Date(a.start_at);
        return apptDate >= dayS
          && apptDate <= dayE
          && !linkedAppointmentIds.has(a.id)
          && !(a.notes && a.notes.includes("Comanda ID:"));
      });

      // Apply pro filter to commandas (by checking items)
      if (proFilter !== "all") {
        dayCmds = dayCmds.map(c => {
          const proItems = c.commanda_items?.filter((item: any) => item.professional_id === proFilter) ?? [];
          const total = proItems.reduce((acc: number, item: any) => acc + (Number(item.unit_price) * item.quantity), 0);
          return { ...c, total };
        });
      }

      const cmdTotal = dayCmds.reduce((acc, c) => acc + Number(c.total || 0), 0);
      
      // Calculate appointment totals
      const apptTotal = dayAppts.reduce((acc, appt) => {
        let val = Number(appt.services?.price || 0);
        // Add additional services from notes
        if (appt.notes && appt.notes.includes("Serviços: ")) {
          const svcPart = appt.notes.split("Serviços: ")[1];
          if (svcPart) {
            const names = svcPart.split(" | ")[0].split(", ").map((s: string) => s.trim().toLowerCase());
            names.forEach((name: string) => {
              const matchedSvc = services.find((s: any) => (s.name || "").trim().toLowerCase() === name);
              if (matchedSvc) val += Number(matchedSvc.price || 0);
            });
          }
        }
        return acc + val;
      }, 0);

      chartData.push({
        d: format(d, "dd/MM"),
        v: cmdTotal + apptTotal
      });
    }

    const totalFaturamento = chartData.reduce((acc, item) => acc + item.v, 0);

    // 1. Professional Performance list
    const proPerformance = pros.map(pro => {
      // Filter appointments for this professional in the period
      const proAppts = periodAppts.filter(a => a.professional_id === pro.id);
      
      // Filter commandas closed in the period containing items done by this professional
      const proCmdsItems = commandas.flatMap(c => 
        (c.commanda_items ?? []).filter((item: any) => item.professional_id === pro.id)
      );

      const apptTotalValue = proAppts.filter(a => !linkedAppointmentIds.has(a.id) && !(a.notes && a.notes.includes("Comanda ID:"))).reduce((acc, appt) => {
        let val = Number(appt.services?.price || 0);
        if (appt.notes && appt.notes.includes("Serviços: ")) {
          const svcPart = appt.notes.split("Serviços: ")[1];
          if (svcPart) {
            const names = svcPart.split(" | ")[0].split(", ").map((s: string) => s.trim().toLowerCase());
            names.forEach((name: string) => {
              const matchedSvc = services.find((s: any) => (s.name || "").trim().toLowerCase() === name);
              if (matchedSvc) val += Number(matchedSvc.price || 0);
            });
          }
        }
        return acc + val;
      }, 0);

      const cmdTotalValue = proCmdsItems.reduce((acc, item) => acc + (Number(item.unit_price) * Number(item.quantity ?? 1)), 0);
      const totalGenerated = apptTotalValue + cmdTotalValue;

      // Calculate commissions
      const pct = pro.commission_pct ?? 45;
      const commissionGenerated = proCmdsItems.reduce((acc, item) => acc + Number(item.commission_value || 0), 0) + (apptTotalValue * pct) / 100;

      // Count services (main + extra)
      let servicesCount = proAppts.length;
      proAppts.forEach(a => {
        if (a.notes && a.notes.includes("Serviços: ")) {
          const svcPart = a.notes.split("Serviços: ")[1];
          if (svcPart) {
            const names = svcPart.split(" | ")[0].split(", ").map((s: string) => s.trim().toLowerCase());
            servicesCount += names.length;
          }
        }
      });

      return {
        id: pro.id,
        name: pro.full_name,
        role: pro.role_label ?? "Barbeiro",
        appointmentsCount: proAppts.length,
        servicesCount,
        totalGenerated,
        commissionGenerated
      };
    });

    // 2. Services Rank (most performed services)
    const serviceRanking: Record<string, { name: string; count: number; value: number }> = {};
    
    periodAppts.forEach(appt => {
      const svc = appt.services;
      if (svc) {
        if (!serviceRanking[svc.id]) {
          serviceRanking[svc.id] = { name: svc.name, count: 0, value: 0 };
        }
        serviceRanking[svc.id].count += 1;
        serviceRanking[svc.id].value += Number(svc.price || 0);
      }

      // Check for extra services in notes
      if (appt.notes && appt.notes.includes("Serviços: ")) {
        const svcPart = appt.notes.split("Serviços: ")[1];
        if (svcPart) {
          const names = svcPart.split(" | ")[0].split(", ").map((s: string) => s.trim().toLowerCase());
          names.forEach((name: string) => {
            const matchedSvc = services.find((s: any) => (s.name || "").trim().toLowerCase() === name);
            if (matchedSvc) {
              if (!serviceRanking[matchedSvc.id]) {
                serviceRanking[matchedSvc.id] = { name: matchedSvc.name, count: 0, value: 0 };
              }
              serviceRanking[matchedSvc.id].count += 1;
              serviceRanking[matchedSvc.id].value += Number(matchedSvc.price || 0);
            }
          });
        }
      }
    });

    // Add commanda services if any
    commandas.forEach(c => {
      (c.commanda_items ?? []).forEach((item: any) => {
        if (item.kind === "service") {
          if (!serviceRanking[item.ref_id]) {
            const matchedSvc = services.find((s: any) => s.id === item.ref_id);
            serviceRanking[item.ref_id] = { name: item.name || matchedSvc?.name || "Serviço", count: 0, value: 0 };
          }
          serviceRanking[item.ref_id].count += item.quantity;
          serviceRanking[item.ref_id].value += Number(item.unit_price) * item.quantity;
        }
      });
    });

    const servicesRankList = Object.values(serviceRanking).sort((a, b) => b.count - a.count);

    // 3. Client Last Services (Date of last appointment)
    const clientLastServiceMap: Record<string, { name: string; isSubscriber: boolean; lastService: string; lastDate: string }> = {};

    allAppts.forEach(appt => {
      const clientName = appt.client_name || appt.clients?.full_name || "Cliente";
      const isSub = appt.clients?.is_subscriber === true || subscribers.some(sub => sub.client_id === appt.client_id || (appt.client_whatsapp && sub.whatsapp?.replace(/\D/g,"") === appt.client_whatsapp?.replace(/\D/g,"")));
      
      const apptDateStr = appt.start_at;
      const matchedSvcName = appt.services?.name ?? "Serviço";

      if (!clientLastServiceMap[clientName] || new Date(apptDateStr) > new Date(clientLastServiceMap[clientName].lastDate)) {
        clientLastServiceMap[clientName] = {
          name: clientName,
          isSubscriber: isSub,
          lastService: matchedSvcName,
          lastDate: apptDateStr
        };
      }
    });

    const clientLastServiceList = Object.values(clientLastServiceMap).sort((a, b) => new Date(b.lastDate).getTime() - new Date(a.lastDate).getTime());

    // Calculate aggregated KPIs for the selected period/professional
    const completedApptsCount = periodAppts.length;
    let totalServicesCount = periodAppts.length;
    periodAppts.forEach(a => {
      if (a.notes && a.notes.includes("Serviços: ")) {
        const p = a.notes.split("Serviços: ")[1];
        if (p) totalServicesCount += p.split(" | ")[0].split(", ").length;
      }
    });

    // Also include commanda items in services count
    commandas.forEach(c => {
      const proItems = proFilter === "all" 
        ? (c.commanda_items ?? []) 
        : (c.commanda_items ?? []).filter((item: any) => item.professional_id === proFilter);
      totalServicesCount += proItems.filter((item: any) => item.kind === "service").reduce((acc: number, i: any) => acc + i.quantity, 0);
    });

    return {
      chartData,
      totalFaturamento,
      completedApptsCount,
      totalServicesCount,
      proPerformance,
      servicesRankList,
      clientLastServiceList
    };
  }, [reportData, period, selectedProId, isPro, myPro]);

  if (isLoading) return <div className="h-96 flex items-center justify-center"><Clock className="h-8 w-8 animate-spin text-primary" /></div>;

  const pros = reportData?.pros ?? [];

  return (
    <div className="space-y-6 max-w-[1400px] mx-auto pb-12">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold flex items-center gap-2">
            <BarChart3 className="h-7 w-7 text-primary" />
            Relatórios e Rendimentos
          </h1>
          <p className="text-muted-foreground">Analise o faturamento e o rendimento da sua barbearia.</p>
        </div>

        <div className="flex items-center gap-3">
          <Select value={period} onValueChange={(v: any) => setPeriod(v)}>
            <SelectTrigger className="w-[180px] bg-background">
              <Calendar className="h-4 w-4 mr-2 text-muted-foreground" />
              <SelectValue placeholder="Período" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="today">Hoje</SelectItem>
              <SelectItem value="month">Este Mês</SelectItem>
              <SelectItem value="30days">Últimos 30 dias</SelectItem>
            </SelectContent>
          </Select>

          {isAdmin && (
            <Select value={selectedProId} onValueChange={setSelectedProId}>
              <SelectTrigger className="w-[200px] bg-background">
                <Scissors className="h-4 w-4 mr-2 text-muted-foreground" />
                <SelectValue placeholder="Todos os Barbeiros" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os Barbeiros</SelectItem>
                {pros.map((p: any) => (
                  <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {isPro && (
            <div className="flex items-center gap-1 text-xs bg-primary/10 text-primary px-3 py-2 rounded-lg font-semibold uppercase tracking-wider">
              <UserCheck className="h-4 w-4" /> Seus dados
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <div className="text-xs text-muted-foreground uppercase font-bold">Faturamento Total</div>
              <div className="text-2xl font-bold mt-1 text-primary">{brl(processed?.totalFaturamento ?? 0)}</div>
            </div>
            <div className="p-3 rounded-lg bg-primary/10 text-primary">
              <DollarSign className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <div className="text-xs text-muted-foreground uppercase font-bold">Agendamentos</div>
              <div className="text-2xl font-bold mt-1 text-success">{processed?.completedApptsCount ?? 0} finalizados</div>
            </div>
            <div className="p-3 rounded-lg bg-success/10 text-success">
              <UserCheck className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <div className="text-xs text-muted-foreground uppercase font-bold">Serviços Feitos</div>
              <div className="text-2xl font-bold mt-1 text-info">{processed?.totalServicesCount ?? 0} realizados</div>
            </div>
            <div className="p-3 rounded-lg bg-info/10 text-info">
              <Scissors className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="chart" className="w-full">
        <TabsList className="bg-muted/40 w-full md:w-auto h-auto p-1 flex overflow-x-auto gap-1">
          <TabsTrigger value="chart" className="flex-1 md:flex-none"><TrendingUp className="h-4 w-4 mr-2" />Faturamento</TabsTrigger>
          {isAdmin && <TabsTrigger value="pros" className="flex-1 md:flex-none"><Award className="h-4 w-4 mr-2" />Barbeiros</TabsTrigger>}
          <TabsTrigger value="services" className="flex-1 md:flex-none"><Sparkles className="h-4 w-4 mr-2" />Ranking Serviços</TabsTrigger>
          <TabsTrigger value="clients" className="flex-1 md:flex-none"><Users className="h-4 w-4 mr-2" />Histórico Clientes</TabsTrigger>
        </TabsList>

        <TabsContent value="chart" className="mt-4">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-2 mb-4">
                <TrendingUp className="h-5 w-5 text-primary" />
                <h3 className="font-semibold text-lg">Faturamento por Período</h3>
              </div>
              <div className="h-80 w-full">
                <ResponsiveContainer>
                  <BarChart data={processed?.chartData ?? []}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.3} vertical={false} />
                    <XAxis dataKey="d" fontSize={11} />
                    <YAxis fontSize={11} tickFormatter={(v) => `R$${v}`} />
                    <Tooltip formatter={(v: any) => brl(v)} />
                    <Bar dataKey="v" fill="var(--primary)" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {isAdmin && (
          <TabsContent value="pros" className="mt-4">
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center gap-2 mb-4">
                  <Award className="h-5 w-5 text-primary" />
                  <h3 className="font-semibold text-lg">Rendimento dos Profissionais</h3>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nome</TableHead>
                      <TableHead>Cargo</TableHead>
                      <TableHead className="text-center">Agendamentos</TableHead>
                      <TableHead className="text-center">Serviços</TableHead>
                      <TableHead className="text-right">Faturamento</TableHead>
                      <TableHead className="text-right">Comissão</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(processed?.proPerformance ?? []).map((pro: any) => (
                      <TableRow key={pro.id}>
                        <TableCell className="font-medium">{pro.name}</TableCell>
                        <TableCell>{pro.role}</TableCell>
                        <TableCell className="text-center font-mono">{pro.appointmentsCount}</TableCell>
                        <TableCell className="text-center font-mono">{pro.servicesCount}</TableCell>
                        <TableCell className="text-right font-mono font-semibold text-emerald-600 dark:text-emerald-400">{brl(pro.totalGenerated)}</TableCell>
                        <TableCell className="text-right font-mono font-bold text-primary">{brl(pro.commissionGenerated)}</TableCell>
                      </TableRow>
                    ))}
                    {(processed?.proPerformance ?? []).length === 0 && (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center text-muted-foreground italic py-6">Nenhum profissional cadastrado.</TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        )}

        <TabsContent value="services" className="mt-4">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-2 mb-4">
                <Sparkles className="h-5 w-5 text-primary" />
                <h3 className="font-semibold text-lg">Serviços Mais Realizados</h3>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Serviço</TableHead>
                    <TableHead className="text-center">Qtd. Realizada</TableHead>
                    <TableHead className="text-right">Faturamento Gerado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(processed?.servicesRankList ?? []).map((svc: any, idx: number) => (
                    <TableRow key={idx}>
                      <TableCell className="font-medium flex items-center gap-2">
                        <span className="w-5 h-5 rounded-full bg-muted flex items-center justify-center text-[10px] font-bold text-muted-foreground">{idx + 1}</span>
                        {svc.name}
                      </TableCell>
                      <TableCell className="text-center font-mono font-semibold">{svc.count} vezes</TableCell>
                      <TableCell className="text-right font-mono font-bold text-emerald-600 dark:text-emerald-400">{brl(svc.value)}</TableCell>
                    </TableRow>
                  ))}
                  {(processed?.servicesRankList ?? []).length === 0 && (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center text-muted-foreground italic py-6">Nenhum serviço realizado no período.</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="clients" className="mt-4">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-2 mb-4">
                <Users className="h-5 w-5 text-primary" />
                <h3 className="font-semibold text-lg">Histórico de Clientes e Último Atendimento</h3>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cliente</TableHead>
                    <TableHead className="text-center">Categoria</TableHead>
                    <TableHead>Último Serviço</TableHead>
                    <TableHead className="text-right">Data do Último Atendimento</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(processed?.clientLastServiceList ?? []).map((cli: any, idx: number) => {
                    const formattedDate = format(new Date(cli.lastDate), "dd/MM/yyyy 'às' HH:mm");
                    return (
                      <TableRow key={idx}>
                        <TableCell className="font-medium">{cli.name}</TableCell>
                        <TableCell className="text-center">
                          {cli.isSubscriber ? (
                            <span className="text-[10px] bg-emerald-500/20 text-emerald-700 font-bold uppercase py-0.5 px-2 rounded-full">Assinante VIP</span>
                          ) : (
                            <span className="text-[10px] bg-muted text-muted-foreground py-0.5 px-2 rounded-full">Comum</span>
                          )}
                        </TableCell>
                        <TableCell>{cli.lastService}</TableCell>
                        <TableCell className="text-right font-mono font-medium">{formattedDate}</TableCell>
                      </TableRow>
                    );
                  })}
                  {(processed?.clientLastServiceList ?? []).length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground italic py-6">Sem histórico de atendimentos.</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

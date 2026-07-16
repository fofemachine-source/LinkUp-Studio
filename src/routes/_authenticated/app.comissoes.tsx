/* eslint-disable @typescript-eslint/no-explicit-any */
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { endOfMonth, endOfWeek, format, startOfMonth, startOfWeek } from "date-fns";
import {
  Award,
  BadgeDollarSign,
  Boxes,
  BriefcaseBusiness,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  FileCheck2,
  History,
  Package,
  RotateCcw,
  Scissors,
  Search,
  Settings2,
  TrendingUp,
  UsersRound,
  WalletCards,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { SettlementPanel } from "@/components/commissions/settlement-panel";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCurrentTenant, useUserRole } from "@/hooks/use-tenant";
import { supabase } from "@/integrations/supabase/client";
import {
  adjustmentLabels,
  commissionStatusLabel,
  initials,
  normalizeSearch,
  numberValue,
  paymentLabels,
  settlementStatusLabel,
  type CommissionAdjustment,
  type CommissionEntry,
  type CommissionRule,
  type CommissionSettlement,
  type FinancialAccountOption,
  type ProfessionalSummary,
} from "@/lib/commissions";
import { brl, dateBR } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/app/comissoes")({
  component: ComissoesPage,
});

type CatalogItem = { id: string; name: string; price: number; active: boolean | null };

type ProfessionalOverview = {
  professional: ProfessionalSummary;
  entries: CommissionEntry[];
  servicesCount: number;
  productsCount: number;
  revenue: number;
  generated: number;
  pending: number;
  lastPayment: string | null;
};

const db = supabase as any;

function ComissoesPage() {
  const tenantId = useCurrentTenant().data?.id;
  const { data: role } = useUserRole(tenantId);
  const canManage = role === "owner" || role === "staff";
  const queryClient = useQueryClient();
  const today = new Date();
  const [from, setFrom] = useState(format(startOfMonth(today), "yyyy-MM-dd"));
  const [to, setTo] = useState(format(endOfMonth(today), "yyyy-MM-dd"));
  const [professionalFilter, setProfessionalFilter] = useState("all");
  const [historyProfessionalFilter, setHistoryProfessionalFilter] = useState("all");
  const [historyPaymentFilter, setHistoryPaymentFilter] = useState("all");
  const [historyStatusFilter, setHistoryStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState("resumo");
  const [settlementProfessionalId, setSettlementProfessionalId] = useState("");
  const [selectedProfessional, setSelectedProfessional] = useState<ProfessionalSummary | null>(
    null,
  );

  const { data: professionals = [], isLoading: professionalsLoading } = useQuery({
    queryKey: ["commission-professionals", tenantId, role],
    enabled: !!tenantId && !!role,
    queryFn: async () => {
      let query = db
        .from("professionals")
        .select("id,full_name,photo_url,role_label,active,commission_pct,cost_center_id")
        .eq("tenant_id", tenantId)
        .eq("active", true);
      if (role === "barber") {
        const { data: userResult } = await supabase.auth.getUser();
        query = query.eq("auth_user_id", userResult.user?.id ?? "");
      }
      const { data, error } = await query.order("full_name");
      if (error) throw error;
      return (data ?? []) as ProfessionalSummary[];
    },
  });

  const { data: entries = [], isLoading: entriesLoading } = useQuery({
    queryKey: ["commission-entries", tenantId],
    enabled: !!tenantId,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const { data, error } = await db
        .from("commission_entries")
        .select(
          "*, professionals(id,full_name,photo_url,role_label,active,commission_pct,cost_center_id), commandas(number,client_name,closed_at)",
        )
        .eq("tenant_id", tenantId)
        .order("competence_date", { ascending: false })
        .limit(3000);
      if (error) throw error;
      return (data ?? []) as CommissionEntry[];
    },
  });

  const { data: settlements = [], isLoading: settlementsLoading } = useQuery({
    queryKey: ["commission-settlements", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await db
        .from("commission_settlements")
        .select(
          "*, professionals(id,full_name,photo_url,role_label,active,commission_pct,cost_center_id), financial_accounts(name)",
        )
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false })
        .limit(1000);
      if (error) throw error;
      return (data ?? []) as CommissionSettlement[];
    },
  });

  const { data: adjustments = [], isLoading: adjustmentsLoading } = useQuery({
    queryKey: ["commission-adjustments", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await db
        .from("commission_adjustments")
        .select("*")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false })
        .limit(3000);
      if (error) throw error;
      return (data ?? []) as CommissionAdjustment[];
    },
  });

  const settlementCreatorIds = useMemo(
    () => [...new Set(settlements.map((settlement) => settlement.created_by).filter(Boolean))],
    [settlements],
  ) as string[];

  const { data: auditUsers = [] } = useQuery({
    queryKey: ["commission-audit-users", tenantId, settlementCreatorIds.join(",")],
    enabled: !!tenantId && settlementCreatorIds.length > 0,
    queryFn: async () => {
      const { data, error } = await db
        .from("profiles")
        .select("id,full_name")
        .in("id", settlementCreatorIds);
      if (error) throw error;
      return (data ?? []) as { id: string; full_name: string | null }[];
    },
  });

  const { data: rules = [] } = useQuery({
    queryKey: ["commission-rules", tenantId],
    enabled: !!tenantId && canManage,
    queryFn: async () => {
      const { data, error } = await db
        .from("commission_rules")
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("active", true)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as CommissionRule[];
    },
  });

  const { data: accounts = [] } = useQuery({
    queryKey: ["commission-financial-accounts", tenantId],
    enabled: !!tenantId && canManage,
    queryFn: async () => {
      const { data, error } = await db
        .from("financial_accounts")
        .select("id,name")
        .eq("tenant_id", tenantId)
        .eq("active", true)
        .order("name");
      if (error) throw error;
      return (data ?? []) as FinancialAccountOption[];
    },
  });

  const { data: services = [] } = useQuery({
    queryKey: ["commission-services", tenantId],
    enabled: !!tenantId && canManage,
    queryFn: async () =>
      ((
        await db
          .from("services")
          .select("id,name,price,active")
          .eq("tenant_id", tenantId)
          .eq("active", true)
          .order("name")
      ).data ?? []) as CatalogItem[],
  });

  const { data: products = [] } = useQuery({
    queryKey: ["commission-products", tenantId],
    enabled: !!tenantId && canManage,
    queryFn: async () =>
      ((
        await db
          .from("products")
          .select("id,name,price,active")
          .eq("tenant_id", tenantId)
          .eq("active", true)
          .order("name")
      ).data ?? []) as CatalogItem[],
  });

  const filteredEntries = useMemo(
    () =>
      entries.filter(
        (entry) =>
          entry.competence_date >= from &&
          entry.competence_date <= to &&
          (professionalFilter === "all" || entry.professional_id === professionalFilter),
      ),
    [entries, from, professionalFilter, to],
  );

  const professionalSummaries = useMemo(
    () =>
      professionals
        .map((professional) => {
          const professionalEntries = filteredEntries.filter(
            (entry) => entry.professional_id === professional.id,
          );
          const allProfessionalEntries = entries.filter(
            (entry) => entry.professional_id === professional.id,
          );
          const paidSettlements = settlements.filter(
            (settlement) =>
              settlement.professional_id === professional.id && settlement.status === "paid",
          );
          const servicesCount = professionalEntries
            .filter((entry) => entry.item_kind === "service")
            .reduce((total, entry) => total + numberValue(entry.quantity), 0);
          const productsCount = professionalEntries
            .filter((entry) => entry.item_kind === "product")
            .reduce((total, entry) => total + numberValue(entry.quantity), 0);
          return {
            professional,
            entries: professionalEntries,
            servicesCount,
            productsCount,
            revenue: professionalEntries.reduce(
              (total, entry) => total + numberValue(entry.gross_amount),
              0,
            ),
            generated: professionalEntries.reduce(
              (total, entry) => total + numberValue(entry.commission_amount),
              0,
            ),
            pending: allProfessionalEntries
              .filter((entry) => entry.status === "pending" || entry.status === "scheduled")
              .reduce((total, entry) => total + numberValue(entry.commission_amount), 0),
            lastPayment: paidSettlements[0]?.payment_date ?? paidSettlements[0]?.paid_at ?? null,
          };
        })
        .filter(({ professional }) =>
          normalizeSearch(professional.full_name).includes(normalizeSearch(search)),
        )
        .sort((a, b) => b.pending - a.pending),
    [entries, filteredEntries, professionals, search, settlements],
  );

  const pendingEntries = filteredEntries.filter(
    (entry) => entry.status === "pending" || entry.status === "scheduled",
  );
  const paidEntries = filteredEntries.filter((entry) => entry.status === "paid");
  const totalGenerated = filteredEntries.reduce(
    (total, entry) => total + numberValue(entry.commission_amount),
    0,
  );
  const totalPaid = paidEntries.reduce(
    (total, entry) => total + numberValue(entry.commission_amount),
    0,
  );
  const totalPending = pendingEntries.reduce(
    (total, entry) => total + numberValue(entry.commission_amount),
    0,
  );
  const professionalsWithBalance = professionalSummaries.filter((item) => item.pending > 0);
  const highestCommission = Math.max(0, ...professionalSummaries.map((item) => item.generated));
  const averageCommission = professionalSummaries.length
    ? totalGenerated / professionalSummaries.length
    : 0;
  const serviceCount = filteredEntries.filter((entry) => entry.item_kind === "service").length;
  const productCount = filteredEntries.filter((entry) => entry.item_kind === "product").length;
  const loading =
    professionalsLoading || entriesLoading || settlementsLoading || adjustmentsLoading;
  const auditUserById = useMemo(
    () => new Map(auditUsers.map((user) => [user.id, user.full_name || "Usuário"])),
    [auditUsers],
  );
  const historySettlements = useMemo(
    () =>
      settlements.filter((settlement) => {
        const settlementDate = (
          settlement.payment_date ??
          settlement.paid_at ??
          settlement.created_at
        ).slice(0, 10);
        return (
          settlementDate >= from &&
          settlementDate <= to &&
          (historyProfessionalFilter === "all" ||
            settlement.professional_id === historyProfessionalFilter) &&
          (historyPaymentFilter === "all" || settlement.payment_method === historyPaymentFilter) &&
          (historyStatusFilter === "all" || settlement.status === historyStatusFilter)
        );
      }),
    [from, historyPaymentFilter, historyProfessionalFilter, historyStatusFilter, settlements, to],
  );

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ["commission-entries"] });
    queryClient.invalidateQueries({ queryKey: ["commission-settlements"] });
    queryClient.invalidateQueries({ queryKey: ["commission-adjustments"] });
    queryClient.invalidateQueries({ queryKey: ["commission-rules"] });
    queryClient.invalidateQueries({ queryKey: ["finance-movements-until"] });
    queryClient.invalidateQueries({ queryKey: ["finance-payables"] });
    queryClient.invalidateQueries({ queryKey: ["finance-commandas"] });
  }

  function setPeriodPreset(preset: "today" | "week" | "month") {
    const reference = new Date();
    if (preset === "today") {
      const value = format(reference, "yyyy-MM-dd");
      setFrom(value);
      setTo(value);
      return;
    }
    if (preset === "week") {
      setFrom(format(startOfWeek(reference, { weekStartsOn: 1 }), "yyyy-MM-dd"));
      setTo(format(endOfWeek(reference, { weekStartsOn: 1 }), "yyyy-MM-dd"));
      return;
    }
    setFrom(format(startOfMonth(reference), "yyyy-MM-dd"));
    setTo(format(endOfMonth(reference), "yyyy-MM-dd"));
  }

  async function reverseSettlement(settlement: CommissionSettlement) {
    const reason = window.prompt(
      `Informe o motivo para estornar a prestação de ${settlement.professionals?.full_name ?? "profissional"}:`,
    );
    if (!reason?.trim() || !tenantId) return;
    const { error } = await db.rpc("reverse_commission_settlement", {
      p_tenant_id: tenantId,
      p_settlement_id: settlement.id,
      p_reason: reason.trim(),
    });
    if (error) return toast.error(error.message);
    toast.success("Prestação estornada e comissões devolvidas ao saldo pendente.");
    refresh();
  }

  return (
    <div className="mx-auto max-w-[1540px] space-y-5 pb-12">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="mb-1 flex items-center gap-2 text-primary">
            <Award className="h-5 w-5" />
            <span className="text-xs font-bold uppercase tracking-[0.18em]">
              Gestão financeira dos profissionais
            </span>
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">Comissões</h1>
          <p className="text-muted-foreground">
            Apuração, prestação de contas, regras e histórico integrados ao Financeiro.
          </p>
        </div>
        <Badge variant="outline" className="border-primary/20 bg-primary/5 px-3 py-1.5">
          <WalletCards className="mr-2 h-4 w-4 text-primary" />
          {brl(totalPending)} aguardando pagamento
        </Badge>
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 p-4">
          <div>
            <Label>Atalhos</Label>
            <div className="flex rounded-lg border bg-muted/30 p-1">
              <Button variant="ghost" size="sm" onClick={() => setPeriodPreset("today")}>
                Hoje
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setPeriodPreset("week")}>
                Semana
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setPeriodPreset("month")}>
                Mês
              </Button>
            </div>
          </div>
          <div>
            <Label>De</Label>
            <Input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
          </div>
          <div>
            <Label>Até</Label>
            <Input
              type="date"
              min={from}
              value={to}
              onChange={(event) => setTo(event.target.value)}
            />
          </div>
          <div className="min-w-[220px]">
            <Label>Profissional</Label>
            <Select value={professionalFilter} onValueChange={setProfessionalFilter}>
              <SelectTrigger>
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
          </div>
          <div className="ml-auto text-xs text-muted-foreground">
            Regime de competência · {dateBR(from)} a {dateBR(to)}
          </div>
        </CardContent>
      </Card>

      {loading && <div className="text-sm text-muted-foreground">Atualizando comissões…</div>}

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-5">
        <TabsList className="h-auto w-full justify-start overflow-x-auto bg-muted/50 p-1">
          <TabsTrigger value="resumo">
            <TrendingUp className="mr-2 h-4 w-4" />
            Resumo
          </TabsTrigger>
          <TabsTrigger value="profissionais">
            <UsersRound className="mr-2 h-4 w-4" />
            Profissionais
          </TabsTrigger>
          {canManage && (
            <TabsTrigger value="prestacao">
              <ClipboardCheck className="mr-2 h-4 w-4" />
              Prestação de Contas
            </TabsTrigger>
          )}
          <TabsTrigger value="historico">
            <History className="mr-2 h-4 w-4" />
            Histórico
          </TabsTrigger>
          {canManage && (
            <TabsTrigger value="configuracoes">
              <Settings2 className="mr-2 h-4 w-4" />
              Configurações
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="resumo" className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              title="Comissão gerada"
              value={brl(totalGenerated)}
              hint={`${filteredEntries.length} itens comissionados`}
              icon={BadgeDollarSign}
            />
            <MetricCard
              title="Total pago"
              value={brl(totalPaid)}
              hint={`${paidEntries.length} comissões baixadas`}
              icon={CheckCircle2}
              tone="success"
            />
            <MetricCard
              title="Total pendente"
              value={brl(totalPending)}
              hint={`${professionalsWithBalance.length} profissionais com saldo`}
              icon={Clock3}
              tone="warning"
            />
            <MetricCard
              title="Média por profissional"
              value={brl(averageCommission)}
              hint={`Maior saldo gerado: ${brl(highestCommission)}`}
              icon={UsersRound}
            />
          </div>

          <div className="grid gap-5 xl:grid-cols-[1.55fr_0.8fr]">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Distribuição por profissional</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {professionalSummaries.slice(0, 8).map((summary) => {
                  const share = totalGenerated ? (summary.generated / totalGenerated) * 100 : 0;
                  return (
                    <div key={summary.professional.id} className="space-y-1.5">
                      <div className="flex items-center justify-between gap-3 text-sm">
                        <div className="min-w-0">
                          <span className="font-medium">{summary.professional.full_name}</span>
                          <span className="ml-2 text-xs text-muted-foreground">
                            {summary.servicesCount} serviços · {summary.productsCount} produtos
                          </span>
                        </div>
                        <span className="shrink-0 font-semibold">{brl(summary.generated)}</span>
                      </div>
                      <Progress value={Math.min(100, share)} className="h-1.5" />
                    </div>
                  );
                })}
                {!professionalSummaries.length && (
                  <EmptyState text="Nenhuma comissão gerada no período." />
                )}
              </CardContent>
            </Card>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
              <MetricCard
                title="Serviços comissionados"
                value={String(serviceCount)}
                hint="Itens de serviço no período"
                icon={Scissors}
              />
              <MetricCard
                title="Produtos comissionados"
                value={String(productCount)}
                hint="Itens de produto no período"
                icon={Package}
              />
              <Card>
                <CardContent className="p-4 text-sm leading-relaxed text-muted-foreground">
                  Cada comissão pendente também é uma obrigação em Contas a Pagar e uma despesa
                  variável na DRE. O caixa só é reduzido quando a prestação é confirmada.
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="profissionais" className="space-y-4">
          <div className="relative max-w-lg">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Pesquisar profissional…"
              className="pl-10"
            />
          </div>
          <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
            {professionalSummaries.map((summary) => (
              <ProfessionalCard
                key={summary.professional.id}
                summary={summary}
                onDetails={() => setSelectedProfessional(summary.professional)}
                onSettle={
                  canManage
                    ? () => {
                        setSettlementProfessionalId(summary.professional.id);
                        setActiveTab("prestacao");
                      }
                    : undefined
                }
              />
            ))}
          </div>
        </TabsContent>

        {canManage && (
          <TabsContent value="prestacao">
            <SettlementPanel
              tenantId={tenantId}
              professionals={professionals}
              entries={entries}
              accounts={accounts}
              defaultProfessionalId={settlementProfessionalId}
              onDone={refresh}
            />
          </TabsContent>
        )}

        <TabsContent value="historico" className="space-y-4">
          <Card>
            <CardHeader className="space-y-4">
              <CardTitle className="text-base">Prestações de contas realizadas</CardTitle>
              <div className="grid gap-3 md:grid-cols-3">
                <Select
                  value={historyProfessionalFilter}
                  onValueChange={setHistoryProfessionalFilter}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Profissional" />
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
                <Select value={historyPaymentFilter} onValueChange={setHistoryPaymentFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="Forma de pagamento" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas as formas</SelectItem>
                    {Object.entries(paymentLabels).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={historyStatusFilter} onValueChange={setHistoryStatusFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os status</SelectItem>
                    <SelectItem value="paid">Pago</SelectItem>
                    <SelectItem value="scheduled">Programado</SelectItem>
                    <SelectItem value="reversed">Estornado</SelectItem>
                    <SelectItem value="canceled">Cancelado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Profissional</TableHead>
                    <TableHead>Período</TableHead>
                    <TableHead>Bruto</TableHead>
                    <TableHead>Ajustes</TableHead>
                    <TableHead>Líquido</TableHead>
                    <TableHead>Pagamento</TableHead>
                    <TableHead>Responsável</TableHead>
                    <TableHead>Observações</TableHead>
                    <TableHead>Comprovante</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {historySettlements.map((settlement) => (
                    <TableRow key={settlement.id}>
                      <TableCell>
                        {settlement.payment_date
                          ? dateBR(settlement.payment_date)
                          : dateBR(settlement.created_at)}
                      </TableCell>
                      <TableCell className="font-medium">
                        {settlement.professionals?.full_name ?? "Profissional"}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {dateBR(settlement.period_start)} — {dateBR(settlement.period_end)}
                      </TableCell>
                      <TableCell>{brl(settlement.gross_amount)}</TableCell>
                      <TableCell>
                        <span className="text-emerald-700">+ {brl(settlement.credit_amount)}</span>
                        <span className="ml-2 text-rose-700">- {brl(settlement.debit_amount)}</span>
                      </TableCell>
                      <TableCell className="font-semibold">{brl(settlement.net_amount)}</TableCell>
                      <TableCell>
                        {paymentLabels[settlement.payment_method ?? ""] ??
                          settlement.payment_method ??
                          "—"}
                        <div className="text-xs text-muted-foreground">
                          {settlement.financial_accounts?.name}
                        </div>
                      </TableCell>
                      <TableCell>
                        {settlement.created_by
                          ? (auditUserById.get(settlement.created_by) ??
                            `Usuário ${settlement.created_by.slice(0, 8)}`)
                          : "Sistema"}
                      </TableCell>
                      <TableCell className="max-w-[240px] truncate">
                        {settlement.notes || settlement.reversal_reason || "—"}
                      </TableCell>
                      <TableCell>
                        {settlement.proof_url ? (
                          <Button asChild variant="ghost" size="sm">
                            <a href={settlement.proof_url} target="_blank" rel="noreferrer">
                              <FileCheck2 className="mr-1 h-4 w-4" />
                              Abrir
                            </a>
                          </Button>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell>
                        <SettlementBadge status={settlement.status} />
                      </TableCell>
                      <TableCell className="text-right">
                        {canManage && settlement.status === "paid" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive"
                            onClick={() => reverseSettlement(settlement)}
                          >
                            <RotateCcw className="mr-1 h-4 w-4" />
                            Estornar
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {!historySettlements.length && (
                <EmptyState text="Nenhuma prestação encontrada para estes filtros." />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {canManage && (
          <TabsContent value="configuracoes">
            <CommissionRulesPanel
              tenantId={tenantId}
              professionals={professionals}
              services={services}
              products={products}
              rules={rules}
              onDone={refresh}
            />
          </TabsContent>
        )}
      </Tabs>

      <ProfessionalDetails
        professional={selectedProfessional}
        entries={entries}
        settlements={settlements}
        adjustments={adjustments}
        open={!!selectedProfessional}
        onOpenChange={(open) => !open && setSelectedProfessional(null)}
      />
    </div>
  );
}

function MetricCard({
  title,
  value,
  hint,
  icon: Icon,
  tone = "primary",
}: {
  title: string;
  value: string;
  hint: string;
  icon: LucideIcon;
  tone?: "primary" | "success" | "warning";
}) {
  const tones = {
    primary: "bg-primary/10 text-primary",
    success: "bg-emerald-50 text-emerald-700",
    warning: "bg-amber-50 text-amber-700",
  };
  return (
    <Card>
      <CardContent className="flex items-start gap-3 p-4">
        <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg ${tones[tone]}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase text-muted-foreground">{title}</div>
          <div className="truncate text-xl font-bold">{value}</div>
          <div className="mt-1 text-xs text-muted-foreground">{hint}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function ProfessionalCard({
  summary,
  onDetails,
  onSettle,
}: {
  summary: ProfessionalOverview;
  onDetails: () => void;
  onSettle?: () => void;
}) {
  const { professional } = summary;
  return (
    <Card className="overflow-hidden">
      <CardContent className="p-0">
        <div className="flex items-center gap-3 border-b p-4">
          <Avatar className="h-12 w-12">
            <AvatarImage src={professional.photo_url ?? undefined} />
            <AvatarFallback className="bg-primary/10 font-semibold text-primary">
              {initials(professional.full_name)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <div className="truncate font-semibold">{professional.full_name}</div>
            <div className="text-xs text-muted-foreground">
              {professional.role_label || "Profissional"} · Ativo
            </div>
          </div>
          <Badge
            variant="outline"
            className={
              summary.pending > 0
                ? "border-amber-200 bg-amber-50 text-amber-700"
                : "border-emerald-200 bg-emerald-50 text-emerald-700"
            }
          >
            {summary.pending > 0 ? "Com saldo" : "Em dia"}
          </Badge>
        </div>
        <div className="grid grid-cols-2 gap-px bg-border">
          <InfoCell label="Saldo a pagar" value={brl(summary.pending)} strong />
          <InfoCell label="Comissão no período" value={brl(summary.generated)} />
          <InfoCell label="Valor faturado" value={brl(summary.revenue)} />
          <InfoCell
            label="Serviços / produtos"
            value={`${summary.servicesCount} / ${summary.productsCount}`}
          />
        </div>
        <div className="flex items-center justify-between gap-2 p-3">
          <span className="text-xs text-muted-foreground">
            Último pagamento: {summary.lastPayment ? dateBR(summary.lastPayment) : "nenhum"}
          </span>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={onDetails}>
              Ver detalhes
            </Button>
            {onSettle && (
              <Button size="sm" onClick={onSettle} disabled={summary.pending <= 0}>
                Pagar
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function InfoCell({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="bg-card p-3">
      <div className="text-[10px] font-semibold uppercase text-muted-foreground">{label}</div>
      <div className={`mt-1 ${strong ? "text-lg font-bold text-primary" : "font-semibold"}`}>
        {value}
      </div>
    </div>
  );
}

function ProfessionalDetails({
  professional,
  entries,
  settlements,
  adjustments,
  open,
  onOpenChange,
}: {
  professional: ProfessionalSummary | null;
  entries: CommissionEntry[];
  settlements: CommissionSettlement[];
  adjustments: CommissionAdjustment[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  if (!professional) return null;
  const professionalEntries = entries.filter((entry) => entry.professional_id === professional.id);
  const serviceEntries = professionalEntries.filter((entry) => entry.item_kind === "service");
  const productEntries = professionalEntries.filter((entry) => entry.item_kind === "product");
  const professionalSettlements = settlements.filter(
    (settlement) => settlement.professional_id === professional.id,
  );
  const professionalAdjustments = adjustments.filter(
    (adjustment) => adjustment.professional_id === professional.id,
  );
  const pending = professionalEntries
    .filter((entry) => entry.status === "pending" || entry.status === "scheduled")
    .reduce((total, entry) => total + numberValue(entry.commission_amount), 0);
  const generated = professionalEntries.reduce(
    (total, entry) => total + numberValue(entry.commission_amount),
    0,
  );
  const paid = professionalSettlements
    .filter((settlement) => settlement.status === "paid")
    .reduce((total, settlement) => total + numberValue(settlement.net_amount), 0);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-[820px]">
        <SheetHeader>
          <div className="flex items-center gap-3 pr-8">
            <Avatar className="h-12 w-12">
              <AvatarImage src={professional.photo_url ?? undefined} />
              <AvatarFallback>{initials(professional.full_name)}</AvatarFallback>
            </Avatar>
            <div>
              <SheetTitle>{professional.full_name}</SheetTitle>
              <p className="text-sm text-muted-foreground">
                {professional.role_label || "Profissional"}
              </p>
            </div>
          </div>
        </SheetHeader>

        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <InfoCell label="Saldo disponível" value={brl(pending)} strong />
          <InfoCell label="Gerado no histórico" value={brl(generated)} />
          <InfoCell label="Total liquidado" value={brl(paid)} />
          <InfoCell label="Pagamentos" value={String(professionalSettlements.length)} />
        </div>

        <Tabs defaultValue="servicos" className="mt-5 space-y-4">
          <TabsList className="grid h-auto w-full grid-cols-2 sm:grid-cols-4">
            <TabsTrigger value="servicos">Serviços ({serviceEntries.length})</TabsTrigger>
            <TabsTrigger value="produtos">Produtos ({productEntries.length})</TabsTrigger>
            <TabsTrigger value="ajustes">Ajustes ({professionalAdjustments.length})</TabsTrigger>
            <TabsTrigger value="pagamentos">
              Pagamentos ({professionalSettlements.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="servicos">
            <CommissionEntryHistory
              entries={serviceEntries}
              emptyText="Nenhum serviço comissionado."
            />
          </TabsContent>

          <TabsContent value="produtos">
            <CommissionEntryHistory
              entries={productEntries}
              emptyText="Nenhum produto comissionado."
            />
          </TabsContent>

          <TabsContent value="ajustes">
            <Card>
              <CardContent className="space-y-2 p-4">
                {professionalAdjustments.map((adjustment) => (
                  <div
                    key={adjustment.id}
                    className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm"
                  >
                    <div className="min-w-0">
                      <div className="font-medium">
                        {adjustmentLabels[adjustment.adjustment_type]}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {dateBR(adjustment.competence_date)} · {adjustment.description}
                        {adjustment.notes ? ` · ${adjustment.notes}` : ""}
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div
                        className={
                          adjustment.nature === "credit"
                            ? "font-semibold text-emerald-700"
                            : "font-semibold text-rose-700"
                        }
                      >
                        {adjustment.nature === "credit" ? "+" : "-"} {brl(adjustment.amount)}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {adjustment.status === "applied"
                          ? "Aplicado"
                          : adjustment.status === "canceled"
                            ? "Cancelado"
                            : "Em aberto"}
                      </div>
                    </div>
                  </div>
                ))}
                {!professionalAdjustments.length && (
                  <EmptyState text="Nenhum ajuste registrado para este profissional." />
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="pagamentos">
            <Card>
              <CardContent className="space-y-2 p-4">
                {professionalSettlements.map((settlement) => (
                  <div
                    key={settlement.id}
                    className="flex flex-col gap-3 rounded-lg border p-3 text-sm sm:flex-row sm:items-center"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="font-medium">
                        {dateBR(settlement.payment_date ?? settlement.created_at)} ·{" "}
                        {paymentLabels[settlement.payment_method ?? ""] ??
                          settlement.payment_method ??
                          "Forma não informada"}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Período {dateBR(settlement.period_start)} — {dateBR(settlement.period_end)}
                        {settlement.notes ? ` · ${settlement.notes}` : ""}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <div className="text-right">
                        <div className="font-semibold">{brl(settlement.net_amount)}</div>
                        <SettlementBadge status={settlement.status} />
                      </div>
                      {settlement.proof_url && (
                        <Button asChild variant="ghost" size="icon">
                          <a
                            href={settlement.proof_url}
                            target="_blank"
                            rel="noreferrer"
                            aria-label="Abrir comprovante"
                          >
                            <FileCheck2 className="h-4 w-4" />
                          </a>
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
                {!professionalSettlements.length && (
                  <EmptyState text="Nenhuma prestação de contas realizada." />
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}

function CommissionEntryHistory({
  entries,
  emptyText,
}: {
  entries: CommissionEntry[];
  emptyText: string;
}) {
  return (
    <Card>
      <CardContent className="space-y-2 p-4">
        {entries.slice(0, 80).map((entry) => (
          <div
            key={entry.id}
            className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm"
          >
            <div className="min-w-0">
              <div className="truncate font-medium">{entry.item_name}</div>
              <div className="text-xs text-muted-foreground">
                {dateBR(entry.competence_date)} · Comanda #{entry.commandas?.number ?? "—"} ·{" "}
                {entry.rule_description}
              </div>
            </div>
            <div className="shrink-0 text-right">
              <div className="font-semibold">{brl(entry.commission_amount)}</div>
              <div className="text-xs text-muted-foreground">
                {commissionStatusLabel(entry.status)}
              </div>
            </div>
          </div>
        ))}
        {!entries.length && <EmptyState text={emptyText} />}
      </CardContent>
    </Card>
  );
}

function CommissionRulesPanel({
  tenantId,
  professionals,
  services,
  products,
  rules,
  onDone,
}: {
  tenantId?: string;
  professionals: ProfessionalSummary[];
  services: CatalogItem[];
  products: CatalogItem[];
  rules: CommissionRule[];
  onDone: () => void;
}) {
  const [reason, setReason] = useState("Atualização da política de comissões");
  const [busyKey, setBusyKey] = useState("");

  function getRule(
    scope: CommissionRule["rule_scope"],
    kind: CommissionRule["item_kind"],
    professionalId?: string,
    referenceId?: string,
  ) {
    return rules.find(
      (rule) =>
        rule.rule_scope === scope &&
        rule.item_kind === kind &&
        (professionalId ? rule.professional_id === professionalId : !rule.professional_id) &&
        (referenceId ? rule.reference_id === referenceId : !rule.reference_id),
    );
  }

  async function saveRule({
    scope,
    kind,
    percentage,
    professionalId,
    referenceId,
    key,
  }: {
    scope: CommissionRule["rule_scope"];
    kind: CommissionRule["item_kind"];
    percentage: number;
    professionalId?: string;
    referenceId?: string;
    key: string;
  }) {
    if (!tenantId) return;
    if (!Number.isFinite(percentage) || percentage < 0 || percentage > 100) {
      return toast.error("O percentual deve estar entre 0% e 100%.");
    }
    if (!reason.trim()) return toast.error("Informe o motivo da alteração.");
    setBusyKey(key);
    const existing = getRule(scope, kind, professionalId, referenceId);
    const payload = {
      tenant_id: tenantId,
      rule_scope: scope,
      item_kind: kind,
      professional_id: professionalId ?? null,
      reference_id: referenceId ?? null,
      percentage,
      active: true,
      change_reason: reason.trim(),
      updated_at: new Date().toISOString(),
    };
    const { error } = existing
      ? await db.from("commission_rules").update(payload).eq("id", existing.id)
      : await db.from("commission_rules").insert(payload);
    setBusyKey("");
    if (error) return toast.error(error.message);
    toast.success("Regra de comissão atualizada.");
    onDone();
  }

  return (
    <div className="space-y-5">
      <Card>
        <CardContent className="grid gap-3 p-4 md:grid-cols-[1fr_280px] md:items-end">
          <div>
            <h2 className="font-semibold">Hierarquia das regras</h2>
            <p className="text-sm text-muted-foreground">
              Item específico → profissional → padrão da empresa. A regra utilizada fica registrada
              na comissão.
            </p>
          </div>
          <div>
            <Label>Motivo das alterações</Label>
            <Input value={reason} onChange={(event) => setReason(event.target.value)} />
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <BriefcaseBusiness className="h-4 w-4 text-primary" />
              Comissão padrão da empresa
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <RuleInputRow
              label="Serviços"
              initialValue={getRule("company", "service")?.percentage ?? 0}
              busy={busyKey === "company-service"}
              onSave={(percentage) =>
                saveRule({
                  scope: "company",
                  kind: "service",
                  percentage,
                  key: "company-service",
                })
              }
            />
            <RuleInputRow
              label="Produtos"
              initialValue={getRule("company", "product")?.percentage ?? 0}
              busy={busyKey === "company-product"}
              onSave={(percentage) =>
                saveRule({
                  scope: "company",
                  kind: "product",
                  percentage,
                  key: "company-product",
                })
              }
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <UsersRound className="h-4 w-4 text-primary" />
              Regras por profissional
            </CardTitle>
          </CardHeader>
          <CardContent className="max-h-[430px] space-y-3 overflow-y-auto">
            {professionals.map((professional) => (
              <div key={professional.id} className="rounded-xl border p-3">
                <div className="mb-2 font-medium">{professional.full_name}</div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <RuleInputRow
                    compact
                    label="Serviços"
                    initialValue={
                      getRule("professional", "service", professional.id)?.percentage ??
                      professional.commission_pct ??
                      0
                    }
                    busy={busyKey === `${professional.id}-service`}
                    onSave={(percentage) =>
                      saveRule({
                        scope: "professional",
                        kind: "service",
                        professionalId: professional.id,
                        percentage,
                        key: `${professional.id}-service`,
                      })
                    }
                  />
                  <RuleInputRow
                    compact
                    label="Produtos"
                    initialValue={
                      getRule("professional", "product", professional.id)?.percentage ?? 0
                    }
                    busy={busyKey === `${professional.id}-product`}
                    onSave={(percentage) =>
                      saveRule({
                        scope: "professional",
                        kind: "product",
                        professionalId: professional.id,
                        percentage,
                        key: `${professional.id}-product`,
                      })
                    }
                  />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <CatalogRules
          title="Comissão específica por serviço"
          icon={Scissors}
          items={services}
          kind="service"
          getRule={(id) => getRule("item", "service", undefined, id)}
          busyKey={busyKey}
          onSave={(item, percentage) =>
            saveRule({
              scope: "item",
              kind: "service",
              referenceId: item.id,
              percentage,
              key: `service-${item.id}`,
            })
          }
        />
        <CatalogRules
          title="Comissão específica por produto"
          icon={Boxes}
          items={products}
          kind="product"
          getRule={(id) => getRule("item", "product", undefined, id)}
          busyKey={busyKey}
          onSave={(item, percentage) =>
            saveRule({
              scope: "item",
              kind: "product",
              referenceId: item.id,
              percentage,
              key: `product-${item.id}`,
            })
          }
        />
      </div>
    </div>
  );
}

function CatalogRules({
  title,
  icon: Icon,
  items,
  kind,
  getRule,
  busyKey,
  onSave,
}: {
  title: string;
  icon: LucideIcon;
  items: CatalogItem[];
  kind: "service" | "product";
  getRule: (id: string) => CommissionRule | undefined;
  busyKey: string;
  onSave: (item: CatalogItem, percentage: number) => void;
}) {
  const [search, setSearch] = useState("");
  const filtered = items.filter((item) =>
    normalizeSearch(item.name).includes(normalizeSearch(search)),
  );
  return (
    <Card>
      <CardHeader className="space-y-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Icon className="h-4 w-4 text-primary" />
          {title}
        </CardTitle>
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Pesquisar item…"
        />
      </CardHeader>
      <CardContent className="max-h-[480px] space-y-2 overflow-y-auto">
        {filtered.map((item) => (
          <RuleInputRow
            key={item.id}
            compact
            label={item.name}
            hint={brl(item.price)}
            initialValue={getRule(item.id)?.percentage ?? 0}
            busy={busyKey === `${kind}-${item.id}`}
            onSave={(percentage) => onSave(item, percentage)}
          />
        ))}
      </CardContent>
    </Card>
  );
}

function RuleInputRow({
  label,
  hint,
  initialValue,
  busy,
  compact,
  onSave,
}: {
  label: string;
  hint?: string;
  initialValue: number;
  busy: boolean;
  compact?: boolean;
  onSave: (percentage: number) => void;
}) {
  const [value, setValue] = useState(String(initialValue));

  useEffect(() => {
    setValue(String(initialValue));
  }, [initialValue]);

  return (
    <div
      className={`flex items-center gap-2 rounded-lg border bg-background ${compact ? "p-2" : "p-3"}`}
    >
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{label}</div>
        {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
      </div>
      <div className="relative w-20">
        <Input
          type="number"
          min="0"
          max="100"
          step="0.01"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          className="pr-6 text-right"
        />
        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
          %
        </span>
      </div>
      <Button size="sm" variant="outline" disabled={busy} onClick={() => onSave(Number(value))}>
        {busy ? "…" : "Salvar"}
      </Button>
    </div>
  );
}

function SettlementBadge({ status }: { status: CommissionSettlement["status"] }) {
  const className =
    status === "paid"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : status === "reversed" || status === "canceled"
        ? "border-rose-200 bg-rose-50 text-rose-700"
        : "border-amber-200 bg-amber-50 text-amber-700";
  return (
    <Badge variant="outline" className={className}>
      {settlementStatusLabel(status)}
    </Badge>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div className="py-8 text-center text-sm text-muted-foreground">{text}</div>;
}

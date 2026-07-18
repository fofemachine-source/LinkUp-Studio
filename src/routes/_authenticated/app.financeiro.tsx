/* eslint-disable @typescript-eslint/no-explicit-any */
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  addDays,
  differenceInCalendarDays,
  eachDayOfInterval,
  eachMonthOfInterval,
  endOfMonth,
  endOfYear,
  format,
  startOfMonth,
  startOfYear,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  BadgeDollarSign,
  Banknote,
  CalendarDays,
  CalendarClock,
  CheckCircle2,
  CircleAlert,
  Download,
  FileCheck2,
  FileBarChart,
  Landmark,
  Pencil,
  PiggyBank,
  Plus,
  ReceiptText,
  Scale,
  Search,
  Trash2,
  TrendingUp,
  WalletCards,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
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
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useCurrentTenant } from "@/hooks/use-tenant";
import { supabase } from "@/integrations/supabase/client";
import { brl, dateBR } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/_authenticated/app/financeiro")({
  component: FinanceiroPage,
});

type FinanceAccount = {
  id: string;
  name: string;
  account_type: string;
  opening_balance: number;
};

type FinanceCategory = {
  id: string;
  name: string;
  movement_kind: string;
  dre_group: string;
};

type Movement = {
  id: string;
  tenant_id: string;
  account_id: string | null;
  category_id: string | null;
  category?: string | null;
  kind: string;
  amount: number;
  description: string | null;
  movement_date: string;
  competence_date: string;
  due_date: string | null;
  paid_at: string | null;
  status: string;
  payment_method: string | null;
  source: string;
  notes: string | null;
  affects_cash?: boolean;
  affects_dre?: boolean;
  reference_type?: string | null;
  reference_id?: string | null;
  origin_label?: string | null;
  supplier_name?: string | null;
  document_number?: string | null;
  series_id?: string | null;
  installment_number?: number | null;
  installment_count?: number | null;
  proof_url?: string | null;
  cancellation_reason?: string | null;
  created_at: string;
};

type CommandaItem = {
  id: string;
  kind: string;
  name: string;
  quantity: number | null;
  unit_price: number;
  unit_cost: number;
  commission_value: number | null;
  professional_id: string | null;
  professionals?: { full_name: string } | null;
};

type CommandaPayment = {
  id: string;
  method: string | null;
  amount: number | null;
  received_amount: number | null;
  created_at: string | null;
};

type ClosedComanda = {
  id: string;
  number: number;
  client_name: string | null;
  closed_at: string | null;
  subtotal: number | null;
  discount: number | null;
  addition: number;
  total: number | null;
  payment_method: string | null;
  commanda_items: CommandaItem[];
  commanda_payments?: CommandaPayment[] | null;
};

type PaymentEntry = {
  method: string | null;
  amount: number;
  createdAt: string | null;
  commanda: ClosedComanda;
};

type ForecastComanda = {
  id: string;
  number: number;
  client_name: string | null;
  scheduled_at: string | null;
  total: number | null;
  source: string | null;
};

const pageSize = 1000;

async function fetchAll<T>(
  fetchPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
) {
  const rows: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await fetchPage(from, from + pageSize - 1);
    if (error) throw error;
    const page = data ?? [];
    rows.push(...page);
    if (page.length < pageSize) break;
  }
  return rows;
}

function localDate(value: string) {
  return new Date(`${value.slice(0, 10)}T12:00:00`);
}

function periodBounds(from: string, to: string) {
  return {
    start: new Date(`${from}T00:00:00`).toISOString(),
    end: new Date(`${to}T23:59:59.999`).toISOString(),
  };
}

function sum<T>(rows: T[], value: (row: T) => number) {
  return rows.reduce((total, row) => total + Number(value(row) || 0), 0);
}

function isSaleMovement(movement: Movement) {
  return (
    movement.source === "comanda" ||
    movement.description?.startsWith("Comanda #") ||
    movement.description?.startsWith("Agendamento #")
  );
}

function movementStatusLabel(status: string) {
  if (status === "paid") return "Pago";
  if (status === "pending") return "Pendente";
  if (status === "scheduled") return "Programado";
  return "Cancelado";
}

function paymentLabel(value: string | null) {
  const labels: Record<string, string> = {
    pix: "PIX",
    cash: "Dinheiro",
    credit: "Crédito",
    debit: "Débito",
    vip: "Assinatura / VIP",
  };
  return value ? (labels[value] ?? value) : "Não informado";
}

function getCommandaPaymentEntries(cmd: ClosedComanda): PaymentEntry[] {
  const detailed = (cmd.commanda_payments ?? [])
    .map((payment) => ({
      method: payment.method,
      amount: Number(payment.amount ?? 0),
      createdAt: payment.created_at ?? cmd.closed_at,
      commanda: cmd,
    }))
    .filter((payment) => payment.amount > 0);

  if (detailed.length > 0) return detailed;

  const total = Number(cmd.total ?? 0);
  return total > 0
    ? [
        {
          method: cmd.payment_method,
          amount: total,
          createdAt: cmd.closed_at,
          commanda: cmd,
        },
      ]
    : [];
}

function commandaPaymentLabel(cmd: ClosedComanda) {
  const labels = Array.from(
    new Set(getCommandaPaymentEntries(cmd).map((payment) => paymentLabel(payment.method))),
  );
  return labels.length > 0 ? labels.join(" + ") : paymentLabel(cmd.payment_method);
}

function FinanceiroPage() {
  const tenantId = useCurrentTenant().data?.id;
  const queryClient = useQueryClient();
  const today = useMemo(() => new Date(), []);
  const [from, setFrom] = useState(format(startOfMonth(today), "yyyy-MM-dd"));
  const [to, setTo] = useState(format(endOfMonth(today), "yyyy-MM-dd"));
  const [movementOpen, setMovementOpen] = useState(false);
  const [payableOpen, setPayableOpen] = useState(false);
  const [editingPayable, setEditingPayable] = useState<Movement | null>(null);
  const [payingPayable, setPayingPayable] = useState<Movement | null>(null);
  const [payableFilter, setPayableFilter] = useState("pending");
  const [payableSearch, setPayableSearch] = useState("");
  const bounds = periodBounds(from, to);
  const todayKey = format(today, "yyyy-MM-dd");

  const { data: accounts = [] } = useQuery({
    queryKey: ["financial-accounts", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("financial_accounts")
        .select("*")
        .eq("tenant_id", tenantId!)
        .eq("active", true)
        .order("name");
      if (error) throw error;
      return (data ?? []) as FinanceAccount[];
    },
  });

  const { data: categories = [] } = useQuery({
    queryKey: ["financial-categories", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("financial_categories")
        .select("*")
        .eq("tenant_id", tenantId!)
        .eq("active", true)
        .order("name");
      if (error) throw error;
      return (data ?? []) as FinanceCategory[];
    },
  });

  const { data: commandas = [], isLoading: salesLoading } = useQuery({
    queryKey: ["finance-commandas", tenantId, from, to],
    enabled: !!tenantId,
    queryFn: () =>
      fetchAll<ClosedComanda>(
        (rangeFrom, rangeTo) =>
          supabase
            .from("commandas")
            .select("*, commanda_items(*, professionals(full_name)), commanda_payments(id,method,amount,received_amount,created_at)")
            .eq("tenant_id", tenantId!)
            .eq("status", "closed")
            .gte("closed_at", bounds.start)
            .lte("closed_at", bounds.end)
            .order("closed_at", { ascending: true })
            .range(rangeFrom, rangeTo) as unknown as PromiseLike<{
            data: ClosedComanda[] | null;
            error: unknown;
          }>,
      ),
  });

  const { data: forecastCommandas = [], isLoading: forecastLoading } = useQuery({
    queryKey: ["finance-forecast-commandas", tenantId, from, to],
    enabled: !!tenantId,
    refetchInterval: 15_000,
    refetchOnWindowFocus: true,
    queryFn: () =>
      fetchAll<ForecastComanda>(
        (rangeFrom, rangeTo) =>
          supabase
            .from("commandas")
            .select("id,number,client_name,scheduled_at,total,source")
            .eq("tenant_id", tenantId!)
            .in("status", ["open", "awaiting_payment"])
            .gte("scheduled_at", bounds.start)
            .lte("scheduled_at", bounds.end)
            .order("scheduled_at", { ascending: true })
            .range(rangeFrom, rangeTo) as unknown as PromiseLike<{
            data: ForecastComanda[] | null;
            error: unknown;
          }>,
      ),
  });

  const { data: movementsUntilPeriod = [], isLoading: movementsLoading } = useQuery({
    queryKey: ["finance-movements-until", tenantId, to],
    enabled: !!tenantId,
    queryFn: () =>
      fetchAll<Movement>(
        (rangeFrom, rangeTo) =>
          supabase
            .from("cash_movements")
            .select("*")
            .eq("tenant_id", tenantId!)
            .lte("competence_date", to)
            .neq("status", "canceled")
            .order("competence_date", { ascending: false })
            .range(rangeFrom, rangeTo) as unknown as PromiseLike<{
            data: Movement[] | null;
            error: unknown;
          }>,
      ),
  });

  const { data: financePayables = [], isLoading: payablesLoading } = useQuery({
    queryKey: ["finance-payables", tenantId],
    enabled: !!tenantId,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cash_movements")
        .select("*")
        .eq("tenant_id", tenantId!)
        .eq("kind", "out")
        .order("due_date", { ascending: true, nullsFirst: false })
        .limit(3000);
      if (error) throw error;
      return ((data ?? []) as Movement[]).filter(
        (movement) =>
          movement.reference_type !== "commission_settlement" && !isSaleMovement(movement),
      );
    },
  });

  const categoryById = useMemo(
    () => new Map(categories.map((category) => [category.id, category])),
    [categories],
  );
  const accountById = useMemo(
    () => new Map(accounts.map((account) => [account.id, account])),
    [accounts],
  );

  const periodMovements = useMemo(
    () =>
      movementsUntilPeriod.filter(
        (movement) => movement.competence_date >= from && movement.competence_date <= to,
      ),
    [movementsUntilPeriod, from, to],
  );

  const cashMovements = useMemo(
    () =>
      movementsUntilPeriod.filter(
        (movement) =>
          movement.status === "paid" &&
          movement.affects_cash !== false &&
          movement.movement_date >= from &&
          movement.movement_date <= to,
      ),
    [movementsUntilPeriod, from, to],
  );

  const forecastRevenue = useMemo(
    () => sum(forecastCommandas, (cmd) => Number(cmd.total ?? 0)),
    [forecastCommandas],
  );

  const metrics = useMemo(() => {
    const grossSales = sum(
      commandas,
      (cmd) => Number(cmd.subtotal ?? 0) + Number(cmd.addition ?? 0),
    );
    const discounts = sum(commandas, (cmd) => Number(cmd.discount ?? 0));
    const netSales = sum(commandas, (cmd) => Number(cmd.total ?? 0));
    const commissions = sum(
      commandas.flatMap((cmd) => cmd.commanda_items ?? []),
      (item) => Number(item.commission_value ?? 0),
    );
    const productCost = sum(
      commandas
        .flatMap((cmd) => cmd.commanda_items ?? [])
        .filter((item) => item.kind === "product"),
      (item) => Number(item.unit_cost ?? 0) * Number(item.quantity ?? 1),
    );

    const otherRevenue = sum(
      periodMovements.filter(
        (movement) =>
          movement.kind === "in" && movement.affects_dre !== false && !isSaleMovement(movement),
      ),
      (movement) => movement.amount,
    );
    const outByGroup = (group: string) =>
      sum(
        periodMovements.filter(
          (movement) =>
            movement.kind === "out" &&
            movement.affects_dre !== false &&
            categoryById.get(movement.category_id ?? "")?.dre_group === group,
        ),
        (movement) => movement.amount,
      );
    const deductions = outByGroup("deduction");
    const movementVariableCosts = sum(
      periodMovements.filter((movement) => {
        const category = categoryById.get(movement.category_id ?? "");
        return (
          movement.kind === "out" &&
          movement.affects_dre !== false &&
          category?.dre_group === "variable_cost" &&
          movement.reference_type !== "commission"
        );
      }),
      (movement) => movement.amount,
    );
    const variableCosts = commissions + productCost + movementVariableCosts;
    const fixedExpenses = outByGroup("fixed_expense");
    const financialExpenses = outByGroup("financial_result");
    const nonOperatingExpenses = outByGroup("non_operating");
    const netRevenue = netSales + otherRevenue - deductions;
    const contributionMargin = netRevenue - variableCosts;
    const operatingResult = contributionMargin - fixedExpenses;
    const netResult = operatingResult - financialExpenses - nonOperatingExpenses;

    const cashIn = sum(
      cashMovements.filter((movement) => movement.kind === "in"),
      (movement) => movement.amount,
    );
    const cashOut = sum(
      cashMovements.filter((movement) => movement.kind === "out"),
      (movement) => movement.amount,
    );
    const overdueReceivables = sum(
      movementsUntilPeriod.filter(
        (movement) =>
          movement.status === "pending" &&
          movement.kind === "in" &&
          !!movement.due_date &&
          movement.due_date < todayKey,
      ),
      (movement) => movement.amount,
    );

    return {
      grossSales,
      discounts,
      netSales,
      otherRevenue,
      deductions,
      commissions,
      productCost,
      movementVariableCosts,
      variableCosts,
      fixedExpenses,
      financialExpenses,
      nonOperatingExpenses,
      netRevenue,
      contributionMargin,
      operatingResult,
      netResult,
      cashIn,
      cashOut,
      cashBalance: cashIn - cashOut,
      overdueReceivables,
      averageTicket: commandas.length ? netSales / commandas.length : 0,
      operatingMargin: netRevenue ? (operatingResult / netRevenue) * 100 : 0,
    };
  }, [commandas, periodMovements, movementsUntilPeriod, cashMovements, categoryById, todayKey]);

  const balance = useMemo(() => {
    const accountBalances = accounts.map((account) => {
      const movements = movementsUntilPeriod.filter(
        (movement) =>
          movement.status === "paid" &&
          movement.affects_cash !== false &&
          movement.account_id === account.id &&
          movement.movement_date <= to,
      );
      const current =
        Number(account.opening_balance ?? 0) +
        sum(
          movements.filter((movement) => movement.kind === "in"),
          (movement) => movement.amount,
        ) -
        sum(
          movements.filter((movement) => movement.kind === "out"),
          (movement) => movement.amount,
        );
      return { ...account, current };
    });
    const unassigned = movementsUntilPeriod.filter(
      (movement) =>
        movement.status === "paid" &&
        movement.affects_cash !== false &&
        !movement.account_id &&
        movement.movement_date <= to,
    );
    const unassignedBalance =
      sum(
        unassigned.filter((movement) => movement.kind === "in"),
        (movement) => movement.amount,
      ) -
      sum(
        unassigned.filter((movement) => movement.kind === "out"),
        (movement) => movement.amount,
      );
    const cashAndBanks = sum(accountBalances, (account) => account.current) + unassignedBalance;
    const receivables = sum(
      movementsUntilPeriod.filter(
        (movement) => movement.status === "pending" && movement.kind === "in",
      ),
      (movement) => movement.amount,
    );
    const payables = sum(
      movementsUntilPeriod.filter(
        (movement) => movement.status === "pending" && movement.kind === "out",
      ),
      (movement) => movement.amount,
    );
    const assets = cashAndBanks + receivables;
    return {
      accountBalances,
      unassignedBalance,
      cashAndBanks,
      receivables,
      payables,
      assets,
      equity: assets - payables,
    };
  }, [accounts, movementsUntilPeriod, to]);

  const payableMetrics = useMemo(() => {
    const pending = financePayables.filter(
      (movement) => movement.status === "pending" || movement.status === "scheduled",
    );
    const overdue = pending.filter(
      (movement) => !!movement.due_date && movement.due_date < todayKey,
    );
    const nextSevenDays = format(addDays(today, 7), "yyyy-MM-dd");
    const dueSoon = pending.filter(
      (movement) =>
        !!movement.due_date && movement.due_date >= todayKey && movement.due_date <= nextSevenDays,
    );
    const paidInPeriod = financePayables.filter(
      (movement) =>
        movement.status === "paid" &&
        movement.movement_date >= from &&
        movement.movement_date <= to,
    );
    return {
      pending,
      overdue,
      dueSoon,
      paidInPeriod,
      pendingTotal: sum(pending, (movement) => movement.amount),
      overdueTotal: sum(overdue, (movement) => movement.amount),
      dueSoonTotal: sum(dueSoon, (movement) => movement.amount),
      paidTotal: sum(paidInPeriod, (movement) => movement.amount),
    };
  }, [financePayables, from, to, today, todayKey]);

  const visiblePayables = useMemo(() => {
    const term = payableSearch
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();
    return financePayables.filter((movement) => {
      const matchesStatus =
        payableFilter === "all"
          ? true
          : payableFilter === "pending"
            ? movement.status === "pending" || movement.status === "scheduled"
            : movement.status === payableFilter;
      const haystack = [
        movement.description,
        movement.supplier_name,
        movement.document_number,
        categoryById.get(movement.category_id ?? "")?.name,
      ]
        .join(" ")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase();
      return matchesStatus && (!term || haystack.includes(term));
    });
  }, [categoryById, financePayables, payableFilter, payableSearch]);

  const chartData = useMemo(() => {
    const fromDate = localDate(from);
    const toDate = localDate(to);
    const daily = differenceInCalendarDays(toDate, fromDate) <= 62;
    const buckets = daily
      ? eachDayOfInterval({ start: fromDate, end: toDate })
      : eachMonthOfInterval({ start: fromDate, end: toDate });
    return buckets.map((bucket) => {
      const key = format(bucket, daily ? "yyyy-MM-dd" : "yyyy-MM");
      const revenue = sum(
        commandas.filter(
          (cmd) =>
            cmd.closed_at &&
            format(new Date(cmd.closed_at), daily ? "yyyy-MM-dd" : "yyyy-MM") === key,
        ),
        (cmd) => Number(cmd.total ?? 0),
      );
      const forecast = sum(
        forecastCommandas.filter(
          (cmd) =>
            cmd.scheduled_at &&
            format(new Date(cmd.scheduled_at), daily ? "yyyy-MM-dd" : "yyyy-MM") === key,
        ),
        (cmd) => Number(cmd.total ?? 0),
      );
      const expenses = sum(
        periodMovements.filter(
          (movement) =>
            movement.kind === "out" &&
            movement.affects_dre !== false &&
            movement.competence_date.startsWith(key),
        ),
        (movement) => movement.amount,
      );
      return {
        label: format(bucket, daily ? "dd/MM" : "MMM/yy", { locale: ptBR }),
        Realizado: revenue,
        Previsto: forecast,
        Despesas: expenses,
      };
    });
  }, [commandas, forecastCommandas, periodMovements, from, to]);

  const paymentEntries = useMemo(
    () => commandas.flatMap((cmd) => getCommandaPaymentEntries(cmd)),
    [commandas],
  );

  const paymentTotal = useMemo(
    () => sum(paymentEntries, (payment) => payment.amount),
    [paymentEntries],
  );

  const paymentMix = useMemo(() => {
    const grouped = new Map<string, { label: string; count: number; total: number }>();
    paymentEntries.forEach((payment) => {
      const key = payment.method ?? "unknown";
      const current = grouped.get(key) ?? {
        label: paymentLabel(payment.method),
        count: 0,
        total: 0,
      };
      current.count += 1;
      current.total += payment.amount;
      grouped.set(key, current);
    });
    return [...grouped.values()].sort((a, b) => b.total - a.total);
  }, [paymentEntries]);

  const latestReceipts = useMemo(
    () =>
      paymentEntries
        .slice()
        .sort(
          (a, b) =>
            new Date(b.createdAt ?? b.commanda.closed_at ?? 0).getTime() -
            new Date(a.createdAt ?? a.commanda.closed_at ?? 0).getTime(),
        )
        .slice(0, 6),
    [paymentEntries],
  );

  const professionalReport = useMemo(() => {
    const grouped = new Map<
      string,
      { name: string; services: number; revenue: number; commission: number }
    >();
    commandas.forEach((cmd) =>
      cmd.commanda_items
        ?.filter((item) => item.kind === "service")
        .forEach((item) => {
          const key = item.professional_id ?? "unassigned";
          const current = grouped.get(key) ?? {
            name: item.professionals?.full_name ?? "Sem profissional",
            services: 0,
            revenue: 0,
            commission: 0,
          };
          current.services += Number(item.quantity ?? 1);
          current.revenue += Number(item.unit_price) * Number(item.quantity ?? 1);
          current.commission += Number(item.commission_value ?? 0);
          grouped.set(key, current);
        }),
    );
    return [...grouped.values()].sort((a, b) => b.revenue - a.revenue);
  }, [commandas]);

  const itemReport = useMemo(() => {
    const grouped = new Map<
      string,
      { name: string; kind: string; quantity: number; revenue: number; cost: number }
    >();
    commandas.forEach((cmd) =>
      cmd.commanda_items?.forEach((item) => {
        const key = `${item.kind}:${item.name}`;
        const current = grouped.get(key) ?? {
          name: item.name,
          kind: item.kind,
          quantity: 0,
          revenue: 0,
          cost: 0,
        };
        current.quantity += Number(item.quantity ?? 1);
        current.revenue += Number(item.unit_price) * Number(item.quantity ?? 1);
        current.cost += Number(item.unit_cost ?? 0) * Number(item.quantity ?? 1);
        grouped.set(key, current);
      }),
    );
    return [...grouped.values()].sort((a, b) => b.revenue - a.revenue);
  }, [commandas]);

  function applyPreset(preset: "month" | "30" | "90" | "year") {
    if (preset === "month") {
      setFrom(format(startOfMonth(today), "yyyy-MM-dd"));
      setTo(format(endOfMonth(today), "yyyy-MM-dd"));
    } else if (preset === "year") {
      setFrom(format(startOfYear(today), "yyyy-MM-dd"));
      setTo(format(endOfYear(today), "yyyy-MM-dd"));
    } else {
      const days = preset === "30" ? 29 : 89;
      setFrom(format(addDays(today, -days), "yyyy-MM-dd"));
      setTo(format(today, "yyyy-MM-dd"));
    }
  }

  function refreshFinance() {
    queryClient.invalidateQueries({ queryKey: ["finance-movements-until"] });
    queryClient.invalidateQueries({ queryKey: ["finance-forecast-commandas"] });
    queryClient.invalidateQueries({ queryKey: ["finance-commandas"] });
    queryClient.invalidateQueries({ queryKey: ["financial-accounts"] });
    queryClient.invalidateQueries({ queryKey: ["financial-categories"] });
    queryClient.invalidateQueries({ queryKey: ["finance-payables"] });
  }

  async function cancelPayable(movement: Movement) {
    if (!tenantId) return;
    const reason = window.prompt(`Informe o motivo para cancelar “${movement.description}”:`);
    if (!reason?.trim()) return;
    const { error } = await (supabase as any).rpc("cancel_payable", {
      p_tenant_id: tenantId,
      p_movement_id: movement.id,
      p_reason: reason.trim(),
    });
    if (error) return toast.error(error.message);
    toast.success("Conta a pagar cancelada.");
    refreshFinance();
  }

  const loading = salesLoading || forecastLoading || movementsLoading || payablesLoading;

  return (
    <div className="space-y-6 max-w-[1500px] mx-auto pb-12">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold flex items-center gap-2">
            <Landmark className="h-7 w-7 text-primary" />
            Financeiro
          </h1>
          <p className="text-muted-foreground">
            Caixa, resultados e indicadores da operação em um único lugar.
          </p>
        </div>
        <Button onClick={() => setMovementOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Novo lançamento
        </Button>
      </div>

      <Card>
        <CardContent className="p-4 flex flex-wrap items-end gap-3">
          <div>
            <Label>De</Label>
            <Input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
          </div>
          <div>
            <Label>Até</Label>
            <Input
              type="date"
              value={to}
              min={from}
              onChange={(event) => setTo(event.target.value)}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => applyPreset("month")}>
              Este mês
            </Button>
            <Button size="sm" variant="outline" onClick={() => applyPreset("30")}>
              30 dias
            </Button>
            <Button size="sm" variant="outline" onClick={() => applyPreset("90")}>
              90 dias
            </Button>
            <Button size="sm" variant="outline" onClick={() => applyPreset("year")}>
              Este ano
            </Button>
          </div>
          <div className="ml-auto text-xs text-muted-foreground flex items-center gap-2">
            <CalendarDays className="h-4 w-4" />
            Competência: {dateBR(from)} a {dateBR(to)}
          </div>
        </CardContent>
      </Card>

      {loading && (
        <div className="text-sm text-muted-foreground">Atualizando indicadores financeiros…</div>
      )}

      <Tabs defaultValue="kpis" className="space-y-5">
        <TabsList className="h-auto w-full justify-start overflow-x-auto bg-muted/50 p-1">
          <TabsTrigger value="kpis">
            <TrendingUp className="h-4 w-4 mr-2" />
            KPIs
          </TabsTrigger>
          <TabsTrigger value="contas-pagar">
            <CalendarClock className="h-4 w-4 mr-2" />
            Contas a Pagar
          </TabsTrigger>
          <TabsTrigger value="fluxo">
            <WalletCards className="h-4 w-4 mr-2" />
            Fluxo
          </TabsTrigger>
          <TabsTrigger value="dre">
            <ReceiptText className="h-4 w-4 mr-2" />
            DRE
          </TabsTrigger>
          <TabsTrigger value="balanco">
            <Scale className="h-4 w-4 mr-2" />
            Balanço
          </TabsTrigger>
          <TabsTrigger value="relatorios">
            <FileBarChart className="h-4 w-4 mr-2" />
            Relatórios
          </TabsTrigger>
        </TabsList>

        <TabsContent value="kpis" className="space-y-5">
          <div className="grid sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6 gap-4">
            <MetricCard
              title="Faturamento previsto"
              value={brl(forecastRevenue)}
              hint={`${forecastCommandas.length} comandas abertas`}
              icon={CalendarDays}
              tone="warning"
            />
            <MetricCard
              title="Faturamento realizado"
              value={brl(metrics.netSales)}
              hint={`${commandas.length} vendas fechadas`}
              icon={BadgeDollarSign}
              tone="primary"
            />
            <MetricCard
              title="Ticket médio"
              value={brl(metrics.averageTicket)}
              hint="por comanda fechada"
              icon={ReceiptText}
            />
            <MetricCard
              title="Margem operacional"
              value={`${metrics.operatingMargin.toFixed(1)}%`}
              hint={brl(metrics.operatingResult)}
              icon={TrendingUp}
              tone={metrics.operatingResult >= 0 ? "success" : "danger"}
            />
            <MetricCard
              title="Geração de caixa"
              value={brl(metrics.cashBalance)}
              hint={`${brl(metrics.cashIn)} entrou`}
              icon={PiggyBank}
              tone={metrics.cashBalance >= 0 ? "success" : "danger"}
            />
            <MetricCard
              title="A receber vencido"
              value={brl(metrics.overdueReceivables)}
              hint="títulos pendentes"
              icon={CircleAlert}
              tone={metrics.overdueReceivables > 0 ? "warning" : "success"}
            />
          </div>

          <div className="grid xl:grid-cols-[2fr_1fr] gap-5">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  Faturamento previsto x realizado por competência
                </CardTitle>
              </CardHeader>
              <CardContent className="h-[330px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="label" fontSize={11} minTickGap={20} />
                    <YAxis
                      fontSize={11}
                      tickFormatter={(value) => `R$ ${Math.round(value / 1000)}k`}
                    />
                    <Tooltip formatter={(value: number | string) => brl(Number(value))} />
                    <Legend />
                    <Bar dataKey="Realizado" fill="var(--color-primary)" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Previsto" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Despesas" fill="var(--color-destructive)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Meios de pagamento</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {paymentMix.map((item) => {
                  const pct = paymentTotal ? (item.total / paymentTotal) * 100 : 0;
                  return (
                    <div key={item.label} className="space-y-1">
                      <div className="flex justify-between text-sm">
                        <span>{item.label}</span>
                        <span className="font-semibold">{brl(item.total)}</span>
                      </div>
                      <div className="h-2 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full bg-primary"
                          style={{ width: `${Math.min(100, pct)}%` }}
                        />
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        {item.count} recebimento(s) · {pct.toFixed(1)}%
                      </div>
                    </div>
                  );
                })}
                {paymentMix.length === 0 && <EmptyState text="Sem vendas no período." />}
                {latestReceipts.length > 0 && (
                  <div className="border-t pt-4">
                    <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                      Últimos recebimentos
                    </p>
                    <div className="space-y-3">
                      {latestReceipts.map((payment) => (
                        <div
                          key={`${payment.commanda.id}-${payment.method}-${payment.createdAt}`}
                          className="flex items-start justify-between gap-3 text-sm"
                        >
                          <div className="min-w-0">
                            <p className="truncate font-medium">
                              {payment.commanda.client_name || "Cliente"}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              #{payment.commanda.number} · {paymentLabel(payment.method)}
                              {payment.createdAt ? ` · ${dateBR(payment.createdAt)}` : ""}
                            </p>
                          </div>
                          <span className="shrink-0 font-semibold">{brl(payment.amount)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="contas-pagar" className="space-y-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold">Contas a Pagar</h2>
              <p className="text-sm text-muted-foreground">
                Obrigações, vencimentos e pagamentos do estabelecimento.
              </p>
            </div>
            <Button onClick={() => setPayableOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Nova conta a pagar
            </Button>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              title="Total pendente"
              value={brl(payableMetrics.pendingTotal)}
              hint={`${payableMetrics.pending.length} obrigações abertas`}
              icon={CalendarClock}
              tone="warning"
            />
            <MetricCard
              title="Vencidas"
              value={brl(payableMetrics.overdueTotal)}
              hint={`${payableMetrics.overdue.length} títulos em atraso`}
              icon={CircleAlert}
              tone={payableMetrics.overdue.length ? "danger" : "success"}
            />
            <MetricCard
              title="Próximos 7 dias"
              value={brl(payableMetrics.dueSoonTotal)}
              hint={`${payableMetrics.dueSoon.length} vencimentos próximos`}
              icon={CalendarDays}
            />
            <MetricCard
              title="Pago no período"
              value={brl(payableMetrics.paidTotal)}
              hint={`${payableMetrics.paidInPeriod.length} pagamentos realizados`}
              icon={CheckCircle2}
              tone="success"
            />
          </div>

          <Card>
            <CardContent className="space-y-4 p-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                <div className="relative min-w-0 flex-1">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={payableSearch}
                    onChange={(event) => setPayableSearch(event.target.value)}
                    placeholder="Pesquisar descrição, fornecedor, documento ou categoria…"
                    className="pl-10"
                  />
                </div>
                <div className="flex gap-1 overflow-x-auto rounded-lg border bg-muted/30 p-1">
                  {[
                    ["pending", "Pendentes"],
                    ["paid", "Pagas"],
                    ["canceled", "Canceladas"],
                    ["all", "Todas"],
                  ].map(([value, label]) => (
                    <Button
                      key={value}
                      size="sm"
                      variant={payableFilter === value ? "default" : "ghost"}
                      onClick={() => setPayableFilter(value)}
                    >
                      {label}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="overflow-x-auto rounded-xl border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Vencimento</TableHead>
                      <TableHead>Conta / fornecedor</TableHead>
                      <TableHead>Categoria</TableHead>
                      <TableHead>Parcela</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Valor</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visiblePayables.map((movement) => {
                      const isCommission = movement.reference_type === "commission";
                      const isPending =
                        movement.status === "pending" || movement.status === "scheduled";
                      const overdue =
                        isPending && !!movement.due_date && movement.due_date < todayKey;
                      return (
                        <TableRow key={movement.id}>
                          <TableCell className={overdue ? "font-semibold text-destructive" : ""}>
                            {movement.due_date ? dateBR(movement.due_date) : "—"}
                            {overdue && <div className="text-[10px]">Vencida</div>}
                          </TableCell>
                          <TableCell className="min-w-[240px]">
                            <div className="font-medium">{movement.description}</div>
                            <div className="text-xs text-muted-foreground">
                              {movement.supplier_name || movement.origin_label || "Sem fornecedor"}
                              {movement.document_number
                                ? ` · Doc. ${movement.document_number}`
                                : ""}
                            </div>
                          </TableCell>
                          <TableCell>
                            {categoryById.get(movement.category_id ?? "")?.name ??
                              movement.category ??
                              "Sem categoria"}
                          </TableCell>
                          <TableCell>
                            {movement.installment_number && movement.installment_count
                              ? `${movement.installment_number}/${movement.installment_count}`
                              : "Única"}
                          </TableCell>
                          <TableCell>
                            <PayableStatusBadge status={movement.status} overdue={overdue} />
                          </TableCell>
                          <TableCell className="text-right font-semibold">
                            {brl(movement.amount)}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              {isPending &&
                                (isCommission ? (
                                  <Button asChild size="sm" variant="outline">
                                    <Link to="/app/comissoes">Pagar em Comissões</Link>
                                  </Button>
                                ) : (
                                  <>
                                    <Button size="sm" onClick={() => setPayingPayable(movement)}>
                                      <Banknote className="mr-1 h-4 w-4" />
                                      Pagar
                                    </Button>
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      className="h-8 w-8"
                                      onClick={() => setEditingPayable(movement)}
                                      aria-label="Editar conta"
                                    >
                                      <Pencil className="h-4 w-4" />
                                    </Button>
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      className="h-8 w-8 text-destructive"
                                      onClick={() => cancelPayable(movement)}
                                      aria-label="Cancelar conta"
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </>
                                ))}
                              {movement.proof_url && (
                                <Button asChild size="icon" variant="ghost" className="h-8 w-8">
                                  <a
                                    href={movement.proof_url}
                                    target="_blank"
                                    rel="noreferrer"
                                    aria-label="Abrir comprovante"
                                  >
                                    <FileCheck2 className="h-4 w-4" />
                                  </a>
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
                {!visiblePayables.length && (
                  <EmptyState text="Nenhuma conta encontrada para este filtro." />
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="fluxo" className="space-y-5">
          <div className="grid sm:grid-cols-3 gap-4">
            <MetricCard
              title="Entradas realizadas"
              value={brl(metrics.cashIn)}
              hint="regime de caixa"
              icon={ArrowDownToLine}
              tone="success"
            />
            <MetricCard
              title="Saídas realizadas"
              value={brl(metrics.cashOut)}
              hint="regime de caixa"
              icon={ArrowUpFromLine}
              tone="danger"
            />
            <MetricCard
              title="Saldo do período"
              value={brl(metrics.cashBalance)}
              hint="entradas menos saídas"
              icon={PiggyBank}
              tone={metrics.cashBalance >= 0 ? "primary" : "danger"}
            />
          </div>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Faturamento previsto em agendamentos</CardTitle>
              <p className="text-sm text-muted-foreground">
                Comandas abertas contam somente como previsão e saem desta lista quando são fechadas
                ou canceladas.
              </p>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data e hora</TableHead>
                    <TableHead>Comanda</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Origem</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Valor previsto</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {forecastCommandas.map((cmd) => (
                    <TableRow key={cmd.id}>
                      <TableCell>
                        {cmd.scheduled_at
                          ? format(new Date(cmd.scheduled_at), "dd/MM/yyyy HH:mm")
                          : "—"}
                      </TableCell>
                      <TableCell>#{cmd.number}</TableCell>
                      <TableCell className="font-medium">{cmd.client_name || "Cliente"}</TableCell>
                      <TableCell>
                        {cmd.source === "online" ? "Link público" : "Agenda interna"}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className="border-amber-300 bg-amber-50 text-amber-700"
                        >
                          Previsto
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-semibold text-amber-700">
                        {brl(cmd.total)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {forecastCommandas.length === 0 && (
                <EmptyState text="Nenhuma comanda aberta prevista neste período." />
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Movimentações realizadas</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Descrição</TableHead>
                    <TableHead>Categoria</TableHead>
                    <TableHead>Conta</TableHead>
                    <TableHead>Pagamento</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {cashMovements.map((movement) => (
                    <TableRow key={movement.id}>
                      <TableCell>{dateBR(movement.movement_date)}</TableCell>
                      <TableCell>
                        <Badge variant={movement.kind === "in" ? "default" : "destructive"}>
                          {movement.kind === "in" ? "Entrada" : "Saída"}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-medium min-w-[220px]">
                        {movement.description || "Sem descrição"}
                      </TableCell>
                      <TableCell>
                        {categoryById.get(movement.category_id ?? "")?.name ?? "Sem categoria"}
                      </TableCell>
                      <TableCell>
                        {accountById.get(movement.account_id ?? "")?.name ?? "Sem conta"}
                      </TableCell>
                      <TableCell>{paymentLabel(movement.payment_method)}</TableCell>
                      <TableCell
                        className={`text-right font-semibold ${movement.kind === "in" ? "text-success" : "text-destructive"}`}
                      >
                        {movement.kind === "in" ? "+ " : "- "}
                        {brl(movement.amount)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {cashMovements.length === 0 && (
                <EmptyState text="Nenhuma movimentação realizada neste período." />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="dre" className="space-y-5">
          <div className="grid lg:grid-cols-[2fr_1fr] gap-5">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">DRE gerencial por competência</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1">
                <DreRow label="Receita bruta de vendas" value={metrics.grossSales} />
                <DreRow label="(-) Descontos comerciais" value={-metrics.discounts} muted />
                <DreRow label="Receita líquida de vendas" value={metrics.netSales} strong />
                <DreRow label="(+) Outras receitas" value={metrics.otherRevenue} />
                <DreRow label="(-) Impostos e deduções" value={-metrics.deductions} />
                <DreRow label="Receita operacional líquida" value={metrics.netRevenue} strong />
                <DreRow label="(-) Comissões" value={-metrics.commissions} />
                <DreRow label="(-) Custo dos produtos vendidos" value={-metrics.productCost} />
                <DreRow
                  label="(-) Outros custos variáveis"
                  value={-metrics.movementVariableCosts}
                />
                <DreRow label="Margem de contribuição" value={metrics.contributionMargin} strong />
                <DreRow label="(-) Despesas fixas" value={-metrics.fixedExpenses} />
                <DreRow
                  label="Resultado operacional"
                  value={metrics.operatingResult}
                  strong
                  highlight
                />
                <DreRow label="(-) Despesas financeiras" value={-metrics.financialExpenses} />
                <DreRow label="(-) Outras despesas" value={-metrics.nonOperatingExpenses} />
                <DreRow
                  label="Resultado líquido gerencial"
                  value={metrics.netResult}
                  strong
                  highlight
                />
              </CardContent>
            </Card>
            <div className="space-y-4">
              <MetricCard
                title="Resultado líquido"
                value={brl(metrics.netResult)}
                hint="após custos e despesas"
                icon={TrendingUp}
                tone={metrics.netResult >= 0 ? "success" : "danger"}
              />
              <MetricCard
                title="Margem de contribuição"
                value={brl(metrics.contributionMargin)}
                hint={
                  metrics.netRevenue
                    ? `${((metrics.contributionMargin / metrics.netRevenue) * 100).toFixed(1)}% da receita`
                    : "sem receita"
                }
                icon={BadgeDollarSign}
              />
              <Card>
                <CardContent className="p-4 text-xs text-muted-foreground leading-relaxed">
                  A DRE usa comandas fechadas para vendas e a data de competência dos lançamentos
                  para receitas e despesas. Comissões são reconhecidas quando geradas.
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="balanco" className="space-y-5">
          <div className="grid lg:grid-cols-2 gap-5">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Ativos</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {balance.accountBalances.map((account) => (
                  <BalanceRow key={account.id} label={account.name} value={account.current} />
                ))}
                {!!balance.unassignedBalance && (
                  <BalanceRow label="Movimentos sem conta" value={balance.unassignedBalance} />
                )}
                <BalanceRow label="Caixa e equivalentes" value={balance.cashAndBanks} strong />
                <BalanceRow label="Contas a receber" value={balance.receivables} />
                <BalanceRow label="Total de ativos" value={balance.assets} strong highlight />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Passivos e patrimônio</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <BalanceRow label="Contas a pagar" value={balance.payables} />
                <BalanceRow label="Total de passivos" value={balance.payables} strong />
                <BalanceRow
                  label="Patrimônio líquido gerencial"
                  value={balance.equity}
                  strong
                  highlight
                />
                <BalanceRow
                  label="Passivos + patrimônio"
                  value={balance.payables + balance.equity}
                  strong
                />
              </CardContent>
            </Card>
          </div>
          <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-4 text-sm text-muted-foreground flex gap-3">
            <CircleAlert className="h-5 w-5 text-amber-500 shrink-0" />
            <span>
              Este é um balanço gerencial da operação, formado por contas financeiras e títulos em
              aberto. Ativos imobilizados, estoque contábil, tributos e patrimônio societário exigem
              lançamentos específicos e validação do contador.
            </span>
          </div>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Títulos pendentes até {dateBR(to)}</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Vencimento</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Descrição</TableHead>
                    <TableHead>Categoria</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {movementsUntilPeriod
                    .filter((movement) => movement.status === "pending")
                    .map((movement) => (
                      <TableRow key={movement.id}>
                        <TableCell>{movement.due_date ? dateBR(movement.due_date) : "—"}</TableCell>
                        <TableCell>{movement.kind === "in" ? "A receber" : "A pagar"}</TableCell>
                        <TableCell>{movement.description}</TableCell>
                        <TableCell>
                          {categoryById.get(movement.category_id ?? "")?.name ?? "Sem categoria"}
                        </TableCell>
                        <TableCell className="text-right font-semibold">
                          {brl(movement.amount)}
                        </TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="relatorios" className="space-y-5">
          <div className="flex flex-wrap justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold">Relatórios operacionais</h2>
              <p className="text-sm text-muted-foreground">
                Detalhamento do faturamento selecionado.
              </p>
            </div>
            <Button variant="outline" onClick={() => exportSalesCsv(commandas)}>
              <Download className="h-4 w-4 mr-2" />
              Exportar vendas CSV
            </Button>
          </div>
          <div className="grid xl:grid-cols-2 gap-5">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Resultado por profissional</CardTitle>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Profissional</TableHead>
                      <TableHead>Serviços</TableHead>
                      <TableHead>Receita</TableHead>
                      <TableHead>Comissão</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {professionalReport.map((row) => (
                      <TableRow key={row.name}>
                        <TableCell className="font-medium">{row.name}</TableCell>
                        <TableCell>{row.services}</TableCell>
                        <TableCell>{brl(row.revenue)}</TableCell>
                        <TableCell>{brl(row.commission)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {professionalReport.length === 0 && (
                  <EmptyState text="Sem serviços fechados no período." />
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Serviços e produtos</CardTitle>
              </CardHeader>
              <CardContent className="overflow-x-auto max-h-[480px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Item</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Qtd.</TableHead>
                      <TableHead>Receita</TableHead>
                      <TableHead>Margem produto</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {itemReport.map((row) => (
                      <TableRow key={`${row.kind}-${row.name}`}>
                        <TableCell className="font-medium">{row.name}</TableCell>
                        <TableCell>{row.kind === "service" ? "Serviço" : "Produto"}</TableCell>
                        <TableCell>{row.quantity}</TableCell>
                        <TableCell>{brl(row.revenue)}</TableCell>
                        <TableCell>
                          {row.kind === "product" ? brl(row.revenue - row.cost) : "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Vendas fechadas</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Comanda</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Pagamento</TableHead>
                    <TableHead>Desconto</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {commandas
                    .slice()
                    .reverse()
                    .map((cmd) => (
                      <TableRow key={cmd.id}>
                        <TableCell>{cmd.closed_at ? dateBR(cmd.closed_at) : "—"}</TableCell>
                        <TableCell>#{cmd.number}</TableCell>
                        <TableCell>{cmd.client_name || "Cliente"}</TableCell>
                        <TableCell>{commandaPaymentLabel(cmd)}</TableCell>
                        <TableCell>{brl(cmd.discount)}</TableCell>
                        <TableCell className="text-right font-semibold">{brl(cmd.total)}</TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={movementOpen} onOpenChange={setMovementOpen}>
        {movementOpen && (
          <MovementDialog
            tenantId={tenantId}
            accounts={accounts}
            categories={categories}
            onDone={() => {
              setMovementOpen(false);
              refreshFinance();
            }}
          />
        )}
      </Dialog>

      <Dialog open={payableOpen} onOpenChange={setPayableOpen}>
        {payableOpen && (
          <PayableDialog
            tenantId={tenantId}
            accounts={accounts}
            categories={categories}
            onDone={() => {
              setPayableOpen(false);
              refreshFinance();
            }}
          />
        )}
      </Dialog>

      <Dialog open={!!editingPayable} onOpenChange={(open) => !open && setEditingPayable(null)}>
        {editingPayable && (
          <PayableDialog
            tenantId={tenantId}
            accounts={accounts}
            categories={categories}
            movement={editingPayable}
            onDone={() => {
              setEditingPayable(null);
              refreshFinance();
            }}
          />
        )}
      </Dialog>

      <Dialog open={!!payingPayable} onOpenChange={(open) => !open && setPayingPayable(null)}>
        {payingPayable && (
          <PayablePaymentDialog
            tenantId={tenantId}
            movement={payingPayable}
            accounts={accounts}
            onDone={() => {
              setPayingPayable(null);
              refreshFinance();
            }}
          />
        )}
      </Dialog>
    </div>
  );
}

function MetricCard({
  title,
  value,
  hint,
  icon: Icon,
  tone = "neutral",
}: {
  title: string;
  value: string;
  hint: string;
  icon: LucideIcon;
  tone?: "neutral" | "primary" | "success" | "danger" | "warning";
}) {
  const tones: Record<string, string> = {
    neutral: "bg-muted text-foreground",
    primary: "bg-primary/10 text-primary",
    success: "bg-success/10 text-success",
    danger: "bg-destructive/10 text-destructive",
    warning: "bg-amber-500/10 text-amber-600",
  };
  return (
    <Card>
      <CardContent className="p-4 flex items-start gap-3">
        <div className={`h-10 w-10 rounded-lg grid place-items-center shrink-0 ${tones[tone]}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <div className="text-[11px] uppercase font-semibold text-muted-foreground">{title}</div>
          <div className="text-xl font-bold truncate">{value}</div>
          <div className="text-xs text-muted-foreground mt-1">{hint}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function DreRow({
  label,
  value,
  strong,
  muted,
  highlight,
}: {
  label: string;
  value: number;
  strong?: boolean;
  muted?: boolean;
  highlight?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between gap-4 px-3 py-2.5 rounded-md ${highlight ? "bg-primary/5 border border-primary/15" : ""} ${strong ? "font-semibold border-t mt-1" : ""} ${muted ? "text-muted-foreground" : ""}`}
    >
      <span>{label}</span>
      <span
        className={value < 0 ? "text-destructive" : value > 0 && highlight ? "text-success" : ""}
      >
        {brl(value)}
      </span>
    </div>
  );
}

function BalanceRow({
  label,
  value,
  strong,
  highlight,
}: {
  label: string;
  value: number;
  strong?: boolean;
  highlight?: boolean;
}) {
  return (
    <div
      className={`flex justify-between gap-4 rounded-md px-3 py-2.5 ${strong ? "font-semibold border-t" : ""} ${highlight ? "bg-primary/5 text-primary" : ""}`}
    >
      <span>{label}</span>
      <span>{brl(value)}</span>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div className="text-sm text-muted-foreground text-center py-8">{text}</div>;
}

function MovementDialog({
  tenantId,
  accounts,
  categories,
  onDone,
}: {
  tenantId?: string;
  accounts: FinanceAccount[];
  categories: FinanceCategory[];
  onDone: () => void;
}) {
  const today = format(new Date(), "yyyy-MM-dd");
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    kind: "out",
    amount: "",
    description: "",
    accountId: accounts[0]?.id ?? "",
    categoryId: categories.find((category) => category.movement_kind === "out")?.id ?? "",
    status: "paid",
    movementDate: today,
    competenceDate: today,
    dueDate: today,
    paymentMethod: "pix",
    notes: "",
  });

  const visibleCategories = categories.filter((category) => category.movement_kind === form.kind);

  function changeKind(kind: string) {
    setForm((current) => ({
      ...current,
      kind,
      categoryId: categories.find((category) => category.movement_kind === kind)?.id ?? "",
    }));
  }

  async function save() {
    const amount = Number(form.amount);
    if (!tenantId) return;
    if (!amount || amount <= 0) return toast.error("Informe um valor maior que zero.");
    if (!form.description.trim()) return toast.error("Informe a descrição do lançamento.");
    if (!form.accountId || !form.categoryId) return toast.error("Selecione a conta e a categoria.");

    setBusy(true);
    const category = categories.find((item) => item.id === form.categoryId);
    const { error } = await supabase.from("cash_movements").insert({
      tenant_id: tenantId,
      kind: form.kind,
      amount,
      description: form.description.trim(),
      category: category?.name ?? null,
      account_id: form.accountId,
      category_id: form.categoryId,
      status: form.status,
      movement_date: form.movementDate,
      competence_date: form.competenceDate,
      due_date: form.dueDate || null,
      paid_at: form.status === "paid" ? new Date().toISOString() : null,
      payment_method: form.paymentMethod,
      source: "manual",
      notes: form.notes.trim() || null,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Lançamento financeiro salvo.");
    onDone();
  }

  return (
    <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>Novo lançamento financeiro</DialogTitle>
      </DialogHeader>
      <div className="space-y-4">
        <div className="grid sm:grid-cols-3 gap-3">
          <div>
            <Label>Tipo</Label>
            <Select value={form.kind} onValueChange={changeKind}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="in">Entrada</SelectItem>
                <SelectItem value="out">Saída</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Valor</Label>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={form.amount}
              onChange={(event) => setForm({ ...form, amount: event.target.value })}
              placeholder="0,00"
            />
          </div>
          <div>
            <Label>Status</Label>
            <Select value={form.status} onValueChange={(status) => setForm({ ...form, status })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="paid">Pago / recebido</SelectItem>
                <SelectItem value="pending">Pendente</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div>
          <Label>Descrição</Label>
          <Input
            value={form.description}
            onChange={(event) => setForm({ ...form, description: event.target.value })}
            placeholder="Ex.: conta de energia, assinatura mensal…"
          />
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <Label>Conta</Label>
            <Select
              value={form.accountId}
              onValueChange={(accountId) => setForm({ ...form, accountId })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                {accounts.map((account) => (
                  <SelectItem key={account.id} value={account.id}>
                    {account.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Categoria</Label>
            <Select
              value={form.categoryId}
              onValueChange={(categoryId) => setForm({ ...form, categoryId })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                {visibleCategories.map((category) => (
                  <SelectItem key={category.id} value={category.id}>
                    {category.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="grid sm:grid-cols-3 gap-3">
          <div>
            <Label>{form.status === "paid" ? "Data do movimento" : "Data prevista"}</Label>
            <Input
              type="date"
              value={form.movementDate}
              onChange={(event) => setForm({ ...form, movementDate: event.target.value })}
            />
          </div>
          <div>
            <Label>Competência</Label>
            <Input
              type="date"
              value={form.competenceDate}
              onChange={(event) => setForm({ ...form, competenceDate: event.target.value })}
            />
          </div>
          <div>
            <Label>Vencimento</Label>
            <Input
              type="date"
              value={form.dueDate}
              onChange={(event) => setForm({ ...form, dueDate: event.target.value })}
            />
          </div>
        </div>
        <div>
          <Label>Forma de pagamento</Label>
          <Select
            value={form.paymentMethod}
            onValueChange={(paymentMethod) => setForm({ ...form, paymentMethod })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="pix">PIX</SelectItem>
              <SelectItem value="cash">Dinheiro</SelectItem>
              <SelectItem value="credit">Cartão de crédito</SelectItem>
              <SelectItem value="debit">Cartão de débito</SelectItem>
              <SelectItem value="bank_transfer">Transferência</SelectItem>
              <SelectItem value="boleto">Boleto</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Observações</Label>
          <Textarea
            value={form.notes}
            onChange={(event) => setForm({ ...form, notes: event.target.value })}
            placeholder="Opcional"
          />
        </div>
      </div>
      <DialogFooter>
        <Button onClick={save} disabled={busy}>
          {busy ? "Salvando…" : "Salvar lançamento"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

function PayableStatusBadge({ status, overdue }: { status: string; overdue?: boolean }) {
  const label =
    status === "paid"
      ? "Paga"
      : status === "canceled"
        ? "Cancelada"
        : overdue
          ? "Vencida"
          : status === "scheduled"
            ? "Programada"
            : "Pendente";
  const className =
    status === "paid"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : status === "canceled" || overdue
        ? "border-rose-200 bg-rose-50 text-rose-700"
        : "border-amber-200 bg-amber-50 text-amber-700";
  return (
    <Badge variant="outline" className={className}>
      {label}
    </Badge>
  );
}

function PayableDialog({
  tenantId,
  accounts,
  categories,
  movement,
  onDone,
}: {
  tenantId?: string;
  accounts: FinanceAccount[];
  categories: FinanceCategory[];
  movement?: Movement;
  onDone: () => void;
}) {
  const today = format(new Date(), "yyyy-MM-dd");
  const expenseCategories = categories.filter((category) => category.movement_kind === "out");
  const [busy, setBusy] = useState(false);
  const [repeatMode, setRepeatMode] = useState("single");
  const [form, setForm] = useState({
    description: movement?.description ?? "",
    supplierName: movement?.supplier_name ?? "",
    documentNumber: movement?.document_number ?? "",
    amount: movement ? String(movement.amount) : "",
    categoryId: movement?.category_id ?? expenseCategories[0]?.id ?? "",
    accountId: movement?.account_id ?? "__none",
    competenceDate: movement?.competence_date ?? today,
    dueDate: movement?.due_date ?? today,
    occurrences: "12",
    intervalMonths: "1",
    paymentMethod: movement?.payment_method ?? "pix",
    notes: movement?.notes ?? "",
  });

  async function save() {
    if (!tenantId) return;
    const amount = Number(form.amount);
    if (!form.description.trim()) return toast.error("Informe a descrição da conta.");
    if (!amount || amount <= 0) return toast.error("Informe um valor maior que zero.");
    if (!form.categoryId) return toast.error("Selecione a categoria.");
    setBusy(true);

    const accountId = form.accountId === "__none" ? null : form.accountId;
    const args = movement
      ? {
          p_tenant_id: tenantId,
          p_movement_id: movement.id,
          p_description: form.description.trim(),
          p_supplier_name: form.supplierName,
          p_amount: amount,
          p_category_id: form.categoryId,
          p_account_id: accountId,
          p_competence_date: form.competenceDate,
          p_due_date: form.dueDate,
          p_document_number: form.documentNumber,
          p_payment_method: form.paymentMethod,
          p_notes: form.notes,
        }
      : {
          p_tenant_id: tenantId,
          p_description: form.description.trim(),
          p_supplier_name: form.supplierName,
          p_amount: amount,
          p_category_id: form.categoryId,
          p_account_id: accountId,
          p_competence_date: form.competenceDate,
          p_first_due_date: form.dueDate,
          p_occurrences: repeatMode === "single" ? 1 : Math.max(2, Number(form.occurrences)),
          p_interval_months: repeatMode === "single" ? 1 : Math.max(1, Number(form.intervalMonths)),
          p_document_number: form.documentNumber,
          p_payment_method: form.paymentMethod,
          p_notes: form.notes,
        };

    const { error } = await (supabase as any).rpc(
      movement ? "update_payable" : "create_payable_series",
      args,
    );
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(
      movement
        ? "Conta a pagar atualizada."
        : repeatMode === "single"
          ? "Conta a pagar criada."
          : "Série de contas a pagar criada.",
    );
    onDone();
  }

  return (
    <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
      <DialogHeader>
        <DialogTitle>{movement ? "Editar conta a pagar" : "Nova conta a pagar"}</DialogTitle>
      </DialogHeader>

      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-[1.4fr_1fr]">
          <div>
            <Label>Descrição</Label>
            <Input
              value={form.description}
              onChange={(event) => setForm({ ...form, description: event.target.value })}
              placeholder="Ex.: energia elétrica da unidade"
            />
          </div>
          <div>
            <Label>Fornecedor</Label>
            <Input
              value={form.supplierName}
              onChange={(event) => setForm({ ...form, supplierName: event.target.value })}
              placeholder="Ex.: concessionária de energia"
            />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <Label>Valor por lançamento</Label>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={form.amount}
              onChange={(event) => setForm({ ...form, amount: event.target.value })}
              placeholder="0,00"
            />
          </div>
          <div>
            <Label>Categoria</Label>
            <Select
              value={form.categoryId}
              onValueChange={(categoryId) => setForm({ ...form, categoryId })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                {expenseCategories.map((category) => (
                  <SelectItem key={category.id} value={category.id}>
                    {category.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Documento</Label>
            <Input
              value={form.documentNumber}
              onChange={(event) => setForm({ ...form, documentNumber: event.target.value })}
              placeholder="Nota, boleto ou contrato"
            />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <Label>Competência</Label>
            <Input
              type="date"
              value={form.competenceDate}
              onChange={(event) => setForm({ ...form, competenceDate: event.target.value })}
            />
          </div>
          <div>
            <Label>Vencimento</Label>
            <Input
              type="date"
              value={form.dueDate}
              onChange={(event) => setForm({ ...form, dueDate: event.target.value })}
            />
          </div>
          <div>
            <Label>Conta prevista</Label>
            <Select
              value={form.accountId}
              onValueChange={(accountId) => setForm({ ...form, accountId })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">Definir no pagamento</SelectItem>
                {accounts.map((account) => (
                  <SelectItem key={account.id} value={account.id}>
                    {account.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {!movement && (
          <div className="rounded-xl border bg-muted/20 p-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <Label>Repetição</Label>
                <Select value={repeatMode} onValueChange={setRepeatMode}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="single">Lançamento único</SelectItem>
                    <SelectItem value="monthly">Despesa recorrente</SelectItem>
                    <SelectItem value="installments">Parcelamento</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {repeatMode !== "single" && (
                <>
                  <div>
                    <Label>{repeatMode === "monthly" ? "Quantidade de meses" : "Parcelas"}</Label>
                    <Input
                      type="number"
                      min="2"
                      max="120"
                      value={form.occurrences}
                      onChange={(event) => setForm({ ...form, occurrences: event.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Intervalo em meses</Label>
                    <Input
                      type="number"
                      min="1"
                      max="24"
                      value={form.intervalMonths}
                      onChange={(event) => setForm({ ...form, intervalMonths: event.target.value })}
                    />
                  </div>
                </>
              )}
            </div>
            {repeatMode !== "single" && (
              <p className="mt-2 text-xs text-muted-foreground">
                Será criada uma obrigação de {brl(Number(form.amount || 0))} para cada vencimento.
              </p>
            )}
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label>Forma prevista</Label>
            <Select
              value={form.paymentMethod}
              onValueChange={(paymentMethod) => setForm({ ...form, paymentMethod })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pix">PIX</SelectItem>
                <SelectItem value="cash">Dinheiro</SelectItem>
                <SelectItem value="bank_transfer">Transferência</SelectItem>
                <SelectItem value="debit">Cartão de débito</SelectItem>
                <SelectItem value="credit">Cartão de crédito</SelectItem>
                <SelectItem value="boleto">Boleto</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Observações</Label>
            <Input
              value={form.notes}
              onChange={(event) => setForm({ ...form, notes: event.target.value })}
              placeholder="Centro responsável, contrato ou referência"
            />
          </div>
        </div>
      </div>

      <DialogFooter>
        <Button onClick={save} disabled={busy}>
          {busy ? "Salvando…" : movement ? "Salvar alterações" : "Criar conta a pagar"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

function PayablePaymentDialog({
  tenantId,
  movement,
  accounts,
  onDone,
}: {
  tenantId?: string;
  movement: Movement;
  accounts: FinanceAccount[];
  onDone: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [proof, setProof] = useState<File | null>(null);
  const [form, setForm] = useState({
    accountId: movement.account_id ?? accounts[0]?.id ?? "",
    paymentMethod: movement.payment_method ?? "pix",
    paymentDate: format(new Date(), "yyyy-MM-dd"),
    notes: "",
  });

  async function uploadProof() {
    if (!proof || !tenantId) return "";
    const extension = proof.name.split(".").pop() || "bin";
    const path = `${tenantId}/payable-proofs/${crypto.randomUUID()}.${extension}`;
    const { error } = await supabase.storage.from("assets").upload(path, proof, {
      upsert: false,
      contentType: proof.type || "application/octet-stream",
    });
    if (error) throw error;
    const { data, error: signedError } = await supabase.storage
      .from("assets")
      .createSignedUrl(path, 60 * 60 * 24 * 365 * 5);
    if (signedError) throw signedError;
    return data.signedUrl;
  }

  async function pay() {
    if (!tenantId) return;
    if (!form.accountId) return toast.error("Selecione a conta financeira.");
    setBusy(true);
    try {
      const proofUrl = await uploadProof();
      const { error } = await (supabase as any).rpc("settle_payable", {
        p_tenant_id: tenantId,
        p_movement_id: movement.id,
        p_account_id: form.accountId,
        p_payment_method: form.paymentMethod,
        p_payment_date: form.paymentDate,
        p_proof_url: proofUrl,
        p_notes: form.notes,
      });
      if (error) throw error;
      toast.success("Pagamento registrado e fluxo de caixa atualizado.");
      onDone();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Não foi possível registrar o pagamento.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <DialogContent className="sm:max-w-xl">
      <DialogHeader>
        <DialogTitle>Registrar pagamento</DialogTitle>
      </DialogHeader>

      <div className="rounded-xl border bg-muted/30 p-4">
        <div className="text-sm text-muted-foreground">
          {movement.supplier_name || "Conta a pagar"}
        </div>
        <div className="font-semibold">{movement.description}</div>
        <div className="mt-2 flex items-end justify-between gap-3">
          <div className="text-xs text-muted-foreground">
            Vencimento: {movement.due_date ? dateBR(movement.due_date) : "—"}
          </div>
          <div className="text-2xl font-bold text-primary">{brl(movement.amount)}</div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label>Conta financeira</Label>
          <Select
            value={form.accountId}
            onValueChange={(accountId) => setForm({ ...form, accountId })}
          >
            <SelectTrigger>
              <SelectValue placeholder="Selecione" />
            </SelectTrigger>
            <SelectContent>
              {accounts.map((account) => (
                <SelectItem key={account.id} value={account.id}>
                  {account.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Data do pagamento</Label>
          <Input
            type="date"
            value={form.paymentDate}
            onChange={(event) => setForm({ ...form, paymentDate: event.target.value })}
          />
        </div>
        <div>
          <Label>Forma de pagamento</Label>
          <Select
            value={form.paymentMethod}
            onValueChange={(paymentMethod) => setForm({ ...form, paymentMethod })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="pix">PIX</SelectItem>
              <SelectItem value="cash">Dinheiro</SelectItem>
              <SelectItem value="bank_transfer">Transferência</SelectItem>
              <SelectItem value="debit">Cartão de débito</SelectItem>
              <SelectItem value="credit">Cartão de crédito</SelectItem>
              <SelectItem value="boleto">Boleto</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Comprovante</Label>
          <Input
            type="file"
            accept="image/*,.pdf"
            onChange={(event) => setProof(event.target.files?.[0] ?? null)}
          />
        </div>
      </div>

      <div>
        <Label>Observações da baixa</Label>
        <Textarea
          value={form.notes}
          onChange={(event) => setForm({ ...form, notes: event.target.value })}
          rows={3}
          placeholder="Autorização, referência bancária ou informação complementar"
        />
      </div>

      <DialogFooter>
        <Button className="w-full" onClick={pay} disabled={busy}>
          <CheckCircle2 className="mr-2 h-4 w-4" />
          {busy ? "Processando…" : `Confirmar pagamento de ${brl(movement.amount)}`}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

function exportSalesCsv(commandas: ClosedComanda[]) {
  if (typeof document === "undefined") return;
  const escape = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  const rows = [
    ["Data", "Comanda", "Cliente", "Pagamento", "Subtotal", "Desconto", "Acréscimo", "Total"],
    ...commandas.map((cmd) => [
      cmd.closed_at ? dateBR(cmd.closed_at) : "",
      cmd.number,
      cmd.client_name,
      commandaPaymentLabel(cmd),
      cmd.subtotal,
      cmd.discount,
      cmd.addition,
      cmd.total,
    ]),
  ];
  const content = `\uFEFF${rows.map((row) => row.map(escape).join(";")).join("\n")}`;
  const url = URL.createObjectURL(new Blob([content], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `financeiro-vendas-${format(new Date(), "yyyy-MM-dd")}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

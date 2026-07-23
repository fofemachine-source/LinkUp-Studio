/* eslint-disable @typescript-eslint/no-explicit-any */
import { createFileRoute } from "@tanstack/react-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useCurrentTenant, useUserRole } from "@/hooks/use-tenant";
import { supabase } from "@/integrations/supabase/client";
import { makeLocalDateTime } from "@/lib/commandas";
import { repairAppointmentCommandasForDate } from "@/lib/commandas.functions";
import { brl, dateBR, timeBR } from "@/lib/format";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { addDays, endOfDay, format, isToday, startOfDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Banknote,
  CalendarClock,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  CreditCard,
  Minus,
  Package,
  Plus,
  ReceiptText,
  Search,
  ShoppingBag,
  Trash2,
  UserRound,
  WalletCards,
  XCircle,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/app/comandas")({
  component: FrenteDeCaixaPage,
});

type StatusFilter = "all" | "pending" | "closed" | "canceled";
type PaymentMethod = "pix" | "cash" | "debit" | "credit" | "vip";
type PaymentMode = PaymentMethod | "mixed";
type PaymentSplit = {
  id: string;
  method: Exclude<PaymentMethod, "vip">;
  amount: string;
  received: string;
};

const FINAL_COMANDA_STATUSES = new Set(["closed", "canceled", "cancelled", "no_show", "noshow"]);
const RECEIVABLE_COMANDA_STATUSES = new Set([
  "open",
  "awaiting_payment",
  "pending",
  "confirmed",
  "scheduled",
  "reserved",
]);

const PAYMENT_METHODS: Array<{
  value: PaymentMode;
  label: string;
  compact: string;
  icon: typeof Banknote;
}> = [
  { value: "pix", label: "Pix", compact: "Pix", icon: CircleDollarSign },
  { value: "cash", label: "Dinheiro", compact: "Dinheiro", icon: Banknote },
  { value: "debit", label: "Cartão de débito", compact: "Débito", icon: CreditCard },
  { value: "credit", label: "Cartão de crédito", compact: "Crédito", icon: CreditCard },
  { value: "mixed", label: "Pagamento misto", compact: "Misto", icon: WalletCards },
];

const SPLIT_METHODS: Array<{ value: PaymentSplit["method"]; label: string }> = [
  { value: "pix", label: "Pix" },
  { value: "cash", label: "Dinheiro" },
  { value: "debit", label: "Débito" },
  { value: "credit", label: "Crédito" },
];

function money(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : 0;
}

function sameDay(value: string | null | undefined, date: Date) {
  if (!value) return false;
  const current = new Date(value);
  return current >= startOfDay(date) && current <= endOfDay(date);
}

function linkedAppointmentOf(cmd: any) {
  const appointment = cmd.appointments;
  return Array.isArray(appointment) ? appointment[0] : appointment;
}

function scheduleOf(cmd: any) {
  return cmd.scheduled_at ?? linkedAppointmentOf(cmd)?.start_at ?? cmd.created_at;
}

function isReceivableCommanda(cmd: any) {
  const status = String(cmd.status ?? "").toLowerCase();
  if (!status) return Boolean(cmd.appointment_id || cmd.source === "online");
  if (FINAL_COMANDA_STATUSES.has(status)) return false;
  return RECEIVABLE_COMANDA_STATUSES.has(status) || Boolean(cmd.appointment_id || cmd.source === "online");
}

function normalizeSearch(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function professionalsOf(cmd: any) {
  return Array.from(
    new Set(
      (cmd.commanda_items ?? []).map((item: any) => item.professionals?.full_name).filter(Boolean),
    ),
  ) as string[];
}

function statusMeta(cmd: any) {
  if (cmd.status === "closed") {
    return {
      label: "Fechada",
      tone: "bg-emerald-50 text-emerald-700 border-emerald-200",
      edge: "border-l-emerald-500",
    };
  }
  if (cmd.status === "no_show") {
    return {
      label: "Não compareceu",
      tone: "bg-rose-50 text-rose-700 border-rose-200",
      edge: "border-l-rose-500",
    };
  }
  if (cmd.status === "canceled") {
    return {
      label: "Cancelada",
      tone: "bg-red-50 text-red-700 border-red-200",
      edge: "border-l-red-500",
    };
  }
  if (cmd.status === "awaiting_payment") {
    return {
      label: "Aguardando pagamento",
      tone: "bg-amber-50 text-amber-800 border-amber-200",
      edge: "border-l-amber-500",
    };
  }
  if (cmd.appointment_id || cmd.source === "online") {
    return {
      label: "Pré-comanda",
      tone: "bg-sky-50 text-sky-700 border-sky-200",
      edge: "border-l-sky-500",
    };
  }
  return {
    label: "Aberta",
    tone: "bg-orange-50 text-orange-700 border-orange-200",
    edge: "border-l-primary",
  };
}

function FrenteDeCaixaPage() {
  const tenantId = useCurrentTenant().data?.id;
  const queryClient = useQueryClient();
  const [date, setDate] = useState(new Date());
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("pending");
  const [selected, setSelected] = useState<{ cmd: any; checkout: boolean } | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const dateKey = format(date, "yyyy-MM-dd");

  const { data: allCommandas = [], isLoading } = useQuery({
    queryKey: ["pos-commandas", tenantId, dateKey],
    enabled: !!tenantId,
    refetchInterval: 15_000,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const selection =
        "*, appointments(start_at,end_at,status), commanda_items:commanda_items!commanda_items_commanda_tenant_fk(*, professionals(full_name)), clients(is_subscriber, whatsapp)";

      const fetchCommandas = async () => {
        const [pendingResult, closedResult, canceledResult] = await Promise.all([
          supabase
            .from("commandas")
            .select(selection)
            .eq("tenant_id", tenantId!)
            .not("status", "in", "(closed,canceled,cancelled,no_show,noshow,completed)")
            .order("scheduled_at", { ascending: true, nullsFirst: false })
            .limit(300),
          supabase
            .from("commandas")
            .select(selection)
            .eq("tenant_id", tenantId!)
            .eq("status", "closed")
            .order("closed_at", { ascending: false })
            .limit(300),
          supabase
            .from("commandas")
            .select(selection)
            .eq("tenant_id", tenantId!)
            .in("status", ["canceled", "no_show"])
            .order("scheduled_at", { ascending: false, nullsFirst: false })
            .limit(300),
        ]);

        const error = pendingResult.error ?? closedResult.error ?? canceledResult.error;
        if (error) throw error;
        return [
          ...(pendingResult.data ?? []),
          ...(closedResult.data ?? []),
          ...(canceledResult.data ?? []),
        ];
      };

      try {
        await repairAppointmentCommandasForDate({
          data: { tenantId: tenantId!, date: dateKey },
        });
      } catch (repairError) {
        console.error("Não foi possível sincronizar agendamentos com comandas.", repairError);
      }

      return fetchCommandas();
    },
  });

  const dayCommandas = useMemo(
    () =>
      allCommandas.filter((cmd: any) =>
        cmd.status === "closed" ? sameDay(cmd.closed_at, date) : sameDay(scheduleOf(cmd), date),
      ),
    [allCommandas, date],
  );

  const open = useMemo(
    () =>
      dayCommandas.filter((cmd: any) => isReceivableCommanda(cmd)),
    [dayCommandas],
  );
  const closed = useMemo(
    () => dayCommandas.filter((cmd: any) => cmd.status === "closed"),
    [dayCommandas],
  );
  const canceled = useMemo(
    () => dayCommandas.filter((cmd: any) => cmd.status === "canceled" || cmd.status === "no_show"),
    [dayCommandas],
  );

  const filteredCommandas = useMemo(() => {
    const term = normalizeSearch(search);
    const statusFiltered = dayCommandas.filter((cmd: any) => {
      if (statusFilter === "pending") return isReceivableCommanda(cmd);
      if (statusFilter === "closed") return cmd.status === "closed";
      if (statusFilter === "canceled") return cmd.status === "canceled" || cmd.status === "no_show";
      return true;
    });

    return statusFiltered
      .filter((cmd: any) => {
        if (!term) return true;
        const haystack = normalizeSearch(
          [cmd.number, cmd.client_name, cmd.clients?.whatsapp, ...professionalsOf(cmd)].join(" "),
        );
        return haystack.includes(term);
      })
      .sort((a: any, b: any) => {
        const priority = (value: string) =>
          value === "awaiting_payment"
            ? 0
            : value === "open"
              ? 1
              : RECEIVABLE_COMANDA_STATUSES.has(value)
                ? 2
                : value === "closed"
                  ? 3
                  : 4;
        const statusDiff =
          priority(String(a.status ?? "").toLowerCase()) -
          priority(String(b.status ?? "").toLowerCase());
        if (statusDiff !== 0) return statusDiff;
        return new Date(scheduleOf(a)).getTime() - new Date(scheduleOf(b)).getTime();
      });
  }, [dayCommandas, search, statusFilter]);

  const listCopy = {
    pending: {
      title: "Comandas a receber",
      emptyTitle: "Nenhuma comanda aguardando recebimento",
      emptyHint:
        "As comandas pagas saem automaticamente desta visão e ficam disponíveis em Fechadas.",
    },
    closed: {
      title: "Comandas fechadas",
      emptyTitle: "Nenhuma comanda fechada neste dia",
      emptyHint: "As vendas concluídas e os respectivos pagamentos aparecerão aqui.",
    },
    canceled: {
      title: "Comandas canceladas",
      emptyTitle: "Nenhuma comanda cancelada neste dia",
      emptyHint: "Cancelamentos e não comparecimentos aparecerão aqui.",
    },
    all: {
      title: "Histórico de comandas",
      emptyTitle: "Nenhuma comanda encontrada",
      emptyHint: "Não existem movimentações para a data e os critérios pesquisados.",
    },
  }[statusFilter];

  const pendingTotal = open.reduce((sum: number, cmd: any) => sum + money(cmd.total), 0);
  const receivedTotal = closed.reduce((sum: number, cmd: any) => sum + money(cmd.total), 0);
  const expectedTotal = pendingTotal + receivedTotal;

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ["pos-commandas"] });
    queryClient.invalidateQueries({
      predicate: (query) => String(query.queryKey[0] ?? "").startsWith("finance-"),
    });
  }

  function openCommanda(cmd: any, checkout = false) {
    const canMoveToCheckout =
      checkout &&
      isReceivableCommanda(cmd) &&
      String(cmd.status ?? "").toLowerCase() !== "awaiting_payment";
    const next = canMoveToCheckout ? { ...cmd, status: "awaiting_payment" } : cmd;
    setSelected({ cmd: next, checkout });

    if (canMoveToCheckout) {
      void supabase
        .from("commandas")
        .update({ status: "awaiting_payment", updated_at: new Date().toISOString() })
        .eq("id", cmd.id)
        .eq("tenant_id", tenantId!)
        .then(({ error }) => {
          if (error) toast.error("Não foi possível atualizar o status da comanda.");
          else refresh();
        });
    }
  }

  const manualSchedule = isToday(date)
    ? new Date().toISOString()
    : makeLocalDateTime(format(date, "yyyy-MM-dd"), "09:00").toISOString();

  return (
    <div className="mx-auto max-w-[1540px] space-y-4 pb-8">
      <section className="rounded-2xl border bg-card p-4 shadow-sm md:p-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-primary">
              <ReceiptText className="h-5 w-5" />
              <span className="text-xs font-bold uppercase tracking-[0.18em]">
                Operação de caixa
              </span>
            </div>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight md:text-3xl">
              Frente de Caixa
            </h1>
            <p className="text-sm text-muted-foreground">
              Localize, confira e receba comandas sem sair desta tela.
            </p>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="flex h-10 items-center rounded-lg border bg-background">
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9"
                onClick={() => setDate(addDays(date, -1))}
                aria-label="Dia anterior"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Input
                type="date"
                value={format(date, "yyyy-MM-dd")}
                onChange={(event) =>
                  event.target.value && setDate(new Date(`${event.target.value}T12:00:00`))
                }
                className="h-9 w-[145px] border-0 px-2 text-center shadow-none focus-visible:ring-0"
              />
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9"
                onClick={() => setDate(addDays(date, 1))}
                aria-label="Próximo dia"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>

            <Dialog open={newOpen} onOpenChange={setNewOpen}>
              <DialogTrigger asChild>
                <Button className="h-10 whitespace-nowrap px-5">
                  <Plus className="mr-2 h-4 w-4" />
                  Nova comanda
                </Button>
              </DialogTrigger>
              <NewCmdDialog
                tenantId={tenantId}
                scheduledAt={manualSchedule}
                onCreated={(cmd: any) => {
                  setNewOpen(false);
                  refresh();
                  openCommanda({ ...cmd, commanda_items: [], clients: null });
                }}
              />
            </Dialog>
          </div>
        </div>

        <div className="mt-4 grid gap-3 xl:grid-cols-[minmax(300px,1fr)_auto]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar cliente, telefone, comanda ou profissional..."
              className="h-11 bg-background pl-10 pr-10"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label="Limpar pesquisa"
              >
                <XCircle className="h-4 w-4" />
              </button>
            )}
          </div>

          <div className="flex gap-1 overflow-x-auto rounded-xl border bg-muted/40 p-1">
            {(
              [
                ["pending", "A receber", open.length],
                ["closed", "Fechadas", closed.length],
                ["canceled", "Canceladas", canceled.length],
                ["all", "Histórico", dayCommandas.length],
              ] as Array<[StatusFilter, string, number]>
            ).map(([value, label, count]) => (
              <Button
                key={value}
                type="button"
                variant={statusFilter === value ? "default" : "ghost"}
                size="sm"
                className="h-8 whitespace-nowrap px-3"
                onClick={() => setStatusFilter(value)}
              >
                {label}
                <span
                  className={`ml-1.5 rounded-full px-1.5 text-[10px] ${statusFilter === value ? "bg-primary-foreground/15" : "bg-background"}`}
                >
                  {count}
                </span>
              </Button>
            ))}
          </div>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-2 lg:grid-cols-6">
        <SummaryMetric
          title="Previsto no dia"
          value={brl(expectedTotal)}
          hint="Abertas + recebidas"
          icon={CalendarDays}
        />
        <SummaryMetric
          title="Recebido"
          value={brl(receivedTotal)}
          hint="Valor efetivado"
          icon={CircleDollarSign}
          tone="success"
        />
        <SummaryMetric
          title="Pendente"
          value={brl(pendingTotal)}
          hint="Ainda a receber"
          icon={Clock3}
          tone="warning"
        />
        <SummaryMetric
          title="Abertas"
          value={String(open.length)}
          hint="Comandas ativas"
          icon={ReceiptText}
        />
        <SummaryMetric
          title="Fechadas"
          value={String(closed.length)}
          hint="Vendas concluídas"
          icon={Check}
          tone="success"
        />
        <SummaryMetric
          title="Canceladas"
          value={String(canceled.length)}
          hint="Canceladas ou faltas"
          icon={XCircle}
          tone="danger"
        />
      </section>

      <section className="rounded-2xl border bg-card shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3 md:px-5">
          <div>
            <h2 className="font-semibold">
              {listCopy.title} · {format(date, "dd 'de' MMMM", { locale: ptBR })}
            </h2>
            <p className="text-xs text-muted-foreground">
              {filteredCommandas.length}{" "}
              {filteredCommandas.length === 1 ? "resultado" : "resultados"} · atualização automática
            </p>
          </div>
          {!isToday(date) && (
            <Button variant="ghost" size="sm" onClick={() => setDate(new Date())}>
              Voltar para hoje
            </Button>
          )}
        </div>

        <div className="p-3 md:p-4">
          {isLoading ? (
            <div className="grid gap-3 lg:grid-cols-2">
              {[0, 1, 2, 3].map((index) => (
                <div key={index} className="h-44 animate-pulse rounded-xl bg-muted" />
              ))}
            </div>
          ) : filteredCommandas.length === 0 ? (
            <div className="flex min-h-56 flex-col items-center justify-center rounded-xl border border-dashed bg-muted/20 p-8 text-center">
              <Search className="mb-3 h-8 w-8 text-muted-foreground/60" />
              <div className="font-medium">{listCopy.emptyTitle}</div>
              <p className="mt-1 max-w-md text-sm text-muted-foreground">
                {search ? "Ajuste o termo pesquisado ou limpe a busca. " : ""}
                {listCopy.emptyHint}
              </p>
            </div>
          ) : (
            <div className="grid gap-3 lg:grid-cols-2">
              {filteredCommandas.map((cmd: any) => (
                <CommandaCard
                  key={cmd.id}
                  cmd={cmd}
                  onOpen={() => openCommanda(cmd)}
                  onCheckout={() => openCommanda(cmd, true)}
                />
              ))}
            </div>
          )}
        </div>
      </section>

      <Sheet open={!!selected} onOpenChange={(visible) => !visible && setSelected(null)}>
        {selected && (
          <CmdDetail
            key={selected.cmd.id}
            cmd={selected.cmd}
            tenantId={tenantId}
            checkoutFocus={selected.checkout}
            onDone={() => {
              setSelected(null);
              setStatusFilter("pending");
              refresh();
            }}
          />
        )}
      </Sheet>
    </div>
  );
}

function SummaryMetric({
  title,
  value,
  hint,
  icon: Icon,
  tone = "default",
}: {
  title: string;
  value: string;
  hint: string;
  icon: typeof Banknote;
  tone?: "default" | "success" | "warning" | "danger";
}) {
  const toneClasses = {
    default: "text-foreground bg-primary/10 text-primary",
    success: "text-emerald-700 bg-emerald-50",
    warning: "text-amber-700 bg-amber-50",
    danger: "text-red-700 bg-red-50",
  };

  return (
    <div className="rounded-xl border bg-card p-3 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            {title}
          </div>
          <div
            className={`mt-1 truncate text-xl font-bold ${tone === "default" ? "text-foreground" : toneClasses[tone].split(" ")[0]}`}
          >
            {value}
          </div>
        </div>
        <div className={`rounded-lg p-2 ${toneClasses[tone]}`}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <div className="mt-1 truncate text-[11px] text-muted-foreground">{hint}</div>
    </div>
  );
}

function CommandaCard({
  cmd,
  onOpen,
  onCheckout,
}: {
  cmd: any;
  onOpen: () => void;
  onCheckout: () => void;
}) {
  const meta = statusMeta(cmd);
  const schedule = scheduleOf(cmd);
  const items = cmd.commanda_items ?? [];
  const services = items.filter((item: any) => item.kind === "service");
  const products = items.filter((item: any) => item.kind === "product");
  const professionals = professionalsOf(cmd);
  const canReceive = isReceivableCommanda(cmd);
  const sourceLabel =
    cmd.source === "online"
      ? "Agendamento online"
      : cmd.appointment_id
        ? "Agendamento"
        : "Comanda manual";

  return (
    <Card
      className={`group overflow-hidden border-l-4 transition-all hover:-translate-y-0.5 hover:shadow-md ${meta.edge}`}
    >
      <CardContent className="p-0">
        <button type="button" onClick={onOpen} className="w-full p-4 text-left">
          <div className="flex items-start justify-between gap-4">
            <div className="flex min-w-0 items-start gap-3">
              <div className="flex h-11 w-14 shrink-0 flex-col items-center justify-center rounded-lg bg-muted text-foreground">
                <Clock3 className="mb-0.5 h-3.5 w-3.5 text-primary" />
                <span className="text-xs font-bold">{schedule ? timeBR(schedule) : "--:--"}</span>
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate font-semibold">
                    {cmd.client_name || "Cliente não identificado"}
                  </span>
                  <span className="text-xs text-muted-foreground">#{cmd.number}</span>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <UserRound className="h-3 w-3" />
                    {professionals.join(", ") || "Profissional a definir"}
                  </span>
                  <span>{sourceLabel}</span>
                </div>
              </div>
            </div>
            <div className="shrink-0 text-right">
              <div className="text-lg font-bold text-foreground">{brl(cmd.total)}</div>
              <Badge
                variant="outline"
                className={`mt-1 whitespace-nowrap text-[10px] ${meta.tone}`}
              >
                {meta.label}
              </Badge>
            </div>
          </div>

          <div className="mt-3 grid gap-2 rounded-lg bg-muted/35 p-3 sm:grid-cols-2">
            <ItemPreview
              icon={ShoppingBag}
              label="Serviços"
              items={services.map((item: any) => item.name)}
              empty="Nenhum serviço"
            />
            <ItemPreview
              icon={Package}
              label="Produtos"
              items={products.map((item: any) => item.name)}
              empty="Nenhum produto"
            />
          </div>
        </button>

        <div className="flex items-center justify-between border-t bg-muted/15 px-4 py-2.5">
          <span className="text-xs text-muted-foreground">
            {items.reduce((sum: number, item: any) => sum + Number(item.quantity ?? 1), 0)} itens
            {cmd.clients?.whatsapp ? ` · ${cmd.clients.whatsapp}` : ""}
          </span>
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <Button variant="ghost" size="sm" className="h-8" onClick={onOpen}>
              Abrir
            </Button>
            {canReceive && (
              <Button size="sm" className="h-8 px-4" onClick={onCheckout}>
                Receber
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ItemPreview({
  icon: Icon,
  label,
  items,
  empty,
}: {
  icon: typeof Package;
  label: string;
  items: string[];
  empty: string;
}) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        <Icon className="h-3 w-3" />
        {label}
      </div>
      <div className="mt-1 truncate text-xs font-medium">
        {items.length ? items.slice(0, 2).join(", ") : empty}
      </div>
      {items.length > 2 && (
        <div className="text-[10px] text-muted-foreground">+ {items.length - 2} adicionais</div>
      )}
    </div>
  );
}

function NewCmdDialog({ tenantId, scheduledAt, onCreated }: any) {
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  async function create() {
    if (!tenantId) return;
    if (!name.trim()) return toast.error("Informe o nome do cliente.");
    setSaving(true);

    const { data: last } = await supabase
      .from("commandas")
      .select("number")
      .eq("tenant_id", tenantId)
      .order("number", { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data, error } = await supabase
      .from("commandas")
      .insert({
        tenant_id: tenantId,
        client_name: name.trim(),
        number: Number(last?.number ?? 0) + 1,
        status: "open",
        scheduled_at: scheduledAt,
        source: "manual",
      })
      .select("*")
      .single();

    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Comanda aberta e pronta para receber itens.");
    onCreated(data);
  }

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Nova comanda manual</DialogTitle>
      </DialogHeader>
      <div className="space-y-2">
        <Label htmlFor="new-client-name">Nome do cliente</Label>
        <Input
          id="new-client-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => event.key === "Enter" && create()}
          autoFocus
        />
      </div>
      <DialogFooter>
        <Button onClick={create} disabled={saving}>
          {saving ? "Abrindo..." : "Abrir comanda"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

function CmdDetail({ cmd, tenantId, checkoutFocus, onDone }: any) {
  const { data: role } = useUserRole(tenantId);
  const isAdmin = role !== "barber";
  const isClosed = cmd.status === "closed";
  const isCanceled = cmd.status === "canceled" || cmd.status === "no_show";
  const canEditSale = !isClosed && !isCanceled;
  const meta = statusMeta(cmd);

  const [items, setItems] = useState<any[]>(cmd.commanda_items ?? []);
  const [tab, setTab] = useState<"service" | "product">("service");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [professionalId, setProfessionalId] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [discount, setDiscount] = useState(money(cmd.discount));
  const [addition, setAddition] = useState(money(cmd.addition));
  const [notes, setNotes] = useState(cmd.notes ?? "");
  const initialPayment = (
    ["pix", "cash", "debit", "credit", "vip", "mixed"].includes(cmd.payment_method)
      ? cmd.payment_method
      : "pix"
  ) as PaymentMode;
  const [paymentMode, setPaymentMode] = useState<PaymentMode>(initialPayment);
  const [subscriptionExtraPayment, setSubscriptionExtraPayment] =
    useState<Exclude<PaymentMethod, "vip">>("pix");
  const [cashReceived, setCashReceived] = useState(money(cmd.amount_received));
  const [splits, setSplits] = useState<PaymentSplit[]>([]);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editPrice, setEditPrice] = useState("");
  const [saving, setSaving] = useState(false);

  const { data: services = [] } = useQuery({
    queryKey: ["pos-services", tenantId],
    enabled: !!tenantId,
    queryFn: async () =>
      (
        await supabase
          .from("services")
          .select("*")
          .eq("tenant_id", tenantId)
          .eq("active", true)
          .order("name")
      ).data ?? [],
  });
  const { data: products = [] } = useQuery({
    queryKey: ["pos-products", tenantId],
    enabled: !!tenantId,
    queryFn: async () =>
      (
        await supabase
          .from("products")
          .select("*")
          .eq("tenant_id", tenantId)
          .eq("active", true)
          .order("name")
      ).data ?? [],
  });
  const { data: professionals = [] } = useQuery({
    queryKey: ["pos-professionals", tenantId],
    enabled: !!tenantId,
    queryFn: async () =>
      (
        await supabase
          .from("professionals")
          .select("*")
          .eq("tenant_id", tenantId)
          .eq("active", true)
          .order("full_name")
      ).data ?? [],
  });
  const { data: appointment } = useQuery({
    queryKey: ["pos-appointment", cmd.appointment_id],
    enabled: !!cmd.appointment_id,
    queryFn: async () =>
      (await supabase.from("appointments").select("*").eq("id", cmd.appointment_id).maybeSingle())
        .data,
  });

  const initialSchedule = cmd.scheduled_at ?? appointment?.start_at ?? cmd.created_at;
  const [postponeDate, setPostponeDate] = useState(format(new Date(initialSchedule), "yyyy-MM-dd"));
  const [postponeTime, setPostponeTime] = useState(format(new Date(initialSchedule), "HH:mm"));

  useEffect(() => {
    const nextSchedule = appointment?.start_at ?? cmd.scheduled_at;
    if (!nextSchedule) return;
    setPostponeDate(format(new Date(nextSchedule), "yyyy-MM-dd"));
    setPostponeTime(format(new Date(nextSchedule), "HH:mm"));
  }, [appointment?.start_at, cmd.scheduled_at]);

  const { data: clientDetails } = useQuery({
    queryKey: ["pos-client-details", cmd.client_id, cmd.client_name],
    enabled: !!cmd.client_name,
    queryFn: async () => {
      let query = supabase.from("clients").select("*").eq("tenant_id", tenantId);
      query = cmd.client_id
        ? query.eq("id", cmd.client_id)
        : query.eq("full_name", cmd.client_name);
      return (await query.maybeSingle()).data;
    },
  });

  const linkedSubscriptionId = cmd.subscription_id ?? appointment?.subscription_id ?? null;

  const { data: activeSubscription } = useQuery({
    queryKey: [
      "pos-active-subscription",
      tenantId,
      linkedSubscriptionId,
      cmd.client_id,
      cmd.client_name,
    ],
    enabled: !!tenantId && (!!linkedSubscriptionId || !!cmd.client_name),
    queryFn: async () => {
      let query = (supabase as any)
        .from("client_subscriptions")
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("status", "active");
      query = linkedSubscriptionId
        ? query.eq("id", linkedSubscriptionId)
        : cmd.client_id
          ? query.eq("client_id", cmd.client_id)
          : query.ilike("subscriber_name", cmd.client_name);
      const { data: contracts, error } = await query.order("created_at", { ascending: false }).limit(1);
      if (error || !contracts?.[0]) return null;
      const contract = contracts[0];
      const [{ data: plan }, { data: benefits }] = await Promise.all([
        (supabase as any).from("subscription_plans").select("*").eq("id", contract.plan_id).maybeSingle(),
        (supabase as any)
          .from("subscription_plan_benefits")
          .select("*")
          .eq("plan_id", contract.plan_id)
          .eq("active", true),
      ]);
      return { ...contract, plan, benefits: benefits ?? [] };
    },
  });

  const isSubscriberClient = Boolean(activeSubscription);
  const startOfMonthStr = new Date(
    new Date().getFullYear(),
    new Date().getMonth(),
    1,
  ).toISOString();
  const { data: usageCount = 0 } = useQuery({
    queryKey: ["client-subscription-usage", activeSubscription?.id, startOfMonthStr],
    enabled: !!activeSubscription?.id,
    queryFn: async () => {
      const { count } = await (supabase as any)
        .from("subscription_usages")
        .select("id", { count: "exact", head: true })
        .eq("subscription_id", activeSubscription.id)
        .gte("used_at", startOfMonthStr);
      return count ?? 0;
    },
  });

  const subtotal = money(
    items.reduce((sum, item) => sum + money(item.unit_price) * Number(item.quantity ?? 1), 0),
  );
  const itemLineTotal = (item: any) =>
    money(money(item.unit_price) * Number(item.quantity ?? 1));
  const coveredServiceIds = new Set(
    (activeSubscription?.benefits ?? [])
      .filter((benefit: any) => benefit.benefit_type === "service" && benefit.service_id)
      .map((benefit: any) => benefit.service_id),
  );
  const isItemCoveredBySubscription = (item: any) => {
    if (item.covered_by_subscription === true) return true;
    if (item.covered_by_subscription === false && item.subscription_id) return false;

    return Boolean(
      activeSubscription &&
        item.kind === "service" &&
        item.ref_id &&
        coveredServiceIds.has(item.ref_id),
    );
  };
  const itemBillableTotal = (item: any) => {
    const storedBillable = Number(item.billable_amount);
    if (item.billable_amount !== null && item.billable_amount !== undefined && Number.isFinite(storedBillable)) {
      return money(storedBillable);
    }

    return isItemCoveredBySubscription(item) ? 0 : itemLineTotal(item);
  };
  const subscriptionCoveredSubtotal = money(
    items
      .filter(isItemCoveredBySubscription)
      .reduce((sum, item) => sum + itemLineTotal(item), 0),
  );
  const subscriptionExtraSubtotal = money(
    items.reduce((sum, item) => sum + itemBillableTotal(item), 0),
  );
  const subscriptionCoveredItemCount = items
    .filter(isItemCoveredBySubscription)
    .reduce((sum, item) => sum + Number(item.quantity ?? 1), 0);
  const hasSubscriptionCoverage = subscriptionCoveredItemCount > 0 || subscriptionCoveredSubtotal > 0;
  const rawSessionsRemaining = activeSubscription?.sessions_remaining;
  const subscriptionRemainingBefore =
    rawSessionsRemaining === null || rawSessionsRemaining === undefined
      ? null
      : Number(rawSessionsRemaining);
  const subscriptionRemainingAfter =
    subscriptionRemainingBefore === null || Number.isNaN(subscriptionRemainingBefore)
      ? null
      : Math.max(0, subscriptionRemainingBefore - subscriptionCoveredItemCount);
  const checkoutSubtotal = hasSubscriptionCoverage ? subscriptionExtraSubtotal : subtotal;
  const adjustedTotal = money(checkoutSubtotal - money(discount) + money(addition));
  const total = Math.max(0, adjustedTotal);
  const fullyCoveredBySubscription = hasSubscriptionCoverage && total <= 0.009;
  const usesSubscriptionSettlement = canEditSale && hasSubscriptionCoverage;
  const primaryActionLabel = usesSubscriptionSettlement
    ? fullyCoveredBySubscription
      ? "Confirmar utilização e fechar"
      : `Receber ${brl(total)} e fechar`
    : "Receber e fechar comanda";

  useEffect(() => {
    if (hasSubscriptionCoverage && !cmd.payment_method) setPaymentMode("vip");
  }, [hasSubscriptionCoverage, cmd.payment_method]);

  useEffect(() => {
    if (hasSubscriptionCoverage && subscriptionExtraPayment === "cash" && cashReceived < total)
      setCashReceived(total);
  }, [hasSubscriptionCoverage, subscriptionExtraPayment, cashReceived, total]);

  useEffect(() => {
    if (!hasSubscriptionCoverage && paymentMode === "vip") setPaymentMode("pix");
  }, [hasSubscriptionCoverage, paymentMode]);
  const selectedCatalog = tab === "service" ? services : products;
  const selectedSubtotal = money(
    selectedCatalog
      .filter((item: any) => selectedIds.includes(item.id))
      .reduce((sum: number, item: any) => sum + money(item.price), 0) * Math.max(1, quantity),
  );
  const allocated = money(splits.reduce((sum, split) => sum + money(split.amount), 0));
  const remaining = money(total - allocated);
  const mixedChange = money(
    splits.reduce(
      (sum, split) =>
        split.method === "cash"
          ? sum + Math.max(0, money(split.received) - money(split.amount))
          : sum,
      0,
    ),
  );
  const singleChange = paymentMode === "cash" ? money(Math.max(0, cashReceived - total)) : 0;

  function selectPayment(next: PaymentMode) {
    setPaymentMode(next);
    if (next === "cash" && cashReceived < total) setCashReceived(total);
    if (next === "mixed" && splits.length === 0) {
      const first = money(total / 2);
      const second = money(total - first);
      setSplits([
        {
          id: crypto.randomUUID(),
          method: "pix",
          amount: first.toFixed(2),
          received: first.toFixed(2),
        },
        {
          id: crypto.randomUUID(),
          method: "cash",
          amount: second.toFixed(2),
          received: second.toFixed(2),
        },
      ]);
    }
  }

  async function updateQuantity(item: any, nextQuantity: number) {
    if (!canEditSale || nextQuantity < 1) return;
    const commissionValue =
      item.kind === "service" && money(item.commission_pct) > 0
        ? money((money(item.unit_price) * nextQuantity * money(item.commission_pct)) / 100)
        : money(item.commission_value);
    const billableAmount = isItemCoveredBySubscription(item)
      ? 0
      : money(money(item.unit_price) * nextQuantity);
    const { error } = await supabase
      .from("commanda_items")
      .update({ quantity: nextQuantity, commission_value: commissionValue, billable_amount: billableAmount })
      .eq("id", item.id)
      .eq("tenant_id", tenantId);
    if (error) return toast.error(error.message);
    setItems((current) =>
      current.map((entry) =>
        entry.id === item.id
          ? { ...entry, quantity: nextQuantity, commission_value: commissionValue, billable_amount: billableAmount }
          : entry,
      ),
    );
  }

  async function saveEditedPrice(itemId: string) {
    const newPrice = money(editPrice);
    if (newPrice < 0 || editPrice.trim() === "") return toast.error("Preço inválido.");
    const item = items.find((entry) => entry.id === itemId);
    if (!item) return;
    const commissionValue =
      item.kind === "service" && money(item.commission_pct) > 0
        ? money((newPrice * Number(item.quantity ?? 1) * money(item.commission_pct)) / 100)
        : money(item.commission_value);
    const billableAmount = isItemCoveredBySubscription(item)
      ? 0
      : money(newPrice * Number(item.quantity ?? 1));
    const { error } = await supabase
      .from("commanda_items")
      .update({ unit_price: newPrice, commission_value: commissionValue, billable_amount: billableAmount })
      .eq("id", itemId)
      .eq("tenant_id", tenantId);
    if (error) return toast.error(error.message);
    setItems((current) =>
      current.map((entry) =>
        entry.id === itemId
          ? { ...entry, unit_price: newPrice, commission_value: commissionValue, billable_amount: billableAmount }
          : entry,
      ),
    );
    setEditingItemId(null);
    toast.success("Preço atualizado.");
  }

  async function confirmAddition() {
    if (!canEditSale) return;
    if (!selectedIds.length) return toast.error("Selecione pelo menos um item.");
    const professional = professionals.find((entry: any) => entry.id === professionalId);
    const inserted: any[] = [];

    for (const id of selectedIds) {
      const reference: any = selectedCatalog.find((entry: any) => entry.id === id);
      if (!reference) continue;
      const commissionPct = tab === "service" ? money(professional?.commission_pct) : 0;
      const commissionValue = money(
        (money(reference.price) * Math.max(1, quantity) * commissionPct) / 100,
      );
      const billableAmount = money(money(reference.price) * Math.max(1, quantity));
      const { data, error } = await supabase
        .from("commanda_items")
        .insert({
          commanda_id: cmd.id,
          tenant_id: tenantId,
          kind: tab,
          ref_id: reference.id,
          name: reference.name,
          quantity: Math.max(1, quantity),
          unit_price: money(reference.price),
          unit_cost: tab === "product" ? money(reference.cost_price) : 0,
          professional_id: tab === "service" ? professionalId || null : null,
          commission_pct: commissionPct,
          commission_value: commissionValue,
          covered_by_subscription: false,
          subscription_id: null,
          subscription_benefit_id: null,
          billable_amount: billableAmount,
        })
        .select("*, professionals(full_name)")
        .single();
      if (error) toast.error(error.message);
      else inserted.push(data);
    }

    if (inserted.length) {
      setItems((current) => [...current, ...inserted]);
      setSelectedIds([]);
      setQuantity(1);
      toast.success(inserted.length === 1 ? "Item adicionado." : "Itens adicionados.");
    }
  }

  async function removeItem(id: string) {
    if (!canEditSale) return;
    const { error } = await supabase
      .from("commanda_items")
      .delete()
      .eq("id", id)
      .eq("tenant_id", tenantId);
    if (error) return toast.error(error.message);
    setItems((current) => current.filter((item) => item.id !== id));
  }

  async function saveDraft() {
    if (!canEditSale) return;
    setSaving(true);
    const { error } = await supabase
      .from("commandas")
      .update({
        subtotal: checkoutSubtotal,
        discount: money(discount),
        addition: money(addition),
        total,
        notes: notes.trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", cmd.id)
      .eq("tenant_id", tenantId);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Alterações salvas na comanda.");
  }

  async function postpone() {
    if (!cmd.appointment_id || !appointment)
      return toast.error("Esta comanda não está vinculada a um agendamento.");
    const start = makeLocalDateTime(postponeDate, postponeTime);
    const currentStart = new Date(appointment.start_at);
    const currentEnd = new Date(appointment.end_at);
    const durationMs = Math.max(currentEnd.getTime() - currentStart.getTime(), 30 * 60_000);
    const end = new Date(start.getTime() + durationMs);

    const { error: appointmentError } = await supabase
      .from("appointments")
      .update({ start_at: start.toISOString(), end_at: end.toISOString(), status: "confirmed" })
      .eq("id", cmd.appointment_id)
      .eq("tenant_id", tenantId);
    if (appointmentError) return toast.error(appointmentError.message);

    const { error } = await supabase
      .from("commandas")
      .update({
        scheduled_at: start.toISOString(),
        status: "open",
        updated_at: new Date().toISOString(),
      })
      .eq("id", cmd.id)
      .eq("tenant_id", tenantId);
    if (error) return toast.error(error.message);
    toast.success("Atendimento reagendado.");
    onDone();
  }

  async function markNoShow() {
    if (!confirm("Marcar o cliente como não compareceu e cancelar esta comanda?")) return;
    const { error } = await supabase
      .from("commandas")
      .update({
        status: "no_show",
        subtotal: checkoutSubtotal,
        discount: money(discount),
        addition: money(addition),
        total,
        cancellation_reason: "Cliente não compareceu",
        updated_at: new Date().toISOString(),
      })
      .eq("id", cmd.id)
      .eq("tenant_id", tenantId);
    if (error) return toast.error(error.message);
    if (cmd.appointment_id) {
      await supabase
        .from("appointments")
        .update({ status: "no_show" })
        .eq("id", cmd.appointment_id)
        .eq("tenant_id", tenantId);
    }
    toast.success("Comanda marcada como não comparecimento.");
    onDone();
  }

  function updateSplit(id: string, changes: Partial<PaymentSplit>) {
    setSplits((current) =>
      current.map((split) => {
        if (split.id !== id) return split;
        const next = { ...split, ...changes };
        if (changes.method && changes.method !== "cash") next.received = next.amount;
        if (changes.amount !== undefined && next.method !== "cash") next.received = changes.amount;
        return next;
      }),
    );
  }

  function applyRemaining(id: string) {
    const otherTotal = splits
      .filter((split) => split.id !== id)
      .reduce((sum, split) => sum + money(split.amount), 0);
    const amount = money(Math.max(0, total - otherTotal)).toFixed(2);
    setSplits((current) =>
      current.map((split) =>
        split.id === id
          ? { ...split, amount, received: split.method === "cash" ? amount : amount }
          : split,
      ),
    );
  }

  async function finalizeSale() {
    if (!items.length) return toast.error("Adicione pelo menos um item antes de finalizar.");
    if (adjustedTotal < 0)
      return toast.error("O desconto não pode superar o valor da comanda.");
    if (paymentMode === "vip" && !usesSubscriptionSettlement)
      return toast.error("A assinatura só pode ser usada em serviços inclusos no plano.");

    let paymentPayload: Array<{ method: PaymentMethod; amount: number; received: number }>;
    let amountReceived = total;
    let changeAmount = 0;

    if (usesSubscriptionSettlement) {
      if (!activeSubscription)
        return toast.error("Este cliente nÃ£o possui uma assinatura ativa.");
      if (subscriptionCoveredSubtotal <= 0)
        return toast.error("Nenhum serviÃ§o desta comanda estÃ¡ coberto pela assinatura.");
      if (
        subscriptionRemainingBefore !== null &&
        subscriptionRemainingBefore < subscriptionCoveredItemCount
      )
        return toast.error("Este cliente nÃ£o possui utilizaÃ§Ãµes disponÃ­veis para este benefÃ­cio.");
      if (total > 0 && subscriptionExtraPayment === "cash" && cashReceived < total)
        return toast.error("O valor recebido em dinheiro Ã© menor que o excedente.");

      paymentPayload = [{ method: "vip", amount: 0, received: 0 }];
      if (total > 0) {
        const received = subscriptionExtraPayment === "cash" ? money(cashReceived) : total;
        paymentPayload.push({
          method: subscriptionExtraPayment,
          amount: total,
          received,
        });
        amountReceived = received;
        changeAmount =
          subscriptionExtraPayment === "cash" ? money(Math.max(0, received - total)) : 0;
      } else {
        amountReceived = 0;
      }
    } else if (paymentMode === "mixed") {
      if (Math.abs(remaining) > 0.009)
        return toast.error(`Distribua o valor restante de ${brl(Math.abs(remaining))}.`);
      paymentPayload = splits
        .map((split) => ({
          method: split.method,
          amount: money(split.amount),
          received: money(split.received),
        }))
        .filter((split) => split.amount > 0);
      if (!paymentPayload.length) return toast.error("Informe os valores do pagamento misto.");
      const invalidCash = paymentPayload.some(
        (payment) => payment.method === "cash" && payment.received < payment.amount,
      );
      if (invalidCash)
        return toast.error("O valor recebido em dinheiro é menor que a parte em dinheiro.");
      amountReceived = money(paymentPayload.reduce((sum, payment) => sum + payment.received, 0));
      changeAmount = mixedChange;
    } else if (paymentMode === "cash") {
      if (cashReceived < total)
        return toast.error("O valor recebido é menor que o total da comanda.");
      paymentPayload = [{ method: "cash", amount: total, received: money(cashReceived) }];
      amountReceived = money(cashReceived);
      changeAmount = singleChange;
    } else if (paymentMode === "vip") {
      if (!activeSubscription)
        return toast.error("Este cliente não possui uma assinatura ativa.");
      if (subscriptionCoveredSubtotal <= 0)
        return toast.error("Nenhum serviço desta comanda está coberto pela assinatura.");
      if (total > 0 && subscriptionExtraPayment === "cash" && cashReceived < total)
        return toast.error("O valor recebido em dinheiro é menor que o excedente.");
      paymentPayload = [{ method: "vip", amount: 0, received: 0 }];
      if (total > 0) {
        const received =
          subscriptionExtraPayment === "cash" ? money(cashReceived) : total;
        paymentPayload.push({
          method: subscriptionExtraPayment,
          amount: total,
          received,
        });
        amountReceived = received;
        changeAmount =
          subscriptionExtraPayment === "cash"
            ? money(Math.max(0, received - total))
            : 0;
      } else {
        amountReceived = 0;
      }
    } else {
      paymentPayload = [{ method: paymentMode, amount: total, received: total }];
    }

    setSaving(true);
    const rpcName = usesSubscriptionSettlement
      ? "finalize_commanda_with_subscription"
      : "finalize_commanda";
    const rpcPayload: any = {
      p_commanda_id: cmd.id,
      p_tenant_id: tenantId,
      p_subtotal: checkoutSubtotal,
      p_discount: money(discount),
      p_addition: money(addition),
      p_total: total,
      p_notes: notes,
      p_amount_received: amountReceived,
      p_change_amount: changeAmount,
      p_payments: paymentPayload,
    };
    if (usesSubscriptionSettlement)
      rpcPayload.p_subscription_id = activeSubscription.id;
    const { error } = await (supabase as any).rpc(rpcName, rpcPayload);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(
      usesSubscriptionSettlement
        ? "Comanda fechada e benefÃ­cio consumido com sucesso."
        : "Pagamento recebido e comanda fechada.",
    );
    onDone();
  }

  async function deleteComanda() {
    if (!confirm("Excluir definitivamente esta comanda e seus itens?")) return;
    setSaving(true);
    await supabase
      .from("cash_movements")
      .delete()
      .eq("tenant_id", tenantId)
      .eq("reference_type", "comanda")
      .eq("reference_id", cmd.id);
    await supabase
      .from("commanda_items")
      .delete()
      .eq("commanda_id", cmd.id)
      .eq("tenant_id", tenantId);
    const { error } = await supabase
      .from("commandas")
      .delete()
      .eq("id", cmd.id)
      .eq("tenant_id", tenantId);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Comanda excluída.");
    onDone();
  }

  return (
    <SheetContent className="inset-0 flex h-[100dvh] w-screen max-w-none flex-col overflow-hidden p-0 sm:inset-y-0 sm:left-auto sm:right-0 sm:w-[min(880px,70vw)] sm:max-w-none">
      <div className="border-b bg-card px-4 py-4 sm:px-5">
        <SheetHeader>
          <div className="flex items-start justify-between gap-4 pr-9">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <SheetTitle className="truncate text-xl">Comanda #{cmd.number}</SheetTitle>
                <Badge variant="outline" className={meta.tone}>
                  {meta.label}
                </Badge>
                <Badge
                  variant="outline"
                  className={
                    hasSubscriptionCoverage
                      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                      : "border-slate-200 bg-slate-50 text-slate-600"
                  }
                >
                  {hasSubscriptionCoverage ? "Assinatura VIP" : "Pagamento avulso"}
                </Badge>
              </div>
              <p className="mt-1 truncate text-sm text-muted-foreground">
                {cmd.client_name || "Cliente não identificado"}
              </p>
            </div>
            <div className="shrink-0 text-right">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">A receber</div>
              <div className="text-2xl font-bold text-primary">{brl(total)}</div>
            </div>
          </div>
        </SheetHeader>
      </div>

      <div className="flex-1 overflow-y-auto bg-muted/15">
        <div className="space-y-4 p-4 md:p-5">
          <section
            className={`rounded-2xl border p-4 ${
              hasSubscriptionCoverage ? "border-emerald-200 bg-emerald-50/70" : "bg-card"
            }`}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="font-semibold">
                  {hasSubscriptionCoverage ? "Baixa de benefÃ­cio" : "Resumo financeiro"}
                </h3>
                <p className="text-xs text-muted-foreground">
                  {hasSubscriptionCoverage
                    ? "O valor coberto pela assinatura nÃ£o serÃ¡ lanÃ§ado novamente no caixa."
                    : "Valores considerados no fechamento desta comanda."}
                </p>
              </div>
              {activeSubscription?.plan?.name && (
                <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">
                  {activeSubscription.plan.name}
                </Badge>
              )}
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border bg-white/80 p-3">
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  Valor comercial
                </div>
                <div className="mt-1 text-lg font-bold">{brl(subtotal)}</div>
              </div>
              <div className="rounded-xl border bg-white/80 p-3">
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  Coberto pela assinatura
                </div>
                <div className="mt-1 text-lg font-bold text-emerald-700">
                  {brl(subscriptionCoveredSubtotal)}
                </div>
              </div>
              <div className="rounded-xl border bg-white/80 p-3">
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  Valor a receber agora
                </div>
                <div className="mt-1 text-lg font-bold text-primary">{brl(total)}</div>
              </div>
            </div>

            {hasSubscriptionCoverage && (
              <div className="mt-3 grid gap-2 rounded-xl border border-emerald-200 bg-white/70 p-3 text-sm text-emerald-900 sm:grid-cols-3">
                <div>
                  <div className="text-xs opacity-70">UtilizaÃ§Ãµes nesta baixa</div>
                  <strong>{subscriptionCoveredItemCount}</strong>
                </div>
                <div>
                  <div className="text-xs opacity-70">DisponÃ­vel antes</div>
                  <strong>
                    {subscriptionRemainingBefore === null || Number.isNaN(subscriptionRemainingBefore)
                      ? "Ilimitado"
                      : subscriptionRemainingBefore}
                  </strong>
                </div>
                <div>
                  <div className="text-xs opacity-70">DisponÃ­vel depois</div>
                  <strong>
                    {subscriptionRemainingAfter === null ? "Ilimitado" : subscriptionRemainingAfter}
                  </strong>
                </div>
              </div>
            )}
          </section>

          <section className="rounded-xl border bg-card p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 font-medium">
                  <CalendarClock className="h-4 w-4 text-primary" />
                  {initialSchedule
                    ? `${dateBR(initialSchedule)} às ${timeBR(initialSchedule)}`
                    : "Sem horário vinculado"}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {cmd.appointment_id
                    ? "Pré-comanda criada pelo agendamento"
                    : "Comanda aberta manualmente"}
                </div>
              </div>
              {cmd.clients?.whatsapp && <Badge variant="secondary">{cmd.clients.whatsapp}</Badge>}
            </div>

            {cmd.appointment_id && canEditSale && (
              <div className="mt-4 grid gap-2 border-t pt-4 sm:grid-cols-[1fr_110px_auto_auto]">
                <Input
                  type="date"
                  value={postponeDate}
                  onChange={(event) => setPostponeDate(event.target.value)}
                />
                <Input
                  type="time"
                  value={postponeTime}
                  onChange={(event) => setPostponeTime(event.target.value)}
                />
                <Button variant="outline" onClick={postpone}>
                  Reagendar
                </Button>
                <Button
                  variant="ghost"
                  className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                  onClick={markNoShow}
                >
                  Não veio
                </Button>
              </div>
            )}
          </section>

          <section className="rounded-xl border bg-card">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <div>
                <h3 className="font-semibold">Itens da comanda</h3>
                <p className="text-xs text-muted-foreground">
                  {items.length} {items.length === 1 ? "item lançado" : "itens lançados"}
                </p>
              </div>
              <div className="text-sm font-semibold">{brl(subtotal)}</div>
            </div>

            <div className="space-y-2 p-3">
              {!items.length ? (
                <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                  Comanda vazia. Adicione serviços ou produtos abaixo.
                </div>
              ) : (
                items.map((item) => (
                  <div
                    key={item.id}
                    className={`grid gap-3 rounded-lg border p-3 sm:flex sm:items-center ${
                      isItemCoveredBySubscription(item)
                        ? "border-emerald-200 bg-emerald-50/40"
                        : "bg-background"
                    }`}
                  >
                    <div
                      className={`rounded-lg p-2 ${item.kind === "service" ? "bg-primary/10 text-primary" : "bg-sky-50 text-sky-700"}`}
                    >
                      {item.kind === "service" ? (
                        <ShoppingBag className="h-4 w-4" />
                      ) : (
                        <Package className="h-4 w-4" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="min-w-0 flex-1 truncate text-sm font-medium">
                          {item.name}
                        </div>
                        {isItemCoveredBySubscription(item) && (
                          <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">
                            Coberto pela assinatura
                          </Badge>
                        )}
                        {!isItemCoveredBySubscription(item) && hasSubscriptionCoverage && (
                          <Badge variant="outline" className="border-amber-200 text-amber-700">
                            Extra
                          </Badge>
                        )}
                      </div>
                      {editingItemId === item.id ? (
                        <div className="mt-1 flex items-center gap-1.5">
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            value={editPrice}
                            onChange={(event) => setEditPrice(event.target.value)}
                            className="h-7 w-24"
                            autoFocus
                          />
                          <Button
                            size="sm"
                            className="h-7"
                            onClick={() => saveEditedPrice(item.id)}
                          >
                            Salvar
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7"
                            onClick={() => setEditingItemId(null)}
                          >
                            Cancelar
                          </Button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          disabled={!canEditSale}
                          onClick={() => {
                            setEditingItemId(item.id);
                            setEditPrice(String(item.unit_price));
                          }}
                          className="text-xs text-muted-foreground enabled:hover:text-primary"
                        >
                          {brl(item.unit_price)} por unidade {canEditSale && "· editar preço"}
                        </button>
                      )}
                    </div>

                    <div className="flex items-center rounded-lg border">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        disabled={!canEditSale || Number(item.quantity ?? 1) <= 1}
                        onClick={() => updateQuantity(item, Number(item.quantity ?? 1) - 1)}
                      >
                        <Minus className="h-3.5 w-3.5" />
                      </Button>
                      <span className="w-7 text-center text-sm font-semibold">
                        {item.quantity ?? 1}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        disabled={!canEditSale}
                        onClick={() => updateQuantity(item, Number(item.quantity ?? 1) + 1)}
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </Button>
                    </div>

                    <div className="text-left text-sm font-semibold sm:w-24 sm:text-right">
                      <span
                        className={
                          isItemCoveredBySubscription(item)
                            ? "text-muted-foreground line-through"
                            : ""
                        }
                      >
                        {brl(itemLineTotal(item))}
                      </span>
                      {isItemCoveredBySubscription(item) && (
                        <div className="text-xs font-medium text-emerald-700">
                          A receber R$ 0,00
                        </div>
                      )}
                    </div>
                    {canEditSale && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0 text-destructive"
                        onClick={() => removeItem(item.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                ))
              )}
            </div>
          </section>

          {canEditSale && (
            <section className="rounded-xl border border-primary/20 bg-card p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="font-semibold">Adicionar item</h3>
                  <p className="text-xs text-muted-foreground">
                    Inclua serviços ou produtos sem sair do caixa.
                  </p>
                </div>
                {selectedSubtotal > 0 && (
                  <Badge variant="secondary">Seleção: {brl(selectedSubtotal)}</Badge>
                )}
              </div>

              <Tabs
                value={tab}
                onValueChange={(value) => {
                  setTab(value as "service" | "product");
                  setSelectedIds([]);
                }}
                className="mt-3"
              >
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="service">Serviços</TabsTrigger>
                  <TabsTrigger value="product">Produtos</TabsTrigger>
                </TabsList>
              </Tabs>

              <div className="mt-3 max-h-48 space-y-1 overflow-y-auto rounded-lg border p-1">
                {!selectedCatalog.length ? (
                  <div className="p-4 text-center text-sm text-muted-foreground">
                    Nenhum item ativo neste catálogo.
                  </div>
                ) : (
                  selectedCatalog.map((item: any) => {
                    const selectedItem = selectedIds.includes(item.id);
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() =>
                          setSelectedIds((current) =>
                            selectedItem
                              ? current.filter((id) => id !== item.id)
                              : [...current, item.id],
                          )
                        }
                        className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-sm transition-colors ${selectedItem ? "bg-primary/10 text-primary" : "hover:bg-muted"}`}
                      >
                        <span className="flex min-w-0 items-center gap-2 text-left">
                          <span
                            className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${selectedItem ? "border-primary bg-primary text-primary-foreground" : "border-input"}`}
                          >
                            {selectedItem && <Check className="h-3 w-3" />}
                          </span>
                          <span className="truncate font-medium">{item.name}</span>
                          {tab === "product" && (
                            <span className="text-xs text-muted-foreground">
                              Estoque: {item.stock ?? 0}
                            </span>
                          )}
                        </span>
                        <span className="ml-3 shrink-0">{brl(item.price)}</span>
                      </button>
                    );
                  })
                )}
              </div>

              <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_110px_auto]">
                {tab === "service" ? (
                  <Select value={professionalId} onValueChange={setProfessionalId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Profissional responsável" />
                    </SelectTrigger>
                    <SelectContent>
                      {professionals.map((professional: any) => (
                        <SelectItem key={professional.id} value={professional.id}>
                          {professional.full_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <div className="hidden sm:block" />
                )}
                <Input
                  type="number"
                  min={1}
                  value={quantity}
                  onChange={(event) => setQuantity(Math.max(1, Number(event.target.value)))}
                />
                <Button onClick={confirmAddition} disabled={!selectedIds.length}>
                  <Plus className="mr-2 h-4 w-4" />
                  Adicionar
                </Button>
              </div>
            </section>
          )}

          <section className="rounded-xl border bg-card p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="discount">Desconto</Label>
                <Input
                  id="discount"
                  type="number"
                  min="0"
                  step="0.01"
                  value={discount}
                  onChange={(event) => setDiscount(money(event.target.value))}
                  disabled={!canEditSale}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="addition">Acréscimo</Label>
                <Input
                  id="addition"
                  type="number"
                  min="0"
                  step="0.01"
                  value={addition}
                  onChange={(event) => setAddition(money(event.target.value))}
                  disabled={!canEditSale}
                />
              </div>
            </div>
            <div className="mt-3 space-y-2">
              <Label htmlFor="notes">Observações da comanda</Label>
              <Textarea
                id="notes"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Preferências do cliente, ajustes autorizados ou observações do atendimento..."
                rows={3}
                disabled={!canEditSale}
              />
            </div>
            {canEditSale && (
              <Button
                variant="outline"
                className="mt-3 w-full"
                onClick={saveDraft}
                disabled={saving}
              >
                Salvar alterações sem fechar
              </Button>
            )}
          </section>

          <section
            id="checkout"
            className={`rounded-xl border bg-card p-4 ${checkoutFocus ? "border-primary ring-2 ring-primary/10" : ""}`}
          >
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold">
                  {hasSubscriptionCoverage ? "Baixa de benefÃ­cio" : "Recebimento"}
                </h3>
                <p className="text-xs text-muted-foreground">
                  {hasSubscriptionCoverage
                    ? "Confirme o consumo da assinatura e receba apenas valores extras."
                    : "Escolha como o cliente vai pagar."}
                </p>
              </div>
              <WalletCards className="h-5 w-5 text-primary" />
            </div>

            {canEditSale ? (
              <>
                {!hasSubscriptionCoverage && (
                  <>
                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
                  {PAYMENT_METHODS.map(({ value, compact, icon: Icon }) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => selectPayment(value)}
                      className={`flex min-h-16 flex-col items-center justify-center gap-1 rounded-lg border px-2 py-2 text-xs font-medium transition-colors ${paymentMode === value ? "border-primary bg-primary/10 text-primary" : "bg-background hover:bg-muted"}`}
                    >
                      <Icon className="h-4 w-4" />
                      {compact}
                    </button>
                  ))}
                  {isSubscriberClient && hasSubscriptionCoverage && (
                    <button
                      type="button"
                      onClick={() => selectPayment("vip")}
                      className={`flex min-h-16 flex-col items-center justify-center gap-1 rounded-lg border px-2 py-2 text-xs font-medium transition-colors ${paymentMode === "vip" ? "border-primary bg-primary/10 text-primary" : "bg-background hover:bg-muted"}`}
                    >
                      <UserRound className="h-4 w-4" />
                      Assinatura
                    </button>
                  )}
                </div>

                {paymentMode === "cash" && (
                  <div className="mt-4 grid gap-3 rounded-lg bg-muted/40 p-3 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="cash-received">Valor recebido</Label>
                      <Input
                        id="cash-received"
                        type="number"
                        min="0"
                        step="0.01"
                        value={cashReceived}
                        onChange={(event) => setCashReceived(money(event.target.value))}
                        className="bg-background"
                      />
                    </div>
                    <div className="rounded-lg border bg-background p-3">
                      <div className="text-xs text-muted-foreground">Troco calculado</div>
                      <div className="mt-1 text-xl font-bold text-emerald-700">
                        {brl(singleChange)}
                      </div>
                    </div>
                  </div>
                )}

                {paymentMode === "mixed" && (
                  <div className="mt-4 space-y-2 rounded-lg border bg-muted/25 p-3">
                    {splits.map((split) => (
                      <div
                        key={split.id}
                        className="grid gap-2 rounded-lg border bg-background p-2 sm:grid-cols-[140px_1fr_1fr_auto]"
                      >
                        <Select
                          value={split.method}
                          onValueChange={(value) =>
                            updateSplit(split.id, { method: value as PaymentSplit["method"] })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {SPLIT_METHODS.map((method) => (
                              <SelectItem key={method.value} value={method.value}>
                                {method.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          value={split.amount}
                          onChange={(event) =>
                            updateSplit(split.id, { amount: event.target.value })
                          }
                          placeholder="Valor"
                        />
                        {split.method === "cash" ? (
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            value={split.received}
                            onChange={(event) =>
                              updateSplit(split.id, { received: event.target.value })
                            }
                            placeholder="Recebido"
                          />
                        ) : (
                          <div className="hidden items-center px-3 text-xs text-muted-foreground sm:flex">
                            Valor confirmado
                          </div>
                        )}
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-9"
                            onClick={() => applyRemaining(split.id)}
                          >
                            Restante
                          </Button>
                          {splits.length > 2 && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-9 w-9 text-destructive"
                              onClick={() =>
                                setSplits((current) =>
                                  current.filter((entry) => entry.id !== split.id),
                                )
                              }
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-sm">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          setSplits((current) => [
                            ...current,
                            {
                              id: crypto.randomUUID(),
                              method: "pix",
                              amount: "0.00",
                              received: "0.00",
                            },
                          ])
                        }
                      >
                        <Plus className="mr-1 h-4 w-4" />
                        Outra forma
                      </Button>
                      <div
                        className={
                          Math.abs(remaining) < 0.01 ? "text-emerald-700" : "text-amber-700"
                        }
                      >
                        {remaining >= 0 ? "Falta distribuir" : "Valor excedente"}:{" "}
                        <strong>{brl(Math.abs(remaining))}</strong>
                        {mixedChange > 0 && (
                          <span className="ml-3">
                            Troco: <strong>{brl(mixedChange)}</strong>
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                )}
                  </>
                )}

                {hasSubscriptionCoverage && (
                  <div
                    className={`mt-4 rounded-lg border p-3 text-sm ${
                      subscriptionRemainingBefore === 0
                        ? "border-amber-200 bg-amber-50 text-amber-800"
                        : "border-emerald-200 bg-emerald-50 text-emerald-800"
                    }`}
                  >
                    <div className="flex justify-between gap-3 font-semibold">
                      <span>{activeSubscription?.plan?.name ?? "Plano de assinatura"}</span>
                      <span>
                        {activeSubscription?.plan?.max_per_month
                          ? `${usageCount} / ${activeSubscription.plan.max_per_month} usos no mês`
                          : `${usageCount} usos no mês`}
                      </span>
                    </div>
                    <div className="mt-2 grid gap-2 sm:grid-cols-3">
                      <div className="rounded-md bg-white/60 p-2">
                        <div className="text-[11px] opacity-70">Coberto pelo plano</div>
                        <strong>{brl(subscriptionCoveredSubtotal)}</strong>
                      </div>
                      <div className="rounded-md bg-white/60 p-2">
                        <div className="text-[11px] opacity-70">Excedente a receber</div>
                        <strong>{brl(total)}</strong>
                      </div>
                      <div className="rounded-md bg-white/60 p-2">
                        <div className="text-[11px] opacity-70">Sessões restantes</div>
                        <strong>
                          {subscriptionRemainingBefore === null || Number.isNaN(subscriptionRemainingBefore)
                            ? "Ilimitado"
                            : subscriptionRemainingBefore}
                        </strong>
                      </div>
                    </div>
                    {total > 0 && (
                      <div className="mt-3 grid gap-2 sm:grid-cols-2">
                        <div className="space-y-1">
                          <Label>Receber excedente em</Label>
                          <Select
                            value={subscriptionExtraPayment}
                            onValueChange={(value) =>
                              setSubscriptionExtraPayment(
                                value as Exclude<PaymentMethod, "vip">,
                              )
                            }
                          >
                            <SelectTrigger className="bg-background text-foreground">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {SPLIT_METHODS.map((method) => (
                                <SelectItem key={method.value} value={method.value}>
                                  {method.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        {subscriptionExtraPayment === "cash" && (
                          <div className="space-y-1">
                            <Label>Valor recebido</Label>
                            <Input
                              type="number"
                              min="0"
                              step="0.01"
                              value={cashReceived}
                              onChange={(event) =>
                                setCashReceived(money(event.target.value))
                              }
                              className="bg-background text-foreground"
                            />
                          </div>
                        )}
                      </div>
                    )}
                    {subscriptionRemainingBefore === 0 && (
                      <p className="mt-1 text-xs">
                        O cliente não possui saldo disponível. A comanda não poderá ser fechada
                        como assinatura.
                      </p>
                    )}
                  </div>
                )}
              </>
            ) : (
              <div className="mt-3 grid gap-2 rounded-lg bg-muted/40 p-3 sm:grid-cols-3">
                <div>
                  <div className="text-xs text-muted-foreground">Forma</div>
                  <div className="font-medium capitalize">{cmd.payment_method || "—"}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Recebido</div>
                  <div className="font-medium">{brl(cmd.amount_received ?? cmd.total)}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Troco</div>
                  <div className="font-medium">{brl(cmd.change_amount)}</div>
                </div>
              </div>
            )}
          </section>
        </div>
      </div>

      <div className="border-t bg-card p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-[0_-8px_30px_rgba(15,23,42,0.06)]">
        <div className="mb-3 grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-4">
          <div className="flex justify-between gap-2 text-muted-foreground sm:block">
            <span>{hasSubscriptionCoverage ? "Valor comercial" : "Subtotal"}</span>
            <div className="font-medium text-foreground">{brl(subtotal)}</div>
          </div>
          {hasSubscriptionCoverage ? (
            <div className="flex justify-between gap-2 text-muted-foreground sm:block">
              <span>Coberto</span>
              <div className="font-medium text-emerald-700">
                - {brl(subscriptionCoveredSubtotal)}
              </div>
            </div>
          ) : (
            <div className="flex justify-between gap-2 text-muted-foreground sm:block">
              <span>Desconto</span>
              <div className="font-medium text-destructive">- {brl(discount)}</div>
            </div>
          )}
          <div className="flex justify-between gap-2 text-muted-foreground sm:block">
            <span>Acréscimo</span>
            <div className="font-medium text-foreground">+ {brl(addition)}</div>
          </div>
          <div className="flex justify-between gap-2 sm:block">
            <span className="font-semibold">Total a receber</span>
            <div className="text-xl font-bold text-primary">{brl(total)}</div>
          </div>
        </div>
        {canEditSale ? (
          <div className="flex gap-2">
            {isAdmin && (
              <Button
                variant="ghost"
                size="icon"
                className="h-11 w-full shrink-0 text-destructive sm:w-11"
                onClick={deleteComanda}
                disabled={saving}
                aria-label="Excluir comanda"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
            <Button
              variant="outline"
              onClick={saveDraft}
              disabled={saving}
              className="h-11 flex-1 text-base font-semibold"
            >
              Salvar alteraÃ§Ãµes
            </Button>
            <Button
              onClick={finalizeSale}
              disabled={saving || !items.length}
              className="h-11 flex-1 text-base font-semibold"
            >
              {saving ? "Processando..." : primaryActionLabel}
            </Button>
          </div>
        ) : (
          <div
            className={`rounded-lg border px-4 py-3 text-center text-sm font-semibold ${meta.tone}`}
          >
            {isClosed ? "Pagamento concluído e comanda fechada" : meta.label}
          </div>
        )}
      </div>
    </SheetContent>
  );
}

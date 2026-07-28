import { useEffect, useMemo, useState } from "react";
import { endOfMonth, format, startOfMonth } from "date-fns";
import { CheckCircle2, FileUp, ReceiptText, WalletCards } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { brl, dateBR } from "@/lib/format";
import {
  adjustmentLabels,
  commissionRemaining,
  type AdjustmentType,
  type CommissionEntry,
  type FinancialAccountOption,
  type ProfessionalSummary,
  type SettlementAdjustmentDraft,
  numberValue,
} from "@/lib/commissions";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Textarea } from "@/components/ui/textarea";

type SettlementPanelProps = {
  tenantId?: string;
  professionals: ProfessionalSummary[];
  entries: CommissionEntry[];
  accounts: FinancialAccountOption[];
  defaultProfessionalId?: string;
  onDone: () => void;
};

const adjustmentTypes: AdjustmentType[] = [
  "advance",
  "discount",
  "product_consumption",
  "loan",
  "other_debit",
  "bonus",
  "other_credit",
];

function makeAdjustments(): SettlementAdjustmentDraft[] {
  return adjustmentTypes.map((type) => ({
    id: crypto.randomUUID(),
    adjustment_type: type,
    nature: type === "bonus" || type === "other_credit" ? "credit" : "debit",
    amount: "",
    description: adjustmentLabels[type],
    notes: "",
  }));
}

export function SettlementPanel({
  tenantId,
  professionals,
  entries,
  accounts,
  defaultProfessionalId,
  onDone,
}: SettlementPanelProps) {
  const today = new Date();
  const [professionalId, setProfessionalId] = useState(defaultProfessionalId ?? "");
  const [periodStart, setPeriodStart] = useState(format(startOfMonth(today), "yyyy-MM-dd"));
  const [periodEnd, setPeriodEnd] = useState(format(endOfMonth(today), "yyyy-MM-dd"));
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [paymentAmounts, setPaymentAmounts] = useState<Record<string, string>>({});
  const [adjustments, setAdjustments] = useState<SettlementAdjustmentDraft[]>(makeAdjustments);
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [paymentMethod, setPaymentMethod] = useState("pix");
  const [paymentDate, setPaymentDate] = useState(format(today, "yyyy-MM-dd"));
  const [notes, setNotes] = useState("");
  const [proof, setProof] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (defaultProfessionalId) setProfessionalId(defaultProfessionalId);
  }, [defaultProfessionalId]);

  useEffect(() => {
    if (!accountId && accounts[0]?.id) setAccountId(accounts[0].id);
  }, [accountId, accounts]);

  const availableEntries = useMemo(
    () =>
      entries.filter(
        (entry) =>
          entry.professional_id === professionalId &&
          (entry.status === "pending" || entry.status === "scheduled") &&
          commissionRemaining(entry) > 0 &&
          entry.competence_date >= periodStart &&
          entry.competence_date <= periodEnd,
      ),
    [entries, professionalId, periodEnd, periodStart],
  );

  useEffect(() => {
    setSelectedIds(availableEntries.map((entry) => entry.id));
    setPaymentAmounts(
      Object.fromEntries(
        availableEntries.map((entry) => [entry.id, commissionRemaining(entry).toFixed(2)]),
      ),
    );
  }, [availableEntries]);

  const selectedEntries = useMemo(
    () => availableEntries.filter((entry) => selectedIds.includes(entry.id)),
    [availableEntries, selectedIds],
  );
  const gross = selectedEntries.reduce(
    (total, entry) => total + numberValue(paymentAmounts[entry.id]),
    0,
  );
  const credits = adjustments
    .filter((item) => item.nature === "credit")
    .reduce((total, item) => total + numberValue(item.amount), 0);
  const debits = adjustments
    .filter((item) => item.nature === "debit")
    .reduce((total, item) => total + numberValue(item.amount), 0);
  const net = gross + credits - debits;
  const professional = professionals.find((item) => item.id === professionalId);
  const debitAdjustments = adjustments.filter((item) => item.nature === "debit");
  const creditAdjustments = adjustments.filter((item) => item.nature === "credit");

  function toggleEntry(id: string, checked: boolean) {
    setSelectedIds((current) =>
      checked ? Array.from(new Set([...current, id])) : current.filter((item) => item !== id),
    );
  }

  function updatePaymentAmount(id: string, value: string) {
    setPaymentAmounts((current) => ({ ...current, [id]: value }));
  }

  function updateAdjustment(id: string, patch: Partial<SettlementAdjustmentDraft>) {
    setAdjustments((current) =>
      current.map((adjustment) =>
        adjustment.id === id ? { ...adjustment, ...patch } : adjustment,
      ),
    );
  }

  async function uploadProof() {
    if (!proof || !tenantId) return "";
    const extension = proof.name.split(".").pop() || "bin";
    const path = `${tenantId}/commission-proofs/${crypto.randomUUID()}.${extension}`;
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

  async function confirmSettlement() {
    if (!tenantId) return;
    if (!professionalId) return toast.error("Selecione o profissional.");
    if (!selectedIds.length) return toast.error("Selecione ao menos uma comissão.");
    if (!accountId) return toast.error("Selecione a conta financeira.");
    if (net < 0) return toast.error("Os descontos não podem superar o valor devido.");

    setBusy(true);
    try {
      const allocations = selectedEntries
        .map((entry) => ({
          commission_entry_id: entry.id,
          amount: numberValue(paymentAmounts[entry.id]),
          remaining: commissionRemaining(entry),
        }))
        .filter((allocation) => allocation.amount > 0)
        .map(({ commission_entry_id, amount, remaining }) => {
          if (amount > remaining) {
            throw new Error("O pagamento não pode superar o saldo restante do lançamento.");
          }
          return { commission_entry_id, amount };
        });
      if (!allocations.length) throw new Error("Informe ao menos um valor para pagar.");

      const proofUrl = await uploadProof();
      const payload = adjustments
        .filter((adjustment) => numberValue(adjustment.amount) > 0)
        .map((adjustment) => ({
          adjustment_type: adjustment.adjustment_type,
          nature: adjustment.nature,
          amount: numberValue(adjustment.amount),
          description: adjustment.description,
          notes: adjustment.notes,
        }));
      const { error } = await supabase.rpc(
        "record_commission_payment" as never,
        {
          p_tenant_id: tenantId,
          p_professional_id: professionalId,
          p_period_start: periodStart,
          p_period_end: periodEnd,
          p_allocations: allocations,
          p_adjustments: payload,
          p_account_id: accountId,
          p_payment_method: paymentMethod,
          p_payment_date: paymentDate,
          p_notes: notes,
          p_proof_url: proofUrl,
        } as never,
      );
      if (error) throw error;

      toast.success("Pagamento registrado e financeiro atualizado.");
      setSelectedIds([]);
      setAdjustments(makeAdjustments());
      setNotes("");
      setProof(null);
      onDone();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Não foi possível concluir o pagamento.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-w-0 gap-4 overflow-x-hidden 2xl:grid-cols-[1.45fr_0.8fr]">
      <div className="min-w-0 space-y-4">
        <Card className="overflow-hidden">
          <CardHeader className="px-4 pb-3 pt-4 sm:px-6 sm:pt-6">
            <CardTitle className="flex items-center gap-2 text-base">
              <ReceiptText className="h-4 w-4 text-primary" />
              Apuração do profissional
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 px-4 pb-4 sm:px-6 sm:pb-6">
            <div className="grid gap-3 md:grid-cols-3">
              <div className="space-y-1.5">
                <Label>Profissional</Label>
                <Select value={professionalId} onValueChange={setProfessionalId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {professionals.map((item) => (
                      <SelectItem key={item.id} value={item.id}>
                        {item.full_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Início da apuração</Label>
                <Input
                  type="date"
                  value={periodStart}
                  onChange={(event) => setPeriodStart(event.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Final da apuração</Label>
                <Input
                  type="date"
                  min={periodStart}
                  value={periodEnd}
                  onChange={(event) => setPeriodEnd(event.target.value)}
                />
              </div>
            </div>

            <div className="space-y-3 md:hidden">
              <div className="rounded-2xl border bg-muted/20 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold">Lançamentos da apuração</div>
                    <div className="text-xs text-muted-foreground">
                      {selectedEntries.length} de {availableEntries.length} selecionados
                    </div>
                  </div>
                  <label className="flex shrink-0 items-center gap-2 text-xs font-medium">
                    Todos
                    <Checkbox
                      checked={
                        availableEntries.length > 0 &&
                        selectedIds.length === availableEntries.length
                      }
                      onCheckedChange={(checked) =>
                        setSelectedIds(checked ? availableEntries.map((entry) => entry.id) : [])
                      }
                    />
                  </label>
                </div>
              </div>

              {!professionalId && (
                <div className="rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">
                  Selecione um profissional para iniciar a prestação.
                </div>
              )}
              {professionalId && !availableEntries.length && (
                <div className="rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">
                  Nenhuma comissão pendente dentro do período.
                </div>
              )}

              {availableEntries.map((entry) => (
                <div key={entry.id} className="rounded-2xl border bg-card p-3 shadow-sm">
                  <div className="flex items-start gap-3">
                    <Checkbox
                      className="mt-1"
                      checked={selectedIds.includes(entry.id)}
                      onCheckedChange={(checked) => toggleEntry(entry.id, checked === true)}
                    />
                    <div className="min-w-0 flex-1 space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold">{entry.item_name}</div>
                          <div className="mt-0.5 truncate text-xs text-muted-foreground">
                            Comanda #{entry.commandas?.number ?? "—"} ·{" "}
                            {entry.commandas?.client_name || "Cliente"}
                          </div>
                        </div>
                        <Badge
                          variant="outline"
                          className="shrink-0 rounded-full px-2 py-0 text-[11px]"
                        >
                          {entry.commission_pct}%
                        </Badge>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="rounded-xl bg-muted/35 p-2">
                          <div className="text-muted-foreground">Competência</div>
                          <div className="font-medium">{dateBR(entry.competence_date)}</div>
                        </div>
                        <div className="rounded-xl bg-primary/10 p-2">
                          <div className="text-muted-foreground">Saldo</div>
                          <div className="font-semibold text-primary">
                            {brl(commissionRemaining(entry))}
                          </div>
                        </div>
                      </div>

                      <div className="rounded-xl bg-muted/25 p-2 text-xs text-muted-foreground">
                        {entry.rule_description || "Regra padrão"}
                      </div>

                      <div className="space-y-1.5">
                        <Label className="text-xs">Pagar agora</Label>
                        <Input
                          type="number"
                          min="0"
                          max={commissionRemaining(entry)}
                          step="0.01"
                          value={paymentAmounts[entry.id] ?? ""}
                          onChange={(event) => updatePaymentAmount(entry.id, event.target.value)}
                          aria-label={`Valor a pagar de ${entry.item_name}`}
                          className="h-10 text-right"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="hidden overflow-x-auto rounded-xl border md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox
                        checked={
                          availableEntries.length > 0 &&
                          selectedIds.length === availableEntries.length
                        }
                        onCheckedChange={(checked) =>
                          setSelectedIds(checked ? availableEntries.map((entry) => entry.id) : [])
                        }
                      />
                    </TableHead>
                    <TableHead>Competência</TableHead>
                    <TableHead>Origem</TableHead>
                    <TableHead>Item</TableHead>
                    <TableHead>Regra aplicada</TableHead>
                    <TableHead className="text-right">Saldo</TableHead>
                    <TableHead className="text-right">Pagar agora</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {availableEntries.map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell>
                        <Checkbox
                          checked={selectedIds.includes(entry.id)}
                          onCheckedChange={(checked) => toggleEntry(entry.id, checked === true)}
                        />
                      </TableCell>
                      <TableCell>{dateBR(entry.competence_date)}</TableCell>
                      <TableCell>
                        <span className="font-medium">
                          Comanda #{entry.commandas?.number ?? "—"}
                        </span>
                        <div className="text-xs text-muted-foreground">
                          {entry.commandas?.client_name || "Cliente"}
                        </div>
                      </TableCell>
                      <TableCell>
                        {entry.item_name}
                        <div className="text-xs text-muted-foreground">
                          {entry.item_kind === "service" ? "Serviço" : "Produto"} ·{" "}
                          {entry.commission_pct}%
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {entry.rule_description || "Regra padrão"}
                      </TableCell>
                      <TableCell className="text-right font-semibold text-primary">
                        {brl(commissionRemaining(entry))}
                      </TableCell>
                      <TableCell className="w-32 text-right">
                        <Input
                          type="number"
                          min="0"
                          max={commissionRemaining(entry)}
                          step="0.01"
                          value={paymentAmounts[entry.id] ?? ""}
                          onChange={(event) => updatePaymentAmount(entry.id, event.target.value)}
                          aria-label={`Valor a pagar de ${entry.item_name}`}
                          className="text-right"
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {!professionalId && (
                <div className="p-8 text-center text-sm text-muted-foreground">
                  Selecione um profissional para iniciar a prestação.
                </div>
              )}
              {professionalId && !availableEntries.length && (
                <div className="p-8 text-center text-sm text-muted-foreground">
                  Nenhuma comissão pendente dentro do período.
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="overflow-hidden">
          <CardHeader className="px-4 pb-3 pt-4 sm:px-6 sm:pt-6">
            <CardTitle className="text-base">Acréscimos e descontos</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 sm:px-6 sm:pb-6">
            <Accordion
              type="multiple"
              defaultValue={["debits", "credits"]}
              className="space-y-3 md:hidden"
            >
              <AccordionItem value="debits" className="rounded-2xl border bg-muted/20 px-3">
                <AccordionTrigger className="py-3 hover:no-underline">
                  <div className="min-w-0 text-left">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">Descontos</span>
                      <Badge variant="outline" className="border-rose-200 bg-rose-50 text-rose-700">
                        {brl(debits)}
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs font-normal text-muted-foreground">
                      Adiantamentos, consumo, empréstimos e outros abatimentos.
                    </p>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="space-y-3 pb-3">
                  {debitAdjustments.map((adjustment) => (
                    <AdjustmentField
                      key={adjustment.id}
                      adjustment={adjustment}
                      onChange={updateAdjustment}
                    />
                  ))}
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="credits" className="rounded-2xl border bg-muted/20 px-3">
                <AccordionTrigger className="py-3 hover:no-underline">
                  <div className="min-w-0 text-left">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">Acréscimos</span>
                      <Badge
                        variant="outline"
                        className="border-emerald-200 bg-emerald-50 text-emerald-700"
                      >
                        {brl(credits)}
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs font-normal text-muted-foreground">
                      Bonificações e outros valores somados ao pagamento.
                    </p>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="space-y-3 pb-3">
                  {creditAdjustments.map((adjustment) => (
                    <AdjustmentField
                      key={adjustment.id}
                      adjustment={adjustment}
                      onChange={updateAdjustment}
                    />
                  ))}
                </AccordionContent>
              </AccordionItem>
            </Accordion>

            <div className="hidden gap-3 md:grid md:grid-cols-2">
              {adjustments.map((adjustment) => (
                <div key={adjustment.id} className="rounded-xl border bg-muted/20 p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <Label>{adjustmentLabels[adjustment.adjustment_type]}</Label>
                    <Badge
                      variant="outline"
                      className={
                        adjustment.nature === "credit"
                          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                          : "border-rose-200 bg-rose-50 text-rose-700"
                      }
                    >
                      {adjustment.nature === "credit" ? "Acréscimo" : "Desconto"}
                    </Badge>
                  </div>
                  <div className="grid grid-cols-[130px_1fr] gap-2">
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={adjustment.amount}
                      onChange={(event) =>
                        updateAdjustment(adjustment.id, { amount: event.target.value })
                      }
                      placeholder="R$ 0,00"
                    />
                    <Input
                      value={adjustment.notes}
                      onChange={(event) =>
                        updateAdjustment(adjustment.id, { notes: event.target.value })
                      }
                      placeholder="Referência ou observação"
                    />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="h-fit overflow-hidden 2xl:sticky 2xl:top-4">
        <CardHeader className="px-4 pt-4 sm:px-6 sm:pt-6">
          <CardTitle className="flex items-center gap-2 text-base">
            <WalletCards className="h-4 w-4 text-primary" />
            Confirmar pagamento
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 px-4 pb-5 sm:px-6 sm:pb-6">
          <div className="rounded-xl bg-muted/35 p-4">
            <div className="mb-3 text-sm font-semibold">
              {professional?.full_name || "Profissional não selecionado"}
            </div>
            <FinancialLine label="Comissões incluídas" value={gross} />
            <FinancialLine label="Acréscimos" value={credits} tone="positive" />
            <FinancialLine label="Descontos" value={-debits} tone="negative" />
            <div className="mt-3 flex items-center justify-between border-t pt-3">
              <span className="font-semibold">Valor líquido</span>
              <span
                className={`text-2xl font-bold ${net < 0 ? "text-destructive" : "text-primary"}`}
              >
                {brl(net)}
              </span>
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              {selectedEntries.length} lançamentos selecionados · pagamento total ou parcial
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Forma de pagamento</Label>
            <Select value={paymentMethod} onValueChange={setPaymentMethod}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pix">PIX</SelectItem>
                <SelectItem value="cash">Dinheiro</SelectItem>
                <SelectItem value="transfer">Transferência</SelectItem>
                <SelectItem value="debit">Cartão de débito</SelectItem>
                <SelectItem value="credit">Cartão de crédito</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Conta financeira</Label>
            <Select value={accountId} onValueChange={setAccountId}>
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
          <div className="space-y-1.5">
            <Label>Data do pagamento</Label>
            <Input
              type="date"
              value={paymentDate}
              onChange={(event) => setPaymentDate(event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Comprovante</Label>
            <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-dashed p-3 text-sm hover:bg-muted/40">
              <FileUp className="h-4 w-4 text-primary" />
              <span className="min-w-0 flex-1 truncate">{proof?.name || "Anexar comprovante"}</span>
              <Input
                type="file"
                accept="image/*,.pdf"
                className="hidden"
                onChange={(event) => setProof(event.target.files?.[0] ?? null)}
              />
            </label>
          </div>
          <div className="space-y-1.5">
            <Label>Observações</Label>
            <Textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              rows={4}
              placeholder="Detalhes da prestação, autorização ou referência do pagamento..."
            />
          </div>

          <Button
            className="h-12 w-full text-base font-semibold"
            onClick={confirmSettlement}
            disabled={busy || !selectedIds.length || net < 0}
          >
            <CheckCircle2 className="mr-2 h-5 w-5" />
            {busy ? "Processando..." : `Confirmar pagamento de ${brl(Math.max(0, net))}`}
          </Button>
          <p className="text-center text-[11px] leading-relaxed text-muted-foreground">
            A confirmação baixa as obrigações, registra a saída no caixa e bloqueia pagamento
            duplicado.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function AdjustmentField({
  adjustment,
  onChange,
}: {
  adjustment: SettlementAdjustmentDraft;
  onChange: (id: string, patch: Partial<SettlementAdjustmentDraft>) => void;
}) {
  const isCredit = adjustment.nature === "credit";

  return (
    <div className="rounded-xl border bg-background p-3">
      <div className="mb-2 flex min-w-0 items-center justify-between gap-2">
        <Label className="min-w-0 truncate text-sm">
          {adjustmentLabels[adjustment.adjustment_type]}
        </Label>
        <Badge
          variant="outline"
          className={
            isCredit
              ? "shrink-0 border-emerald-200 bg-emerald-50 text-emerald-700"
              : "shrink-0 border-rose-200 bg-rose-50 text-rose-700"
          }
        >
          {isCredit ? "Acrésc." : "Desc."}
        </Badge>
      </div>
      <div className="grid gap-2">
        <Input
          type="number"
          min="0"
          step="0.01"
          value={adjustment.amount}
          onChange={(event) => onChange(adjustment.id, { amount: event.target.value })}
          placeholder="R$ 0,00"
          className="h-10"
        />
        <Input
          value={adjustment.notes}
          onChange={(event) => onChange(adjustment.id, { notes: event.target.value })}
          placeholder="Referência ou observação"
          className="h-10"
        />
      </div>
    </div>
  );
}

function FinancialLine({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "positive" | "negative";
}) {
  return (
    <div className="flex items-center justify-between py-1.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span
        className={
          tone === "positive"
            ? "font-semibold text-emerald-700"
            : tone === "negative"
              ? "font-semibold text-rose-700"
              : "font-semibold"
        }
      >
        {value > 0 && tone === "positive" ? "+ " : ""}
        {brl(value)}
      </span>
    </div>
  );
}

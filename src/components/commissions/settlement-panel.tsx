import { useEffect, useMemo, useState } from "react";
import { endOfMonth, format, startOfMonth } from "date-fns";
import { CheckCircle2, FileUp, ReceiptText, WalletCards } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { brl, dateBR } from "@/lib/format";
import {
  adjustmentLabels,
  type AdjustmentType,
  type CommissionEntry,
  type FinancialAccountOption,
  type ProfessionalSummary,
  type SettlementAdjustmentDraft,
  numberValue,
} from "@/lib/commissions";
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
          entry.competence_date >= periodStart &&
          entry.competence_date <= periodEnd,
      ),
    [entries, professionalId, periodEnd, periodStart],
  );

  useEffect(() => {
    setSelectedIds(availableEntries.map((entry) => entry.id));
  }, [availableEntries]);

  const selectedEntries = useMemo(
    () => availableEntries.filter((entry) => selectedIds.includes(entry.id)),
    [availableEntries, selectedIds],
  );
  const gross = selectedEntries.reduce(
    (total, entry) => total + numberValue(entry.commission_amount),
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

  function toggleEntry(id: string, checked: boolean) {
    setSelectedIds((current) =>
      checked ? Array.from(new Set([...current, id])) : current.filter((item) => item !== id),
    );
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
        "settle_commissions" as never,
        {
          p_tenant_id: tenantId,
          p_professional_id: professionalId,
          p_period_start: periodStart,
          p_period_end: periodEnd,
          p_commission_ids: selectedIds,
          p_adjustments: payload,
          p_account_id: accountId,
          p_payment_method: paymentMethod,
          p_payment_date: paymentDate,
          p_notes: notes,
          p_proof_url: proofUrl,
        } as never,
      );
      if (error) throw error;

      toast.success("Prestação de contas concluída e financeiro atualizado.");
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
    <div className="grid gap-5 2xl:grid-cols-[1.45fr_0.8fr]">
      <div className="space-y-5">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <ReceiptText className="h-4 w-4 text-primary" />
              Apuração do profissional
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
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

            <div className="overflow-x-auto rounded-xl border">
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
                    <TableHead className="text-right">Comissão</TableHead>
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
                        {brl(entry.commission_amount)}
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

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Acréscimos e descontos</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2">
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
          </CardContent>
        </Card>
      </div>

      <Card className="h-fit 2xl:sticky 2xl:top-4">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <WalletCards className="h-4 w-4 text-primary" />
            Confirmar pagamento
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
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
              {selectedEntries.length} comissões selecionadas
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

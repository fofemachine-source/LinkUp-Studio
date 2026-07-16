export type CommissionStatus = "pending" | "scheduled" | "paid" | "canceled";
export type SettlementStatus = "draft" | "scheduled" | "paid" | "reversed" | "canceled";
export type AdjustmentNature = "credit" | "debit";
export type AdjustmentType =
  | "advance"
  | "discount"
  | "product_consumption"
  | "loan"
  | "other_debit"
  | "bonus"
  | "other_credit";

export type ProfessionalSummary = {
  id: string;
  full_name: string;
  photo_url: string | null;
  role_label: string | null;
  active: boolean | null;
  commission_pct: number | null;
  cost_center_id?: string | null;
};

export type CommissionEntry = {
  id: string;
  tenant_id: string;
  commanda_id: string;
  commanda_item_id: string;
  professional_id: string;
  item_kind: "service" | "product";
  reference_id: string | null;
  item_name: string;
  quantity: number;
  gross_amount: number;
  commission_pct: number;
  commission_amount: number;
  rule_id: string | null;
  rule_scope: "company" | "professional" | "item" | "legacy";
  rule_description: string | null;
  competence_date: string;
  due_date: string;
  cost_center_id: string | null;
  status: CommissionStatus;
  payable_movement_id: string | null;
  settlement_id: string | null;
  generated_at: string;
  paid_at: string | null;
  canceled_at: string | null;
  cancellation_reason: string | null;
  professionals?: ProfessionalSummary | null;
  commandas?: {
    number: number;
    client_name: string | null;
    closed_at: string | null;
  } | null;
};

export type CommissionRule = {
  id: string;
  tenant_id: string;
  rule_scope: "company" | "professional" | "item";
  item_kind: "service" | "product";
  professional_id: string | null;
  reference_id: string | null;
  percentage: number;
  active: boolean;
  change_reason: string | null;
  updated_at: string;
};

export type CommissionAdjustment = {
  id: string;
  tenant_id: string;
  professional_id: string;
  settlement_id: string | null;
  adjustment_type: AdjustmentType;
  nature: AdjustmentNature;
  amount: number;
  competence_date: string;
  status: "open" | "applied" | "canceled";
  description: string;
  notes: string | null;
  created_at: string;
};

export type CommissionSettlement = {
  id: string;
  tenant_id: string;
  professional_id: string;
  period_start: string;
  period_end: string;
  gross_amount: number;
  credit_amount: number;
  debit_amount: number;
  net_amount: number;
  status: SettlementStatus;
  payment_method: string | null;
  payment_date: string | null;
  account_id: string | null;
  cost_center_id: string | null;
  proof_url: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  paid_at: string | null;
  reversed_at: string | null;
  reversal_reason: string | null;
  professionals?: ProfessionalSummary | null;
  financial_accounts?: { name: string } | null;
};

export type FinancialAccountOption = {
  id: string;
  name: string;
};

export type CostCenterOption = {
  id: string;
  name: string;
  code: string | null;
  active: boolean;
};

export type SettlementAdjustmentDraft = {
  id: string;
  adjustment_type: AdjustmentType;
  nature: AdjustmentNature;
  amount: string;
  description: string;
  notes: string;
};

export const adjustmentLabels: Record<AdjustmentType, string> = {
  advance: "Adiantamento",
  discount: "Desconto",
  product_consumption: "Produtos consumidos",
  loan: "Empréstimo",
  other_debit: "Outro desconto",
  bonus: "Bonificação",
  other_credit: "Outro acréscimo",
};

export const paymentLabels: Record<string, string> = {
  pix: "PIX",
  cash: "Dinheiro",
  transfer: "Transferência",
  debit: "Cartão de débito",
  credit: "Cartão de crédito",
};

export function numberValue(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export function commissionStatusLabel(status: CommissionStatus) {
  if (status === "paid") return "Pago";
  if (status === "scheduled") return "Programado";
  if (status === "canceled") return "Cancelado";
  return "Pendente";
}

export function settlementStatusLabel(status: SettlementStatus) {
  if (status === "paid") return "Pago";
  if (status === "scheduled") return "Programado";
  if (status === "reversed") return "Estornado";
  if (status === "canceled") return "Cancelado";
  return "Rascunho";
}

export function normalizeSearch(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

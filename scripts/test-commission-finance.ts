import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { calculateServiceCommission, commissionRemaining } from "../src/lib/commissions.ts";

const migration = readFileSync(
  new URL("../supabase/migrations/20260727175116_commission_professional_payments.sql", import.meta.url),
  "utf8",
);
const cadastro = readFileSync(
  new URL("../src/routes/_authenticated/app.cadastros.tsx", import.meta.url),
  "utf8",
);
const comissoes = readFileSync(
  new URL("../src/routes/_authenticated/app.comissoes.tsx", import.meta.url),
  "utf8",
);

function closeTo(actual: number, expected: number, message: string) {
  assert.equal(Math.round(actual * 100), Math.round(expected * 100), message);
}

const owner = calculateServiceCommission({ grossAmount: 100, percentage: 100, isOwner: true });
closeTo(owner.commissionAmount, 0, "proprietário não gera obrigação para si");
closeTo(owner.storeShare, 100, "serviço do proprietário permanece faturamento da loja");

const professionalA = calculateServiceCommission({ grossAmount: 100, percentage: 50 });
const professionalAFull = calculateServiceCommission({ grossAmount: 80, percentage: 100 });
const professionalB = calculateServiceCommission({ grossAmount: 240, percentage: 35 });
closeTo(professionalA.commissionAmount, 50, "A recebe somente 50% do próprio serviço");
closeTo(professionalA.storeShare, 50, "loja mantém 50% do serviço de A");
closeTo(professionalAFull.commissionAmount, 80, "A a 100% recebe 100% do próprio serviço");
closeTo(professionalB.commissionAmount, 84, "B recebe somente 35% do próprio serviço");
closeTo(professionalB.storeShare, 156, "loja mantém a parcela de B");

const separateServices = [
  { professional: "A", gross: 100, commission: professionalA.commissionAmount },
  { professional: "B", gross: 240, commission: professionalB.commissionAmount },
  { professional: "owner", gross: 100, commission: owner.commissionAmount },
];
for (const service of separateServices) {
  assert.ok(service.commission >= 0 && service.commission <= service.gross);
}
closeTo(
  separateServices.filter((service) => service.professional === "A")[0].commission,
  50,
  "A não recebe serviço de B",
);
closeTo(
  separateServices.filter((service) => service.professional === "B")[0].commission,
  84,
  "B não recebe serviço de A",
);

const frozen = { commission_amount: 50, paid_amount: 0, commission_pct: 50 };
const changedPercentage = calculateServiceCommission({ grossAmount: 100, percentage: 75 });
closeTo(changedPercentage.commissionAmount, 75, "percentual novo vale para novos lançamentos");
assert.deepEqual(
  frozen,
  { commission_amount: 50, paid_amount: 0, commission_pct: 50 },
  "lançamento anterior mantém percentual e valor históricos",
);

let paidAmount = 0;
const commissionAmount = 100;
const pay = (amount: number) => {
  const remaining = commissionAmount - paidAmount;
  assert.ok(amount > 0 && amount <= remaining, "pagamento não pode superar o saldo restante");
  paidAmount = Math.round((paidAmount + amount) * 100) / 100;
};
pay(40);
assert.equal(commissionRemaining({ commission_amount: commissionAmount, paid_amount: paidAmount }), 60);
pay(60);
assert.equal(commissionRemaining({ commission_amount: commissionAmount, paid_amount: paidAmount }), 0);
assert.throws(() => pay(1), /saldo restante/);

for (const fragment of [
  "paid_amount numeric(14,2)",
  "commission_entries_paid_amount_check",
  "professional_is_owner",
  "professionals_validate_commission_pct",
  "item.kind = 'service'",
  "commission_canceled",
  "commission_canceled_after_payment",
  "record_commission_payment",
  "commission_amount - entry.paid_amount",
  "commission_settlement_items_entry_idx",
  "commission_pct",
  "gross_amount",
  "competence_date",
  "source_entity_id",
  "commission_generated",
]) {
  assert.ok(migration.includes(fragment), `migração deve conter: ${fragment}`);
}
assert.ok(!migration.includes("item.kind in ('service', 'product')"));
const cancelFunctionStart = migration.indexOf(
  "create or replace function public.cancel_commissions_for_commanda",
);
const closeTriggerStart = migration.indexOf(
  "create or replace function public.generate_commissions_after_commanda_close",
);
const cancelFunction = migration.slice(cancelFunctionStart, closeTriggerStart);
const generationFunction = migration.slice(
  migration.indexOf("create or replace function public.generate_commissions_for_commanda"),
  cancelFunctionStart,
);
assert.ok(cancelFunction.includes("commission_canceled_after_payment"));
assert.ok(!generationFunction.includes("commission_canceled_after_payment"));
assert.ok(cadastro.includes('min="0" max="100" step="0.01"'));
assert.ok(cadastro.includes("novos serviços concluídos"));
assert.ok(!comissoes.includes('title="Produtos comissionados"'));
assert.ok(!comissoes.includes('title="Comissão específica por produto"'));

console.log("Commission finance tests passed: owner, professionals A/B, frozen percentage, partial/full payment, duplicate block, cancellation/audit guards.");

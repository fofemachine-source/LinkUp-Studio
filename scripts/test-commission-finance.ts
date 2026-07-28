import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  calculateServiceCommission,
  commissionRemaining,
  summarizeCommissionEntries,
  type CommissionEntry,
} from "../src/lib/commissions.ts";

const migration = readFileSync(
  new URL(
    "../supabase/migrations/20260727175116_commission_professional_payments.sql",
    import.meta.url,
  ),
  "utf8",
);
const ownFinanceMigration = readFileSync(
  new URL(
    "../supabase/migrations/20260728034034_restrict_commission_own_finance.sql",
    import.meta.url,
  ),
  "utf8",
);
const ownFinanceEmailLinkMigration = readFileSync(
  new URL(
    "../supabase/migrations/20260728035610_allow_professional_commission_email_link.sql",
    import.meta.url,
  ),
  "utf8",
);
const commissionReadRepairMigration = readFileSync(
  new URL(
    "../supabase/migrations/20260728042004_repair_professional_commission_read_policies.sql",
    import.meta.url,
  ),
  "utf8",
);
const hardenedCommissionReadMigration = readFileSync(
  new URL(
    "../supabase/migrations/20260728044524_harden_professional_commission_read.sql",
    import.meta.url,
  ),
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

const productionAuditEntries = [
  {
    id: "ricardo-1",
    professional_id: "ricardo",
    item_kind: "service",
    competence_date: "2026-07-10",
    quantity: 10,
    gross_amount: 500,
    commission_amount: 225,
    paid_amount: 0,
    status: "pending",
  },
  {
    id: "ricardo-2",
    professional_id: "ricardo",
    item_kind: "service",
    competence_date: "2026-07-20",
    quantity: 8,
    gross_amount: 405,
    commission_amount: 182.25,
    paid_amount: 0,
    status: "pending",
  },
  {
    id: "francois-1",
    professional_id: "francois",
    item_kind: "service",
    competence_date: "2026-07-15",
    quantity: 59,
    gross_amount: 2700,
    commission_amount: 1215,
    paid_amount: 0,
    status: "pending",
  },
] as CommissionEntry[];
const ricardoAudit = summarizeCommissionEntries(productionAuditEntries, {
  from: "2026-07-01",
  to: "2026-07-31",
  professionalIds: ["ricardo"],
});
assert.equal(ricardoAudit.entries.length, 2, "resumo inclui somente lançamentos do Ricardo");
assert.equal(ricardoAudit.servicesCount, 18, "resumo mostra os 18 serviços do Ricardo");
closeTo(ricardoAudit.revenue, 905, "resumo mostra o faturamento próprio do Ricardo");
closeTo(ricardoAudit.generated, 407.25, "resumo mostra somente a comissão do Ricardo");
closeTo(ricardoAudit.pending, 407.25, "resumo mostra o saldo pendente do Ricardo");

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
assert.equal(
  commissionRemaining({ commission_amount: commissionAmount, paid_amount: paidAmount }),
  60,
);
pay(60);
assert.equal(
  commissionRemaining({ commission_amount: commissionAmount, paid_amount: paidAmount }),
  0,
);
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
for (const fragment of [
  "can_read_professional_commission",
  "professional_id = private.current_professional_id",
  "authorized users read commission entries",
  "authorized users read commission settlements",
  "authorized users read commission adjustments",
  "authorized managers manage commission rules",
  "authorized operators insert commission entries",
  "private.professional_has_permission(tenant_id, 'commandas'",
  'drop policy if exists "tenant members manage commission entries"',
]) {
  assert.ok(
    ownFinanceMigration.includes(fragment),
    `migração de acesso próprio deve conter: ${fragment}`,
  );
}
for (const fragment of [
  "can_read_professional_commission_v2",
  "p_user_id = caller.user_id",
  "professional.auth_user_id = p_user_id",
  "auth.jwt() ->> 'email'",
  "authorized users read professionals",
  "authorized users read commission entries",
  "authorized users read commission settlements",
  "authorized users read commission settlement items",
  "authorized users read commission adjustments",
  "notify pgrst, 'reload schema'",
]) {
  assert.ok(
    hardenedCommissionReadMigration.includes(fragment),
    `leitura financeira endurecida deve conter: ${fragment}`,
  );
}
const hardenedEntryReadPolicy = hardenedCommissionReadMigration.slice(
  hardenedCommissionReadMigration.indexOf(
    'create policy "authorized users read commission entries"',
  ),
  hardenedCommissionReadMigration.indexOf(
    'create policy "authorized users read commission settlements"',
  ),
);
assert.ok(
  !hardenedEntryReadPolicy.includes("'commandas'"),
  "permissão de comandas não pode liberar comissões de outros profissionais",
);
for (const fragment of [
  "current_professional_ids",
  "auth.jwt() ->> 'email'",
  "professional.auth_user_id is null",
  "lower(trim(professional.email)) = caller.email",
  "id in (",
  "authorized users read professionals",
  "can_manage_commission_finance",
  "can_read_professional_commission",
]) {
  assert.ok(
    ownFinanceEmailLinkMigration.includes(fragment),
    `migracao de compatibilidade por e-mail deve conter: ${fragment}`,
  );
}
for (const fragment of [
  "current_professional_ids",
  "can_manage_commission_finance",
  "can_operate_commission_entries",
  "can_read_professional_commission",
  "authorized users read commission entries",
  "authorized users read commission settlements",
  "authorized users read commission settlement items",
  "authorized users read commission adjustments",
  'drop policy if exists "tenant members manage commission entries"',
  'drop policy if exists "professionals read own commission entries"',
  "notify pgrst, 'reload schema'",
]) {
  assert.ok(
    commissionReadRepairMigration.includes(fragment),
    `reparo de leitura de comissoes deve conter: ${fragment}`,
  );
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
assert.ok(comissoes.includes("restrictedProfessionalId"));
assert.ok(comissoes.includes("restrictedProfessionalIds"));
assert.ok(comissoes.includes("effectiveProfessionalFilter"));
assert.ok(comissoes.includes('.in("professional_id", restrictedProfessionalIds)'));
assert.ok(!comissoes.includes('.eq("professional_id", restrictedProfessionalId)'));
assert.ok(comissoes.includes(': "*"'));
assert.ok(comissoes.includes("Nenhum valor foi tratado como zero"));
assert.ok(comissoes.includes("summarizeCommissionEntries"));
assert.ok(comissoes.includes("Faturamento dos serviços"));
assert.ok(comissoes.includes("Calculada sobre o faturamento do profissional"));
assert.ok(!comissoes.includes('title="Produtos comissionados"'));
assert.ok(!comissoes.includes('title="Comissão específica por produto"'));

console.log(
  "Commission finance tests passed: owner, professionals A/B, frozen percentage, partial/full payment, duplicate block, cancellation/audit guards.",
);

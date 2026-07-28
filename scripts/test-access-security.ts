import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync(
  new URL(
    "../supabase/migrations/20260727103000_staff_positions_access_permissions.sql",
    import.meta.url,
  ),
  "utf8",
).replace(/\r\n/g, "\n");
const edgeFunction = readFileSync(
  new URL("../supabase/functions/manage-professional-access/index.ts", import.meta.url),
  "utf8",
).replace(/\r\n/g, "\n");
const edgeFunctionCompact = edgeFunction.replace(/\s+/g, " ");

for (const requiredSql of [
  "create table if not exists public.staff_positions",
  "professionals_tenant_auth_user_key",
  "private.professional_has_permission",
  "public.get_tenant_operational_settings",
  "authorized users read appointments",
  "professional_id = private.current_professional_id",
  "authorized users read commandas",
  "authorized users manage tenant settings",
  "authorized users read clients",
  "revoke select on public.professionals from anon",
  "protect_professional_access_fields",
]) {
  assert.equal(
    migration.includes(requiredSql),
    true,
    `A migração deve conter a proteção: ${requiredSql}`,
  );
}

assert.equal(
  migration.includes("'finance_general', (select auth.uid())"),
  false,
  "O profissional não pode receber financeiro geral por uma política implícita",
);
assert.equal(
  migration.includes("and p_permission in (\n                'agenda_all'"),
  true,
  "O padrão da recepção deve ser operacional e não financeiro",
);

for (const requiredEdgeProtection of [
  "admin.auth.admin.createUser",
  "findUserByEmail",
  "linkedExisting",
  "passwordReset",
  "isManagingOwnOwnerAccess",
  "O proprietário conectado não pode desativar o próprio acesso.",
  "Use a troca de senha da própria conta para alterar o seu acesso.",
  "admin.auth.admin.updateUserById",
  '.in("role", ["owner", "barber", "staff"])',
]) {
  assert.equal(
    edgeFunction.includes(requiredEdgeProtection),
    true,
    `A Edge Function deve conter: ${requiredEdgeProtection}`,
  );
}

assert.equal(
  edgeFunctionCompact.includes(
    "mustChangePassword = createdUserId || passwordReset ? true : Boolean(professional.must_change_password)",
  ),
  true,
  "Senha provisória definida pelo proprietário deve exigir troca no próximo acesso",
);

console.log("Proteções estruturais da migração e da Edge Function aprovadas.");

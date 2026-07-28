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
const appShell = readFileSync(
  new URL("../src/routes/_authenticated/app.tsx", import.meta.url),
  "utf8",
).replace(/\r\n/g, "\n");
const passwordPolicy = readFileSync(
  new URL("../src/lib/password-policy.ts", import.meta.url),
  "utf8",
).replace(/\r\n/g, "\n");
const tenantAccessHook = readFileSync(
  new URL("../src/hooks/use-tenant.ts", import.meta.url),
  "utf8",
).replace(/\r\n/g, "\n");
const professionalRegistry = readFileSync(
  new URL("../src/routes/_authenticated/app.cadastros.tsx", import.meta.url),
  "utf8",
).replace(/\r\n/g, "\n");

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
  "Essa senha foi recusada pela proteção do Auth.",
  "admin.auth.admin.updateUserById",
  "existingProfile.active_tenant_id !== tenantId",
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
    "passwordReset = Boolean(password && !createdUserId)",
  ),
  true,
  "Senha provisória deve ser aplicada também quando o usuário Auth já existe",
);

assert.equal(
  edgeFunctionCompact.includes(
    "mustChangePassword = createdUserId || passwordReset ? true : Boolean(professional.must_change_password)",
  ),
  true,
  "Senha provisória definida pelo proprietário deve exigir troca no próximo acesso",
);

for (const requiredProfessionalPasswordFlow of [
  "supabase.auth.updateUser({ password })",
  "projectPasswordAuthErrorMessage(",
  "passwordUpdateError",
  "must_change_password: false",
  "Crie sua senha pessoal",
  "showPassword",
  "showConfirmation",
  "Mostrar senha",
]) {
  assert.equal(
    appShell.includes(requiredProfessionalPasswordFlow),
    true,
    `A troca de senha pessoal do profissional deve conter: ${requiredProfessionalPasswordFlow}`,
  );
}

for (const requiredPasswordPolicy of [
  "temporaryPassword",
  "Essa senha provisória foi recusada",
  "evite combinações muito comuns",
  "incluindo letras e números",
  "!/[A-Za-z]/.test(password)",
  "!/\\d/.test(password)",
]) {
  assert.equal(
    passwordPolicy.includes(requiredPasswordPolicy),
    true,
    `A política de senha deve conter: ${requiredPasswordPolicy}`,
  );
}

for (const requiredTenantAccessFallback of [
  "profileTenantIsUsable",
  "firstRoleTenantId",
  "profileTenantIsUsable ? profileTenantId : null",
]) {
  assert.equal(
    tenantAccessHook.includes(requiredTenantAccessFallback),
    true,
    `O acesso deve cair para uma loja com papel/permissão se a loja ativa estiver inválida: ${requiredTenantAccessFallback}`,
  );
}

for (const requiredRegistryPasswordUx of [
  "showAccessPassword",
  "Senha provisória de acesso",
  "Use no mínimo 8 caracteres, com letras e números.",
  "Ex.: Linkup2026",
  "Mostrar senha",
  "EyeOff",
]) {
  assert.equal(
    professionalRegistry.includes(requiredRegistryPasswordUx),
    true,
    `O cadastro deve orientar e permitir visualizar a senha provisória: ${requiredRegistryPasswordUx}`,
  );
}

console.log("Proteções estruturais da migração e da Edge Function aprovadas.");

import assert from "node:assert/strict";

import {
  DEFAULT_PROFILE_PERMISSIONS,
  canAccessAppPath,
  getDefaultAppPath,
  getEffectiveAccessPermissions,
  hasAccessPermission,
} from "../src/lib/access-control.ts";

const tenantId = "00000000-0000-0000-0000-000000000001";

const owner = {
  activeTenantId: tenantId,
  roles: [{ tenant_id: tenantId, role: "owner" }],
  accessProfile: "owner" as const,
  accessPermissions: [],
};

const professional = {
  activeTenantId: tenantId,
  roles: [{ tenant_id: tenantId, role: "barber" }],
  accessProfile: "professional" as const,
  accessPermissions: [],
  professionalId: "00000000-0000-0000-0000-000000000010",
  availableForBooking: false,
  showOnBooking: false,
};

const reception = {
  activeTenantId: tenantId,
  roles: [{ tenant_id: tenantId, role: "staff" }],
  accessProfile: "reception" as const,
  accessPermissions: [...DEFAULT_PROFILE_PERMISSIONS.reception],
};

const manager = {
  activeTenantId: tenantId,
  roles: [{ tenant_id: tenantId, role: "staff" }],
  accessProfile: "manager" as const,
  accessPermissions: [...DEFAULT_PROFILE_PERMISSIONS.manager],
};

for (const path of [
  "/app",
  "/app/agenda",
  "/app/comandas",
  "/app/cadastros",
  "/app/assinantes",
  "/app/financeiro",
  "/app/caixa",
  "/app/comissoes",
  "/app/estoque",
  "/app/configuracoes",
  "/app/assinatura",
  "/app/relatorios",
]) {
  assert.equal(canAccessAppPath(path, owner), true, `Proprietário deve acessar ${path}`);
}

for (const path of ["/app/agenda", "/app/comissoes"]) {
  assert.equal(canAccessAppPath(path, professional), true, `Profissional deve acessar ${path}`);
}
for (const path of [
  "/app",
  "/app/comandas",
  "/app/cadastros",
  "/app/assinantes",
  "/app/financeiro",
  "/app/caixa",
  "/app/estoque",
  "/app/configuracoes",
  "/app/assinatura",
  "/app/relatorios",
]) {
  assert.equal(
    canAccessAppPath(path, professional),
    false,
    `Profissional não deve acessar ${path}`,
  );
}
assert.equal(hasAccessPermission(professional, "own_agenda"), true);
assert.equal(hasAccessPermission(professional, "own_finance"), true);
assert.equal(hasAccessPermission(professional, "finance_general"), false);
assert.equal(getDefaultAppPath(professional), "/app/agenda");
assert.equal(
  canAccessAppPath("/app/agenda", professional),
  true,
  "A disponibilidade da vitrine não deve remover o acesso individual à agenda",
);

for (const path of ["/app/agenda", "/app/comandas", "/app/cadastros"]) {
  assert.equal(canAccessAppPath(path, reception), true, `Recepção deve acessar ${path}`);
}
for (const path of [
  "/app",
  "/app/financeiro",
  "/app/caixa",
  "/app/comissoes",
  "/app/configuracoes",
  "/app/estoque",
  "/app/assinantes",
  "/app/relatorios",
]) {
  assert.equal(
    canAccessAppPath(path, reception),
    false,
    `Recepção não deve acessar ${path}`,
  );
}
assert.equal(getDefaultAppPath(reception), "/app/agenda");

for (const permission of DEFAULT_PROFILE_PERMISSIONS.manager) {
  assert.equal(
    getEffectiveAccessPermissions(manager).has(permission),
    true,
    `Gerente deve receber a permissão ${permission}`,
  );
}
assert.equal(canAccessAppPath("/app/financeiro", manager), true);
assert.equal(canAccessAppPath("/app/configuracoes", manager), true);
assert.equal(canAccessAppPath("/app/assinatura", manager), false);

const disabledAccess = {
  activeTenantId: tenantId,
  roles: [],
  accessProfile: null,
  accessPermissions: [],
  professionalId: null,
};
assert.equal(getEffectiveAccessPermissions(disabledAccess).size, 0);
assert.equal(canAccessAppPath("/app", disabledAccess), false);
assert.equal(canAccessAppPath("/app/agenda", disabledAccess), false);
assert.equal(canAccessAppPath("/app/comissoes", disabledAccess), false);
assert.equal(getDefaultAppPath(disabledAccess), "/auth");

const limitedManager = {
  ...manager,
  accessPermissions: ["agenda_all"],
};
assert.equal(canAccessAppPath("/app/agenda", limitedManager), true);
assert.equal(canAccessAppPath("/app/financeiro", limitedManager), false);

assert.equal(canAccessAppPath("/app/rota-nao-classificada", owner), false);
assert.equal(canAccessAppPath("/app", undefined), false);

console.log("Cenários de acesso aprovados: Proprietário, Gerente, Profissional e Recepção.");

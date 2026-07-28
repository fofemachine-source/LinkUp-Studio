export const ACCESS_PROFILES = [
  { value: "owner", label: "Proprietário" },
  { value: "manager", label: "Gerente" },
  { value: "professional", label: "Profissional" },
  { value: "reception", label: "Recepção / Funcionário" },
] as const;

export type AccessProfile = (typeof ACCESS_PROFILES)[number]["value"];

export const ACCESS_PERMISSION_OPTIONS = [
  { value: "dashboard", label: "Painel geral" },
  { value: "own_agenda", label: "Própria agenda" },
  { value: "agenda_all", label: "Agenda de toda a equipe" },
  { value: "commandas", label: "Comandas e vendas" },
  { value: "clients", label: "Clientes" },
  { value: "manage_staff", label: "Profissionais, cargos e acessos" },
  { value: "services", label: "Serviços" },
  { value: "products", label: "Produtos" },
  { value: "subscriptions", label: "Assinaturas de clientes" },
  { value: "own_finance", label: "Próprio financeiro e comissões" },
  { value: "finance_general", label: "Financeiro geral da loja" },
  { value: "commissions", label: "Gestão de comissões" },
  { value: "inventory", label: "Estoque" },
  { value: "settings", label: "Configurações da loja" },
  { value: "manage_operations", label: "Gestão completa da operação" },
  {
    value: "receive_operational_notifications",
    label: "Receber notificações operacionais",
  },
] as const;

export type AccessPermission = (typeof ACCESS_PERMISSION_OPTIONS)[number]["value"];

export const ALL_ACCESS_PERMISSIONS = ACCESS_PERMISSION_OPTIONS.map(
  ({ value }) => value,
) as AccessPermission[];

export const DEFAULT_PROFILE_PERMISSIONS: Record<AccessProfile, AccessPermission[]> = {
  owner: [...ALL_ACCESS_PERMISSIONS],
  manager: [
    "dashboard",
    "agenda_all",
    "commandas",
    "clients",
    "manage_staff",
    "services",
    "products",
    "subscriptions",
    "finance_general",
    "commissions",
    "inventory",
    "settings",
    "manage_operations",
    "receive_operational_notifications",
  ],
  professional: ["own_agenda", "own_finance"],
  reception: [
    "agenda_all",
    "commandas",
    "clients",
    "receive_operational_notifications",
  ],
};

type AccessLike = {
  isSuperAdmin?: boolean;
  activeTenantId?: string | null;
  roles?: Array<{ tenant_id: string | null; role: string }>;
  accessProfile?: AccessProfile | null;
  accessPermissions?: string[] | null;
  professionalId?: string | null;
};

function tenantRoles(access?: AccessLike | null) {
  return (access?.roles ?? [])
    .filter(({ tenant_id }) => tenant_id === access?.activeTenantId)
    .map(({ role }) => role);
}

export function getEffectiveAccessPermissions(access?: AccessLike | null) {
  if (!access) return new Set<AccessPermission>();
  const roles = tenantRoles(access);
  if (
    access.isSuperAdmin ||
    roles.includes("super_admin") ||
    roles.includes("owner") ||
    access.accessProfile === "owner"
  ) {
    return new Set<AccessPermission>(ALL_ACCESS_PERMISSIONS);
  }

  const profile =
    access.accessProfile ??
    (roles.includes("barber")
      ? "professional"
      : roles.includes("staff")
        ? "manager"
        : null);
  if (!profile) return new Set<AccessPermission>();
  const configured = (access.accessPermissions ?? []).filter((permission) =>
    ALL_ACCESS_PERMISSIONS.includes(permission as AccessPermission),
  ) as AccessPermission[];

  const permissions =
    configured.length > 0 ? configured : DEFAULT_PROFILE_PERMISSIONS[profile];

  // A agenda e o financeiro próprios são garantias mínimas do perfil profissional.
  if (profile === "professional") {
    return new Set<AccessPermission>([
      ...permissions,
      "own_agenda",
      "own_finance",
    ]);
  }

  return new Set<AccessPermission>(permissions);
}

export function hasAccessPermission(
  access: AccessLike | null | undefined,
  permission: AccessPermission,
) {
  return getEffectiveAccessPermissions(access).has(permission);
}

export function canAccessAppPath(
  pathname: string,
  access: AccessLike | null | undefined,
) {
  if (!access) return false;
  const permissions = getEffectiveAccessPermissions(access);
  if (pathname === "/app" || pathname.startsWith("/app/relatorios")) {
    return permissions.has("dashboard");
  }
  if (pathname.startsWith("/app/agenda")) {
    return permissions.has("own_agenda") || permissions.has("agenda_all");
  }
  if (pathname.startsWith("/app/comandas")) return permissions.has("commandas");
  if (pathname.startsWith("/app/assinantes")) {
    return permissions.has("subscriptions");
  }
  if (pathname.startsWith("/app/financeiro")) {
    return permissions.has("finance_general");
  }
  if (pathname.startsWith("/app/caixa")) {
    return permissions.has("finance_general");
  }
  if (pathname.startsWith("/app/comissoes")) {
    return permissions.has("own_finance") || permissions.has("commissions");
  }
  if (pathname.startsWith("/app/estoque")) return permissions.has("inventory");
  if (pathname.startsWith("/app/configuracoes")) return permissions.has("settings");
  if (pathname.startsWith("/app/assinatura")) {
    return (
      access.isSuperAdmin === true ||
      tenantRoles(access).includes("owner") ||
      access.accessProfile === "owner"
    );
  }
  if (pathname.startsWith("/app/cadastros")) {
    return (
      permissions.has("clients") ||
      permissions.has("manage_staff") ||
      permissions.has("services") ||
      permissions.has("products")
    );
  }
  // Rotas autenticadas novas precisam ser classificadas explicitamente.
  // Assim, uma tela futura não nasce acessível por acidente.
  return false;
}

export function getDefaultAppPath(access: AccessLike | null | undefined) {
  const candidates: Array<[AccessPermission, string]> = [
    ["dashboard", "/app"],
    ["own_agenda", "/app/agenda"],
    ["agenda_all", "/app/agenda"],
    ["commandas", "/app/comandas"],
    ["own_finance", "/app/comissoes"],
    ["finance_general", "/app/financeiro"],
    ["inventory", "/app/estoque"],
  ];
  const permissions = getEffectiveAccessPermissions(access);
  return candidates.find(([permission]) => permissions.has(permission))?.[1] ?? "/auth";
}

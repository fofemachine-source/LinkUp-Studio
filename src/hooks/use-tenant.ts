import { useQuery, type QueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchAuthUser, getAuthUser } from "@/lib/auth-cache";

export type Tenant = {
  id: string;
  slug: string;
  name: string;
  subtitle: string | null;
  logo_url: string | null;
  banner_url: string | null;
  whatsapp: string | null;
  pix_key: string | null;
  pix_holder: string | null;
  primary_color: string | null;
  slot_minutes: number | null;
  status: string | null;
  plan: string | null;
  plan_expires_at: string | null;
  status_reason: string | null;
  billing_blocked_at: string | null;
};

type TenantAccessRole = {
  tenant_id: string | null;
  role: string;
};

export type TenantAccess = {
  tenant: Tenant | null;
  roles: TenantAccessRole[];
  activeTenantId: string | null;
  isSuperAdmin: boolean;
  profileFullName: string | null;
  userId: string | null;
};

export const tenantAccessQueryKey = ["current-tenant"] as const;
export const tenantAccessStaleTime = 60 * 1000;

const emptyAccess: TenantAccess = {
  tenant: null,
  roles: [],
  activeTenantId: null,
  isSuperAdmin: false,
  profileFullName: null,
  userId: null,
};

const tenantSelect =
  "id,slug,name,subtitle,logo_url,banner_url,whatsapp,pix_key,pix_holder,primary_color,slot_minutes,status,plan,plan_expires_at,status_reason,billing_blocked_at";

async function fetchTenantAccess(userId?: string | null): Promise<TenantAccess> {
  const resolvedUserId = userId ?? (await fetchAuthUser())?.id ?? null;
  if (!resolvedUserId) return emptyAccess;

  const [profileResult, rolesResult] = await Promise.all([
    supabase
      .from("profiles")
      .select("active_tenant_id, full_name")
      .eq("id", resolvedUserId)
      .maybeSingle(),
    supabase.from("user_roles").select("tenant_id, role").eq("user_id", resolvedUserId),
  ]);

  if (profileResult.error) throw profileResult.error;
  if (rolesResult.error) throw rolesResult.error;

  const roles = rolesResult.data ?? [];
  const tenantId =
    profileResult.data?.active_tenant_id ?? roles.find((role) => role.tenant_id)?.tenant_id ?? null;
  const isSuperAdmin = roles.some((role) => role.role === "super_admin");

  if (!tenantId) {
    return {
      ...emptyAccess,
      roles,
      isSuperAdmin,
      profileFullName: profileResult.data?.full_name ?? null,
      userId: resolvedUserId,
    };
  }

  const { data: tenant, error: tenantError } = await supabase
    .from("tenants")
    .select(tenantSelect)
    .eq("id", tenantId)
    .maybeSingle();
  if (tenantError) throw tenantError;

  return {
    tenant: (tenant as Tenant | null) ?? null,
    roles,
    activeTenantId: tenantId,
    isSuperAdmin,
    profileFullName: profileResult.data?.full_name ?? null,
    userId: resolvedUserId,
  };
}

export async function getTenantAccess(queryClient: QueryClient) {
  const user = await getAuthUser(queryClient);
  if (!user) return emptyAccess;
  return queryClient.fetchQuery({
    queryKey: tenantAccessQueryKey,
    queryFn: () => fetchTenantAccess(user.id),
    staleTime: tenantAccessStaleTime,
  });
}

export function useTenantAccess() {
  return useQuery({
    queryKey: tenantAccessQueryKey,
    queryFn: () => fetchTenantAccess(),
    staleTime: tenantAccessStaleTime,
    refetchInterval: 60_000,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: false,
  });
}

export function useCurrentTenant() {
  return useQuery({
    queryKey: tenantAccessQueryKey,
    queryFn: () => fetchTenantAccess(),
    select: (access) => access.tenant,
    staleTime: tenantAccessStaleTime,
    refetchInterval: 60_000,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: false,
  });
}

export function useIsSuperAdmin() {
  return useQuery({
    queryKey: tenantAccessQueryKey,
    queryFn: () => fetchTenantAccess(),
    select: (access) => access.isSuperAdmin,
    staleTime: tenantAccessStaleTime,
    refetchInterval: 60_000,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: false,
  });
}

export function useUserRole(tenantId?: string) {
  return useQuery({
    queryKey: tenantAccessQueryKey,
    queryFn: () => fetchTenantAccess(),
    enabled: !!tenantId,
    select: (access) =>
      access.roles.find((role) => role.tenant_id === tenantId)?.role ??
      (access.isSuperAdmin ? "super_admin" : null),
    staleTime: tenantAccessStaleTime,
    refetchInterval: 60_000,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: false,
  });
}

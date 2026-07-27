import { useQuery, type QueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchAuthUser, getAuthUser } from "@/lib/auth-cache";
import type { AccessProfile } from "@/lib/access-control";

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

export type TenantAccessRole = {
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
  professionalId: string | null;
  accessProfile: AccessProfile | null;
  accessPermissions: string[];
  availableForBooking: boolean | null;
  showOnBooking: boolean | null;
  mustChangePassword: boolean;
  receiveOperationalNotifications: boolean;
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
  professionalId: null,
  accessProfile: null,
  accessPermissions: [],
  availableForBooking: null,
  showOnBooking: null,
  mustChangePassword: false,
  receiveOperationalNotifications: false,
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

  const [tenantResult, professionalResult] = await Promise.all([
    supabase.from("tenants").select(tenantSelect).eq("id", tenantId).maybeSingle(),
    supabase
      .from("professionals")
      .select(
        "id,access_profile,access_permissions,available_for_booking,show_on_booking,must_change_password,receive_operational_notifications",
      )
      .eq("tenant_id", tenantId)
      .eq("auth_user_id", resolvedUserId)
      .eq("active", true)
      .maybeSingle(),
  ]);
  const { data: tenant, error: tenantError } = tenantResult;
  if (tenantError) throw tenantError;
  if (professionalResult.error) throw professionalResult.error;
  const professional = professionalResult.data;

  const hasTenantMembership =
    isSuperAdmin ||
    roles.some((role) => role.tenant_id === tenantId) ||
    Boolean(professional);
  if (!hasTenantMembership) {
    return {
      ...emptyAccess,
      roles,
      isSuperAdmin,
      profileFullName: profileResult.data?.full_name ?? null,
      userId: resolvedUserId,
    };
  }

  return {
    tenant: (tenant as Tenant | null) ?? null,
    roles,
    activeTenantId: tenantId,
    isSuperAdmin,
    profileFullName: profileResult.data?.full_name ?? null,
    userId: resolvedUserId,
    professionalId: professional?.id ?? null,
    accessProfile: (professional?.access_profile as AccessProfile | null) ?? null,
    accessPermissions: Array.isArray(professional?.access_permissions)
      ? professional.access_permissions
      : [],
    availableForBooking: professional?.available_for_booking ?? null,
    showOnBooking: professional?.show_on_booking ?? null,
    mustChangePassword: professional?.must_change_password === true,
    receiveOperationalNotifications:
      professional?.receive_operational_notifications === true,
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
    select: (access) => {
      const tenantRoles = access.roles.filter((r) => r.tenant_id === tenantId).map((r) => r.role);
      if (tenantRoles.includes("super_admin")) return "super_admin";
      if (tenantRoles.includes("owner")) return "owner";
      if (tenantRoles.includes("staff")) return "staff";
      if (tenantRoles.includes("barber")) return "barber";
      return tenantRoles[0] ?? (access.isSuperAdmin ? "super_admin" : null);
    },
    staleTime: tenantAccessStaleTime,
    refetchInterval: 60_000,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: false,
  });
}

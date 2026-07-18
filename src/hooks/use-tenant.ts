import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

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

export function useCurrentTenant() {
  return useQuery({
    queryKey: ["current-tenant"],
    queryFn: async () => {
      const { data: userRes, error: userError } = await supabase.auth.getUser();
      if (userError) throw userError;
      const uid = userRes.user?.id;
      if (!uid) return null;
      const [profileResult, rolesResult] = await Promise.all([
        supabase.from("profiles").select("active_tenant_id").eq("id", uid).maybeSingle(),
        supabase.from("user_roles").select("tenant_id, role").eq("user_id", uid),
      ]);
      if (profileResult.error) throw profileResult.error;
      if (rolesResult.error) throw rolesResult.error;
      const profile = profileResult.data;
      const roles = rolesResult.data;
      const tenantId = profile?.active_tenant_id ?? roles?.find((r) => r.tenant_id)?.tenant_id;
      if (!tenantId) return null;
      const { data: tenant, error: tenantError } = await supabase
        .from("tenants")
        .select("*")
        .eq("id", tenantId)
        .maybeSingle();
      if (tenantError) throw tenantError;
      return tenant as Tenant | null;
    },
    refetchInterval: 30_000,
    refetchIntervalInBackground: true,
  });
}

export function useIsSuperAdmin() {
  return useQuery({
    queryKey: ["is-super-admin"],
    queryFn: async () => {
      const { data: userRes, error: userError } = await supabase.auth.getUser();
      if (userError) throw userError;
      const uid = userRes.user?.id;
      if (!uid) return false;
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", uid)
        .eq("role", "super_admin");
      if (error) throw error;
      return (data?.length ?? 0) > 0;
    },
  });
}

export function useUserRole(tenantId?: string) {
  return useQuery({
    queryKey: ["user-role", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data: userRes } = await supabase.auth.getUser();
      const uid = userRes.user?.id;
      if (!uid || !tenantId) return null;
      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", uid)
        .eq("tenant_id", tenantId)
        .maybeSingle();
      return data?.role ?? null;
    },
  });
}

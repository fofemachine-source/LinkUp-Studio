import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type Tenant = {
  id: string; slug: string; name: string; subtitle: string | null;
  logo_url: string | null; banner_url: string | null;
  whatsapp: string | null; pix_key: string | null; pix_holder: string | null;
  primary_color: string | null; slot_minutes: number | null;
  status: string | null; plan: string | null; plan_expires_at: string | null;
};

export function useCurrentTenant() {
  return useQuery({
    queryKey: ["current-tenant"],
    queryFn: async () => {
      const { data: userRes } = await supabase.auth.getUser();
      const uid = userRes.user?.id;
      if (!uid) return null;
      const { data: profile } = await supabase.from("profiles").select("active_tenant_id").eq("id", uid).maybeSingle();
      const { data: roles } = await supabase.from("user_roles").select("tenant_id, role").eq("user_id", uid);
      const tenantId = profile?.active_tenant_id ?? roles?.find((r) => r.tenant_id)?.tenant_id;
      if (!tenantId) return null;
      const { data: tenant } = await supabase.from("tenants").select("*").eq("id", tenantId).maybeSingle();
      return tenant as Tenant | null;
    },
  });
}

export function useIsSuperAdmin() {
  return useQuery({
    queryKey: ["is-super-admin"],
    queryFn: async () => {
      const { data: userRes } = await supabase.auth.getUser();
      const uid = userRes.user?.id;
      if (!uid) return false;
      const { data } = await supabase.from("user_roles").select("role").eq("user_id", uid).eq("role", "super_admin");
      return (data?.length ?? 0) > 0;
    },
  });
}

import { supabase } from "@/integrations/supabase/client";

export type TenantOperationalSettings = {
  tenant_id: string;
  open_hour: number | null;
  close_hour: number | null;
  lunch_start: number | string | null;
  lunch_end: number | string | null;
  work_days: number[] | null;
  vip_days: number[] | null;
  vip_mode: string | null;
  closed_dates: string[] | null;
  appointment_alert_repeat_seconds: number | null;
  appointment_reception_alerts_enabled: boolean | null;
};

export async function getTenantOperationalSettings(tenantId: string) {
  const { data, error } = await supabase.rpc(
    "get_tenant_operational_settings",
    { p_tenant_id: tenantId },
  );
  if (error) throw error;
  return (data ?? null) as unknown as TenantOperationalSettings | null;
}

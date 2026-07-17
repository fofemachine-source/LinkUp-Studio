import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const deleteProfessionalSchema = z.object({
  tenantId: z.string().uuid(),
  professionalId: z.string().uuid(),
});

export const deleteProfessional = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => deleteProfessionalSchema.parse(d))
  .handler(async ({ data, context }) => {
    // Use the caller's authenticated client so every read/write remains subject
    // to the tenant and role policies configured in RLS.
    const db = context.supabase as any;

    const { data: callerRoles, error: roleError } = await context.supabase
      .from("user_roles")
      .select("role, tenant_id")
      .eq("user_id", context.userId);
    if (roleError) throw new Error(roleError.message);

    const canManage = (callerRoles ?? []).some((role) =>
      role.role === "super_admin" ||
      (role.tenant_id === data.tenantId && role.role === "owner"),
    );
    if (!canManage) throw new Error("Você não tem permissão para excluir este profissional.");

    const { data: professional, error: professionalError } = await db
      .from("professionals")
      .select("id, tenant_id, auth_user_id")
      .eq("id", data.professionalId)
      .eq("tenant_id", data.tenantId)
      .maybeSingle();
    if (professionalError) throw new Error(professionalError.message);
    if (!professional) throw new Error("Profissional não encontrado.");

    const historyTables = [
      "appointments",
      "commanda_items",
      "cash_movements",
      "commission_settlements",
      "commission_entries",
      "commission_adjustments",
      "commission_rules",
      "subscription_usages",
    ];
    const historyCounts = await Promise.all(
      historyTables.map(async (table) => {
        const { count, error } = await db
          .from(table)
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", data.tenantId)
          .eq("professional_id", data.professionalId);
        // Na dúvida, arquiva em vez de arriscar apagar um histórico relacionado.
        if (error) return 1;
        return count ?? 0;
      }),
    );
    const hasHistory = historyCounts.some((count) => count > 0);

    if (professional.auth_user_id) {
      const { count: otherProfessionalCount, error: otherProfessionalError } = await db
        .from("professionals")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", data.tenantId)
        .eq("auth_user_id", professional.auth_user_id)
        .neq("id", data.professionalId);
      if (otherProfessionalError) throw new Error(otherProfessionalError.message);

      if ((otherProfessionalCount ?? 0) === 0) {
        const { error: accessError } = await db
          .from("user_roles")
          .delete()
          .eq("user_id", professional.auth_user_id)
          .eq("tenant_id", data.tenantId)
          .eq("role", "barber");
        if (accessError) throw new Error(`Não foi possível revogar o acesso do profissional: ${accessError.message}`);
      }
    }

    if (hasHistory) {
      const { data: archivedProfessional, error } = await db
        .from("professionals")
        .update({ active: false, auth_user_id: null })
        .eq("id", data.professionalId)
        .eq("tenant_id", data.tenantId)
        .eq("active", true)
        .select("id, active")
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!archivedProfessional || archivedProfessional.active !== false) {
        throw new Error("Não foi possível confirmar o arquivamento do profissional.");
      }
    } else {
      const { data: deletedProfessional, error } = await db
        .from("professionals")
        .delete()
        .eq("id", data.professionalId)
        .eq("tenant_id", data.tenantId)
        .select("id")
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!deletedProfessional) {
        throw new Error("Não foi possível confirmar a exclusão do profissional.");
      }
    }

    return { ok: true, archived: hasHistory };
  });

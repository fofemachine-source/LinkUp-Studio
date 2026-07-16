import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  PROJECT_PASSWORD_MIN_LENGTH,
  PROJECT_PASSWORD_REQUIREMENT,
  projectPasswordAuthErrorMessage,
} from "@/lib/password-policy";

const accessSchema = z.object({
  tenantId: z.string().uuid(),
  professionalId: z.string().uuid(),
  fullName: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(PROJECT_PASSWORD_MIN_LENGTH, PROJECT_PASSWORD_REQUIREMENT).optional().nullable(),
});

const deleteProfessionalSchema = z.object({
  tenantId: z.string().uuid(),
  professionalId: z.string().uuid(),
});

function professionalAccessAuthError(error: { code?: string; message?: string }) {
  return new Error(projectPasswordAuthErrorMessage(error, "Não foi possível criar o acesso do profissional."));
}

export const createProfessionalAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => accessSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: callerRoles, error: roleError } = await context.supabase
      .from("user_roles")
      .select("role, tenant_id")
      .eq("user_id", context.userId);
    if (roleError) throw new Error(roleError.message);

    const canManage = (callerRoles ?? []).some((role) =>
      role.role === "super_admin" ||
      (role.tenant_id === data.tenantId && (role.role === "owner" || role.role === "staff")),
    );
    if (!canManage) throw new Error("Você não tem permissão para liberar acesso deste profissional.");

    const { data: pro, error: proError } = await supabaseAdmin
      .from("professionals")
      .select("id, tenant_id")
      .eq("id", data.professionalId)
      .eq("tenant_id", data.tenantId)
      .maybeSingle();
    if (proError) throw new Error(proError.message);
    if (!pro) throw new Error("Profissional não encontrado.");

    const email = data.email.toLowerCase().trim();
    const { data: users } = await supabaseAdmin.auth.admin.listUsers();
    let authUser = users.users.find((user) => user.email?.toLowerCase() === email);

    if (!authUser) {
      if (!data.password) {
        throw new Error(PROJECT_PASSWORD_REQUIREMENT);
      }
      const created = await supabaseAdmin.auth.admin.createUser({
        email,
        password: data.password,
        email_confirm: true,
        user_metadata: { full_name: data.fullName },
      });
      if (created.error) throw professionalAccessAuthError(created.error);
      authUser = created.data.user;
    } else {
      const updateParams: any = {
        user_metadata: { ...authUser.user_metadata, full_name: data.fullName },
      };
      if (data.password) {
        updateParams.password = data.password;
      }
      const updated = await supabaseAdmin.auth.admin.updateUserById(authUser.id, updateParams);
      if (updated.error) throw professionalAccessAuthError(updated.error);
      authUser = updated.data.user;
    }

    const { data: existingRole } = await supabaseAdmin
      .from("user_roles")
      .select("id")
      .eq("user_id", authUser.id)
      .eq("tenant_id", data.tenantId)
      .eq("role", "barber")
      .maybeSingle();
    if (!existingRole) {
      const roleInsert = await supabaseAdmin
        .from("user_roles")
        .insert({ user_id: authUser.id, tenant_id: data.tenantId, role: "barber" });
      if (roleInsert.error && roleInsert.error.code !== "23505") throw new Error(roleInsert.error.message);
    }

    await supabaseAdmin
      .from("profiles")
      .upsert({ id: authUser.id, full_name: data.fullName, active_tenant_id: data.tenantId }, { onConflict: "id" });

    const { error: updateError } = await supabaseAdmin
      .from("professionals")
      .update({ auth_user_id: authUser.id, email })
      .eq("id", data.professionalId);
    if (updateError) throw new Error(updateError.message);

    return { ok: true, userId: authUser.id };
  });

export const deleteProfessional = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => deleteProfessionalSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;

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
      const { error } = await db
        .from("professionals")
        .update({ active: false, auth_user_id: null })
        .eq("id", data.professionalId)
        .eq("tenant_id", data.tenantId);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await db
        .from("professionals")
        .delete()
        .eq("id", data.professionalId)
        .eq("tenant_id", data.tenantId);
      if (error) throw new Error(error.message);
    }

    return { ok: true, archived: hasHistory };
  });

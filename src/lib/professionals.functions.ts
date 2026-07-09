import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const accessSchema = z.object({
  tenantId: z.string().uuid(),
  professionalId: z.string().uuid(),
  fullName: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(6),
});

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
      const created = await supabaseAdmin.auth.admin.createUser({
        email,
        password: data.password,
        email_confirm: true,
        user_metadata: { full_name: data.fullName },
      });
      if (created.error) throw new Error(created.error.message);
      authUser = created.data.user;
    } else {
      const updated = await supabaseAdmin.auth.admin.updateUserById(authUser.id, {
        password: data.password,
        user_metadata: { ...authUser.user_metadata, full_name: data.fullName },
      });
      if (updated.error) throw new Error(updated.error.message);
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
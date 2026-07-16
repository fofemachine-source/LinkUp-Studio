import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  PROJECT_PASSWORD_MIN_LENGTH,
  PROJECT_PASSWORD_REQUIREMENT,
  projectPasswordAuthErrorMessage,
} from "@/lib/password-policy";

const ownerPasswordSchema = z
  .string()
  .min(PROJECT_PASSWORD_MIN_LENGTH, PROJECT_PASSWORD_REQUIREMENT);

function tenantAuthError(error: { code?: string; message?: string }) {
  return new Error(projectPasswordAuthErrorMessage(error, "Não foi possível criar ou atualizar o acesso da loja."));
}

function requiredOwnerPassword(password: string | undefined) {
  if (!password) throw new Error(PROJECT_PASSWORD_REQUIREMENT);
  return password;
}

// Create a new tenant (barbershop) from the SaaS panel. Requires super_admin caller.
export const createTenant = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z.object({
      name: z.string().min(2),
      slug: z.string().min(2).regex(/^[a-z0-9-]+$/),
      whatsapp: z.string().optional(),
      plan: z.enum(["monthly", "yearly"]).default("monthly"),
      owner_email: z.string().email().optional(),
      owner_password: ownerPasswordSchema.optional(),
    }).parse(d),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const expires = new Date();
    if (data.plan === "yearly") expires.setFullYear(expires.getFullYear() + 1);
    else expires.setMonth(expires.getMonth() + 1);

    const { data: t, error } = await supabaseAdmin
      .from("tenants")
      .insert({
        name: data.name,
        slug: data.slug,
        whatsapp: data.whatsapp ?? null,
        plan: data.plan,
        plan_expires_at: expires.toISOString(),
        status: "active",
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    await supabaseAdmin.from("tenant_settings").insert({ tenant_id: t.id });

    // Optionally provision an owner user.
    if (data.owner_email && data.owner_password) {
      const created = await supabaseAdmin.auth.admin.createUser({
        email: data.owner_email,
        password: data.owner_password,
        email_confirm: true,
      });
      if (created.error) throw tenantAuthError(created.error);
      if (created.data.user) {
        await supabaseAdmin.from("user_roles").insert({ user_id: created.data.user.id, tenant_id: t.id, role: "owner" });
        await supabaseAdmin.from("profiles").update({ active_tenant_id: t.id }).eq("id", created.data.user.id);
      }
    }
    return { id: t.id };
  });

export const setTenantStatus = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ id: z.string().uuid(), status: z.enum(["active","blocked"]) }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("tenants").update({ status: data.status }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getTenantOwner = createServerFn({ method: "POST" })
  .inputValidator((d: { tenantId: string }) => z.object({ tenantId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: role } = await supabaseAdmin.from("user_roles").select("user_id").eq("tenant_id", data.tenantId).eq("role", "owner").maybeSingle();
    if (!role) return null;
    const { data: userRes } = await supabaseAdmin.auth.admin.getUserById(role.user_id);
    if (!userRes.user) return null;
    return {
      userId: userRes.user.id,
      email: userRes.user.email ?? "",
    };
  });

export const updateTenant = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z.object({
      id: z.string().uuid(),
      name: z.string().min(2),
      slug: z.string().min(2).regex(/^[a-z0-9-]+$/),
      whatsapp: z.string().optional(),
      plan: z.enum(["monthly", "yearly"]),
      owner_email: z.string().email().optional(),
      owner_password: ownerPasswordSchema.optional(),
    }).parse(d),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error: tErr } = await supabaseAdmin
      .from("tenants")
      .update({
        name: data.name,
        slug: data.slug,
        whatsapp: data.whatsapp ?? null,
        plan: data.plan,
      })
      .eq("id", data.id);
    if (tErr) throw new Error(tErr.message);

    if (data.owner_email) {
      const emailLower = data.owner_email.toLowerCase().trim();
      const { data: role } = await supabaseAdmin
        .from("user_roles")
        .select("user_id")
        .eq("tenant_id", data.id)
        .eq("role", "owner")
        .maybeSingle();

      if (role) {
        const { data: isSuper } = await supabaseAdmin
          .from("user_roles")
          .select("id")
          .eq("user_id", role.user_id)
          .eq("role", "super_admin")
          .maybeSingle();

        if (isSuper) {
          await supabaseAdmin
            .from("user_roles")
            .delete()
            .eq("tenant_id", data.id)
            .eq("role", "owner")
            .eq("user_id", role.user_id);

          const { data: users } = await supabaseAdmin.auth.admin.listUsers();
          let targetUser = users.users.find((u) => u.email?.toLowerCase() === emailLower);

          if (!targetUser) {
            const created = await supabaseAdmin.auth.admin.createUser({
              email: emailLower,
              password: requiredOwnerPassword(data.owner_password),
              email_confirm: true,
            });
            if (created.error) throw tenantAuthError(created.error);
            targetUser = created.data.user!;
          } else {
            const updateParams: any = { email_confirm: true };
            if (data.owner_password) {
              updateParams.password = data.owner_password;
            }
            const { error: pwdErr } = await supabaseAdmin.auth.admin.updateUserById(targetUser.id, updateParams);
            if (pwdErr) throw tenantAuthError(pwdErr);
          }

          await supabaseAdmin.from("user_roles").insert({ user_id: targetUser.id, tenant_id: data.id, role: "owner" });
          await supabaseAdmin.from("profiles").upsert({ id: targetUser.id, active_tenant_id: data.id }, { onConflict: "id" });
        } else {
          const { data: userRes } = await supabaseAdmin.auth.admin.getUserById(role.user_id);
          if (userRes.user) {
            const updateParams: any = { email: emailLower, email_confirm: true };
            if (data.owner_password) {
              updateParams.password = data.owner_password;
            }
            const { error: uErr } = await supabaseAdmin.auth.admin.updateUserById(role.user_id, updateParams);
            if (uErr) throw tenantAuthError(uErr);
          }
        }
      } else {
        const { data: users } = await supabaseAdmin.auth.admin.listUsers();
        let targetUser = users.users.find((u) => u.email?.toLowerCase() === emailLower);

        if (!targetUser) {
          const created = await supabaseAdmin.auth.admin.createUser({
            email: emailLower,
            password: requiredOwnerPassword(data.owner_password),
            email_confirm: true,
          });
          if (created.error) throw tenantAuthError(created.error);
          targetUser = created.data.user!;
        } else {
          const updateParams: any = { email_confirm: true };
          if (data.owner_password) {
            updateParams.password = data.owner_password;
          }
          const { error: pwdErr } = await supabaseAdmin.auth.admin.updateUserById(targetUser.id, updateParams);
          if (pwdErr) throw tenantAuthError(pwdErr);
        }

        await supabaseAdmin.from("user_roles").insert({ user_id: targetUser.id, tenant_id: data.id, role: "owner" });
        await supabaseAdmin.from("profiles").upsert({ id: targetUser.id, active_tenant_id: data.id }, { onConflict: "id" });
      }
    }

    return { ok: true };
  });

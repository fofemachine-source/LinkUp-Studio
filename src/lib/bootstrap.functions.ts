import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

// Bootstrap the initial super admin user and attach the Ernesth tenant owner if needed.
// Safe to call publicly: it only creates the super admin if one does not already exist.
export const bootstrapSuperAdmin = createServerFn({ method: "POST" })
  .inputValidator((d: { email: string; password: string }) =>
    z.object({ email: z.string().email(), password: z.string().min(6) }).parse(d),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // If any super admin already exists, do nothing.
    const { data: existing } = await supabaseAdmin
      .from("user_roles")
      .select("id")
      .eq("role", "super_admin")
      .limit(1);
    if (existing && existing.length > 0) return { ok: true, created: false };

    // Try to find the user by email; if missing, create it.
    const { data: list } = await supabaseAdmin.auth.admin.listUsers();
    let user = list.users.find((u) => u.email?.toLowerCase() === data.email.toLowerCase());
    if (!user) {
      const created = await supabaseAdmin.auth.admin.createUser({
        email: data.email,
        password: data.password,
        email_confirm: true,
        user_metadata: { full_name: "Super Admin" },
      });
      if (created.error) throw new Error(created.error.message);
      user = created.data.user!;
    }

    // Grant super admin role (global — no tenant).
    await supabaseAdmin.from("user_roles").insert({ user_id: user.id, role: "super_admin" });

    // Attach as owner of Ernesth tenant (if it exists) so he can also use the barbershop app.
    const { data: t } = await supabaseAdmin.from("tenants").select("id").eq("slug", "ernesth").maybeSingle();
    if (t?.id) {
      await supabaseAdmin.from("user_roles").insert({ user_id: user.id, tenant_id: t.id, role: "owner" });
      await supabaseAdmin.from("profiles").update({ active_tenant_id: t.id }).eq("id", user.id);
    }
    return { ok: true, created: true };
  });

// Sign-up creates the user as owner of the Ernesth tenant by default (single-tenant setup).
export const signUpOwner = createServerFn({ method: "POST" })
  .inputValidator((d: { userId: string; tenantSlug?: string }) =>
    z.object({ userId: z.string().uuid(), tenantSlug: z.string().optional() }).parse(d),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const slug = data.tenantSlug ?? "ernesth";
    const { data: t } = await supabaseAdmin.from("tenants").select("id").eq("slug", slug).maybeSingle();
    if (!t?.id) throw new Error("Barbearia não encontrada");
    // If tenant has no owner yet, grant owner; otherwise staff.
    const { data: owners } = await supabaseAdmin.from("user_roles").select("id").eq("tenant_id", t.id).eq("role", "owner").limit(1);
    const role = owners && owners.length > 0 ? "staff" : "owner";
    await supabaseAdmin.from("user_roles").insert({ user_id: data.userId, tenant_id: t.id, role });
    await supabaseAdmin.from("profiles").update({ active_tenant_id: t.id }).eq("id", data.userId);
    return { ok: true, role };
  });

import { createServerFn } from "@tanstack/react-start";
import type { AdminUserAttributes, SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";
import {
  PROJECT_PASSWORD_MIN_LENGTH,
  PROJECT_PASSWORD_REQUIREMENT,
  projectPasswordAuthErrorMessage,
} from "@/lib/password-policy";

const ownerPasswordSchema = z
  .string()
  .min(PROJECT_PASSWORD_MIN_LENGTH, PROJECT_PASSWORD_REQUIREMENT);

const billingCustomerSchema = z
  .object({
    legalName: z.string().min(2).optional(),
    cpfCnpj: z.string().optional(),
    email: z.string().email().optional(),
    phone: z.string().optional(),
    postalCode: z.string().optional(),
    address: z.string().optional(),
    addressNumber: z.string().optional(),
    complement: z.string().optional(),
    province: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    preferredBillingType: z.enum(["UNDEFINED", "PIX", "BOLETO", "CREDIT_CARD"]).default("UNDEFINED"),
    notificationDisabled: z.boolean().default(true),
  })
  .optional();

type BillingCustomerInput = z.infer<typeof billingCustomerSchema>;

function tenantAuthError(error: { code?: string; message?: string }) {
  return new Error(
    projectPasswordAuthErrorMessage(error, "Não foi possível criar ou atualizar o acesso da loja."),
  );
}

function requiredOwnerPassword(password: string | undefined) {
  if (!password) throw new Error(PROJECT_PASSWORD_REQUIREMENT);
  return password;
}

function digits(value: string | null | undefined) {
  return String(value ?? "").replace(/\D/g, "");
}

function validateCpfCnpj(value: string | null | undefined) {
  const clean = digits(value);
  if (clean && ![11, 14].includes(clean.length)) {
    throw new Error("Informe um CPF ou CNPJ válido.");
  }
  return clean;
}

function validatePhone(value: string | null | undefined) {
  const clean = digits(value);
  if (clean && clean.length < 10) throw new Error("Informe um WhatsApp válido.");
  return clean;
}

function validatePostalCode(value: string | null | undefined) {
  const clean = digits(value);
  if (clean && clean.length !== 8) throw new Error("Informe um CEP válido com 8 dígitos.");
  return clean;
}

function customerReference(tenantId: string) {
  return `linkupstudio:b2b:v1:tenant:${tenantId}`;
}

async function upsertBillingCustomer(
  supabaseAdmin: SupabaseClient<Database>,
  tenantId: string,
  tenantName: string,
  input: BillingCustomerInput,
  actorUserId: string,
) {
  if (!input) return;

  const cpfCnpj = validateCpfCnpj(input.cpfCnpj);
  const phone = validatePhone(input.phone);
  const postalCode = validatePostalCode(input.postalCode);
  const legalName = input.legalName?.trim() || tenantName.trim();

  const commonCustomer = {
    provider: "asaas",
    external_reference: customerReference(tenantId),
    legal_name: legalName,
    cpf_cnpj: cpfCnpj || null,
    email: input.email?.toLowerCase().trim() || null,
    phone: phone || null,
    address: input.address?.trim() || null,
    address_number: input.addressNumber?.trim() || null,
    complement: input.complement?.trim() || null,
    province: input.province?.trim() || null,
    postal_code: postalCode || null,
    city: input.city?.trim() || null,
    state: input.state?.trim().toUpperCase() || null,
    preferred_billing_type: input.preferredBillingType ?? "UNDEFINED",
    notification_disabled: input.notificationDisabled ?? true,
    sync_status: "pending",
    last_error: null,
    updated_by: actorUserId,
  };

  const { error } = await supabaseAdmin.from("tenant_billing_provider_customers").upsert(
    [
      {
        ...commonCustomer,
        tenant_id: tenantId,
        environment: "sandbox",
        created_by: actorUserId,
      },
      {
        ...commonCustomer,
        tenant_id: tenantId,
        environment: "production",
        created_by: actorUserId,
      },
    ],
    { onConflict: "tenant_id,provider,environment" },
  );
  if (error) throw new Error(error.message);
}

type AuthenticatedContext = {
  supabase: SupabaseClient<Database>;
  userId: string;
  accessToken: string;
};

async function assertSuperAdmin(context: AuthenticatedContext) {
  // These endpoints can change credentials and tenant state. Revalidate the
  // token against Supabase Auth so a revoked session cannot keep using them.
  const { data: authResult, error: authError } = await context.supabase.auth.getUser(
    context.accessToken,
  );
  if (authError || !authResult.user || authResult.user.id !== context.userId) {
    throw new Error("Sessão inválida ou expirada.");
  }

  const { data: role, error } = await context.supabase
    .from("user_roles")
    .select("id")
    .eq("user_id", context.userId)
    .eq("role", "super_admin")
    .limit(1)
    .maybeSingle();

  if (error) throw new Error("Não foi possível validar a permissão administrativa.");
  if (!role) throw new Error("Acesso restrito ao administrador geral do projeto.");
}

// Create a new tenant (barbershop) from the SaaS panel. Requires super_admin caller.
export const createTenant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        name: z.string().min(2),
        slug: z
          .string()
          .min(2)
          .regex(/^[a-z0-9-]+$/),
        whatsapp: z.string().optional(),
        plan: z.enum(["monthly", "yearly"]).default("monthly"),
        owner_email: z.string().email().optional(),
        owner_password: ownerPasswordSchema.optional(),
        billing_customer: billingCustomerSchema,
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context);
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
        await supabaseAdmin
          .from("user_roles")
          .insert({ user_id: created.data.user.id, tenant_id: t.id, role: "owner" });
        await supabaseAdmin
          .from("profiles")
          .update({ active_tenant_id: t.id })
          .eq("id", created.data.user.id);
      }
    }
    await upsertBillingCustomer(
      supabaseAdmin,
      t.id,
      data.name,
      data.billing_customer,
      context.userId,
    );
    return { id: t.id };
  });

export const setTenantStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ id: z.string().uuid(), status: z.enum(["active", "blocked"]) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const statusPatch =
      data.status === "blocked"
        ? {
            status: "blocked",
            status_reason: "manual_admin",
            billing_blocked_at: new Date().toISOString(),
          }
        : {
            status: "active",
            status_reason: null,
            billing_blocked_at: null,
          };
    // Generated database types are updated when the new billing migration is linked.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabaseAdmin as any)
      .from("tenants")
      .update(statusPatch)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getTenantOwner = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { tenantId: string }) => z.object({ tenantId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: role } = await supabaseAdmin
      .from("user_roles")
      .select("user_id")
      .eq("tenant_id", data.tenantId)
      .eq("role", "owner")
      .maybeSingle();
    if (!role) return null;
    const { data: userRes } = await supabaseAdmin.auth.admin.getUserById(role.user_id);
    if (!userRes.user) return null;
    return {
      userId: userRes.user.id,
      email: userRes.user.email ?? "",
    };
  });

export const updateTenant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        id: z.string().uuid(),
        name: z.string().min(2),
        slug: z
          .string()
          .min(2)
          .regex(/^[a-z0-9-]+$/),
        whatsapp: z.string().optional(),
        plan: z.enum(["monthly", "yearly"]),
        owner_email: z.string().email().optional(),
        owner_password: ownerPasswordSchema.optional(),
        billing_customer: billingCustomerSchema,
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context);
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
            const updateParams: AdminUserAttributes = { email_confirm: true };
            if (data.owner_password) {
              updateParams.password = data.owner_password;
            }
            const { error: pwdErr } = await supabaseAdmin.auth.admin.updateUserById(
              targetUser.id,
              updateParams,
            );
            if (pwdErr) throw tenantAuthError(pwdErr);
          }

          await supabaseAdmin
            .from("user_roles")
            .insert({ user_id: targetUser.id, tenant_id: data.id, role: "owner" });
          await supabaseAdmin
            .from("profiles")
            .upsert({ id: targetUser.id, active_tenant_id: data.id }, { onConflict: "id" });
        } else {
          const { data: userRes } = await supabaseAdmin.auth.admin.getUserById(role.user_id);
          if (userRes.user) {
            const updateParams: AdminUserAttributes = { email: emailLower, email_confirm: true };
            if (data.owner_password) {
              updateParams.password = data.owner_password;
            }
            const { error: uErr } = await supabaseAdmin.auth.admin.updateUserById(
              role.user_id,
              updateParams,
            );
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
          const updateParams: AdminUserAttributes = { email_confirm: true };
          if (data.owner_password) {
            updateParams.password = data.owner_password;
          }
          const { error: pwdErr } = await supabaseAdmin.auth.admin.updateUserById(
            targetUser.id,
            updateParams,
          );
          if (pwdErr) throw tenantAuthError(pwdErr);
        }

        await supabaseAdmin
          .from("user_roles")
          .insert({ user_id: targetUser.id, tenant_id: data.id, role: "owner" });
        await supabaseAdmin
          .from("profiles")
          .upsert({ id: targetUser.id, active_tenant_id: data.id }, { onConflict: "id" });
      }
    }

    await upsertBillingCustomer(
      supabaseAdmin,
      data.id,
      data.name,
      data.billing_customer,
      context.userId,
    );

    return { ok: true };
  });

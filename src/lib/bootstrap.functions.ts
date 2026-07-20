import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  PROJECT_PASSWORD_MIN_LENGTH,
  PROJECT_PASSWORD_REQUIREMENT,
} from "@/lib/password-policy";

const disabledProvisioningMessage =
  "Provisionamento administrativo desativado. Gerencie usuários e permissões pelo console matriz.";

const publicSignupPasswordSchema = z
  .string()
  .min(PROJECT_PASSWORD_MIN_LENGTH, PROJECT_PASSWORD_REQUIREMENT);

const publicBillingCustomerSchema = z.object({
  legalName: z.string().min(2, "Informe a razão social ou nome fiscal."),
  cpfCnpj: z.string().min(11, "Informe CPF ou CNPJ."),
  email: z.string().email("Informe um e-mail financeiro válido."),
  phone: z.string().min(10, "Informe o WhatsApp financeiro."),
  postalCode: z.string().min(8, "Informe o CEP."),
  address: z.string().min(2, "Informe o endereço."),
  addressNumber: z.string().min(1, "Informe o número."),
  complement: z.string().optional(),
  province: z.string().min(2, "Informe o bairro."),
  city: z.string().min(2, "Informe a cidade."),
  state: z.string().length(2, "Informe a UF com 2 letras."),
  preferredBillingType: z.enum(["UNDEFINED", "PIX", "BOLETO", "CREDIT_CARD"]).default("UNDEFINED"),
  notificationDisabled: z.boolean().default(true),
});

const publicTenantSignupSchema = z.object({
  name: z.string().min(2, "Informe o nome do salão."),
  slug: z
    .string()
    .min(2, "Informe a URL do agendamento.")
    .regex(/^[a-z0-9-]+$/, "Use apenas letras minúsculas, números e hífen na URL."),
  whatsapp: z.string().min(10, "Informe o WhatsApp da loja."),
  ownerName: z.string().min(2, "Informe o nome do responsável."),
  ownerEmail: z.string().email("Informe um e-mail válido."),
  ownerPassword: publicSignupPasswordSchema,
  billingCustomer: publicBillingCustomerSchema,
});

function digits(value: string | null | undefined) {
  return String(value ?? "").replace(/\D/g, "");
}

function normalizeSlug(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function validateCpfCnpj(value: string) {
  const clean = digits(value);
  if (![11, 14].includes(clean.length)) {
    throw new Error("Informe um CPF ou CNPJ válido.");
  }
  return clean;
}

function validatePhone(value: string) {
  const clean = digits(value);
  if (clean.length < 10) throw new Error("Informe um WhatsApp válido.");
  return clean;
}

function validatePostalCode(value: string) {
  const clean = digits(value);
  if (clean.length !== 8) throw new Error("Informe um CEP válido com 8 dígitos.");
  return clean;
}

function customerReference(tenantId: string) {
  return `linkupstudio:b2b:v1:tenant:${tenantId}`;
}

function tenantAuthError(error: { code?: string; message?: string }) {
  if (error.message?.toLowerCase().includes("already")) {
    return new Error("Este e-mail já possui cadastro. Use Entrar ou escolha outro e-mail.");
  }
  return new Error(error.message || "Não foi possível criar o acesso.");
}

/**
 * Mantido apenas por compatibilidade com versões antigas do cliente.
 *
 * O provisionamento público foi encerrado depois que o login de lojas e da
 * administração matriz foi unificado. Permitir e-mail e senha enviados pelo
 * navegador aqui daria ao chamador acesso para criar ou promover super-admins.
 */
export const bootstrapSuperAdmin = createServerFn({ method: "POST" }).handler(async () => {
  throw new Error(disabledProvisioningMessage);
});

/**
 * O cadastro público de proprietário também permanece bloqueado. Novas lojas e
 * seus usuários devem ser criados somente pelo fluxo autenticado do console SaaS.
 */
export const signUpOwner = createServerFn({ method: "POST" }).handler(async () => {
  throw new Error(disabledProvisioningMessage);
});

export const signUpTenant = createServerFn({ method: "POST" })
  .inputValidator((input) => publicTenantSignupSchema.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const slug = normalizeSlug(data.slug || data.name);
    if (!slug) throw new Error("Informe uma URL de agendamento válida.");

    const cpfCnpj = validateCpfCnpj(data.billingCustomer.cpfCnpj);
    const phone = validatePhone(data.billingCustomer.phone || data.whatsapp);
    const postalCode = validatePostalCode(data.billingCustomer.postalCode);
    const whatsapp = validatePhone(data.whatsapp);
    const ownerEmail = data.ownerEmail.toLowerCase().trim();

    const { data: existingTenant, error: existingTenantError } = await supabaseAdmin
      .from("tenants")
      .select("id")
      .eq("slug", slug)
      .maybeSingle();
    if (existingTenantError) throw existingTenantError;
    if (existingTenant) throw new Error("Essa URL de agendamento já está em uso.");

    const created = await supabaseAdmin.auth.admin.createUser({
      email: ownerEmail,
      password: data.ownerPassword,
      email_confirm: true,
      user_metadata: { full_name: data.ownerName.trim() },
    });
    if (created.error) throw tenantAuthError(created.error);
    const user = created.data.user;
    if (!user) throw new Error("Não foi possível criar o usuário proprietário.");

    let tenantId: string | null = null;
    try {
      const expires = new Date();
      expires.setDate(expires.getDate() + 7);

      const { data: tenant, error: tenantError } = await supabaseAdmin
        .from("tenants")
        .insert({
          name: data.name.trim(),
          slug,
          whatsapp,
          plan: "monthly",
          plan_expires_at: expires.toISOString(),
          status: "active",
        })
        .select("id")
        .single();
      if (tenantError) throw tenantError;
      tenantId = tenant.id;

      const { error: settingsError } = await supabaseAdmin
        .from("tenant_settings")
        .insert({ tenant_id: tenantId });
      if (settingsError) throw settingsError;

      const { error: roleError } = await supabaseAdmin
        .from("user_roles")
        .insert({ user_id: user.id, tenant_id: tenantId, role: "owner" });
      if (roleError) throw roleError;

      const { error: profileError } = await supabaseAdmin
        .from("profiles")
        .upsert(
          {
            id: user.id,
            full_name: data.ownerName.trim(),
            active_tenant_id: tenantId,
          },
          { onConflict: "id" },
        );
      if (profileError) throw profileError;

      const commonCustomer = {
        provider: "asaas",
        external_reference: customerReference(tenantId),
        legal_name: data.billingCustomer.legalName.trim(),
        cpf_cnpj: cpfCnpj,
        email: data.billingCustomer.email.toLowerCase().trim(),
        phone,
        address: data.billingCustomer.address.trim(),
        address_number: data.billingCustomer.addressNumber.trim(),
        complement: data.billingCustomer.complement?.trim() || null,
        province: data.billingCustomer.province.trim(),
        postal_code: postalCode,
        city: data.billingCustomer.city.trim(),
        state: data.billingCustomer.state.trim().toUpperCase(),
        preferred_billing_type: data.billingCustomer.preferredBillingType,
        notification_disabled: data.billingCustomer.notificationDisabled,
        sync_status: "pending",
        last_error: null,
      };

      const { error: customerError } = await supabaseAdmin
        .from("tenant_billing_provider_customers")
        .upsert(
        [
          {
            ...commonCustomer,
            tenant_id: tenantId,
            environment: "sandbox",
            created_by: user.id,
            updated_by: user.id,
          },
          {
            ...commonCustomer,
            tenant_id: tenantId,
            environment: "production",
            created_by: user.id,
            updated_by: user.id,
          },
        ],
        { onConflict: "tenant_id,provider,environment" },
        );
      if (customerError) throw customerError;

      return { ok: true, userId: user.id, tenantId };
    } catch (error) {
      if (tenantId) {
        await supabaseAdmin
          .from("tenant_billing_provider_customers")
          .delete()
          .eq("tenant_id", tenantId);
        await supabaseAdmin.from("tenant_settings").delete().eq("tenant_id", tenantId);
        await supabaseAdmin.from("user_roles").delete().eq("tenant_id", tenantId);
        await supabaseAdmin.from("tenants").delete().eq("id", tenantId);
      }
      await supabaseAdmin.auth.admin.deleteUser(user.id);
      throw error;
    }
  });

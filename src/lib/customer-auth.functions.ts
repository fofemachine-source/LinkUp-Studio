/* eslint-disable @typescript-eslint/no-explicit-any */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import {
  cleanCustomerCpf,
  cleanCustomerWhatsapp,
  customerPasswordError,
  isValidCustomerCpf,
  isValidCustomerWhatsapp,
} from "@/lib/customer-auth";

const tenantInput = z.object({ tenantId: z.string().uuid() });

const cpfInput = z
  .string()
  .transform(cleanCustomerCpf)
  .refine(isValidCustomerCpf, "Informe um CPF válido.");

const whatsappInput = z
  .string()
  .transform(cleanCustomerWhatsapp)
  .refine(isValidCustomerWhatsapp, "Informe um WhatsApp com DDD.");

const passwordInput = z.string().superRefine((password, context) => {
  const error = customerPasswordError(password);
  if (error) context.addIssue({ code: z.ZodIssueCode.custom, message: error });
});

export const getBookingCustomer = createServerFn({ method: "GET" })
  .validator((input: { tenantId: string }) => tenantInput.parse(input))
  .handler(async ({ data }) => {
    const { loadCustomerSession, publicCustomer } = await import("@/lib/customer-auth.server");
    const customer = await loadCustomerSession(data.tenantId);
    return customer ? publicCustomer(customer) : null;
  });

export const registerBookingCustomer = createServerFn({ method: "POST" })
  .validator((input) =>
    tenantInput
      .extend({
        fullName: z.string().trim().min(2, "Informe seu nome.").max(120),
        cpf: cpfInput,
        whatsapp: whatsappInput,
        password: passwordInput,
        activationCode: z.string().trim().max(32).optional().default(""),
        whatsappConsent: z
          .boolean()
          .refine(
            (value) => value,
            "Autorize as confirmações e os lembretes pelo WhatsApp.",
          ),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const {
      customerCpfHash,
      enforceCustomerRateLimit,
      hashCustomerPassword,
      publicCustomer,
      startCustomerSession,
    } = await import("@/lib/customer-auth.server");
    const db = supabaseAdmin as any;

    await enforceCustomerRateLimit(data.tenantId, "register");
    const cpfHash = customerCpfHash(data.cpf);
    const passwordHash = await hashCustomerPassword(data.password);
    const { data: registration, error: registrationError } = await db
      .rpc("register_booking_customer", {
        p_tenant_id: data.tenantId,
        p_full_name: data.fullName,
        p_cpf: data.cpf,
        p_whatsapp: data.whatsapp,
        p_cpf_hash: cpfHash,
        p_password_hash: passwordHash,
        p_whatsapp_consent: data.whatsappConsent,
        p_activation_code: data.activationCode || null,
      })
      .single();

    if (registrationError || !registration) {
      const reason = String(registrationError?.message || "");
      if (reason.includes("BOOKING_LINK_UNAVAILABLE")) {
        throw new Error("Este link de agendamento não está disponível.");
      }
      if (reason.includes("CUSTOMER_ACCOUNT_EXISTS")) {
        throw new Error(
          "Não foi possível concluir o primeiro acesso. Tente Entrar ou fale com o salão.",
        );
      }
      if (reason.includes("EXISTING_CUSTOMER_REQUIRES_ACTIVATION")) {
        throw new Error(
          "Não foi possível concluir o primeiro acesso. Tente Entrar ou fale com o salão.",
        );
      }
      if (reason.includes("INVALID_CUSTOMER_ACTIVATION")) {
        throw new Error(
          "Não foi possível concluir o primeiro acesso. Tente Entrar ou fale com o salão.",
        );
      }
      if (registrationError?.code === "PGRST202") {
        throw new Error("O cadastro ainda não foi habilitado no banco de dados.");
      }
      throw new Error("Não foi possível criar seu cadastro agora. Tente novamente.");
    }

    await startCustomerSession(registration.account_id, data.tenantId);
    return publicCustomer({
      accountId: registration.account_id,
      clientId: registration.client_id,
      tenantId: data.tenantId,
      fullName: registration.full_name,
      whatsapp: registration.whatsapp,
      cpf: registration.cpf,
      cpfLast4: registration.cpf.slice(-4),
    });
  });

export const loginBookingCustomer = createServerFn({ method: "POST" })
  .validator((input) => tenantInput.extend({ cpf: cpfInput, password: passwordInput }).parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const {
      customerCpfHash,
      enforceCustomerRateLimit,
      publicCustomer,
      startCustomerSession,
      verifyCustomerPassword,
    } = await import("@/lib/customer-auth.server");
    const db = supabaseAdmin as any;

    await enforceCustomerRateLimit(data.tenantId, "login");
    const cpfHash = customerCpfHash(data.cpf);
    const { data: account } = await db
      .from("customer_booking_accounts")
      .select("id,client_id,password_hash,failed_login_attempts,locked_until")
      .eq("tenant_id", data.tenantId)
      .eq("cpf_hash", cpfHash)
      .maybeSingle();

    const passwordMatches = await verifyCustomerPassword(data.password, account?.password_hash);
    const lockedUntil = account?.locked_until ? Date.parse(account.locked_until) : 0;
    if (account && lockedUntil > Date.now()) {
      throw new Error("Muitas tentativas de acesso. Aguarde alguns minutos e tente novamente.");
    }

    if (!account || !passwordMatches) {
      if (account) {
        const failure = await db.rpc("record_booking_customer_login_failure", {
          p_tenant_id: data.tenantId,
          p_cpf_hash: cpfHash,
        });
        if (failure.error) {
          throw new Error("Não foi possível validar seu acesso agora. Tente novamente.");
        }
      }
      throw new Error("CPF ou senha inválidos.");
    }

    const success = await db.rpc("record_booking_customer_login_success", {
      p_account_id: account.id,
      p_tenant_id: data.tenantId,
    });
    if (success.error || success.data !== true) {
      throw new Error("Não foi possível concluir seu acesso agora. Tente novamente.");
    }
    await startCustomerSession(account.id, data.tenantId);

    const { data: client } = await db
      .from("clients")
      .select("id,full_name,whatsapp,cpf")
      .eq("id", account.client_id)
      .eq("tenant_id", data.tenantId)
      .maybeSingle();
    if (!client?.cpf || !client.whatsapp) {
      throw new Error("Não foi possível abrir seu cadastro.");
    }
    return publicCustomer({
      accountId: account.id,
      clientId: client.id,
      tenantId: data.tenantId,
      fullName: client.full_name,
      whatsapp: client.whatsapp,
      cpf: client.cpf,
      cpfLast4: client.cpf.slice(-4),
    });
  });

export const logoutBookingCustomer = createServerFn({ method: "POST" })
  .validator((input: { tenantId: string }) => tenantInput.parse(input))
  .handler(async ({ data }) => {
    const { endCustomerSession } = await import("@/lib/customer-auth.server");
    await endCustomerSession(data.tenantId);
    return { ok: true };
  });

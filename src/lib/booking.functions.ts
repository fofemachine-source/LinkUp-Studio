import { createServerFn } from "@tanstack/react-start";
import { syncAppointmentComanda } from "@/lib/commandas";
import { z } from "zod";

async function pub() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

function isMissingPostgrestColumn(error: any, column: string) {
  const message = String(error?.message ?? "");
  return (
    error?.code === "42703" ||
    error?.code === "PGRST204" ||
    (message.includes(column) && /does not exist|schema cache|could not find/i.test(message))
  );
}

async function loadPublicTenantSettings(supabase: any, tenantId: string) {
  const settingsWithClosedDates = await supabase
    .from("tenant_settings")
    .select("work_days,open_hour,close_hour,lunch_start,lunch_end,vip_days,closed_dates")
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (!settingsWithClosedDates.error) return settingsWithClosedDates;
  if (!isMissingPostgrestColumn(settingsWithClosedDates.error, "closed_dates")) {
    throw new Error(settingsWithClosedDates.error.message);
  }

  const legacySettings = await supabase
    .from("tenant_settings")
    .select("work_days,open_hour,close_hour,lunch_start,lunch_end,vip_days")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (legacySettings.error) throw new Error(legacySettings.error.message);

  return {
    ...legacySettings,
    data: legacySettings.data
      ? { ...legacySettings.data, closed_dates: [] as string[] }
      : legacySettings.data,
  };
}

const subscriptionProofTypes = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
] as const;
const subscriptionProofBucket = "subscription-payment-proofs";

function cleanCpf(value: string) {
  return value.replace(/\D/g, "");
}

function cleanBrazilianPhone(value: string) {
  const digits = value.replace(/\D/g, "");
  return [12, 13].includes(digits.length) && digits.startsWith("55") ? digits.slice(2) : digits;
}

function hasValidProofSignature(
  bytes: Uint8Array,
  contentType: (typeof subscriptionProofTypes)[number],
) {
  if (contentType === "image/jpeg") {
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (contentType === "image/png") {
    const pngSignature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    return (
      bytes.length >= pngSignature.length &&
      pngSignature.every((value, index) => bytes[index] === value)
    );
  }
  if (contentType === "image/webp") {
    return (
      bytes.length >= 12 &&
      String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
      String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
    );
  }
  return bytes.length >= 5 && String.fromCharCode(...bytes.slice(0, 5)) === "%PDF-";
}

function saoPauloToday() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

async function findOpenSubscriptionCharge(db: any, contract: any) {
  const { data: charges, error } = await db
    .from("subscription_charges")
    .select("*")
    .eq("tenant_id", contract.tenant_id)
    .eq("subscription_id", contract.id)
    .in("status", ["pending", "overdue"])
    .order("due_date", { ascending: true })
    .limit(1);

  if (error) throw new Error("Não foi possível localizar a cobrança da assinatura.");
  return charges?.[0] ?? null;
}

// Public: get barbershop info by slug for the booking page.
export const getPublicTenant = createServerFn({ method: "GET" })
  .inputValidator((d: { slug: string; freshAt?: number }) =>
    z.object({ slug: z.string(), freshAt: z.number().optional() }).parse(d),
  )
  .handler(async ({ data }) => {
    const supabase = await pub();
    const db = supabase as any;
    const { data: t, error: tenantError } = await supabase.from("tenants").select("id,name,subtitle,logo_url,banner_url,slug,primary_color,slot_minutes,whatsapp,city").eq("slug", data.slug).eq("status", "active").maybeSingle();
    if (tenantError) throw new Error(tenantError.message);
    if (!t) return null;
    const [professionalsResult, servicesResult, settingsResult, brandingResult] = await Promise.all([
      supabase.from("professionals").select("id,full_name,photo_url,role_label,work_days,blocked_dates").eq("tenant_id", t.id).eq("active", true).order("full_name"),
      supabase.from("services").select("id,name,price,duration_min,vip_only").eq("tenant_id", t.id).eq("active", true).order("name"),
      loadPublicTenantSettings(supabase, t.id),
      db
        .from("tenant_booking_branding")
        .select(
          "background_mobile_path,background_tablet_path,background_desktop_path,hero_slogan,mobile_position_mode,mobile_position_x,mobile_position_y,mobile_zoom,desktop_position_mode,desktop_position_x,desktop_position_y,desktop_zoom,overlay_opacity,show_logo,show_name,show_subtitle,show_slogan,show_subscriber_badge,show_subscription_summary,show_primary_button",
        )
        .eq("tenant_id", t.id)
        .maybeSingle(),
    ]);
    if (professionalsResult.error) throw new Error(professionalsResult.error.message);
    if (servicesResult.error) throw new Error(servicesResult.error.message);
    if (brandingResult.error) throw new Error(brandingResult.error.message);

    return {
      tenant: t,
      professionals: professionalsResult.data ?? [],
      services: servicesResult.data ?? [],
      settings: settingsResult.data,
      branding: brandingResult.data,
    };
  });

// Public: identify a subscriber using CPF and return only booking/renewal data.
export const validateVip = createServerFn({ method: "POST" })
  .inputValidator((d: { tenantId: string; cpf: string }) =>
    z
      .object({
        tenantId: z.string().uuid(),
        cpf: z.string(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const supabase = await pub();
    const db = supabase as any;
    const cpf = cleanCpf(data.cpf);
    if (cpf.length !== 11) return null;

    const { data: contracts, error } = await db
      .from("client_subscriptions")
      .select("*")
      .eq("tenant_id", data.tenantId)
      .eq("cpf", cpf)
      .order("created_at", { ascending: false })
      .limit(10);

    if (error || !contracts || contracts.length === 0) return null;
    const matchingContracts = contracts;
    const today = saoPauloToday();
    const contract =
      matchingContracts.find(
        (item: any) =>
          item.status === "active" && (!item.ends_at || item.ends_at >= today),
      ) ??
      matchingContracts.find((item: any) => item.status === "overdue") ??
      matchingContracts.find((item: any) => item.status === "active") ??
      matchingContracts[0] ??
      null;

    if (contract) {
      const [{ data: plan }, { data: benefits }] = await Promise.all([
        db
          .from("subscription_plans")
          .select("*")
          .eq("id", contract.plan_id)
          .eq("tenant_id", data.tenantId)
          .maybeSingle(),
        db
          .from("subscription_plan_benefits")
          .select("*")
          .eq("plan_id", contract.plan_id)
          .eq("tenant_id", data.tenantId)
          .eq("active", true),
      ]);
      if (!plan) return null;

      let contractStatus = contract.status;
      let renewal =
        ["active", "overdue", "expired"].includes(contractStatus) &&
        plan.billing_cycle !== "one_time"
          ? await findOpenSubscriptionCharge(db, contract)
          : null;

      if (
        contractStatus === "active" &&
        contract.ends_at &&
        contract.ends_at < today
      ) {
        const nextStatus = renewal ? "overdue" : "expired";
        await db
          .from("client_subscriptions")
          .update({ status: nextStatus })
          .eq("id", contract.id)
          .eq("tenant_id", data.tenantId)
          .eq("status", "active");
        contractStatus = nextStatus;
      } else if (contractStatus === "expired" && renewal) {
        await db
          .from("client_subscriptions")
          .update({ status: "overdue" })
          .eq("id", contract.id)
          .eq("tenant_id", data.tenantId)
          .eq("status", "expired");
        contractStatus = "overdue";
      }

      if (
        renewal &&
        ["none", "rejected"].includes(renewal.proof_status ?? "none") &&
        renewal?.payment_token_expires_at &&
        new Date(renewal.payment_token_expires_at).getTime() <= Date.now()
      ) {
        const paymentToken = crypto.randomUUID();
        const paymentTokenExpiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
        const { data: refreshed } = await db
          .from("subscription_charges")
          .update({
            payment_token: paymentToken,
            payment_token_expires_at: paymentTokenExpiresAt,
          })
          .eq("id", renewal.id)
          .eq("payment_token", renewal.payment_token)
          .lte("payment_token_expires_at", new Date().toISOString())
          .in("status", ["pending", "overdue"])
          .in("proof_status", ["none", "rejected"])
          .select("*")
          .maybeSingle();
        if (refreshed) {
          renewal = refreshed;
        } else {
          const { data: currentRenewal } = await db
            .from("subscription_charges")
            .select("*")
            .eq("id", renewal.id)
            .in("status", ["pending", "overdue"])
            .maybeSingle();
          renewal = currentRenewal ?? null;
        }
      }

      const isPastDue = renewal?.due_date && renewal.due_date < today;
      if (isPastDue) {
        await Promise.all([
          db
            .from("client_subscriptions")
            .update({ status: "overdue" })
            .eq("id", contract.id)
            .in("status", ["active", "expired"]),
          renewal.status === "pending"
            ? db
                .from("subscription_charges")
                .update({ status: "overdue" })
                .eq("id", renewal.id)
                .eq("status", "pending")
            : Promise.resolve(),
        ]);
        renewal = { ...renewal, status: "overdue" };
        contractStatus = "overdue";
      }

      let payment: { pix_key: string; pix_holder: string | null; city: string | null } | null =
        null;
      if (renewal && plan.pix_enabled) {
        const { data: tenantPayment } = await db
          .from("tenants")
          .select("pix_key,pix_holder,city")
          .eq("id", data.tenantId)
          .eq("status", "active")
          .maybeSingle();
        if (tenantPayment?.pix_key?.trim()) {
          payment = {
            pix_key: tenantPayment.pix_key,
            pix_holder: tenantPayment.pix_holder,
            city: tenantPayment.city,
          };
        }
      }

      const serviceIds = (benefits ?? [])
        .filter((benefit: any) => benefit.benefit_type === "service" && benefit.service_id)
        .map((benefit: any) => benefit.service_id);
      return {
        id: contract.id,
        subscription_id: contract.id,
        full_name: contract.subscriber_name,
        status: contractStatus,
        price: contract.price,
        whatsapp: contract.whatsapp,
        next_due_at: contract.next_due_at,
        ends_at: contract.ends_at,
        sessions_remaining: contract.sessions_remaining,
        benefits: benefits ?? [],
        allow_extras: plan.allow_extras,
        included_services_only: plan.included_services_only,
        discount_value: plan.discount_allowed ? plan.discount_value : 0,
        payment,
        renewal: renewal
          ? {
              charge_id: renewal.id,
              amount: renewal.amount,
              due_date: renewal.due_date,
              status: renewal.status,
              proof_status: renewal.proof_status ?? "none",
              proof_submitted_at: renewal.proof_submitted_at,
              proof_file_name: renewal.proof_file_name,
              proof_rejection_reason: renewal.proof_rejection_reason,
              payment_token:
                payment &&
                ["none", "rejected"].includes(renewal.proof_status ?? "none")
                ? renewal.payment_token
                : null,
            }
          : null,
        plan: JSON.stringify({
          name: plan.name,
          services: serviceIds,
          professional_id: "",
          benefits: benefits ?? [],
        }),
      };
    }

    return null;
  });

// Public: authorize a short-lived upload for a verified renewal charge.
export const prepareSubscriptionProofUpload = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z
      .object({
        paymentToken: z.string().uuid(),
        fileName: z.string().min(1).max(255),
        contentType: z.enum(subscriptionProofTypes),
        sizeBytes: z.number().int().min(1).max(5 * 1024 * 1024),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const supabase = await pub();
    const db = supabase as any;
    const { data: charge, error } = await db
      .from("subscription_charges")
      .select("*")
      .eq("payment_token", data.paymentToken)
      .in("status", ["pending", "overdue"])
      .maybeSingle();

    if (error || !charge) throw new Error("Cobrança de renovação inválida ou já concluída.");
    const tokenExpiresAt = new Date(charge.payment_token_expires_at).getTime();
    if (!Number.isFinite(tokenExpiresAt) || tokenExpiresAt <= Date.now()) {
      throw new Error("Este acesso de renovação expirou. Valide seus dados novamente.");
    }
    if (!["none", "rejected"].includes(charge.proof_status ?? "none")) {
      throw new Error("Seu comprovante já foi enviado e está aguardando confirmação.");
    }

    const { data: contract } = await db
      .from("client_subscriptions")
      .select("id,status,plan_id")
      .eq("id", charge.subscription_id)
      .eq("tenant_id", charge.tenant_id)
      .maybeSingle();
    if (!contract || !["active", "overdue", "expired"].includes(contract.status)) {
      throw new Error("Esta assinatura não está disponível para renovação.");
    }

    const { data: plan } = await db
      .from("subscription_plans")
      .select("billing_cycle,pix_enabled")
      .eq("id", contract.plan_id)
      .eq("tenant_id", charge.tenant_id)
      .maybeSingle();
    if (!plan || plan.billing_cycle === "one_time" || !plan.pix_enabled) {
      throw new Error("O pagamento online não está habilitado para este plano.");
    }

    const path = `${charge.tenant_id}/${charge.id}/${charge.payment_token}`;
    const { data: signed, error: signedError } = await supabase.storage
      .from(subscriptionProofBucket)
      .createSignedUploadUrl(path);
    if (signedError || !signed?.token) {
      throw new Error("Não foi possível preparar o envio do comprovante.");
    }

    return {
      chargeId: charge.id,
      path,
      token: signed.token,
    };
  });

// Public: record the uploaded proof and place it in the salon review queue.
export const submitSubscriptionProof = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z
      .object({
        paymentToken: z.string().uuid(),
        chargeId: z.string().uuid(),
        storagePath: z.string().min(1).max(1000),
        fileName: z.string().min(1).max(255),
        contentType: z.enum(subscriptionProofTypes),
        sizeBytes: z.number().int().min(1).max(5 * 1024 * 1024),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const supabase = await pub();
    const db = supabase as any;
    const { data: charge, error } = await db
      .from("subscription_charges")
      .select("*")
      .eq("id", data.chargeId)
      .maybeSingle();

    if (error || !charge) throw new Error("Cobrança de renovação inválida.");

    const expectedPrefix = `${charge.tenant_id}/${charge.id}/`;
    if (!data.storagePath.startsWith(expectedPrefix) || data.storagePath.includes("..")) {
      throw new Error("Caminho do comprovante inválido.");
    }

    if (charge.payment_token !== data.paymentToken) {
      if (
        charge.proof_storage_path === data.storagePath &&
        ["pending_review", "approved"].includes(charge.proof_status)
      ) {
        return {
          submitted: true,
          proofStatus: charge.proof_status,
          submittedAt: charge.proof_submitted_at,
          chargeId: charge.id,
        };
      }
      throw new Error("Este acesso de renovação expirou. Valide seus dados novamente.");
    }
    if (!["pending", "overdue"].includes(charge.status)) {
      throw new Error("Esta cobrança já foi concluída.");
    }

    const tokenExpiresAt = new Date(charge.payment_token_expires_at).getTime();
    if (!Number.isFinite(tokenExpiresAt) || tokenExpiresAt <= Date.now()) {
      throw new Error("Este acesso de renovação expirou. Valide seus dados novamente.");
    }
    if (!["none", "rejected"].includes(charge.proof_status ?? "none")) {
      throw new Error("Este comprovante já foi enviado ou revisado.");
    }

    const { data: contract } = await db
      .from("client_subscriptions")
      .select("id,status,plan_id")
      .eq("id", charge.subscription_id)
      .eq("tenant_id", charge.tenant_id)
      .maybeSingle();
    if (!contract || !["active", "overdue", "expired"].includes(contract.status)) {
      throw new Error("Esta assinatura não está disponível para renovação.");
    }

    const { data: plan } = await db
      .from("subscription_plans")
      .select("billing_cycle,pix_enabled")
      .eq("id", contract.plan_id)
      .eq("tenant_id", charge.tenant_id)
      .maybeSingle();
    if (!plan || plan.billing_cycle === "one_time" || !plan.pix_enabled) {
      throw new Error("O pagamento online não está habilitado para este plano.");
    }

    const slash = data.storagePath.lastIndexOf("/");
    const folder = data.storagePath.slice(0, slash);
    const objectName = data.storagePath.slice(slash + 1);
    const { data: objects, error: listError } = await supabase.storage
      .from(subscriptionProofBucket)
      .list(folder, { limit: 10, search: objectName });
    const uploadedObject = (objects ?? []).find((item) => item.name === objectName);
    if (listError || !uploadedObject) {
      throw new Error("O arquivo ainda não chegou ao servidor. Tente enviar novamente.");
    }
    const storedSizeBytes = Number((uploadedObject as any).metadata?.size ?? 0);
    if (storedSizeBytes > 5 * 1024 * 1024) {
      await supabase.storage.from(subscriptionProofBucket).remove([data.storagePath]);
      throw new Error("O comprovante deve ter no máximo 5 MB.");
    }

    const { data: proofBlob, error: downloadError } = await supabase.storage
      .from(subscriptionProofBucket)
      .download(data.storagePath);
    if (downloadError || !proofBlob) {
      throw new Error("Não foi possível validar o arquivo enviado.");
    }

    const proofBytes = new Uint8Array(await proofBlob.arrayBuffer());
    const actualSizeBytes = proofBytes.byteLength;
    if (
      actualSizeBytes < 1 ||
      actualSizeBytes > 5 * 1024 * 1024 ||
      !hasValidProofSignature(proofBytes, data.contentType)
    ) {
      await supabase.storage.from(subscriptionProofBucket).remove([data.storagePath]);
      throw new Error("O arquivo enviado não é um comprovante válido ou excede 5 MB.");
    }

    const submittedAt = new Date().toISOString();
    const { data: updatedCharge, error: updateError } = await db
      .from("subscription_charges")
      .update({
        proof_storage_path: data.storagePath,
        proof_file_name: data.fileName,
        proof_content_type: data.contentType,
        proof_size_bytes: actualSizeBytes,
        proof_submitted_at: submittedAt,
        proof_status: "pending_review",
        proof_reviewed_at: null,
        proof_reviewed_by: null,
        proof_rejection_reason: null,
        payment_token: crypto.randomUUID(),
        payment_token_expires_at: submittedAt,
      })
      .eq("id", charge.id)
      .eq("payment_token", data.paymentToken)
      .in("status", ["pending", "overdue"])
      .in("proof_status", ["none", "rejected"])
      .select("id")
      .maybeSingle();
    if (updateError || !updatedCharge) {
      const { data: latestCharge } = await db
        .from("subscription_charges")
        .select("proof_storage_path,proof_status,proof_submitted_at")
        .eq("id", charge.id)
        .maybeSingle();
      if (
        latestCharge?.proof_storage_path === data.storagePath
      ) {
        if (latestCharge?.proof_status !== "pending_review") {
          throw new Error("Este comprovante já foi revisado pela equipe do salão.");
        }
        return {
          submitted: true,
          proofStatus: "pending_review",
          submittedAt: latestCharge.proof_submitted_at ?? submittedAt,
          chargeId: charge.id,
        };
      }
      await supabase.storage.from(subscriptionProofBucket).remove([data.storagePath]);
      throw new Error("Este comprovante já foi enviado em outra tentativa.");
    }

    if (charge.proof_storage_path && charge.proof_storage_path !== data.storagePath) {
      await supabase.storage.from(subscriptionProofBucket).remove([charge.proof_storage_path]);
    }

    if (charge.due_date < saoPauloToday()) {
      await db
        .from("client_subscriptions")
        .update({ status: "overdue" })
        .eq("id", charge.subscription_id)
        .eq("status", "active");
    }

    return {
      submitted: true,
      proofStatus: "pending_review",
      submittedAt,
      chargeId: charge.id,
    };
  });

// Public: get taken time-slots for a pro on a date.
export const getBookedSlots = createServerFn({ method: "POST" })
  .inputValidator((d: { tenantId: string; professionalId: string; date: string }) =>
    z
      .object({
        tenantId: z.string().uuid(),
        professionalId: z.string().uuid(),
        date: z.string(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const supabase = await pub();
    const start = new Date(data.date + "T00:00:00").toISOString();
    const end = new Date(data.date + "T23:59:59").toISOString();
    const { data: appts, error } = await supabase
      .from("appointments")
      .select("start_at,end_at")
      .eq("tenant_id", data.tenantId)
      .eq("professional_id", data.professionalId)
      .gte("start_at", start)
      .lte("start_at", end)
      .neq("status", "cancelled");
    if (error) throw new Error(error.message);
    return appts ?? [];
  });

// Public: create appointment. Enforces slot conflict and VIP-day rule.
export const createBooking = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({
    tenantId: z.string().uuid(),
    professionalId: z.string().uuid(),
    serviceId: z.string().uuid(),
    clientName: z.string().min(2),
    clientWhatsapp: z.string().min(8),
    startAt: z.string(),
    isVip: z.boolean().default(false),
    vipCpf: z.string().optional(),
  }).parse(d))
  .handler(async ({ data }) => {
    const supabase = await pub();
    const db = supabase as any;
    const cancellationToken = crypto.randomUUID();

    const [{ data: t }, { data: settings }, { data: svc }, { data: pro }] = await Promise.all([
      supabase.from("tenants").select("id,name,whatsapp,slot_minutes").eq("id", data.tenantId).maybeSingle(),
      supabase.from("tenant_settings").select("vip_days,work_days,open_hour,close_hour,lunch_start,lunch_end,vip_mode").eq("tenant_id", data.tenantId).maybeSingle(),
      supabase
        .from("services")
        .select("id,name,duration_min,price,vip_only")
        .eq("id", data.serviceId)
        .eq("tenant_id", data.tenantId)
        .maybeSingle(),
      supabase
        .from("professionals")
        .select("id,commission_pct")
        .eq("id", data.professionalId)
        .eq("tenant_id", data.tenantId)
        .eq("active", true)
        .maybeSingle(),
    ]);
    if (!t || !svc || !pro) throw new Error("Barbearia, serviço ou profissional inválido");

    let activeSubscription: any = null;
    let coveredBySubscription = false;
    if (data.isVip) {
      const cpf = data.vipCpf?.replace(/\D/g, "") ?? "";
      if (cpf.length !== 11) throw new Error("Informe um CPF válido para usar a assinatura.");
      const { data: contracts } = await db
        .from("client_subscriptions")
        .select("*")
        .eq("tenant_id", data.tenantId)
        .eq("cpf", cpf)
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(10);
      const cleanWhatsapp = cleanBrazilianPhone(data.clientWhatsapp);
      activeSubscription =
        (contracts ?? []).find(
          (item: any) =>
            cleanBrazilianPhone(String(item.whatsapp ?? "")) === cleanWhatsapp,
        ) ?? null;
      if (!activeSubscription) throw new Error("Assinatura ativa não encontrada.");
      const { data: overdueCharges } = await db
        .from("subscription_charges")
        .select("id,due_date")
        .eq("tenant_id", data.tenantId)
        .eq("subscription_id", activeSubscription.id)
        .in("status", ["pending", "overdue"])
        .lt("due_date", saoPauloToday())
        .order("due_date", { ascending: true })
        .limit(1);
      if (overdueCharges?.[0]) {
        await db
          .from("client_subscriptions")
          .update({ status: "overdue" })
          .eq("id", activeSubscription.id)
          .eq("status", "active");
        throw new Error(
          "Sua assinatura possui uma renovação vencida. Envie o comprovante e aguarde a confirmação do salão.",
        );
      }
      if (
        activeSubscription.ends_at &&
        activeSubscription.ends_at < saoPauloToday()
      ) {
        throw new Error("Esta assinatura está fora do período de validade.");
      }

      const [{ data: plan }, { data: benefits }] = await Promise.all([
        db
          .from("subscription_plans")
          .select("*")
          .eq("id", activeSubscription.plan_id)
          .eq("tenant_id", data.tenantId)
          .maybeSingle(),
        db
          .from("subscription_plan_benefits")
          .select("id,service_id,benefit_type,active")
          .eq("plan_id", activeSubscription.plan_id)
          .eq("tenant_id", data.tenantId)
          .eq("active", true),
      ]);
      coveredBySubscription = (benefits ?? []).some(
        (benefit: any) =>
          benefit.benefit_type === "service" && benefit.service_id === data.serviceId,
      );
      if (coveredBySubscription && activeSubscription.sessions_remaining === 0)
        throw new Error("Sua assinatura não possui sessões disponíveis.");
      if (!coveredBySubscription && plan?.included_services_only && !plan?.allow_extras)
        throw new Error("Este serviço não está incluído na sua assinatura.");
    }

    const start = new Date(data.startAt);
    const end = new Date(start.getTime() + (svc.duration_min ?? t.slot_minutes ?? 30) * 60000);

    const dow = ((start.getUTCDay() + 6) % 7) + 1; // 1=Mon..7=Sun
    const vipDays: number[] = (settings?.vip_days as number[] | null) ?? [1,2,3,4];
    const vipMode = (settings as any)?.vip_mode ?? "strict";
    if (vipMode === "strict" && vipDays.includes(dow) && !data.isVip) {
      throw new Error("Este dia é reservado para assinantes VIP. Escolha outro dia ou torne-se assinante.");
    }




    // Conflict check
    const { data: conflicts } = await supabase
      .from("appointments")
      .select("id,start_at,end_at")
      .eq("tenant_id", data.tenantId)
      .eq("professional_id", data.professionalId)
      .lt("start_at", end.toISOString())
      .gt("end_at", start.toISOString())
      .neq("status", "cancelled");
    if (conflicts && conflicts.length > 0) throw new Error("Este horário já está ocupado. Escolha outro.");

    // Upsert client
    const cleanWhatsapp = data.clientWhatsapp.replace(/\D/g, "");
    let { data: existingClient } = await supabase.from("clients").select("id").eq("tenant_id", data.tenantId).eq("whatsapp", cleanWhatsapp).maybeSingle();
    let clientId = activeSubscription?.client_id ?? existingClient?.id;
    if (!clientId) {
      const { data: newClient, error: errClient } = await supabase.from("clients").insert({
        tenant_id: data.tenantId,
        full_name: data.clientName,
        whatsapp: cleanWhatsapp,
        is_subscriber: data.isVip,
      } as any).select("id").single();
      if (!errClient && newClient) clientId = newClient.id;
    } else if (data.isVip) {
      await supabase.from("clients").update({ is_subscriber: true }).eq("id", clientId);
    }

    const { data: appt, error } = await supabase.from("appointments").insert({
      tenant_id: data.tenantId,
      professional_id: data.professionalId,
      service_id: data.serviceId,
      client_name: data.clientName,
      client_whatsapp: cleanWhatsapp,
      client_id: clientId || null,
      start_at: start.toISOString(),
      end_at: end.toISOString(),
      status: "confirmed",
      is_vip: data.isVip,
      source: "online",
      cancellation_token: cancellationToken,
      notes: data.isVip
        ? coveredBySubscription
          ? `Agendamento Online · Assinatura ${activeSubscription.id}`
          : `Agendamento Online · Serviço extra da assinatura ${activeSubscription.id}`
        : "Agendamento Online"
    }).select("id,cancellation_token").single();
    if (error) throw new Error(error.message);

    try {
      await syncAppointmentComanda(supabase, {
        appointmentId: appt.id,
        tenantId: data.tenantId,
        clientId: clientId || null,
        clientName: data.clientName,
        professionalId: data.professionalId,
        serviceIds: [data.serviceId],
        services: [svc],
        professionals: pro ? [pro] : [],
        scheduledAt: start.toISOString(),
        status: "confirmed",
        source: "online",
      });
    } catch (cmdError: any) {
      await supabase.from("appointments").delete().eq("id", appt.id);
      throw new Error(cmdError?.message ?? "Nao foi possivel abrir a comanda do agendamento.");
    }

    return { id: appt.id, cancellationToken: appt.cancellation_token ?? cancellationToken };
  });

// Public: cancel an online appointment through its secret cancellation link.
export const cancelBooking = createServerFn({ method: "POST" })
  .inputValidator((d: { token: string }) =>
    z.object({ token: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data }) => {
    const supabase = await pub();
    const { data: appointment, error: appointmentError } = await supabase
      .from("appointments")
      .select(
        "id,tenant_id,client_id,client_name,professional_id,service_id,start_at,status,source,cancellation_token",
      )
      .eq("cancellation_token", data.token)
      .eq("source", "online")
      .maybeSingle();

    if (appointmentError) throw new Error("Nao foi possivel localizar o agendamento.");
    if (!appointment) throw new Error("Link de cancelamento invalido ou expirado.");
    if (appointment.status === "cancelled") {
      return { cancelled: true, alreadyCancelled: true };
    }
    if (!new Set(["pending", "confirmed"]).has(appointment.status ?? "")) {
      throw new Error("Este agendamento nao pode mais ser cancelado pelo link. Entre em contato com o salao.");
    }
    if (!appointment.service_id) throw new Error("Servico do agendamento nao encontrado.");

    const [{ data: service }, { data: professional }] = await Promise.all([
      supabase
        .from("services")
        .select("id,name,price,duration_min")
        .eq("id", appointment.service_id)
        .eq("tenant_id", appointment.tenant_id)
        .maybeSingle(),
      supabase
        .from("professionals")
        .select("id,commission_pct")
        .eq("id", appointment.professional_id)
        .eq("tenant_id", appointment.tenant_id)
        .maybeSingle(),
    ]);

    if (!service) throw new Error("Servico do agendamento nao encontrado.");

    const previousStatus = appointment.status ?? "confirmed";
    const cancelledAt = new Date().toISOString();
    const { data: updated, error: updateError } = await supabase
      .from("appointments")
      .update({
        status: "cancelled",
        cancelled_at: cancelledAt,
        cancelled_by: "client_link",
      })
      .eq("id", appointment.id)
      .eq("status", previousStatus)
      .select("id")
      .maybeSingle();

    if (updateError || !updated) {
      throw new Error("O agendamento mudou de status. Atualize a pagina e tente novamente.");
    }

    try {
      await syncAppointmentComanda(supabase, {
        appointmentId: appointment.id,
        tenantId: appointment.tenant_id,
        clientId: appointment.client_id,
        clientName: appointment.client_name || "Cliente",
        professionalId: appointment.professional_id,
        serviceIds: [appointment.service_id],
        services: [service],
        professionals: professional ? [professional] : [],
        scheduledAt: appointment.start_at,
        status: "cancelled",
        source: "online",
      });
    } catch (syncError: any) {
      await supabase
        .from("appointments")
        .update({ status: previousStatus, cancelled_at: null, cancelled_by: null })
        .eq("id", appointment.id)
        .eq("status", "cancelled");
      throw new Error(syncError?.message ?? "Nao foi possivel cancelar a comanda do agendamento.");
    }

    return { cancelled: true, alreadyCancelled: false };
  });

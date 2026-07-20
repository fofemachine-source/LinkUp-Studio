import { createServerFn } from "@tanstack/react-start";
import { syncAppointmentComanda } from "@/lib/commandas";
import { z } from "zod";
import {
  includesBookingWeekday,
  isVipExclusiveBookingDay,
} from "@/lib/booking-weekdays";

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

function saoPauloDate(value: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);
}

function saoPauloToday() {
  return saoPauloDate(new Date());
}

function saoPauloTimeMinutes(value: Date) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(value);
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? 0);
  return hour * 60 + minute;
}

function configuredTimeMinutes(value: unknown, fallbackHour: number) {
  if (typeof value === "number" && Number.isFinite(value)) return value * 60;
  if (typeof value === "string") {
    const [hour, minute = "0"] = value.split(":");
    const parsed = Number(hour) * 60 + Number(minute);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallbackHour * 60;
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

async function countReservedSubscriptionSessions(
  db: any,
  tenantId: string,
  subscriptionId: string,
  coveredServiceIds: string[],
) {
  if (coveredServiceIds.length === 0) return 0;

  const { data: reservations, error } = await db
    .from("appointments")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("subscription_id", subscriptionId)
    .eq("is_vip", true)
    .in("service_id", coveredServiceIds)
    .in("status", ["pending", "confirmed"])
    .gte("start_at", new Date().toISOString());

  if (error) {
    throw new Error("Não foi possível calcular as sessões VIP já reservadas.");
  }
  const reservationIds = (reservations ?? []).map((item: any) => item.id).filter(Boolean);
  if (reservationIds.length === 0) return 0;

  const { data: usages, error: usagesError } = await db
    .from("subscription_usages")
    .select("appointment_id")
    .eq("tenant_id", tenantId)
    .eq("subscription_id", subscriptionId)
    .in("appointment_id", reservationIds);
  if (usagesError) {
    throw new Error("Não foi possível calcular as sessões VIP já reservadas.");
  }
  const consumedAppointmentIds = new Set(
    (usages ?? []).map((usage: any) => usage.appointment_id).filter(Boolean),
  );
  return reservationIds.filter((id: string) => !consumedAppointmentIds.has(id)).length;
}

type SubscriptionBenefitBalance = {
  id: string;
  service_id: string | null;
  benefit_type: string;
  name: string;
  quantity: number | null;
  used_quantity: number;
  reserved_quantity: number;
  available_quantity: number | null;
  cycle_start: string;
  cycle_end: string | null;
};

function dateOnly(value: unknown) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function addDaysToDate(value: string, days: number) {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function addMonthsToDate(value: string, months: number) {
  const date = new Date(`${value}T12:00:00Z`);
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + months);
  const lastDay = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0, 12),
  ).getUTCDate();
  date.setUTCDate(Math.min(day, lastDay));
  return date.toISOString().slice(0, 10);
}

function addSubscriptionCycle(value: string, billingCycle: string) {
  if (billingCycle === "weekly") return addDaysToDate(value, 7);
  if (billingCycle === "biweekly") return addDaysToDate(value, 15);
  if (billingCycle === "yearly") return addMonthsToDate(value, 12);
  if (billingCycle === "monthly") return addMonthsToDate(value, 1);
  return null;
}

function cycleTimestamp(value: string) {
  return new Date(`${value}T00:00:00-03:00`).toISOString();
}

async function resolveSubscriptionCycle(
  db: any,
  tenantId: string,
  contract: any,
  billingCycle: string,
  referenceDate: string,
) {
  const { data: charges, error } = await db
    .from("subscription_charges")
    .select("billing_period_start,billing_period_end,due_date,paid_at,status")
    .eq("tenant_id", tenantId)
    .eq("subscription_id", contract.id)
    .order("due_date", { ascending: false })
    .limit(36);
  if (error) throw new Error("Não foi possível calcular o ciclo atual da assinatura.");

  const paidPeriods = (charges ?? [])
    .filter((charge: any) => charge.status === "paid")
    .map((charge: any) => {
      const start = dateOnly(charge.billing_period_start) ?? dateOnly(charge.due_date);
      const nextStart = start ? addSubscriptionCycle(start, billingCycle) : null;
      return {
        start,
        end:
          dateOnly(charge.billing_period_end) ??
          (nextStart ? addDaysToDate(nextStart, -1) : dateOnly(contract.ends_at)),
      };
    })
    .filter((period: any) => period.start);
  const matchingPeriod = paidPeriods.find(
    (period: any) =>
      period.start <= referenceDate && (!period.end || period.end >= referenceDate),
  );
  if (matchingPeriod) {
    return { start: matchingPeriod.start as string, end: matchingPeriod.end as string | null };
  }

  // Once a paid plan has entered the financial workflow, only an explicitly
  // paid period may expose benefits. This mirrors the database trigger and
  // avoids showing a balance that would be rejected only at confirmation.
  if (Number(contract.price ?? 0) > 0 && (charges ?? []).length > 0) {
    throw new Error(
      "O ciclo desta data ainda não foi pago ou renovado. Escolha uma data dentro do ciclo confirmado.",
    );
  }

  // Compatibility for free plans and active legacy contracts that predate
  // financial charges. This mirrors the SQL resolver; as soon as a paid plan
  // has any charge, only an explicitly paid period is accepted above.
  const configuredCycleStart = dateOnly(contract.benefit_cycle_started_at);
  const contractStart = dateOnly(contract.starts_at);
  let legacyCycleStart =
    configuredCycleStart && configuredCycleStart <= referenceDate
      ? configuredCycleStart
      : contractStart;
  const contractEnd = dateOnly(contract.ends_at);
  if (
    !legacyCycleStart ||
    legacyCycleStart > referenceDate ||
    (contractEnd && referenceDate > contractEnd)
  ) {
    throw new Error("A assinatura não possui um ciclo válido para a data escolhida.");
  }
  if (billingCycle === "one_time") {
    return { start: legacyCycleStart, end: contractEnd };
  }

  for (let index = 0; index < 240; index += 1) {
    const nextStart = addSubscriptionCycle(legacyCycleStart, billingCycle);
    if (!nextStart || referenceDate < nextStart) {
      const inferredEnd = nextStart ? addDaysToDate(nextStart, -1) : null;
      return {
        start: legacyCycleStart,
        end:
          contractEnd && (!inferredEnd || contractEnd < inferredEnd)
            ? contractEnd
            : inferredEnd,
      };
    }
    legacyCycleStart = nextStart;
  }

  throw new Error("Não foi possível identificar o ciclo da assinatura.");
}

async function loadSubscriptionBenefitBalances(
  db: any,
  tenantId: string,
  contract: any,
  plan: any,
  benefits: any[],
  referenceDate: string,
) {
  const serviceBenefits = benefits.filter(
    (benefit: any) => benefit.benefit_type === "service" && benefit.service_id,
  );
  const cycle = await resolveSubscriptionCycle(
    db,
    tenantId,
    contract,
    String(plan.billing_cycle ?? "monthly"),
    referenceDate,
  );
  if (serviceBenefits.length === 0) return [] as SubscriptionBenefitBalance[];

  const cycleStart = cycleTimestamp(cycle.start);
  const cycleEndExclusive = cycleTimestamp(
    cycle.end ? addDaysToDate(cycle.end, 1) : addDaysToDate(referenceDate, 3660),
  );
  const [{ data: usages, error: usagesError }, { data: reservations, error: reservationsError }] =
    await Promise.all([
      db
        .from("subscription_usages")
        .select("benefit_id,service_id,appointment_id,quantity,used_at")
        .eq("tenant_id", tenantId)
        .eq("subscription_id", contract.id)
        .gte("used_at", cycleStart)
        .lt("used_at", cycleEndExclusive),
      db
        .from("appointments")
        .select("id,service_id,start_at")
        .eq("tenant_id", tenantId)
        .eq("subscription_id", contract.id)
        .eq("is_vip", true)
        .in("status", ["pending", "confirmed"])
        .gte("start_at", cycleStart)
        .lt("start_at", cycleEndExclusive),
    ]);
  if (usagesError || reservationsError) {
    throw new Error("Não foi possível calcular o saldo dos benefícios da assinatura.");
  }

  const benefitById = new Map(serviceBenefits.map((benefit: any) => [benefit.id, benefit]));
  const benefitByService = new Map<string, any>();
  for (const benefit of serviceBenefits) {
    if (!benefitByService.has(benefit.service_id)) {
      benefitByService.set(benefit.service_id, benefit);
    }
  }
  const usedByBenefit = new Map<string, number>();
  const consumedAppointmentIds = new Set<string>();
  for (const usage of usages ?? []) {
    if (usage.appointment_id) consumedAppointmentIds.add(usage.appointment_id);
    const benefit =
      (usage.benefit_id ? benefitById.get(usage.benefit_id) : null) ??
      (usage.service_id ? benefitByService.get(usage.service_id) : null);
    if (!benefit) continue;
    usedByBenefit.set(
      benefit.id,
      (usedByBenefit.get(benefit.id) ?? 0) + Math.max(0, Number(usage.quantity ?? 0)),
    );
  }

  const reservedByBenefit = new Map<string, number>();
  for (const reservation of reservations ?? []) {
    if (consumedAppointmentIds.has(reservation.id)) continue;
    const benefit = benefitByService.get(reservation.service_id);
    if (!benefit) continue;
    reservedByBenefit.set(benefit.id, (reservedByBenefit.get(benefit.id) ?? 0) + 1);
  }

  return serviceBenefits.map((benefit: any) => {
    const quantity = benefit.quantity == null ? null : Number(benefit.quantity);
    const usedQuantity = usedByBenefit.get(benefit.id) ?? 0;
    const reservedQuantity = reservedByBenefit.get(benefit.id) ?? 0;
    return {
      ...benefit,
      quantity,
      used_quantity: usedQuantity,
      reserved_quantity: reservedQuantity,
      available_quantity:
        quantity == null ? null : Math.max(0, quantity - usedQuantity - reservedQuantity),
      cycle_start: cycle.start,
      cycle_end: cycle.end,
    } as SubscriptionBenefitBalance;
  });
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
    const [professionalsResult, servicesResult, settingsResult, brandingResult, timeOffResult] = await Promise.all([
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
      db
        .from("professional_time_off")
        .select("professional_id,starts_on,ends_on,all_day,start_time,end_time")
        .eq("tenant_id", t.id)
        .gte("ends_on", saoPauloToday()),
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
      timeOff: timeOffResult.data ?? [],
    };
  });

// Identify the signed-in customer subscription without exposing CPF in the browser.
export const validateVip = createServerFn({ method: "POST" })
  .inputValidator((d: { tenantId: string; subscriptionId?: string }) =>
    z
      .object({ tenantId: z.string().uuid(), subscriptionId: z.string().uuid().optional() })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const supabase = await pub();
    const db = supabase as any;
    const { requireCustomerSession } = await import("@/lib/customer-auth.server");
    const customer = await requireCustomerSession(data.tenantId);
    const cpf = cleanCpf(customer.cpf);
    const whatsapp = cleanBrazilianPhone(customer.whatsapp);

    let { data: contracts, error } = await db
      .from("client_subscriptions")
      .select("*")
      .eq("tenant_id", data.tenantId)
      .eq("client_id", customer.clientId)
      .order("created_at", { ascending: false })
      .limit(10);

    if (!error && (!contracts || contracts.length === 0)) {
      const fallback = await db
        .from("client_subscriptions")
        .select("*")
        .eq("tenant_id", data.tenantId)
        .eq("cpf", cpf)
        .order("created_at", { ascending: false })
        .limit(10);
      contracts = fallback.data;
      error = fallback.error;
    }
    if (error) throw new Error("Não foi possível consultar sua assinatura.");

    const matchingContracts = (contracts ?? []).filter(
      (item: any) =>
        (item.client_id
          ? item.client_id === customer.clientId
          : cleanCpf(String(item.cpf ?? "")) === cpf &&
            cleanBrazilianPhone(String(item.whatsapp ?? "")) === whatsapp),
    );
    const today = saoPauloToday();
    const planIds = [...new Set(matchingContracts.map((item: any) => item.plan_id).filter(Boolean))];
    const planListResult =
      planIds.length > 0
        ? await db
            .from("subscription_plans")
            .select("id,name")
            .eq("tenant_id", data.tenantId)
            .in("id", planIds)
        : { data: [], error: null };
    if (planListResult.error) {
      throw new Error("Não foi possível identificar os planos das suas assinaturas.");
    }
    const planNames = new Map(
      (planListResult.data ?? []).map((plan: any) => [plan.id, plan.name]),
    );
    const requestedContract = data.subscriptionId
      ? matchingContracts.find((item: any) => item.id === data.subscriptionId)
      : null;
    if (data.subscriptionId && !requestedContract) {
      throw new Error("A assinatura selecionada não pertence ao seu cadastro.");
    }
    const contract =
      requestedContract ??
      matchingContracts.find(
        (item: any) =>
          item.status === "active" &&
          (!item.starts_at || item.starts_at <= today) &&
          (!item.ends_at || item.ends_at >= today),
      ) ??
      matchingContracts.find((item: any) => item.status === "pending_activation") ??
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
        contractStatus === "pending_activation" ||
        (["active", "overdue", "expired"].includes(contractStatus) &&
          plan.billing_cycle !== "one_time")
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
        if (contractStatus !== "pending_activation") {
          contractStatus = "overdue";
        }
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
      let cycleBlockReason: string | null = null;
      let serviceBenefitBalances: SubscriptionBenefitBalance[] = [];
      try {
        serviceBenefitBalances = await loadSubscriptionBenefitBalances(
          db,
          data.tenantId,
          contract,
          plan,
          benefits ?? [],
          today,
        );
      } catch (cycleError: any) {
        cycleBlockReason =
          cycleError?.message ?? "O ciclo atual desta assinatura ainda não está confirmado.";
      }
      const balanceByBenefitId = new Map(
        serviceBenefitBalances.map((benefit) => [benefit.id, benefit]),
      );
      const benefitsWithBalance = (benefits ?? []).map(
        (benefit: any) => balanceByBenefitId.get(benefit.id) ?? benefit,
      );
      const reservedSessions = await countReservedSubscriptionSessions(
        db,
        data.tenantId,
        contract.id,
        serviceIds,
      );
      const sessionsRemaining =
        contract.sessions_remaining == null ? null : Number(contract.sessions_remaining);
      const availableSessions =
        sessionsRemaining == null
          ? null
          : Math.max(0, sessionsRemaining - reservedSessions);
      let bookingBlockReason: string | null = null;
      if (contractStatus === "pending_activation") {
        bookingBlockReason =
          "Sua assinatura aguarda a confirmação do primeiro pagamento pelo salão.";
      } else if (contractStatus !== "active") {
        bookingBlockReason = "Sua assinatura precisa ser regularizada antes de um agendamento VIP.";
      } else if (contract.starts_at && contract.starts_at > today) {
        bookingBlockReason = `Sua assinatura começa em ${contract.starts_at
          .split("-")
          .reverse()
          .join("/")}.`;
      } else if (contract.ends_at && contract.ends_at < today) {
        bookingBlockReason = "Sua assinatura está fora do período de validade.";
      } else if (cycleBlockReason) {
        bookingBlockReason = cycleBlockReason;
      }
      const availableSubscriptions = matchingContracts.map((item: any) => {
        const status = item.id === contract.id ? contractStatus : item.status;
        const eligibleNow =
          status === "active" &&
          (!item.starts_at || item.starts_at <= today) &&
          (!item.ends_at || item.ends_at >= today);
        return {
          id: item.id,
          plan_id: item.plan_id,
          plan_name: planNames.get(item.plan_id) ?? "Assinatura",
          status,
          starts_at: item.starts_at,
          ends_at: item.ends_at,
          sessions_remaining:
            item.sessions_remaining == null ? null : Number(item.sessions_remaining),
          eligible_now: eligibleNow,
        };
      });

      return {
        id: contract.id,
        subscription_id: contract.id,
        full_name: contract.subscriber_name,
        status: contractStatus,
        price: contract.price,
        whatsapp: contract.whatsapp,
        next_due_at: contract.next_due_at,
        starts_at: contract.starts_at,
        ends_at: contract.ends_at,
        sessions_remaining: sessionsRemaining,
        reserved_sessions: reservedSessions,
        available_sessions: availableSessions,
        can_book: bookingBlockReason == null,
        booking_block_reason: bookingBlockReason,
        benefits: benefitsWithBalance,
        available_subscriptions: availableSubscriptions,
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
          benefits: benefitsWithBalance,
        }),
      };
    }

    return null;
  });

// Customer session: authorize a short-lived upload for the customer's charge.
export const prepareSubscriptionProofUpload = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z
      .object({
        tenantId: z.string().uuid(),
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
    const { requireCustomerSession } = await import("@/lib/customer-auth.server");
    const customer = await requireCustomerSession(data.tenantId);
    const { data: charge, error } = await db
      .from("subscription_charges")
      .select("*")
      .eq("tenant_id", data.tenantId)
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
      .select("id,status,plan_id,client_id,cpf,whatsapp")
      .eq("id", charge.subscription_id)
      .eq("tenant_id", data.tenantId)
      .maybeSingle();
    const contractBelongsToCustomer =
      contract?.client_id === customer.clientId ||
      (!contract?.client_id &&
        cleanCpf(String(contract?.cpf ?? "")) === cleanCpf(customer.cpf) &&
        cleanBrazilianPhone(String(contract?.whatsapp ?? "")) ===
          cleanBrazilianPhone(customer.whatsapp));
    if (
      !contract ||
      !contractBelongsToCustomer ||
      !["pending_activation", "active", "overdue", "expired"].includes(contract.status)
    ) {
      throw new Error("Esta assinatura não está disponível para pagamento ou renovação.");
    }

    const { data: plan } = await db
      .from("subscription_plans")
      .select("billing_cycle,pix_enabled")
      .eq("id", contract.plan_id)
      .eq("tenant_id", charge.tenant_id)
      .maybeSingle();
    if (
      !plan ||
      (contract.status !== "pending_activation" && plan.billing_cycle === "one_time") ||
      !plan.pix_enabled
    ) {
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

// Customer session: record the uploaded proof and place it in the salon review queue.
export const submitSubscriptionProof = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z
      .object({
        tenantId: z.string().uuid(),
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
    const { requireCustomerSession } = await import("@/lib/customer-auth.server");
    const customer = await requireCustomerSession(data.tenantId);
    const { data: charge, error } = await db
      .from("subscription_charges")
      .select("*")
      .eq("id", data.chargeId)
      .eq("tenant_id", data.tenantId)
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
      .select("id,status,plan_id,client_id,cpf,whatsapp")
      .eq("id", charge.subscription_id)
      .eq("tenant_id", data.tenantId)
      .maybeSingle();
    const contractBelongsToCustomer =
      contract?.client_id === customer.clientId ||
      (!contract?.client_id &&
        cleanCpf(String(contract?.cpf ?? "")) === cleanCpf(customer.cpf) &&
        cleanBrazilianPhone(String(contract?.whatsapp ?? "")) ===
          cleanBrazilianPhone(customer.whatsapp));
    if (
      !contract ||
      !contractBelongsToCustomer ||
      !["pending_activation", "active", "overdue", "expired"].includes(contract.status)
    ) {
      throw new Error("Esta assinatura não está disponível para pagamento ou renovação.");
    }

    const { data: plan } = await db
      .from("subscription_plans")
      .select("billing_cycle,pix_enabled")
      .eq("id", contract.plan_id)
      .eq("tenant_id", charge.tenant_id)
      .maybeSingle();
    if (
      !plan ||
      (contract.status !== "pending_activation" && plan.billing_cycle === "one_time") ||
      !plan.pix_enabled
    ) {
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
    const [apptsRes, timeOffRes] = await Promise.all([
      supabase
        .from("appointments")
        .select("start_at,end_at")
        .eq("tenant_id", data.tenantId)
        .eq("professional_id", data.professionalId)
        .gte("start_at", start)
        .lte("start_at", end)
        .not("status", "in", "(cancelled,canceled,noshow)"),
      (supabase as any)
        .from("professional_time_off")
        .select("starts_on,ends_on,all_day,start_time,end_time")
        .eq("tenant_id", data.tenantId)
        .eq("professional_id", data.professionalId)
        .lte("starts_on", data.date)
        .gte("ends_on", data.date),
    ]);
    if (apptsRes.error) throw new Error(apptsRes.error.message);
    if (timeOffRes.error) throw new Error(timeOffRes.error.message);

    const busy: { start_at: string; end_at: string }[] = (apptsRes.data ?? []).map((a: any) => ({
      start_at: a.start_at,
      end_at: a.end_at,
    }));
    const [year, month, day] = data.date.split("-").map(Number);
    for (const off of timeOffRes.data ?? []) {
      if (off.all_day) {
        const s = new Date(year, month - 1, day, 0, 0, 0, 0);
        const e = new Date(year, month - 1, day, 23, 59, 59, 999);
        busy.push({ start_at: s.toISOString(), end_at: e.toISOString() });
      } else {
        const [sh, sm] = String(off.start_time ?? "00:00").split(":").map(Number);
        const [eh, em] = String(off.end_time ?? "00:00").split(":").map(Number);
        const s = new Date(year, month - 1, day, sh || 0, sm || 0, 0, 0);
        const e = new Date(year, month - 1, day, eh || 0, em || 0, 0, 0);
        busy.push({ start_at: s.toISOString(), end_at: e.toISOString() });
      }
    }
    return busy;
  });

// Public: create appointment. Enforces slot conflict and VIP-day rule.
export const createBooking = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({
    tenantId: z.string().uuid(),
    professionalId: z.string().uuid(),
    serviceId: z.string().uuid(),
    startAt: z.string().datetime(),
    isVip: z.boolean().default(false),
    subscriptionId: z.string().uuid().optional(),
  }).parse(d))
  .handler(async ({ data }) => {
    const supabase = await pub();
    const db = supabase as any;
    const { requireCustomerSession } = await import("@/lib/customer-auth.server");
    const customer = await requireCustomerSession(data.tenantId);
    const cancellationToken = crypto.randomUUID();

    const [{ data: t }, { data: settings }, { data: svc }, { data: pro }] = await Promise.all([
      supabase.from("tenants").select("id,name,whatsapp,slot_minutes").eq("id", data.tenantId).maybeSingle(),
      supabase.from("tenant_settings").select("vip_days,work_days,open_hour,close_hour,lunch_start,lunch_end,vip_mode,closed_dates").eq("tenant_id", data.tenantId).maybeSingle(),
      supabase
        .from("services")
        .select("id,name,duration_min,price,vip_only")
        .eq("id", data.serviceId)
        .eq("tenant_id", data.tenantId)
        .maybeSingle(),
      supabase
        .from("professionals")
        .select("id,commission_pct,work_days,blocked_dates,lunch_start,lunch_end")
        .eq("id", data.professionalId)
        .eq("tenant_id", data.tenantId)
        .eq("active", true)
        .maybeSingle(),
    ]);
    if (!t || !svc || !pro) throw new Error("Barbearia, serviço ou profissional inválido");
    if (svc.vip_only && !data.isVip) {
      throw new Error("Este serviço é exclusivo para assinantes VIP com assinatura ativa.");
    }

    const start = new Date(data.startAt);
    const end = new Date(start.getTime() + (svc.duration_min ?? t.slot_minutes ?? 30) * 60000);
    const bookingDate = saoPauloDate(start);
    if (start.getTime() <= Date.now()) {
      throw new Error("Escolha um horário futuro para realizar o agendamento.");
    }

    let activeSubscription: any = null;
    let coveredBySubscription = false;
    if (data.isVip) {
      if (!data.subscriptionId) {
        throw new Error("Escolha qual assinatura deseja usar neste agendamento VIP.");
      }
      const { data: selectedSubscription, error: subscriptionError } = await db
        .from("client_subscriptions")
        .select("*")
        .eq("tenant_id", data.tenantId)
        .eq("id", data.subscriptionId)
        .maybeSingle();
      if (subscriptionError) throw new Error("Não foi possível consultar a assinatura escolhida.");
      if (!selectedSubscription) {
        throw new Error("A assinatura escolhida não foi encontrada.");
      }

      const cleanCpfValue = cleanCpf(customer.cpf);
      const cleanWhatsapp = cleanBrazilianPhone(customer.whatsapp);
      const belongsToCustomer =
        selectedSubscription.client_id === customer.clientId ||
        (!selectedSubscription.client_id &&
          cleanCpfValue.length === 11 &&
          cleanCpf(String(selectedSubscription.cpf ?? "")) === cleanCpfValue &&
          cleanBrazilianPhone(String(selectedSubscription.whatsapp ?? "")) === cleanWhatsapp);
      if (!belongsToCustomer) {
        throw new Error("A assinatura escolhida não pertence ao seu cadastro.");
      }
      activeSubscription = selectedSubscription;
      if (activeSubscription.status !== "active") {
        if (activeSubscription.status === "pending_activation") {
          throw new Error(
            "Sua assinatura aguarda a confirmação do primeiro pagamento pelo salão.",
          );
        }
        if (activeSubscription.status === "overdue") {
          throw new Error(
            "Sua assinatura está vencida. Envie o comprovante e aguarde a confirmação do salão.",
          );
        }
        throw new Error("A assinatura escolhida não está ativa para agendamentos VIP.");
      }
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
      if (activeSubscription.starts_at && activeSubscription.starts_at > bookingDate) {
        throw new Error("Sua assinatura ainda não estará vigente na data escolhida.");
      }
      if (activeSubscription.ends_at && activeSubscription.ends_at < bookingDate) {
        throw new Error("Sua assinatura não estará vigente na data escolhida.");
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
          .select("id,service_id,benefit_type,name,quantity,active")
          .eq("plan_id", activeSubscription.plan_id)
          .eq("tenant_id", data.tenantId)
          .eq("active", true),
      ]);
      coveredBySubscription = (benefits ?? []).some(
        (benefit: any) =>
          benefit.benefit_type === "service" && benefit.service_id === data.serviceId,
      );
      if (!plan) throw new Error("O plano desta assinatura não foi encontrado.");
      const benefitsWithBalance = await loadSubscriptionBenefitBalances(
        db,
        data.tenantId,
        activeSubscription,
        plan,
        benefits ?? [],
        bookingDate,
      );
      if (coveredBySubscription) {
        const selectedBenefit = benefitsWithBalance.find(
          (benefit) => benefit.service_id === data.serviceId,
        );
        if (
          selectedBenefit?.available_quantity != null &&
          selectedBenefit.available_quantity <= 0
        ) {
          throw new Error(
            `O benefício "${selectedBenefit.name}" não possui saldo livre neste ciclo.`,
          );
        }
        const coveredServiceIds = (benefits ?? [])
          .filter((benefit: any) => benefit.benefit_type === "service" && benefit.service_id)
          .map((benefit: any) => benefit.service_id);
        const reservedSessions = await countReservedSubscriptionSessions(
          db,
          data.tenantId,
          activeSubscription.id,
          coveredServiceIds,
        );
        const sessionsRemaining =
          activeSubscription.sessions_remaining == null
            ? null
            : Number(activeSubscription.sessions_remaining);
        const availableSessions =
          sessionsRemaining == null
            ? null
            : Math.max(0, sessionsRemaining - reservedSessions);
        if (availableSessions != null && availableSessions <= 0) {
          throw new Error(
            "Todas as sessões disponíveis já foram usadas ou estão reservadas em outros agendamentos.",
          );
        }
      }
      if (!coveredBySubscription && plan?.included_services_only && !plan?.allow_extras)
        throw new Error("Este serviço não está incluído na sua assinatura.");
    }

    const bookingDayAtNoonUtc = new Date(`${bookingDate}T12:00:00Z`);
    const dow = ((bookingDayAtNoonUtc.getUTCDay() + 6) % 7) + 1; // 1=Mon..7=Sun
    if (!includesBookingWeekday(settings?.work_days, dow)) {
      throw new Error("O salão não funciona no dia escolhido.");
    }
    if (!includesBookingWeekday(pro.work_days, dow)) {
      throw new Error("O profissional não atende no dia escolhido.");
    }
    if ((settings?.closed_dates ?? []).includes(bookingDate)) {
      throw new Error("O salão está fechado na data escolhida.");
    }
    if ((pro.blocked_dates ?? []).includes(bookingDate)) {
      throw new Error("O profissional não está disponível na data escolhida.");
    }

    const { data: timeOffRows, error: timeOffError } = await (supabase as any)
      .from("professional_time_off")
      .select("all_day,start_time,end_time")
      .eq("tenant_id", data.tenantId)
      .eq("professional_id", data.professionalId)
      .lte("starts_on", bookingDate)
      .gte("ends_on", bookingDate);
    if (timeOffError) throw new Error(timeOffError.message);
    const startMinInDay = saoPauloTimeMinutes(start);
    const endMinInDay = saoPauloTimeMinutes(end);
    for (const off of timeOffRows ?? []) {
      if (off.all_day) {
        throw new Error("O profissional está de folga na data escolhida.");
      }
      const [sh, sm] = String(off.start_time ?? "00:00").split(":").map(Number);
      const [eh, em] = String(off.end_time ?? "00:00").split(":").map(Number);
      const offStart = (sh || 0) * 60 + (sm || 0);
      const offEnd = (eh || 0) * 60 + (em || 0);
      if (startMinInDay < offEnd && endMinInDay > offStart) {
        throw new Error("O profissional está de folga neste horário.");
      }
    }

    const openingMinutes = configuredTimeMinutes(settings?.open_hour, 8);
    const closingMinutes = configuredTimeMinutes(settings?.close_hour, 20);
    const startMinutes = saoPauloTimeMinutes(start);
    const endMinutes = saoPauloTimeMinutes(end);
    if (
      saoPauloDate(end) !== bookingDate ||
      startMinutes < openingMinutes ||
      endMinutes > closingMinutes
    ) {
      throw new Error("O horário escolhido está fora do funcionamento do salão.");
    }

    const lunchStart = configuredTimeMinutes(pro.lunch_start ?? settings?.lunch_start, 12);
    const lunchEnd = configuredTimeMinutes(pro.lunch_end ?? settings?.lunch_end, 13);
    if (lunchEnd > lunchStart && startMinutes < lunchEnd && endMinutes > lunchStart) {
      throw new Error("O horário escolhido coincide com o intervalo de almoço.");
    }

    const vipMode = (settings as any)?.vip_mode ?? "strict";
    if (
      vipMode === "strict" &&
      !data.isVip &&
      isVipExclusiveBookingDay(settings?.work_days, settings?.vip_days, dow)
    ) {
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
      .not("status", "in", "(cancelled,canceled,noshow)");
    if (conflicts && conflicts.length > 0) throw new Error("Este horário já está ocupado. Escolha outro.");

    const cleanWhatsapp = cleanBrazilianPhone(customer.whatsapp);
    const clientId = customer.clientId;
    if (data.isVip) {
      await supabase
        .from("clients")
        .update({ is_subscriber: true })
        .eq("id", clientId)
        .eq("tenant_id", data.tenantId);
    }

    const { data: appt, error } = await supabase.from("appointments").insert({
      tenant_id: data.tenantId,
      professional_id: data.professionalId,
      service_id: data.serviceId,
      client_name: customer.fullName,
      client_whatsapp: cleanWhatsapp,
      client_id: clientId,
      subscription_id: activeSubscription?.id ?? null,
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
        subscriptionId: activeSubscription?.id ?? null,
        clientId,
        clientName: customer.fullName,
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

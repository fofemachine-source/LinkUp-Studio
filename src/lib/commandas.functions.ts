import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { syncAppointmentComanda } from "@/lib/commandas";

const repairAppointmentCommandasSchema = z.object({
  tenantId: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

const FINAL_COMANDA_STATUSES = new Set(["closed", "canceled", "cancelled", "no_show", "noshow"]);

function saoPauloDayRange(date: string) {
  return {
    start: new Date(`${date}T00:00:00.000-03:00`).toISOString(),
    end: new Date(`${date}T23:59:59.999-03:00`).toISOString(),
  };
}

function canManageTenant(
  roles: Array<{ role: string; tenant_id: string | null }>,
  tenantId: string,
) {
  return roles.some(
    (role) =>
      role.role === "super_admin" ||
      (role.tenant_id === tenantId && (role.role === "owner" || role.role === "staff")),
  );
}

type RepairAppointment = {
  id: string;
  tenant_id: string;
  client_id: string | null;
  client_name: string | null;
  professional_id: string;
  service_id: string;
  start_at: string;
  status: string | null;
  source: string | null;
  subscription_id: string | null;
};

type RepairCommanda = {
  id: string;
  appointment_id: string | null;
  status: string | null;
  scheduled_at: string | null;
  subtotal?: number | null;
  discount?: number | null;
  addition?: number | null;
  total?: number | null;
};

type RepairCommandaItem = {
  id: string;
  commanda_id: string;
  kind: string | null;
  ref_id: string | null;
  quantity: number | null;
  unit_price: number | null;
  billable_amount?: number | null;
  covered_by_subscription?: boolean | null;
  subscription_benefit_id?: string | null;
  subscription_id?: string | null;
};

function money(value: unknown) {
  const parsed = Number(value ?? 0);
  if (!Number.isFinite(parsed)) return 0;
  return Math.round(parsed * 100) / 100;
}

function shouldNormalizeCommanda(
  commanda: RepairCommanda | undefined,
  appointment: RepairAppointment,
) {
  if (!commanda) return true;

  const status = String(commanda.status ?? "").toLowerCase();
  if (FINAL_COMANDA_STATUSES.has(status)) return false;

  if (!commanda.scheduled_at) return true;
  if (new Date(commanda.scheduled_at).getTime() !== new Date(appointment.start_at).getTime()) {
    return true;
  }

  if (!["open", "awaiting_payment"].includes(status)) return true;
  return false;
}

async function loadCoveredServiceIdsByAppointment(
  db: any,
  tenantId: string,
  appointments: RepairAppointment[],
) {
  const result = new Map<string, string[]>();
  const subscriptionIds = Array.from(
    new Set(
      appointments
        .map((appointment) => appointment.subscription_id)
        .filter((id): id is string => Boolean(id)),
    ),
  );

  if (subscriptionIds.length === 0) return result;

  const { data: subscriptions, error: subscriptionsError } = await db
    .from("client_subscriptions")
    .select("id,plan_id")
    .eq("tenant_id", tenantId)
    .in("id", subscriptionIds);

  if (subscriptionsError) throw new Error(subscriptionsError.message);

  const planBySubscriptionId = new Map<string, string>();
  for (const subscription of subscriptions ?? []) {
    if (subscription.id && subscription.plan_id) {
      planBySubscriptionId.set(subscription.id, subscription.plan_id);
    }
  }

  const planIds = Array.from(new Set(planBySubscriptionId.values()));
  if (planIds.length === 0) return result;

  const { data: benefits, error: benefitsError } = await db
    .from("subscription_plan_benefits")
    .select("plan_id,service_id,benefit_type,active")
    .eq("tenant_id", tenantId)
    .eq("benefit_type", "service")
    .eq("active", true)
    .in("plan_id", planIds);

  if (benefitsError) throw new Error(benefitsError.message);

  const coveredServicesByPlanId = new Map<string, Set<string>>();
  for (const benefit of benefits ?? []) {
    if (!benefit.plan_id || !benefit.service_id) continue;

    const services = coveredServicesByPlanId.get(benefit.plan_id) ?? new Set<string>();
    services.add(benefit.service_id);
    coveredServicesByPlanId.set(benefit.plan_id, services);
  }

  for (const appointment of appointments) {
    if (!appointment.subscription_id) continue;

    const planId = planBySubscriptionId.get(appointment.subscription_id);
    const coveredServices = planId ? coveredServicesByPlanId.get(planId) : null;
    if (coveredServices?.has(appointment.service_id)) {
      result.set(appointment.id, [appointment.service_id]);
    }
  }

  return result;
}

async function adjustOpenCoveredSubscriptionCommandas(
  db: any,
  tenantId: string,
  appointments: RepairAppointment[],
  commandaByAppointmentId: Map<string, RepairCommanda>,
) {
  const coveredServiceIdsByAppointment = await loadCoveredServiceIdsByAppointment(
    db,
    tenantId,
    appointments,
  );

  const appointmentsWithCoverage = appointments.filter(
    (appointment) =>
      (coveredServiceIdsByAppointment.get(appointment.id)?.length ?? 0) > 0 &&
      commandaByAppointmentId.has(appointment.id),
  );

  if (appointmentsWithCoverage.length === 0) return 0;

  const openCommandaIds = appointmentsWithCoverage
    .map((appointment) => commandaByAppointmentId.get(appointment.id))
    .filter((commanda): commanda is RepairCommanda => {
      if (!commanda) return false;
      const status = String(commanda.status ?? "").toLowerCase();
      return !FINAL_COMANDA_STATUSES.has(status);
    })
    .map((commanda) => commanda.id);

  if (openCommandaIds.length === 0) return 0;

  const { data: items, error: itemsError } = await db
    .from("commanda_items")
    .select(
      "id,commanda_id,kind,ref_id,quantity,unit_price,billable_amount,covered_by_subscription,subscription_benefit_id,subscription_id",
    )
    .eq("tenant_id", tenantId)
    .in("commanda_id", openCommandaIds);

  if (itemsError) throw new Error(itemsError.message);

  const itemsByCommandaId = new Map<string, RepairCommandaItem[]>();
  for (const item of (items ?? []) as RepairCommandaItem[]) {
    const grouped = itemsByCommandaId.get(item.commanda_id) ?? [];
    grouped.push(item);
    itemsByCommandaId.set(item.commanda_id, grouped);
  }

  let adjusted = 0;

  for (const appointment of appointmentsWithCoverage) {
    const commanda = commandaByAppointmentId.get(appointment.id);
    if (!commanda) continue;

    const currentStatus = String(commanda.status ?? "").toLowerCase();
    if (FINAL_COMANDA_STATUSES.has(currentStatus)) continue;

    const covered = new Set(coveredServiceIdsByAppointment.get(appointment.id) ?? []);
    if (covered.size === 0) continue;

    const commandaItems = itemsByCommandaId.get(commanda.id) ?? [];
    if (commandaItems.length === 0) continue;

    let coveredSubtotal = 0;
    let nextSubtotal = 0;

    for (const item of commandaItems) {
      const lineTotal = money(money(item.unit_price) * Number(item.quantity ?? 1));
      const coveredItem = Boolean(
        item.kind === "service" && item.ref_id && covered.has(item.ref_id),
      );

      if (coveredItem) {
        coveredSubtotal = money(coveredSubtotal + lineTotal);
      } else {
        nextSubtotal = money(nextSubtotal + lineTotal);
      }

      const needsItemSnapshot =
        Boolean(item.covered_by_subscription) !== coveredItem ||
        money(item.billable_amount) !== (coveredItem ? 0 : lineTotal) ||
        (coveredItem ? item.subscription_id !== appointment.subscription_id : item.subscription_id !== null);

      if (needsItemSnapshot) {
        const { error: itemUpdateError } = await db
          .from("commanda_items")
          .update({
            covered_by_subscription: coveredItem,
            subscription_id: coveredItem ? (appointment.subscription_id ?? null) : null,
            subscription_benefit_id: null,
            billable_amount: coveredItem ? 0 : lineTotal,
          })
          .eq("tenant_id", tenantId)
          .eq("id", item.id);

        if (itemUpdateError) throw new Error(itemUpdateError.message);
      }
    }

    if (coveredSubtotal <= 0) continue;

    const nextTotal = money(
      Math.max(0, nextSubtotal - money(commanda.discount) + money(commanda.addition)),
    );

    if (
      money(commanda.subtotal) === nextSubtotal &&
      money(commanda.total) === nextTotal &&
      commanda.scheduled_at === appointment.start_at &&
      ["open", "awaiting_payment"].includes(currentStatus) &&
      commanda.appointment_id === appointment.id
    ) {
      continue;
    }

    const { error: updateError } = await db
      .from("commandas")
      .update({
        subscription_id: appointment.subscription_id ?? null,
        scheduled_at: appointment.start_at,
        source: appointment.source === "online" ? "online" : "manual",
        client_id: appointment.client_id ?? null,
        client_name: appointment.client_name ?? "Cliente",
        status: ["open", "awaiting_payment"].includes(currentStatus) ? currentStatus : "open",
        subtotal: nextSubtotal,
        total: nextTotal,
        updated_at: new Date().toISOString(),
      })
      .eq("tenant_id", tenantId)
      .eq("id", commanda.id);

    if (updateError) throw new Error(updateError.message);
    adjusted += 1;
  }

  return adjusted;
}

export const repairAppointmentCommandasForDate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => repairAppointmentCommandasSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { data: roles, error: roleError } = await context.supabase
      .from("user_roles")
      .select("role, tenant_id")
      .eq("user_id", context.userId);

    if (roleError) throw new Error(roleError.message);
    if (!canManageTenant(roles ?? [], data.tenantId)) {
      throw new Error("Você não tem permissão para sincronizar comandas deste salão.");
    }

    // Keep this repair path caller-scoped. The owner/staff authorization above
    // and the table RLS policies both validate every tenant read/write, so the
    // web server does not need (and must not expose) a service-role key.
    const db = context.supabase;
    const range = saoPauloDayRange(data.date);

    const { data: appointments, error: appointmentsError } = await db
      .from("appointments")
      .select(
        "id,tenant_id,client_id,client_name,professional_id,service_id,start_at,status,source,subscription_id",
      )
      .eq("tenant_id", data.tenantId)
      .gte("start_at", range.start)
      .lte("start_at", range.end)
      .not("status", "in", "(cancelled,canceled,no_show,noshow,completed)");

    if (appointmentsError) throw new Error(appointmentsError.message);

    const candidateAppointments = (appointments ?? []).filter(
      (appointment): appointment is RepairAppointment =>
        Boolean(appointment.id && appointment.professional_id && appointment.service_id),
    );

    if (candidateAppointments.length === 0) {
      return { ok: true, checked: 0, repaired: 0, created: 0, normalized: 0 };
    }

    const appointmentIds = candidateAppointments.map((appointment) => appointment.id);
    const { data: relatedCommandas, error: relatedCommandasError } = await db
      .from("commandas")
      .select("id,appointment_id,status,scheduled_at,subtotal,discount,addition,total")
      .eq("tenant_id", data.tenantId)
      .in("appointment_id", appointmentIds);

    if (relatedCommandasError) throw new Error(relatedCommandasError.message);

    const commandaByAppointmentId = new Map<string, RepairCommanda>();
    for (const commanda of relatedCommandas ?? []) {
      if (commanda.appointment_id) {
        commandaByAppointmentId.set(commanda.appointment_id, commanda);
      }
    }

    const billingAdjusted = await adjustOpenCoveredSubscriptionCommandas(
      db,
      data.tenantId,
      candidateAppointments,
      commandaByAppointmentId,
    );

    const appointmentsToRepair = candidateAppointments.filter((appointment) =>
      shouldNormalizeCommanda(commandaByAppointmentId.get(appointment.id), appointment),
    );

    if (appointmentsToRepair.length === 0) {
      return {
        ok: true,
        checked: candidateAppointments.length,
        repaired: billingAdjusted,
        created: 0,
        normalized: billingAdjusted,
        billingAdjusted,
      };
    }

    const appointmentsToCreate = appointmentsToRepair.filter(
      (appointment) => !commandaByAppointmentId.has(appointment.id),
    );
    const appointmentsToNormalize = appointmentsToRepair.filter((appointment) =>
      commandaByAppointmentId.has(appointment.id),
    );

    let normalized = 0;
    for (const appointment of appointmentsToNormalize) {
      const commanda = commandaByAppointmentId.get(appointment.id);
      if (!commanda) continue;

      const currentStatus = String(commanda.status ?? "").toLowerCase();
      const normalizedStatus = ["open", "awaiting_payment"].includes(currentStatus)
        ? currentStatus
        : "open";
      const { error: updateError } = await db
        .from("commandas")
        .update({
          subscription_id: appointment.subscription_id ?? null,
          scheduled_at: appointment.start_at,
          source: appointment.source === "online" ? "online" : "manual",
          client_id: appointment.client_id ?? null,
          client_name: appointment.client_name ?? "Cliente",
          status: normalizedStatus,
        })
        .eq("tenant_id", data.tenantId)
        .eq("id", commanda.id);

      if (updateError) throw new Error(updateError.message);
      normalized += 1;
    }

    if (appointmentsToCreate.length === 0) {
      return {
        ok: true,
        checked: candidateAppointments.length,
        repaired: normalized + billingAdjusted,
        created: 0,
        normalized: normalized + billingAdjusted,
        billingAdjusted,
      };
    }

    const serviceIds = Array.from(
      new Set(appointmentsToCreate.map((appointment) => appointment.service_id)),
    );
    const professionalIds = Array.from(
      new Set(appointmentsToCreate.map((appointment) => appointment.professional_id)),
    );

    const [
      { data: services, error: servicesError },
      { data: professionals, error: professionalsError },
    ] = await Promise.all([
      db
        .from("services")
        .select("id,name,price")
        .eq("tenant_id", data.tenantId)
        .in("id", serviceIds),

      db
        .from("professionals")
        .select("id,commission_pct")
        .eq("tenant_id", data.tenantId)
        .in("id", professionalIds),
    ]);

    if (servicesError) throw new Error(servicesError.message);
    if (professionalsError) throw new Error(professionalsError.message);

    const coveredServiceIdsByAppointment = await loadCoveredServiceIdsByAppointment(
      db,
      data.tenantId,
      appointmentsToCreate,
    );

    let created = 0;

    for (const appointment of appointmentsToCreate) {
      const service = (services ?? []).find((item) => item.id === appointment.service_id);
      if (!service) continue;

      await syncAppointmentComanda(db, {
        appointmentId: appointment.id,
        tenantId: data.tenantId,
        subscriptionId: appointment.subscription_id ?? null,
        coveredServiceIds: coveredServiceIdsByAppointment.get(appointment.id) ?? [],
        clientId: appointment.client_id ?? null,
        clientName: appointment.client_name ?? "Cliente",
        professionalId: appointment.professional_id,
        serviceIds: [appointment.service_id],
        services: [service],
        professionals: professionals ?? [],
        scheduledAt: appointment.start_at,
        status: appointment.status,
        source: appointment.source === "online" ? "online" : "manual",
      });

      created += 1;
    }

    return {
      ok: true,
      checked: candidateAppointments.length,
      repaired: created + normalized + billingAdjusted,
      created,
      normalized: normalized + billingAdjusted,
      billingAdjusted,
    };
  });

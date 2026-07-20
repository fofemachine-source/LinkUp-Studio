import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { syncAppointmentComanda } from "@/lib/commandas";

const repairAppointmentCommandasSchema = z.object({
  tenantId: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

const FINAL_COMANDA_STATUSES = new Set([
  "closed",
  "canceled",
  "cancelled",
  "no_show",
  "noshow",
]);

function saoPauloDayRange(date: string) {
  return {
    start: new Date(`${date}T00:00:00.000-03:00`).toISOString(),
    end: new Date(`${date}T23:59:59.999-03:00`).toISOString(),
  };
}

function canManageTenant(roles: Array<{ role: string; tenant_id: string | null }>, tenantId: string) {
  return roles.some(
    (role) =>
      role.role === "super_admin" ||
      (role.tenant_id === tenantId && (role.role === "owner" || role.role === "staff")),
  );
}

function shouldRepairCommanda(commanda: any | undefined, appointment: any) {
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

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const range = saoPauloDayRange(data.date);

    const { data: appointments, error: appointmentsError } = await supabaseAdmin
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
      (appointment: any) => appointment.id && appointment.professional_id && appointment.service_id,
    );

    if (candidateAppointments.length === 0) {
      return { ok: true, checked: 0, repaired: 0, created: 0, normalized: 0 };
    }

    const appointmentIds = candidateAppointments.map((appointment: any) => appointment.id);
    const { data: relatedCommandas, error: relatedCommandasError } = await supabaseAdmin
      .from("commandas")
      .select("id,appointment_id,status,scheduled_at")
      .eq("tenant_id", data.tenantId)
      .in("appointment_id", appointmentIds);

    if (relatedCommandasError) throw new Error(relatedCommandasError.message);

    const commandaByAppointmentId = new Map(
      (relatedCommandas ?? [])
        .filter((commanda: any) => commanda.appointment_id)
        .map((commanda: any) => [commanda.appointment_id, commanda]),
    );

    const appointmentsToRepair = candidateAppointments.filter((appointment: any) =>
      shouldRepairCommanda(commandaByAppointmentId.get(appointment.id), appointment),
    );

    if (appointmentsToRepair.length === 0) {
      return {
        ok: true,
        checked: candidateAppointments.length,
        repaired: 0,
        created: 0,
        normalized: 0,
      };
    }

    const serviceIds = Array.from(
      new Set(appointmentsToRepair.map((appointment: any) => appointment.service_id)),
    );
    const professionalIds = Array.from(
      new Set(appointmentsToRepair.map((appointment: any) => appointment.professional_id)),
    );

    const [{ data: services, error: servicesError }, { data: professionals, error: professionalsError }] =
      await Promise.all([
        supabaseAdmin
          .from("services")
          .select("id,name,price")
          .eq("tenant_id", data.tenantId)
          .in("id", serviceIds),

        supabaseAdmin
          .from("professionals")
          .select("id,commission_pct")
          .eq("tenant_id", data.tenantId)
          .in("id", professionalIds),
      ]);

    if (servicesError) throw new Error(servicesError.message);
    if (professionalsError) throw new Error(professionalsError.message);

    let created = 0;
    let normalized = 0;

    for (const appointment of appointmentsToRepair) {
      const service = (services ?? []).find((item: any) => item.id === appointment.service_id);
      if (!service) continue;

      const alreadyHadCommanda = Boolean(commandaByAppointmentId.get(appointment.id));
      await syncAppointmentComanda(supabaseAdmin as any, {
        appointmentId: appointment.id,
        tenantId: data.tenantId,
        subscriptionId: appointment.subscription_id ?? null,
        clientId: appointment.client_id ?? null,
        clientName: appointment.client_name ?? "Cliente",
        professionalId: appointment.professional_id,
        serviceIds: [appointment.service_id].filter(Boolean) as string[],
        services: [service] as any,

        professionals: professionals ?? [],
        scheduledAt: appointment.start_at,
        status: appointment.status,
        source: appointment.source === "online" ? "online" : "manual",
      });

      if (alreadyHadCommanda) normalized += 1;
      else created += 1;
    }

    return {
      ok: true,
      checked: candidateAppointments.length,
      repaired: created + normalized,
      created,
      normalized,
    };
  });

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida");
const timeStr = z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, "Horário inválido");

async function assertOwner(context: any, tenantId: string) {
  const { data: roles, error } = await context.supabase
    .from("user_roles")
    .select("role, tenant_id")
    .eq("user_id", context.userId);
  if (error) throw new Error(error.message);
  const isOwner = (roles ?? []).some(
    (r: any) =>
      r.role === "super_admin" || (r.tenant_id === tenantId && r.role === "owner"),
  );
  if (!isOwner) throw new Error("Apenas o proprietário pode gerenciar folgas.");
}

export const listProfessionalTimeOff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ tenantId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("professional_time_off")
      .select("*")
      .eq("tenant_id", data.tenantId)
      .gte("ends_on", new Date().toISOString().slice(0, 10))
      .order("starts_on", { ascending: true });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

const createSchema = z
  .object({
    tenantId: z.string().uuid(),
    professionalId: z.string().uuid(),
    startsOn: dateStr,
    endsOn: dateStr,
    allDay: z.boolean().default(true),
    startTime: timeStr.optional().nullable(),
    endTime: timeStr.optional().nullable(),
    reason: z.string().max(240).optional().nullable(),
  })
  .refine((v) => v.endsOn >= v.startsOn, {
    message: "A data final deve ser igual ou após a inicial.",
    path: ["endsOn"],
  })
  .refine(
    (v) => v.allDay || (v.startTime && v.endTime && v.endTime > v.startTime),
    { message: "Informe um intervalo de horário válido.", path: ["endTime"] },
  );

export const createProfessionalTimeOff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => createSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertOwner(context, data.tenantId);

    const { data: pro, error: proError } = await context.supabase
      .from("professionals")
      .select("id, tenant_id")
      .eq("id", data.professionalId)
      .eq("tenant_id", data.tenantId)
      .maybeSingle();
    if (proError) throw new Error(proError.message);
    if (!pro) throw new Error("Profissional não encontrado.");

    const payload = {
      tenant_id: data.tenantId,
      professional_id: data.professionalId,
      starts_on: data.startsOn,
      ends_on: data.endsOn,
      all_day: data.allDay,
      start_time: data.allDay ? null : data.startTime,
      end_time: data.allDay ? null : data.endTime,
      reason: data.reason?.trim() || null,
      created_by: context.userId,
    };

    const { data: inserted, error } = await context.supabase
      .from("professional_time_off")
      .insert(payload)
      .select("*")
      .maybeSingle();
    if (error) throw new Error(error.message);
    return inserted;
  });

export const deleteProfessionalTimeOff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ tenantId: z.string().uuid(), id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertOwner(context, data.tenantId);
    const { error } = await context.supabase
      .from("professional_time_off")
      .delete()
      .eq("id", data.id)
      .eq("tenant_id", data.tenantId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

async function pub() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

// Public: get barbershop info by slug for the booking page.
export const getPublicTenant = createServerFn({ method: "GET" })
  .inputValidator((d: { slug: string }) => z.object({ slug: z.string() }).parse(d))
  .handler(async ({ data }) => {
    const supabase = await pub();
    const { data: t } = await supabase.from("tenants").select("id,name,subtitle,logo_url,banner_url,slug,primary_color,slot_minutes,whatsapp,pix_key,pix_holder,city").eq("slug", data.slug).eq("status", "active").maybeSingle();
    if (!t) return null;
    const [{ data: pros }, { data: svcs }, { data: settings }] = await Promise.all([
      supabase.from("professionals").select("id,full_name,photo_url,role_label").eq("tenant_id", t.id).eq("active", true).order("full_name"),
      supabase.from("services").select("id,name,price,duration_min,vip_only").eq("tenant_id", t.id).eq("active", true).order("name"),
      supabase.from("tenant_settings").select("*").eq("tenant_id", t.id).maybeSingle(),
    ]);
    return { tenant: t, professionals: pros ?? [], services: svcs ?? [], settings };
  });

// Public: validate VIP subscription by CPF.
export const validateVip = createServerFn({ method: "POST" })
  .inputValidator((d: { tenantId: string; cpf: string }) => z.object({ tenantId: z.string().uuid(), cpf: z.string() }).parse(d))
  .handler(async ({ data }) => {
    const supabase = await pub();
    const cpf = data.cpf.replace(/\D/g, "");
    const { data: sub } = await supabase.from("subscribers").select("id,full_name,plan,status").eq("tenant_id", data.tenantId).eq("cpf", cpf).maybeSingle();
    return sub ?? null;
  });

// Public: get taken time-slots for a pro on a date.
export const getBookedSlots = createServerFn({ method: "POST" })
  .inputValidator((d: { professionalId: string; date: string }) => z.object({ professionalId: z.string().uuid(), date: z.string() }).parse(d))
  .handler(async ({ data }) => {
    const supabase = await pub();
    const start = new Date(data.date + "T00:00:00").toISOString();
    const end = new Date(data.date + "T23:59:59").toISOString();
    const { data: appts } = await supabase.from("appointments").select("start_at,end_at").eq("professional_id", data.professionalId).gte("start_at", start).lte("start_at", end).neq("status", "cancelled");
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

    const [{ data: t }, { data: settings }, { data: svc }] = await Promise.all([
      supabase.from("tenants").select("id,name,whatsapp,slot_minutes").eq("id", data.tenantId).maybeSingle(),
      supabase.from("tenant_settings").select("vip_days,work_days,open_hour,close_hour,lunch_start,lunch_end,vip_mode").eq("tenant_id", data.tenantId).maybeSingle(),
      supabase.from("services").select("id,name,duration_min,price,vip_only").eq("id", data.serviceId).maybeSingle(),
    ]);
    if (!t || !svc) throw new Error("Barbearia ou serviço inválido");

    const start = new Date(data.startAt);
    const end = new Date(start.getTime() + (svc.duration_min ?? t.slot_minutes ?? 30) * 60000);

    const dow = ((start.getUTCDay() + 6) % 7) + 1; // 1=Mon..7=Sun
    const vipDays: number[] = (settings?.vip_days as number[] | null) ?? [1,2,3,4];
    const vipMode = (settings as any)?.vip_mode ?? "strict";
    if (vipMode === "strict" && vipDays.includes(dow) && !data.isVip) {
      throw new Error("Este dia é reservado para assinantes VIP. Escolha outro dia ou torne-se assinante.");
    }




    // Conflict check
    const { data: conflicts } = await supabase.from("appointments").select("id,start_at,end_at").eq("professional_id", data.professionalId).lt("start_at", end.toISOString()).gt("end_at", start.toISOString()).neq("status", "cancelled");
    if (conflicts && conflicts.length > 0) throw new Error("Este horário já está ocupado. Escolha outro.");

    // Upsert client
    const cleanWhatsapp = data.clientWhatsapp.replace(/\D/g, "");
    let { data: existingClient } = await supabase.from("clients").select("id").eq("tenant_id", data.tenantId).eq("whatsapp", cleanWhatsapp).maybeSingle();
    let clientId = existingClient?.id;
    if (!clientId) {
      const { data: newClient, error: errClient } = await supabase.from("clients").insert({
        tenant_id: data.tenantId,
        full_name: data.clientName,
        whatsapp: cleanWhatsapp,
        is_vip: data.isVip
      }).select("id").single();
      if (!errClient && newClient) clientId = newClient.id;
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
    }).select("id").single();
    if (error) throw new Error(error.message);
    return { id: appt.id };
  });

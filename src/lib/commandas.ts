import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

type DbClient = SupabaseClient<Database>;

type CatalogItem = {
  id: string;
  name: string;
  price: number;
  cost_price?: number | null;
};

type Professional = {
  id: string;
  commission_pct?: number | null;
};

export type AppointmentComandaInput = {
  appointmentId: string;
  tenantId: string;
  subscriptionId?: string | null;
  clientId?: string | null;
  clientName: string;
  professionalId: string;
  serviceIds: string[];
  productIds?: string[];
  services: CatalogItem[];
  products?: CatalogItem[];
  professionals?: Professional[];
  scheduledAt: string;
  status?: string | null;
  source: "manual" | "online";
  paymentMethod?: string | null;
};

const appointmentCanceledStatuses = new Set(["cancelled", "canceled", "no_show"]);

export function makeLocalDateTime(date: string, time: string) {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  return new Date(year, month - 1, day, hour, minute, 0, 0);
}

async function nextComandaNumber(db: DbClient, tenantId: string) {
  const { count, error } = await db
    .from("commandas")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId);

  if (error) throw error;
  return (count ?? 0) + 1;
}

function buildComandaItems(input: AppointmentComandaInput, commandaId: string) {
  const professional = input.professionals?.find((p) => p.id === input.professionalId);
  const commissionPct = Number(professional?.commission_pct ?? 0);

  const serviceItems = input.serviceIds
    .map((id) => input.services.find((service) => service.id === id))
    .filter(Boolean)
    .map((service) => {
      const price = Number(service!.price ?? 0);
      return {
        commanda_id: commandaId,
        tenant_id: input.tenantId,
        kind: "service",
        ref_id: service!.id,
        name: service!.name,
        quantity: 1,
        unit_price: price,
        professional_id: input.professionalId || null,
        commission_pct: commissionPct,
        commission_value: (price * commissionPct) / 100,
        commission_status: "pending",
      };
    });

  const productItems = (input.productIds ?? [])
    .map((id) => input.products?.find((product) => product.id === id))
    .filter(Boolean)
    .map((product) => ({
      commanda_id: commandaId,
      tenant_id: input.tenantId,
      kind: "product",
      ref_id: product!.id,
      name: product!.name,
      quantity: 1,
      unit_price: Number(product!.price ?? 0),
      unit_cost: Number(product!.cost_price ?? 0),
      professional_id: null,
      commission_pct: 0,
      commission_value: 0,
      commission_status: "pending",
    }));

  return [...serviceItems, ...productItems];
}

export function appointmentComandaTotal(input: AppointmentComandaInput) {
  const serviceTotal = input.serviceIds.reduce((total, id) => {
    const service = input.services.find((item) => item.id === id);
    return total + Number(service?.price ?? 0);
  }, 0);

  const productTotal = (input.productIds ?? []).reduce((total, id) => {
    const product = input.products?.find((item) => item.id === id);
    return total + Number(product?.price ?? 0);
  }, 0);

  return serviceTotal + productTotal;
}

export async function syncAppointmentComanda(db: DbClient, input: AppointmentComandaInput) {
  const shouldCancel = appointmentCanceledStatuses.has(input.status ?? "");
  const shouldClose = input.status === "completed";
  const total = appointmentComandaTotal(input);

  const { data: existing, error: existingError } = await db
    .from("commandas")
    .select("id, number, status")
    .eq("tenant_id", input.tenantId)
    .eq("appointment_id", input.appointmentId)
    .maybeSingle();

  if (existingError) throw existingError;

  if (shouldCancel) {
    if (existing) {
      const subscriptionUpdate =
        input.subscriptionId === undefined ? {} : { subscription_id: input.subscriptionId };
      const { error } = await db
        .from("commandas")
        .update({
          ...subscriptionUpdate,
          status: "canceled",
          scheduled_at: input.scheduledAt,
          closed_at: null,
          payment_method: null,
          total,
          subtotal: total,
        })
        .eq("id", existing.id);
      if (error) throw error;

      await db
        .from("cash_movements")
        .delete()
        .eq("tenant_id", input.tenantId)
        .eq("description", `Comanda #${existing.number}`);
    }
    return existing ?? null;
  }

  let commanda = existing;
  if (!commanda) {
    const number = await nextComandaNumber(db, input.tenantId);
    const { data: created, error } = await db
      .from("commandas")
      .insert({
        tenant_id: input.tenantId,
        appointment_id: input.appointmentId,
        subscription_id: input.subscriptionId ?? null,
        scheduled_at: input.scheduledAt,
        source: input.source,
        client_id: input.clientId ?? null,
        client_name: input.clientName,
        number,
        status: shouldClose ? "closed" : "open",
        closed_at: shouldClose ? new Date().toISOString() : null,
        payment_method: shouldClose ? (input.paymentMethod ?? null) : null,
        subtotal: total,
        total,
      })
      .select("id, number, status")
      .single();

    if (error) throw error;
    commanda = created;
  } else {
    const subscriptionUpdate =
      input.subscriptionId === undefined ? {} : { subscription_id: input.subscriptionId };
    const { error } = await db
      .from("commandas")
      .update({
        ...subscriptionUpdate,
        scheduled_at: input.scheduledAt,
        source: input.source,
        client_id: input.clientId ?? null,
        client_name: input.clientName,
        status: shouldClose ? "closed" : "open",
        closed_at: shouldClose ? new Date().toISOString() : null,
        payment_method: shouldClose ? (input.paymentMethod ?? null) : null,
        subtotal: total,
        total,
      })
      .eq("id", commanda.id);

    if (error) throw error;
  }

  const { error: deleteError } = await db
    .from("commanda_items")
    .delete()
    .eq("commanda_id", commanda.id);
  if (deleteError) throw deleteError;

  const items = buildComandaItems(input, commanda.id);
  if (items.length > 0) {
    const { error: itemsError } = await db.from("commanda_items").insert(items);
    if (itemsError) throw itemsError;
  }

  const cashDescription = `Comanda #${commanda.number}`;
  const { error: cashDeleteError } = await db
    .from("cash_movements")
    .delete()
    .eq("tenant_id", input.tenantId)
    .eq("description", cashDescription);
  if (cashDeleteError) throw cashDeleteError;

  if (shouldClose && input.paymentMethod !== "vip" && total > 0) {
    const { error: cashInsertError } = await db.from("cash_movements").insert({
      tenant_id: input.tenantId,
      kind: "in",
      amount: total,
      description: cashDescription,
      payment_method: input.paymentMethod ?? null,
      source: "comanda",
      reference_type: "comanda",
      reference_id: commanda.id,
    });
    if (cashInsertError) throw cashInsertError;
  }

  return { ...commanda, status: shouldClose ? "closed" : "open" };
}

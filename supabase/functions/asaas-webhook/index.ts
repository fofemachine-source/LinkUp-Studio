import { createClient } from "https://esm.sh/@supabase/supabase-js@2.110.1";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function environmentKey(jsonName: string, legacyNames: string[]): string | undefined {
  const keySet = Deno.env.get(jsonName);
  if (keySet) {
    try {
      const parsed = JSON.parse(keySet) as Record<string, string>;
      if (parsed.default) return parsed.default;
      const first = Object.values(parsed).find(Boolean);
      if (first) return first;
    } catch {
      // Continue with legacy variable names.
    }
  }
  for (const name of legacyNames) {
    const value = Deno.env.get(name);
    if (value) return value;
  }
  return undefined;
}

function text(value: unknown, maxLength: number) {
  return String(value ?? "")
    .trim()
    .slice(0, maxLength);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function safeSecretMatch(candidate: unknown, expected: string) {
  const left = String(candidate ?? "");
  const right = String(expected ?? "");
  if (!left || !right) return false;
  const leftBytes = new TextEncoder().encode(left);
  const rightBytes = new TextEncoder().encode(right);
  if (leftBytes.length !== rightBytes.length) return false;
  let difference = 0;
  for (let index = 0; index < leftBytes.length; index += 1) {
    difference |= leftBytes[index] ^ rightBytes[index];
  }
  return difference === 0;
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return json({ received: false }, 405);

  const receivedToken = request.headers.get("asaas-access-token") || "";

  try {
    const contentLength = Number(request.headers.get("content-length") || 0);
    if (Number.isFinite(contentLength) && contentLength > 1_000_000) {
      return json({ received: false }, 413);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = environmentKey("SUPABASE_SECRET_KEYS", [
      "SUPABASE_SERVICE_ROLE_KEY",
      "SUPABASE_SECRET_KEY",
    ]);
    if (!supabaseUrl || !serviceRoleKey) {
      console.error("[asaas-webhook] backend credentials unavailable");
      return json({ received: false }, 500);
    }
    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const sandboxToken = Deno.env.get("ASAAS_SANDBOX_WEBHOOK_TOKEN") || "";
    const productionToken = Deno.env.get("ASAAS_PRODUCTION_WEBHOOK_TOKEN") || "";
    const fallbackToken = Deno.env.get("ASAAS_WEBHOOK_TOKEN") || "";
    if (sandboxToken && productionToken && safeSecretMatch(sandboxToken, productionToken)) {
      console.error("[asaas-webhook] sandbox and production tokens must be different");
      return json({ received: false }, 503);
    }
    let environment: "sandbox" | "production" | null = null;
    if (sandboxToken && safeSecretMatch(receivedToken, sandboxToken)) environment = "sandbox";
    if (productionToken && safeSecretMatch(receivedToken, productionToken)) {
      environment = "production";
    }
    if (!environment && fallbackToken && safeSecretMatch(receivedToken, fallbackToken)) {
      const { data: settings } = await admin
        .from("platform_billing_settings")
        .select("environment")
        .eq("id", "global")
        .maybeSingle();
      environment = text(settings?.environment, 20) === "production" ? "production" : "sandbox";
    }
    if (!environment) return json({ received: false }, 401);

    const decoded: unknown = await request.json();
    if (!isRecord(decoded)) return json({ received: true, ignored: true });
    const eventId = text(decoded.id, 200);
    const eventType = text(decoded.event, 120).toUpperCase();
    const payment = isRecord(decoded.payment) ? decoded.payment : {};
    const paymentId = text(payment.id, 120);
    const externalReference = text(payment.externalReference ?? payment.external_reference, 400);
    if (!eventId || !eventType.startsWith("PAYMENT_")) {
      return json({ received: true, ignored: true });
    }

    const providerCreatedAt = text(decoded.dateCreated ?? payment.dateCreated, 100) || null;
    const { data: ingested, error: ingestError } = await admin.rpc(
      "ingest_platform_billing_webhook_event",
      {
        p_environment: environment,
        p_event_id: eventId,
        p_event_type: eventType,
        p_payment_id: paymentId || null,
        p_external_reference: externalReference || null,
        p_provider_created_at: providerCreatedAt,
        p_payload: decoded,
      },
    );
    if (ingestError) throw ingestError;

    // Acknowledge only after durable ingestion. The worker applies the event.
    return json({
      received: true,
      accepted: Boolean(ingested?.accepted),
      duplicate: Boolean(ingested?.duplicate),
    });
  } catch (error) {
    console.error(
      "[asaas-webhook] ingestion failed",
      error instanceof Error ? error.message : "unknown error",
    );
    // Non-2xx asks Asaas to retry; no financial state was changed here.
    return json({ received: false }, 500);
  }
});

import { supabase } from "@/integrations/supabase/client";
import { dynamicSupabase } from "@/lib/supabase-dynamic";

type PushPublicKeyResponse = {
  ok?: boolean;
  configured?: boolean;
  publicKey?: string | null;
  error?: string;
};

export type AppointmentPushStatus =
  "subscribed" | "unsupported" | "denied" | "missing-vapid" | "failed";

export type AppointmentPushResult = {
  ok: boolean;
  status: AppointmentPushStatus;
  message: string;
};

function base64UrlToUint8Array(base64Url: string) {
  const padding = "=".repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i);
  }

  return outputArray;
}

function arrayBuffersAreEqual(left: ArrayBuffer | null, right: Uint8Array) {
  if (!left) return false;
  const leftArray = new Uint8Array(left);
  if (leftArray.length !== right.length) return false;

  for (let index = 0; index < leftArray.length; index += 1) {
    if (leftArray[index] !== right[index]) return false;
  }

  return true;
}

export function canUseAppointmentPush() {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window &&
    window.isSecureContext
  );
}

async function getPushPublicKey() {
  const { data, error } = await supabase.functions.invoke<PushPublicKeyResponse>(
    "appointment-push",
    {
      body: { action: "public-key" },
    },
  );

  if (error) throw error;
  if (!data?.configured || !data.publicKey) return null;
  return data.publicKey;
}

export async function ensureAppointmentPushSubscription(params: {
  tenantId: string;
  userId: string;
}): Promise<AppointmentPushResult> {
  if (!canUseAppointmentPush()) {
    return {
      ok: false,
      status: "unsupported",
      message: "Este navegador ainda não suporta Push seguro neste contexto.",
    };
  }

  const permission =
    Notification.permission === "granted" ? "granted" : await Notification.requestPermission();

  if (permission !== "granted") {
    return {
      ok: false,
      status: "denied",
      message: "Permissão de notificação não autorizada neste dispositivo.",
    };
  }

  const publicKey = await getPushPublicKey();
  if (!publicKey) {
    return {
      ok: false,
      status: "missing-vapid",
      message: "As chaves Push ainda não estão configuradas no Lovable.",
    };
  }

  const applicationServerKey = base64UrlToUint8Array(publicKey);
  const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  registration.update().catch(() => undefined);

  const readyRegistration = await navigator.serviceWorker.ready;
  const activeRegistration = readyRegistration || registration;

  let subscription = await activeRegistration.pushManager.getSubscription();
  if (
    subscription &&
    !arrayBuffersAreEqual(subscription.options.applicationServerKey, applicationServerKey)
  ) {
    await subscription.unsubscribe();
    subscription = null;
  }

  if (!subscription) {
    subscription = await activeRegistration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey,
    });
  }

  const endpoint = subscription.endpoint;
  const serialized = subscription.toJSON();

  const { error } = await dynamicSupabase.from<unknown>("push_subscriptions").upsert(
    {
      tenant_id: params.tenantId,
      user_id: params.userId,
      endpoint,
      subscription: serialized,
      user_agent: navigator.userAgent,
      platform: navigator.platform,
      enabled: true,
      last_seen_at: new Date().toISOString(),
    },
    { onConflict: "endpoint" },
  );

  if (error) throw error;

  return {
    ok: true,
    status: "subscribed",
    message: "Notificações deste dispositivo ativadas.",
  };
}

export async function getCurrentAppointmentPushPermission() {
  if (!canUseAppointmentPush()) return "unsupported";
  return Notification.permission;
}

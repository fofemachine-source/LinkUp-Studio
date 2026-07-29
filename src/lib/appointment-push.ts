import { supabase } from "@/integrations/supabase/client";

type PushPublicKeyResponse = {
  ok?: boolean;
  configured?: boolean;
  publicKey?: string | null;
  error?: string;
};

export type AppointmentPushStatus =
  | "subscribed"
  | "unsupported"
  | "denied"
  | "permission-required"
  | "missing-vapid"
  | "failed";

export type AppointmentPushResult = {
  ok: boolean;
  status: AppointmentPushStatus;
  message: string;
};

type EnsureAppointmentPushOptions = {
  promptForPermission?: boolean;
  rememberDevice?: boolean;
};

const PUSH_ENABLED_STORAGE_PREFIX = "linkup:appointment-push-enabled";

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

function preferenceKey(params: { tenantId: string; userId: string }) {
  return `${PUSH_ENABLED_STORAGE_PREFIX}:${params.tenantId}:${params.userId}`;
}

export function hasStoredAppointmentPushPreference(params: { tenantId: string; userId: string }) {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(preferenceKey(params)) === "true";
}

function rememberAppointmentPushPreference(params: { tenantId: string; userId: string }) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(preferenceKey(params), "true");
}

function forgetAppointmentPushPreference(params: { tenantId: string; userId: string }) {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(preferenceKey(params));
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
  options?: EnsureAppointmentPushOptions;
}): Promise<AppointmentPushResult> {
  const shouldPrompt = params.options?.promptForPermission !== false;
  const shouldRemember = params.options?.rememberDevice !== false;

  if (!canUseAppointmentPush()) {
    return {
      ok: false,
      status: "unsupported",
      message: "Este navegador ainda não suporta Push seguro neste contexto.",
    };
  }

  const permission =
    Notification.permission === "granted"
      ? "granted"
      : shouldPrompt
        ? await Notification.requestPermission()
        : Notification.permission;

  if (permission !== "granted") {
    if (permission === "default") {
      return {
        ok: false,
        status: "permission-required",
        message: "Ative as notificacoes neste dispositivo para receber avisos com o app fechado.",
      };
    }

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

  const { error } = await (supabase as any).rpc("register_appointment_push_subscription", {
    p_tenant_id: params.tenantId,
    p_endpoint: endpoint,
    p_subscription: serialized,
    p_user_agent: navigator.userAgent,
    p_platform: navigator.platform,
  });

  if (error) {
    forgetAppointmentPushPreference(params);
    console.error("[LinkUp Studio] Falha ao salvar dispositivo para notificações.", error);
    return {
      ok: false,
      status: "failed",
      message:
        "Não foi possível ativar as notificações neste dispositivo. Atualize a página e tente novamente.",
    };
  }

  if (shouldRemember) rememberAppointmentPushPreference(params);

  return {
    ok: true,
    status: "subscribed",
    message: "Notificações deste dispositivo ativadas.",
  };
}

export async function refreshAppointmentPushSubscription(params: {
  tenantId: string;
  userId: string;
}) {
  if (!canUseAppointmentPush() || Notification.permission !== "granted") {
    return {
      ok: false,
      status: "permission-required" as const,
      message: "Este dispositivo ainda nao autorizou Push.",
    };
  }

  const result = await ensureAppointmentPushSubscription({
    ...params,
    options: {
      promptForPermission: false,
      rememberDevice: false,
    },
  });

  if (!result.ok) forgetAppointmentPushPreference(params);
  return result;
}

export async function getCurrentAppointmentPushPermission() {
  if (!canUseAppointmentPush()) return "unsupported";
  return Notification.permission;
}

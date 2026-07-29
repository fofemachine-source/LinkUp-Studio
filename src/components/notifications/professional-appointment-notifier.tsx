import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import {
  BellRing,
  CalendarCheck2,
  Clock3,
  Scissors,
  UserRound,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useTenantAccess } from "@/hooks/use-tenant";
import { supabase } from "@/integrations/supabase/client";
import { ensureAppointmentPushSubscription } from "@/lib/appointment-push";
import { dynamicSupabase } from "@/lib/supabase-dynamic";
import { getTenantOperationalSettings } from "@/lib/tenant-operational-settings";

const NOTIFICATION_SOUND_URL = "/sounds/new-appointment.wav";
const SOUND_READY_STORAGE_KEY = "linkup:new-appointment-sound-ready";
const RECENT_ALERT_WINDOW_MS = 2 * 60 * 1000;
const APPOINTMENT_ALERT_QUERY_PARAM = "appointmentAlert";
const APPOINTMENT_NOTIFICATION_SELECT =
  "id, recipient_user_id, appointment_id, kind, title, body, data, acknowledged_at, created_at";

type AppointmentNotificationData = {
  appointmentId?: string;
  professionalName?: string;
  serviceName?: string;
  clientName?: string;
  startAt?: string;
  recipientKind?: "professional" | "owner" | "reception";
  url?: string;
};

type AppointmentNotificationRow = {
  id: string;
  recipient_user_id: string;
  appointment_id: string | null;
  kind: string;
  title: string;
  body: string;
  data: AppointmentNotificationData | null;
  acknowledged_at: string | null;
  created_at: string;
};

type AppointmentAlert = {
  notificationId: string;
  appointmentId: string | null;
  clientName: string;
  serviceName: string;
  dateLabel: string;
  timeLabel: string;
  professionalName: string;
  audienceLabel: string;
};

type AppointmentAlertSettings = {
  appointment_alert_repeat_seconds?: number | null;
};

function formatAppointmentDate(value: string | undefined) {
  if (!value) return "Data não informada";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Data não informada";

  return new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

function formatAppointmentTime(value: string | undefined) {
  if (!value) return "--:--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--:--";

  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function getStoredSoundReady() {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(SOUND_READY_STORAGE_KEY) === "true";
}

async function playNotificationSound() {
  const audio = new Audio(NOTIFICATION_SOUND_URL);
  audio.volume = 1;
  audio.currentTime = 0;
  await audio.play();
}

function clampRepeatSeconds(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 20;
  return Math.min(300, Math.max(5, Math.round(parsed)));
}

function buildAlert(notification: AppointmentNotificationRow): AppointmentAlert {
  const data = notification.data ?? {};
  const professionalName = data.professionalName?.trim() || "Profissional";

  let audienceLabel = `Nova reserva para ${professionalName}`;
  if (data.recipientKind === "professional") audienceLabel = "Chegou uma reserva para você";
  if (data.recipientKind === "owner") audienceLabel = `Nova reserva na agenda de ${professionalName}`;

  return {
    notificationId: notification.id,
    appointmentId: notification.appointment_id,
    clientName: data.clientName?.trim() || "Cliente não informado",
    serviceName: data.serviceName?.trim() || "Serviço agendado",
    dateLabel: formatAppointmentDate(data.startAt),
    timeLabel: formatAppointmentTime(data.startAt),
    professionalName,
    audienceLabel,
  };
}

export function ProfessionalAppointmentNotifier() {
  const tenantAccessQuery = useTenantAccess();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const access = tenantAccessQuery.data;
  const tenantId = access?.activeTenantId ?? access?.tenant?.id ?? null;
  const userId = access?.userId ?? null;
  const seenNotifications = useRef<Set<string>>(new Set());
  const [latestAlert, setLatestAlert] = useState<AppointmentAlert | null>(null);
  const [soundReady, setSoundReady] = useState(getStoredSoundReady);
  const [soundBlocked, setSoundBlocked] = useState(false);

  const { data: alertSettings = null } = useQuery({
    queryKey: ["appointment-alert-settings", tenantId],
    enabled: Boolean(tenantId),
    staleTime: 60 * 1000,
    queryFn: async () => {
      const data = await getTenantOperationalSettings(tenantId!);
      return (data ?? null) as AppointmentAlertSettings | null;
    },
  });

  const repeatSeconds = clampRepeatSeconds(alertSettings?.appointment_alert_repeat_seconds);
  const canReceiveAppointmentAlerts = Boolean(tenantId && userId);

  const enableSound = useCallback(async () => {
    if (!tenantId || !userId) return;

    try {
      await playNotificationSound();
      window.localStorage.setItem(SOUND_READY_STORAGE_KEY, "true");
      setSoundReady(true);
      setSoundBlocked(false);

      try {
        const pushResult = await ensureAppointmentPushSubscription({ tenantId, userId });
        if (pushResult.ok) {
          toast.success("Som e notificações deste dispositivo ativados.");
        } else if (pushResult.status === "missing-vapid") {
          toast.warning(
            "Som ativado. O Push com o aplicativo fechado precisa das chaves VAPID.",
          );
        } else if (pushResult.status === "denied") {
          toast.warning("Som ativado. O navegador não autorizou notificações visuais.");
        } else {
          toast.warning("Som ativado. Push indisponível neste dispositivo.");
        }
      } catch (pushError) {
        console.warn("Não foi possível registrar Push neste dispositivo.", pushError);
        toast.warning("Som ativado. Push não foi registrado neste dispositivo.");
      }
    } catch (error) {
      console.error("Não foi possível ativar o som de agendamentos.", error);
      setSoundReady(false);
      setSoundBlocked(true);
      toast.error("O navegador bloqueou o som. Clique novamente em Ativar alertas.");
    }
  }, [tenantId, userId]);

  const openAgenda = useCallback(() => {
    navigate({ to: "/app/agenda" });
  }, [navigate]);

  const acknowledgeAlert = useCallback(() => {
    if (!latestAlert || !userId) return;

    const notificationId = latestAlert.notificationId;
    setLatestAlert(null);
    void dynamicSupabase
      .from<unknown>("app_notifications")
      .update({ acknowledged_at: new Date().toISOString(), read_at: new Date().toISOString() })
      .eq("recipient_user_id", userId)
      .eq("id", notificationId)
      .then(() => {
        queryClient.invalidateQueries({ queryKey: ["app-notifications"] });
      });
  }, [latestAlert, queryClient, userId]);

  const notifyAppointment = useCallback(
    (notification: AppointmentNotificationRow, options?: { force?: boolean }) => {
      if (!notification?.id) return;
      if (!options?.force && seenNotifications.current.has(notification.id)) return;

      seenNotifications.current.add(notification.id);
      if (seenNotifications.current.size > 120) {
        const [first] = seenNotifications.current;
        if (first) seenNotifications.current.delete(first);
      }

      queryClient.invalidateQueries({ queryKey: ["appts"] });
      queryClient.invalidateQueries({ queryKey: ["agenda-commandas"] });
      queryClient.invalidateQueries({ queryKey: ["pos-commandas"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-command-center"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-options"] });
      queryClient.invalidateQueries({ queryKey: ["app-notifications"] });

      playNotificationSound()
        .then(() => {
          window.localStorage.setItem(SOUND_READY_STORAGE_KEY, "true");
          setSoundReady(true);
          setSoundBlocked(false);
        })
        .catch((error) => {
          console.warn("Som bloqueado pelo navegador até uma interação do usuário.", error);
          window.localStorage.removeItem(SOUND_READY_STORAGE_KEY);
          setSoundReady(false);
          setSoundBlocked(true);
        });

      const alert = buildAlert(notification);
      setLatestAlert(alert);

      toast.success("Novo agendamento", {
        description: `${alert.clientName} · ${alert.serviceName} · ${alert.timeLabel}`,
        duration: 15000,
        action: {
          label: "Abrir agenda",
          onClick: openAgenda,
        },
      });
    },
    [openAgenda, queryClient],
  );

  const showAppointmentAlertByNotificationId = useCallback(
    async (notificationId: string | null | undefined) => {
      const id = notificationId?.trim();
      if (!tenantId || !userId || !id) return;

      const { data, error } = await dynamicSupabase
        .from<AppointmentNotificationRow[]>("app_notifications")
        .select(APPOINTMENT_NOTIFICATION_SELECT)
        .eq("tenant_id", tenantId)
        .eq("recipient_user_id", userId)
        .eq("id", id)
        .eq("kind", "appointment_created")
        .maybeSingle();

      if (error || !data) return;
      notifyAppointment(data as AppointmentNotificationRow, { force: true });
    },
    [notifyAppointment, tenantId, userId],
  );

  useEffect(() => {
    if (!latestAlert || !soundReady) return;

    const interval = window.setInterval(() => {
      playNotificationSound().catch((error) => {
        console.warn("Repetição do alerta sonoro bloqueada.", error);
        window.localStorage.removeItem(SOUND_READY_STORAGE_KEY);
        setSoundReady(false);
        setSoundBlocked(true);
      });
    }, repeatSeconds * 1000);

    return () => window.clearInterval(interval);
  }, [latestAlert, repeatSeconds, soundReady]);

  useEffect(() => {
    if (!tenantId || !userId) return;

    let active = true;
    const recentSince = new Date(Date.now() - RECENT_ALERT_WINDOW_MS).toISOString();

    void dynamicSupabase
      .from<AppointmentNotificationRow[]>("app_notifications")
      .select(APPOINTMENT_NOTIFICATION_SELECT)
      .eq("tenant_id", tenantId)
      .eq("recipient_user_id", userId)
      .eq("kind", "appointment_created")
      .is("acknowledged_at", null)
      .gte("created_at", recentSince)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!active || error || !data) return;
        notifyAppointment(data as AppointmentNotificationRow);
      });

    const channel = supabase
      .channel(`app-notification-alerts-${tenantId}-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "app_notifications",
          filter: `recipient_user_id=eq.${userId}`,
        },
        (payload) => {
          const notification = payload.new as AppointmentNotificationRow;
          if (notification?.kind !== "appointment_created") return;
          notifyAppointment(notification);
        },
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [notifyAppointment, tenantId, userId]);

  useEffect(() => {
    if (!tenantId || !userId || typeof window === "undefined") return;

    const params = new URLSearchParams(window.location.search);
    const notificationId = params.get(APPOINTMENT_ALERT_QUERY_PARAM);
    if (!notificationId) return;

    void showAppointmentAlertByNotificationId(notificationId).finally(() => {
      const nextParams = new URLSearchParams(window.location.search);
      nextParams.delete(APPOINTMENT_ALERT_QUERY_PARAM);
      nextParams.delete("appointmentId");
      const nextSearch = nextParams.toString();
      const nextUrl = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ""}${window.location.hash}`;
      window.history.replaceState(window.history.state, "", nextUrl);
    });
  }, [showAppointmentAlertByNotificationId, tenantId, userId]);

  useEffect(() => {
    if (!tenantId || !userId || typeof navigator === "undefined" || !navigator.serviceWorker) {
      return;
    }

    const onServiceWorkerMessage = (event: MessageEvent) => {
      const message = event.data;
      if (
        message?.source !== "linkup-service-worker" ||
        message?.type !== "LINKUP_APPOINTMENT_PUSH_CLICK"
      ) {
        return;
      }

      const notificationId = message.notification?.notificationId || message.notification?.id;
      void showAppointmentAlertByNotificationId(notificationId);
    };

    navigator.serviceWorker.addEventListener("message", onServiceWorkerMessage);
    return () => navigator.serviceWorker.removeEventListener("message", onServiceWorkerMessage);
  }, [showAppointmentAlertByNotificationId, tenantId, userId]);

  const shouldShowSoundActivator =
    canReceiveAppointmentAlerts && (!soundReady || soundBlocked);

  if (!canReceiveAppointmentAlerts) return null;

  return (
    <>
      {shouldShowSoundActivator ? (
        <div className="fixed bottom-24 right-4 z-[70] max-w-[calc(100vw-2rem)] rounded-2xl border border-amber-200 bg-white/95 p-3 shadow-2xl backdrop-blur md:bottom-6 md:right-6 md:w-80">
          <div className="flex items-start gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-100 text-amber-700">
              <VolumeX className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-slate-950">
                Ative alertas de novos agendamentos
              </p>
              <p className="mt-1 text-xs leading-relaxed text-slate-600">
                Um clique libera o som e prepara este dispositivo para receber avisos mesmo com o
                PWA em segundo plano.
              </p>
              <Button
                size="sm"
                className="mt-3 w-full bg-amber-500 text-slate-950 hover:bg-amber-400"
                onClick={enableSound}
              >
                <Volume2 className="mr-2 h-4 w-4" />
                Ativar alertas
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {latestAlert ? (
        <div className="fixed right-4 top-20 z-[80] max-w-[calc(100vw-2rem)] overflow-hidden rounded-3xl border border-amber-300/60 bg-slate-950 text-white shadow-2xl md:right-6 md:w-[390px]">
          <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-amber-300 via-amber-500 to-orange-500" />
          <div className="p-5">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-amber-500 text-slate-950 shadow-lg shadow-amber-500/30">
                  <BellRing className="h-5 w-5 animate-pulse" />
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-amber-300">
                    Novo agendamento
                  </p>
                  <h3 className="mt-1 text-lg font-bold leading-tight">
                    {latestAlert.audienceLabel}
                  </h3>
                  <p className="mt-1 text-xs text-slate-400">
                    O alerta repete a cada {repeatSeconds} segundos até alguém confirmar.
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="rounded-full p-1 text-slate-400 transition hover:bg-white/10 hover:text-white"
                onClick={acknowledgeAlert}
                aria-label="Fechar notificação"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-5 grid gap-3 rounded-2xl border border-white/10 bg-white/[0.06] p-4 text-sm">
              <div className="flex items-center gap-3">
                <UserRound className="h-4 w-4 text-amber-300" />
                <span className="text-slate-300">Cliente:</span>
                <strong className="ml-auto text-right text-white">{latestAlert.clientName}</strong>
              </div>
              <div className="flex items-center gap-3">
                <Scissors className="h-4 w-4 text-amber-300" />
                <span className="text-slate-300">Serviço:</span>
                <strong className="ml-auto text-right text-white">{latestAlert.serviceName}</strong>
              </div>
              <div className="flex items-center gap-3">
                <UserRound className="h-4 w-4 text-amber-300" />
                <span className="text-slate-300">Profissional:</span>
                <strong className="ml-auto text-right text-white">
                  {latestAlert.professionalName}
                </strong>
              </div>
              <div className="flex items-center gap-3">
                <CalendarCheck2 className="h-4 w-4 text-amber-300" />
                <span className="text-slate-300">Data:</span>
                <strong className="ml-auto text-right text-white">{latestAlert.dateLabel}</strong>
              </div>
              <div className="flex items-center gap-3">
                <Clock3 className="h-4 w-4 text-amber-300" />
                <span className="text-slate-300">Horário:</span>
                <strong className="ml-auto text-right text-white">{latestAlert.timeLabel}</strong>
              </div>
            </div>

            <div className="mt-5 flex gap-3">
              <Button
                className="flex-1 bg-amber-500 text-slate-950 hover:bg-amber-400"
                onClick={openAgenda}
              >
                Abrir agenda
              </Button>
              <Button
                variant="outline"
                className="border-white/15 bg-white/5 text-white hover:bg-white/10 hover:text-white"
                onClick={acknowledgeAlert}
              >
                Ok
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

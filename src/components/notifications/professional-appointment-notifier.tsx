import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

const NOTIFICATION_SOUND_URL = "/sounds/new-appointment.wav";
const SOUND_READY_STORAGE_KEY = "linkup:new-appointment-sound-ready";

type CurrentProfessional = {
  id: string;
  full_name: string;
  tenant_id: string;
  auth_user_id: string | null;
  active: boolean | null;
};

type AppointmentRealtimePayload = {
  id: string;
  tenant_id: string;
  professional_id: string;
  service_id: string | null;
  client_name: string | null;
  client_whatsapp: string | null;
  start_at: string;
  end_at: string;
  status: string | null;
  source: string | null;
};

type AppointmentAlert = {
  id: string;
  clientName: string;
  serviceName: string;
  dateLabel: string;
  timeLabel: string;
  professionalName: string;
  audienceLabel: string;
};

type AppointmentAlertSettings = {
  appointment_alert_repeat_seconds?: number | null;
  appointment_reception_alerts_enabled?: boolean | null;
};

function formatAppointmentDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Data não informada";

  return new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

function formatAppointmentTime(value: string) {
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

function isCancelledStatus(status: string | null | undefined) {
  return ["cancelled", "canceled", "cancelado"].includes(String(status ?? "").toLowerCase());
}

export function ProfessionalAppointmentNotifier() {
  const tenantAccessQuery = useTenantAccess();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const access = tenantAccessQuery.data;
  const tenantId = access?.activeTenantId ?? access?.tenant?.id ?? null;
  const userId = access?.userId ?? null;
  const tenantRoles = useMemo(
    () =>
      (access?.roles ?? []).filter((role) => role.tenant_id === tenantId).map((role) => role.role),
    [access?.roles, tenantId],
  );
  const isReceptionUser = tenantRoles.includes("owner") || tenantRoles.includes("staff");
  const seenAppointments = useRef<Set<string>>(new Set());
  const [latestAlert, setLatestAlert] = useState<AppointmentAlert | null>(null);
  const [soundReady, setSoundReady] = useState(getStoredSoundReady);
  const [soundBlocked, setSoundBlocked] = useState(false);

  const { data: currentProfessional = null } = useQuery({
    queryKey: ["current-professional-profile-for-alerts", tenantId, userId],
    enabled: Boolean(tenantId && userId),
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("professionals")
        .select("id, full_name, tenant_id, auth_user_id, active")
        .eq("tenant_id", tenantId!)
        .eq("auth_user_id", userId!)
        .order("created_at", { ascending: false })
        .limit(5);

      if (error) throw error;

      const rows = (data ?? []) as CurrentProfessional[];
      return rows.find((professional) => professional.active !== false) ?? rows[0] ?? null;
    },
  });

  const { data: alertSettings = null } = useQuery({
    queryKey: ["appointment-alert-settings", tenantId],
    enabled: Boolean(tenantId),
    staleTime: 60 * 1000,
    queryFn: async () => {
      const { data, error } = await dynamicSupabase
        .from<AppointmentAlertSettings>("tenant_settings")
        .select("appointment_alert_repeat_seconds, appointment_reception_alerts_enabled")
        .eq("tenant_id", tenantId)
        .maybeSingle();

      if (error) throw error;
      return (data ?? null) as AppointmentAlertSettings | null;
    },
  });

  const repeatSeconds = clampRepeatSeconds(alertSettings?.appointment_alert_repeat_seconds);
  const receptionAlertsEnabled = alertSettings?.appointment_reception_alerts_enabled !== false;
  const isProfessionalRecipient = Boolean(currentProfessional?.id);
  const canReceiveAppointmentAlerts =
    Boolean(tenantId && userId) &&
    (isProfessionalRecipient || (isReceptionUser && receptionAlertsEnabled));

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
            "Som ativado. O Push com navegador fechado precisa das chaves VAPID no Lovable.",
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
      toast.error("O navegador bloqueou o som. Clique novamente em Ativar som.");
    }
  }, [tenantId, userId]);

  const openAgenda = useCallback(() => {
    navigate({ to: "/app/agenda" });
  }, [navigate]);

  const acknowledgeAlert = useCallback(() => {
    setLatestAlert(null);
    if (userId) {
      void dynamicSupabase
        .from<unknown>("app_notifications")
        .update({ acknowledged_at: new Date().toISOString(), read_at: new Date().toISOString() })
        .eq("recipient_user_id", userId)
        .eq("appointment_id", latestAlert?.id ?? "");
    }
  }, [latestAlert?.id, userId]);

  const buildAlert = useCallback(
    async (
      appointment: AppointmentRealtimePayload,
      audience: "professional" | "reception",
    ): Promise<AppointmentAlert> => {
      let serviceName = "Serviço agendado";
      let professionalName = currentProfessional?.full_name ?? "Profissional";

      const [serviceResult, professionalResult] = await Promise.all([
        appointment.service_id
          ? supabase
              .from("services")
              .select("name")
              .eq("tenant_id", appointment.tenant_id)
              .eq("id", appointment.service_id)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null }),
        supabase
          .from("professionals")
          .select("full_name")
          .eq("tenant_id", appointment.tenant_id)
          .eq("id", appointment.professional_id)
          .maybeSingle(),
      ]);

      if (!serviceResult.error && serviceResult.data?.name) serviceName = serviceResult.data.name;
      if (!professionalResult.error && professionalResult.data?.full_name) {
        professionalName = professionalResult.data.full_name;
      }

      return {
        id: appointment.id,
        clientName: appointment.client_name?.trim() || "Cliente não informado",
        serviceName,
        dateLabel: formatAppointmentDate(appointment.start_at),
        timeLabel: formatAppointmentTime(appointment.start_at),
        professionalName,
        audienceLabel:
          audience === "professional"
            ? "Chegou uma reserva para você"
            : `Nova reserva para ${professionalName}`,
      };
    },
    [currentProfessional?.full_name],
  );

  const notifyAppointment = useCallback(
    async (appointment: AppointmentRealtimePayload, audience: "professional" | "reception") => {
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

      const alert = await buildAlert(appointment, audience);
      setLatestAlert(alert);

      toast.success("Novo agendamento", {
        description: `${alert.clientName} · ${alert.serviceName} · ${alert.timeLabel}`,
        duration: 15000,
        action: {
          label: "Abrir agenda",
          onClick: openAgenda,
        },
      });

      if (
        typeof window !== "undefined" &&
        "Notification" in window &&
        Notification.permission === "granted"
      ) {
        new Notification("Novo agendamento no LinkUp Studio", {
          body: `${alert.clientName} às ${alert.timeLabel} · ${alert.serviceName}`,
          tag: `appointment-${appointment.id}`,
          requireInteraction: true,
        });
      }
    },
    [buildAlert, openAgenda, queryClient],
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
    if (!tenantId || !canReceiveAppointmentAlerts) return;

    const channel = supabase
      .channel(`appointment-alerts-${tenantId}-${userId ?? "anonymous"}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "appointments",
          filter: `tenant_id=eq.${tenantId}`,
        },
        (payload) => {
          const appointment = payload.new as AppointmentRealtimePayload;
          if (!appointment?.id) return;
          if (isCancelledStatus(appointment.status)) return;
          if (seenAppointments.current.has(appointment.id)) return;

          const professionalMatch =
            Boolean(currentProfessional?.id) &&
            appointment.professional_id === currentProfessional?.id;
          const receptionMatch = isReceptionUser && receptionAlertsEnabled;

          if (!professionalMatch && !receptionMatch) return;

          seenAppointments.current.add(appointment.id);
          if (seenAppointments.current.size > 120) {
            const [first] = seenAppointments.current;
            if (first) seenAppointments.current.delete(first);
          }

          void notifyAppointment(appointment, professionalMatch ? "professional" : "reception");
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [
    canReceiveAppointmentAlerts,
    currentProfessional?.id,
    isReceptionUser,
    notifyAppointment,
    receptionAlertsEnabled,
    tenantId,
    userId,
  ]);

  const shouldShowSoundActivator = useMemo(
    () => canReceiveAppointmentAlerts && (!soundReady || soundBlocked),
    [canReceiveAppointmentAlerts, soundBlocked, soundReady],
  );

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
                Um clique libera som no volume máximo e prepara este dispositivo para receber
                avisos.
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
                    O alerta repete a cada {repeatSeconds}s até alguém confirmar.
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

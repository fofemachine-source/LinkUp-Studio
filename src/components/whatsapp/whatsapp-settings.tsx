import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  CheckCircle2,
  Clock3,
  History,
  Loader2,
  MessageCircle,
  Phone,
  Plug,
  QrCode as QrCodeIcon,
  RefreshCw,
  RotateCcw,
  Save,
  Send,
  Smartphone,
  Unplug,
  UserPlus,
  UserRound,
  Users,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { QrCode } from "@/lib/qr";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";

type ConnectorAction = "save" | "status" | "connect" | "disconnect" | "send-test" | "retry-message";

type ConnectionStatus =
  | "not_connected"
  | "connecting"
  | "qr"
  | "connected"
  | "disconnected"
  | "logged_out"
  | "connector_error";

type WhatsAppSettingsRow = {
  tenant_id: string;
  enabled: boolean;
  session_id: string;
  responsible_whatsapp: string | null;
  connection_status: ConnectionStatus;
  connected_phone: string | null;
  last_connection_error: string | null;
  last_status_at: string | null;
  notify_client_registration: boolean;
  notify_client_booking: boolean;
  notify_professional_booking: boolean;
  notify_client_cancellation: boolean;
  notify_professional_cancellation: boolean;
  notify_client_reschedule: boolean;
  notify_professional_reschedule: boolean;
  reminder_enabled: boolean;
  reminder_minutes_before: number;
  client_registration_template: string;
  client_booking_template: string;
  professional_booking_template: string;
  client_reminder_template: string;
  client_cancellation_template: string;
  professional_cancellation_template: string;
  client_reschedule_template: string;
  professional_reschedule_template: string;
  updated_at?: string;
};

type WhatsAppForm = Pick<
  WhatsAppSettingsRow,
  | "enabled"
  | "responsible_whatsapp"
  | "notify_client_registration"
  | "notify_client_booking"
  | "notify_professional_booking"
  | "notify_client_cancellation"
  | "notify_professional_cancellation"
  | "notify_client_reschedule"
  | "notify_professional_reschedule"
  | "reminder_enabled"
  | "reminder_minutes_before"
  | "client_registration_template"
  | "client_booking_template"
  | "professional_booking_template"
  | "client_reminder_template"
  | "client_cancellation_template"
  | "professional_cancellation_template"
  | "client_reschedule_template"
  | "professional_reschedule_template"
>;

type QueueRow = {
  id: string;
  event_type: string;
  recipient_kind: string;
  recipient_name: string | null;
  recipient_phone: string;
  rendered_message: string | null;
  status: "pending" | "processing" | "sent" | "failed" | "cancelled";
  scheduled_for: string;
  attempts: number;
  max_attempts: number;
  sent_at: string | null;
  last_error: string | null;
  created_at: string;
};

type ConnectorResult = {
  ok?: boolean;
  error?: string;
  status?: ConnectionStatus;
  connected?: boolean;
  phone?: string;
  settings?: WhatsAppSettingsRow;
  data?: Record<string, unknown>;
  [key: string]: unknown;
};

const defaultForm: WhatsAppForm = {
  enabled: false,
  responsible_whatsapp: "",
  notify_client_registration: true,
  notify_client_booking: true,
  notify_professional_booking: true,
  notify_client_cancellation: true,
  notify_professional_cancellation: true,
  notify_client_reschedule: true,
  notify_professional_reschedule: true,
  reminder_enabled: true,
  reminder_minutes_before: 120,
  client_registration_template:
    "Olá, {cliente}! Seu cadastro em {salao} foi confirmado. Agora você pode entrar com seu CPF e senha para agendar com mais rapidez.",
  client_booking_template:
    "Olá, {cliente}! Seu agendamento em {salao} está confirmado para {data} às {hora}, com {profissional}. Serviço: {servico}. Para cancelar: {link_cancelamento}",
  professional_booking_template:
    "Olá, {profissional}! Novo agendamento: {cliente}, serviço {servico}, em {data} às {hora}.",
  client_reminder_template:
    "Olá, {cliente}! Passando para lembrar que seu atendimento em {salao} será em {data} às {hora}, com {profissional}. Serviço: {servico}.",
  client_cancellation_template:
    "Olá, {cliente}. Seu agendamento em {salao}, marcado para {data} às {hora}, foi cancelado.",
  professional_cancellation_template:
    "Olá, {profissional}. O agendamento de {cliente}, em {data} às {hora}, foi cancelado.",
  client_reschedule_template:
    "Olá, {cliente}! Seu agendamento em {salao} foi atualizado para {data} às {hora}, com {profissional}. Serviço: {servico}.",
  professional_reschedule_template:
    "Olá, {profissional}. O agendamento de {cliente} foi atualizado para {data} às {hora}. Serviço: {servico}.",
};

const settingsColumns = [
  "tenant_id",
  "enabled",
  "session_id",
  "responsible_whatsapp",
  "connection_status",
  "connected_phone",
  "last_connection_error",
  "last_status_at",
  "notify_client_registration",
  "notify_client_booking",
  "notify_professional_booking",
  "notify_client_cancellation",
  "notify_professional_cancellation",
  "notify_client_reschedule",
  "notify_professional_reschedule",
  "reminder_enabled",
  "reminder_minutes_before",
  "client_registration_template",
  "client_booking_template",
  "professional_booking_template",
  "client_reminder_template",
  "client_cancellation_template",
  "professional_cancellation_template",
  "client_reschedule_template",
  "professional_reschedule_template",
  "updated_at",
].join(",");

const queueColumns = [
  "id",
  "event_type",
  "recipient_kind",
  "recipient_name",
  "recipient_phone",
  "rendered_message",
  "status",
  "scheduled_for",
  "attempts",
  "max_attempts",
  "sent_at",
  "last_error",
  "created_at",
].join(",");

const statusInfo: Record<
  ConnectionStatus,
  { label: string; className: string; icon: typeof Smartphone }
> = {
  not_connected: {
    label: "Não conectado",
    className: "border-slate-200 bg-slate-50 text-slate-700",
    icon: Smartphone,
  },
  connecting: {
    label: "Conectando",
    className: "border-amber-200 bg-amber-50 text-amber-700",
    icon: Loader2,
  },
  qr: {
    label: "Aguardando leitura do QR",
    className: "border-amber-200 bg-amber-50 text-amber-700",
    icon: QrCodeIcon,
  },
  connected: {
    label: "Conectado",
    className: "border-emerald-200 bg-emerald-50 text-emerald-700",
    icon: CheckCircle2,
  },
  disconnected: {
    label: "Desconectado",
    className: "border-slate-200 bg-slate-50 text-slate-700",
    icon: Unplug,
  },
  logged_out: {
    label: "Sessão encerrada",
    className: "border-rose-200 bg-rose-50 text-rose-700",
    icon: XCircle,
  },
  connector_error: {
    label: "Falha de conexão",
    className: "border-rose-200 bg-rose-50 text-rose-700",
    icon: AlertCircle,
  },
};

const eventLabels: Record<string, string> = {
  client_registered: "Cadastro confirmado",
  appointment_created: "Novo agendamento",
  appointment_reminder: "Lembrete",
  appointment_cancelled: "Cancelamento",
  appointment_rescheduled: "Reagendamento",
  test: "Teste",
};

const recipientLabels: Record<string, string> = {
  client: "Cliente",
  professional: "Profissional",
  responsible: "Responsável",
};

function onlyDigits(value: string | null | undefined) {
  return String(value ?? "").replace(/\D/g, "");
}

function phoneDisplay(value: string | null | undefined) {
  const digits = onlyDigits(value).replace(/^55(?=\d{10,11}$)/, "");
  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  return value || "Não informado";
}

function dateTimeDisplay(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

function formFromSettings(settings: WhatsAppSettingsRow): WhatsAppForm {
  return {
    enabled: settings.enabled ?? defaultForm.enabled,
    responsible_whatsapp: settings.responsible_whatsapp ?? "",
    notify_client_registration:
      settings.notify_client_registration ?? defaultForm.notify_client_registration,
    notify_client_booking: settings.notify_client_booking ?? defaultForm.notify_client_booking,
    notify_professional_booking:
      settings.notify_professional_booking ?? defaultForm.notify_professional_booking,
    notify_client_cancellation:
      settings.notify_client_cancellation ?? defaultForm.notify_client_cancellation,
    notify_professional_cancellation:
      settings.notify_professional_cancellation ?? defaultForm.notify_professional_cancellation,
    notify_client_reschedule:
      settings.notify_client_reschedule ?? defaultForm.notify_client_reschedule,
    notify_professional_reschedule:
      settings.notify_professional_reschedule ?? defaultForm.notify_professional_reschedule,
    reminder_enabled: settings.reminder_enabled ?? defaultForm.reminder_enabled,
    reminder_minutes_before:
      settings.reminder_minutes_before ?? defaultForm.reminder_minutes_before,
    client_registration_template:
      settings.client_registration_template || defaultForm.client_registration_template,
    client_booking_template:
      settings.client_booking_template || defaultForm.client_booking_template,
    professional_booking_template:
      settings.professional_booking_template || defaultForm.professional_booking_template,
    client_reminder_template:
      settings.client_reminder_template || defaultForm.client_reminder_template,
    client_cancellation_template:
      settings.client_cancellation_template || defaultForm.client_cancellation_template,
    professional_cancellation_template:
      settings.professional_cancellation_template || defaultForm.professional_cancellation_template,
    client_reschedule_template:
      settings.client_reschedule_template || defaultForm.client_reschedule_template,
    professional_reschedule_template:
      settings.professional_reschedule_template || defaultForm.professional_reschedule_template,
  };
}

async function connectorErrorMessage(error: unknown) {
  const typed = error as { message?: string; context?: Response };
  let message = typed?.message || "Não foi possível acessar o WhatsApp.";
  const response = typed?.context;
  if (response && typeof response.clone === "function") {
    try {
      const payload = (await response.clone().json()) as { error?: string };
      message = payload.error || message;
    } catch {
      // Mantém a mensagem original quando a resposta não possui JSON.
    }
  }
  return message;
}

function nestedValue(result: ConnectorResult, keys: string[]): unknown {
  for (const key of keys) {
    if (result[key]) return result[key];
    if (result.data?.[key]) return result.data[key];
  }
  return null;
}

function qrValueFromResult(result: ConnectorResult) {
  const candidate = nestedValue(result, [
    "qr",
    "qrCode",
    "qrcode",
    "qr_code",
    "qrDataUrl",
    "qr_data_url",
  ]);
  if (typeof candidate === "string") return candidate;
  if (candidate && typeof candidate === "object") {
    const value = candidate as Record<string, unknown>;
    for (const key of ["base64", "dataUrl", "code", "value"]) {
      if (typeof value[key] === "string") return value[key] as string;
    }
  }
  return "";
}

function qrImageSource(value: string) {
  const normalized = value.trim();
  if (/^(data:image\/|https?:\/\/|blob:)/i.test(normalized)) return normalized;
  if (
    /^(iVBOR|\/9j\/|R0lGOD|UklGR|Qk)/.test(normalized) ||
    (normalized.length > 200 && /^[A-Za-z0-9+/=\s]+$/.test(normalized))
  ) {
    return `data:image/png;base64,${normalized.replace(/\s/g, "")}`;
  }
  return null;
}

export function WhatsAppSettings({ tenantId }: { tenantId?: string }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<WhatsAppForm>(defaultForm);
  const [busyAction, setBusyAction] = useState<ConnectorAction | null>(null);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [qrValue, setQrValue] = useState("");

  const settingsQuery = useQuery({
    queryKey: ["tenant-whatsapp-settings", tenantId],
    enabled: Boolean(tenantId),
    refetchInterval: 15_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("tenant_whatsapp_settings")
        .select(settingsColumns)
        .eq("tenant_id", tenantId)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as WhatsAppSettingsRow | null;
    },
  });

  const queueQuery = useQuery({
    queryKey: ["whatsapp-message-queue", tenantId],
    enabled: Boolean(tenantId),
    refetchInterval: 20_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("whatsapp_message_queue")
        .select(queueColumns)
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false })
        .limit(30);
      if (error) throw error;
      return (data ?? []) as QueueRow[];
    },
  });

  useEffect(() => {
    if (settingsQuery.data) setForm(formFromSettings(settingsQuery.data));
  }, [settingsQuery.data]);

  const settings = settingsQuery.data;
  const connectionStatus = settings?.connection_status ?? "not_connected";
  const connection = statusInfo[connectionStatus] ?? statusInfo.connector_error;
  const ConnectionIcon = connection.icon;
  const connected = connectionStatus === "connected";
  const canDisconnect = connected || connectionStatus === "connecting" || connectionStatus === "qr";
  const qrImage = qrImageSource(qrValue);
  const queueSummary = useMemo(() => {
    const rows = queueQuery.data ?? [];
    return {
      pending: rows.filter((row) => row.status === "pending" || row.status === "processing").length,
      sent: rows.filter((row) => row.status === "sent").length,
      failed: rows.filter((row) => row.status === "failed").length,
    };
  }, [queueQuery.data]);

  const invokeConnector = useCallback(
    async (
      action: ConnectorAction,
      extra: Record<string, unknown> = {},
    ): Promise<ConnectorResult> => {
      if (!tenantId) throw new Error("Loja não carregada.");
      const { data, error } = await supabase.functions.invoke("whatsapp-connector", {
        body: { action, tenantId, ...extra },
      });
      if (error) throw new Error(await connectorErrorMessage(error));
      return (data ?? {}) as ConnectorResult;
    },
    [tenantId],
  );

  async function refreshModule() {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: ["tenant-whatsapp-settings", tenantId],
      }),
      queryClient.invalidateQueries({
        queryKey: ["whatsapp-message-queue", tenantId],
      }),
    ]);
  }

  const applyConnectorResult = useCallback(
    (result: ConnectorResult) => {
      if (result.settings) {
        queryClient.setQueryData(["tenant-whatsapp-settings", tenantId], result.settings);
        setForm(formFromSettings(result.settings));
      }
      const nextQr = qrValueFromResult(result);
      const nextStatus = result.settings?.connection_status ?? result.status;
      if (
        nextStatus === "connected" ||
        nextStatus === "disconnected" ||
        nextStatus === "logged_out" ||
        nextStatus === "not_connected" ||
        nextStatus === "connector_error"
      ) {
        setQrValue("");
      } else if (nextQr) {
        setQrValue(nextQr);
      }
    },
    [queryClient, tenantId],
  );

  useEffect(() => {
    if (!tenantId || (connectionStatus !== "connecting" && connectionStatus !== "qr")) {
      return;
    }

    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const pollStatus = async () => {
      try {
        const result = await invokeConnector("status");
        if (stopped) return;

        applyConnectorResult(result);
        const nextStatus = result.settings?.connection_status ?? result.status;
        if (nextStatus === "connecting" || nextStatus === "qr") {
          timer = setTimeout(pollStatus, 2_000);
        }
      } catch {
        if (!stopped) timer = setTimeout(pollStatus, 3_000);
      }
    };

    timer = setTimeout(pollStatus, 1_000);
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, [tenantId, connectionStatus, invokeConnector, applyConnectorResult]);

  async function runAction(
    action: Exclude<ConnectorAction, "retry-message">,
    successMessage: string,
    extra: Record<string, unknown> = {},
  ) {
    if (action === "connect" || action === "disconnect") setQrValue("");
    setBusyAction(action);
    try {
      const result = await invokeConnector(action, extra);
      applyConnectorResult(result);
      if (action === "disconnect") setQrValue("");
      if (result.ok === false || result.error) {
        throw new Error(result.error || "O conector não concluiu a operação.");
      }
      toast.success(successMessage);
      await refreshModule();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível concluir a operação.");
    } finally {
      setBusyAction(null);
    }
  }

  async function retryMessage(messageId: string) {
    setRetryingId(messageId);
    try {
      const result = await invokeConnector("retry-message", { messageId });
      if (result.ok === false || result.error) {
        throw new Error(result.error || "Não foi possível reenviar a mensagem.");
      }
      toast.success("Mensagem devolvida para a fila de envio.");
      await refreshModule();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível reenviar a mensagem.");
    } finally {
      setRetryingId(null);
    }
  }

  if (!tenantId) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">
          Carregando a loja...
        </CardContent>
      </Card>
    );
  }

  if (settingsQuery.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-80 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {(settingsQuery.error || queueQuery.error) && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Módulo ainda indisponível</AlertTitle>
          <AlertDescription>
            Não foi possível carregar a estrutura do WhatsApp. Confirme se o SQL do módulo já foi
            aplicado e publique a Edge Function
            <strong> whatsapp-connector</strong>.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
        <Card>
          <CardHeader className="pb-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  WhatsApp
                </p>
                <CardTitle className="mt-1 flex items-center gap-2 text-xl">
                  <MessageCircle className="h-5 w-5 text-emerald-600" />
                  WhatsApp da loja
                </CardTitle>
              </div>
              <Badge variant="outline" className={connection.className}>
                <ConnectionIcon
                  className={`mr-1.5 h-3.5 w-3.5 ${
                    connectionStatus === "connecting" ? "animate-spin" : ""
                  }`}
                />
                {connection.label}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            <div
              className={`rounded-xl border p-4 ${
                connected ? "border-emerald-200 bg-emerald-50/70" : "border-border bg-muted/30"
              }`}
            >
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {connected ? "Conectado como" : "Número conectado"}
              </div>
              <div className="mt-1 flex items-center gap-2 text-lg font-semibold">
                <Phone className="h-4 w-4" />
                {phoneDisplay(settings?.connected_phone)}
              </div>
              {settings?.last_status_at && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Última verificação: {dateTimeDisplay(settings.last_status_at)}
                </p>
              )}
            </div>

            {settings?.last_connection_error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Falha mais recente</AlertTitle>
                <AlertDescription>{settings.last_connection_error}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-2">
              <Label htmlFor="whatsapp-responsible">
                WhatsApp do responsável / número para teste
              </Label>
              <Input
                id="whatsapp-responsible"
                inputMode="tel"
                placeholder="(91) 99999-9999"
                value={form.responsible_whatsapp ?? ""}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    responsible_whatsapp: event.target.value,
                  }))
                }
              />
              <p className="text-xs text-muted-foreground">
                Esse telefone recebe o teste de conexão. Nenhum token do provedor é exibido ou salvo
                no navegador.
              </p>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              <Button
                onClick={() => runAction("connect", "Conexão iniciada. Leia o QR Code.")}
                disabled={Boolean(busyAction)}
              >
                {busyAction === "connect" ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Plug className="mr-2 h-4 w-4" />
                )}
                Conectar WhatsApp
              </Button>
              <Button
                variant="outline"
                onClick={() => runAction("status", "Status do WhatsApp atualizado.")}
                disabled={Boolean(busyAction)}
              >
                {busyAction === "status" ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="mr-2 h-4 w-4" />
                )}
                Atualizar status
              </Button>
              <Button
                variant="outline"
                onClick={() =>
                  runAction("send-test", "Mensagem de teste enviada.", {
                    phone: form.responsible_whatsapp,
                  })
                }
                disabled={Boolean(busyAction) || !connected}
              >
                {busyAction === "send-test" ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Send className="mr-2 h-4 w-4" />
                )}
                Enviar teste
              </Button>
              <Button
                variant="outline"
                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={() => runAction("disconnect", "WhatsApp desconectado da loja.")}
                disabled={Boolean(busyAction) || !canDisconnect}
              >
                {busyAction === "disconnect" ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Unplug className="mr-2 h-4 w-4" />
                )}
                Desconectar
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-2 text-lg">
              <QrCodeIcon className="h-5 w-5 text-primary" />
              Conexão por QR Code
            </CardTitle>
          </CardHeader>
          <CardContent>
            {qrValue ? (
              <div className="flex flex-col items-center rounded-xl border bg-muted/20 p-5 text-center">
                {qrImage ? (
                  <img
                    src={qrImage}
                    alt="QR Code para conectar o WhatsApp"
                    className="h-60 w-60 rounded-lg bg-white object-contain p-2"
                  />
                ) : (
                  <QrCode value={qrValue} size={240} />
                )}
                <p className="mt-4 text-sm font-medium">Abra o WhatsApp e leia este código</p>
                <p className="mt-1 max-w-sm text-xs text-muted-foreground">
                  No celular, acesse Aparelhos conectados → Conectar um aparelho.
                </p>
              </div>
            ) : connected ? (
              <div className="flex min-h-64 flex-col items-center justify-center rounded-xl border border-emerald-200 bg-emerald-50/60 p-6 text-center">
                <CheckCircle2 className="h-12 w-12 text-emerald-600" />
                <p className="mt-4 font-semibold">WhatsApp conectado</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  A loja já pode processar as notificações habilitadas.
                </p>
              </div>
            ) : (
              <div className="flex min-h-64 flex-col items-center justify-center rounded-xl border border-dashed p-6 text-center">
                <Smartphone className="h-12 w-12 text-muted-foreground/60" />
                <p className="mt-4 font-semibold">QR Code ainda não gerado</p>
                <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                  Clique em Conectar WhatsApp. O código aparecerá aqui sem expor a sessão ou as
                  credenciais do conector.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="text-lg">Disparos automáticos</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                Escolha quem recebe avisos em cada etapa do agendamento.
              </p>
            </div>
            <SettingSwitch
              label="Automação ativa"
              description="Pausa ou libera todos os disparos desta loja."
              checked={form.enabled}
              onCheckedChange={(enabled) => setForm((current) => ({ ...current, enabled }))}
              compact
            />
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <AutomationGroup title="Novo cadastro" icon={<UserPlus className="h-4 w-4" />}>
              <SettingSwitch
                label="Confirmar ao cliente"
                checked={form.notify_client_registration}
                onCheckedChange={(notify_client_registration) =>
                  setForm((current) => ({ ...current, notify_client_registration }))
                }
              />
            </AutomationGroup>

            <AutomationGroup title="Novo agendamento" icon={<MessageCircle className="h-4 w-4" />}>
              <SettingSwitch
                label="Avisar cliente"
                checked={form.notify_client_booking}
                onCheckedChange={(notify_client_booking) =>
                  setForm((current) => ({ ...current, notify_client_booking }))
                }
              />
              <SettingSwitch
                label="Avisar profissional"
                checked={form.notify_professional_booking}
                onCheckedChange={(notify_professional_booking) =>
                  setForm((current) => ({
                    ...current,
                    notify_professional_booking,
                  }))
                }
              />
            </AutomationGroup>

            <AutomationGroup title="Cancelamento" icon={<XCircle className="h-4 w-4" />}>
              <SettingSwitch
                label="Avisar cliente"
                checked={form.notify_client_cancellation}
                onCheckedChange={(notify_client_cancellation) =>
                  setForm((current) => ({
                    ...current,
                    notify_client_cancellation,
                  }))
                }
              />
              <SettingSwitch
                label="Avisar profissional"
                checked={form.notify_professional_cancellation}
                onCheckedChange={(notify_professional_cancellation) =>
                  setForm((current) => ({
                    ...current,
                    notify_professional_cancellation,
                  }))
                }
              />
            </AutomationGroup>

            <AutomationGroup title="Reagendamento" icon={<RefreshCw className="h-4 w-4" />}>
              <SettingSwitch
                label="Avisar cliente"
                checked={form.notify_client_reschedule}
                onCheckedChange={(notify_client_reschedule) =>
                  setForm((current) => ({
                    ...current,
                    notify_client_reschedule,
                  }))
                }
              />
              <SettingSwitch
                label="Avisar profissional"
                checked={form.notify_professional_reschedule}
                onCheckedChange={(notify_professional_reschedule) =>
                  setForm((current) => ({
                    ...current,
                    notify_professional_reschedule,
                  }))
                }
              />
            </AutomationGroup>
          </div>

          <div className="grid items-end gap-4 rounded-xl border bg-muted/20 p-4 md:grid-cols-[minmax(0,1fr)_220px]">
            <SettingSwitch
              label="Lembrete do atendimento"
              description="Envia automaticamente uma mensagem ao cliente antes do horário."
              checked={form.reminder_enabled}
              onCheckedChange={(reminder_enabled) =>
                setForm((current) => ({ ...current, reminder_enabled }))
              }
            />
            <div className="space-y-2">
              <Label htmlFor="reminder-minutes">Minutos antes</Label>
              <Input
                id="reminder-minutes"
                type="number"
                min={5}
                max={10080}
                step={5}
                disabled={!form.reminder_enabled}
                value={form.reminder_minutes_before}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    reminder_minutes_before: Number(event.target.value),
                  }))
                }
              />
            </div>
          </div>

          <SaveButton
            busy={busyAction === "save"}
            disabled={Boolean(busyAction)}
            label="Salvar configurações"
            onClick={() =>
              runAction("save", "Configurações do WhatsApp salvas.", {
                settings: {
                  ...form,
                  responsible_whatsapp: onlyDigits(form.responsible_whatsapp),
                },
              })
            }
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Modelos das mensagens</CardTitle>
          <p className="text-sm text-muted-foreground">
            Variáveis disponíveis: {"{cliente}, {profissional}, {salao}, {servico}, "}
            {"{data}, {hora}, {link_cancelamento}"}.
          </p>
        </CardHeader>
        <CardContent className="space-y-6">
          <TemplateSection
            title="Novo cadastro"
            description="Confirma o primeiro acesso do cliente ao link do salão."
            icon={<UserPlus className="h-4 w-4" />}
          >
            <TemplateField
              label="Mensagem para o cliente"
              value={form.client_registration_template}
              onChange={(client_registration_template) =>
                setForm((current) => ({ ...current, client_registration_template }))
              }
              fullWidth
            />
          </TemplateSection>

          <TemplateSection
            title="Novo agendamento"
            description="Mensagens enviadas assim que o agendamento é registrado."
            icon={<MessageCircle className="h-4 w-4" />}
          >
            <TemplateField
              label="Mensagem para o cliente"
              value={form.client_booking_template}
              onChange={(client_booking_template) =>
                setForm((current) => ({ ...current, client_booking_template }))
              }
            />
            <TemplateField
              label="Mensagem para o profissional"
              value={form.professional_booking_template}
              onChange={(professional_booking_template) =>
                setForm((current) => ({
                  ...current,
                  professional_booking_template,
                }))
              }
            />
          </TemplateSection>

          <TemplateSection
            title="Lembrete"
            description="Mensagem programada antes do atendimento."
            icon={<Clock3 className="h-4 w-4" />}
          >
            <TemplateField
              label="Mensagem para o cliente"
              value={form.client_reminder_template}
              onChange={(client_reminder_template) =>
                setForm((current) => ({ ...current, client_reminder_template }))
              }
              fullWidth
            />
          </TemplateSection>

          <TemplateSection
            title="Cancelamento"
            description="Informa que o horário deixou de estar reservado."
            icon={<XCircle className="h-4 w-4" />}
          >
            <TemplateField
              label="Mensagem para o cliente"
              value={form.client_cancellation_template}
              onChange={(client_cancellation_template) =>
                setForm((current) => ({
                  ...current,
                  client_cancellation_template,
                }))
              }
            />
            <TemplateField
              label="Mensagem para o profissional"
              value={form.professional_cancellation_template}
              onChange={(professional_cancellation_template) =>
                setForm((current) => ({
                  ...current,
                  professional_cancellation_template,
                }))
              }
            />
          </TemplateSection>

          <TemplateSection
            title="Reagendamento"
            description="Confirma a nova data, horário ou profissional."
            icon={<RefreshCw className="h-4 w-4" />}
          >
            <TemplateField
              label="Mensagem para o cliente"
              value={form.client_reschedule_template}
              onChange={(client_reschedule_template) =>
                setForm((current) => ({
                  ...current,
                  client_reschedule_template,
                }))
              }
            />
            <TemplateField
              label="Mensagem para o profissional"
              value={form.professional_reschedule_template}
              onChange={(professional_reschedule_template) =>
                setForm((current) => ({
                  ...current,
                  professional_reschedule_template,
                }))
              }
            />
          </TemplateSection>

          <SaveButton
            busy={busyAction === "save"}
            disabled={Boolean(busyAction)}
            label="Salvar modelos"
            onClick={() =>
              runAction("save", "Modelos de mensagem salvos.", {
                settings: {
                  ...form,
                  responsible_whatsapp: onlyDigits(form.responsible_whatsapp),
                },
              })
            }
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg">
                <History className="h-5 w-5" />
                Histórico de mensagens
              </CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                Últimos 30 disparos processados ou programados para esta loja.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => queueQuery.refetch()}
              disabled={queueQuery.isFetching}
            >
              <RefreshCw
                className={`mr-2 h-4 w-4 ${queueQuery.isFetching ? "animate-spin" : ""}`}
              />
              Atualizar
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <QueueSummary label="Na fila" value={queueSummary.pending} className="text-amber-700" />
            <QueueSummary label="Enviadas" value={queueSummary.sent} className="text-emerald-700" />
            <QueueSummary label="Falharam" value={queueSummary.failed} className="text-rose-700" />
          </div>

          {queueQuery.isLoading ? (
            <Skeleton className="h-48 w-full" />
          ) : (queueQuery.data?.length ?? 0) === 0 ? (
            <div className="rounded-xl border border-dashed p-8 text-center">
              <MessageCircle className="mx-auto h-9 w-9 text-muted-foreground/50" />
              <p className="mt-3 font-medium">Nenhuma mensagem registrada</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Os disparos aparecerão aqui quando a automação começar a processar os agendamentos.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Evento</TableHead>
                  <TableHead>Destinatário</TableHead>
                  <TableHead>Agendada / enviada</TableHead>
                  <TableHead>Tentativas</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {queueQuery.data?.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>
                      <div className="font-medium">
                        {eventLabels[row.event_type] ?? row.event_type}
                      </div>
                      {row.last_error && (
                        <p
                          className="mt-1 max-w-64 truncate text-xs text-destructive"
                          title={row.last_error}
                        >
                          {row.last_error}
                        </p>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {row.recipient_kind === "professional" ? (
                          <Users className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <UserRound className="h-4 w-4 text-muted-foreground" />
                        )}
                        <div>
                          <div className="font-medium">
                            {row.recipient_name ||
                              recipientLabels[row.recipient_kind] ||
                              "Destinatário"}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {phoneDisplay(row.recipient_phone)}
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm">
                      {dateTimeDisplay(row.sent_at || row.scheduled_for)}
                    </TableCell>
                    <TableCell>
                      {row.attempts}/{row.max_attempts}
                    </TableCell>
                    <TableCell>
                      <QueueStatus status={row.status} />
                    </TableCell>
                    <TableCell className="text-right">
                      {row.status === "failed" && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => retryMessage(row.id)}
                          disabled={retryingId === row.id}
                        >
                          {retryingId === row.id ? (
                            <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <RotateCcw className="mr-2 h-3.5 w-3.5" />
                          )}
                          Tentar novamente
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function SaveButton({
  busy,
  disabled,
  label,
  onClick,
}: {
  busy: boolean;
  disabled: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <div className="flex justify-end">
      <Button onClick={onClick} disabled={disabled}>
        {busy ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <Save className="mr-2 h-4 w-4" />
        )}
        {label}
      </Button>
    </div>
  );
}

function SettingSwitch({
  label,
  description,
  checked,
  onCheckedChange,
  compact = false,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  compact?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between gap-4 ${
        compact ? "" : "rounded-lg border bg-background p-3"
      }`}
    >
      <div>
        <div className="text-sm font-medium">{label}</div>
        {description && <div className="mt-0.5 text-xs text-muted-foreground">{description}</div>}
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}

function AutomationGroup({
  title,
  icon,
  children,
}: {
  title: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="space-y-2 rounded-xl border bg-muted/10 p-3">
      <div className="flex items-center gap-2 px-1 py-1 text-sm font-semibold">
        {icon}
        {title}
      </div>
      {children}
    </div>
  );
}

function TemplateSection({
  title,
  description,
  icon,
  children,
}: {
  title: string;
  description: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3 border-b pb-6 last:border-0 last:pb-0">
      <div className="flex items-start gap-2">
        <div className="mt-0.5 rounded-md bg-primary/10 p-1.5 text-primary">{icon}</div>
        <div>
          <h3 className="font-semibold">{title}</h3>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2">{children}</div>
    </section>
  );
}

function TemplateField({
  label,
  value,
  onChange,
  fullWidth = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  fullWidth?: boolean;
}) {
  return (
    <div className={`space-y-2 ${fullWidth ? "md:col-span-2" : ""}`}>
      <Label>{label}</Label>
      <Textarea rows={4} value={value} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}

function QueueSummary({
  label,
  value,
  className,
}: {
  label: string;
  value: number;
  className: string;
}) {
  return (
    <div className="rounded-lg border bg-muted/20 px-4 py-3">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`mt-1 text-2xl font-semibold ${className}`}>{value}</div>
    </div>
  );
}

function QueueStatus({ status }: { status: QueueRow["status"] }) {
  const presentation = {
    pending: {
      label: "Pendente",
      className: "border-amber-200 bg-amber-50 text-amber-700",
    },
    processing: {
      label: "Enviando",
      className: "border-sky-200 bg-sky-50 text-sky-700",
    },
    sent: {
      label: "Enviada",
      className: "border-emerald-200 bg-emerald-50 text-emerald-700",
    },
    failed: {
      label: "Falhou",
      className: "border-rose-200 bg-rose-50 text-rose-700",
    },
    cancelled: {
      label: "Cancelada",
      className: "border-slate-200 bg-slate-50 text-slate-700",
    },
  }[status];

  return (
    <Badge variant="outline" className={presentation.className}>
      {presentation.label}
    </Badge>
  );
}

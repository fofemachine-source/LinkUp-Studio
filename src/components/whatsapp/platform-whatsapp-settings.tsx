import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  MessageCircle,
  Phone,
  Plug,
  QrCode as QrCodeIcon,
  RefreshCw,
  Send,
  Smartphone,
  Unplug,
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

type ConnectorAction = "save" | "status" | "connect" | "disconnect" | "send-test";

type ConnectionStatus =
  | "not_connected"
  | "connecting"
  | "qr"
  | "connected"
  | "disconnected"
  | "logged_out"
  | "connector_error";

type PlatformWhatsAppSettingsRow = {
  id: string;
  whatsapp_enabled: boolean;
  platform_whatsapp_session_id: string | null;
  platform_whatsapp_connection_status: ConnectionStatus;
  platform_whatsapp_connected_phone: string | null;
  platform_whatsapp_last_status_at: string | null;
  platform_whatsapp_last_connection_error: string | null;
  platform_whatsapp_test_phone: string | null;
};

type ConnectorResult = {
  ok?: boolean;
  error?: string;
  status?: ConnectionStatus;
  connected?: boolean;
  phone?: string;
  settings?: PlatformWhatsAppSettingsRow;
  data?: Record<string, unknown>;
  [key: string]: unknown;
};

const platformColumns = [
  "id",
  "whatsapp_enabled",
  "platform_whatsapp_session_id",
  "platform_whatsapp_connection_status",
  "platform_whatsapp_connected_phone",
  "platform_whatsapp_last_status_at",
  "platform_whatsapp_last_connection_error",
  "platform_whatsapp_test_phone",
].join(",");

const statusInfo: Record<ConnectionStatus, { label: string; className: string; icon: typeof Smartphone }> = {
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

const fallbackSettings: PlatformWhatsAppSettingsRow = {
  id: "global",
  whatsapp_enabled: false,
  platform_whatsapp_session_id: "platform-owner",
  platform_whatsapp_connection_status: "not_connected",
  platform_whatsapp_connected_phone: null,
  platform_whatsapp_last_status_at: null,
  platform_whatsapp_last_connection_error: null,
  platform_whatsapp_test_phone: null,
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

async function connectorErrorMessage(error: unknown) {
  const typed = error as { message?: string; context?: Response };
  let message = typed?.message || "Não foi possível acessar o WhatsApp Owner.";
  const response = typed?.context;
  if (response && typeof response.clone === "function") {
    try {
      const payload = (await response.clone().json()) as { error?: string; message?: string };
      message = payload.error || payload.message || message;
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

export function PlatformWhatsAppSettings() {
  const queryClient = useQueryClient();
  const [busyAction, setBusyAction] = useState<ConnectorAction | null>(null);
  const [qrValue, setQrValue] = useState("");
  const [testPhone, setTestPhone] = useState("");

  const settingsQuery = useQuery({
    queryKey: ["platform-whatsapp-settings"],
    refetchInterval: 15_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("platform_billing_settings")
        .select(platformColumns)
        .eq("id", "global")
        .maybeSingle();
      if (error) throw error;
      return { ...fallbackSettings, ...((data as Partial<PlatformWhatsAppSettingsRow> | null) ?? {}) };
    },
  });

  const settings = settingsQuery.data ?? fallbackSettings;
  const info = statusInfo[settings.platform_whatsapp_connection_status] ?? statusInfo.not_connected;
  const StatusIcon = info.icon;
  const qrImage = qrValue ? qrImageSource(qrValue) : null;

  useEffect(() => {
    setTestPhone(settings.platform_whatsapp_test_phone ?? "");
  }, [settings.platform_whatsapp_test_phone]);

  async function invokeConnector(action: ConnectorAction, extra: Record<string, unknown> = {}) {
    const { data, error } = await supabase.functions.invoke("whatsapp-connector", {
      body: { action, scope: "platform", ...extra },
    });
    if (error) throw new Error(await connectorErrorMessage(error));
    const result = (data ?? {}) as ConnectorResult;
    if (result.ok === false || result.error) {
      throw new Error(result.error || "O conector não confirmou a ação.");
    }
    if (result.settings) {
      queryClient.setQueryData(["platform-whatsapp-settings"], {
        ...fallbackSettings,
        ...result.settings,
      });
    }
    const nextQr = qrValueFromResult(result);
    if (nextQr) setQrValue(nextQr);
    if (action === "disconnect") setQrValue("");
    return result;
  }

  async function runAction(action: ConnectorAction) {
    if (action === "send-test") {
      const phone = onlyDigits(testPhone);
      if (phone.length < 10) {
        toast.error("Informe um WhatsApp válido para receber o teste.");
        return;
      }
    }

    setBusyAction(action);
    try {
      if (action === "send-test") {
        const phone = onlyDigits(testPhone);
        await invokeConnector("save", {
          settings: { platform_whatsapp_test_phone: phone },
        });
        await invokeConnector("send-test", { phone });
      } else {
        await invokeConnector(action);
      }

      await settingsQuery.refetch();
      const labels: Record<ConnectorAction, string> = {
        save: "Configuração salva.",
        status: "Status atualizado.",
        connect: "Solicitação de conexão enviada. Leia o QR Code quando ele aparecer.",
        disconnect: "Sessão da matriz desconectada.",
        "send-test": "Mensagem de teste enviada pelo WhatsApp Owner.",
      };
      toast.success(labels[action]);
    } catch (error: any) {
      toast.error(error.message || "Não foi possível concluir a ação.");
    } finally {
      setBusyAction(null);
    }
  }

  useEffect(() => {
    if (!["connecting", "qr"].includes(settings.platform_whatsapp_connection_status)) return;
    const timer = window.setInterval(() => {
      void invokeConnector("status")
        .then(() => settingsQuery.refetch())
        .catch(() => undefined);
    }, 5_000);
    return () => window.clearInterval(timer);
  }, [settings.platform_whatsapp_connection_status]);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-indigo-700">
              <MessageCircle className="h-4 w-4" />
              Conexão oficial da matriz
            </div>
            <CardTitle className="mt-2 text-xl">WhatsApp Owner / Matriz</CardTitle>
            <p className="mt-1 max-w-3xl text-sm text-slate-500">
              Este número é exclusivo da LinkUp Studio para avisos B2B: cobrança, teste grátis,
              inadimplência e pagamento confirmado. Ele não substitui o WhatsApp operacional de cada
              salão.
            </p>
          </div>
          <Badge variant="outline" className={info.className}>
            <StatusIcon
              className={`mr-1 h-3.5 w-3.5 ${
                settings.platform_whatsapp_connection_status === "connecting" ? "animate-spin" : ""
              }`}
            />
            {info.label}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {settingsQuery.error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>SQL do WhatsApp Owner ainda não aplicado</AlertTitle>
            <AlertDescription>
              Aplique a migration da matriz no SQL Editor do Lovable e recarregue esta tela.
            </AlertDescription>
          </Alert>
        )}

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-xl border bg-slate-50 p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Sessão</p>
              <p className="mt-2 font-semibold text-slate-900">
                {settings.platform_whatsapp_session_id || "platform-owner"}
              </p>
              <p className="mt-1 text-xs text-slate-500">Separada das sessões dos salões.</p>
            </div>
            <div className="rounded-xl border bg-slate-50 p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Conectado como
              </p>
              <p className="mt-2 font-semibold text-slate-900">
                {phoneDisplay(settings.platform_whatsapp_connected_phone)}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Atualizado {dateTimeDisplay(settings.platform_whatsapp_last_status_at)}
              </p>
            </div>
            <div className="rounded-xl border bg-slate-50 p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Último detalhe
              </p>
              <p className="mt-2 line-clamp-2 text-sm font-medium text-slate-900">
                {settings.platform_whatsapp_last_connection_error || "Sem erro recente."}
              </p>
            </div>
          </div>

          <div className="rounded-xl border bg-white p-4">
            <Label>Número para teste</Label>
            <Input
              value={testPhone}
              onChange={(event) => setTestPhone(event.target.value)}
              placeholder="(91) 99999-9999"
              className="mt-1"
            />
            <Button
              className="mt-3 w-full bg-indigo-600 hover:bg-indigo-700"
              disabled={Boolean(busyAction) || settings.platform_whatsapp_connection_status !== "connected"}
              onClick={() => void runAction("send-test")}
            >
              {busyAction === "send-test" ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Send className="mr-2 h-4 w-4" />
              )}
              Enviar teste
            </Button>
          </div>
        </div>

        {qrValue && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
            <div className="flex flex-col gap-4 md:flex-row md:items-center">
              <div className="flex h-56 w-56 shrink-0 items-center justify-center rounded-xl bg-white p-4 shadow-sm">
                {qrImage ? (
                  <img src={qrImage} alt="QR Code do WhatsApp Owner" className="h-full w-full object-contain" />
                ) : (
                  <QrCode value={qrValue} size={220} />
                )}
              </div>
              <div>
                <h3 className="text-lg font-semibold text-slate-900">Leia este QR Code no WhatsApp</h3>
                <p className="mt-2 text-sm text-slate-600">
                  No celular da matriz, abra WhatsApp &gt; Aparelhos conectados &gt; Conectar
                  aparelho. Depois clique em <strong>Atualizar status</strong>.
                </p>
                <p className="mt-2 text-xs text-slate-500">
                  Se o QR expirar, clique em Conectar WhatsApp novamente.
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <Button
            className="bg-indigo-600 hover:bg-indigo-700"
            disabled={Boolean(busyAction)}
            onClick={() => void runAction("connect")}
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
            disabled={Boolean(busyAction)}
            onClick={() => void runAction("status")}
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
            disabled={Boolean(busyAction)}
            onClick={() => void runAction("disconnect")}
          >
            <Unplug className="mr-2 h-4 w-4" />
            Desconectar
          </Button>
        </div>

        <Alert>
          <Phone className="h-4 w-4" />
          <AlertTitle>Separação correta dos envios</AlertTitle>
          <AlertDescription>
            A matriz envia avisos financeiros para os salões. Cada salão continua usando o próprio
            WhatsApp operacional para clientes, profissionais, agendamentos e cancelamentos.
          </AlertDescription>
        </Alert>
      </CardContent>
    </Card>
  );
}

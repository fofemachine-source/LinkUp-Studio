import { useSidebar } from "@/components/ui/sidebar";
import { Input } from "@/components/ui/input";
import {
  Search,
  Bell,
  BellRing,
  CheckCheck,
  Clock3,
  LogOut,
  Menu,
  Camera,
  Volume2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCurrentTenant, useUserRole } from "@/hooks/use-tenant";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { authUserQueryKey, fetchAuthUser } from "@/lib/auth-cache";
import { ensureAppointmentPushSubscription } from "@/lib/appointment-push";
import { dynamicSupabase, errorMessage } from "@/lib/supabase-dynamic";

type AppNotificationRow = {
  id: string;
  tenant_id: string;
  recipient_user_id: string;
  appointment_id: string | null;
  kind: string;
  title: string;
  body: string;
  data: Record<string, unknown> | null;
  read_at: string | null;
  acknowledged_at: string | null;
  created_at: string;
};

type HeaderAlertSettings = {
  appointment_alert_repeat_seconds?: number | null;
  appointment_reception_alerts_enabled?: boolean | null;
};

type UserMetadata = {
  full_name?: string;
  avatar_url?: string;
};

function formatNotificationTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function normalizeRepeatSeconds(value: string | number | null | undefined) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 20;
  return Math.min(300, Math.max(5, Math.round(parsed)));
}

export function AppHeader() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const { data: tenant } = useCurrentTenant();
  const { data: role } = useUserRole(tenant?.id);
  const { toggleSidebar } = useSidebar();

  const [photoOpen, setPhotoOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const { data: user } = useQuery({
    queryKey: authUserQueryKey,
    queryFn: fetchAuthUser,
    staleTime: 5 * 60 * 1000,
  });

  const { data: professionalPhotoUrl } = useQuery({
    queryKey: ["header-professional-photo", user?.id],
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data } = await supabase
        .from("professionals")
        .select("photo_url")
        .eq("auth_user_id", user!.id)
        .maybeSingle();
      return data?.photo_url ?? null;
    },
  });

  const canManageAppointmentAlerts = role === "owner" || role === "staff";
  const [repeatInput, setRepeatInput] = useState("20");
  const [savingAlertSettings, setSavingAlertSettings] = useState(false);
  const [activatingPush, setActivatingPush] = useState(false);

  const { data: notifications = [] } = useQuery({
    queryKey: ["app-notifications", tenant?.id, user?.id],
    enabled: Boolean(tenant?.id && user?.id),
    staleTime: 15 * 1000,
    refetchInterval: 30 * 1000,
    queryFn: async () => {
      const { data, error } = await dynamicSupabase
        .from<AppNotificationRow[]>("app_notifications")
        .select(
          "id, tenant_id, recipient_user_id, appointment_id, kind, title, body, data, read_at, acknowledged_at, created_at",
        )
        .eq("tenant_id", tenant!.id)
        .eq("recipient_user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(20);

      if (error) throw error;
      return (data ?? []) as AppNotificationRow[];
    },
  });

  const { data: alertSettings = null } = useQuery({
    queryKey: ["appointment-alert-settings", tenant?.id],
    enabled: Boolean(tenant?.id),
    staleTime: 60 * 1000,
    queryFn: async () => {
      const { data, error } = await dynamicSupabase
        .from<HeaderAlertSettings>("tenant_settings")
        .select("appointment_alert_repeat_seconds, appointment_reception_alerts_enabled")
        .eq("tenant_id", tenant!.id)
        .maybeSingle();

      if (error) throw error;
      return (data ?? null) as HeaderAlertSettings | null;
    },
  });

  useEffect(() => {
    setRepeatInput(String(normalizeRepeatSeconds(alertSettings?.appointment_alert_repeat_seconds)));
  }, [alertSettings?.appointment_alert_repeat_seconds]);

  useEffect(() => {
    if (!tenant?.id || !user?.id) return;

    const channel = supabase
      .channel(`header-app-notifications-${tenant.id}-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "app_notifications",
          filter: `recipient_user_id=eq.${user.id}`,
        },
        () => {
          qc.invalidateQueries({ queryKey: ["app-notifications", tenant.id, user.id] });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [qc, tenant?.id, user?.id]);

  const unreadNotifications = useMemo(
    () => notifications.filter((notification) => !notification.read_at),
    [notifications],
  );
  const unreadCount = unreadNotifications.length;

  const markNotificationRead = async (notificationId: string) => {
    if (!user?.id) return;

    const { error } = await dynamicSupabase
      .from<unknown>("app_notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("id", notificationId)
      .eq("recipient_user_id", user.id);

    if (error) {
      toast.error("Não foi possível marcar a notificação como lida.");
      return;
    }

    qc.invalidateQueries({ queryKey: ["app-notifications", tenant?.id, user.id] });
  };

  const markAllNotificationsRead = async () => {
    if (!user?.id || unreadNotifications.length === 0) return;

    const { error } = await dynamicSupabase
      .from<unknown>("app_notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("recipient_user_id", user.id)
      .in(
        "id",
        unreadNotifications.map((notification) => notification.id),
      );

    if (error) {
      toast.error("Não foi possível marcar tudo como lido.");
      return;
    }

    qc.invalidateQueries({ queryKey: ["app-notifications", tenant?.id, user.id] });
  };

  const saveAppointmentAlertSettings = async (nextReceptionEnabled?: boolean) => {
    if (!tenant?.id) return;
    setSavingAlertSettings(true);

    try {
      const repeatSeconds = normalizeRepeatSeconds(repeatInput);
      const { error } = await dynamicSupabase.from<unknown>("tenant_settings").upsert(
        {
          tenant_id: tenant.id,
          appointment_alert_repeat_seconds: repeatSeconds,
          appointment_reception_alerts_enabled:
            nextReceptionEnabled ?? alertSettings?.appointment_reception_alerts_enabled !== false,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "tenant_id" },
      );

      if (error) throw error;

      setRepeatInput(String(repeatSeconds));
      qc.invalidateQueries({ queryKey: ["appointment-alert-settings", tenant.id] });
      toast.success("Alertas de agendamento atualizados.");
    } catch (error: unknown) {
      toast.error(errorMessage(error, "Não foi possível salvar os alertas."));
    } finally {
      setSavingAlertSettings(false);
    }
  };

  const activatePushOnDevice = async () => {
    if (!tenant?.id || !user?.id) return;
    setActivatingPush(true);

    try {
      const result = await ensureAppointmentPushSubscription({
        tenantId: tenant.id,
        userId: user.id,
      });
      if (result.ok) toast.success(result.message);
      else if (result.status === "missing-vapid") toast.warning(result.message);
      else toast.error(result.message);
    } catch (error: unknown) {
      toast.error(errorMessage(error, "Não foi possível ativar notificações neste dispositivo."));
    } finally {
      setActivatingPush(false);
    }
  };

  useEffect(() => {
    return () => {
      if (previewUrl?.startsWith("blob:")) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const email = user?.email ?? null;
  const userMetadata = (user?.user_metadata ?? {}) as UserMetadata;
  const fullName = userMetadata.full_name ?? null;
  const savedAvatarUrl = professionalPhotoUrl ?? userMetadata.avatar_url ?? null;
  const avatarUrl = previewUrl ?? savedAvatarUrl;

  const initials = (fullName ?? email ?? "U")
    .split(" ")
    .map((w: string) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const roleLabel =
    role === "super_admin"
      ? "SaaS Admin"
      : role === "owner"
        ? "Proprietário"
        : role === "barber"
          ? "Colaborador"
          : role === "staff"
            ? "Staff"
            : "Usuário";

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    nav({ to: "/auth", search: { redirect: "/app" }, replace: true });
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      setPreviewUrl(URL.createObjectURL(selectedFile));
    }
  };

  const savePhoto = async () => {
    if (!file || !user) return;
    setUploading(true);
    try {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `${tenant?.id}/pros/${Date.now()}-${safeName}`;

      const { error: uploadError } = await supabase.storage
        .from("assets")
        .upload(path, file, { upsert: true, contentType: file.type || "image/jpeg" });
      if (uploadError) throw uploadError;

      const { data: signed, error: signedError } = await supabase.storage
        .from("assets")
        .createSignedUrl(path, 60 * 60 * 24 * 365 * 5);
      if (signedError || !signed?.signedUrl)
        throw new Error("Não foi possível gerar a URL da foto.");

      const photoUrl = signed.signedUrl;

      // Update the professional record
      const { error: updateError } = await supabase
        .from("professionals")
        .update({ photo_url: photoUrl })
        .eq("auth_user_id", user.id);
      if (updateError) throw updateError;

      // Also update auth user metadata
      await supabase.auth.updateUser({
        data: { avatar_url: photoUrl },
      });

      toast.success("Foto de perfil atualizada!");
      setPhotoOpen(false);
      setFile(null);
      setPreviewUrl(null);
      qc.setQueryData(["header-professional-photo", user.id], photoUrl);

      qc.invalidateQueries({ queryKey: ["pros"] });
      qc.invalidateQueries({ queryKey: ["pros-all"] });
      qc.invalidateQueries({ queryKey: ["current-tenant"] });
    } catch (error: unknown) {
      toast.error(errorMessage(error, "Erro ao salvar foto."));
    } finally {
      setUploading(false);
    }
  };

  return (
    <header className="h-16 border-b bg-background flex items-center gap-3 px-4 sticky top-0 z-30">
      <button
        onClick={toggleSidebar}
        className="h-9 w-9 rounded-lg hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground active:scale-95 transition-all duration-200"
        aria-label="Abrir Menu"
      >
        <Menu className="h-5 w-5" />
      </button>
      <div className="relative flex-1 max-w-2xl">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar agendamentos, clientes..."
          className="pl-9 bg-muted/40 border-transparent focus-visible:bg-background"
        />
      </div>
      <Popover>
        <PopoverTrigger asChild>
          <button
            className="relative grid h-9 w-9 place-items-center rounded-full hover:bg-muted"
            aria-label="Notificações"
          >
            <Bell className="h-4 w-4" />
            {unreadCount > 0 ? (
              <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            ) : null}
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-[min(92vw,430px)] p-0">
          <div className="flex items-start justify-between gap-3 border-b p-4">
            <div>
              <p className="flex items-center gap-2 text-sm font-semibold">
                <BellRing className="h-4 w-4 text-primary" />
                Notificações
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {unreadCount > 0 ? `${unreadCount} não lida(s)` : "Tudo em dia por aqui."}
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={markAllNotificationsRead}
              disabled={unreadCount === 0}
            >
              <CheckCheck className="mr-2 h-4 w-4" />
              Ler tudo
            </Button>
          </div>

          <ScrollArea className="max-h-80">
            <div className="p-2">
              {notifications.length > 0 ? (
                notifications.map((notification) => (
                  <button
                    key={notification.id}
                    type="button"
                    className={`flex w-full items-start gap-3 rounded-2xl p-3 text-left transition hover:bg-muted ${
                      notification.read_at ? "opacity-75" : "bg-primary/5"
                    }`}
                    onClick={async () => {
                      await markNotificationRead(notification.id);
                      nav({ to: "/app/agenda" });
                    }}
                  >
                    <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-amber-100 text-amber-700">
                      <BellRing className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-semibold">{notification.title}</span>
                        <span className="whitespace-nowrap text-[11px] text-muted-foreground">
                          {formatNotificationTime(notification.created_at)}
                        </span>
                      </span>
                      <span className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                        {notification.body}
                      </span>
                    </span>
                    {!notification.read_at ? (
                      <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-primary" />
                    ) : null}
                  </button>
                ))
              ) : (
                <div className="grid place-items-center rounded-2xl border border-dashed p-6 text-center">
                  <Clock3 className="h-8 w-8 text-muted-foreground/60" />
                  <p className="mt-2 text-sm font-medium">Nenhuma notificação ainda</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Novos agendamentos aparecem aqui em tempo real.
                  </p>
                </div>
              )}
            </div>
          </ScrollArea>

          <Separator />

          <div className="space-y-3 p-4">
            <Button
              variant="outline"
              className="w-full justify-start"
              onClick={activatePushOnDevice}
              disabled={activatingPush || !tenant?.id || !user?.id}
            >
              <Volume2 className="mr-2 h-4 w-4" />
              {activatingPush ? "Ativando..." : "Ativar notificações neste dispositivo"}
            </Button>

            {canManageAppointmentAlerts ? (
              <div className="rounded-2xl border bg-muted/30 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <Label className="text-xs font-semibold">Modo recepção</Label>
                    <p className="text-[11px] leading-relaxed text-muted-foreground">
                      Avisa owner/staff além do profissional escolhido.
                    </p>
                  </div>
                  <Switch
                    checked={alertSettings?.appointment_reception_alerts_enabled !== false}
                    disabled={savingAlertSettings}
                    onCheckedChange={(checked) => void saveAppointmentAlertSettings(checked)}
                  />
                </div>

                <div className="mt-3">
                  <Label className="text-xs font-semibold">
                    Intervalo entre alertas (segundos)
                  </Label>
                  <div className="mt-1 flex gap-2">
                    <div className="relative flex-1">
                      <Input
                        value={repeatInput}
                        onChange={(event) =>
                          setRepeatInput(event.target.value.replace(/\D/g, "").slice(0, 3))
                        }
                        inputMode="numeric"
                        aria-label="Intervalo entre alertas em segundos"
                        placeholder="Ex.: 20"
                        className="h-9 pr-20"
                      />
                      <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted-foreground">
                        segundos
                      </span>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => void saveAppointmentAlertSettings()}
                      disabled={savingAlertSettings}
                    >
                      Salvar
                    </Button>
                  </div>
                  <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                    Define de quantos em quantos segundos o som será repetido até alguém clicar em
                    Ok. Valor permitido: 5 a 300 segundos.
                  </p>
                </div>
              </div>
            ) : null}
          </div>
        </PopoverContent>
      </Popover>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="flex items-center gap-2 rounded-lg hover:bg-muted px-2 py-1.5 cursor-pointer">
            <div className="text-right hidden sm:block">
              <div className="text-sm font-medium leading-tight">{fullName ?? "Usuário"}</div>
              <div className="text-xs text-muted-foreground leading-tight">{roleLabel}</div>
            </div>
            <Avatar className="h-8 w-8">
              <AvatarImage src={avatarUrl ?? undefined} />
              <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                {initials}
              </AvatarFallback>
            </Avatar>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel>{email}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setPhotoOpen(true)} className="cursor-pointer">
            <Camera className="h-4 w-4 mr-2" /> Alterar Minha Foto
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={signOut}
            className="cursor-pointer text-destructive focus:text-destructive"
          >
            <LogOut className="h-4 w-4 mr-2" /> Sair
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={photoOpen} onOpenChange={setPhotoOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Alterar Foto de Perfil</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="flex flex-col items-center gap-4">
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  className="h-32 w-32 rounded-full object-cover border-2 border-primary shadow-md"
                  alt="Preview"
                />
              ) : (
                <div className="h-32 w-32 rounded-full bg-muted flex items-center justify-center text-muted-foreground text-sm">
                  Sem foto
                </div>
              )}
              <div className="w-full">
                <Label className="text-xs text-muted-foreground uppercase font-semibold mb-2 block">
                  Escolher arquivo
                </Label>
                <Input
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  className="cursor-pointer"
                />
              </div>
              <p className="text-xs text-muted-foreground text-center">
                A foto será exibida no painel de agendamentos da barbearia.
              </p>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => {
                setPhotoOpen(false);
                setFile(null);
              }}
            >
              Cancelar
            </Button>
            <Button onClick={savePhoto} disabled={uploading || !file}>
              {uploading ? "Salvando..." : "Salvar Foto"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </header>
  );
}

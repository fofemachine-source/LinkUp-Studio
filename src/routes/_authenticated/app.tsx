import { createFileRoute, Outlet, redirect, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Eye, EyeOff, Loader2, LockKeyhole } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";

import { AppHeader } from "@/components/app-header";
import { AppSidebar } from "@/components/app-sidebar";
import { BottomNav } from "@/components/bottom-nav";
import { ProfessionalAppointmentNotifier } from "@/components/notifications/professional-appointment-notifier";
import { TenantAccessScreen } from "@/components/tenant-access-screen";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import {
  getTenantAccess,
  tenantAccessQueryKey,
  useCurrentTenant,
  useIsSuperAdmin,
  useTenantAccess,
} from "@/hooks/use-tenant";
import { supabase } from "@/integrations/supabase/client";
import { canAccessAppPath, getDefaultAppPath } from "@/lib/access-control";
import {
  buildAdminPwaDisplayName,
  buildAdminPwaHeadLinks,
  normalizePwaHexColor,
} from "@/lib/pwa-identity";
import { syncPwaDocumentHead } from "@/lib/pwa-head";
import {
  projectPasswordAuthErrorMessage,
  validateProjectPassword,
} from "@/lib/password-policy";

export const Route = createFileRoute("/_authenticated/app")({
  beforeLoad: async ({ context, location }) => {
    const access = await getTenantAccess(context.queryClient);
    const hasTenant = Boolean(
      access.activeTenantId || access.roles.some(({ tenant_id }) => tenant_id),
    );

    if (access.isSuperAdmin && !hasTenant) {
      throw redirect({ to: "/saas" });
    }

    if (!access.isSuperAdmin && !hasTenant) {
      throw redirect({
        to: "/auth",
        search: { redirect: location.pathname },
        replace: true,
      });
    }

    if (hasTenant && !canAccessAppPath(location.pathname, access)) {
      throw redirect({
        to: getDefaultAppPath(access) as never,
        replace: true,
      });
    }
  },
  loader: async ({ context }) => getTenantAccess(context.queryClient),
  head: ({ loaderData }) => {
    const tenant = loaderData?.tenant;
    if (!tenant?.slug) return {};

    const title = buildAdminPwaDisplayName(tenant.name);
    const links = buildAdminPwaHeadLinks(tenant.slug, tenant.logo_url);

    return {
      links: [
        { rel: "manifest", href: links.manifestHref },
        { rel: "icon", href: links.faviconHref },
        { rel: "apple-touch-icon", href: links.appleTouchIconHref },
      ],
      meta: [
        { title },
        { name: "apple-mobile-web-app-title", content: title },
        { name: "application-name", content: title },
        { name: "theme-color", content: normalizePwaHexColor(tenant.primary_color) },
      ],
    };
  },
  component: AppLayout,
});

function AppLayout() {
  const tenantQuery = useCurrentTenant();
  const superAdminQuery = useIsSuperAdmin();
  const accessQuery = useTenantAccess();
  const tenant = tenantQuery.data;
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const isSuperAdmin = superAdminQuery.data === true;
  const tenantBlocked = !isSuperAdmin && tenant?.status === "blocked";
  const hasTenantAccess = Boolean(
    accessQuery.data?.activeTenantId ||
      accessQuery.data?.roles.some(({ tenant_id }) => tenant_id),
  );

  useEffect(() => {
    if (!tenant?.slug) return;

    const links = buildAdminPwaHeadLinks(tenant.slug, tenant.logo_url);
    syncPwaDocumentHead({
      title: buildAdminPwaDisplayName(tenant.name),
      themeColor: normalizePwaHexColor(tenant.primary_color),
      tenantSlug: tenant.slug,
      ...links,
    });
  }, [tenant?.slug, tenant?.name, tenant?.logo_url, tenant?.primary_color]);

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", search: { redirect: "/app" }, replace: true });
  }

  if (tenantQuery.isLoading || superAdminQuery.isLoading || accessQuery.isLoading) {
    return (
      <main className="grid min-h-screen place-items-center bg-slate-950 text-white">
        <div className="flex items-center gap-3 text-sm text-slate-300">
          <Loader2 className="h-5 w-5 animate-spin text-amber-400" />
          Validando acesso ao salão…
        </div>
      </main>
    );
  }

  if (tenantQuery.isError || superAdminQuery.isError || accessQuery.isError) {
    return (
      <TenantAccessScreen
        error
        isRefreshing={tenantQuery.isFetching}
        onRefresh={() => tenantQuery.refetch()}
        onSignOut={signOut}
      />
    );
  }

  if (tenantBlocked) {
    return (
      <TenantAccessScreen
        tenant={tenant}
        isRefreshing={tenantQuery.isFetching}
        onRefresh={() => tenantQuery.refetch()}
        onSignOut={signOut}
      />
    );
  }

  if (!isSuperAdmin && !hasTenantAccess) {
    return (
      <TenantAccessScreen
        accessDisabled
        isRefreshing={accessQuery.isFetching}
        onRefresh={() => accessQuery.refetch()}
        onSignOut={signOut}
      />
    );
  }

  if (accessQuery.data?.mustChangePassword) {
    return (
      <ProvisionalPasswordScreen
        professionalId={accessQuery.data.professionalId}
        userId={accessQuery.data.userId}
        onSignOut={signOut}
      />
    );
  }

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background pb-[calc(4.5rem+env(safe-area-inset-bottom))] md:pb-0">
        <AppSidebar />
        <SidebarInset className="flex flex-1 flex-col">
          <AppHeader />
          <main className="flex-1 p-6 md:p-8">
            <div className="animate-page-enter">
              <Outlet />
            </div>
          </main>
        </SidebarInset>
        <BottomNav />
        <ProfessionalAppointmentNotifier />
      </div>
    </SidebarProvider>
  );
}

function ProvisionalPasswordScreen({
  professionalId,
  userId,
  onSignOut,
}: {
  professionalId: string | null;
  userId: string | null;
  onSignOut: () => Promise<void>;
}) {
  const queryClient = useQueryClient();
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;

    const passwordError = validateProjectPassword(password);
    if (passwordError) {
      setError(passwordError);
      return;
    }
    if (password !== confirmation) {
      setError("A confirmação não corresponde à nova senha.");
      return;
    }
    if (!professionalId || !userId) {
      setError("Não foi possível identificar o vínculo deste acesso.");
      return;
    }

    setSaving(true);
    setError("");
    const { error: passwordUpdateError } = await supabase.auth.updateUser({ password });
    if (passwordUpdateError) {
      setError(
        projectPasswordAuthErrorMessage(
          passwordUpdateError,
          "Não foi possível definir sua senha pessoal.",
        ),
      );
      setSaving(false);
      return;
    }

    const { error: flagUpdateError } = await supabase
      .from("professionals")
      .update({ must_change_password: false })
      .eq("id", professionalId)
      .eq("auth_user_id", userId);
    if (flagUpdateError) {
      setError(
        "A senha foi alterada, mas não foi possível concluir a liberação. Tente salvar novamente.",
      );
      setSaving(false);
      return;
    }

    setPassword("");
    setConfirmation("");
    await queryClient.invalidateQueries({ queryKey: tenantAccessQueryKey });
    setSaving(false);
  }

  return (
    <main className="grid min-h-screen place-items-center bg-slate-950 p-4 text-white">
      <Card className="w-full max-w-md border-white/10 bg-slate-900 text-white shadow-2xl">
        <CardHeader className="space-y-3">
          <div className="grid h-12 w-12 place-items-center rounded-xl bg-amber-400/15 text-amber-400">
            <LockKeyhole className="h-6 w-6" />
          </div>
          <CardTitle>Crie sua senha pessoal</CardTitle>
          <CardDescription className="text-slate-300">
            Este é seu primeiro acesso com a senha provisória. Defina uma nova senha que
            somente você conheça, com no mínimo 8 caracteres, letras e números.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={submit}>
            <div className="space-y-2">
              <Label htmlFor="new-password">Nova senha</Label>
              <div className="relative">
                <Input
                  id="new-password"
                  className="pr-10"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  disabled={saving}
                />
                <button
                  type="button"
                  className="absolute inset-y-0 right-2 grid place-items-center rounded-md px-2 text-slate-400 transition hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                  disabled={saving}
                  onClick={() => setShowPassword((visible) => !visible)}
                  aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-password">Confirme a nova senha</Label>
              <div className="relative">
                <Input
                  id="confirm-password"
                  className="pr-10"
                  type={showConfirmation ? "text" : "password"}
                  autoComplete="new-password"
                  value={confirmation}
                  onChange={(event) => setConfirmation(event.target.value)}
                  disabled={saving}
                />
                <button
                  type="button"
                  className="absolute inset-y-0 right-2 grid place-items-center rounded-md px-2 text-slate-400 transition hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                  disabled={saving}
                  onClick={() => setShowConfirmation((visible) => !visible)}
                  aria-label={showConfirmation ? "Ocultar senha" : "Mostrar senha"}
                >
                  {showConfirmation ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>
            {error ? (
              <p role="alert" className="text-sm text-red-300">
                {error}
              </p>
            ) : null}
            <Button className="w-full" type="submit" disabled={saving}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Salvar minha senha
            </Button>
            <Button
              className="w-full text-slate-300 hover:text-white"
              type="button"
              variant="ghost"
              disabled={saving}
              onClick={() => void onSignOut()}
            >
              Sair
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}

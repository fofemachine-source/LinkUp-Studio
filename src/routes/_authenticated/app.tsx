import { createFileRoute, Outlet, redirect, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";

import { AppHeader } from "@/components/app-header";
import { AppSidebar } from "@/components/app-sidebar";
import { BottomNav } from "@/components/bottom-nav";
import { ProfessionalAppointmentNotifier } from "@/components/notifications/professional-appointment-notifier";
import { TenantAccessScreen } from "@/components/tenant-access-screen";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { getTenantAccess, useCurrentTenant, useIsSuperAdmin } from "@/hooks/use-tenant";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/app")({
  beforeLoad: async ({ context }) => {
    const access = await getTenantAccess(context.queryClient);
    const hasTenant = Boolean(
      access.activeTenantId || access.roles.some(({ tenant_id }) => tenant_id),
    );

    if (access.isSuperAdmin && !hasTenant) {
      throw redirect({ to: "/saas" });
    }
  },
  component: AppLayout,
});

function AppLayout() {
  const tenantQuery = useCurrentTenant();
  const superAdminQuery = useIsSuperAdmin();
  const tenant = tenantQuery.data;
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const isSuperAdmin = superAdminQuery.data === true;
  const tenantBlocked = !isSuperAdmin && tenant?.status === "blocked";

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", search: { redirect: "/app" }, replace: true });
  }

  if (tenantQuery.isLoading || superAdminQuery.isLoading) {
    return (
      <main className="grid min-h-screen place-items-center bg-slate-950 text-white">
        <div className="flex items-center gap-3 text-sm text-slate-300">
          <Loader2 className="h-5 w-5 animate-spin text-amber-400" />
          Validando acesso ao salão…
        </div>
      </main>
    );
  }

  if (tenantQuery.isError || superAdminQuery.isError) {
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

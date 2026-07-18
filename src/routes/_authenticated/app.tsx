import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { AppHeader } from "@/components/app-header";
import { BottomNav } from "@/components/bottom-nav";
import { TenantAccessScreen } from "@/components/tenant-access-screen";
import { getTenantAccess, useCurrentTenant, useIsSuperAdmin } from "@/hooks/use-tenant";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { toast } from "sonner";
import { useNavigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app")({
  beforeLoad: async ({ context }) => {
    const access = await getTenantAccess(context.queryClient);
    const hasTenant = Boolean(access.activeTenantId || access.roles.some(({ tenant_id }) => tenant_id));

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
  const tenantId = tenant?.id;
  const qc = useQueryClient();
  const navigate = useNavigate();
  const isSuperAdmin = superAdminQuery.data === true;
  const tenantBlocked = !isSuperAdmin && tenant?.status === "blocked";

  useEffect(() => {
    if (!tenantId || tenantBlocked) return;

    const channel = supabase
      .channel(`new-appointments-${tenantId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "appointments",
          filter: `tenant_id=eq.${tenantId}`,
        },
        (payload) => {
          const appt = payload.new;

          // Play notification sound
          const audio = new Audio("https://assets.mixkit.co/active_storage/sfx/2869/2869-84.wav");
          audio.play().catch((err) => console.log("Sound play prevented or failed", err));

          // Invalidate agenda/appointment queries to update realtime agenda UI
          qc.invalidateQueries({ queryKey: ["appts"] });

          // Toast notice
          const formattedTime = new Date(appt.start_at).toLocaleTimeString("pt-BR", {
            hour: "2-digit",
            minute: "2-digit",
          });
          toast.success(`Novo agendamento: ${appt.client_name} às ${formattedTime}`, {
            duration: 8000,
          });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [tenantBlocked, tenantId, qc]);

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", search: { redirect: "/app" }, replace: true });
  }

  if (tenantQuery.isLoading || superAdminQuery.isLoading) {
    return (
      <main className="min-h-screen bg-slate-950 text-white grid place-items-center">
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
      <div className="min-h-screen flex w-full bg-background pb-16 md:pb-0">
        <AppSidebar />
        <SidebarInset className="flex-1 flex flex-col">
          <AppHeader />
          <main className="flex-1 p-6 md:p-8">
            <div className="animate-page-enter">
              <Outlet />
            </div>
          </main>
        </SidebarInset>
        <BottomNav />
      </div>
    </SidebarProvider>
  );
}

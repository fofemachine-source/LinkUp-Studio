import { createFileRoute, Outlet } from "@tanstack/react-router";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { AppHeader } from "@/components/app-header";
import { BottomNav } from "@/components/bottom-nav";
import { useCurrentTenant } from "@/hooks/use-tenant";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/app")({
  component: AppLayout,
});

function AppLayout() {
  const { data: tenant } = useCurrentTenant();
  const tenantId = tenant?.id;
  const qc = useQueryClient();

  useEffect(() => {
    if (!tenantId) return;

    const channel = supabase
      .channel(`new-appointments-${tenantId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "appointments",
          filter: `tenant_id=eq.${tenantId}`
        },
        (payload: any) => {
          const appt = payload.new;
          
          // Play notification sound
          const audio = new Audio("https://assets.mixkit.co/active_storage/sfx/2869/2869-84.wav");
          audio.play().catch(err => console.log("Sound play prevented or failed", err));

          // Invalidate agenda/appointment queries to update realtime agenda UI
          qc.invalidateQueries({ queryKey: ["appts"] });

          // Toast notice
          const formattedTime = new Date(appt.start_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
          toast.success(`Novo agendamento: ${appt.client_name} às ${formattedTime}`, {
            duration: 8000,
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [tenantId, qc]);

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

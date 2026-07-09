import { createFileRoute, Outlet, useLocation } from "@tanstack/react-router";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { AppHeader } from "@/components/app-header";

export const Route = createFileRoute("/_authenticated/app")({
  component: AppLayout,
});

function AppLayout() {
  const location = useLocation();
  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background animate-fade-in">
        <AppSidebar />
        <SidebarInset className="flex-1 flex flex-col">
          <AppHeader />
          <main className="flex-1 p-6 md:p-8 overflow-hidden">
            <div key={location.pathname} className="page-transition h-full w-full">
              <Outlet />
            </div>
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}

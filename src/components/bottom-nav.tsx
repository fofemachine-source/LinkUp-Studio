import { Link, useRouterState } from "@tanstack/react-router";
import { useCurrentTenant, useUserRole } from "@/hooks/use-tenant";
import { useSidebar } from "@/components/ui/sidebar";
import { Calendar, ShoppingBag, DollarSign, LayoutDashboard, Wallet, Menu } from "lucide-react";

export function BottomNav() {
  const currentPath = useRouterState({ select: (r) => r.location.pathname });
  const { data: tenant, isLoading: tenantLoading } = useCurrentTenant();
  const { data: role, isLoading: roleLoading } = useUserRole(tenant?.id);
  const { setOpenMobile } = useSidebar();

  const isBarber = role === "barber";
  const isLoading = tenantLoading || (tenant?.id ? roleLoading : true);

  if (isLoading) return null;

  const isActive = (path: string) => path === "/app" ? currentPath === "/app" : currentPath.startsWith(path);

  // Dynamic bottom items based on role
  const navItems = isBarber
    ? [
        { title: "Agenda", path: "/app/agenda", icon: Calendar },
        { title: "Estoque", path: "/app/estoque", icon: ShoppingBag },
        { title: "Comissões", path: "/app/comissoes", icon: DollarSign },
      ]
    : [
        { title: "Painel", path: "/app", icon: LayoutDashboard },
        { title: "Agenda", path: "/app/agenda", icon: Calendar },
        { title: "Comandas", path: "/app/comandas", icon: ShoppingBag },
        { title: "Caixa", path: "/app/caixa", icon: Wallet },
      ];

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 bg-background/80 backdrop-blur-lg border-t border-border/40 py-2 pb-safe md:hidden flex justify-around items-center px-4 shadow-[0_-4px_16px_rgba(0,0,0,0.03)]">
      {navItems.map((item) => {
        const Icon = item.icon;
        const active = isActive(item.path);
        return (
          <Link
            key={item.path}
            to={item.path}
            className={`flex flex-col items-center gap-1 transition-all duration-200 active:scale-95 py-1 px-3 rounded-xl ${
              active 
                ? "text-primary font-medium" 
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Icon className={`h-5 w-5 transition-transform duration-300 ${active ? "scale-110" : ""}`} />
            <span className="text-[10px] tracking-wide font-medium">{item.title}</span>
          </Link>
        );
      })}
    </div>
  );
}

import { Link, useRouterState } from "@tanstack/react-router";
import { Award, Calendar, Landmark, LayoutDashboard, ShoppingCart } from "lucide-react";

import { useSidebar } from "@/components/ui/sidebar";
import { useTenantAccess } from "@/hooks/use-tenant";
import { canAccessAppPath } from "@/lib/access-control";

const mobileItems = [
  { title: "Painel Geral", path: "/app", icon: LayoutDashboard },
  { title: "Comandas / Venda", path: "/app/comandas", icon: ShoppingCart },
  { title: "Agenda", path: "/app/agenda", icon: Calendar },
  { title: "Financeiro", path: "/app/financeiro", icon: Landmark },
  { title: "Comissões", path: "/app/comissoes", icon: Award },
];

export function BottomNav() {
  const currentPath = useRouterState({ select: (router) => router.location.pathname });
  const { data: access, isLoading: accessLoading } = useTenantAccess();
  const { setOpenMobile } = useSidebar();

  const navItems = access
    ? mobileItems.filter((item) => canAccessAppPath(item.path, access)).slice(0, 5)
    : [];

  const isActive = (path: string) =>
    path === "/app" ? currentPath === "/app" : currentPath.startsWith(path);

  if (accessLoading) return null;

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border/70 bg-background/92 shadow-[0_-10px_28px_-24px_rgba(15,23,42,0.65)] backdrop-blur-xl md:hidden"
      aria-label="Navegação principal"
    >
      <div
        className="flex w-full items-stretch gap-0 px-1.5 pt-2"
        style={{ paddingBottom: "calc(0.5rem + env(safe-area-inset-bottom))" }}
      >
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.path);
          return (
            <Link
              key={item.path}
              to={item.path}
              preload="intent"
              aria-current={active ? "page" : undefined}
              onClick={() => setOpenMobile(false)}
              className={`flex h-14 min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-xl px-0.5 text-center text-[10px] font-medium leading-tight transition-colors active:bg-muted ${
                active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="h-5 w-5" />
              <span className="break-words">{item.title}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

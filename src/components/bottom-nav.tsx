import { Link, useRouterState } from "@tanstack/react-router";
import {
  Award,
  Calendar,
  CreditCard,
  Crown,
  Landmark,
  LayoutDashboard,
  Package,
  Settings,
  ShoppingCart,
  Users,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { useSidebar } from "@/components/ui/sidebar";
import { useCurrentTenant, useUserRole } from "@/hooks/use-tenant";

const ownerItems = [
  { title: "Painel Geral", path: "/app", icon: LayoutDashboard },
  { title: "Comandas / Venda", path: "/app/comandas", icon: ShoppingCart },
  { title: "Agenda", path: "/app/agenda", icon: Calendar },
  { title: "Financeiro", path: "/app/financeiro", icon: Landmark },
  { title: "Cadastros", path: "/app/cadastros", icon: Users },
  { title: "Assinaturas", path: "/app/assinantes", icon: Crown },
  { title: "Estoque", path: "/app/estoque", icon: Package },
  { title: "Comissões", path: "/app/comissoes", icon: Award },
  { title: "Configurações", path: "/app/configuracoes", icon: Settings },
  { title: "Minha Assinatura", path: "/app/assinatura", icon: CreditCard },
];

const barberItems = ownerItems.filter((item) =>
  ["Agenda", "Estoque", "Comissões"].includes(item.title),
);

export function BottomNav() {
  const currentPath = useRouterState({ select: (router) => router.location.pathname });
  const { data: tenant, isLoading: tenantLoading } = useCurrentTenant();
  const { data: role, isLoading: roleLoading } = useUserRole(tenant?.id);
  const { setOpenMobile } = useSidebar();
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const activeRef = useRef<HTMLAnchorElement | null>(null);
  const [edgeState, setEdgeState] = useState({ left: false, right: true });

  const isBarber = role === "barber";
  const isLoading = tenantLoading || (tenant?.id ? roleLoading : true);
  const navItems = isBarber ? barberItems : ownerItems;

  const isActive = (path: string) =>
    path === "/app" ? currentPath === "/app" : currentPath.startsWith(path);

  const updateEdges = useCallback(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const maxScrollLeft = Math.max(0, scroller.scrollWidth - scroller.clientWidth);
    setEdgeState({
      left: scroller.scrollLeft > 6,
      right: scroller.scrollLeft < maxScrollLeft - 6,
    });
  }, []);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      activeRef.current?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
      updateEdges();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [currentPath, updateEdges]);

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    updateEdges();
    scroller.addEventListener("scroll", updateEdges, { passive: true });
    window.addEventListener("resize", updateEdges);
    return () => {
      scroller.removeEventListener("scroll", updateEdges);
      window.removeEventListener("resize", updateEdges);
    };
  }, [isLoading, updateEdges]);

  if (isLoading) return null;

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border/70 bg-background/92 shadow-[0_-10px_28px_-24px_rgba(15,23,42,0.65)] backdrop-blur-xl md:hidden"
      aria-label="Navegação principal"
    >
      <div className="relative">
        <div
          ref={scrollerRef}
          className="flex touch-pan-x snap-x snap-proximity items-stretch gap-1.5 overflow-x-auto overscroll-x-contain px-3 pt-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          style={{ paddingBottom: "calc(0.5rem + env(safe-area-inset-bottom))" }}
        >
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.path);
            return (
              <Link
                key={item.path}
                ref={active ? activeRef : undefined}
                to={item.path}
                preload="intent"
                aria-current={active ? "page" : undefined}
                onClick={() => setOpenMobile(false)}
                className={`flex h-14 shrink-0 snap-center flex-col items-center justify-center gap-1 whitespace-nowrap rounded-xl px-3 text-[10px] font-medium transition-colors active:bg-muted ${
                  active
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon className="h-5 w-5" />
                <span>{item.title}</span>
              </Link>
            );
          })}
        </div>

        {edgeState.left ? (
          <div className="pointer-events-none absolute inset-y-0 left-0 w-7 bg-gradient-to-r from-background via-background/90 to-transparent" />
        ) : null}
        {edgeState.right ? (
          <div className="pointer-events-none absolute inset-y-0 right-0 w-7 bg-gradient-to-l from-background via-background/90 to-transparent" />
        ) : null}
      </div>
    </nav>
  );
}

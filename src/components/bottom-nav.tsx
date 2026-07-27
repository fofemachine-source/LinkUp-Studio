import { Link, useRouterState } from "@tanstack/react-router";
import { Award, Calendar, Landmark, LayoutDashboard, ShoppingCart, Users } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { useSidebar } from "@/components/ui/sidebar";
import { useCurrentTenant, useTenantAccess } from "@/hooks/use-tenant";
import { canAccessAppPath } from "@/lib/access-control";

const mobileItems = [
  { title: "Painel Geral", path: "/app", icon: LayoutDashboard },
  { title: "Comandas / Venda", path: "/app/comandas", icon: ShoppingCart },
  { title: "Agenda", path: "/app/agenda", icon: Calendar },
  { title: "Comissões", path: "/app/comissoes", icon: Award },
  { title: "Financeiro", path: "/app/financeiro", icon: Landmark },
  { title: "Cadastros", path: "/app/cadastros", icon: Users },
];

export function BottomNav() {
  const currentPath = useRouterState({ select: (router) => router.location.pathname });
  const { data: tenant, isLoading: tenantLoading } = useCurrentTenant();
  const { data: access, isLoading: accessLoading } = useTenantAccess();
  const { setOpenMobile } = useSidebar();
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const activeRef = useRef<HTMLAnchorElement | null>(null);
  const [edgeState, setEdgeState] = useState({ left: false, right: true });

  const isLoading = tenantLoading || accessLoading;
  const navItems = access
    ? mobileItems.filter((item) => canAccessAppPath(item.path, access))
    : [];

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
          className="flex w-full touch-pan-x snap-x snap-proximity items-stretch gap-1 overflow-x-auto overscroll-x-contain px-1.5 pt-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
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
                className={`flex h-14 min-w-0 flex-1 snap-center flex-col items-center justify-center gap-1 rounded-xl px-1 text-center text-[10px] font-medium leading-tight transition-colors active:bg-muted ${
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

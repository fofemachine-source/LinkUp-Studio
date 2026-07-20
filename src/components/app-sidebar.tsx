import { Link, useRouterState } from "@tanstack/react-router";
import { Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarHeader, SidebarFooter, useSidebar } from "@/components/ui/sidebar";
import { LayoutDashboard, Calendar, ShoppingCart, Users, Crown, Landmark, Package, Award, Settings, CreditCard, Scissors } from "lucide-react";
import { useCurrentTenant, useUserRole } from "@/hooks/use-tenant";

const items = [
  { title: "Painel Geral", url: "/app", icon: LayoutDashboard },
  { title: "Agenda", url: "/app/agenda", icon: Calendar },
  { title: "Comandas / Venda", url: "/app/comandas", icon: ShoppingCart },
  { title: "Cadastros", url: "/app/cadastros", icon: Users },
  { title: "Assinaturas", url: "/app/assinantes", icon: Crown },
  { title: "Financeiro", url: "/app/financeiro", icon: Landmark },
  { title: "Estoque", url: "/app/estoque", icon: Package },
  { title: "Comissões", url: "/app/comissoes", icon: Award },
  { title: "Configurações", url: "/app/configuracoes", icon: Settings },
  { title: "Minha Assinatura", url: "/app/assinatura", icon: CreditCard },
];

export function AppSidebar() {
  const currentPath = useRouterState({ select: (r) => r.location.pathname });
  const { data: tenant, isLoading: tenantLoading } = useCurrentTenant();
  const { data: role, isLoading: roleLoading } = useUserRole(tenant?.id);
  const { setOpenMobile } = useSidebar();
  const isActive = (path: string) => path === "/app" ? currentPath === "/app" : currentPath.startsWith(path);

  const isBarber = role === "barber";
  const isLoading = tenantLoading || (tenant?.id ? roleLoading : true);

  const visibleItems = items.filter((item) => {
    if (isLoading) {
      return false; // Evita piscar abas administrativas antes do papel carregar
    }
    if (isBarber) {
      return ["Agenda", "Comissões", "Estoque"].includes(item.title);
    }
    return true;
  });

  return (
    <Sidebar collapsible="icon" className="dark bg-[#0a0a0a] text-white border-r border-white/5">
      <SidebarHeader className="border-b border-white/5 py-4">
        <div className="flex items-center gap-3 px-2">
          <div className="h-11 w-11 rounded-xl bg-primary text-primary-foreground grid place-items-center shadow-sm shrink-0">
            {tenant?.logo_url
              ? <img src={tenant.logo_url} alt="" className="h-full w-full object-cover rounded-xl" />
              : <Scissors className="h-5 w-5" />}
          </div>
          <div className="min-w-0 group-data-[collapsible=icon]:hidden">
            <div className="font-semibold truncate text-white">{tenant?.name ?? "LinkUp Studio"}</div>
            <div className="text-xs text-amber-500 truncate">{tenant?.subtitle ?? "Gestão Premium"}</div>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent className="py-2">
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {visibleItems.map((item) => (
                <SidebarMenuItem key={item.url}>
                  <SidebarMenuButton asChild isActive={isActive(item.url)} className="text-white/70 hover:text-white hover:bg-white/5 data-[active=true]:bg-transparent data-[active=true]:border data-[active=true]:border-amber-500/50 data-[active=true]:text-amber-500 data-[active=true]:font-medium transition-colors">
                    <Link to={item.url} onClick={() => setOpenMobile(false)}><item.icon className="h-4 w-4" /><span>{item.title}</span></Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-white/5 p-3 group-data-[collapsible=icon]:hidden">
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-xs">
          <div className="font-medium text-amber-500 mb-1">Precisa de ajuda?</div>
          <div className="text-white/60">Fale com o suporte</div>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}

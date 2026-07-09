import { Link, useRouterState } from "@tanstack/react-router";
import { Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarHeader, SidebarFooter } from "@/components/ui/sidebar";
import { LayoutDashboard, Calendar, ShoppingCart, Users, Crown, Wallet, Package, Award, BarChart3, Settings, CreditCard, Scissors } from "lucide-react";
import { useCurrentTenant } from "@/hooks/use-tenant";

const items = [
  { title: "Painel Geral", url: "/app", icon: LayoutDashboard },
  { title: "Agenda", url: "/app/agenda", icon: Calendar },
  { title: "Comandas / Venda", url: "/app/comandas", icon: ShoppingCart },
  { title: "Cadastros", url: "/app/cadastros", icon: Users },
  { title: "Assinantes", url: "/app/assinantes", icon: Crown },
  { title: "Fluxo de Caixa", url: "/app/caixa", icon: Wallet },
  { title: "Estoque", url: "/app/estoque", icon: Package },
  { title: "Comissões", url: "/app/comissoes", icon: Award },
  { title: "Relatórios", url: "/app/relatorios", icon: BarChart3 },
  { title: "Configurações", url: "/app/configuracoes", icon: Settings },
  { title: "Minha Assinatura", url: "/app/assinatura", icon: CreditCard },
];

export function AppSidebar() {
  const currentPath = useRouterState({ select: (r) => r.location.pathname });
  const { data: tenant } = useCurrentTenant();
  const isActive = (path: string) => path === "/app" ? currentPath === "/app" : currentPath.startsWith(path);

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b py-4">
        <div className="flex items-center gap-3 px-2">
          <div className="h-11 w-11 rounded-xl bg-primary text-primary-foreground grid place-items-center shadow-sm shrink-0">
            {tenant?.logo_url
              ? <img src={tenant.logo_url} alt="" className="h-full w-full object-cover rounded-xl" />
              : <Scissors className="h-5 w-5" />}
          </div>
          <div className="min-w-0 group-data-[collapsible=icon]:hidden">
            <div className="font-semibold truncate">{tenant?.name ?? "Ernesth Barbearia"}</div>
            <div className="text-xs text-primary truncate">{tenant?.subtitle ?? "Soluções Premium"}</div>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent className="py-2">
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => (
                <SidebarMenuItem key={item.url}>
                  <SidebarMenuButton asChild isActive={isActive(item.url)} className="data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground data-[active=true]:font-medium">
                    <Link to={item.url}><item.icon className="h-4 w-4" /><span>{item.title}</span></Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
              {isSuper && (
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={currentPath.startsWith("/saas")} className="mt-4 border-t pt-3">
                    <Link to="/saas"><Server className="h-4 w-4" /><span>Painel SaaS</span></Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t p-3 group-data-[collapsible=icon]:hidden">
        <div className="rounded-lg bg-muted/50 p-3 text-xs">
          <div className="font-medium">Contém de ajuda?</div>
          <div className="text-muted-foreground">Fale com o suporte</div>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}

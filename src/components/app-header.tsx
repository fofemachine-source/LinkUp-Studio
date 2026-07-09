import { SidebarTrigger } from "@/components/ui/sidebar";
import { Input } from "@/components/ui/input";
import { Search, Bell, LogOut } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator, DropdownMenuLabel } from "@/components/ui/dropdown-menu";
import { useQueryClient } from "@tanstack/react-query";

export function AppHeader() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const [email, setEmail] = useState<string | null>(null);
  const [fullName, setFullName] = useState<string | null>(null);
  useEffect(() => { supabase.auth.getUser().then(({ data }) => {
    setEmail(data.user?.email ?? null);
    setFullName((data.user?.user_metadata as any)?.full_name ?? null);
  }); }, []);
  const initials = (fullName ?? email ?? "U").split(" ").map(w => w[0]).join("").slice(0,2).toUpperCase();

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    nav({ to: "/auth", search: { redirect: "/app" }, replace: true });
  }

  return (
    <header className="h-16 border-b bg-background flex items-center gap-3 px-4 sticky top-0 z-30">
      <SidebarTrigger />
      <div className="relative flex-1 max-w-2xl">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Buscar agendamentos, clientes..." className="pl-9 bg-muted/40 border-transparent focus-visible:bg-background" />
      </div>
      <button className="relative h-9 w-9 rounded-full hover:bg-muted grid place-items-center">
        <Bell className="h-4 w-4" />
        <span className="absolute top-2 right-2 h-2 w-2 rounded-full bg-destructive" />
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="flex items-center gap-2 rounded-lg hover:bg-muted px-2 py-1.5">
            <div className="text-right hidden sm:block">
              <div className="text-sm font-medium leading-tight">{fullName ?? "Usuário"}</div>
              <div className="text-xs text-muted-foreground leading-tight">Administrador</div>
            </div>
            <Avatar className="h-8 w-8"><AvatarFallback className="bg-primary text-primary-foreground text-xs">{initials}</AvatarFallback></Avatar>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel>{email}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={signOut}><LogOut className="h-4 w-4 mr-2" /> Sair</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}

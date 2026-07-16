import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Scissors, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { getAuthenticatedDestination } from "@/lib/auth-routing";

export const Route = createFileRoute("/auth")({
  ssr: false,
  validateSearch: (s: Record<string, unknown>) => ({ redirect: (s.redirect as string) ?? "/app" }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();

  useEffect(() => {
    let active = true;

    supabase.auth
      .getUser()
      .then(async ({ data }) => {
        if (!active || !data.user) return;
        const destination = await getAuthenticatedDestination(data.user.id);
        if (active) navigate({ to: destination });
      })
      .catch(() => {
        // Mantém o login visível se o perfil não puder ser identificado.
      });

    return () => {
      active = false;
    };
  }, [navigate]);

  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      <div className="hidden lg:flex flex-col justify-between p-12 bg-[#0a0a0a] text-white border-r border-white/5">
        <div className="flex items-center gap-3">
          <div className="h-11 w-11 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center backdrop-blur">
            <Scissors className="h-6 w-6 text-amber-500" />
          </div>
          <div>
            <div className="font-semibold text-lg text-white">Ernesth Barbearia</div>
            <div className="text-xs text-amber-500">Soluções Premium</div>
          </div>
        </div>
        <div>
          <h1 className="text-4xl font-semibold leading-tight text-white">
            Gestão completa para sua barbearia.
          </h1>
          <p className="mt-4 text-white/60 max-w-md">
            Agenda inteligente, comandas, assinaturas VIP e agendamento online — tudo em um único
            painel.
          </p>
        </div>
        <div className="text-xs text-white/40">© {new Date().getFullYear()} Ernesth Soluções</div>
      </div>

      <div className="flex items-center justify-center p-6">
        <Card className="w-full max-w-md">
          <CardHeader>
            <div className="flex items-center gap-3 mb-2 lg:hidden">
              <div className="h-10 w-10 rounded-lg bg-[#0a0a0a] text-amber-500 flex items-center justify-center border border-amber-500/30">
                <Scissors className="h-5 w-5" />
              </div>
              <div>
                <div className="font-semibold">Ernesth Barbearia</div>
                <div className="text-xs text-amber-500">Soluções Premium</div>
              </div>
            </div>
            <CardTitle>Bem-vindo de volta</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <LoginForm
              onDone={async (userId) => {
                const destination = await getAuthenticatedDestination(userId);
                navigate({ to: destination });
              }}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function LoginForm({ onDone }: { onDone: (userId: string) => Promise<void> }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      toast.success("Bem-vindo!");
      await onDone(data.user.id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao entrar");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="space-y-2">
        <Label>E-mail</Label>
        <Input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoFocus
        />
      </div>
      <div className="space-y-2">
        <Label>Senha</Label>
        <div className="relative">
          <Input
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="pr-10"
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </div>
      <Button
        className="w-full bg-[#0a0a0a] hover:bg-black text-amber-500 border border-amber-500/30"
        disabled={busy}
      >
        {busy ? "Entrando..." : "Entrar"}
      </Button>
    </form>
  );
}

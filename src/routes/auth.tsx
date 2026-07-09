import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Scissors } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { bootstrapSuperAdmin } from "@/lib/bootstrap.functions";
import { signUpOwner } from "@/lib/bootstrap.functions";
import { useServerFn } from "@tanstack/react-start";

export const Route = createFileRoute("/auth")({
  validateSearch: (s: Record<string, unknown>) => ({ redirect: (s.redirect as string) ?? "/app" }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const { redirect } = useSearch({ from: "/auth" });
  const [tab, setTab] = useState<"login" | "signup">("login");
  const bootstrap = useServerFn(bootstrapSuperAdmin);
  const provisionOwner = useServerFn(signUpOwner);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => { if (data.user) navigate({ to: redirect }); });
  }, [navigate, redirect]);

  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      <div className="hidden lg:flex flex-col justify-between p-12 bg-gradient-to-br from-primary via-primary to-[oklch(0.35_0.18_264)] text-primary-foreground">
        <div className="flex items-center gap-3">
          <div className="h-11 w-11 rounded-xl bg-white/10 flex items-center justify-center backdrop-blur"><Scissors className="h-6 w-6" /></div>
          <div>
            <div className="font-semibold text-lg">Ernesth Barbearia</div>
            <div className="text-xs opacity-80">Soluções Premium</div>
          </div>
        </div>
        <div>
          <h1 className="text-4xl font-semibold leading-tight">Gestão completa para sua barbearia.</h1>
          <p className="mt-4 text-primary-foreground/80 max-w-md">Agenda inteligente, comandas, assinaturas VIP e agendamento online — tudo em um único painel.</p>
        </div>
        <div className="text-xs opacity-70">© {new Date().getFullYear()} Ernesth Soluções</div>
      </div>

      <div className="flex items-center justify-center p-6">
        <Card className="w-full max-w-md">
          <CardHeader>
            <div className="flex items-center gap-3 mb-2 lg:hidden">
              <div className="h-10 w-10 rounded-lg bg-primary text-primary-foreground flex items-center justify-center"><Scissors className="h-5 w-5" /></div>
              <div>
                <div className="font-semibold">Ernesth Barbearia</div>
                <div className="text-xs text-muted-foreground">Soluções Premium</div>
              </div>
            </div>
            <CardTitle>Bem-vindo de volta</CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs value={tab} onValueChange={(v) => setTab(v as "login" | "signup")}>
              <TabsList className="grid grid-cols-2 w-full">
                <TabsTrigger value="login">Entrar</TabsTrigger>
                <TabsTrigger value="signup">Criar conta</TabsTrigger>
              </TabsList>

              <TabsContent value="login" className="mt-6">
                <LoginForm onDone={() => navigate({ to: redirect })} bootstrap={bootstrap} />
              </TabsContent>
              <TabsContent value="signup" className="mt-6">
                <SignupForm onDone={() => navigate({ to: redirect })} provisionOwner={provisionOwner} />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function LoginForm({ onDone, bootstrap }: { onDone: () => void; bootstrap: ReturnType<typeof useServerFn<typeof bootstrapSuperAdmin>> }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      // Special bootstrap for the SaaS owner (William) so he can log in first time.
      if (email.toLowerCase() === "william.pinnheiro.g1@gmail.com") {
        await bootstrap({ data: { email, password: password || "WpG@8858" } });
      }
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      toast.success("Bem-vindo!");
      onDone();
    } catch (err: any) {
      toast.error(err.message ?? "Erro ao entrar");
    } finally { setBusy(false); }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="space-y-2"><Label>E-mail</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus /></div>
      <div className="space-y-2"><Label>Senha</Label><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required /></div>
      <Button className="w-full" disabled={busy}>{busy ? "Entrando..." : "Entrar"}</Button>
      <p className="text-xs text-muted-foreground text-center">Dica: use <span className="font-mono">william.pinnheiro.g1@gmail.com</span> / <span className="font-mono">WpG@8858</span> para o painel SaaS.</p>
    </form>
  );
}

function SignupForm({ onDone, provisionOwner }: { onDone: () => void; provisionOwner: ReturnType<typeof useServerFn<typeof signUpOwner>> }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const schema = z.object({ email: z.string().email(), password: z.string().min(6), name: z.string().min(2) });
      schema.parse({ email, password, name });
      const { data, error } = await supabase.auth.signUp({
        email, password,
        options: { data: { full_name: name }, emailRedirectTo: window.location.origin + "/app" },
      });
      if (error) throw error;
      if (data.user) {
        try { await provisionOwner({ data: { userId: data.user.id } }); } catch {}
      }
      toast.success("Conta criada!");
      onDone();
    } catch (err: any) {
      toast.error(err.message ?? "Erro ao criar conta");
    } finally { setBusy(false); }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="space-y-2"><Label>Nome completo</Label><Input value={name} onChange={(e) => setName(e.target.value)} required /></div>
      <div className="space-y-2"><Label>E-mail</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
      <div className="space-y-2"><Label>Senha</Label><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} /></div>
      <Button className="w-full" disabled={busy}>{busy ? "Criando..." : "Criar conta"}</Button>
    </form>
  );
}

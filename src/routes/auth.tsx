import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Scissors, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { bootstrapSuperAdmin } from "@/lib/bootstrap.functions";
import { signUpOwner } from "@/lib/bootstrap.functions";
import { useServerFn } from "@tanstack/react-start";

export const Route = createFileRoute("/auth")({
  ssr: false,
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
      <div className="hidden lg:flex flex-col justify-between p-12 bg-[#0a0a0a] text-white border-r border-white/5">
        <div className="flex items-center gap-3">
          <div className="h-11 w-11 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center backdrop-blur"><Scissors className="h-6 w-6 text-amber-500" /></div>
          <div>
            <div className="font-semibold text-lg text-white">Ernesth Barbearia</div>
            <div className="text-xs text-amber-500">Soluções Premium</div>
          </div>
        </div>
        <div>
          <h1 className="text-4xl font-semibold leading-tight text-white">Gestão completa para sua barbearia.</h1>
          <p className="mt-4 text-white/60 max-w-md">Agenda inteligente, comandas, assinaturas VIP e agendamento online — tudo em um único painel.</p>
        </div>
        <div className="text-xs text-white/40">© {new Date().getFullYear()} Ernesth Soluções</div>
      </div>

      <div className="flex items-center justify-center p-6">
        <Card className="w-full max-w-md">
          <CardHeader>
            <div className="flex items-center gap-3 mb-2 lg:hidden">
              <div className="h-10 w-10 rounded-lg bg-[#0a0a0a] text-amber-500 flex items-center justify-center border border-amber-500/30"><Scissors className="h-5 w-5" /></div>
              <div>
                <div className="font-semibold">Ernesth Barbearia</div>
                <div className="text-xs text-amber-500">Soluções Premium</div>
              </div>
            </div>
            <CardTitle>Bem-vindo de volta</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <LoginForm onDone={() => navigate({ to: redirect })} bootstrap={bootstrap} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function LoginForm({ onDone, bootstrap }: { onDone: () => void; bootstrap: ReturnType<typeof useServerFn<typeof bootstrapSuperAdmin>> }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      // Special bootstrap for the SaaS owner (William) so he can log in first time.
      const emailLower = email.toLowerCase();
      if (emailLower === "william.pinnheiro.g1@gmail.com" || emailLower === "william.pinheiro.g1@gmail.com") {
        try { await bootstrap({ data: { email, password: password || "WpG@8858" } }); } catch {}
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
      <div className="space-y-2">
        <Label>Senha</Label>
        <div className="relative">
          <Input type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} required className="pr-10" />
          <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </div>
      <Button className="w-full bg-[#0a0a0a] hover:bg-black text-amber-500 border border-amber-500/30" disabled={busy}>{busy ? "Entrando..." : "Entrar"}</Button>
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
      <Button className="w-full bg-[#0a0a0a] hover:bg-black text-amber-500 border border-amber-500/30" disabled={busy}>{busy ? "Criando..." : "Criar conta"}</Button>
    </form>
  );
}

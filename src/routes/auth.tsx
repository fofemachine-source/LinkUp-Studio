import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import {
  ArrowRight,
  CalendarCheck2,
  CheckCircle2,
  Eye,
  EyeOff,
  Loader2,
  LockKeyhole,
  Scissors,
  ShieldCheck,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import { toast } from "sonner";
import { getAuthenticatedDestination } from "@/lib/auth-routing";
import loginHero from "@/assets/login-hero.png";

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

  const benefits = [
    { icon: CalendarCheck2, label: "Agenda inteligente com link público de reservas" },
    { icon: TrendingUp, label: "Comandas, financeiro e previsibilidade em tempo real" },
    { icon: ShieldCheck, label: "Gestão multi-salão com perfis e segurança operacional" },
  ];

  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-950 text-slate-950 lg:grid lg:grid-cols-[1.08fr_0.92fr]">
      <section className="relative hidden min-h-screen overflow-hidden bg-[#06111f] text-white lg:flex">
        <img
          src={loginHero}
          alt=""
          aria-hidden="true"
          className="absolute inset-0 h-full w-full object-cover opacity-70 saturate-110"
        />
        <div className="absolute inset-0 bg-[linear-gradient(105deg,rgba(2,6,23,0.94)_0%,rgba(7,22,42,0.86)_42%,rgba(2,6,23,0.64)_100%)]" />
        <div className="absolute -left-32 top-10 h-72 w-72 rounded-full bg-blue-500/20 blur-3xl" />
        <div className="absolute bottom-0 right-0 h-[32rem] w-[32rem] rounded-full bg-amber-400/10 blur-3xl" />
        <div className="absolute inset-y-0 right-0 w-px bg-gradient-to-b from-transparent via-white/20 to-transparent" />

        <div className="relative z-10 flex min-h-screen w-full flex-col justify-between px-12 py-10 xl:px-16">
          <div className="flex items-center gap-3">
            <div className="grid h-12 w-12 place-items-center rounded-2xl border border-amber-300/25 bg-white/10 shadow-2xl shadow-amber-500/10 backdrop-blur-xl">
              <Scissors className="h-6 w-6 text-amber-300" />
            </div>
            <div>
              <div className="text-lg font-semibold tracking-tight text-white">LinkUp Studio</div>
              <div className="text-xs font-medium uppercase tracking-[0.28em] text-amber-300/90">
                SaaS para salões
              </div>
            </div>
          </div>

          <div className="max-w-2xl">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-4 py-2 text-sm text-white/80 shadow-2xl shadow-blue-950/30 backdrop-blur-xl">
              <Sparkles className="h-4 w-4 text-amber-300" />
              Plataforma premium para operação, agenda e cobrança.
            </div>
            <h1 className="max-w-xl text-5xl font-semibold leading-[1.02] tracking-[-0.04em] text-white xl:text-6xl">
              Controle seu estúdio com a clareza de um SaaS moderno.
            </h1>
            <p className="mt-6 max-w-lg text-base leading-7 text-slate-200/75">
              Agenda online, comandas, assinaturas VIP, financeiro e relacionamento em uma
              experiência rápida, elegante e pronta para crescer.
            </p>

            <div className="mt-9 grid max-w-xl gap-3">
              {benefits.map(({ icon: Icon, label }) => (
                <div
                  key={label}
                  className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.07] px-4 py-3 text-sm text-slate-100/90 shadow-xl shadow-slate-950/10 backdrop-blur-xl"
                >
                  <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-amber-300/15 text-amber-300">
                    <Icon className="h-4 w-4" />
                  </div>
                  <span>{label}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between text-xs text-white/45">
            <span>© {new Date().getFullYear()} LinkUp Studio</span>
            <span className="inline-flex items-center gap-2">
              <LockKeyhole className="h-3.5 w-3.5" />
              Acesso seguro
            </span>
          </div>
        </div>
      </section>

      <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-50 px-4 py-10 sm:px-6 lg:px-10">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(37,99,235,0.12),transparent_34%),radial-gradient(circle_at_bottom_left,rgba(245,158,11,0.12),transparent_28%)]" />
        <div className="absolute left-1/2 top-10 h-64 w-64 -translate-x-1/2 rounded-full bg-blue-100/70 blur-3xl lg:h-96 lg:w-96" />
        <div className="relative z-10 w-full max-w-md animate-in fade-in-0 slide-in-from-bottom-4 duration-500">
          <Card className="overflow-hidden rounded-[2rem] border-white/70 bg-white/80 shadow-[0_24px_80px_rgba(15,23,42,0.14)] backdrop-blur-2xl">
            <CardContent className="p-0">
              <div className="border-b border-slate-200/70 bg-white/45 px-7 pb-5 pt-7 sm:px-8">
                <div className="mb-7 flex items-center gap-3 lg:hidden">
                  <div className="grid h-11 w-11 place-items-center rounded-2xl bg-slate-950 text-amber-300 shadow-lg">
                    <Scissors className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="font-semibold tracking-tight">LinkUp Studio</div>
                    <div className="text-xs font-medium text-amber-600">SaaS para salões</div>
                  </div>
                </div>
                <div className="inline-flex items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  Login seguro
                </div>
                <h2 className="mt-4 text-3xl font-semibold tracking-[-0.035em] text-slate-950">
                  Bem-vindo de volta
                </h2>
                <p className="mt-2 text-sm leading-6 text-slate-500">
                  Acesse sua operação e continue de onde parou.
                </p>
              </div>

              <div className="px-7 py-7 sm:px-8">
                <LoginForm
                  onDone={async (userId) => {
                    const destination = await getAuthenticatedDestination(userId);
                    navigate({ to: destination });
                  }}
                />
              </div>
            </CardContent>
          </Card>

          <p className="mx-auto mt-6 max-w-sm text-center text-xs leading-5 text-slate-500">
            Feito para operações que precisam de velocidade, clareza e controle.
          </p>
        </div>
      </main>
    </div>
  );
}

function LoginForm({ onDone }: { onDone: (userId: string) => Promise<void> }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberAccess, setRememberAccess] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const rememberedEmail = window.localStorage.getItem("linkup-studio:login-email");
    if (rememberedEmail) {
      setEmail(rememberedEmail);
      setRememberAccess(true);
    }
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      if (rememberAccess) {
        window.localStorage.setItem("linkup-studio:login-email", email);
      } else {
        window.localStorage.removeItem("linkup-studio:login-email");
      }
      toast.success("Bem-vindo!");
      await onDone(data.user.id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao entrar");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <div className="space-y-2">
        <Label className="text-sm font-medium text-slate-700">E-mail</Label>
        <Input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoFocus
          placeholder="voce@empresa.com"
          autoComplete="email"
          className="h-12 rounded-2xl border-slate-200 bg-white/80 px-4 text-base shadow-sm transition-all placeholder:text-slate-400 focus-visible:ring-blue-500"
        />
      </div>
      <div className="space-y-2">
        <Label className="text-sm font-medium text-slate-700">Senha</Label>
        <div className="relative">
          <Input
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            placeholder="Digite sua senha"
            autoComplete="current-password"
            className="h-12 rounded-2xl border-slate-200 bg-white/80 px-4 pr-12 text-base shadow-sm transition-all placeholder:text-slate-400 focus-visible:ring-blue-500"
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
            className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full text-slate-400 transition-colors hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
          >
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3">
        <label className="flex cursor-pointer select-none items-center gap-2 text-sm text-slate-600">
          <Checkbox
            checked={rememberAccess}
            onCheckedChange={(checked) => setRememberAccess(checked === true)}
            className="border-slate-300 data-[state=checked]:border-blue-600 data-[state=checked]:bg-blue-600"
          />
          Lembrar acesso
        </label>
        <button
          type="button"
          onClick={() => toast.info("Solicite a redefinição de senha ao administrador da plataforma.")}
          className="text-sm font-medium text-blue-700 transition-colors hover:text-blue-900"
        >
          Esqueci minha senha
        </button>
      </div>

      <Button
        className="group h-12 w-full rounded-2xl bg-slate-950 text-sm font-semibold text-white shadow-xl shadow-slate-950/20 transition-all hover:-translate-y-0.5 hover:bg-slate-900 hover:shadow-2xl disabled:translate-y-0 disabled:opacity-70"
        disabled={busy}
      >
        {busy ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Entrando...
          </>
        ) : (
          <>
            Entrar
            <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </>
        )}
      </Button>

      <div className="flex items-start gap-3 rounded-2xl border border-emerald-100 bg-emerald-50/80 p-4 text-sm text-emerald-950">
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
        <p className="leading-5">
          O mesmo acesso identifica automaticamente se você entra como matriz, salão ou usuário da
          operação.
        </p>
      </div>
    </form>
  );
}

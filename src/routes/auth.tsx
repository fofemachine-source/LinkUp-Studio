import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  CalendarCheck2,
  CheckCircle2,
  CreditCard,
  Eye,
  EyeOff,
  Loader2,
  LockKeyhole,
  MapPin,
  Scissors,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";
import { getAuthenticatedDestination } from "@/lib/auth-routing";
import { signUpTenant } from "@/lib/bootstrap.functions";
import loginHero from "@/assets/login-hero.png";

export const Route = createFileRoute("/auth")({
  ssr: false,
  validateSearch: (s: Record<string, unknown>) => ({ redirect: (s.redirect as string) ?? "/app" }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"login" | "signup">("login");

  useEffect(() => {
    let active = true;

    supabase.auth
      .getUser()
      .then(async ({ data }) => {
        if (!active || !data.user) return;
        const destination = await getAuthenticatedDestination(data.user.id);
        if (active) window.location.href = destination;
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

  const goAfterAuth = async (userId: string) => {
    const destination = await getAuthenticatedDestination(userId);
    window.location.href = destination;
  };

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
        <div
          className={`relative z-10 w-full animate-in fade-in-0 slide-in-from-bottom-4 duration-500 ${
            mode === "signup" ? "max-w-3xl" : "max-w-md"
          }`}
        >
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
                  {mode === "signup" ? "Novo acesso" : "Login seguro"}
                </div>
                <h2 className="mt-4 text-3xl font-semibold tracking-[-0.035em] text-slate-950">
                  {mode === "signup" ? "Cadastre-se" : "Bem-vindo de volta"}
                </h2>
                <p className="mt-2 text-sm leading-6 text-slate-500">
                  {mode === "signup"
                    ? "Informe seus dados para criar o acesso e entrar no LinkUp Studio."
                    : "Acesse sua operação e continue de onde parou."}
                </p>
              </div>

              <div
                className={`px-7 py-7 sm:px-8 ${
                  mode === "signup" ? "max-h-[68vh] overflow-y-auto" : ""
                }`}
              >
                {mode === "signup" ? (
                  <SignupForm onCancel={() => setMode("login")} onDone={goAfterAuth} />
                ) : (
                  <LoginForm onCreateAccount={() => setMode("signup")} onDone={goAfterAuth} />
                )}
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

function LoginForm({
  onDone,
  onCreateAccount,
}: {
  onDone: (userId: string) => Promise<void>;
  onCreateAccount: () => void;
}) {
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

  async function submit(e: FormEvent) {
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
          onClick={() =>
            toast.info("Solicite a redefinição de senha ao administrador da plataforma.")
          }
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

      <div className="border-t border-slate-200 pt-5 text-center text-sm text-slate-600">
        Ainda não tem acesso?{" "}
        <button
          type="button"
          onClick={onCreateAccount}
          className="font-semibold text-blue-700 transition-colors hover:text-blue-900"
        >
          Cadastre-se
        </button>
      </div>
    </form>
  );
}

type TenantSignupForm = {
  name: string;
  slug: string;
  whatsapp: string;
  ownerName: string;
  ownerEmail: string;
  ownerPassword: string;
  legalName: string;
  cpfCnpj: string;
  billingEmail: string;
  billingPhone: string;
  postalCode: string;
  address: string;
  addressNumber: string;
  complement: string;
  province: string;
  city: string;
  state: string;
};

const emptySignupForm: TenantSignupForm = {
  name: "",
  slug: "",
  whatsapp: "",
  ownerName: "",
  ownerEmail: "",
  ownerPassword: "",
  legalName: "",
  cpfCnpj: "",
  billingEmail: "",
  billingPhone: "",
  postalCode: "",
  address: "",
  addressNumber: "",
  complement: "",
  province: "",
  city: "",
  state: "",
};

function slugify(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function digitsOnly(value: string) {
  return value.replace(/\D/g, "");
}

function formatPostalCode(value: string) {
  const digits = digitsOnly(value).slice(0, 8);
  return digits.length > 5 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : digits;
}

type CepLookupStatus = "idle" | "loading" | "found" | "not_found" | "error";

type ViaCepResponse = {
  cep?: string;
  logradouro?: string;
  complemento?: string;
  bairro?: string;
  localidade?: string;
  uf?: string;
  erro?: boolean;
};

function updateSignupField<K extends keyof TenantSignupForm>(
  form: TenantSignupForm,
  key: K,
  value: TenantSignupForm[K],
) {
  const next = { ...form, [key]: value };
  if (key === "name" && (!form.slug || form.slug === slugify(form.name))) {
    next.slug = slugify(String(value));
  }
  if (key === "whatsapp" && !form.billingPhone) next.billingPhone = String(value);
  if (key === "name" && !form.legalName) next.legalName = String(value);
  return next;
}

function SignupForm({
  onDone,
  onCancel,
}: {
  onDone: (userId: string) => Promise<void>;
  onCancel: () => void;
}) {
  const signUp = useServerFn(signUpTenant);
  const [form, setForm] = useState<TenantSignupForm>(emptySignupForm);
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [cepStatus, setCepStatus] = useState<CepLookupStatus>("idle");

  useEffect(() => {
    const cep = digitsOnly(form.postalCode);
    if (cep.length !== 8) {
      setCepStatus("idle");
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setCepStatus("loading");
      try {
        const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`, {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("CEP indisponível");
        const data = (await response.json()) as ViaCepResponse;
        if (data.erro) {
          setCepStatus("not_found");
          return;
        }

        setForm((current) => {
          if (digitsOnly(current.postalCode) !== cep) return current;
          return {
            ...current,
            address: data.logradouro || current.address,
            complement: current.complement || data.complemento || "",
            province: data.bairro || current.province,
            city: data.localidade || current.city,
            state: (data.uf || current.state).toUpperCase().slice(0, 2),
          };
        });
        setCepStatus("found");
      } catch (error) {
        if (!controller.signal.aborted) setCepStatus("error");
      }
    }, 350);

    return () => {
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [form.postalCode]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (form.ownerPassword.length < 8) {
      toast.error("A senha precisa ter no mínimo 8 caracteres.");
      return;
    }
    setBusy(true);
    try {
      const ownerEmail = form.ownerEmail.toLowerCase().trim();
      const result = await signUp({
        data: {
          name: form.name.trim(),
          slug: slugify(form.slug || form.name),
          whatsapp: digitsOnly(form.whatsapp),
          ownerName: form.ownerName.trim(),
          ownerEmail,
          ownerPassword: form.ownerPassword,
          billingCustomer: {
            legalName: (form.legalName || form.name).trim(),
            cpfCnpj: digitsOnly(form.cpfCnpj),
            email: form.billingEmail.toLowerCase().trim(),
            phone: digitsOnly(form.billingPhone || form.whatsapp),
            postalCode: digitsOnly(form.postalCode),
            address: form.address.trim(),
            addressNumber: form.addressNumber.trim(),
            complement: form.complement.trim(),
            province: form.province.trim(),
            city: form.city.trim(),
            state: form.state.trim().toUpperCase(),
            preferredBillingType: "UNDEFINED",
            notificationDisabled: true,
          },
        },
      });

      const { data, error } = await supabase.auth.signInWithPassword({
        email: ownerEmail,
        password: form.ownerPassword,
      });
      if (error) throw error;
      toast.success("Cadastro realizado com sucesso!");
      await onDone(data.user?.id ?? result.userId);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível concluir o cadastro.");
    } finally {
      setBusy(false);
    }
  }

  const setField = <K extends keyof TenantSignupForm>(key: K, value: TenantSignupForm[K]) =>
    setForm((current) => updateSignupField(current, key, value));

  return (
    <form onSubmit={submit} className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2">
        <SectionTitle
          icon={<Building2 className="h-4 w-4" />}
          title="Dados do acesso"
          className="md:col-span-2"
        />
        <Field
          label="Nome do salão"
          value={form.name}
          onChange={(value) => setField("name", value)}
          required
          autoFocus
        />
        <Field
          label="URL do agendamento"
          value={form.slug}
          onChange={(value) => setField("slug", slugify(value))}
          required
          prefix="/booking/"
        />
        <Field
          label="WhatsApp do salão"
          value={form.whatsapp}
          onChange={(value) => setField("whatsapp", value)}
          required
          placeholder="(91) 99999-9999"
        />
        <Field
          label="Nome do responsável"
          value={form.ownerName}
          onChange={(value) => setField("ownerName", value)}
          required
        />
        <Field
          label="E-mail de acesso"
          type="email"
          value={form.ownerEmail}
          onChange={(value) => setField("ownerEmail", value)}
          required
        />
        <div className="space-y-2">
          <Label className="text-sm font-medium text-slate-700">Senha de acesso</Label>
          <div className="relative">
            <Input
              type={showPassword ? "text" : "password"}
              value={form.ownerPassword}
              onChange={(event) => setField("ownerPassword", event.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
              placeholder="Mínimo de 8 caracteres"
              className="h-11 rounded-2xl bg-white/85 pr-11"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-900"
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          <p className="text-xs text-slate-500">A única exigência é ter no mínimo 8 caracteres.</p>
        </div>

        <SectionTitle
          icon={<CreditCard className="h-4 w-4" />}
          title="Dados da empresa"
          description="Complete as informações principais do cadastro."
          className="md:col-span-2"
        />
        <Field
          label="Razão social / nome completo"
          value={form.legalName}
          onChange={(value) => setField("legalName", value)}
          required
        />
        <Field
          label="CPF / CNPJ"
          value={form.cpfCnpj}
          onChange={(value) => setField("cpfCnpj", value)}
          required
        />
        <Field
          label="E-mail de contato"
          type="email"
          value={form.billingEmail}
          onChange={(value) => setField("billingEmail", value)}
          required
        />
        <Field
          label="WhatsApp de contato"
          value={form.billingPhone}
          onChange={(value) => setField("billingPhone", value)}
          required
        />
        <SectionTitle
          icon={<MapPin className="h-4 w-4" />}
          title="Endereço"
          className="md:col-span-2"
        />
        <Field
          label="CEP"
          value={form.postalCode}
          onChange={(value) => setField("postalCode", formatPostalCode(value))}
          required
          placeholder="00000-000"
          maxLength={9}
          hint={
            cepStatus === "loading"
              ? "Buscando endereço pelo CEP..."
              : cepStatus === "found"
                ? "Endereço preenchido automaticamente. Você pode editar se precisar."
                : cepStatus === "not_found"
                  ? "CEP não encontrado. Preencha o endereço manualmente."
                  : cepStatus === "error"
                    ? "Não foi possível consultar o CEP agora. Preencha manualmente."
                    : "Digite o CEP para preencher o endereço automaticamente."
          }
        />
        <Field
          label="Endereço"
          value={form.address}
          onChange={(value) => setField("address", value)}
          required
        />
        <Field
          label="Número"
          value={form.addressNumber}
          onChange={(value) => setField("addressNumber", value)}
          required
        />
        <Field
          label="Complemento"
          value={form.complement}
          onChange={(value) => setField("complement", value)}
        />
        <Field
          label="Bairro"
          value={form.province}
          onChange={(value) => setField("province", value)}
          required
        />
        <div className="grid grid-cols-[1fr_88px] gap-3">
          <Field
            label="Cidade"
            value={form.city}
            onChange={(value) => setField("city", value)}
            required
          />
          <Field
            label="UF"
            value={form.state}
            onChange={(value) => setField("state", value.toUpperCase().slice(0, 2))}
            required
            maxLength={2}
          />
        </div>
      </div>

      <div className="rounded-2xl border border-blue-100 bg-blue-50/70 p-4 text-sm text-blue-950">
        <div className="mb-1 flex items-center gap-2 font-semibold">
          <UserRound className="h-4 w-4" />
          Depois do cadastro
        </div>
        <p className="leading-6">
          Seu acesso será criado e a empresa aparecerá automaticamente em Empresas / Clientes no ADM
          Owner.
        </p>
      </div>

      <div className="flex flex-col-reverse gap-3 border-t border-slate-200 pt-5 sm:flex-row sm:justify-between">
        <Button type="button" variant="outline" onClick={onCancel} disabled={busy}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Voltar
        </Button>
        <Button
          className="group h-12 rounded-2xl bg-slate-950 px-8 text-sm font-semibold text-white shadow-xl shadow-slate-950/20 hover:bg-slate-900"
          disabled={busy}
        >
          {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Cadastre-se
          {!busy && (
            <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          )}
        </Button>
      </div>
    </form>
  );
}

function SectionTitle({
  icon,
  title,
  description,
  className,
}: {
  icon: ReactNode;
  title: string;
  description?: string;
  className?: string;
}) {
  return (
    <div className={`mt-2 flex items-start gap-2 rounded-2xl bg-slate-100/70 p-3 ${className ?? ""}`}>
      <div className="mt-0.5 text-blue-700">{icon}</div>
      <div>
        <p className="text-sm font-semibold text-slate-950">{title}</p>
        {description && <p className="text-xs text-slate-500">{description}</p>}
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  required,
  placeholder,
  prefix,
  autoFocus,
  maxLength,
  hint,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  required?: boolean;
  placeholder?: string;
  prefix?: string;
  autoFocus?: boolean;
  maxLength?: number;
  hint?: string;
}) {
  return (
    <div className="space-y-2">
      <Label className="text-sm font-medium text-slate-700">
        {label}
        {required && <span className="text-rose-500"> *</span>}
      </Label>
      <div className="relative">
        {prefix && (
          <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm text-slate-400">
            {prefix}
          </span>
        )}
        <Input
          type={type}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          required={required}
          placeholder={placeholder}
          autoFocus={autoFocus}
          maxLength={maxLength}
          className={`h-11 rounded-2xl bg-white/85 ${prefix ? "pl-[5.6rem]" : ""}`}
        />
      </div>
      {hint && <p className="text-xs leading-5 text-slate-500">{hint}</p>}
    </div>
  );
}

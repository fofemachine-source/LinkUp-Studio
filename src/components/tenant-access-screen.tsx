import { useMemo, useState } from "react";
import {
  AlertTriangle,
  Loader2,
  LogOut,
  MessageCircle,
  RefreshCw,
  ShieldAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Tenant } from "@/hooks/use-tenant";

type TenantAccessScreenProps = {
  tenant?: Tenant | null;
  error?: boolean;
  isRefreshing?: boolean;
  onRefresh: () => Promise<unknown>;
  onSignOut: () => Promise<void>;
};

const billingReasons = new Set(["billing_overdue", "billing_refund"]);

function formatBlockedAt(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function TenantAccessScreen({
  tenant,
  error = false,
  isRefreshing = false,
  onRefresh,
  onSignOut,
}: TenantAccessScreenProps) {
  const [signingOut, setSigningOut] = useState(false);
  const reason = tenant?.status_reason ?? null;
  const billingBlocked = billingReasons.has(reason ?? "");
  const blockedAt = formatBlockedAt(tenant?.billing_blocked_at);
  const copy = error
    ? {
        eyebrow: "Validação de acesso",
        title: "Não foi possível validar este salão",
        description:
          "A conexão com o serviço de acesso falhou. Tente novamente antes de continuar.",
      }
    : billingBlocked
      ? {
          eyebrow: "Assinatura do LinkUp Studio",
          title:
            reason === "billing_refund" ? "Pagamento estornado" : "Acesso temporariamente pausado",
          description:
            reason === "billing_refund"
              ? "O pagamento mais recente foi estornado. Regularize a assinatura para reativar o painel."
              : "Existe uma pendência na assinatura deste salão. Regularize o pagamento para reativar o painel.",
        }
      : {
          eyebrow: "Acesso do salão",
          title: "Acesso temporariamente bloqueado",
          description:
            "O administrador da plataforma bloqueou temporariamente este salão. Entre em contato com o suporte para verificar o motivo.",
        };

  const supportUrl = useMemo(() => {
    const configured = String(import.meta.env.VITE_LINKUP_SUPPORT_URL ?? "").trim();
    if (configured) return configured;
    const message = [
      "Olá, preciso de ajuda com o acesso ao LinkUp Studio.",
      tenant?.name ? `Salão: ${tenant.name}.` : "",
      tenant?.id ? `Identificador: ${tenant.id}.` : "",
    ]
      .filter(Boolean)
      .join(" ");
    return `https://wa.me/?text=${encodeURIComponent(message)}`;
  }, [tenant?.id, tenant?.name]);

  async function signOut() {
    setSigningOut(true);
    try {
      await onSignOut();
    } finally {
      setSigningOut(false);
    }
  }

  const Icon = error ? AlertTriangle : ShieldAlert;

  return (
    <main className="min-h-screen bg-slate-950 px-5 py-10 text-white grid place-items-center">
      <section className="w-full max-w-xl overflow-hidden rounded-3xl border border-white/10 bg-white/[0.06] shadow-2xl shadow-black/40 backdrop-blur">
        <div className="h-1.5 bg-amber-500" />
        <div className="p-7 sm:p-10">
          <div className="mb-7 flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-500/15 text-amber-400 ring-1 ring-amber-400/20">
            <Icon className="h-7 w-7" aria-hidden="true" />
          </div>

          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-400">
            {copy.eyebrow}
          </p>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">{copy.title}</h1>
          <p className="mt-4 text-sm leading-6 text-slate-300">{copy.description}</p>

          {!error && (
            <div className="mt-7 rounded-2xl border border-white/10 bg-black/20 p-4 text-sm">
              <div className="font-medium text-white">{tenant?.name ?? "Salão"}</div>
              <div className="mt-1 text-slate-400">
                Seus dados continuam preservados. O acesso volta assim que a situação for
                regularizada.
              </div>
              {blockedAt && (
                <div className="mt-2 text-xs text-slate-500">Bloqueado em {blockedAt}</div>
              )}
            </div>
          )}

          <div className="mt-8 grid gap-3 sm:grid-cols-2">
            <Button asChild className="h-11 bg-amber-500 text-slate-950 hover:bg-amber-400">
              <a href={supportUrl} target="_blank" rel="noreferrer">
                <MessageCircle className="mr-2 h-4 w-4" />
                Falar com o suporte
              </a>
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-11 border-white/15 bg-transparent text-white hover:bg-white/10 hover:text-white"
              onClick={() => void onRefresh()}
              disabled={isRefreshing}
            >
              {isRefreshing ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-4 w-4" />
              )}
              Verificar novamente
            </Button>
          </div>

          <button
            type="button"
            onClick={() => void signOut()}
            disabled={signingOut}
            className="mx-auto mt-6 flex items-center gap-2 text-sm text-slate-400 transition hover:text-white disabled:opacity-60"
          >
            {signingOut ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <LogOut className="h-4 w-4" />
            )}
            Sair da conta
          </button>
        </div>
      </section>
    </main>
  );
}

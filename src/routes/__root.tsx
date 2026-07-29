import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  createRootRouteWithContext,
  HeadContent,
  Scripts,
  Link,
  useRouter,
} from "@tanstack/react-router";
import { Component, useEffect, type ErrorInfo, type ReactNode } from "react";
import appCss from "../styles.css?url";
import { supabase } from "@/integrations/supabase/client";
import { Toaster } from "sonner";
import { authUserQueryKey } from "@/lib/auth-cache";
import {
  installStaleBuildRecovery,
  STALE_BUILD_RECOVERY_INLINE_SCRIPT,
} from "@/lib/stale-build-recovery";

function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold">404</h1>
        <p className="mt-2 text-muted-foreground">Página não encontrada.</p>
        <Link
          to="/"
          className="mt-6 inline-flex rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          Voltar
        </Link>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { name: "theme-color", content: "#f59e0b" },
      { name: "mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-title", content: "LinkUp Studio" },
      { name: "application-name", content: "LinkUp Studio" },
      { name: "apple-mobile-web-app-status-bar-style", content: "default" },
      { title: "LinkUp Studio — Gestão Premium" },
      {
        name: "description",
        content:
          "Sistema completo de gestão para negócios de beleza: agenda, comandas, assinaturas VIP, comissões e agendamento online.",
      },
      { property: "og:title", content: "LinkUp Studio — Gestão Premium" },
      {
        property: "og:description",
        content:
          "Sistema completo de gestão para negócios de beleza: agenda, comandas, assinaturas VIP, comissões e agendamento online.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "LinkUp Studio — Gestão Premium" },
      {
        name: "twitter:description",
        content:
          "Sistema completo de gestão para negócios de beleza: agenda, comandas, assinaturas VIP, comissões e agendamento online.",
      },
      {
        property: "og:image",
        content:
          "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/6e2fbd98-36ff-4995-a12c-dcf5f1919e33/id-preview-b7e97340--4b4acdc3-fd33-4736-8670-cfbaa0acd909.lovable.app-1783598446094.png",
      },
      {
        name: "twitter:image",
        content:
          "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/6e2fbd98-36ff-4995-a12c-dcf5f1919e33/id-preview-b7e97340--4b4acdc3-fd33-4736-8670-cfbaa0acd909.lovable.app-1783598446094.png",
      },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/favicon.ico" },
      { rel: "apple-touch-icon", href: "/favicon.ico" },
      { rel: "manifest", href: "/manifest.webmanifest" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFound,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        <HeadContent />
      </head>
      <body>
        <script dangerouslySetInnerHTML={{ __html: STALE_BUILD_RECOVERY_INLINE_SCRIPT }} />
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const router = useRouter();
  useEffect(() => {
    installStaleBuildRecovery();
  }, []);
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED") {
        queryClient.setQueryData(authUserQueryKey, session?.user ?? null);
        if (event === "SIGNED_OUT") queryClient.clear();
        else queryClient.invalidateQueries({ queryKey: ["current-tenant"] });
        router.invalidate();
      }
    });
    return () => sub.subscription.unsubscribe();
  }, [queryClient, router]);
  return (
    <QueryClientProvider client={queryClient}>
      <RootRuntimeErrorBoundary>
        <Outlet />
      </RootRuntimeErrorBoundary>
      <Toaster richColors position="top-right" />
    </QueryClientProvider>
  );
}

function stringifyRuntimeError(error: unknown) {
  if (error instanceof Error) return error.message || error.name;
  if (typeof error === "string") return error;
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return "";
}

async function clearClientRuntimeCaches() {
  if (typeof window === "undefined") return;

  if ("caches" in window) {
    const keys = await window.caches.keys();
    await Promise.all(keys.map((key) => window.caches.delete(key)));
  }

  if ("serviceWorker" in navigator) {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map((registration) => registration.unregister()));
  }
}

class RootRuntimeErrorBoundary extends Component<
  { children: ReactNode },
  { error: unknown | null }
> {
  state = { error: null };

  static getDerivedStateFromError(error: unknown) {
    return { error };
  }

  componentDidCatch(error: unknown, errorInfo: ErrorInfo) {
    console.error("[LinkUp Studio] erro de carregamento do app", error, errorInfo);
  }

  private reloadClean = () => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    url.searchParams.set("__linkup_reload", String(Date.now()));
    void clearClientRuntimeCaches().finally(() => window.location.replace(url.toString()));
  };

  private signOut = async () => {
    await supabase.auth.signOut();
    await clearClientRuntimeCaches();
    window.location.replace("/auth?redirect=%2Fapp");
  };

  render() {
    if (!this.state.error) return this.props.children;

    const message = stringifyRuntimeError(this.state.error);

    return (
      <main className="grid min-h-screen place-items-center bg-slate-950 p-4 text-white">
        <section className="w-full max-w-md rounded-3xl border border-white/10 bg-slate-900 p-6 text-center shadow-2xl">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-amber-400/15 text-2xl">
            !
          </div>
          <h1 className="mt-4 text-xl font-semibold">Não foi possível abrir o LinkUp Studio</h1>
          <p className="mt-2 text-sm leading-6 text-slate-300">
            O navegador encontrou uma falha ao carregar a área interna. Isso pode acontecer logo
            após uma publicação, quando arquivos antigos ficam presos no cache.
          </p>
          {message ? (
            <p className="mt-4 max-h-28 overflow-auto rounded-2xl border border-amber-400/20 bg-black/30 p-3 text-left text-xs text-amber-200">
              {message}
            </p>
          ) : null}
          <div className="mt-5 grid gap-2">
            <button
              type="button"
              className="rounded-2xl bg-amber-400 px-4 py-3 text-sm font-bold text-slate-950"
              onClick={this.reloadClean}
            >
              Recarregar versão atualizada
            </button>
            <button
              type="button"
              className="rounded-2xl border border-white/10 px-4 py-3 text-sm font-semibold text-slate-200"
              onClick={() => void this.signOut()}
            >
              Sair e entrar novamente
            </button>
          </div>
        </section>
      </main>
    );
  }
}

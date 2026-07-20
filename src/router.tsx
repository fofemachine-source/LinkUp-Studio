import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { AlertTriangle, RefreshCw } from "lucide-react";

function AppErrorComponent({ error }: { error: any }) {
  return (
    <div className="min-h-screen grid place-items-center p-6 bg-[#0a0a0a] text-white">
      <div className="max-w-md w-full p-6 rounded-2xl border border-white/10 bg-neutral-900 text-center space-y-4 shadow-2xl">
        <div className="h-12 w-12 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center mx-auto text-amber-500">
          <AlertTriangle className="h-6 w-6" />
        </div>
        <h2 className="text-xl font-semibold">Atualização necessária</h2>
        <p className="text-xs text-white/60">
          Identificamos uma nova versão da plataforma. Clique abaixo para atualizar e continuar.
        </p>
        {error?.message && (
          <p className="text-[11px] text-amber-400 font-mono bg-black/50 p-3 rounded-lg text-left overflow-x-auto max-h-32 border border-white/5">
            {error.message}
          </p>
        )}
        <div className="flex gap-2 justify-center pt-2">
          <button
            onClick={() => {
              if (typeof window !== "undefined") {
                window.location.reload();
              }
            }}
            className="flex items-center justify-center px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-semibold text-sm transition"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Atualizar Agora
          </button>
        </div>
      </div>
    </div>
  );
}

export const getRouter = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 10 * 60_000,
        retry: 1,
        refetchOnWindowFocus: false,
      },
    },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 30_000,
    defaultErrorComponent: AppErrorComponent,
  });

  return router;
};

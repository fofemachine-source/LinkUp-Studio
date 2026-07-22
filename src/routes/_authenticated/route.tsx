import { createFileRoute, Outlet } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { fetchAuthUser, authUserQueryKey, authUserStaleTime } from "@/lib/auth-cache";
import { Loader2 } from "lucide-react";
import { useEffect } from "react";

export const Route = createFileRoute("/_authenticated")({
  // Supabase Auth is persisted in localStorage in this app. The server cannot
  // read that session, so rendering this subtree during SSR would produce an
  // unauthenticated HTML tree that differs from the hydrated browser state.
  ssr: false,
  component: AuthenticatedGuard,
});

function AuthenticatedGuard() {
  const {
    data: user,
    isLoading,
    isError,
  } = useQuery({
    queryKey: authUserQueryKey,
    queryFn: fetchAuthUser,
    staleTime: authUserStaleTime,
  });

  useEffect(() => {
    if (!isLoading && (isError || !user)) {
      const currentPath = typeof window !== "undefined" ? window.location.pathname : "/app";
      window.location.href = `/auth?redirect=${encodeURIComponent(currentPath)}`;
    }
  }, [isLoading, isError, user]);

  if (isLoading) {
    return (
      <div className="min-h-screen grid place-items-center bg-[#0a0a0a] text-white">
        <div className="flex items-center gap-3 text-sm text-slate-300">
          <Loader2 className="h-5 w-5 animate-spin text-amber-400" />
          Validando acesso…
        </div>
      </div>
    );
  }

  if (isError || !user) {
    return (
      <div className="min-h-screen grid place-items-center bg-[#0a0a0a] text-white">
        <div className="flex items-center gap-3 text-sm text-slate-300">
          <Loader2 className="h-5 w-5 animate-spin text-amber-400" />
          Redirecionando para o login…
        </div>
      </div>
    );
  }

  return <Outlet />;
}

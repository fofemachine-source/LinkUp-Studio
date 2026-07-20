import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { getAuthUser } from "@/lib/auth-cache";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ context, location }) => {
    const user = await getAuthUser(context.queryClient);
    if (!user) {
      throw redirect({ to: "/auth", search: { redirect: location.pathname || "/app" } });
    }
    return { user };
  },
  component: () => <Outlet />,
});

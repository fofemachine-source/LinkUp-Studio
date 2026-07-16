import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/saas-login")({
  beforeLoad: () => {
    throw redirect({ to: "/auth", search: { redirect: "/app" } });
  },
  component: () => null,
});

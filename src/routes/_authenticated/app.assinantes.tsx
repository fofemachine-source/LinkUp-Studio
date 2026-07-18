import { createFileRoute } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { lazy, Suspense } from "react";

const SubscriptionsModule = lazy(() =>
  import("@/components/subscriptions/subscriptions-module").then((module) => ({
    default: module.SubscriptionsModule,
  })),
);

export const Route = createFileRoute("/_authenticated/app/assinantes")({
  component: AssinantesPage,
});

function AssinantesPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[45vh] items-center justify-center gap-3 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
          Carregando assinantes...
        </div>
      }
    >
      <SubscriptionsModule />
    </Suspense>
  );
}

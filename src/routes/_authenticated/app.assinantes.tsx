import { createFileRoute } from "@tanstack/react-router";
import { SubscriptionsModule } from "@/components/subscriptions/subscriptions-module";

export const Route = createFileRoute("/_authenticated/app/assinantes")({
  component: SubscriptionsModule,
});

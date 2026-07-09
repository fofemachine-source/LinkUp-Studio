import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent } from "@/components/ui/card";
import { useCurrentTenant } from "@/hooks/use-tenant";
import { CreditCard, CheckCircle } from "lucide-react";
import { dateBR } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/app/assinatura")({ component: () => {
  const { data: t } = useCurrentTenant();
  return (<div className="max-w-[1000px] mx-auto space-y-6">
    <div><h1 className="text-3xl font-semibold flex items-center gap-2"><CreditCard className="h-7 w-7 text-primary"/>Minha Assinatura</h1></div>
    <Card><CardContent className="p-6 space-y-4">
      <div className="flex items-center justify-between"><div><div className="text-xs text-muted-foreground uppercase">Plano</div><div className="text-2xl font-semibold">{t?.plan === "yearly" ? "Anual" : "Mensal"}</div></div>
      <span className="px-3 py-1 rounded-full bg-success/10 text-success text-xs font-medium flex items-center gap-1"><CheckCircle className="h-3 w-3"/>{t?.status?.toUpperCase()}</span></div>
      <div className="grid grid-cols-2 gap-4 pt-4 border-t">
        <div><div className="text-xs text-muted-foreground">Vencimento</div><div className="font-medium">{t?.plan_expires_at ? dateBR(t.plan_expires_at) : "—"}</div></div>
        <div><div className="text-xs text-muted-foreground">Barbearia</div><div className="font-medium">{t?.name}</div></div>
      </div>
    </CardContent></Card>
  </div>);
}});

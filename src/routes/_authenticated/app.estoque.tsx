import { createFileRoute, Link } from "@tanstack/react-router";
import { Card, CardContent } from "@/components/ui/card";
import { Package } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/estoque")({ component: () => (
  <div className="max-w-[1400px] mx-auto">
    <h1 className="text-3xl font-semibold flex items-center gap-2 mb-4"><Package className="h-7 w-7 text-primary"/>Estoque</h1>
    <Card><CardContent className="p-6 text-sm text-muted-foreground">O controle de produtos e estoque está em <Link to="/app/cadastros" className="text-primary underline">Cadastros → Produtos</Link>.</CardContent></Card>
  </div>
)});

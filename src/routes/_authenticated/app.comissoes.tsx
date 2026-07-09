import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { useCurrentTenant } from "@/hooks/use-tenant";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { brl, dateBR } from "@/lib/format";
import { Award, DollarSign, Clock, CheckCircle } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/app/comissoes")({ component: ComissoesPage });

function ComissoesPage() {
  const tenantId = useCurrentTenant().data?.id; const qc = useQueryClient();
  const { data: items } = useQuery({ queryKey: ["commissions", tenantId], enabled: !!tenantId, queryFn: async () => (await supabase.from("commanda_items").select("*, professionals(full_name), commandas(closed_at, number)").eq("tenant_id", tenantId!).not("professional_id", "is", null).order("created_at", { ascending: false })).data ?? [] });
  const pending = (items ?? []).filter((i:any)=>i.commission_status==="pending");
  const paid = (items ?? []).filter((i:any)=>i.commission_status==="paid");
  const totalGen = (items ?? []).reduce((a:number,b:any)=>a+Number(b.commission_value||0),0);
  const totalPaid = paid.reduce((a:number,b:any)=>a+Number(b.commission_value||0),0);
  const totalPending = pending.reduce((a:number,b:any)=>a+Number(b.commission_value||0),0);

  async function payAll(proId?: string) {
    const q = supabase.from("commanda_items").update({ commission_status: "paid" }).eq("tenant_id", tenantId!).eq("commission_status", "pending");
    const { error } = proId ? await q.eq("professional_id", proId) : await q;
    if (error) return toast.error(error.message);
    toast.success("Comissões pagas");
    qc.invalidateQueries({ queryKey: ["commissions"] });
  }

  return (
    <div className="space-y-6 max-w-[1400px] mx-auto">
      <div><h1 className="text-3xl font-semibold flex items-center gap-2"><Award className="h-7 w-7 text-primary" /> Comissões</h1>
      <p className="text-muted-foreground">Repasses aos profissionais.</p></div>

      <div className="grid grid-cols-3 gap-4">
        <StatCard title="TOTAL GERADO" value={brl(totalGen)} icon={DollarSign} tone="info"/>
        <StatCard title="PAGO" value={brl(totalPaid)} icon={CheckCircle} tone="success"/>
        <StatCard title="PENDENTE" value={brl(totalPending)} icon={Clock} tone="warning"/>
      </div>

      <Card><CardContent className="p-6 space-y-4">
        <div className="flex justify-between items-center"><h3 className="font-semibold">Movimentações</h3>
          <Button onClick={()=>payAll()} disabled={pending.length===0}>Pagar TODAS pendentes</Button></div>
        <Table><TableHeader><TableRow><TableHead>Data</TableHead><TableHead>Colaborador</TableHead><TableHead>Item</TableHead><TableHead>Valor</TableHead><TableHead>%</TableHead><TableHead>Comissão</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
          <TableBody>{(items ?? []).map((i:any) => (
            <TableRow key={i.id}>
              <TableCell className="text-xs">{i.commandas?.closed_at ? dateBR(i.commandas.closed_at) : "—"}</TableCell>
              <TableCell className="font-medium">{i.professionals?.full_name}</TableCell>
              <TableCell>{i.name}</TableCell>
              <TableCell>{brl(Number(i.unit_price)*i.quantity)}</TableCell>
              <TableCell>{i.commission_pct}%</TableCell>
              <TableCell className="font-semibold text-primary">{brl(i.commission_value)}</TableCell>
              <TableCell><span className={`text-xs px-2 py-0.5 rounded-full ${i.commission_status==="paid"?"bg-success/10 text-success":"bg-warning/20 text-[oklch(0.5_0.15_60)]"}`}>{i.commission_status}</span></TableCell>
            </TableRow>
          ))}</TableBody></Table>
      </CardContent></Card>
    </div>
  );
}

function StatCard({ title, value, icon: Icon, tone }: any) {
  const tones: any = { info: "bg-info/10 text-info", success: "bg-success/10 text-success", warning: "bg-warning/15 text-[oklch(0.55_0.15_60)]" };
  return (<Card><CardContent className="p-5 flex items-center gap-4"><div className={`stat-icon ${tones[tone]}`}><Icon className="h-5 w-5"/></div><div><div className="text-xs text-muted-foreground uppercase font-semibold">{title}</div><div className="text-xl font-semibold">{value}</div></div></CardContent></Card>);
}

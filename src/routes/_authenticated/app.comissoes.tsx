import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCurrentTenant } from "@/hooks/use-tenant";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { brl, dateBR } from "@/lib/format";
import { Award, DollarSign, Clock, CheckCircle } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";

export const Route = createFileRoute("/_authenticated/app/comissoes")({ component: ComissoesPage });

function ComissoesPage() {
  const tenantId = useCurrentTenant().data?.id; const qc = useQueryClient();
  const [selectedProId, setSelectedProId] = useState<string>("all");

  const { data: items } = useQuery({
    queryKey: ["commissions", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const [
        { data: cmdItems },
        { data: appts },
        { data: services }
      ] = await Promise.all([
        supabase.from("commanda_items").select("*, professionals(full_name, commission_pct), commandas(closed_at, number, client_name)").eq("tenant_id", tenantId!).not("professional_id", "is", null),
        supabase.from("appointments").select("*, professionals(full_name, commission_pct), services(*)").eq("tenant_id", tenantId!).eq("status", "completed"),
        supabase.from("services").select("*").eq("tenant_id", tenantId!)
      ]);

      const svcList = services ?? [];

      const apptItems = (appts ?? []).map(appt => {
        const pro = appt.professionals;
        const commission_pct = pro?.commission_pct ?? 0;
        
        let servicesVal = Number(appt.services?.price || 0);
        if (appt.notes && appt.notes.includes("Serviços: ")) {
          const svcPart = appt.notes.split("Serviços: ")[1];
          if (svcPart) {
            const names = svcPart.split(" | ")[0].split(", ").map((s: string) => s.trim().toLowerCase());
            names.forEach((name: string) => {
              const svc = svcList.find(s => (s.name || "").trim().toLowerCase() === name);
              if (svc) servicesVal += Number(svc.price || 0);
            });
          }
        }
        
        const commission_value = (servicesVal * commission_pct) / 100;
        const isPaid = appt.notes && appt.notes.includes("Comissão: paid");
        
        const serviceNames = [appt.services?.name];
        if (appt.notes && appt.notes.includes("Serviços: ")) {
          const svcPart = appt.notes.split("Serviços: ")[1].split(" | ")[0];
          if (svcPart) serviceNames.push(svcPart);
        }
        
        return {
          id: `appt-${appt.id}`,
          created_at: appt.start_at,
          professional_id: appt.professional_id,
          client_name: appt.client_name,
          name: serviceNames.filter(Boolean).join(", "),
          unit_price: servicesVal,
          quantity: 1,
          commission_pct,
          commission_value,
          commission_status: isPaid ? "paid" : "pending",
          professionals: pro,
          commandas: {
            closed_at: appt.start_at,
            number: `${appt.id.substring(0, 4)}`
          }
        };
      });

      return [...(cmdItems ?? []), ...apptItems].sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    }
  });

  const { data: professionals } = useQuery({
    queryKey: ["pros-list-comm", tenantId],
    enabled: !!tenantId,
    queryFn: async () => (await supabase.from("professionals").select("*").eq("tenant_id", tenantId!).eq("active", true)).data ?? []
  });

  const filteredItems = selectedProId === "all"
    ? (items ?? [])
    : (items ?? []).filter((i: any) => i.professional_id === selectedProId);

  const pending = filteredItems.filter((i:any)=>i.commission_status==="pending");
  const paid = filteredItems.filter((i:any)=>i.commission_status==="paid");
  const totalGen = filteredItems.reduce((a:number,b:any)=>a+Number(b.commission_value||0),0);
  const totalPaid = paid.reduce((a:number,b:any)=>a+Number(b.commission_value||0),0);
  const totalPending = pending.reduce((a:number,b:any)=>a+Number(b.commission_value||0),0);

  async function payAll(proId?: string) {
    const q = supabase.from("commanda_items").update({ commission_status: "paid" }).eq("tenant_id", tenantId!).eq("commission_status", "pending");
    const { error } = proId ? await q.eq("professional_id", proId) : await q;
    if (error) return toast.error(error.message);

    // Mark completed appointments commissions as paid
    const apptQuery = supabase.from("appointments").select("id, notes").eq("tenant_id", tenantId!).eq("status", "completed");
    const { data: toPayAppts } = proId ? await apptQuery.eq("professional_id", proId) : await apptQuery;
    
    for (const appt of toPayAppts ?? []) {
      if (appt.notes && appt.notes.includes("Comissão: paid")) continue;
      const newNotes = [appt.notes, "Comissão: paid"].filter(Boolean).join(" | ");
      await supabase.from("appointments").update({ notes: newNotes }).eq("id", appt.id);
    }

    toast.success("Comissões pagas");
    qc.invalidateQueries({ queryKey: ["commissions"] });
    qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
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
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <Label className="text-xs uppercase text-muted-foreground font-semibold shrink-0">Profissional:</Label>
            <Select value={selectedProId} onValueChange={setSelectedProId}>
              <SelectTrigger className="w-[200px] h-9 bg-background">
                <SelectValue placeholder="Todos os Profissionais" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os Profissionais</SelectItem>
                {professionals?.map((p: any) => (
                  <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={()=>payAll(selectedProId === "all" ? undefined : selectedProId)} disabled={pending.length===0}>
            {selectedProId === "all" ? "Pagar TODAS pendentes" : `Pagar pendentes de ${professionals?.find((p:any) => p.id === selectedProId)?.full_name || ""}`}
          </Button>
        </div>
        <Table><TableHeader><TableRow><TableHead>Data</TableHead><TableHead>Colaborador</TableHead><TableHead>Cliente</TableHead><TableHead>Item</TableHead><TableHead>Valor</TableHead><TableHead>%</TableHead><TableHead>Comissão</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
          <TableBody>{(filteredItems ?? []).map((i:any) => {
            const clientName = i.client_name || i.commandas?.client_name || "Cliente";
            return (
              <TableRow key={i.id}>
                <TableCell className="text-xs">{i.commandas?.closed_at ? dateBR(i.commandas.closed_at) : "—"}</TableCell>
                <TableCell className="font-medium">{i.professionals?.full_name}</TableCell>
                <TableCell className="text-muted-foreground font-medium">{clientName}</TableCell>
                <TableCell>{i.name}</TableCell>
                <TableCell>{brl(Number(i.unit_price)*i.quantity)}</TableCell>
                <TableCell>{i.commission_pct}%</TableCell>
                <TableCell className="font-semibold text-primary">{brl(i.commission_value)}</TableCell>
                <TableCell><span className={`text-xs px-2 py-0.5 rounded-full ${i.commission_status==="paid"?"bg-success/10 text-success":"bg-warning/20 text-[oklch(0.5_0.15_60)]"}`}>{i.commission_status}</span></TableCell>
              </TableRow>
            );
          })}</TableBody></Table>
      </CardContent></Card>
    </div>
  );
}

function StatCard({ title, value, icon: Icon, tone }: any) {
  const tones: any = { info: "bg-info/10 text-info", success: "bg-success/10 text-success", warning: "bg-warning/15 text-[oklch(0.55_0.15_60)]" };
  return (<Card><CardContent className="p-5 flex items-center gap-4"><div className={`stat-icon ${tones[tone]}`}><Icon className="h-5 w-5"/></div><div><div className="text-xs text-muted-foreground uppercase font-semibold">{title}</div><div className="text-xl font-semibold">{value}</div></div></CardContent></Card>);
}

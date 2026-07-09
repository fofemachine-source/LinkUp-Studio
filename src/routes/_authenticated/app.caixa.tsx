import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useCurrentTenant } from "@/hooks/use-tenant";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Wallet, ArrowDownCircle, ArrowUpCircle, Plus } from "lucide-react";
import { useState } from "react";
import { brl, dateBR } from "@/lib/format";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/app/caixa")({ component: CaixaPage });

function CaixaPage() {
  const tenantId = useCurrentTenant().data?.id; const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const { data } = useQuery({ queryKey: ["cash", tenantId], enabled: !!tenantId, queryFn: async () => (await supabase.from("cash_movements").select("*").eq("tenant_id", tenantId!).order("created_at", { ascending: false }).limit(100)).data ?? [] });
  const totalIn = (data ?? []).filter((m:any)=>m.kind==="in").reduce((a:number,b:any)=>a+Number(b.amount),0);
  const totalOut = (data ?? []).filter((m:any)=>m.kind==="out").reduce((a:number,b:any)=>a+Number(b.amount),0);
  return (<div className="space-y-6 max-w-[1400px] mx-auto">
    <div className="flex justify-between"><div><h1 className="text-3xl font-semibold flex items-center gap-2"><Wallet className="h-7 w-7 text-primary"/>Fluxo de Caixa</h1></div>
      <Dialog open={open} onOpenChange={setOpen}><DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2"/>Movimentação</Button></DialogTrigger>
        <MovDialog tenantId={tenantId} onDone={()=>{setOpen(false);qc.invalidateQueries({queryKey:["cash"]});}}/></Dialog></div>
    <div className="grid grid-cols-3 gap-4">
      <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">ENTRADAS</div><div className="text-2xl font-semibold text-success">{brl(totalIn)}</div></CardContent></Card>
      <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">SAÍDAS</div><div className="text-2xl font-semibold text-destructive">{brl(totalOut)}</div></CardContent></Card>
      <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">SALDO</div><div className="text-2xl font-semibold text-primary">{brl(totalIn-totalOut)}</div></CardContent></Card>
    </div>
    <Card><CardContent className="p-6"><Table><TableHeader><TableRow><TableHead>Data</TableHead><TableHead>Tipo</TableHead><TableHead>Descrição</TableHead><TableHead>Valor</TableHead></TableRow></TableHeader>
      <TableBody>{(data ?? []).map((m:any)=>(<TableRow key={m.id}><TableCell>{dateBR(m.created_at)}</TableCell>
        <TableCell>{m.kind==="in"?<span className="flex items-center gap-1 text-success"><ArrowDownCircle className="h-4 w-4"/>Entrada</span>:<span className="flex items-center gap-1 text-destructive"><ArrowUpCircle className="h-4 w-4"/>Saída</span>}</TableCell>
        <TableCell>{m.description}</TableCell><TableCell className={m.kind==="in"?"text-success font-semibold":"text-destructive font-semibold"}>{brl(m.amount)}</TableCell></TableRow>))}</TableBody></Table></CardContent></Card>
  </div>);
}

function MovDialog({ tenantId, onDone }: any) {
  const [f, setF] = useState({ kind: "in", amount: 0, description: "" });
  return (<DialogContent><DialogHeader><DialogTitle>Nova movimentação</DialogTitle></DialogHeader>
    <div className="space-y-3"><div><Label>Tipo</Label><Select value={f.kind} onValueChange={v=>setF({...f,kind:v})}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="in">Entrada</SelectItem><SelectItem value="out">Saída</SelectItem></SelectContent></Select></div>
    <div><Label>Valor</Label><Input type="number" step="0.01" value={f.amount} onChange={e=>setF({...f,amount:Number(e.target.value)})}/></div>
    <div><Label>Descrição</Label><Input value={f.description} onChange={e=>setF({...f,description:e.target.value})}/></div></div>
    <DialogFooter><Button onClick={async()=>{const{error}=await supabase.from("cash_movements").insert({...f,tenant_id:tenantId});if(error)toast.error(error.message);else{toast.success("Salvo");onDone();}}}>Salvar</Button></DialogFooter></DialogContent>);
}

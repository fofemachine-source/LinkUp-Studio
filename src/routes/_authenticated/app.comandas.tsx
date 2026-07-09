import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { useCurrentTenant } from "@/hooks/use-tenant";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, DollarSign, ShoppingCart } from "lucide-react";
import { useState } from "react";
import { brl, dateBR } from "@/lib/format";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/app/comandas")({ component: ComandasPage });

function ComandasPage() {
  const tenantId = useCurrentTenant().data?.id; const qc = useQueryClient();
  const { data: open } = useQuery({ queryKey: ["cmd-open", tenantId], enabled: !!tenantId, queryFn: async () => (await supabase.from("commandas").select("*, commanda_items(*)").eq("tenant_id", tenantId!).eq("status", "open").order("created_at")).data ?? [] });
  const { data: closed } = useQuery({ queryKey: ["cmd-closed", tenantId], enabled: !!tenantId, queryFn: async () => (await supabase.from("commandas").select("*").eq("tenant_id", tenantId!).eq("status", "closed").order("closed_at", { ascending: false }).limit(20)).data ?? [] });
  const [selected, setSelected] = useState<any>(null);
  const [newOpen, setNewOpen] = useState(false);

  return (
    <div className="space-y-6 max-w-[1400px] mx-auto">
      <div className="flex justify-between items-start">
        <div><h1 className="text-3xl font-semibold flex items-center gap-2"><ShoppingCart className="h-7 w-7 text-primary"/>Comandas / Venda</h1>
          <p className="text-muted-foreground">Registre atendimentos e vendas.</p></div>
        <Dialog open={newOpen} onOpenChange={setNewOpen}><DialogTrigger asChild><Button size="lg"><Plus className="h-4 w-4 mr-2"/>NOVA COMANDA</Button></DialogTrigger>
          <NewCmdDialog tenantId={tenantId} onDone={()=>{setNewOpen(false);qc.invalidateQueries({queryKey:["cmd-open"]});}}/></Dialog>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <div className="space-y-3">
          <h3 className="font-semibold">Abertas ({open?.length ?? 0})</h3>
          {(open ?? []).map((c:any) => (
            <Card key={c.id} className="cursor-pointer hover:border-primary" onClick={()=>setSelected(c)}>
              <CardContent className="p-4 flex items-center justify-between">
                <div><div className="font-medium">#{c.number} — {c.client_name}</div><div className="text-xs text-muted-foreground">{c.commanda_items?.length ?? 0} itens</div></div>
                <div className="text-lg font-semibold text-primary">{brl(c.total)}</div>
              </CardContent></Card>
          ))}
          {(open?.length ?? 0) === 0 && <div className="text-sm text-muted-foreground p-6 border rounded-xl text-center">Sem comandas abertas</div>}
        </div>
        <div className="space-y-3">
          <h3 className="font-semibold">Fechadas recentes</h3>
          {(closed ?? []).map((c:any) => (
            <Card key={c.id}><CardContent className="p-4 flex items-center justify-between text-sm">
              <div><div className="font-medium">#{c.number} — {c.client_name}</div><div className="text-xs text-muted-foreground">{c.closed_at ? dateBR(c.closed_at) : ""} • {c.payment_method?.toUpperCase()}</div></div>
              <div className="font-semibold text-success">{brl(c.total)}</div>
            </CardContent></Card>
          ))}
        </div>
      </div>

      <Dialog open={!!selected} onOpenChange={(v)=>{if(!v)setSelected(null);}}>
        {selected && <CmdDetail cmd={selected} tenantId={tenantId} onDone={()=>{setSelected(null);qc.invalidateQueries();}}/>}
      </Dialog>
    </div>
  );
}

function NewCmdDialog({ tenantId, onDone }: any) {
  const [name, setName] = useState("");
  async function create() {
    const { data: count } = await supabase.from("commandas").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId);
    const number = (count as any)?.count ? (count as any).count + 1 : Math.floor(Math.random()*10000);
    const { error } = await supabase.from("commandas").insert({ tenant_id: tenantId, client_name: name, number, status: "open" });
    if (error) return toast.error(error.message);
    toast.success("Comanda aberta"); onDone();
  }
  return (<DialogContent><DialogHeader><DialogTitle>Nova comanda</DialogTitle></DialogHeader>
    <div><Label>Nome do cliente</Label><Input value={name} onChange={e=>setName(e.target.value)}/></div>
    <DialogFooter><Button onClick={create}>Abrir</Button></DialogFooter></DialogContent>);
}

function CmdDetail({ cmd, tenantId, onDone }: any) {
  const [items, setItems] = useState<any[]>(cmd.commanda_items ?? []);
  const { data: services } = useQuery({ queryKey: ["svc-m", tenantId], queryFn: async () => (await supabase.from("services").select("*").eq("tenant_id", tenantId).eq("active", true)).data ?? [] });
  const { data: products } = useQuery({ queryKey: ["prd-m", tenantId], queryFn: async () => (await supabase.from("products").select("*").eq("tenant_id", tenantId).eq("active", true)).data ?? [] });
  const { data: pros } = useQuery({ queryKey: ["prs-m", tenantId], queryFn: async () => (await supabase.from("professionals").select("*").eq("tenant_id", tenantId).eq("active", true)).data ?? [] });
  const [proId, setProId] = useState<string>("");
  const [payment, setPayment] = useState<string>("pix");
  const total = items.reduce((a,b)=>a+Number(b.unit_price)*b.quantity,0);

  async function addItem(kind: "service"|"product", ref: any) {
    const pro = pros?.find((p:any)=>p.id===proId);
    const commission_pct = kind === "service" ? (pro?.commission_pct ?? 0) : 0;
    const commission_value = (Number(ref.price) * commission_pct) / 100;
    const { data, error } = await supabase.from("commanda_items").insert({
      commanda_id: cmd.id, tenant_id: tenantId, kind, ref_id: ref.id, name: ref.name, quantity: 1,
      unit_price: ref.price, professional_id: kind === "service" ? proId || null : null,
      commission_pct, commission_value,
    }).select("*").single();
    if (error) return toast.error(error.message);
    setItems([...items, data]);
  }
  async function removeItem(id: string) {
    await supabase.from("commanda_items").delete().eq("id", id);
    setItems(items.filter(i=>i.id!==id));
  }
  async function close() {
    const newTotal = items.reduce((a,b)=>a+Number(b.unit_price)*b.quantity,0);
    const { error } = await supabase.from("commandas").update({ status: "closed", closed_at: new Date().toISOString(), total: newTotal, subtotal: newTotal, payment_method: payment }).eq("id", cmd.id);
    if (error) return toast.error(error.message);
    await supabase.from("cash_movements").insert({ tenant_id: tenantId, kind: "in", amount: newTotal, description: `Comanda #${cmd.number}` });
    toast.success("Comanda fechada"); onDone();
  }
  return (<DialogContent className="max-w-3xl">
    <DialogHeader><DialogTitle>Comanda #{cmd.number} — {cmd.client_name}</DialogTitle></DialogHeader>
    <div className="grid md:grid-cols-2 gap-4">
      <div className="space-y-3">
        <div><Label>Profissional</Label><Select value={proId} onValueChange={setProId}><SelectTrigger><SelectValue placeholder="Escolha"/></SelectTrigger><SelectContent>{pros?.map((p:any)=><SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>)}</SelectContent></Select></div>
        <div><Label>Serviços</Label>
          <div className="flex flex-wrap gap-2 mt-1">{services?.map((s:any)=>(<button key={s.id} type="button" onClick={()=>addItem("service",s)} className="px-3 py-1 rounded-full bg-primary/10 text-primary text-xs hover:bg-primary hover:text-primary-foreground">{s.name} • {brl(s.price)}</button>))}</div>
        </div>
        <div><Label>Produtos</Label>
          <div className="flex flex-wrap gap-2 mt-1">{products?.map((p:any)=>(<button key={p.id} type="button" onClick={()=>addItem("product",p)} className="px-3 py-1 rounded-full bg-muted text-xs hover:bg-muted/70">{p.name} • {brl(p.price)}</button>))}</div>
        </div>
      </div>
      <div className="space-y-3">
        <div className="border rounded-xl p-3 min-h-[200px] max-h-[300px] overflow-y-auto space-y-2">
          {items.length === 0 ? <div className="text-sm text-muted-foreground text-center py-8">Sem itens</div> :
            items.map((i)=>(<div key={i.id} className="flex items-center justify-between text-sm p-2 bg-muted/40 rounded-lg">
              <div><div className="font-medium">{i.name}</div><div className="text-xs text-muted-foreground">{brl(i.unit_price)}</div></div>
              <Button size="icon" variant="ghost" onClick={()=>removeItem(i.id)}><Trash2 className="h-3 w-3"/></Button>
            </div>))}
        </div>
        <div className="p-4 bg-primary/5 rounded-xl"><div className="text-xs text-muted-foreground">TOTAL</div><div className="text-3xl font-semibold text-primary">{brl(total)}</div></div>
        <div><Label>Pagamento</Label><Select value={payment} onValueChange={setPayment}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>
          <SelectItem value="pix">PIX</SelectItem><SelectItem value="cash">Dinheiro</SelectItem><SelectItem value="credit">Crédito</SelectItem><SelectItem value="debit">Débito</SelectItem>
        </SelectContent></Select></div>
      </div>
    </div>
    <DialogFooter><Button variant="outline" onClick={onDone}>Fechar</Button><Button onClick={close} disabled={items.length===0}><DollarSign className="h-4 w-4 mr-2"/>FECHAR VENDA</Button></DialogFooter>
  </DialogContent>);
}

import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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

      <Sheet open={!!selected} onOpenChange={(v)=>{if(!v)setSelected(null);}}>
        {selected && <CmdDetail cmd={selected} tenantId={tenantId} onDone={()=>{setSelected(null);qc.invalidateQueries();}}/>}
      </Sheet>
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

  const [tab, setTab] = useState<"service"|"product">("service");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [proId, setProId] = useState<string>("");
  const [qty, setQty] = useState<number>(1);

  const [discount, setDiscount] = useState<number>(0);
  const [addition, setAddition] = useState<number>(0);
  const [payment, setPayment] = useState<string>("pix");

  const subtotal = items.reduce((a,b)=>a+Number(b.unit_price)*b.quantity,0);
  const liquidTotal = subtotal - discount + addition;

  async function confirmAddition() {
    if (selectedIds.length === 0) return toast.error("Selecione pelo menos um item.");
    const pro = pros?.find((p:any)=>p.id===proId);
    const newItems = [];
    for (const id of selectedIds) {
      let ref = tab === "service" ? services?.find((s:any)=>s.id===id) : products?.find((p:any)=>p.id===id);
      if (!ref) continue;
      const commission_pct = tab === "service" ? (pro?.commission_pct ?? 0) : 0;
      const commission_value = ((Number(ref.price) * qty) * commission_pct) / 100;
      const { data, error } = await supabase.from("commanda_items").insert({
        commanda_id: cmd.id, tenant_id: tenantId, kind: tab, ref_id: ref.id, name: ref.name, quantity: qty,
        unit_price: ref.price, professional_id: tab === "service" ? (proId || null) : null,
        commission_pct, commission_value,
      }).select("*").single();
      if (error) { toast.error(error.message); continue; }
      newItems.push(data);
    }
    setItems([...items, ...newItems]);
    setSelectedIds([]);
    setQty(1);
    toast.success("Itens adicionados!");
  }

  async function removeItem(id: string) {
    await supabase.from("commanda_items").delete().eq("id", id);
    setItems(items.filter(i=>i.id!==id));
  }

  async function close() {
    const { error } = await supabase.from("commandas").update({ 
      status: "closed", closed_at: new Date().toISOString(), total: liquidTotal, subtotal: subtotal, payment_method: payment 
    }).eq("id", cmd.id);
    if (error) return toast.error(error.message);
    await supabase.from("cash_movements").insert({ tenant_id: tenantId, kind: "in", amount: liquidTotal, description: `Comanda #${cmd.number}` });
    toast.success("Comanda fechada"); onDone();
  }

  return (
    <SheetContent className="sm:max-w-[500px] w-[95vw] overflow-y-auto flex flex-col p-0">
      <div className="p-6 border-b">
        <SheetHeader>
          <SheetTitle className="text-xl flex justify-between items-start">
            <div>
              Detalhes da Comanda #{cmd.number}
              <div className="text-sm text-muted-foreground font-normal mt-1">Cliente: {cmd.client_name}</div>
            </div>
          </SheetTitle>
        </SheetHeader>
      </div>

      <div className="flex-1 p-6 space-y-6">
        <div>
          {items.length === 0 ? (
            <div className="text-sm text-muted-foreground text-center italic py-4">Comanda vazia! Adicione itens abaixo.</div>
          ) : (
            <div className="space-y-2 mb-4 border rounded-xl p-3">
              {items.map(i => (
                <div key={i.id} className="flex justify-between items-center text-sm p-2 bg-muted/30 rounded-lg">
                  <div>
                    <div className="font-medium">{i.name} {i.quantity > 1 && `(x${i.quantity})`}</div>
                    <div className="text-xs text-muted-foreground">{brl(i.unit_price)} unid</div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="font-semibold text-primary">{brl(i.unit_price * i.quantity)}</div>
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={()=>removeItem(i.id)}><Trash2 className="h-4 w-4"/></Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="border rounded-xl p-4 bg-primary/5 border-primary/20 space-y-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-primary">INJETAR NOVO ITEM</div>
          <Tabs value={tab} onValueChange={(v:any)=>{setTab(v);setSelectedIds([]);}}>
            <TabsList className="grid grid-cols-2 w-full bg-primary/10 text-primary">
              <TabsTrigger value="service" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">SERVIÇO</TabsTrigger>
              <TabsTrigger value="product" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">PRODUTO</TabsTrigger>
            </TabsList>
            
            <div className="mt-4 space-y-4">
              <div className="text-xs text-muted-foreground uppercase font-semibold">Selecione o(s) item(s)</div>
              <div className="max-h-[200px] overflow-y-auto space-y-1 border rounded-lg p-1 bg-background">
                {(tab === "service" ? services : products)?.map((item:any) => {
                   const sel = selectedIds.includes(item.id);
                   return (
                     <div key={item.id} className={`flex items-center justify-between p-2 rounded-md cursor-pointer text-sm transition-colors ${sel ? 'bg-primary/10 border border-primary/30' : 'hover:bg-muted'}`} onClick={()=>{
                       if(sel) setSelectedIds(selectedIds.filter(id=>id!==item.id));
                       else setSelectedIds([...selectedIds, item.id]);
                     }}>
                       <div className="flex items-center gap-3">
                         <div className={`h-4 w-4 rounded-sm border flex items-center justify-center transition-colors ${sel?'bg-primary border-primary text-primary-foreground':'border-input'}`}>{sel && "✓"}</div>
                         <span className={sel ? "font-medium text-primary" : ""}>{item.name}</span>
                       </div>
                       <span className={sel ? "font-medium text-primary" : "text-muted-foreground"}>{brl(item.price)}</span>
                     </div>
                   );
                })}
                {(tab === "service" ? services : products)?.length === 0 && <div className="text-xs text-center py-4 text-muted-foreground">Nenhum cadastrado</div>}
              </div>

              <div className="grid grid-cols-2 gap-3">
                {tab === "service" && (
                  <div>
                    <Label className="text-xs text-muted-foreground uppercase">Profissional</Label>
                    <Select value={proId} onValueChange={setProId}><SelectTrigger className="h-9"><SelectValue placeholder="Escolha"/></SelectTrigger><SelectContent>{pros?.map((p:any)=><SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>)}</SelectContent></Select>
                  </div>
                )}
                <div>
                  <Label className="text-xs text-muted-foreground uppercase">Quantidade</Label>
                  <Input type="number" min={1} value={qty} onChange={e=>setQty(Number(e.target.value))} className="h-9"/>
                </div>
              </div>
              
              <Button className="w-full bg-primary/10 text-primary hover:bg-primary/20" variant="ghost" onClick={confirmAddition}>CONFIRMAR ADIÇÃO ➕</Button>
            </div>
          </Tabs>
        </div>

        <div className="space-y-4 pt-4 border-t">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-muted-foreground uppercase">Aplicar Desconto (R$)</Label>
              <Input type="number" step="0.01" value={discount} onChange={e=>setDiscount(Number(e.target.value))} className="h-9"/>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground uppercase">Acréscimo (R$)</Label>
              <Input type="number" step="0.01" value={addition} onChange={e=>setAddition(Number(e.target.value))} className="h-9"/>
            </div>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground uppercase">Forma de Pagamento</Label>
            <Select value={payment} onValueChange={setPayment}><SelectTrigger className="h-9"><SelectValue/></SelectTrigger><SelectContent>
              <SelectItem value="pix">PIX Chave QR</SelectItem><SelectItem value="cash">Dinheiro</SelectItem><SelectItem value="credit">Cartão de Crédito</SelectItem><SelectItem value="debit">Cartão de Débito</SelectItem>
            </SelectContent></Select>
          </div>
          
          <div className="p-4 bg-muted/30 rounded-xl space-y-2">
            <div className="flex justify-between text-sm text-muted-foreground"><span>Subtotal</span><span>{brl(subtotal)}</span></div>
            {discount > 0 && <div className="flex justify-between text-sm text-destructive"><span>Desconto</span><span>- {brl(discount)}</span></div>}
            {addition > 0 && <div className="flex justify-between text-sm text-muted-foreground"><span>Acréscimo</span><span>+ {brl(addition)}</span></div>}
            <div className="flex justify-between text-lg font-bold text-primary pt-2 border-t border-border/50">
              <span>LÍQUIDO TOTAL</span><span>{brl(liquidTotal)}</span>
            </div>
          </div>
          
          <Button onClick={close} disabled={items.length===0} className="w-full h-12 text-md font-semibold bg-[#4f81fb] hover:bg-[#3d6adb] text-white">
            FINALIZAR VENDA 💰
          </Button>
        </div>
      </div>
    </SheetContent>
  );
}

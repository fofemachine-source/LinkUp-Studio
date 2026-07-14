import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCurrentTenant, useUserRole } from "@/hooks/use-tenant";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, DollarSign, ShoppingCart } from "lucide-react";
import { useState, useEffect } from "react";
import { brl, dateBR } from "@/lib/format";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/app/comandas")({ component: ComandasPage });

function getElapsedTime(createdAtStr: string) {
  const diff = Date.now() - new Date(createdAtStr).getTime();
  const mins = Math.floor(diff / 60000);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}h${m.toString().padStart(2, "0")}`;
}

function ComandasPage() {
  const tenantId = useCurrentTenant().data?.id; const qc = useQueryClient();
  const { data: open } = useQuery({ queryKey: ["cmd-open", tenantId], enabled: !!tenantId, queryFn: async () => (await supabase.from("commandas").select("*, commanda_items(*), clients(is_subscriber)").eq("tenant_id", tenantId!).eq("status", "open").order("created_at")).data ?? [] });
  const { data: closed } = useQuery({ queryKey: ["cmd-closed", tenantId], enabled: !!tenantId, queryFn: async () => (await supabase.from("commandas").select("*, clients(is_subscriber)").eq("tenant_id", tenantId!).eq("status", "closed").order("closed_at", { ascending: false }).limit(20)).data ?? [] });
  const [selected, setSelected] = useState<any>(null);
  const [newOpen, setNewOpen] = useState(false);

  return (
    <div className="space-y-8 max-w-[1400px] mx-auto pb-12">
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-semibold flex items-center gap-2">
            <ShoppingCart className="h-7 w-7 text-primary"/>
            Comandas / Venda
          </h1>
          <p className="text-muted-foreground">Registre atendimentos e vendas.</p>
        </div>
        <Dialog open={newOpen} onOpenChange={setNewOpen}>
          <DialogTrigger asChild>
            <Button size="lg">
              <Plus className="h-4 w-4 mr-2"/>NOVA COMANDA
            </Button>
          </DialogTrigger>
          <NewCmdDialog tenantId={tenantId} onDone={()=>{setNewOpen(false);qc.invalidateQueries({queryKey:["cmd-open"]});}}/>
        </Dialog>
      </div>

      <div className="space-y-8">
        <div>
          <h3 className="font-semibold text-lg mb-4 flex items-center gap-2">
            Abertas 
            <span className="px-2 py-0.5 text-xs bg-amber-500/10 text-amber-500 rounded-full font-bold">
              {open?.length ?? 0}
            </span>
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {(open ?? []).map((c: any) => {
              const hasItems = (c.commanda_items?.length ?? 0) > 0;
              const elapsed = getElapsedTime(c.created_at);
              const openTime = new Date(c.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
              return (
                <div 
                  key={c.id} 
                  className="relative p-4 rounded-xl border transition-all cursor-pointer shadow-sm hover:shadow-md hover:scale-[1.02] flex flex-col justify-between min-h-[140px] bg-amber-50/50 border-amber-200/60 hover:border-amber-400 text-amber-900"
                  onClick={() => setSelected(c)}
                >
                  <div>
                    <div className="font-bold text-xs truncate uppercase tracking-wider flex items-center gap-1.5 flex-wrap">
                      <span>#{c.number} — {c.client_name}</span>
                      {c.clients?.is_subscriber && (
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-800 dark:text-emerald-300 animate-pulse">Assinante</span>
                      )}
                    </div>
                    <div className="text-[11px] opacity-70 mt-1.5 space-y-0.5">
                      <div>{hasItems ? `${c.commanda_items.length} itens` : "Sem itens"}</div>
                      <div className="text-[10px]">Abertura: {openTime}</div>
                    </div>
                  </div>
                  <div className="flex items-end justify-between mt-4">
                    <div className="text-lg font-extrabold">{brl(c.total)}</div>
                    <div className="flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-700">
                      <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse"></span>
                      {elapsed}
                    </div>
                  </div>
                </div>
              );
            })}
            {(open?.length ?? 0) === 0 && (
              <div className="col-span-full text-sm text-muted-foreground p-8 border border-dashed rounded-xl text-center">
                Sem comandas abertas
              </div>
            )}
          </div>
        </div>

        <div>
          <h3 className="font-semibold text-lg mb-4">Fechadas recentes</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {(closed ?? []).map((c: any) => {
              const openTime = new Date(c.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
              const closeTime = c.closed_at ? new Date(c.closed_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "";
              const closeDate = c.closed_at ? dateBR(c.closed_at) : "";
              return (
                <div 
                  key={c.id} 
                  className="p-4 rounded-xl border border-emerald-100 bg-emerald-50/40 hover:border-emerald-300 hover:scale-[1.02] transition-all cursor-pointer shadow-sm hover:shadow-md flex flex-col justify-between min-h-[145px] text-emerald-950"
                  onClick={() => setSelected(c)}
                >
                  <div>
                    <div className="font-bold text-xs truncate uppercase tracking-wider flex items-center gap-1.5 flex-wrap">
                      <span>#{c.number} — {c.client_name}</span>
                      {c.clients?.is_subscriber && (
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-800 dark:text-emerald-300">Assinante</span>
                      )}
                    </div>
                    <div className="text-[10px] opacity-70 mt-1.5 space-y-0.5">
                      <div>Aberto: {openTime}</div>
                      <div>Fechado: {closeDate} {closeTime ? `às ${closeTime}` : ""}</div>
                    </div>
                  </div>
                  <div className="flex items-end justify-between mt-4">
                    <div className="text-lg font-extrabold text-emerald-700">{brl(c.total)}</div>
                    <div className="text-[9px] uppercase font-bold bg-emerald-500/10 text-emerald-700 px-2 py-0.5 rounded-full">
                      {c.payment_method}
                    </div>
                  </div>
                </div>
              );
            })}
            {(closed?.length ?? 0) === 0 && (
              <div className="col-span-full text-sm text-muted-foreground p-8 border border-dashed rounded-xl text-center">
                Nenhuma comanda fechada recentemente
              </div>
            )}
          </div>
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
  const { data: role } = useUserRole(tenantId);
  const isAdmin = role !== "barber";

  const [items, setItems] = useState<any[]>(cmd.commanda_items ?? []);
  const { data: services } = useQuery({ queryKey: ["svc-m", tenantId], queryFn: async () => (await supabase.from("services").select("*").eq("tenant_id", tenantId).eq("active", true)).data ?? [] });
  const { data: products } = useQuery({ queryKey: ["prd-m", tenantId], queryFn: async () => (await supabase.from("products").select("*").eq("tenant_id", tenantId).eq("active", true)).data ?? [] });
  const { data: pros } = useQuery({ queryKey: ["prs-m", tenantId], queryFn: async () => (await supabase.from("professionals").select("*").eq("tenant_id", tenantId).eq("active", true)).data ?? [] });

  const [tab, setTab] = useState<"service"|"product">("service");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [proId, setProId] = useState<string>("");
  const [qty, setQty] = useState<number>(1);

  const [discount, setDiscount] = useState<number>(cmd.discount ?? 0);
  const [addition, setAddition] = useState<number>(cmd.addition ?? 0);
  const [payment, setPayment] = useState<string>(cmd.payment_method ?? "pix");

  const [editingItemId, setEditingItemId] = useState<string|null>(null);
  const [editPrice, setEditPrice] = useState<string>("");

  const startOfMonthStr = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();

  // Query to find client subscriber status in database
  const { data: clientDetails } = useQuery({
    queryKey: ["client-details", cmd.client_id, cmd.client_name],
    enabled: !!cmd.client_name,
    queryFn: async () => {
      let query = supabase.from("clients").select("*");
      if (cmd.client_id) {
        query = query.eq("id", cmd.client_id);
      } else {
        query = query.eq("full_name", cmd.client_name);
      }
      return (await query.maybeSingle()).data;
    }
  });

  const isSubscriberClient = cmd.clients?.is_subscriber || clientDetails?.is_subscriber;

  // Query to find how many VIP comandas this client had in the current month
  const { data: usageCount } = useQuery({
    queryKey: ["client-vip-usage", cmd.client_id, cmd.client_name, startOfMonthStr],
    enabled: !!cmd.client_name,
    queryFn: async () => {
      let query = supabase
        .from("commandas")
        .select("id", { count: "exact", head: true })
        .eq("status", "closed")
        .eq("payment_method", "vip")
        .gte("closed_at", startOfMonthStr);
        
      if (cmd.client_id) {
        query = query.eq("client_id", cmd.client_id);
      } else {
        query = query.eq("client_name", cmd.client_name);
      }
      
      const { count } = await query;
      return count ?? 0;
    }
  });

  // Auto-set payment to VIP for subscribers if no method has been chosen yet
  useEffect(() => {
    if (isSubscriberClient && !cmd.payment_method) {
      setPayment("vip");
    }
  }, [isSubscriberClient, cmd.payment_method]);

  async function saveEditedPrice(itemId: string) {
    const newPrice = Number(editPrice);
    if (isNaN(newPrice) || newPrice < 0) return toast.error("Preço inválido.");
    
    const item = items.find(i => i.id === itemId);
    if (!item) return;

    let commission_value = item.commission_value;
    if (item.kind === "service" && item.commission_pct > 0) {
      commission_value = (newPrice * item.quantity * item.commission_pct) / 100;
    }

    const { error } = await supabase
      .from("commanda_items")
      .update({ unit_price: newPrice, commission_value })
      .eq("id", itemId);

    if (error) return toast.error(error.message);

    setItems(items.map(i => i.id === itemId ? { ...i, unit_price: newPrice, commission_value } : i));
    setEditingItemId(null);
    toast.success("Preço atualizado!");
  }

  const selectedSubtotal = ((tab === "service" ? services : products)
    ?.filter((i: any) => selectedIds.includes(i.id))
    ?.reduce((a: number, b: any) => a + b.price, 0) ?? 0) * qty;

  const baseSubtotal = items.reduce((a, b) => a + (b.unit_price * b.quantity), 0);
  const subtotal = baseSubtotal + selectedSubtotal;
  const liquidTotal = payment === "vip" ? 0 : (subtotal - discount + addition);

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
    if (liquidTotal > 0) {
      await supabase.from("cash_movements").insert({ tenant_id: tenantId, kind: "in", amount: liquidTotal, description: `Comanda #${cmd.number}` });
    }
    toast.success("Comanda fechada"); onDone();
  }

  async function deleteComanda() {
    if (!confirm("Deseja realmente excluir esta comanda e todos os seus itens associados?")) return;
    try {
      await supabase.from("commanda_items").delete().eq("commanda_id", cmd.id);
      await supabase.from("cash_movements").delete().eq("tenant_id", tenantId!).eq("description", `Comanda #${cmd.number}`);
      const { error } = await supabase.from("commandas").delete().eq("id", cmd.id);
      if (error) throw error;
      toast.success("Comanda excluída com sucesso");
      onDone();
    } catch (e: any) {
      toast.error(e.message);
    }
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
                  <div className="flex-1 mr-4">
                    <div className="font-medium">{i.name} {i.quantity > 1 && `(x${i.quantity})`}</div>
                    {editingItemId === i.id ? (
                      <div className="flex items-center gap-1.5 mt-1">
                        <Input 
                          type="number" 
                          step="0.01"
                          value={editPrice} 
                          onChange={e=>setEditPrice(e.target.value)} 
                          className="h-7 w-20 text-xs py-0 px-2 bg-background border-primary"
                          autoFocus
                        />
                        <Button 
                          size="sm" 
                          className="h-7 px-2.5 text-[11px] rounded" 
                          onClick={() => saveEditedPrice(i.id)}
                        >
                          Salvar
                        </Button>
                        <Button 
                          size="sm" 
                          variant="ghost" 
                          className="h-7 px-2 text-[11px] text-muted-foreground rounded" 
                          onClick={() => setEditingItemId(null)}
                        >
                          Sair
                        </Button>
                      </div>
                    ) : (
                      <div className="text-xs text-muted-foreground flex items-center gap-2 mt-0.5">
                        <span>{brl(i.unit_price)} unid</span>
                        <button 
                          type="button"
                          className="text-[10px] text-primary hover:underline font-semibold"
                          onClick={() => { setEditingItemId(i.id); setEditPrice(String(i.unit_price)); }}
                        >
                          (Editar Preço)
                        </button>
                      </div>
                    )}
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
            <Select value={payment} onValueChange={setPayment}>
              <SelectTrigger className="h-9"><SelectValue/></SelectTrigger>
              <SelectContent>
                <SelectItem value="pix">PIX Chave QR</SelectItem>
                <SelectItem value="cash">Dinheiro</SelectItem>
                <SelectItem value="credit">Cartão de Crédito</SelectItem>
                <SelectItem value="debit">Cartão de Débito</SelectItem>
                <SelectItem value="vip">Assinatura / VIP</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {isSubscriberClient && (
            <div className={`p-3.5 rounded-xl border text-xs font-semibold ${
              (usageCount ?? 0) >= 4 
                ? "bg-amber-500/10 border-amber-500/20 text-amber-600 dark:text-amber-400" 
                : "bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400"
            }`}>
              <div className="flex items-center justify-between">
                <span>⭐ PLANO VIP ASSINANTE</span>
                <span className="font-bold">
                  {usageCount ?? 0} / 4 Cortes no Mês
                </span>
              </div>
              {(usageCount ?? 0) >= 4 && (
                <p className="text-[10px] text-muted-foreground mt-1 font-normal">
                  Atenção: Este cliente já atingiu o limite mensal de 4 cortes.
                </p>
              )}
            </div>
          )}
          
          <div className="p-4 bg-muted/30 rounded-xl space-y-2">
            <div className="flex justify-between text-sm text-muted-foreground"><span>Subtotal</span><span>{brl(subtotal)}</span></div>
            {discount > 0 && <div className="flex justify-between text-sm text-destructive"><span>Desconto</span><span>- {brl(discount)}</span></div>}
            {addition > 0 && <div className="flex justify-between text-sm text-muted-foreground"><span>Acréscimo</span><span>+ {brl(addition)}</span></div>}
            <div className="flex justify-between text-lg font-bold text-primary pt-2 border-t border-border/50">
              <span>LÍQUIDO TOTAL</span><span>{brl(liquidTotal)}</span>
            </div>
          </div>
          
          <Button onClick={close} disabled={items.length===0} className="w-full h-12 text-md font-semibold">
            FINALIZAR VENDA 💰
          </Button>
          {isAdmin && (
            <Button onClick={deleteComanda} variant="ghost" className="w-full h-12 text-md font-semibold text-destructive hover:bg-destructive/10 bg-destructive/5 mt-2 rounded-xl">
              EXCLUIR COMANDA 🗑️
            </Button>
          )}
        </div>
      </div>
    </SheetContent>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useCurrentTenant } from "@/hooks/use-tenant";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Crown, Copy } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { brl, cpfMask, dateBR } from "@/lib/format";
import { buildPixPayload } from "@/lib/pix";
import { QrCode } from "@/lib/qr";

export const Route = createFileRoute("/_authenticated/app/assinantes")({ component: SubscribersPage });

function SubscribersPage() {
  const { data: tenant } = useCurrentTenant(); const tenantId = tenant?.id;
  const qc = useQueryClient(); const [open, setOpen] = useState(false); const [pixOpen, setPixOpen] = useState<any>(null);
  const { data } = useQuery({ queryKey: ["subs", tenantId], enabled: !!tenantId, queryFn: async () => (await supabase.from("subscribers").select("*").eq("tenant_id", tenantId!).order("created_at", { ascending: false })).data ?? [] });

  async function toggleStatus(id: string, currentStatus: string) {
    const newStatus = currentStatus === "active" ? "inactive" : "active";
    const { error } = await supabase.from("subscribers").update({ status: newStatus }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Status atualizado!");
    qc.invalidateQueries({ queryKey: ["subs"] });
  }

  return (
    <div className="space-y-6 max-w-[1400px] mx-auto">
      <div className="flex justify-between items-start">
        <div><h1 className="text-3xl font-semibold flex items-center gap-2"><Crown className="h-7 w-7 text-primary" /> Assinantes VIP</h1>
          <p className="text-muted-foreground">Clientes com plano mensal ativo — pagamento via PIX.</p></div>
        <Dialog open={open} onOpenChange={setOpen}><DialogTrigger asChild><Button size="lg"><Plus className="h-4 w-4 mr-2"/>Novo Assinante</Button></DialogTrigger>
          <SubDialog tenantId={tenantId} onDone={()=>{setOpen(false);qc.invalidateQueries({queryKey:["subs"]});}}/></Dialog>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">TOTAL DE ASSINANTES</div><div className="text-2xl font-semibold mt-1">{data?.length ?? 0}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">ATIVOS</div><div className="text-2xl font-semibold mt-1 text-success">{data?.filter((s:any)=>s.status==="active").length ?? 0}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">RECEITA MENSAL</div><div className="text-2xl font-semibold mt-1 text-primary">{brl((data ?? []).filter((s:any)=>s.status==="active").reduce((a:number,b:any)=>a+Number(b.price||0),0))}</div></CardContent></Card>
      </div>

      <Card><CardContent className="p-6">
        <Table><TableHeader><TableRow><TableHead>Nome</TableHead><TableHead>CPF</TableHead><TableHead>WhatsApp</TableHead><TableHead>Plano</TableHead><TableHead>Valor</TableHead><TableHead>Status</TableHead><TableHead></TableHead></TableRow></TableHeader>
          <TableBody>{(data ?? []).map((s:any) => (
            <TableRow key={s.id}>
              <TableCell className="font-medium">{s.full_name}</TableCell>
              <TableCell className="font-mono text-xs">{cpfMask(s.cpf)}</TableCell>
              <TableCell>{s.whatsapp}</TableCell>
              <TableCell>{s.plan}</TableCell>
              <TableCell>{brl(s.price)}</TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  <Switch checked={s.status === "active"} onCheckedChange={() => toggleStatus(s.id, s.status)} />
                  <span className={`text-xs px-2 py-0.5 rounded-full ${s.status==="active"?"bg-success/10 text-success":"bg-muted text-muted-foreground"}`}>{s.status === "active" ? "Ativo" : "Inativo"}</span>
                </div>
              </TableCell>
              <TableCell><Button size="sm" variant="outline" onClick={()=>setPixOpen(s)}>Gerar PIX</Button></TableCell>
            </TableRow>
          ))}</TableBody></Table>
      </CardContent></Card>

      <Dialog open={!!pixOpen} onOpenChange={(v)=>{if(!v)setPixOpen(null);}}>
        {pixOpen && <PixDialog sub={pixOpen} tenant={tenant} />}
      </Dialog>
    </div>
  );
}

function SubDialog({ tenantId, onDone }: any) {
  const [f, setF] = useState({ full_name: "", cpf: "", whatsapp: "", plan: "Corte Mensal", price: 89.90, status: "active" });
  async function save() {
    const cpf = f.cpf.replace(/\D/g,"");
    if (cpf.length !== 11) return toast.error("CPF inválido");
    const { error } = await supabase.from("subscribers").insert({ ...f, cpf, tenant_id: tenantId });
    if (error) return toast.error(error.message);
    toast.success("Assinante criado"); onDone();
  }
  return (<DialogContent><DialogHeader><DialogTitle>Novo Assinante VIP</DialogTitle></DialogHeader>
    <div className="space-y-3">
      <div><Label>Nome completo</Label><Input value={f.full_name} onChange={e=>setF({...f,full_name:e.target.value})}/></div>
      <div className="grid grid-cols-2 gap-3">
        <div><Label>CPF</Label><Input value={cpfMask(f.cpf)} onChange={e=>setF({...f,cpf:e.target.value})}/></div>
        <div><Label>WhatsApp</Label><Input value={f.whatsapp} onChange={e=>setF({...f,whatsapp:e.target.value})}/></div>
        <div><Label>Plano</Label><Input value={f.plan} onChange={e=>setF({...f,plan:e.target.value})}/></div>
        <div><Label>Valor mensal</Label><Input type="number" step="0.01" value={f.price} onChange={e=>setF({...f,price:Number(e.target.value)})}/></div>
      </div>
    </div><DialogFooter><Button onClick={save}>Salvar</Button></DialogFooter></DialogContent>);
}

function PixDialog({ sub, tenant }: { sub: any; tenant: any }) {
  const key = String(tenant?.pix_key || "05117727266").replace(/\D/g, "");
  const holder = String(tenant?.pix_holder || "ERNESTH F P COUTO SILVA").substring(0, 25);
  const cityStr = String(tenant?.city || "SAO PAULO").substring(0, 15);
  const txidStr = String(sub?.id || "TXID123").replace(/[^a-zA-Z0-9]/g, "").substring(0, 25);
  const amountNum = Number(sub?.price || 0);

  let payload = "";
  try {
    payload = buildPixPayload({ 
      key, 
      merchant: holder, 
      amount: amountNum, 
      city: cityStr, 
      txid: txidStr 
    });
  } catch (err) {
    console.error("Erro gerando PIX:", err);
  }

  return (<DialogContent><DialogHeader><DialogTitle>PIX — {sub?.full_name || "Assinante"}</DialogTitle></DialogHeader>
    <div className="space-y-4 text-center">
      <div className="text-3xl font-semibold text-primary">{brl(amountNum)}</div>
      <div className="text-xs text-muted-foreground">{sub?.plan || "Plano Mensal"}</div>
      <div className="flex justify-center">
        {payload ? <QrCode value={payload} size={240} /> : <div className="p-8 text-xs text-red-500 border rounded-lg">Erro ao gerar QRCode. Verifique as configurações do PIX.</div>}
      </div>
      <div className="p-3 bg-muted/50 rounded-lg text-left space-y-1 text-xs">
        <div><span className="text-muted-foreground">Chave:</span> <span className="font-mono">{cpfMask(key)}</span></div>
        <div><span className="text-muted-foreground">Favorecido:</span> {holder}</div>
      </div>
      <Button disabled={!payload} className="w-full" onClick={()=>{navigator.clipboard.writeText(payload);toast.success("Código PIX copiado!");}}><Copy className="h-4 w-4 mr-2"/>COPIAR CÓDIGO PIX</Button>
    </div></DialogContent>);
}

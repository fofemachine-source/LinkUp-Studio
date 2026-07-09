import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent } from "@/components/ui/card";
import { Package, Plus } from "lucide-react";
import { useCurrentTenant } from "@/hooks/use-tenant";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { brl } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/app/estoque")({ component: EstoquePage });

function EstoquePage() {
  const { data: tenant } = useCurrentTenant();
  const tenantId = tenant?.id;
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const { data, isLoading } = useQuery({ 
    queryKey: ["products-all", tenantId], 
    enabled: !!tenantId, 
    queryFn: async () => (await supabase.from("products").select("*").eq("tenant_id", tenantId!).order("name")).data ?? [] 
  });
  
  const [f, setF] = useState({ name: "", price: 0, stock: 0 });

  return (
    <div className="max-w-[1400px] mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-semibold flex items-center gap-2"><Package className="h-7 w-7 text-primary"/>Estoque</h1>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2"/>Novo Produto</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Novo produto</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Nome</Label><Input value={f.name} onChange={e=>setF({...f,name:e.target.value})}/></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Preço de Venda</Label><Input type="number" step="0.01" value={f.price} onChange={e=>setF({...f,price:Number(e.target.value)})}/></div>
                <div><Label>Qtd. Estoque</Label><Input type="number" value={f.stock} onChange={e=>setF({...f,stock:Number(e.target.value)})}/></div>
              </div>
            </div>
            <DialogFooter>
              <Button onClick={async()=>{
                const{error}=await supabase.from("products").insert({...f,tenant_id:tenantId!});
                if(error) toast.error(error.message);
                else {
                  toast.success("Produto adicionado ao estoque!");
                  setOpen(false);
                  setF({name:"",price:0,stock:0});
                  qc.invalidateQueries({queryKey:["products-all"]});
                }
              }}>Salvar Produto</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome do Produto</TableHead>
                <TableHead>Preço (R$)</TableHead>
                <TableHead>Em Estoque</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">Carregando estoque...</TableCell></TableRow>}
              {!isLoading && data?.length === 0 && <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">Nenhum produto cadastrado no estoque.</TableCell></TableRow>}
              {(data ?? []).map((p:any) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">{p.name}</TableCell>
                  <TableCell>{brl(p.price)}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{p.stock} un</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    {p.stock > 10 ? <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full font-medium">Estoque Seguro</span> : 
                     p.stock > 0 ? <span className="text-xs bg-amber-100 text-amber-700 px-2 py-1 rounded-full font-medium">Estoque Baixo</span> : 
                     <span className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded-full font-medium">Sem Estoque</span>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

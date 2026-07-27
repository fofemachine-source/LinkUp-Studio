import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent } from "@/components/ui/card";
import { Package, Plus, Pencil } from "lucide-react";
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
  const [editOpen, setEditOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const { data, isLoading } = useQuery({ 
    queryKey: ["products-all", tenantId], 
    enabled: !!tenantId, 
    queryFn: async () => (await supabase.from("products").select("*").eq("tenant_id", tenantId!).order("name")).data ?? [] 
  });
  
  const [f, setF] = useState({ name: "", price: 0, stock: 0 });

  return (
    <div className="max-w-[1400px] mx-auto space-y-6 pb-24 md:pb-0">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
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

      <Card className="hidden overflow-hidden md:block">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome do Produto</TableHead>
                <TableHead>Preço (R$)</TableHead>
                <TableHead>Em Estoque</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-[80px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Carregando estoque...</TableCell></TableRow>}
              {!isLoading && data?.length === 0 && <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Nenhum produto cadastrado no estoque.</TableCell></TableRow>}
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
                  <TableCell>
                    <Button variant="ghost" size="icon" onClick={() => { setF({ name: p.name, price: p.price, stock: p.stock }); setEditingId(p.id); setEditOpen(true); }}><Pencil className="h-4 w-4" /></Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="space-y-3 md:hidden">
        {isLoading && (
          <Card>
            <CardContent className="p-5 text-center text-sm text-muted-foreground">
              Carregando estoque...
            </CardContent>
          </Card>
        )}
        {!isLoading && data?.length === 0 && (
          <Card>
            <CardContent className="p-5 text-center text-sm text-muted-foreground">
              Nenhum produto cadastrado no estoque.
            </CardContent>
          </Card>
        )}
        {(data ?? []).map((p: any) => (
          <Card key={p.id} className="overflow-hidden">
            <CardContent className="space-y-4 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="break-words text-base font-semibold leading-tight">{p.name}</p>
                  <p className="mt-1 text-xs text-muted-foreground">Produto cadastrado no estoque</p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="shrink-0"
                  onClick={() => {
                    setF({ name: p.name, price: p.price, stock: p.stock });
                    setEditingId(p.id);
                    setEditOpen(true);
                  }}
                  aria-label={`Editar ${p.name}`}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
              </div>

              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="rounded-2xl bg-muted/60 p-3">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Preço</p>
                  <p className="mt-1 font-semibold">{brl(p.price)}</p>
                </div>
                <div className="rounded-2xl bg-muted/60 p-3">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Estoque</p>
                  <p className="mt-1 font-semibold">{p.stock} un</p>
                </div>
              </div>

              <div>{renderStockStatus(p.stock)}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Editar Produto</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Nome</Label><Input value={f.name} onChange={e=>setF({...f,name:e.target.value})}/></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Preço de Venda</Label><Input type="number" step="0.01" value={f.price} onChange={e=>setF({...f,price:Number(e.target.value)})}/></div>
              <div><Label>Qtd. Estoque</Label><Input type="number" value={f.stock} onChange={e=>setF({...f,stock:Number(e.target.value)})}/></div>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={async()=>{
              const{error}=await supabase.from("products").update({name:f.name, price:f.price, stock:f.stock}).eq("id", editingId!);
              if(error) toast.error(error.message);
              else {
                toast.success("Produto atualizado!");
                setEditOpen(false);
                setF({name:"",price:0,stock:0});
                setEditingId(null);
                qc.invalidateQueries({queryKey:["products-all"]});
              }
            }}>Salvar Alterações</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function renderStockStatus(stock: number) {
  if (stock > 10) {
    return (
      <span className="inline-flex rounded-full bg-green-100 px-2.5 py-1 text-xs font-medium text-green-700">
        Estoque Seguro
      </span>
    );
  }
  if (stock > 0) {
    return (
      <span className="inline-flex rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-700">
        Estoque Baixo
      </span>
    );
  }
  return (
    <span className="inline-flex rounded-full bg-red-100 px-2.5 py-1 text-xs font-medium text-red-700">
      Sem Estoque
    </span>
  );
}

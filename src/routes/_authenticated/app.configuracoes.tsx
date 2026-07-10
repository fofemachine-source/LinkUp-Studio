import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useCurrentTenant } from "@/hooks/use-tenant";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Building2, MapPin, Clock, MessageCircle } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/configuracoes")({ component: ConfigPage });

function ConfigPage() {
  return (
    <div className="space-y-6 max-w-[1200px] mx-auto">
      <div><h1 className="text-3xl font-semibold">Configurações</h1><p className="text-muted-foreground">Personalize sua barbearia.</p></div>
      <Tabs defaultValue="identity">
        <TabsList><TabsTrigger value="identity"><Building2 className="h-4 w-4 mr-2"/>Identidade</TabsTrigger>
          <TabsTrigger value="location"><MapPin className="h-4 w-4 mr-2"/>Localização</TabsTrigger>
          <TabsTrigger value="hours"><Clock className="h-4 w-4 mr-2"/>Funcionamento</TabsTrigger>
          <TabsTrigger value="whatsapp"><MessageCircle className="h-4 w-4 mr-2"/>WhatsApp</TabsTrigger>
        </TabsList>
        <TabsContent value="identity"><IdentityTab/></TabsContent>
        <TabsContent value="location"><LocationTab/></TabsContent>
        <TabsContent value="hours"><HoursTab/></TabsContent>
        <TabsContent value="whatsapp"><WaTab/></TabsContent>
      </Tabs>
    </div>
  );
}

function IdentityTab() {
  const { data: t } = useCurrentTenant(); const qc = useQueryClient();
  const [f, setF] = useState({ name: "", subtitle: "", primary_color: "#2563eb", slot_minutes: 30, pix_key: "", pix_holder: "" });
  const [logo, setLogo] = useState<File | null>(null);
  useEffect(() => { if (t) setF({ name: t.name, subtitle: t.subtitle ?? "", primary_color: t.primary_color ?? "#2563eb", slot_minutes: t.slot_minutes ?? 30, pix_key: t.pix_key ?? "", pix_holder: t.pix_holder ?? "" }); }, [t]);
  async function save() {
    if (!t?.id) return toast.error("Empresa não carregada. Recarregue a página e tente novamente.");
    let logo_url = t?.logo_url;
    if (logo) {
      const safeName = logo.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `${t.id}/logos/${Date.now()}-${safeName}`;
      const { error } = await supabase.storage.from("assets").upload(path, logo, { upsert: true, contentType: logo.type || "image/jpeg" });
      if (error) return toast.error(error.message);
      const { data: signed, error: signedError } = await supabase.storage.from("assets").createSignedUrl(path, 60 * 60 * 24 * 365 * 5);
      if (signedError || !signed?.signedUrl) return toast.error("Logo enviada, mas não foi possível gerar o link de exibição.");
      logo_url = signed.signedUrl;
    }
    const { error } = await supabase.from("tenants").update({ ...f, logo_url }).eq("id", t.id);
    if (error) return toast.error(error.message);
    toast.success("Salvo"); qc.invalidateQueries({ queryKey: ["current-tenant"] });
  }
  return (<Card><CardContent className="p-6 space-y-4">
    <div className="grid md:grid-cols-2 gap-4">
      <div><Label>Nome</Label><Input value={f.name} onChange={e=>setF({...f,name:e.target.value})}/></div>
      <div><Label>Subtítulo</Label><Input value={f.subtitle} onChange={e=>setF({...f,subtitle:e.target.value})}/></div>
      <div><Label>Cor primária</Label><Input type="color" value={f.primary_color} onChange={e=>setF({...f,primary_color:e.target.value})}/></div>
      <div><Label>Intervalo padrão (min)</Label><Input type="number" value={f.slot_minutes} onChange={e=>setF({...f,slot_minutes:Number(e.target.value)})}/></div>
      <div><Label>Chave PIX</Label><Input value={f.pix_key} onChange={e=>setF({...f,pix_key:e.target.value})}/></div>
      <div><Label>Favorecido PIX</Label><Input value={f.pix_holder} onChange={e=>setF({...f,pix_holder:e.target.value})}/></div>
    </div>
    <div>
      <Label>Logo</Label>
      <div className="flex items-center gap-4 mt-1">
        {t?.logo_url && <img src={t.logo_url} className="h-16 w-16 rounded-lg object-cover border" alt="Logo atual"/>}
        <Input type="file" accept="image/*" onChange={(e)=>setLogo(e.target.files?.[0]??null)}/>
      </div>
      {logo && <p className="text-xs text-muted-foreground mt-1">Novo arquivo selecionado: {logo.name}. Clique em Salvar para aplicar.</p>}
    </div>
    <Button onClick={save}>Salvar identidade</Button>
  </CardContent></Card>);
}


function LocationTab() {
  const { data: t } = useCurrentTenant(); const qc = useQueryClient();
  const [f, setF] = useState({ address: "", city: "", state: "" });
  useEffect(() => { if (t) setF({ address: (t as any).address ?? "", city: (t as any).city ?? "", state: (t as any).state ?? "" }); }, [t]);
  return (<Card><CardContent className="p-6 space-y-4">
    <div><Label>Endereço</Label><Input value={f.address} onChange={e=>setF({...f,address:e.target.value})}/></div>
    <div className="grid grid-cols-2 gap-4"><div><Label>Cidade</Label><Input value={f.city} onChange={e=>setF({...f,city:e.target.value})}/></div>
    <div><Label>Estado</Label><Input value={f.state} onChange={e=>setF({...f,state:e.target.value})}/></div></div>
    <Button onClick={async()=>{const{error}=await supabase.from("tenants").update(f).eq("id",t!.id);if(error)toast.error(error.message);else{toast.success("Salvo");qc.invalidateQueries({queryKey:["current-tenant"]});}}}>Salvar</Button>
  </CardContent></Card>);
}

function HoursTab() {
  const { data: t } = useCurrentTenant(); const tenantId = t?.id;
  const qc = useQueryClient();
  const { data: s } = useQuery({ queryKey: ["settings", tenantId], enabled: !!tenantId, queryFn: async () => (await supabase.from("tenant_settings").select("*").eq("tenant_id", tenantId!).maybeSingle()).data });
  const [f, setF] = useState<any>({ open_hour: 8, close_hour: 20, lunch_start: 12, lunch_end: 13, vip_days: [1,2,3,4], work_days: [1,2,3,4,5,6], vip_mode: "strict" });
  useEffect(()=>{if(s)setF({open_hour:s.open_hour??8,close_hour:s.close_hour??20,lunch_start:s.lunch_start??12,lunch_end:s.lunch_end??13,vip_days:s.vip_days??[1,2,3,4],work_days:s.work_days??[1,2,3,4,5,6],vip_mode:(s as any).vip_mode ?? "strict"});},[s]);
  const dayNames = ["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"];
  return (<Card><CardContent className="p-6 space-y-4">
    <div className="grid grid-cols-4 gap-4">
      <div><Label>Abre</Label><Input type="number" value={f.open_hour} onChange={e=>setF({...f,open_hour:Number(e.target.value)})}/></div>
      <div><Label>Fecha</Label><Input type="number" value={f.close_hour} onChange={e=>setF({...f,close_hour:Number(e.target.value)})}/></div>
      <div><Label>Almoço início</Label><Input type="number" value={f.lunch_start} onChange={e=>setF({...f,lunch_start:Number(e.target.value)})}/></div>
      <div><Label>Almoço fim</Label><Input type="number" value={f.lunch_end} onChange={e=>setF({...f,lunch_end:Number(e.target.value)})}/></div>
    </div>
    <div>
      <Label>Dias de funcionamento (todos os clientes)</Label>
      <div className="flex gap-2 mt-2">{[1,2,3,4,5,6,7].map(d=>(
        <button key={d} type="button" onClick={()=>setF({...f,work_days:f.work_days.includes(d)?f.work_days.filter((x:number)=>x!==d):[...f.work_days,d]})}
          className={`h-10 px-4 rounded-lg border ${f.work_days.includes(d)?"bg-primary text-primary-foreground border-primary":"border-border"}`}>{dayNames[d%7]}</button>
      ))}</div>
    </div>
    <div><Label>Dias VIP</Label>
      <div className="flex gap-2 mt-2">{[1,2,3,4,5,6,7].map(d=>(
        <button key={d} type="button" onClick={()=>setF({...f,vip_days:f.vip_days.includes(d)?f.vip_days.filter((x:number)=>x!==d):[...f.vip_days,d]})}
          className={`h-10 px-4 rounded-lg border ${f.vip_days.includes(d)?"bg-primary text-primary-foreground border-primary":"border-border"}`}>{dayNames[d%7]}</button>
      ))}</div>
    </div>
    <div>
      <Label>Modo dos dias VIP</Label>
      <div className="grid md:grid-cols-2 gap-3 mt-2">
        <button type="button" onClick={()=>setF({...f,vip_mode:"strict"})} className={`text-left p-4 rounded-xl border ${f.vip_mode==="strict"?"border-primary bg-primary/5":"border-border"}`}>
          <div className="font-semibold text-sm">Exclusivo para assinantes</div>
          <div className="text-xs text-muted-foreground mt-1">Nos dias VIP, apenas assinantes conseguem agendar online.</div>
        </button>
        <button type="button" onClick={()=>setF({...f,vip_mode:"open"})} className={`text-left p-4 rounded-xl border ${f.vip_mode==="open"?"border-primary bg-primary/5":"border-border"}`}>
          <div className="font-semibold text-sm">Aberto para todos</div>
          <div className="text-xs text-muted-foreground mt-1">Todos podem agendar em qualquer dia — a marcação VIP fica apenas como destaque.</div>
        </button>
      </div>
    </div>
    <Button onClick={async()=>{const{error}=await supabase.from("tenant_settings").upsert({...f,tenant_id:tenantId!});if(error)toast.error(error.message);else{toast.success("Salvo");qc.invalidateQueries({queryKey:["settings"]});}}}>Salvar</Button>
  </CardContent></Card>);
}


function WaTab() {
  const { data: t } = useCurrentTenant(); const tenantId = t?.id;
  const { data: s } = useQuery({ queryKey: ["settings-wa", tenantId], enabled: !!tenantId, queryFn: async () => (await supabase.from("tenant_settings").select("*").eq("tenant_id", tenantId!).maybeSingle()).data });
  const [f, setF] = useState({ whatsapp_token: "", whatsapp_instance: "", message_client_template: "", message_pro_template: "" });
  useEffect(()=>{if(s)setF({whatsapp_token:s.whatsapp_token??"",whatsapp_instance:s.whatsapp_instance??"",message_client_template:s.message_client_template??"",message_pro_template:s.message_pro_template??""});},[s]);
  return (<Card><CardContent className="p-6 space-y-4">
    <div className="grid md:grid-cols-2 gap-4">
      <div><Label>Instância WhatsApp</Label><Input value={f.whatsapp_instance} onChange={e=>setF({...f,whatsapp_instance:e.target.value})}/></div>
      <div><Label>Token</Label><Input type="password" value={f.whatsapp_token} onChange={e=>setF({...f,whatsapp_token:e.target.value})}/></div>
    </div>
    <div><Label>Mensagem para o cliente</Label><Textarea rows={3} value={f.message_client_template} onChange={e=>setF({...f,message_client_template:e.target.value})}/>
      <p className="text-xs text-muted-foreground mt-1">Variáveis: {"{cliente}, {barbearia}, {data}, {hora}, {profissional}"}</p></div>
    <div><Label>Mensagem para o barbeiro</Label><Textarea rows={3} value={f.message_pro_template} onChange={e=>setF({...f,message_pro_template:e.target.value})}/></div>
    <Button onClick={async()=>{const{error}=await supabase.from("tenant_settings").upsert({...f,tenant_id:tenantId!});if(error)toast.error(error.message);else toast.success("Salvo");}}>Salvar</Button>
  </CardContent></Card>);
}

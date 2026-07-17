import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCurrentTenant } from "@/hooks/use-tenant";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Building2, MapPin, Clock, MessageCircle, Loader2 } from "lucide-react";
import { ImmersiveBackgroundEditor } from "@/components/branding/immersive-background-editor";
import {
  DEFAULT_BOOKING_BRANDING,
  normalizeBookingBranding,
  type BookingBranding,
} from "@/lib/booking-branding";
import bookingHero from "@/assets/barber-hero.png.asset.json";
import { WhatsAppSettings } from "@/components/whatsapp/whatsapp-settings";

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
        <TabsContent value="whatsapp"><WhatsAppTab/></TabsContent>
      </Tabs>
    </div>
  );
}

function IdentityTab() {
  const { data: t } = useCurrentTenant(); const qc = useQueryClient();
  const [f, setF] = useState({ name: "", subtitle: "", primary_color: "#2563eb", slot_minutes: 30, pix_key: "", pix_holder: "" });
  const [logo, setLogo] = useState<File | null>(null);
  const brandingQueryKey = ["tenant-booking-branding", t?.id];
  const {
    data: brandingRow,
    isLoading: brandingLoading,
    error: brandingError,
  } = useQuery({
    queryKey: brandingQueryKey,
    enabled: !!t?.id,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("tenant_booking_branding")
        .select("*")
        .eq("tenant_id", t!.id)
        .maybeSingle();
      if (error) throw error;
      return normalizeBookingBranding({
        ...DEFAULT_BOOKING_BRANDING,
        ...(data ?? {}),
        tenant_id: t!.id,
      });
    },
  });
  const branding = normalizeBookingBranding({
    ...DEFAULT_BOOKING_BRANDING,
    ...(brandingRow ?? {}),
    tenant_id: t?.id ?? null,
  });
  const { data: sourcePreviewUrl = null } = useQuery({
    queryKey: [
      "tenant-booking-branding-source-preview",
      t?.id,
      branding.background_source_path,
    ],
    enabled: !!t?.id && !!branding.background_source_path,
    queryFn: async () => {
      const { data, error } = await supabase.storage
        .from("booking-branding-source")
        .createSignedUrl(branding.background_source_path!, 60 * 60);
      if (error) throw error;
      return data.signedUrl;
    },
  });
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
  return (
    <div className="space-y-6">
      <Card><CardContent className="p-6 space-y-4">
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
      </CardContent></Card>

      {t && brandingLoading && (
        <Card>
          <CardContent className="flex items-center gap-3 p-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Carregando o Background Imersivo...
          </CardContent>
        </Card>
      )}

      {t && brandingError && (
        <Card>
          <CardContent className="p-6">
            <p className="font-medium">Não foi possível carregar o Background Imersivo.</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Confirme se a migração de identidade visual já foi executada no banco de dados.
            </p>
          </CardContent>
        </Card>
      )}

      {t && !brandingLoading && !brandingError && (
        <ImmersiveBackgroundEditor
          tenant={{
            id: t.id,
            name: t.name,
            subtitle: t.subtitle ?? null,
            logo_url: t.logo_url ?? null,
            banner_url: t.banner_url ?? bookingHero.url,
          }}
          branding={branding}
          sourcePreviewUrl={sourcePreviewUrl}
          onSaved={async (saved: BookingBranding) => {
            qc.setQueryData(brandingQueryKey, saved);
            await qc.invalidateQueries({ queryKey: ["public-tenant", t.slug] });
          }}
        />
      )}
    </div>
  );
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

function isMissingClosedDatesColumn(error: any) {
  const message = String(error?.message ?? "");
  return (
    error?.code === "42703" ||
    error?.code === "PGRST204" ||
    (message.includes("closed_dates") && /does not exist|schema cache|could not find/i.test(message))
  );
}

function HoursTab() {
  const { data: t } = useCurrentTenant(); const tenantId = t?.id;
  const qc = useQueryClient();
  const { data: s, error: settingsError } = useQuery({
    queryKey: ["settings", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tenant_settings")
        .select("*")
        .eq("tenant_id", tenantId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const [f, setF] = useState<any>({ open_hour: 8, close_hour: 20, lunch_start: 12, lunch_end: 13, vip_days: [1,2,3,4], work_days: [1,2,3,4,5,6], vip_mode: "strict", closed_dates: [] });
  const [newClosedDate, setNewClosedDate] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(()=>{if(s)setF({open_hour:s.open_hour??8,close_hour:s.close_hour??20,lunch_start:s.lunch_start??12,lunch_end:s.lunch_end??13,vip_days:s.vip_days??[1,2,3,4],work_days:s.work_days??[1,2,3,4,5,6],vip_mode:(s as any).vip_mode ?? "strict",closed_dates:(s as any).closed_dates ?? []});},[s]);
  const dayNames = ["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"];

  async function saveHours() {
    if (!tenantId) return toast.error("Loja não carregada. Recarregue a página e tente novamente.");

    const { open_hour, close_hour, lunch_start, lunch_end } = f;
    const validHours =
      Number.isInteger(open_hour) && open_hour >= 0 && open_hour <= 23 &&
      Number.isInteger(close_hour) && close_hour >= 1 && close_hour <= 24 &&
      Number.isInteger(lunch_start) && lunch_start >= 0 && lunch_start <= 23 &&
      Number.isInteger(lunch_end) && lunch_end >= 1 && lunch_end <= 24;
    if (!validHours) return toast.error("Informe horários inteiros entre 0 e 24.");
    if (open_hour >= close_hour) return toast.error("O horário de abertura deve ser anterior ao fechamento.");
    if (lunch_start >= lunch_end || lunch_start < open_hour || lunch_end > close_hour) {
      return toast.error("O intervalo de almoço precisa estar dentro do horário de funcionamento.");
    }
    if (!Array.isArray(f.work_days) || f.work_days.length === 0) {
      return toast.error("Selecione pelo menos um dia de funcionamento.");
    }

    setIsSaving(true);
    try {
      let savedWithoutClosedDates = false;
      let result = await supabase
        .from("tenant_settings")
        .upsert({ ...f, tenant_id: tenantId })
        .select("*")
        .maybeSingle();

      if (result.error && isMissingClosedDatesColumn(result.error)) {
        const { closed_dates: _closedDates, ...legacySettings } = f;
        result = await supabase
          .from("tenant_settings")
          .upsert({ ...legacySettings, tenant_id: tenantId })
          .select("*")
          .maybeSingle();
        savedWithoutClosedDates = true;
      }

      if (result.error) throw result.error;
      if (!result.data) throw new Error("O banco não confirmou a alteração do funcionamento.");

      qc.setQueryData(["settings", tenantId], result.data);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["settings", tenantId] }),
        qc.invalidateQueries({ queryKey: ["public-tenant", t?.slug] }),
      ]);
      window.localStorage.setItem("linkup:public-catalog-version", String(Date.now()));

      if (savedWithoutClosedDates) {
        toast.warning("Horários salvos. O bloqueio de datas será liberado após atualizar o banco.");
      } else {
        toast.success("Funcionamento salvo.");
      }
    } catch (error: any) {
      toast.error(error?.message || "Não foi possível salvar o funcionamento.");
    } finally {
      setIsSaving(false);
    }
  }

  return (<Card><CardContent className="p-6 space-y-4">
    {settingsError && (
      <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
        Não foi possível carregar o funcionamento: {(settingsError as any).message}
      </div>
    )}
    <div className="grid grid-cols-4 gap-4">
      <div><Label>Abre</Label><Input type="number" value={f.open_hour} onChange={e=>setF({...f,open_hour:Number(e.target.value)})}/></div>
      <div><Label>Fecha</Label><Input type="number" value={f.close_hour} onChange={e=>setF({...f,close_hour:Number(e.target.value)})}/></div>
      <div><Label>Almoço início</Label><Input type="number" value={f.lunch_start} onChange={e=>setF({...f,lunch_start:Number(e.target.value)})}/></div>
      <div><Label>Almoço fim</Label><Input type="number" value={f.lunch_end} onChange={e=>setF({...f,lunch_end:Number(e.target.value)})}/></div>
    </div>
    <div>
      <Label>Dias de funcionamento (todos os clientes)</Label>
      <div className="flex flex-wrap gap-2 mt-2">{[1,2,3,4,5,6,7].map(d=>(
        <button key={d} type="button" onClick={()=>setF({...f,work_days:f.work_days.includes(d)?f.work_days.filter((x:number)=>x!==d):[...f.work_days,d]})}
          className={`h-10 px-4 rounded-lg border ${f.work_days.includes(d)?"bg-primary text-primary-foreground border-primary":"border-border"}`}>{dayNames[d%7]}</button>
      ))}</div>
    </div>
    <div><Label>Dias VIP</Label>
      <div className="flex flex-wrap gap-2 mt-2">{[1,2,3,4,5,6,7].map(d=>(
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
    
    <div className="border-t pt-4">
      <Label className="font-semibold block mb-2">Bloquear Datas Específicas (Folgas / Feriados)</Label>
      <div className="flex gap-2">
        <Input 
          type="date" 
          value={newClosedDate} 
          onChange={(e)=>setNewClosedDate(e.target.value)} 
          className="max-w-[200px]"
        />
        <Button 
          type="button" 
          variant="outline"
          onClick={() => {
            if (!newClosedDate) return;
            if (f.closed_dates.includes(newClosedDate)) return toast.error("Data já adicionada.");
            setF({ ...f, closed_dates: [...f.closed_dates, newClosedDate].sort() });
            setNewClosedDate("");
          }}
        >
          Adicionar Data Fechada
        </Button>
      </div>
      <div className="flex flex-wrap gap-2 mt-3">
        {f.closed_dates.map((dateStr: string) => {
          const [y, m, d] = dateStr.split("-");
          return (
            <div key={dateStr} className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg border bg-muted text-foreground">
              <span>{`${d}/${m}/${y}`}</span>
              <button 
                type="button" 
                onClick={() => setF({ ...f, closed_dates: f.closed_dates.filter((x: string) => x !== dateStr) })}
                className="text-destructive font-bold hover:scale-110 px-1 ml-1"
              >
                ×
              </button>
            </div>
          );
        })}
        {f.closed_dates.length === 0 && <span className="text-xs text-muted-foreground italic">Nenhuma data bloqueada cadastrada.</span>}
      </div>
    </div>

    <Button onClick={saveHours} disabled={isSaving}>
      {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
      {isSaving ? "Salvando..." : "Salvar funcionamento"}
    </Button>
  </CardContent></Card>);
}


function WhatsAppTab() {
  const { data: tenant } = useCurrentTenant();
  return <WhatsAppSettings tenantId={tenant?.id} />;
}

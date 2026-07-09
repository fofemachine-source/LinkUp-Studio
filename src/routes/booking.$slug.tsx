import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { getPublicTenant, validateVip, getBookedSlots, createBooking } from "@/lib/booking.functions";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { brl, cpfMask, phoneMask } from "@/lib/format";
import { Calendar as CalendarUI } from "@/components/ui/calendar";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Check, Scissors, Crown, ArrowLeft, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import bookingHero from "@/assets/barber-hero.png.asset.json";

export const Route = createFileRoute("/booking/$slug")({
  head: ({ params }) => ({ meta: [{ title: `Agende seu horário — ${params.slug}` }, { name: "description", content: "Agendamento online rápido e prático." }] }),
  component: BookingPage,
});

type Step = "vip" | "service" | "pro" | "date" | "form" | "done";

function BookingPage() {
  const { slug } = Route.useParams();
  const getTenant = useServerFn(getPublicTenant);
  const validate = useServerFn(validateVip);
  const getSlots = useServerFn(getBookedSlots);
  const create = useServerFn(createBooking);

  const { data, isLoading } = useQuery({ queryKey: ["public-tenant", slug], queryFn: () => getTenant({ data: { slug } }) });
  const [step, setStep] = useState<Step>("vip");
  const [isVip, setIsVip] = useState(false);
  const [cpf, setCpf] = useState("");
  const [vipInfo, setVipInfo] = useState<any>(null);
  const [serviceId, setServiceId] = useState<string>("");
  const [proId, setProId] = useState<string>("");
  const [date, setDate] = useState<Date | undefined>(undefined);
  const [time, setTime] = useState<string>("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");

  const slotsQuery = useQuery({
    queryKey: ["booked", proId, date ? format(date, "yyyy-MM-dd") : ""],
    enabled: !!proId && !!date,
    queryFn: () => getSlots({ data: { professionalId: proId, date: format(date!, "yyyy-MM-dd") } }),
  });

  const bookMut = useMutation({
    mutationFn: async () => {
      const [h, m] = time.split(":").map(Number);
      const start = new Date(date!); start.setHours(h, m, 0, 0);
      const tenantId = (data as any)?.tenant?.id;
      return create({ data: { tenantId, professionalId: proId, serviceId, clientName: name, clientWhatsapp: phone, startAt: start.toISOString(), isVip, vipCpf: cpf || undefined } });
    },
    onSuccess: () => { toast.success("Agendamento confirmado!"); setStep("done"); },
    onError: (e: any) => toast.error(e.message ?? "Erro"),
  });

  if (isLoading) return <div className="min-h-screen grid place-items-center"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  if (!data) return <div className="min-h-screen grid place-items-center p-6 text-center"><div><h1 className="text-2xl font-semibold">Barbearia não encontrada</h1><p className="text-muted-foreground mt-2">Verifique o link de agendamento.</p></div></div>;

  const { tenant, professionals, services, settings } = data as any;
  const slotMin = tenant.slot_minutes ?? 30;

  const chosenService = services.find((s: any) => s.id === serviceId);
  const availableProsForService = chosenService?.vip_only && !isVip ? [] : professionals;

  const timeSlots = date && slotsQuery.data ? buildSlots(date, settings, slotMin, chosenService?.duration_min ?? slotMin, slotsQuery.data) : [];


  return (
    <div
      className="min-h-screen bg-black text-foreground relative"
      style={{
        backgroundImage: `linear-gradient(to right, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.75) 45%, rgba(0,0,0,0.25) 100%), url(${bookingHero.url})`,
        backgroundSize: "cover",
        backgroundPosition: "center right",
        backgroundRepeat: "no-repeat",
      }}
    >
      <div className="max-w-xl mx-auto p-4 md:p-8 min-h-screen flex flex-col justify-center">
        <div className="flex items-center gap-4 mb-6">
          <div className="h-14 w-14 rounded-2xl bg-primary text-primary-foreground grid place-items-center shadow-md shrink-0">
            {tenant.logo_url ? <img src={tenant.logo_url} className="h-full w-full object-cover rounded-2xl" alt="" /> : <Scissors className="h-6 w-6" />}
          </div>
          <div>
            <h1 className="text-2xl md:text-3xl font-semibold text-white">{tenant.name}</h1>
            <p className="text-sm text-white/60">{tenant.subtitle}</p>
          </div>
        </div>

        {step === "vip" && (
          <Card className="bg-neutral-900/80 backdrop-blur-md border-white/10 text-white">
            <CardContent className="p-6 md:p-8 space-y-6">
              <div className="flex items-center gap-3 p-4 rounded-xl bg-white/5 border border-white/10">
                <Crown className="h-6 w-6 text-primary" />
                <div className="flex-1"><div className="font-semibold">Sou assinante VIP</div><div className="text-xs text-white/60">Assinantes têm acesso exclusivo de segunda a quinta.</div></div>
                <Switch checked={isVip} onCheckedChange={(v) => { setIsVip(v); setVipInfo(null); }} />
              </div>
              {isVip && (
                <div className="space-y-3">
                  <Label>Informe seu CPF</Label>
                  <Input value={cpfMask(cpf)} onChange={(e) => setCpf(e.target.value)} placeholder="000.000.000-00" />
                  <Button className="w-full" disabled={!cpf || cpf.replace(/\D/g,"").length !== 11} onClick={async () => {
                    const v = await validate({ data: { tenantId: tenant.id, cpf } });
                    if (!v) { toast.error("CPF não encontrado. Verifique ou desmarque VIP."); return; }
                    setVipInfo(v); setName((v as any).full_name); toast.success(`Bem-vindo, ${(v as any).full_name}!`);
                  }}>VALIDAR CPF</Button>
                  {vipInfo && <div className="p-3 rounded-lg bg-success/10 text-sm flex items-center gap-2"><Check className="h-4 w-4 text-success" /> Assinatura ativa — {vipInfo.plan}</div>}
                </div>
              )}
              <Button className="w-full" size="lg" disabled={isVip && !vipInfo} onClick={() => setStep("service")}>CONTINUAR</Button>
            </CardContent>
          </Card>
        )}

        {step === "service" && (
          <Card className="bg-neutral-900/80 backdrop-blur-md border-white/10 text-white"><CardContent className="p-6 space-y-3">
            <StepHeader title="Escolha o serviço" onBack={() => setStep("vip")} />
            <div className="grid sm:grid-cols-2 gap-3">
              {services.filter((s: any) => !s.vip_only || isVip).map((s: any) => (
                <button key={s.id} onClick={() => { setServiceId(s.id); setStep("pro"); }} className={`text-left p-4 rounded-xl border-2 transition ${serviceId === s.id ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"}`}>
                  <div className="flex items-center justify-between"><div className="font-medium">{s.name}</div>{s.vip_only && <Crown className="h-4 w-4 text-primary" />}</div>
                  <div className="text-xs text-muted-foreground mt-1">{s.duration_min} min</div>
                  <div className="font-semibold text-primary mt-2">{brl(s.price)}</div>
                </button>
              ))}
            </div>
          </CardContent></Card>
        )}

        {step === "pro" && (
          <Card className="bg-neutral-900/80 backdrop-blur-md border-white/10 text-white"><CardContent className="p-6 space-y-4">
            <StepHeader title="Escolha o profissional" onBack={() => setStep("service")} />
            <div className="grid sm:grid-cols-2 gap-3">
              {availableProsForService.map((p: any) => (
                <button key={p.id} onClick={() => { setProId(p.id); setStep("date"); }} className={`flex items-center gap-3 p-4 rounded-xl border-2 transition ${proId === p.id ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"}`}>
                  <Avatar className="h-14 w-14"><AvatarImage src={p.photo_url ?? undefined} /><AvatarFallback className="bg-primary/10 text-primary font-semibold">{p.full_name.split(" ").map((w:string)=>w[0]).slice(0,2).join("")}</AvatarFallback></Avatar>
                  <div className="text-left"><div className="font-medium">{p.full_name}</div><div className="text-xs text-muted-foreground">{p.role_label}</div></div>
                </button>
              ))}
            </div>
          </CardContent></Card>
        )}

        {step === "date" && (
          <Card className="bg-neutral-900/80 backdrop-blur-md border-white/10 text-white"><CardContent className="p-6 space-y-4">
            <StepHeader title="Escolha a data e o horário" onBack={() => setStep("pro")} />
            <div className="grid md:grid-cols-2 gap-6">
              <div className="border rounded-xl p-3 flex justify-center">
                <CalendarUI mode="single" selected={date} onSelect={setDate} disabled={(d) => d < new Date(new Date().setHours(0,0,0,0))} locale={ptBR} />
              </div>
              <div>
                <div className="text-sm font-medium mb-3">{date ? format(date, "EEEE, dd 'de' MMMM", { locale: ptBR }) : "Selecione uma data"}</div>
                {slotsQuery.isFetching && <Loader2 className="h-5 w-5 animate-spin" />}
                <div className="grid grid-cols-3 gap-2">
                  {timeSlots.map((t) => (
                    <button key={t.time} disabled={!t.free} onClick={() => setTime(t.time)} className={`py-2 rounded-lg text-sm border ${time === t.time ? "bg-primary text-primary-foreground border-primary" : t.free ? "border-border hover:border-primary" : "bg-muted text-muted-foreground opacity-40 cursor-not-allowed"}`}>{t.time}</button>
                  ))}
                </div>
                {date && timeSlots.length === 0 && <div className="text-sm text-muted-foreground">Sem horários disponíveis neste dia.</div>}
                <Button className="w-full mt-6" size="lg" disabled={!time} onClick={() => setStep("form")}>CONTINUAR</Button>
              </div>
            </div>
          </CardContent></Card>
        )}

        {step === "form" && (
          <Card className="bg-neutral-900/80 backdrop-blur-md border-white/10 text-white"><CardContent className="p-6 space-y-4">
            <StepHeader title="Seus dados" onBack={() => setStep("date")} />
            <div className="space-y-3">
              <div><Label>Nome</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
              <div><Label>WhatsApp</Label><Input value={phoneMask(phone)} onChange={(e) => setPhone(e.target.value)} placeholder="(11) 99999-9999" /></div>
            </div>
            <div className="p-4 rounded-xl bg-muted/50 text-sm space-y-1">
              <div><span className="text-muted-foreground">Serviço:</span> <strong>{chosenService?.name}</strong> — {brl(chosenService?.price)}</div>
              <div><span className="text-muted-foreground">Profissional:</span> {professionals.find((p:any)=>p.id===proId)?.full_name}</div>
              <div><span className="text-muted-foreground">Data:</span> {date && format(date, "dd/MM/yyyy")} às {time}</div>
            </div>
            <Button size="lg" className="w-full" disabled={!name || phone.replace(/\D/g,"").length < 10 || bookMut.isPending} onClick={() => bookMut.mutate()}>
              {bookMut.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null} CONFIRMAR AGENDAMENTO
            </Button>
          </CardContent></Card>
        )}

        {step === "done" && (
          <Card className="bg-neutral-900/80 backdrop-blur-md border-white/10 text-white"><CardContent className="p-8 text-center space-y-4">
            <div className="h-16 w-16 rounded-full bg-success/10 text-success mx-auto grid place-items-center"><Check className="h-8 w-8" /></div>
            <h2 className="text-2xl font-semibold">Agendamento confirmado!</h2>
            <p className="text-muted-foreground">Você receberá a confirmação no WhatsApp.</p>
            <Button variant="outline" onClick={() => window.location.reload()}>NOVO AGENDAMENTO</Button>
          </CardContent></Card>
        )}
      </div>
    </div>
  );
}

function StepHeader({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <div className="flex items-center gap-2 mb-2">
      <button onClick={onBack} className="h-9 w-9 rounded-lg hover:bg-muted grid place-items-center"><ArrowLeft className="h-4 w-4" /></button>
      <h2 className="font-semibold text-lg">{title}</h2>
    </div>
  );
}

function buildSlots(date: Date, settings: any, slotMin: number, duration: number, booked: { start_at: string; end_at: string }[]) {
  const open = settings?.open_hour ?? 8;
  const close = settings?.close_hour ?? 20;
  const lunchS = settings?.lunch_start ?? 12;
  const lunchE = settings?.lunch_end ?? 13;
  const slots: { time: string; free: boolean }[] = [];
  for (let h = open; h < close; h++) {
    for (let m = 0; m < 60; m += slotMin) {
      if (h >= lunchS && h < lunchE) continue;
      const t = new Date(date); t.setHours(h, m, 0, 0);
      if (t < new Date()) continue;
      const end = new Date(t.getTime() + duration * 60000);
      const conflict = booked.some((b) => new Date(b.start_at) < end && new Date(b.end_at) > t);
      slots.push({ time: `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`, free: !conflict });
    }
  }
  return slots;
}

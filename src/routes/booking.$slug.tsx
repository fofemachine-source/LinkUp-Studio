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
import { Check, Scissors, Crown, ArrowLeft, ArrowRight, Calendar as CalendarIcon, Loader2, MapPin, MessageCircle, Share2, Download, Plus } from "lucide-react";
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
    <div className="min-h-screen bg-black text-foreground relative">
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          backgroundImage: `url(${bookingHero.url})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          backgroundRepeat: "no-repeat",
          backgroundColor: "#000",
        }}
      />
      <div className="fixed inset-0 bg-black/50 pointer-events-none" />
      <div className="relative z-10 max-w-xl mx-auto p-4 md:p-8 min-h-screen flex flex-col justify-center">
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
          <Card className="bg-[#0a0a0a] border-white/5 text-white shadow-2xl">
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
                    setVipInfo(v); 
                    if ((v as any).status === "active") {
                      setName((v as any).full_name); 
                      toast.success(`Bem-vindo, ${(v as any).full_name}!`);
                    }
                  }}>VALIDAR CPF</Button>
                  {vipInfo && vipInfo.status === "active" && <div className="p-3 rounded-lg bg-success/10 text-sm flex items-center gap-2"><Check className="h-4 w-4 text-success" /> Assinatura ativa — {vipInfo.plan}</div>}
                  {vipInfo && vipInfo.status !== "active" && (
                    <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-sm flex flex-col gap-2">
                      <div className="flex items-center gap-2 text-red-500 font-medium">Assinatura inativa ou pendente</div>
                      <div className="text-white/70">Sua assinatura VIP está desativada. Para voltar a agendar como assinante, regularize seu plano.</div>
                      <a href={`https://wa.me/55${tenant.whatsapp?.replace(/\D/g, '')}?text=${encodeURIComponent('Olá, gostaria de regularizar minha assinatura VIP e fazer o pagamento via PIX.')}`} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-2 mt-2 bg-[#25D366] hover:bg-[#128C7E] text-white py-2 px-4 rounded-lg font-medium transition">
                        <MessageCircle className="h-4 w-4" /> Regularizar via WhatsApp
                      </a>
                    </div>
                  )}
                </div>
              )}
              <Button className="w-full py-6 rounded-xl bg-gradient-to-r from-blue-950 to-blue-800 hover:from-blue-900 hover:to-blue-700 text-white font-medium border border-blue-500/30 shadow-[0_0_15px_rgba(37,99,235,0.15)] flex justify-between px-6" size="lg" disabled={isVip && (!vipInfo || vipInfo.status !== "active")} onClick={() => setStep("service")}>
                <span>CONTINUAR</span>
                <ArrowRight className="h-5 w-5" />
              </Button>
            </CardContent>
          </Card>
        )}

        {step === "service" && (
          <Card className="bg-[#0a0a0a] border-white/5 text-white shadow-2xl"><CardContent className="p-6 space-y-6">
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
          <Card className="bg-[#0a0a0a] border-white/5 text-white shadow-2xl"><CardContent className="p-6 space-y-6">
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
          <Card className="bg-[#0a0a0a] border-white/5 text-white shadow-2xl">
            <CardContent className="p-0">
              <div className="p-6 pb-2">
                <div className="flex items-center gap-3 mb-1">
                  <button onClick={() => setStep("pro")} className="text-amber-500 hover:text-amber-400">
                    <ArrowLeft className="h-5 w-5" />
                  </button>
                  <h2 className="font-semibold text-xl">Escolha a data e o horário</h2>
                </div>
                <p className="text-sm text-white/50 ml-8 mb-6">Selecione quando deseja agendar o atendimento.</p>
              </div>

              <div className="grid md:grid-cols-[1fr_1.2fr] gap-8 px-6 pb-8">
                {/* Lado do Calendário */}
                <div className="dark bg-neutral-900 rounded-2xl border border-white/5 p-4 flex flex-col">
                  <div className="flex-1 w-full flex justify-center">
                    <CalendarUI 
                      mode="single" 
                      selected={date} 
                      onSelect={setDate} 
                      disabled={(d) => {
                        if (d < new Date(new Date().setHours(0,0,0,0))) return true;
                        if (isVip) {
                          const day = d.getDay();
                          if (day === 0 || day === 5 || day === 6) return true;
                        }
                        return false;
                      }}
                      locale={ptBR}
                      className="[&_.rdp-day_button[data-selected=true]]:border-amber-500 [&_.rdp-day_button[data-selected=true]]:border [&_.rdp-day_button[data-selected=true]]:text-amber-500 [&_.rdp-day_button[data-selected=true]]:bg-transparent [&_.rdp-button_previous]:text-amber-500 [&_.rdp-button_next]:text-amber-500 [&_.rdp-caption_label]:text-lg [&_.rdp-caption_label]:font-medium [&_.rdp-head_cell]:text-white/50 [&_.rdp-head_cell]:font-normal"
                    />
                  </div>
                  <div className="mt-4 pt-4 border-t border-white/5 flex items-center gap-3 text-sm text-white/50">
                     <CalendarIcon className="h-5 w-5 text-amber-500" />
                     <span>Hoje, {format(new Date(), "d 'de' MMMM 'de' yyyy", { locale: ptBR })}</span>
                  </div>
                </div>

                {/* Lado dos Horários */}
                <div className="flex flex-col space-y-6">
                  <div className="flex items-start gap-4">
                     <div className="h-12 w-12 rounded-full border border-amber-500/30 flex items-center justify-center shrink-0">
                       <CalendarIcon className="h-5 w-5 text-amber-500" />
                     </div>
                     <div>
                       <h3 className="font-medium text-lg">Selecione uma data</h3>
                       <p className="text-sm text-white/50">Escolha o melhor dia para seu atendimento.</p>
                     </div>
                  </div>
                  
                  <div className="flex-1">
                    {slotsQuery.isFetching && <Loader2 className="h-5 w-5 animate-spin" />}
                    {date ? (
                      <>
                        <div className="grid grid-cols-4 gap-2">
                          {timeSlots.map((t) => (
                            <button key={t.time} disabled={!t.free} onClick={() => setTime(t.time)} className={`py-2 rounded-lg text-sm border transition-colors ${time === t.time ? "bg-amber-500 text-black font-semibold border-amber-500" : t.free ? "border-white/10 hover:border-amber-500/50" : "bg-neutral-900 text-white/30 opacity-40 cursor-not-allowed"}`}>{t.time}</button>
                          ))}
                        </div>
                        {timeSlots.length === 0 && <div className="text-sm text-white/50">Sem horários disponíveis neste dia.</div>}
                      </>
                    ) : (
                      <div className="h-full flex items-center justify-center text-white/30 text-sm">Nenhuma data selecionada.</div>
                    )}
                  </div>

                  <Button className="w-full mt-auto py-6 rounded-xl bg-gradient-to-r from-blue-950 to-blue-800 hover:from-blue-900 hover:to-blue-700 text-white font-medium border border-blue-500/30 shadow-[0_0_15px_rgba(37,99,235,0.15)] flex justify-between px-6" size="lg" disabled={!time} onClick={() => setStep("form")}>
                    <span>CONTINUAR</span>
                    <ArrowRight className="h-5 w-5" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {step === "form" && (
          <Card className="bg-[#0a0a0a] border-white/5 text-white shadow-2xl"><CardContent className="p-6 space-y-6">
            <StepHeader title="Seus dados" onBack={() => setStep("date")} />
            <div className="space-y-4">
              <div className="space-y-2"><Label className="text-white/70">Nome</Label><Input className="bg-neutral-900/50 border-white/10 text-white focus-visible:ring-amber-500" value={name} onChange={(e) => setName(e.target.value)} /></div>
              <div className="space-y-2"><Label className="text-white/70">WhatsApp</Label><Input className="bg-neutral-900/50 border-white/10 text-white focus-visible:ring-amber-500" value={phoneMask(phone)} onChange={(e) => setPhone(e.target.value)} placeholder="(11) 99999-9999" /></div>
            </div>
            <div className="p-5 rounded-xl bg-neutral-900/80 border border-white/5 text-sm space-y-3">
              <div className="flex items-center text-white/70"><span className="w-24">Serviço:</span> <strong className="text-white font-medium">{chosenService?.name}</strong> <span className="ml-2 text-amber-500 font-medium">— {brl(chosenService?.price)}</span></div>
              <div className="flex items-center text-white/70"><span className="w-24">Profissional:</span> <span className="text-white">{professionals.find((p:any)=>p.id===proId)?.full_name}</span></div>
              <div className="flex items-center text-white/70"><span className="w-24">Data:</span> <span className="text-white">{date && format(date, "dd/MM/yyyy")} às {time}</span></div>
            </div>
            <Button size="lg" className="w-full mt-auto py-6 rounded-xl bg-gradient-to-r from-blue-950 to-blue-800 hover:from-blue-900 hover:to-blue-700 text-white font-medium border border-blue-500/30 shadow-[0_0_15px_rgba(37,99,235,0.15)] flex justify-between px-6" disabled={!name || phone.replace(/\D/g,"").length < 10 || bookMut.isPending} onClick={() => bookMut.mutate()}>
              <span className="flex items-center">{bookMut.isPending ? <Loader2 className="h-5 w-5 animate-spin mr-2" /> : null} CONFIRMAR AGENDAMENTO</span>
              {!bookMut.isPending && <Check className="h-5 w-5 text-blue-300" />}
            </Button>
          </CardContent></Card>
        )}

        {step === "done" && (
          <Card className="bg-white border-none text-black shadow-2xl overflow-hidden rounded-3xl mx-auto w-full max-w-lg">
            <div className="bg-white p-6 md:p-8">
              <div className="text-center mb-6 mt-4">
                <div className="h-16 w-16 rounded-full border-2 border-amber-500 mx-auto flex items-center justify-center mb-4">
                  <Check className="h-8 w-8 text-amber-500" />
                </div>
                <h3 className="text-2xl font-bold uppercase tracking-wide text-black">RESERVA CONFIRMADA</h3>
                <p className="text-sm text-amber-600 font-semibold uppercase tracking-wider mt-1">O SEU HORÁRIO FOI GARANTIDO!</p>
              </div>

              <div className="border border-amber-500/20 rounded-2xl p-5 bg-[#faf8f5] space-y-5">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">CÓDIGO DA RESERVA</div>
                    <div className="text-sm font-bold text-black">{bookMut.data?.id?.split("-")[0].toUpperCase() || "NSFRAYOLVI"}</div>
                  </div>
                  <div>
                    <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">DATA E HORA</div>
                    <div className="text-sm font-bold text-black">{date && format(date, "dd/MM/yyyy")} às {time}</div>
                  </div>
                </div>

                <div className="border-t border-amber-500/10 pt-4">
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 bg-amber-100 rounded-full flex items-center justify-center text-amber-600 shrink-0"><Scissors className="h-4 w-4" /></div>
                    <div>
                      <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">BARBEARIA / ESTABELECIMENTO</div>
                      <div className="text-sm font-bold text-black">{tenant.name}</div>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-y-4 gap-x-4 border-t border-amber-500/10 pt-4">
                  <div>
                    <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">CLIENTE</div>
                    <div className="text-sm font-bold text-black">{name}</div>
                  </div>
                  <div>
                    <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">TELEFONE</div>
                    <div className="text-sm font-bold text-black">{phoneMask(phone)}</div>
                  </div>
                  <div>
                    <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">BARBEIRO</div>
                    <div className="text-sm font-bold text-black">{professionals.find((p:any)=>p.id===proId)?.full_name}</div>
                  </div>
                  <div>
                    <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">SERVIÇO</div>
                    <div className="text-sm font-bold text-black">{chosenService?.name}</div>
                  </div>
                  <div>
                    <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">VALOR</div>
                    <div className="text-sm font-bold text-amber-600">{brl(chosenService?.price)}</div>
                  </div>
                  <div>
                    <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">FORMA DE PAGAMENTO</div>
                    <div className="text-xs font-bold leading-tight text-black">No Local (Pix, Cartão ou Dinheiro)</div>
                  </div>
                </div>
              </div>

              <div className="border border-amber-500/20 rounded-2xl p-5 mt-4 bg-[#faf8f5] cursor-pointer hover:bg-amber-50 transition-colors" onClick={() => window.open(`https://maps.google.com/?q=${tenant.name}`, "_blank")}>
                 <div className="flex items-start gap-3">
                    <div className="h-8 w-8 bg-amber-100 rounded-full flex items-center justify-center text-amber-600 shrink-0"><MapPin className="h-4 w-4" /></div>
                    <div>
                      <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">LOCALIZAÇÃO DO ESTABELECIMENTO</div>
                      <div className="text-sm font-bold text-black mb-1">{tenant.name}</div>
                      <div className="text-xs text-gray-500">Toque para abrir no mapa</div>
                    </div>
                 </div>
              </div>

              <div className="mt-6 grid grid-cols-2 gap-3">
                <Button variant="outline" className="border-amber-500/20 hover:bg-amber-50 text-xs font-bold" onClick={() => window.open(`https://maps.google.com/?q=${tenant.name}`, "_blank")}><MapPin className="h-4 w-4 mr-2" /> GOOGLE MAPS</Button>
                <Button variant="outline" className="bg-black hover:bg-neutral-800 text-amber-500 border-none text-xs font-bold" onClick={() => window.open(`https://wa.me/?text=Olá! Fiz um agendamento na ${tenant.name} para o dia ${format(date!, "dd/MM/yyyy")} às ${time}.`, "_blank")}><MessageCircle className="h-4 w-4 mr-2" /> WHATSAPP</Button>
                <Button variant="outline" className="border-amber-500/20 hover:bg-amber-50 text-xs font-bold" onClick={() => { navigator.clipboard.writeText(`Reserva: ${tenant.name} - ${format(date!, "dd/MM/yyyy")} às ${time}`); toast.success("Reserva copiada!"); }}><Share2 className="h-4 w-4 mr-2" /> COMPARTILHAR RESERVA</Button>
                <Button variant="outline" className="border-amber-500/20 hover:bg-amber-50 text-xs font-bold" onClick={() => window.print()}><Download className="h-4 w-4 mr-2" /> BAIXAR PDF</Button>
              </div>

              <div className="mt-4">
                <Button className="w-full bg-black hover:bg-neutral-900 text-amber-500 text-xs font-bold py-6 rounded-xl shadow-xl" onClick={() => window.location.reload()}><Plus className="h-4 w-4 mr-2 text-amber-500" /> NOVA RESERVA</Button>
              </div>

            </div>
          </Card>
        )}
      </div>
    </div>
  );
}

function StepHeader({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <button onClick={onBack} className="text-amber-500 hover:text-amber-400 transition">
        <ArrowLeft className="h-5 w-5" />
      </button>
      <h2 className="font-semibold text-xl">{title}</h2>
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

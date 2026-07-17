import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import {
  cancelBooking,
  createBooking,
  getBookedSlots,
  getPublicTenant,
  prepareSubscriptionProofUpload,
  submitSubscriptionProof,
  validateVip,
} from "@/lib/booking.functions";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { brl, cpfMask, phoneMask } from "@/lib/format";
import { Calendar as CalendarUI } from "@/components/ui/calendar";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Check,
  Scissors,
  Crown,
  ArrowLeft,
  ArrowRight,
  Calendar as CalendarIcon,
  Loader2,
  MapPin,
  MessageCircle,
  Share2,
  Download,
  Plus,
  Copy,
  XCircle,
  FileCheck2,
  UploadCloud,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import bookingHero from "@/assets/barber-hero.png.asset.json";
import { supabase } from "@/integrations/supabase/client";
import { ImmersiveBackground } from "@/components/branding/immersive-background";
import {
  normalizeBookingBranding,
  type BookingBranding,
} from "@/lib/booking-branding";

export const Route = createFileRoute("/booking/$slug")({
  validateSearch: (search: Record<string, unknown>) => ({
    cancel: typeof search.cancel === "string" ? search.cancel : undefined,
  }),
  head: ({ params }) => ({ meta: [{ title: `Agende seu horário — ${params.slug}` }, { name: "description", content: "Agendamento online rápido e prático." }] }),
  component: BookingPage,
});

type Step = "vip" | "service" | "pro" | "date" | "form" | "done";

import { buildPixPayload } from "@/lib/pix";
import { QrCode } from "@/lib/qr";

function BookingPage() {
  const { slug } = Route.useParams();
  const { cancel: cancellationTokenFromUrl } = Route.useSearch();
  const getTenant = useServerFn(getPublicTenant);
  const validate = useServerFn(validateVip);
  const getSlots = useServerFn(getBookedSlots);
  const create = useServerFn(createBooking);
  const cancel = useServerFn(cancelBooking);
  const prepareProofUpload = useServerFn(prepareSubscriptionProofUpload);
  const submitProof = useServerFn(submitSubscriptionProof);

  const {
    data,
    isLoading,
    error: publicTenantError,
    refetch: refetchPublicTenant,
  } = useQuery({
    queryKey: ["public-tenant", slug],
    queryFn: () => getTenant({ data: { slug, freshAt: Date.now() } }),
    refetchOnMount: "always",
    refetchOnWindowFocus: "always",
    refetchOnReconnect: "always",
  });
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
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [bookingCancelled, setBookingCancelled] = useState(false);
  const timeSectionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const refreshCatalog = (event: StorageEvent) => {
      if (event.key === "linkup:public-catalog-version") {
        void refetchPublicTenant();
      }
    };
    window.addEventListener("storage", refreshCatalog);
    return () => window.removeEventListener("storage", refreshCatalog);
  }, [refetchPublicTenant]);

  useEffect(() => {
    if (step === "pro") {
      void refetchPublicTenant();
    }
  }, [step, refetchPublicTenant]);

  const slotsQuery = useQuery({
    queryKey: ["booked", (data as any)?.tenant?.id, proId, date ? format(date, "yyyy-MM-dd") : ""],
    enabled: !!(data as any)?.tenant?.id && !!proId && !!date,
    queryFn: () =>
      getSlots({
        data: {
          tenantId: (data as any).tenant.id,
          professionalId: proId,
          date: format(date!, "yyyy-MM-dd"),
        },
      }),
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

  const activeCancellationToken = cancellationTokenFromUrl ?? bookMut.data?.cancellationToken;
  const cancelMut = useMutation({
    mutationFn: () => {
      if (!activeCancellationToken) throw new Error("Link de cancelamento indisponivel.");
      return cancel({ data: { token: activeCancellationToken } });
    },
    onSuccess: () => {
      setBookingCancelled(true);
      toast.success("Agendamento cancelado.");
      slotsQuery.refetch();
    },
    onError: (error: any) => toast.error(error.message ?? "Nao foi possivel cancelar."),
  });

  const validateVipMut = useMutation({
    mutationFn: async () => {
      const tenantId = (data as any)?.tenant?.id;
      if (!tenantId) throw new Error("Salão indisponível no momento.");
      return validate({ data: { tenantId, cpf, whatsapp: phone } });
    },
    onSuccess: (result) => {
      if (!result) {
        setVipInfo(null);
        toast.error("CPF e WhatsApp não correspondem a uma assinatura.");
        return;
      }
      setVipInfo(result);
      setProofFile(null);
      setName((result as any).full_name);
      if ((result as any).status === "active") {
        toast.success(`Bem-vindo, ${(result as any).full_name}!`);
      } else {
        toast.info("Assinatura localizada. Confira a renovação abaixo.");
      }
    },
    onError: (error: any) => {
      setVipInfo(null);
      toast.error(error.message ?? "Não foi possível validar a assinatura.");
    },
  });

  const proofMut = useMutation({
    mutationFn: async () => {
      const renewal = (vipInfo as any)?.renewal;
      if (!renewal?.payment_token) {
        throw new Error("Cobrança de renovação não encontrada. Valide seus dados novamente.");
      }
      if (!proofFile) throw new Error("Escolha uma imagem ou PDF do comprovante.");
      const allowedTypes = new Set([
        "image/jpeg",
        "image/png",
        "image/webp",
        "application/pdf",
      ]);
      if (!allowedTypes.has(proofFile.type)) {
        throw new Error("Envie um arquivo JPG, PNG, WEBP ou PDF.");
      }
      if (proofFile.size > 5 * 1024 * 1024) {
        throw new Error("O comprovante deve ter no máximo 5 MB.");
      }

      const prepared = await prepareProofUpload({
        data: {
          paymentToken: renewal.payment_token,
          fileName: proofFile.name,
          contentType: proofFile.type as
            | "image/jpeg"
            | "image/png"
            | "image/webp"
            | "application/pdf",
          sizeBytes: proofFile.size,
        },
      });
      const submitCurrentProof = () =>
        submitProof({
          data: {
            paymentToken: renewal.payment_token,
            chargeId: prepared.chargeId,
            storagePath: prepared.path,
            fileName: proofFile.name,
            contentType: proofFile.type as
              | "image/jpeg"
              | "image/png"
              | "image/webp"
              | "application/pdf",
            sizeBytes: proofFile.size,
          },
        });
      const { error: uploadError } = await supabase.storage
        .from("subscription-payment-proofs")
        .uploadToSignedUrl(prepared.path, prepared.token, proofFile, {
          contentType: proofFile.type,
          cacheControl: "3600",
        });
      if (uploadError) {
        // A tentativa anterior pode ter concluído o upload antes de perder a resposta.
        // O servidor valida o objeto existente e mantém o envio idempotente.
        return submitCurrentProof();
      }

      return submitCurrentProof();
    },
    onSuccess: (result) => {
      setVipInfo((current: any) => ({
        ...current,
        renewal: {
          ...current?.renewal,
          proof_status: result.proofStatus,
          proof_submitted_at: result.submittedAt,
          proof_file_name: proofFile?.name,
        },
      }));
      setProofFile(null);
      toast.success("Comprovante enviado. Agora o salão fará a confirmação do pagamento.");
    },
    onError: (error: any) =>
      toast.error(error.message ?? "Não foi possível enviar o comprovante."),
  });

  let inactivePixPayload = "";
  if ((vipInfo as any)?.renewal && (vipInfo as any)?.payment) {
    const payment = (vipInfo as any).payment;
    const key = String(payment.pix_key || "").trim();
    const holder = String(payment.pix_holder || "BARBEARIA").substring(0, 25);
    const cityStr = String(payment.city || "SAO PAULO").substring(0, 15);
    const txidStr = String((vipInfo as any).renewal.charge_id || "TXID").replace(/[^a-zA-Z0-9]/g, "").substring(0, 25);
    const amountNum = Number((vipInfo as any).renewal.amount ?? 0);

    if (key && amountNum > 0) {
      try { inactivePixPayload = buildPixPayload({ key, merchant: holder, amount: amountNum, city: cityStr, txid: txidStr }); } catch (err) { console.error(err); }
    }
  }

  const handleVipContinue = () => {
    if (isVip && (!vipInfo || vipInfo.status !== "active")) return;
    setStep("service");
  };

  const handleProBack = () => {
    setStep("service");
  };

  const handleDateBack = () => {
    setStep("pro");
  };

  const handleDateSelect = (selectedDate: Date | undefined) => {
    if (!selectedDate) return;

    setDate(selectedDate);
    setTime("");

    if (typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches) {
      window.requestAnimationFrame(() => {
        timeSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
  };

  if (isLoading) return <div className="min-h-screen grid place-items-center"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  if (publicTenantError) {
    return (
      <div className="min-h-screen grid place-items-center p-6 text-center">
        <div className="max-w-md space-y-4">
          <h1 className="text-2xl font-semibold">Não foi possível carregar o agendamento</h1>
          <p className="text-muted-foreground">
            A vitrine está temporariamente indisponível. Tente novamente em instantes.
          </p>
          <Button onClick={() => void refetchPublicTenant()}>Tentar novamente</Button>
        </div>
      </div>
    );
  }
  if (!data) return <div className="min-h-screen grid place-items-center p-6 text-center"><div><h1 className="text-2xl font-semibold">Barbearia não encontrada</h1><p className="text-muted-foreground mt-2">Verifique o link de agendamento.</p></div></div>;

  const {
    tenant,
    professionals,
    services,
    settings,
    branding: brandingRow,
  } = data as any;
  const bookingBranding = normalizeBookingBranding(brandingRow);
  const bookingFallback = tenant.banner_url || bookingHero.url;
  const tenantThemeStyle = tenant.primary_color
    ? ({
        "--primary": tenant.primary_color,
        "--ring": tenant.primary_color,
      } as CSSProperties)
    : undefined;
  const slotMin = tenant.slot_minutes ?? 30;

  const chosenService = services.find((s: any) => s.id === serviceId);
  const selectedPro = professionals.find((p: any) => p.id === proId);
  let parsedVipPlan = { name: "", services: [] as string[], professional_id: "", benefits: [] as any[] };
  try {
    if (vipInfo?.plan?.startsWith("{") || vipInfo?.plan?.startsWith("[")) {
      parsedVipPlan = JSON.parse(vipInfo.plan);
    }
  } catch(e){}
  const coveredServiceIds = new Set(parsedVipPlan.services ?? []);
  const availableProsForService = chosenService?.vip_only && !isVip 
    ? [] 
    : professionals;

  const timeSlots = date && slotsQuery.data ? buildSlots(date, settings, slotMin, chosenService?.duration_min ?? slotMin, slotsQuery.data) : [];
  const selectedTimeIsAvailable = timeSlots.some(
    (slot) => slot.time === time && slot.free,
  );
  const cancellationUrl = activeCancellationToken && typeof window !== "undefined"
    ? `${window.location.origin}/booking/${slug}?cancel=${activeCancellationToken}`
    : "";

  if (cancellationTokenFromUrl) {
    return (
      <ImmersiveBackground
        branding={bookingBranding}
        fallbackUrl={bookingFallback}
        className="min-h-screen text-foreground"
        contentClassName="min-h-screen"
      >
        <div
          className="mx-auto flex min-h-screen max-w-xl flex-col justify-center p-4 md:p-8"
          style={tenantThemeStyle}
        >
          <BookingIdentityHeader
            tenant={tenant}
            branding={bookingBranding}
            contextLabel="Cancelamento de agendamento"
          />

          <Card className="overflow-hidden rounded-3xl border-none bg-white text-black shadow-2xl">
            <CardContent className="space-y-6 p-6 text-center md:p-8">
              <div className={`mx-auto grid h-16 w-16 place-items-center rounded-full border-2 ${bookingCancelled ? "border-rose-500 bg-rose-50" : "border-amber-500 bg-amber-50"}`}>
                {bookingCancelled ? (
                  <XCircle className="h-8 w-8 text-rose-500" />
                ) : (
                  <CalendarIcon className="h-8 w-8 text-amber-600" />
                )}
              </div>
              <div>
                <h2 className="text-2xl font-bold uppercase tracking-wide">
                  {bookingCancelled ? "Agendamento cancelado" : "Cancelar agendamento"}
                </h2>
                <p className="mt-2 text-sm text-gray-500">
                  {bookingCancelled
                    ? "O horario foi liberado e a comanda prevista foi cancelada automaticamente."
                    : "Ao confirmar, o horario sera liberado e deixara de contar como faturamento previsto."}
                </p>
              </div>

              {!bookingCancelled && (
                <Button
                  className="w-full bg-rose-600 py-6 font-bold text-white hover:bg-rose-700"
                  disabled={cancelMut.isPending}
                  onClick={() => cancelMut.mutate()}
                >
                  {cancelMut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <XCircle className="mr-2 h-4 w-4" />}
                  CONFIRMAR CANCELAMENTO
                </Button>
              )}

              <Button variant="outline" className="w-full" onClick={() => window.location.assign(`/booking/${slug}`)}>
                VOLTAR AO AGENDAMENTO
              </Button>
            </CardContent>
          </Card>
        </div>
      </ImmersiveBackground>
    );
  }


  return (
    <ImmersiveBackground
      branding={bookingBranding}
      fallbackUrl={bookingFallback}
      className="min-h-screen text-foreground"
      contentClassName="min-h-screen"
    >
      <div
        className="mx-auto flex min-h-screen max-w-xl flex-col justify-center p-4 md:p-8"
        style={tenantThemeStyle}
      >
        <BookingIdentityHeader tenant={tenant} branding={bookingBranding} />

        {step === "vip" && (
          <Card className="bg-[#0a0a0a] border-white/5 text-white shadow-2xl">
            <CardContent className="p-6 md:p-8 space-y-6">
              {bookingBranding.show_subscriber_badge ? (
                <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-4">
                  <Crown className="h-6 w-6 text-primary" />
                  <div className="flex-1">
                    <div className="font-semibold">Sou assinante VIP</div>
                    <div className="text-xs text-white/60">
                      Valide CPF e WhatsApp para consultar benefícios, saldo e renovação.
                    </div>
                  </div>
                  <Switch
                    checked={isVip}
                    onCheckedChange={(value) => {
                      setIsVip(value);
                      setVipInfo(null);
                      setProofFile(null);
                    }}
                  />
                </div>
              ) : (
                <button
                  type="button"
                  className="mx-auto flex items-center gap-2 text-sm text-white/65 transition hover:text-white"
                  onClick={() => {
                    setIsVip((current) => !current);
                    setVipInfo(null);
                    setProofFile(null);
                  }}
                >
                  <Crown className="h-4 w-4 text-primary" />
                  {isVip ? "Continuar sem assinatura" : "Já sou assinante VIP"}
                </button>
              )}
              {isVip && (
                <div className="space-y-3">
                  <Label>Informe seu CPF</Label>
                  <Input
                    value={cpfMask(cpf)}
                    onChange={(e) => {
                      setCpf(e.target.value);
                      setVipInfo(null);
                    }}
                    placeholder="000.000.000-00"
                  />
                  <Label>WhatsApp cadastrado</Label>
                  <Input
                    value={phoneMask(phone)}
                    onChange={(e) => {
                      setPhone(e.target.value);
                      setVipInfo(null);
                    }}
                    inputMode="tel"
                    placeholder="(00) 00000-0000"
                  />
                  <Button
                    className="w-full"
                    disabled={
                      cpf.replace(/\D/g, "").length !== 11 ||
                      phone.replace(/\D/g, "").length < 10 ||
                      validateVipMut.isPending
                    }
                    onClick={() => validateVipMut.mutate()}
                  >
                    {validateVipMut.isPending && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    {validateVipMut.isPending ? "VALIDANDO..." : "VALIDAR DADOS"}
                  </Button>
                  {bookingBranding.show_subscription_summary &&
                    vipInfo &&
                    (vipInfo as any).status === "active" && (
                    <div className="p-4 rounded-lg bg-success/10 text-sm">
                      <div className="flex items-center gap-2 font-medium">
                        <Check className="h-4 w-4 text-success" />
                        Assinatura ativa — {(() => {
                        try {
                          if ((vipInfo as any).plan?.startsWith("{") || (vipInfo as any).plan?.startsWith("[")) {
                            return JSON.parse((vipInfo as any).plan).name;
                          }
                        } catch(e){}
                        return (vipInfo as any).plan;
                        })()}
                      </div>
                      <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-white/70">
                        <span>Saldo: <strong className="text-white">{(vipInfo as any).sessions_remaining ?? "Ilimitado"}</strong></span>
                        <span>Validade: <strong className="text-white">{(vipInfo as any).ends_at ? format(new Date(`${(vipInfo as any).ends_at}T12:00:00`), "dd/MM/yyyy") : "Sem prazo"}</strong></span>
                      </div>
                    </div>
                  )}
                  {vipInfo && (vipInfo as any).renewal && (
                    <div className="p-5 rounded-xl bg-black/40 border border-white/10 text-sm flex flex-col gap-5 text-center mt-4">
                      <div className="flex flex-col items-center gap-1">
                        <div className={`font-semibold text-base ${(vipInfo as any).status === "active" ? "text-amber-400" : "text-red-500"}`}>
                          {(vipInfo as any).status === "active" ? "Renovação da assinatura" : "Assinatura aguardando renovação"}
                        </div>
                        <div className="text-white/70">
                          Valor <strong className="text-primary">{brl(Number((vipInfo as any).renewal.amount))}</strong>
                          {" · "}vencimento {format(new Date(`${(vipInfo as any).renewal.due_date}T12:00:00`), "dd/MM/yyyy")}
                          {" · "}plano {(() => {
                          try {
                            if ((vipInfo as any).plan?.startsWith("{") || (vipInfo as any).plan?.startsWith("[")) {
                              return JSON.parse((vipInfo as any).plan).name;
                            }
                          } catch(e){}
                          return (vipInfo as any).plan;
                        })()}.
                        </div>
                      </div>

                      {(vipInfo as any).renewal.proof_status === "approved" ? (
                        <div className="rounded-xl border border-emerald-400/30 bg-emerald-400/10 p-5 text-left">
                          <div className="flex items-start gap-3">
                            <FileCheck2 className="mt-0.5 h-6 w-6 shrink-0 text-emerald-400" />
                            <div>
                              <div className="font-semibold text-emerald-300">
                                Pagamento confirmado
                              </div>
                              <p className="mt-1 text-xs leading-relaxed text-white/65">
                                O salão já aprovou este comprovante. Valide seus dados novamente
                                para atualizar o saldo e o próximo vencimento.
                              </p>
                            </div>
                          </div>
                        </div>
                      ) : (vipInfo as any).renewal.proof_status === "pending_review" ? (
                        <div className="rounded-xl border border-amber-400/30 bg-amber-400/10 p-5 text-left">
                          <div className="flex items-start gap-3">
                            <FileCheck2 className="mt-0.5 h-6 w-6 shrink-0 text-amber-400" />
                            <div>
                              <div className="font-semibold text-amber-300">Comprovante recebido</div>
                              <p className="mt-1 text-xs leading-relaxed text-white/65">
                                O salão está conferindo o pagamento. Assim que ele for declarado como
                                pago, sua assinatura ficará ativa e suas sessões serão renovadas.
                              </p>
                              {(vipInfo as any).renewal.proof_file_name && (
                                <p className="mt-2 truncate text-xs text-white/45">
                                  Arquivo: {(vipInfo as any).renewal.proof_file_name}
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                      ) : (
                        <>
                          {(vipInfo as any).renewal.proof_status === "rejected" && (
                            <div className="rounded-xl border border-red-400/30 bg-red-500/10 p-3 text-left text-xs text-red-200">
                              O comprovante anterior não foi aceito.
                              {(vipInfo as any).renewal.proof_rejection_reason
                                ? ` Motivo: ${(vipInfo as any).renewal.proof_rejection_reason}`
                                : " Confira o arquivo e envie novamente."}
                            </div>
                          )}

                          {inactivePixPayload ? (
                            <>
                              <div className="bg-white p-3 rounded-xl mx-auto inline-flex shadow-lg">
                                <QrCode value={inactivePixPayload} size={180} />
                              </div>

                              <Button variant="outline" className="w-full bg-white/5 border-white/10 text-white hover:bg-white/10 py-5" onClick={()=>{navigator.clipboard.writeText(inactivePixPayload);toast.success("Código PIX copiado!");}}>
                                <Copy className="h-4 w-4 mr-2" /> Copiar Código PIX Copia-e-Cola
                              </Button>

                              <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border border-dashed border-white/20 bg-white/[0.03] p-4 text-center transition hover:border-amber-400/60 hover:bg-amber-400/5">
                                <UploadCloud className="h-6 w-6 text-amber-400" />
                                <span className="font-medium">
                                  {proofFile ? proofFile.name : "Escolher comprovante"}
                                </span>
                                <span className="text-xs text-white/45">
                                  JPG, PNG, WEBP ou PDF · máximo 5 MB
                                </span>
                                <input
                                  type="file"
                                  className="sr-only"
                                  accept="image/jpeg,image/png,image/webp,application/pdf"
                                  onChange={(event) => setProofFile(event.target.files?.[0] ?? null)}
                                />
                              </label>

                              <Button
                                className="w-full py-5"
                                disabled={!proofFile || proofMut.isPending}
                                onClick={() => proofMut.mutate()}
                              >
                                {proofMut.isPending ? (
                                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                ) : (
                                  <FileCheck2 className="mr-2 h-4 w-4" />
                                )}
                                {proofMut.isPending ? "Enviando..." : "Enviar comprovante para análise"}
                              </Button>
                            </>
                          ) : (
                            <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-left text-xs text-white/65">
                              O pagamento online não está habilitado para este plano. Entre em
                              contato com o salão para receber as instruções de renovação.
                            </div>
                          )}

                          <a href={`https://wa.me/55${tenant?.whatsapp?.replace(/\D/g, '')}?text=${encodeURIComponent('Olá, preciso de ajuda com a renovação da minha assinatura.')}`} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-2 text-xs text-white/55 transition hover:text-white">
                            <MessageCircle className="h-4 w-4" /> Preciso de ajuda pelo WhatsApp
                          </a>
                        </>
                      )}
                    </div>
                  )}
                  {vipInfo &&
                    (vipInfo as any).status !== "active" &&
                    !(vipInfo as any).renewal && (
                      <div className="rounded-xl border border-red-400/30 bg-red-500/10 p-4 text-sm text-red-100">
                        Esta assinatura não possui uma cobrança disponível para renovação no
                        momento. Fale com o salão para regularizar o cadastro.
                      </div>
                    )}
                </div>
              )}
              {bookingBranding.show_primary_button ? (
                <Button className="flex w-full justify-between rounded-xl bg-primary px-6 py-6 font-semibold text-primary-foreground shadow-lg transition-all hover:bg-primary/90" size="lg" disabled={isVip && (!vipInfo || (vipInfo as any).status !== "active")} onClick={handleVipContinue}>
                  <span>CONTINUAR</span>
                  <ArrowRight className="h-5 w-5" />
                </Button>
              ) : (
                <button
                  type="button"
                  className="mx-auto flex items-center gap-2 text-sm font-medium text-white/70 transition hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                  disabled={isVip && (!vipInfo || (vipInfo as any).status !== "active")}
                  onClick={handleVipContinue}
                >
                  Iniciar agendamento
                  <ArrowRight className="h-4 w-4" />
                </button>
              )}
            </CardContent>
          </Card>
        )}

        {step === "service" && (
          <Card className="bg-[#0a0a0a] border-white/5 text-white shadow-2xl"><CardContent className="p-6 space-y-6">
            <StepHeader title="Escolha o serviço" onBack={() => setStep("vip")} />
            <div className="grid sm:grid-cols-2 gap-3">
              {services.filter((s: any) => !s.vip_only || isVip).map((s: any) => (
                <button key={s.id} onClick={() => { setServiceId(s.id); setProId(""); setDate(undefined); setTime(""); setStep("pro"); }} className={`text-left p-4 rounded-xl border-2 transition ${serviceId === s.id ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"}`}>
                  <div className="flex items-center justify-between gap-2"><div className="font-medium">{s.name}</div>{isVip && coveredServiceIds.has(s.id) ? <span className="rounded-full bg-emerald-500/15 px-2 py-1 text-[10px] font-semibold text-emerald-400">INCLUSO</span> : s.vip_only ? <Crown className="h-4 w-4 text-primary" /> : null}</div>
                  <div className="text-xs text-muted-foreground mt-1">{s.duration_min} min</div>
                  <div className="font-semibold text-primary mt-2">{isVip && coveredServiceIds.has(s.id) ? "Coberto pela assinatura" : brl(s.price)}</div>
                  {isVip && !coveredServiceIds.has(s.id) && <div className="mt-1 text-[11px] text-amber-400">Serviço extra: haverá cobrança adicional.</div>}
                  </button>
              ))}
            </div>
          </CardContent></Card>
        )}

        {step === "pro" && (
          <Card className="bg-[#0a0a0a] border-white/5 text-white shadow-2xl"><CardContent className="p-6 space-y-6">
            <StepHeader title="Escolha o profissional" onBack={handleProBack} />
            <div className="grid sm:grid-cols-2 gap-3">
              {availableProsForService.map((p: any) => (
                <button key={p.id} onClick={() => { setProId(p.id); setDate(undefined); setTime(""); setStep("date"); }} className={`flex items-center gap-3 p-4 rounded-xl border-2 transition ${proId === p.id ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"}`}>
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
                  <button onClick={handleDateBack} className="text-amber-500 hover:text-amber-400">
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
                      required
                      selected={date} 
                      onSelect={handleDateSelect}
                                         disabled={(d) => {
                        if (d < new Date(new Date().setHours(0,0,0,0))) return true;

                        // Check weekly day off (work_days: 1=Seg...7=Dom)
                        const dayOfWeek = d.getDay();
                        const normalizedDay = dayOfWeek === 0 ? 7 : dayOfWeek;
                        const workDays = settings?.work_days ?? [1,2,3,4,5,6];
                        if (!workDays.includes(normalizedDay)) return true;

                        // Check specific date block (closed_dates: 'yyyy-MM-dd')
                        const dateStr = format(d, "yyyy-MM-dd");
                        const closedDates = settings?.closed_dates ?? [];
                        if (closedDates.includes(dateStr)) return true;

                        // Check specific professional work_days and blocked_dates
                        if (selectedPro) {
                          const proWorkDays = selectedPro.work_days ?? [1,2,3,4,5,6];
                          if (!proWorkDays.includes(normalizedDay)) return true;

                          const proBlockedDates = selectedPro.blocked_dates ?? [];
                          if (proBlockedDates.includes(dateStr)) return true;
                        }

                        if (isVip) {
                          const vipDays = settings?.vip_days ?? [1,2,3,4];
                          if (!vipDays.includes(normalizedDay)) return true;
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
                <div ref={timeSectionRef} className="flex scroll-mt-4 flex-col space-y-6" aria-live="polite">
                  <div className="flex items-start gap-4">
                     <div className="h-12 w-12 rounded-full border border-amber-500/30 flex items-center justify-center shrink-0">
                       <CalendarIcon className="h-5 w-5 text-amber-500" />
                     </div>
                     <div>
                       <h3 className="font-medium text-lg">
                         {date
                           ? format(date, "EEEE, d 'de' MMMM", { locale: ptBR })
                           : "Selecione uma data"}
                       </h3>
                       <p className="text-sm text-white/50">
                         {date
                           ? "Agora escolha um horário disponível."
                           : "Escolha o melhor dia para seu atendimento."}
                       </p>
                     </div>
                  </div>
                  
                  <div className="flex-1">
                    {slotsQuery.isFetching && <Loader2 className="h-5 w-5 animate-spin" />}
                    {slotsQuery.isError && (
                      <div className="text-sm text-red-300">
                        Não foi possível carregar os horários. Escolha a data novamente.
                      </div>
                    )}
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

                  <Button className="w-full mt-auto py-6 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-semibold shadow-[0_0_15px_rgba(245,158,11,0.15)] flex justify-between px-6 transition-all" size="lg" disabled={!selectedTimeIsAvailable || slotsQuery.isFetching} onClick={() => setStep("form")} data-testid="booking-continue">
                    <span>
                      {!date
                        ? "SELECIONE UMA DATA"
                        : slotsQuery.isFetching
                          ? "CARREGANDO HORÁRIOS"
                          : !selectedTimeIsAvailable
                            ? "SELECIONE UM HORÁRIO"
                            : "CONTINUAR"}
                    </span>
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
              <div className="flex items-center text-white/70"><span className="w-24">Serviço:</span> <strong className="text-white font-medium">{chosenService?.name}</strong> <span className="ml-2 text-amber-500 font-medium">— {isVip && coveredServiceIds.has(chosenService?.id) ? "Incluso no plano" : brl(chosenService?.price)}</span></div>
              <div className="flex items-center text-white/70"><span className="w-24">Profissional:</span> <span className="text-white">{professionals.find((p:any)=>p.id===proId)?.full_name}</span></div>
              <div className="flex items-center text-white/70"><span className="w-24">Data:</span> <span className="text-white">{date && format(date, "dd/MM/yyyy")} às {time}</span></div>
              {isVip && !coveredServiceIds.has(chosenService?.id) && <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 p-3 text-xs text-amber-300">Este serviço não faz parte da assinatura e será cobrado normalmente no atendimento.</div>}
            </div>
            <Button size="lg" className="w-full mt-auto py-6 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-semibold shadow-[0_0_15px_rgba(245,158,11,0.15)] flex justify-between px-6 transition-all" disabled={!name || phone.replace(/\D/g,"").length < 10 || bookMut.isPending} onClick={() => bookMut.mutate()}>
              <span className="flex items-center">{bookMut.isPending ? <Loader2 className="h-5 w-5 animate-spin mr-2" /> : null} CONFIRMAR AGENDAMENTO</span>
              {!bookMut.isPending && <Check className="h-5 w-5 text-black" />}
            </Button>
          </CardContent></Card>
        )}

        {step === "done" && (
          <Card className="bg-white border-none text-black shadow-2xl overflow-hidden rounded-3xl mx-auto w-full max-w-lg">
            <div className="bg-white p-6 md:p-8">
              <div className="text-center mb-6 mt-4">
                <div className={`h-16 w-16 rounded-full border-2 mx-auto flex items-center justify-center mb-4 ${bookingCancelled ? "border-rose-500 bg-rose-50" : "border-amber-500"}`}>
                  {bookingCancelled ? (
                    <XCircle className="h-8 w-8 text-rose-500" />
                  ) : (
                    <Check className="h-8 w-8 text-amber-500" />
                  )}
                </div>
                <h3 className="text-2xl font-bold uppercase tracking-wide text-black">
                  {bookingCancelled ? "RESERVA CANCELADA" : "RESERVA CONFIRMADA"}
                </h3>
                <p className={`text-sm font-semibold uppercase tracking-wider mt-1 ${bookingCancelled ? "text-rose-600" : "text-amber-600"}`}>
                  {bookingCancelled ? "O HORARIO FOI LIBERADO" : "O SEU HORARIO FOI GARANTIDO!"}
                </p>
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

              {bookingCancelled ? (
                <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-center text-sm font-medium text-rose-700">
                  O cancelamento ja aparece na agenda do salao e nao conta mais como faturamento previsto.
                </div>
              ) : (
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <Button
                    variant="outline"
                    className="border-rose-200 text-xs font-bold text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                    disabled={cancelMut.isPending}
                    onClick={() => {
                      if (window.confirm("Deseja realmente cancelar este agendamento?")) cancelMut.mutate();
                    }}
                  >
                    {cancelMut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <XCircle className="mr-2 h-4 w-4" />}
                    CANCELAR RESERVA
                  </Button>
                  <Button
                    variant="outline"
                    className="border-amber-500/20 text-xs font-bold hover:bg-amber-50"
                    disabled={!cancellationUrl}
                    onClick={async () => {
                      await navigator.clipboard.writeText(cancellationUrl);
                      toast.success("Link de cancelamento copiado.");
                    }}
                  >
                    <Copy className="mr-2 h-4 w-4" />
                    GUARDAR LINK
                  </Button>
                </div>
              )}

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
                <Button
                  variant="outline"
                  className="bg-black hover:bg-neutral-800 text-amber-500 border-none text-xs font-bold"
                  onClick={() => {
                    const message = `Olá! Fiz um agendamento na ${tenant.name} para o dia ${format(date!, "dd/MM/yyyy")} às ${time}. Link para cancelar: ${cancellationUrl}`;
                    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, "_blank");
                  }}
                >
                  <MessageCircle className="h-4 w-4 mr-2" /> WHATSAPP
                </Button>
              </div>

              <div className="mt-4">
                <Button className="w-full bg-black hover:bg-neutral-900 text-amber-500 text-xs font-bold py-6 rounded-xl shadow-xl" onClick={() => window.location.reload()}><Plus className="h-4 w-4 mr-2 text-amber-500" /> NOVA RESERVA</Button>
              </div>

            </div>
          </Card>
        )}
      </div>
    </ImmersiveBackground>
  );
}

function BookingIdentityHeader({
  tenant,
  branding,
  contextLabel,
}: {
  tenant: any;
  branding: BookingBranding;
  contextLabel?: string;
}) {
  const hasText =
    branding.show_name ||
    Boolean(contextLabel) ||
    (branding.show_subtitle && tenant.subtitle) ||
    (branding.show_slogan && branding.hero_slogan);

  if (!branding.show_logo && !hasText) return null;

  return (
    <div className="mb-6 flex items-center gap-4">
      {branding.show_logo && (
        <div className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-2xl bg-primary text-primary-foreground shadow-md">
          {tenant.logo_url ? (
            <img
              src={tenant.logo_url}
              className="h-full w-full object-cover"
              alt={`Logo de ${tenant.name}`}
            />
          ) : (
            <Scissors className="h-6 w-6" />
          )}
        </div>
      )}
      {hasText && (
        <div className="min-w-0">
          {branding.show_name && (
            <h1 className="text-2xl font-semibold text-white drop-shadow md:text-3xl">
              {tenant.name}
            </h1>
          )}
          {contextLabel ? (
            <p className="text-sm text-white/70">{contextLabel}</p>
          ) : (
            <>
              {branding.show_subtitle && tenant.subtitle && (
                <p className="text-sm text-white/65">{tenant.subtitle}</p>
              )}
              {branding.show_slogan && branding.hero_slogan && (
                <p className="mt-1 text-sm font-medium text-white/90">
                  {branding.hero_slogan}
                </p>
              )}
            </>
          )}
        </div>
      )}
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
  for (let h = open; h <= close; h++) {
    for (let m = 0; m < 60; m += slotMin) {
      if (h === close && m > 0) break;
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

import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import {
  cancelBooking,
  createBooking,
  getBookedSlots,
  getPublicTenant,
  prepareSubscriptionProofUpload,
  submitSubscriptionProof,
  validateVip,
} from "@/lib/booking.functions";
import {
  getBookingCustomer,
  loginBookingCustomer,
  logoutBookingCustomer,
  registerBookingCustomer,
} from "@/lib/customer-auth.functions";
import {
  isValidCustomerCpf,
  isValidCustomerWhatsapp,
  type BookingCustomer,
} from "@/lib/customer-auth";
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
  Eye,
  EyeOff,
  LogIn,
  LogOut,
  ShieldCheck,
  UserPlus,
  UserRound,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
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
type CustomerAccessMode = "register" | "login";

function canBookWithVip(vipInfo: any) {
  return Boolean(vipInfo && (vipInfo.can_book ?? vipInfo.status === "active"));
}

function vipSubscriptionStatusLabel(status: string) {
  return (
    {
      active: "ativa",
      pending_activation: "aguardando pagamento",
      overdue: "vencida",
      suspended: "suspensa",
      canceled: "cancelada",
      expired: "expirada",
    }[status] ?? status
  );
}

import { buildPixPayload } from "@/lib/pix";
import { QrCode } from "@/lib/qr";

function BookingPage() {
  const queryClient = useQueryClient();
  const { slug } = Route.useParams();
  const { cancel: cancellationTokenFromUrl } = Route.useSearch();
  const getTenant = useServerFn(getPublicTenant);
  const validate = useServerFn(validateVip);
  const getSlots = useServerFn(getBookedSlots);
  const create = useServerFn(createBooking);
  const cancel = useServerFn(cancelBooking);
  const prepareProofUpload = useServerFn(prepareSubscriptionProofUpload);
  const submitProof = useServerFn(submitSubscriptionProof);
  const getCustomer = useServerFn(getBookingCustomer);
  const registerCustomer = useServerFn(registerBookingCustomer);
  const loginCustomer = useServerFn(loginBookingCustomer);
  const logoutCustomer = useServerFn(logoutBookingCustomer);

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
  const tenantId = (data as any)?.tenant?.id as string | undefined;
  const [step, setStep] = useState<Step>("vip");
  const [isVip, setIsVip] = useState(false);
  const [vipInfo, setVipInfo] = useState<any>(null);
  const [serviceId, setServiceId] = useState<string>("");
  const [proId, setProId] = useState<string>("");
  const [date, setDate] = useState<Date | undefined>(undefined);
  const [time, setTime] = useState<string>("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [bookingCancelled, setBookingCancelled] = useState(false);
  const [accessMode, setAccessMode] = useState<CustomerAccessMode>("register");
  const [accessName, setAccessName] = useState("");
  const [accessCpf, setAccessCpf] = useState("");
  const [accessPhone, setAccessPhone] = useState("");
  const [accessPassword, setAccessPassword] = useState("");
  const [accessActivationCode, setAccessActivationCode] = useState("");
  const [whatsappConsent, setWhatsappConsent] = useState(false);
  const timeSectionRef = useRef<HTMLDivElement>(null);

  const customerQuery = useQuery({
    queryKey: ["booking-customer", tenantId],
    enabled: Boolean(tenantId) && !cancellationTokenFromUrl,
    queryFn: () => getCustomer({ data: { tenantId: tenantId! } }),
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    staleTime: Infinity,
  });

  const applyCustomer = useCallback((customer: BookingCustomer) => {
    setName(customer.fullName);
    setPhone(customer.whatsapp);
    setAccessPassword("");
    setAccessActivationCode("");
    setAccessCpf("");
    setVipInfo(null);
    setIsVip(false);
    setStep("vip");
  }, []);

  const registerCustomerMut = useMutation({
    mutationFn: () => {
      if (!tenantId) throw new Error("Salão indisponível no momento.");
      return registerCustomer({
        data: {
          tenantId,
          fullName: accessName,
          cpf: accessCpf,
          whatsapp: accessPhone,
          password: accessPassword,
          activationCode: accessActivationCode,
          whatsappConsent,
        },
      });
    },
    onSuccess: (customer) => {
      queryClient.setQueryData(["booking-customer", tenantId], customer);
      applyCustomer(customer);
      toast.success("Cadastro confirmado! Seu acesso ficou salvo neste aparelho.");
    },
    onError: (error: any) => toast.error(error.message ?? "Não foi possível criar o cadastro."),
  });

  const loginCustomerMut = useMutation({
    mutationFn: () => {
      if (!tenantId) throw new Error("Salão indisponível no momento.");
      return loginCustomer({
        data: { tenantId, cpf: accessCpf, password: accessPassword },
      });
    },
    onSuccess: (customer) => {
      queryClient.setQueryData(["booking-customer", tenantId], customer);
      applyCustomer(customer);
      toast.success(`Bem-vindo, ${customer.fullName}!`);
    },
    onError: (error: any) => toast.error(error.message ?? "Não foi possível entrar."),
  });

  const logoutCustomerMut = useMutation({
    mutationFn: () => {
      if (!tenantId) throw new Error("Salão indisponível no momento.");
      return logoutCustomer({ data: { tenantId } });
    },
    onSuccess: () => {
      queryClient.setQueryData(["booking-customer", tenantId], null);
      setName("");
      setPhone("");
      setVipInfo(null);
      setIsVip(false);
      setStep("vip");
      setAccessMode("login");
      setWhatsappConsent(false);
    },
    onError: () => toast.error("Não foi possível sair agora."),
  });

  useEffect(() => {
    if (customerQuery.data) applyCustomer(customerQuery.data);
  }, [customerQuery.data, applyCustomer]);

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
      const [year, month, day] = format(date!, "yyyy-MM-dd").split("-").map(Number);
      const start = new Date(year, month - 1, day, h, m, 0, 0);
      if (!tenantId) throw new Error("Salão indisponível no momento.");
      return create({
        data: {
          tenantId,
          professionalId: proId,
          serviceId,
          startAt: start.toISOString(),
          isVip,
          subscriptionId: isVip ? (vipInfo as any)?.subscription_id : undefined,
        },
      });
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
    mutationFn: async (subscriptionId?: string) => {
      if (!tenantId) throw new Error("Salão indisponível no momento.");
      return validate({ data: { tenantId, subscriptionId } });
    },
    onSuccess: (result) => {
      if (!result) {
        setVipInfo(null);
        toast.error("CPF não corresponde a uma assinatura.");
        return;
      }
      setVipInfo(result);
      setProofFile(null);
      setName((result as any).full_name);
      if (canBookWithVip(result)) {
        toast.success(`Bem-vindo, ${(result as any).full_name}!`);
      } else if ((result as any).booking_block_reason) {
        toast.info((result as any).booking_block_reason);
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
    if (isVip && (validateVipMut.isPending || !canBookWithVip(vipInfo))) return;
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
  const bookingFallback = null;
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
  } catch {
    // Legacy plans may be stored as plain text instead of JSON.
  }
  const availableVipSubscriptions = Array.isArray((vipInfo as any)?.available_subscriptions)
    ? ((vipInfo as any).available_subscriptions as any[])
    : [];
  const vipBenefitBalances = Array.isArray((vipInfo as any)?.benefits)
    ? ((vipInfo as any).benefits as any[])
    : [];
  const vipBenefitByService = new Map<string, any>();
  for (const benefit of vipBenefitBalances) {
    if (
      benefit?.benefit_type === "service" &&
      benefit?.service_id &&
      !vipBenefitByService.has(benefit.service_id)
    ) {
      vipBenefitByService.set(benefit.service_id, benefit);
    }
  }
  const coveredServiceIds = new Set(parsedVipPlan.services ?? []);
  const vipCoveredBalanceExhausted =
    isVip &&
    (vipInfo as any)?.available_sessions != null &&
    Number((vipInfo as any).available_sessions) <= 0;
  const visibleServices = services.filter((service: any) => {
    if (service.vip_only && !isVip) return false;
    if (!isVip || coveredServiceIds.has(service.id)) return true;
    return !(vipInfo as any)?.included_services_only || Boolean((vipInfo as any)?.allow_extras);
  });
  const availableProsForService = (() => {
    let pros = chosenService?.vip_only && !isVip ? [] : professionals;
    if (isVip && chosenService?.name?.toLowerCase().includes("corte")) {
      pros = pros.filter((professional: any) => {
        const professionalName = professional.full_name?.toLowerCase() ?? "";
        return professionalName.includes("françois") || professionalName.includes("francois");
      });
    }
    return pros;
  })();

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
        accentColor={tenant.primary_color}
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
      accentColor={tenant.primary_color}
      className="min-h-screen text-foreground"
      contentClassName="min-h-screen"
    >
      <div
        className="mx-auto flex min-h-screen max-w-xl flex-col justify-center p-4 md:p-8"
        style={tenantThemeStyle}
      >
        <BookingIdentityHeader tenant={tenant} branding={bookingBranding} />

        {customerQuery.isLoading && (
          <Card className="border-white/5 bg-[#0a0a0a] text-white shadow-2xl">
            <CardContent className="flex items-center justify-center gap-3 p-8 text-sm text-white/70">
              <Loader2 className="h-5 w-5 animate-spin" />
              Verificando seu acesso neste aparelho...
            </CardContent>
          </Card>
        )}

        {customerQuery.isError && (
          <Card className="border-red-400/20 bg-[#0a0a0a] text-white shadow-2xl">
            <CardContent className="space-y-4 p-6 text-center">
              <p className="text-sm text-red-200">
                Não foi possível abrir o acesso do cliente. Tente novamente em instantes.
              </p>
              <Button variant="outline" onClick={() => void customerQuery.refetch()}>
                Tentar novamente
              </Button>
            </CardContent>
          </Card>
        )}

        {!customerQuery.isLoading && !customerQuery.isError && !customerQuery.data && (
          <CustomerAccessCard
            mode={accessMode}
            name={accessName}
            cpf={accessCpf}
            phone={accessPhone}
            password={accessPassword}
            activationCode={accessActivationCode}
            whatsappConsent={whatsappConsent}
            pending={registerCustomerMut.isPending || loginCustomerMut.isPending}
            onModeChange={(mode) => {
              setAccessMode(mode);
              setAccessPassword("");
              setAccessActivationCode("");
            }}
            onNameChange={setAccessName}
            onCpfChange={setAccessCpf}
            onPhoneChange={setAccessPhone}
            onPasswordChange={setAccessPassword}
            onActivationCodeChange={setAccessActivationCode}
            onWhatsappConsentChange={setWhatsappConsent}
            onSubmit={() =>
              accessMode === "register"
                ? registerCustomerMut.mutate()
                : loginCustomerMut.mutate()
            }
          />
        )}

        {customerQuery.data && step === "vip" && (
          <Card className="bg-[#0a0a0a] border-white/5 text-white shadow-2xl">
            <CardContent className="p-6 md:p-8 space-y-6">
              <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-4">
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary/15 text-primary">
                  <UserRound className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold">Olá, {customerQuery.data.fullName}</div>
                  <div className="text-xs text-white/55">
                    {phoneMask(customerQuery.data.whatsapp)} · CPF final {customerQuery.data.cpfLast4}
                  </div>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-white/60 hover:bg-white/10 hover:text-white"
                  disabled={logoutCustomerMut.isPending}
                  onClick={() => logoutCustomerMut.mutate()}
                >
                  {logoutCustomerMut.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <LogOut className="h-4 w-4" />
                  )}
                  <span className="sr-only">Sair</span>
                </Button>
              </div>

              {bookingBranding.show_subscriber_badge ? (
                <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-4">
                  <Crown className="h-6 w-6 text-primary" />
                  <div className="flex-1">
                    <div className="font-semibold">Sou assinante VIP</div>
                    <div className="text-xs text-white/60">
                      Consulte benefícios, saldo e renovação com seu cadastro.
                    </div>
                  </div>
                  <Switch
                    checked={isVip}
                    onCheckedChange={(value) => {
                      setIsVip(value);
                      setVipInfo(null);
                      setProofFile(null);
                      if (value) validateVipMut.mutate(undefined);
                    }}
                  />
                </div>
              ) : (
                <button
                  type="button"
                  className="mx-auto flex items-center gap-2 text-sm text-white/65 transition hover:text-white"
                  onClick={() => {
                    const nextVip = !isVip;
                    setIsVip(nextVip);
                    setVipInfo(null);
                    setProofFile(null);
                    if (nextVip) validateVipMut.mutate(undefined);
                  }}
                >
                  <Crown className="h-4 w-4 text-primary" />
                  {isVip ? "Continuar sem assinatura" : "Já sou assinante VIP"}
                </button>
              )}
              {isVip && (
                <div className="space-y-3">
                  <Button
                    className="w-full"
                    disabled={validateVipMut.isPending}
                    onClick={() => validateVipMut.mutate(undefined)}
                  >
                    {validateVipMut.isPending && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    {validateVipMut.isPending ? "CONSULTANDO..." : "CONSULTAR MINHA ASSINATURA"}
                  </Button>
                  {availableVipSubscriptions.length > 1 && (
                    <div className="space-y-2 rounded-xl border border-white/10 bg-white/5 p-4">
                      <Label htmlFor="vip-subscription" className="text-xs text-white/70">
                        Qual assinatura deseja usar?
                      </Label>
                      <select
                        id="vip-subscription"
                        className="h-11 w-full rounded-lg border border-white/15 bg-[#111] px-3 text-sm text-white outline-none focus:border-primary disabled:opacity-60"
                        value={(vipInfo as any)?.subscription_id ?? ""}
                        disabled={validateVipMut.isPending}
                        onChange={(event) => {
                          const subscriptionId = event.target.value;
                          setVipInfo((current: any) =>
                            current
                              ? {
                                  ...current,
                                  subscription_id: subscriptionId,
                                  can_book: false,
                                  booking_block_reason: "Carregando a assinatura escolhida...",
                                }
                              : current,
                          );
                          setServiceId("");
                          setProId("");
                          setDate(undefined);
                          setTime("");
                          setProofFile(null);
                          validateVipMut.mutate(subscriptionId);
                        }}
                      >
                        {availableVipSubscriptions.map((subscription: any) => (
                          <option key={subscription.id} value={subscription.id}>
                            {subscription.plan_name} · {vipSubscriptionStatusLabel(subscription.status)}
                            {subscription.sessions_remaining == null
                              ? " · saldo ilimitado"
                              : ` · saldo ${subscription.sessions_remaining}`}
                          </option>
                        ))}
                      </select>
                      <p className="text-[11px] leading-relaxed text-white/45">
                        Benefícios, saldo e renovação abaixo correspondem à assinatura escolhida.
                      </p>
                    </div>
                  )}
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
                        } catch {
                          // Legacy plans may be stored as plain text instead of JSON.
                        }
                        return (vipInfo as any).plan;
                        })()}
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-3 text-xs text-white/70">
                        <span>
                          Saldo do plano:{" "}
                          <strong className="text-white">
                            {(vipInfo as any).sessions_remaining ?? "Ilimitado"}
                          </strong>
                        </span>
                        <span>
                          Já reservadas:{" "}
                          <strong className="text-white">
                            {(vipInfo as any).reserved_sessions ?? 0}
                          </strong>
                        </span>
                        <span>
                          Disponíveis agora:{" "}
                          <strong className="text-emerald-300">
                            {(vipInfo as any).available_sessions ?? "Ilimitado"}
                          </strong>
                        </span>
                        <span>
                          Validade:{" "}
                          <strong className="text-white">
                            {(vipInfo as any).ends_at
                              ? format(
                                  new Date(`${(vipInfo as any).ends_at}T12:00:00`),
                                  "dd/MM/yyyy",
                                )
                              : "Sem prazo"}
                          </strong>
                        </span>
                      </div>
                      {vipBenefitBalances.some(
                        (benefit: any) =>
                          benefit.benefit_type === "service" && benefit.quantity != null,
                      ) && (
                        <div className="mt-4 space-y-2 border-t border-white/10 pt-3">
                          <div className="text-[10px] font-semibold uppercase tracking-wider text-white/45">
                            Saldo por benefício neste ciclo
                          </div>
                          {vipBenefitBalances
                            .filter(
                              (benefit: any) =>
                                benefit.benefit_type === "service" && benefit.quantity != null,
                            )
                            .map((benefit: any) => (
                              <div
                                key={benefit.id}
                                className="flex items-center justify-between gap-3 rounded-lg bg-black/20 px-3 py-2 text-xs"
                              >
                                <span className="min-w-0 truncate text-white/75">{benefit.name}</span>
                                <span
                                  className={
                                    Number(benefit.available_quantity) > 0
                                      ? "shrink-0 font-semibold text-emerald-300"
                                      : "shrink-0 font-semibold text-red-300"
                                  }
                                >
                                  {benefit.available_quantity} disponível(is) · {benefit.used_quantity} usado(s) ·{" "}
                                  {benefit.reserved_quantity} reservado(s)
                                </span>
                              </div>
                            ))}
                        </div>
                      )}
                    </div>
                  )}
                  {vipInfo && !canBookWithVip(vipInfo) && (vipInfo as any).booking_block_reason && (
                    <div className="rounded-xl border border-amber-400/30 bg-amber-400/10 p-4 text-sm text-amber-100">
                      {(vipInfo as any).booking_block_reason}
                    </div>
                  )}
                  {vipInfo && (vipInfo as any).renewal && (
                    <div className="p-5 rounded-xl bg-black/40 border border-white/10 text-sm flex flex-col gap-5 text-center mt-4">
                      <div className="flex flex-col items-center gap-1">
                        <div className={`font-semibold text-base ${(vipInfo as any).status === "active" ? "text-amber-400" : "text-red-500"}`}>
                          {(vipInfo as any).status === "pending_activation"
                            ? "Assinatura aguardando ativação"
                            : (vipInfo as any).status === "active"
                              ? "Renovação da assinatura"
                              : "Assinatura aguardando renovação"}
                        </div>
                        <div className="text-white/70">
                          Valor <strong className="text-primary">{brl(Number((vipInfo as any).renewal.amount))}</strong>
                          {" · "}vencimento {format(new Date(`${(vipInfo as any).renewal.due_date}T12:00:00`), "dd/MM/yyyy")}
                          {" · "}plano {(() => {
                          try {
                            if ((vipInfo as any).plan?.startsWith("{") || (vipInfo as any).plan?.startsWith("[")) {
                              return JSON.parse((vipInfo as any).plan).name;
                            }
                          } catch {
                            // Legacy plans may be stored as plain text instead of JSON.
                          }
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
                        {(vipInfo as any).status === "pending_activation"
                          ? "O primeiro pagamento ainda não foi confirmado e não há uma cobrança disponível neste acesso. Fale com o salão para ativar a assinatura."
                          : "Esta assinatura não possui uma cobrança disponível para renovação no momento. Fale com o salão para regularizar o cadastro."}
                      </div>
                    )}
                </div>
              )}
              {bookingBranding.show_primary_button ? (
                <Button className="flex w-full justify-between rounded-xl bg-primary px-6 py-6 font-semibold text-primary-foreground shadow-lg transition-all hover:bg-primary/90" size="lg" disabled={isVip && (validateVipMut.isPending || !canBookWithVip(vipInfo))} onClick={handleVipContinue}>
                  <span>CONTINUAR</span>
                  <ArrowRight className="h-5 w-5" />
                </Button>
              ) : (
                <button
                  type="button"
                  className="mx-auto flex items-center gap-2 text-sm font-medium text-white/70 transition hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                  disabled={isVip && (validateVipMut.isPending || !canBookWithVip(vipInfo))}
                  onClick={handleVipContinue}
                >
                  Iniciar agendamento
                  <ArrowRight className="h-4 w-4" />
                </button>
              )}
            </CardContent>
          </Card>
        )}

        {customerQuery.data && step === "service" && (
          <Card className="bg-[#0a0a0a] border-white/5 text-white shadow-2xl"><CardContent className="p-6 space-y-6">
            <StepHeader title="Escolha o serviço" onBack={() => setStep("vip")} />
            <div className="grid sm:grid-cols-2 gap-3">
              {visibleServices.map((service: any) => {
                const covered = isVip && coveredServiceIds.has(service.id);
                const serviceBenefit = vipBenefitByService.get(service.id);
                const benefitBalanceExhausted =
                  covered &&
                  serviceBenefit?.available_quantity != null &&
                  Number(serviceBenefit.available_quantity) <= 0;
                const unavailable =
                  covered && (vipCoveredBalanceExhausted || benefitBalanceExhausted);
                return (
                  <button
                    key={service.id}
                    type="button"
                    disabled={unavailable}
                    onClick={() => {
                      setServiceId(service.id);
                      setDate(undefined);
                      setTime("");
                      let availableProfessionals =
                        service.vip_only && !isVip ? [] : professionals;
                      if (isVip && service.name.toLowerCase().includes("corte")) {
                        availableProfessionals = availableProfessionals.filter(
                          (professional: any) => {
                            const professionalName =
                              professional.full_name?.toLowerCase() ?? "";
                            return (
                              professionalName.includes("françois") ||
                              professionalName.includes("francois")
                            );
                          },
                        );
                      }
                      if (availableProfessionals.length === 1) {
                        setProId(availableProfessionals[0].id);
                        setStep("date");
                      } else {
                        setProId("");
                        setStep("pro");
                      }
                    }}
                    className={`rounded-xl border-2 p-4 text-left transition disabled:cursor-not-allowed disabled:opacity-50 ${
                      serviceId === service.id
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-primary/50"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-medium">{service.name}</div>
                      {covered ? (
                        <span className="rounded-full bg-emerald-500/15 px-2 py-1 text-[10px] font-semibold text-emerald-400">
                          INCLUSO
                        </span>
                      ) : service.vip_only ? (
                        <Crown className="h-4 w-4 text-primary" />
                      ) : null}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {service.duration_min} min
                    </div>
                    <div className="mt-2 font-semibold text-primary">
                      {covered ? "Coberto pela assinatura" : brl(service.price)}
                    </div>
                    {covered && serviceBenefit?.quantity != null && !unavailable && (
                      <div className="mt-1 text-[11px] text-emerald-300">
                        {serviceBenefit.available_quantity} de {serviceBenefit.quantity} disponível(is)
                        neste ciclo
                      </div>
                    )}
                    {unavailable && (
                      <div className="mt-1 text-[11px] text-red-300">
                        {benefitBalanceExhausted
                          ? `Benefício esgotado neste ciclo: ${serviceBenefit.used_quantity ?? 0} usado(s) e ${serviceBenefit.reserved_quantity ?? 0} reservado(s).`
                          : "Sem saldo livre: as sessões foram usadas ou já estão reservadas."}
                      </div>
                    )}
                    {isVip && !covered && (
                      <div className="mt-1 text-[11px] text-amber-400">
                        Serviço extra: haverá cobrança adicional.
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </CardContent></Card>
        )}

        {customerQuery.data && step === "pro" && (
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

        {customerQuery.data && step === "date" && (
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
                        const todayStr = format(new Date(), "yyyy-MM-dd");
                        const dStr = format(d, "yyyy-MM-dd");
                        if (dStr < todayStr) return true;

                        // Check weekly day off (work_days: 1=Seg...7=Dom)
                        const dayOfWeek = d.getDay();
                        const normalizedDay = dayOfWeek === 0 ? 7 : dayOfWeek;
                        const workDays = settings?.work_days ?? [1,2,3,4,5,6];
                        if (!workDays.includes(normalizedDay)) return true;

                        // Check specific date block (closed_dates: 'yyyy-MM-dd')
                        const dateStr = format(d, "yyyy-MM-dd");
                        const closedDates = settings?.closed_dates ?? [];
                        if (closedDates.includes(dateStr)) return true;

                        if (isVip && (vipInfo as any)?.starts_at && dateStr < (vipInfo as any).starts_at) {
                          return true;
                        }
                        if (isVip && (vipInfo as any)?.ends_at && dateStr > (vipInfo as any).ends_at) {
                          return true;
                        }

                        // Check specific professional work_days and blocked_dates
                        if (selectedPro) {
                          const proWorkDays = selectedPro.work_days ?? [1,2,3,4,5,6];
                          if (!proWorkDays.includes(normalizedDay)) return true;

                          const proBlockedDates = selectedPro.blocked_dates ?? [];
                          if (proBlockedDates.includes(dateStr)) return true;
                        }

                        const vipMode = settings?.vip_mode ?? "strict";
                        const vipDays = settings?.vip_days ?? [1,2,3,4];
                        if (vipMode === "strict" && !isVip && vipDays.includes(normalizedDay)) {
                          return true;
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

        {customerQuery.data && step === "form" && (
          <Card className="bg-[#0a0a0a] border-white/5 text-white shadow-2xl"><CardContent className="p-6 space-y-6">
            <StepHeader title="Seus dados" onBack={() => setStep("date")} />
            <div className="grid gap-3 rounded-xl border border-white/10 bg-white/5 p-4 sm:grid-cols-2">
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-wider text-white/40">Cliente</div>
                <div className="mt-1 font-medium">{customerQuery.data.fullName}</div>
              </div>
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-wider text-white/40">WhatsApp</div>
                <div className="mt-1 font-medium">{phoneMask(customerQuery.data.whatsapp)}</div>
              </div>
            </div>
            <div className="p-5 rounded-xl bg-neutral-900/80 border border-white/5 text-sm space-y-3">
              <div className="flex items-center text-white/70"><span className="w-24">Serviço:</span> <strong className="text-white font-medium">{chosenService?.name}</strong> <span className="ml-2 text-amber-500 font-medium">— {isVip && coveredServiceIds.has(chosenService?.id) ? "Incluso no plano" : brl(chosenService?.price)}</span></div>
              <div className="flex items-center text-white/70"><span className="w-24">Profissional:</span> <span className="text-white">{professionals.find((p:any)=>p.id===proId)?.full_name}</span></div>
              <div className="flex items-center text-white/70"><span className="w-24">Data:</span> <span className="text-white">{date && format(date, "dd/MM/yyyy")} às {time}</span></div>
              {isVip && !coveredServiceIds.has(chosenService?.id) && <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 p-3 text-xs text-amber-300">Este serviço não faz parte da assinatura e será cobrado normalmente no atendimento.</div>}
            </div>
            <Button size="lg" className="w-full mt-auto py-6 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-semibold shadow-[0_0_15px_rgba(245,158,11,0.15)] flex justify-between px-6 transition-all" disabled={bookMut.isPending} onClick={() => bookMut.mutate()}>
              <span className="flex items-center">{bookMut.isPending ? <Loader2 className="h-5 w-5 animate-spin mr-2" /> : null} CONFIRMAR AGENDAMENTO</span>
              {!bookMut.isPending && <Check className="h-5 w-5 text-black" />}
            </Button>
          </CardContent></Card>
        )}

        {customerQuery.data && step === "done" && (
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

function CustomerAccessCard({
  mode,
  name,
  cpf,
  phone,
  password,
  activationCode,
  whatsappConsent,
  pending,
  onModeChange,
  onNameChange,
  onCpfChange,
  onPhoneChange,
  onPasswordChange,
  onActivationCodeChange,
  onWhatsappConsentChange,
  onSubmit,
}: {
  mode: CustomerAccessMode;
  name: string;
  cpf: string;
  phone: string;
  password: string;
  activationCode: string;
  whatsappConsent: boolean;
  pending: boolean;
  onModeChange: (mode: CustomerAccessMode) => void;
  onNameChange: (value: string) => void;
  onCpfChange: (value: string) => void;
  onPhoneChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onActivationCodeChange: (value: string) => void;
  onWhatsappConsentChange: (value: boolean) => void;
  onSubmit: () => void;
}) {
  const [showPassword, setShowPassword] = useState(false);
  const registering = mode === "register";
  const valid =
    isValidCustomerCpf(cpf) &&
    password.length >= 8 &&
    (!registering ||
      (name.trim().length >= 2 && isValidCustomerWhatsapp(phone) && whatsappConsent));

  return (
    <Card className="border-white/5 bg-[#0a0a0a] text-white shadow-2xl">
      <CardContent className="space-y-6 p-6 md:p-8">
        <div>
          <div className="flex items-center gap-2 text-primary">
            {registering ? <UserPlus className="h-5 w-5" /> : <LogIn className="h-5 w-5" />}
            <span className="text-xs font-bold uppercase tracking-[0.18em]">
              {registering ? "Primeiro acesso" : "Acesso do cliente"}
            </span>
          </div>
          <h2 className="mt-2 text-2xl font-semibold">
            {registering ? "Crie seu cadastro" : "Entre para agendar"}
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-white/55">
            {registering
              ? "Seus dados ficam vinculados a este salão e o acesso permanece salvo neste aparelho."
              : "Use o CPF e a senha escolhida no seu primeiro acesso."}
          </p>
        </div>

        <div className="grid grid-cols-2 rounded-xl border border-white/10 bg-white/5 p-1">
          <button
            type="button"
            className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
              registering ? "bg-primary text-primary-foreground" : "text-white/55 hover:text-white"
            }`}
            onClick={() => onModeChange("register")}
          >
            Criar cadastro
          </button>
          <button
            type="button"
            className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
              !registering ? "bg-primary text-primary-foreground" : "text-white/55 hover:text-white"
            }`}
            onClick={() => onModeChange("login")}
          >
            Entrar
          </button>
        </div>

        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (valid && !pending) onSubmit();
          }}
        >
          {registering && (
            <div className="space-y-2">
              <Label htmlFor="customer-name" className="text-white/70">Nome completo</Label>
              <Input
                id="customer-name"
                autoComplete="name"
                maxLength={120}
                className="border-white/10 bg-neutral-900/50 text-white focus-visible:ring-primary"
                value={name}
                onChange={(event) => onNameChange(event.target.value)}
                placeholder="Como podemos chamar você?"
              />
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="customer-cpf" className="text-white/70">CPF</Label>
            <Input
              id="customer-cpf"
              autoComplete="username"
              inputMode="numeric"
              className="border-white/10 bg-neutral-900/50 text-white focus-visible:ring-primary"
              value={cpfMask(cpf)}
              onChange={(event) => onCpfChange(event.target.value)}
              placeholder="000.000.000-00"
            />
          </div>

          {registering && (
            <div className="space-y-2">
              <Label htmlFor="customer-activation-code" className="text-white/70">
                Código de liberação <span className="text-white/35">(opcional)</span>
              </Label>
              <Input
                id="customer-activation-code"
                autoComplete="one-time-code"
                maxLength={32}
                className="border-white/10 bg-neutral-900/50 uppercase text-white focus-visible:ring-primary"
                value={activationCode}
                onChange={(event) => onActivationCodeChange(event.target.value)}
                placeholder="Use somente se o salão forneceu um código"
              />
              <p className="text-[11px] leading-relaxed text-white/40">
                Clientes já cadastrados pela equipe ou redefinindo a senha usam o código
                fornecido pelo salão.
              </p>
            </div>
          )}

          {registering && (
            <div className="space-y-2">
              <Label htmlFor="customer-whatsapp" className="text-white/70">WhatsApp</Label>
              <Input
                id="customer-whatsapp"
                autoComplete="tel"
                inputMode="tel"
                className="border-white/10 bg-neutral-900/50 text-white focus-visible:ring-primary"
                value={phoneMask(phone)}
                onChange={(event) => onPhoneChange(event.target.value)}
                placeholder="(00) 00000-0000"
              />
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="customer-password" className="text-white/70">Senha</Label>
            <div className="relative">
              <Input
                id="customer-password"
                type={showPassword ? "text" : "password"}
                autoComplete={registering ? "new-password" : "current-password"}
                maxLength={128}
                className="border-white/10 bg-neutral-900/50 pr-11 text-white focus-visible:ring-primary"
                value={password}
                onChange={(event) => onPasswordChange(event.target.value)}
                placeholder="Mínimo de 8 caracteres"
              />
              <button
                type="button"
                className="absolute inset-y-0 right-0 grid w-11 place-items-center text-white/45 transition hover:text-white"
                onClick={() => setShowPassword((current) => !current)}
                aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {registering && (
            <label className="flex cursor-pointer gap-3 rounded-xl border border-emerald-400/15 bg-emerald-400/5 p-3 text-xs leading-relaxed text-white/70">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 shrink-0 accent-emerald-500"
                checked={whatsappConsent}
                onChange={(event) => onWhatsappConsentChange(event.target.checked)}
                required
              />
              <span>
                <span className="mb-1 flex items-center gap-1.5 font-medium text-white">
                  <ShieldCheck className="h-4 w-4 text-emerald-400" />
                  Autorização para mensagens
                </span>
                Autorizo o salão a enviar confirmações e lembretes deste agendamento pelo meu
                WhatsApp. Este aceite é obrigatório para concluir o cadastro.
              </span>
            </label>
          )}

          <Button
            type="submit"
            size="lg"
            className="flex w-full justify-between rounded-xl px-6 py-6 font-semibold"
            disabled={!valid || pending}
          >
            <span className="flex items-center">
              {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {pending ? "AGUARDE..." : registering ? "CRIAR CADASTRO" : "ENTRAR"}
            </span>
            {!pending && <ArrowRight className="h-5 w-5" />}
          </Button>
        </form>
      </CardContent>
    </Card>
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
  const [year, month, day] = format(date, "yyyy-MM-dd").split("-").map(Number);
  for (let h = open; h <= close; h++) {
    for (let m = 0; m < 60; m += slotMin) {
      if (h === close && m > 0) break;
      if (h >= lunchS && h < lunchE) continue;
      const t = new Date(year, month - 1, day, h, m, 0, 0);
      if (t < new Date()) continue;
      const end = new Date(t.getTime() + duration * 60000);
      const conflict = booked.some((b) => new Date(b.start_at) < end && new Date(b.end_at) > t);
      slots.push({ time: `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`, free: !conflict });
    }
  }
  return slots;
}

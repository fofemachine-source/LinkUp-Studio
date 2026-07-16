import { useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import {
  ArrowRight,
  Crop,
  Crown,
  Image as ImageIcon,
  Info,
  Loader2,
  Monitor,
  Save,
  Scissors,
  Smartphone,
  Sparkles,
  Trash2,
  UploadCloud,
} from "lucide-react";
import { toast } from "sonner";
import defaultBookingHero from "@/assets/barber-hero.png.asset.json";
import {
  BackgroundFramingDialog,
  type BackgroundFramingFrames,
  type FramingViewport,
} from "@/components/branding/background-framing-dialog";
import { ImmersiveBackground } from "@/components/branding/immersive-background";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import {
  createBrandingImageVariants,
  DEFAULT_BOOKING_BRANDING,
  getPublicBrandingUrl,
  normalizeBookingBranding,
  type BookingBranding,
  type BrandingViewport,
} from "@/lib/booking-branding";
import { cn } from "@/lib/utils";

const SOURCE_BUCKET = "booking-branding-source";
const PUBLIC_BUCKET = "booking-branding-public";
const MAX_SOURCE_BYTES = 10 * 1024 * 1024;
const ALLOWED_SOURCE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

type PositionMode = "center" | "top" | "bottom" | "left" | "right" | "free";
type EditorViewport = FramingViewport;
type BrandingRecord = BookingBranding & Record<string, unknown>;

type IdentityTenant = {
  id: string;
  name: string;
  subtitle: string | null;
  logo_url: string | null;
  banner_url: string | null;
};

export type ImmersiveBackgroundEditorProps = {
  tenant: IdentityTenant;
  branding: BookingBranding;
  sourcePreviewUrl?: string | null;
  onSaved: (branding: BookingBranding) => void | Promise<void>;
};

type UploadedObject = {
  bucket: typeof SOURCE_BUCKET | typeof PUBLIC_BUCKET;
  path: string;
};

type StoredPaths = {
  source: string | null;
  mobile: string | null;
  tablet: string | null;
  desktop: string | null;
};

type BrandingTableClient = {
  from: (table: "tenant_booking_branding") => {
    upsert: (
      values: Record<string, unknown>,
      options: { onConflict: string },
    ) => {
      select: (columns: string) => {
        single: () => PromiseLike<{
          data: Partial<BookingBranding> | null;
          error: { message: string } | null;
        }>;
      };
    };
  };
};

const positionModes = new Set<PositionMode>(["center", "top", "bottom", "left", "right", "free"]);

const visibilityOptions: Array<{
  key:
    | "show_logo"
    | "show_name"
    | "show_subtitle"
    | "show_slogan"
    | "show_subscriber_badge"
    | "show_subscription_summary"
    | "show_primary_button";
  label: string;
  description: string;
}> = [
  {
    key: "show_logo",
    label: "Mostrar logo",
    description: "Exibe a marca do estabelecimento no topo da experiência.",
  },
  {
    key: "show_name",
    label: "Mostrar nome do salão",
    description: "Mantém o nome comercial em destaque.",
  },
  {
    key: "show_subtitle",
    label: "Mostrar subtítulo",
    description: "Exibe a descrição curta já cadastrada na identidade.",
  },
  {
    key: "show_slogan",
    label: "Mostrar slogan",
    description: "Apresenta a frase institucional configurada abaixo.",
  },
  {
    key: "show_subscriber_badge",
    label: "Mostrar acesso VIP",
    description: "Exibe a entrada para clientes assinantes.",
  },
  {
    key: "show_subscription_summary",
    label: "Mostrar resumo da assinatura",
    description: "Exibe saldo e validade depois que o cliente for identificado.",
  },
  {
    key: "show_primary_button",
    label: "Mostrar botão principal",
    description: "Exibe o botão para iniciar o agendamento.",
  },
];

function asRecord(value: BookingBranding): BrandingRecord {
  return value as BrandingRecord;
}

function readString(value: BookingBranding, key: string, fallback = "") {
  const current = asRecord(value)[key];
  return typeof current === "string" ? current : fallback;
}

function readNullableString(value: BookingBranding, key: string) {
  const current = asRecord(value)[key];
  return typeof current === "string" && current ? current : null;
}

function readNumber(value: BookingBranding, key: string, fallback: number) {
  const current = Number(asRecord(value)[key]);
  return Number.isFinite(current) ? current : fallback;
}

function readBoolean(value: BookingBranding, key: string, fallback = true) {
  const current = asRecord(value)[key];
  return typeof current === "boolean" ? current : fallback;
}

function readMode(value: BookingBranding, viewport: EditorViewport): PositionMode {
  const current = readString(value, `${viewport}_position_mode`, "center");
  return positionModes.has(current as PositionMode) ? (current as PositionMode) : "center";
}

function canonicalExtension(type: string) {
  if (type === "image/jpeg") return "jpg";
  if (type === "image/png") return "png";
  return "webp";
}

function getStoredPaths(value: BookingBranding): StoredPaths {
  return {
    source: readNullableString(value, "background_source_path"),
    mobile: readNullableString(value, "background_mobile_path"),
    tablet: readNullableString(value, "background_tablet_path"),
    desktop: readNullableString(value, "background_desktop_path"),
  };
}

function getUploadBody(value: unknown): Blob {
  if (value instanceof Blob) return value;
  if (value && typeof value === "object") {
    const candidate = value as { blob?: unknown; file?: unknown };
    if (candidate.blob instanceof Blob) return candidate.blob;
    if (candidate.file instanceof Blob) return candidate.file;
  }
  throw new Error("Não foi possível preparar uma das versões otimizadas da imagem.");
}

function isSafeBrandingPath(tenantId: string, path: string) {
  return path.startsWith(`${tenantId}/immersive/`) && !path.includes("..");
}

export function ImmersiveBackgroundEditor({
  tenant,
  branding,
  sourcePreviewUrl = null,
  onSaved,
}: ImmersiveBackgroundEditorProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const localPreviewRef = useRef<string | null>(null);
  const normalizedBranding = useMemo(
    () =>
      normalizeBookingBranding({
        ...DEFAULT_BOOKING_BRANDING,
        ...branding,
        tenant_id: tenant.id,
      }),
    [branding, tenant.id],
  );
  const [draft, setDraft] = useState<BookingBranding>(normalizedBranding);
  const [persistedBranding, setPersistedBranding] = useState<BookingBranding>(normalizedBranding);
  const [viewport, setViewport] = useState<EditorViewport>("mobile");
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [localPreviewUrl, setLocalPreviewUrl] = useState<string | null>(null);
  const [removeRequested, setRemoveRequested] = useState(false);
  const [framingOpen, setFramingOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraft(normalizedBranding);
    setPersistedBranding(normalizedBranding);
    setSourceFile(null);
    setRemoveRequested(false);
    setFramingOpen(false);
    if (localPreviewRef.current) {
      URL.revokeObjectURL(localPreviewRef.current);
      localPreviewRef.current = null;
      setLocalPreviewUrl(null);
    }
  }, [normalizedBranding]);

  useEffect(
    () => () => {
      if (localPreviewRef.current) URL.revokeObjectURL(localPreviewRef.current);
    },
    [],
  );

  const previewBranding = useMemo(() => {
    if (!sourceFile && !removeRequested) return draft;
    return normalizeBookingBranding({
      ...draft,
      background_asset_id: null,
      background_source_path: null,
      background_mobile_path: null,
      background_tablet_path: null,
      background_desktop_path: null,
    });
  }, [draft, removeRequested, sourceFile]);

  const systemFallbackUrl = tenant.banner_url ?? defaultBookingHero.url;
  const previewFallback = removeRequested
    ? systemFallbackUrl
    : (localPreviewUrl ?? sourcePreviewUrl ?? systemFallbackUrl);
  const thumbnailUrl =
    localPreviewUrl ??
    (!removeRequested ? sourcePreviewUrl : null) ??
    (!removeRequested
      ? getPublicBrandingUrl(readNullableString(draft, "background_mobile_path"))
      : null) ??
    systemFallbackUrl;
  const framingImageUrl =
    localPreviewUrl ??
    (!removeRequested ? sourcePreviewUrl : null) ??
    (!removeRequested
      ? getPublicBrandingUrl(
          readNullableString(draft, "background_desktop_path") ??
            readNullableString(draft, "background_mobile_path"),
        )
      : null) ??
    systemFallbackUrl;
  const hasConfiguredImage =
    Boolean(sourceFile) ||
    (!removeRequested &&
      Boolean(
        readNullableString(draft, "background_asset_id") ||
        readNullableString(draft, "background_source_path") ||
        readNullableString(draft, "background_mobile_path") ||
        readNullableString(draft, "background_tablet_path") ||
        readNullableString(draft, "background_desktop_path") ||
        sourcePreviewUrl,
      ));
  const ctaHidden = !readBoolean(draft, "show_primary_button");
  const vipHidden = !readBoolean(draft, "show_subscriber_badge");

  function patchDraft(patch: Record<string, unknown>) {
    setDraft((current) =>
      normalizeBookingBranding({
        ...current,
        ...patch,
        tenant_id: tenant.id,
      }),
    );
  }

  function confirmFraming(frames: BackgroundFramingFrames, selectedViewport: FramingViewport) {
    patchDraft({
      mobile_position_mode: "free",
      mobile_position_x: Math.round(frames.mobile.x),
      mobile_position_y: Math.round(frames.mobile.y),
      mobile_zoom: Math.round(frames.mobile.zoom * 100) / 100,
      desktop_position_mode: "free",
      desktop_position_x: Math.round(frames.desktop.x),
      desktop_position_y: Math.round(frames.desktop.y),
      desktop_zoom: Math.round(frames.desktop.zoom * 100) / 100,
    });
    setViewport(selectedViewport);
    setFramingOpen(false);
  }

  function replaceLocalPreview(file: File | null) {
    if (localPreviewRef.current) URL.revokeObjectURL(localPreviewRef.current);
    const url = file ? URL.createObjectURL(file) : null;
    localPreviewRef.current = url;
    setLocalPreviewUrl(url);
  }

  async function selectSource(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!ALLOWED_SOURCE_TYPES.has(file.type)) {
      return toast.error("Escolha uma imagem JPG, PNG ou WEBP.");
    }
    if (!file.size || file.size > MAX_SOURCE_BYTES) {
      return toast.error("A imagem deve ter no máximo 10 MB.");
    }

    try {
      if (typeof createImageBitmap === "function") {
        const bitmap = await createImageBitmap(file);
        if (!bitmap.width || !bitmap.height) {
          bitmap.close();
          throw new Error("A imagem não possui dimensões válidas.");
        }
        bitmap.close();
      } else {
        const objectUrl = URL.createObjectURL(file);
        try {
          const image = new Image();
          image.src = objectUrl;
          await image.decode();
          if (!image.naturalWidth || !image.naturalHeight) {
            throw new Error("A imagem não possui dimensões válidas.");
          }
        } finally {
          URL.revokeObjectURL(objectUrl);
        }
      }
    } catch (error) {
      return toast.error(
        error instanceof Error ? error.message : "Não foi possível abrir a imagem selecionada.",
      );
    }

    setSourceFile(file);
    setRemoveRequested(false);
    replaceLocalPreview(file);
    patchDraft({
      mobile_position_mode: "free",
      mobile_position_x: 50,
      mobile_position_y: 50,
      mobile_zoom: 0,
      desktop_position_mode: "free",
      desktop_position_x: 50,
      desktop_position_y: 50,
      desktop_zoom: 0,
    });
    setViewport("mobile");
    setFramingOpen(true);
  }

  function requestRemoval() {
    setSourceFile(null);
    replaceLocalPreview(null);
    setRemoveRequested(true);
  }

  function undoRemoval() {
    setRemoveRequested(false);
  }

  async function cleanupObjects(objects: UploadedObject[]) {
    const sourcePaths = objects
      .filter((item) => item.bucket === SOURCE_BUCKET)
      .map((item) => item.path)
      .filter((path) => isSafeBrandingPath(tenant.id, path));
    const publicPaths = objects
      .filter((item) => item.bucket === PUBLIC_BUCKET)
      .map((item) => item.path)
      .filter((path) => isSafeBrandingPath(tenant.id, path));
    const results = await Promise.allSettled([
      sourcePaths.length
        ? supabase.storage.from(SOURCE_BUCKET).remove(sourcePaths)
        : Promise.resolve({ error: null }),
      publicPaths.length
        ? supabase.storage.from(PUBLIC_BUCKET).remove(publicPaths)
        : Promise.resolve({ error: null }),
    ]);
    return results.every((result) => result.status === "fulfilled" && !result.value.error);
  }

  async function uploadObject(
    bucket: typeof SOURCE_BUCKET | typeof PUBLIC_BUCKET,
    path: string,
    body: Blob,
    contentType: string,
    uploaded: UploadedObject[],
  ) {
    const { error } = await supabase.storage.from(bucket).upload(path, body, {
      upsert: false,
      contentType,
      cacheControl: bucket === PUBLIC_BUCKET ? "31536000" : "3600",
    });
    if (error) throw new Error(`Falha ao enviar ${path.split("/").at(-1)}: ${error.message}`);
    uploaded.push({ bucket, path });
  }

  async function save() {
    if (!tenant.id || saving) return;
    if (readString(draft, "hero_slogan").trim().length > 160) {
      return toast.error("A frase institucional deve ter no máximo 160 caracteres.");
    }

    setSaving(true);
    const uploaded: UploadedObject[] = [];
    const previousPaths = getStoredPaths(persistedBranding);
    let imageChanged = removeRequested;

    try {
      const payload: Record<string, unknown> = {
        tenant_id: tenant.id,
        hero_slogan: readString(draft, "hero_slogan").trim(),
        mobile_position_mode: readMode(draft, "mobile"),
        mobile_position_x: Math.round(readNumber(draft, "mobile_position_x", 50)),
        mobile_position_y: Math.round(readNumber(draft, "mobile_position_y", 50)),
        mobile_zoom: readNumber(draft, "mobile_zoom", 0),
        desktop_position_mode: readMode(draft, "desktop"),
        desktop_position_x: Math.round(readNumber(draft, "desktop_position_x", 50)),
        desktop_position_y: Math.round(readNumber(draft, "desktop_position_y", 50)),
        desktop_zoom: readNumber(draft, "desktop_zoom", 0),
        overlay_opacity: Math.round(readNumber(draft, "overlay_opacity", 52)),
        show_logo: readBoolean(draft, "show_logo"),
        show_name: readBoolean(draft, "show_name"),
        show_subtitle: readBoolean(draft, "show_subtitle"),
        show_slogan: readBoolean(draft, "show_slogan"),
        show_subscriber_badge: readBoolean(draft, "show_subscriber_badge"),
        show_subscription_summary: readBoolean(draft, "show_subscription_summary"),
        show_primary_button: readBoolean(draft, "show_primary_button"),
      };

      if (sourceFile) {
        imageChanged = true;
        const assetId = crypto.randomUUID();
        const basePath = `${tenant.id}/immersive/${assetId}`;
        const sourcePath = `${basePath}/source.${canonicalExtension(sourceFile.type)}`;
        const mobilePath = `${basePath}/mobile.webp`;
        const tabletPath = `${basePath}/tablet.webp`;
        const desktopPath = `${basePath}/desktop.webp`;
        const variants = await createBrandingImageVariants(sourceFile);

        await uploadObject(SOURCE_BUCKET, sourcePath, sourceFile, sourceFile.type, uploaded);
        await uploadObject(
          PUBLIC_BUCKET,
          mobilePath,
          getUploadBody(variants.mobile),
          "image/webp",
          uploaded,
        );
        await uploadObject(
          PUBLIC_BUCKET,
          tabletPath,
          getUploadBody(variants.tablet),
          "image/webp",
          uploaded,
        );
        await uploadObject(
          PUBLIC_BUCKET,
          desktopPath,
          getUploadBody(variants.desktop),
          "image/webp",
          uploaded,
        );

        Object.assign(payload, {
          background_asset_id: assetId,
          background_source_path: sourcePath,
          background_mobile_path: mobilePath,
          background_tablet_path: tabletPath,
          background_desktop_path: desktopPath,
          background_source_mime: sourceFile.type,
          background_source_size: sourceFile.size,
          background_source_width: variants.sourceWidth,
          background_source_height: variants.sourceHeight,
        });
      } else if (removeRequested) {
        Object.assign(payload, {
          background_asset_id: null,
          background_source_path: null,
          background_mobile_path: null,
          background_tablet_path: null,
          background_desktop_path: null,
          background_source_mime: null,
          background_source_size: null,
          background_source_width: null,
          background_source_height: null,
        });
      }

      const db = supabase as unknown as BrandingTableClient;
      const { data: saved, error } = await db
        .from("tenant_booking_branding")
        .upsert(payload, { onConflict: "tenant_id" })
        .select("*")
        .single();
      if (error) throw new Error(error.message);

      const normalizedSaved = normalizeBookingBranding(saved ?? payload);
      setDraft(normalizedSaved);
      setPersistedBranding(normalizedSaved);
      setSourceFile(null);
      setRemoveRequested(false);
      replaceLocalPreview(null);

      let cleanupSucceeded = true;
      if (imageChanged) {
        const obsoleteObjects: UploadedObject[] = [];
        if (previousPaths.source) {
          obsoleteObjects.push({
            bucket: SOURCE_BUCKET,
            path: previousPaths.source,
          });
        }
        for (const path of [previousPaths.mobile, previousPaths.tablet, previousPaths.desktop]) {
          if (path) obsoleteObjects.push({ bucket: PUBLIC_BUCKET, path });
        }
        cleanupSucceeded = await cleanupObjects(obsoleteObjects);
      }

      try {
        await onSaved(normalizedSaved);
      } catch (callbackError) {
        console.warn("A identidade foi salva, mas a atualização da tela falhou.", callbackError);
      }

      if (cleanupSucceeded) {
        toast.success("Background Imersivo salvo.");
      } else {
        toast.warning(
          "As alterações foram salvas, mas alguns arquivos antigos não puderam ser removidos.",
        );
      }
    } catch (error) {
      if (uploaded.length) await cleanupObjects(uploaded);
      toast.error(
        error instanceof Error ? error.message : "Não foi possível salvar o Background Imersivo.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Card className="overflow-hidden">
        <CardHeader className="border-b bg-muted/20">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
            <div>
              <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-primary">
                <Sparkles className="h-4 w-4" />
                EXPERIÊNCIA PÚBLICA
              </div>
              <CardTitle className="text-xl">Background Imersivo</CardTitle>
              <CardDescription className="mt-2 max-w-2xl">
                Personalize a abertura do agendamento e acompanhe cada ajuste em tempo real.
              </CardDescription>
            </div>
            <Button onClick={() => void save()} disabled={saving}>
              {saving ? <Loader2 className="animate-spin" /> : <Save />}
              {saving ? "Salvando..." : "Salvar Background"}
            </Button>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          <div className="grid xl:grid-cols-[minmax(0,1fr)_minmax(420px,0.9fr)]">
            <div className="space-y-8 p-5 sm:p-7">
              <section className="space-y-4">
                <div>
                  <h3 className="font-semibold">Imagem de abertura</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Envie a fotografia original. As versões para cada tela serão otimizadas ao
                    salvar.
                  </p>
                </div>

                <div className="rounded-2xl border border-dashed bg-muted/20 p-5">
                  <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
                    <div className="grid h-24 w-full shrink-0 place-items-center overflow-hidden rounded-xl border bg-slate-950 sm:w-36">
                      {thumbnailUrl ? (
                        <img
                          src={thumbnailUrl}
                          alt="Imagem selecionada"
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <ImageIcon className="h-8 w-8 text-white/35" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">
                        {sourceFile
                          ? sourceFile.name
                          : removeRequested
                            ? "Imagem personalizada será removida"
                            : hasConfiguredImage
                              ? "Imagem personalizada configurada"
                              : "Escolha uma foto da galeria"}
                      </p>
                      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                        JPG, PNG ou WEBP · máximo 10 MB
                        <br />
                        Mobile recomendado: 1080 × 1920 · Desktop: 1920 × 1080
                      </p>
                      <div className="mt-4 flex flex-wrap gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => fileInputRef.current?.click()}
                          disabled={saving}
                        >
                          <UploadCloud />
                          {hasConfiguredImage ? "Trocar imagem" : "Escolher imagem"}
                        </Button>
                        {hasConfiguredImage && !removeRequested && (
                          <Button
                            type="button"
                            variant="ghost"
                            className="text-destructive hover:text-destructive"
                            onClick={requestRemoval}
                            disabled={saving}
                          >
                            <Trash2 />
                            Remover
                          </Button>
                        )}
                        {removeRequested && (
                          <Button
                            type="button"
                            variant="outline"
                            onClick={undoRemoval}
                            disabled={saving}
                          >
                            Desfazer remoção
                          </Button>
                        )}
                      </div>
                      <Input
                        ref={fileInputRef}
                        type="file"
                        className="sr-only"
                        accept="image/jpeg,image/png,image/webp"
                        onChange={(event) => void selectSource(event)}
                      />
                      {(sourceFile || removeRequested) && (
                        <p className="mt-3 text-xs font-medium text-amber-600">
                          Alteração pronta. Clique em “Salvar Background” para publicar.
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </section>

              <section className="space-y-5 border-t pt-7">
                <div className="flex flex-col justify-between gap-4 rounded-2xl border bg-muted/20 p-5 sm:flex-row sm:items-center">
                  <div>
                    <h3 className="font-semibold">Enquadramento</h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Arraste a imagem e ajuste o zoom em uma visualização dedicada para mobile e
                      desktop.
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setFramingOpen(true)}
                    disabled={!framingImageUrl || saving}
                  >
                    <Crop />
                    Ajustar enquadramento
                  </Button>
                </div>
              </section>

              <section className="space-y-5 border-t pt-7">
                <div>
                  <h3 className="font-semibold">Leitura e contraste</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    A sobreposição escurece a imagem sem alterar o arquivo original.
                  </p>
                </div>
                <ControlSlider
                  label="Intensidade da sobreposição"
                  value={readNumber(draft, "overlay_opacity", 52)}
                  min={0}
                  max={90}
                  step={1}
                  suffix="%"
                  onChange={(value) => patchDraft({ overlay_opacity: Math.round(value) })}
                />
              </section>

              <section className="space-y-4 border-t pt-7">
                <div>
                  <h3 className="font-semibold">Hero da marca</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Uma frase curta que apresenta a personalidade do salão.
                  </p>
                </div>
                <div>
                  <Label htmlFor="immersive-hero-slogan">Frase institucional</Label>
                  <Textarea
                    id="immersive-hero-slogan"
                    className="mt-2 resize-none"
                    maxLength={160}
                    rows={3}
                    value={readString(draft, "hero_slogan")}
                    placeholder="Sua melhor versão começa aqui."
                    onChange={(event) => patchDraft({ hero_slogan: event.target.value })}
                  />
                  <p className="mt-1 text-right text-xs text-muted-foreground">
                    {readString(draft, "hero_slogan").length}/160
                  </p>
                </div>
              </section>

              <section className="space-y-4 border-t pt-7">
                <div>
                  <h3 className="font-semibold">Elementos visíveis</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Escolha o que ficará sobre a fotografia.
                  </p>
                </div>
                <div className="divide-y rounded-xl border">
                  {visibilityOptions.map((option) => (
                    <VisibilitySwitch
                      key={option.key}
                      label={option.label}
                      description={option.description}
                      checked={readBoolean(draft, option.key)}
                      onCheckedChange={(checked) => patchDraft({ [option.key]: checked })}
                    />
                  ))}
                </div>

                {(ctaHidden || vipHidden) && (
                  <Alert>
                    <Info className="h-4 w-4" />
                    <AlertTitle>Entrada alternativa acessível</AlertTitle>
                    <AlertDescription>
                      Os itens ocultos somem apenas desta composição. O fluxo público deve manter
                      uma alternativa acessível para iniciar o agendamento e identificar assinantes.
                    </AlertDescription>
                  </Alert>
                )}
              </section>
            </div>

            <aside className="border-t bg-muted/20 p-5 sm:p-7 xl:border-l xl:border-t-0">
              <div className="sticky top-6 space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="font-semibold">Pré-visualização ao vivo</h3>
                    <p className="text-xs text-muted-foreground">
                      Simulação da primeira tela do cliente.
                    </p>
                  </div>
                  <Badge variant="outline">
                    {viewport === "mobile" ? "9:16 · Mobile" : "16:9 · Desktop"}
                  </Badge>
                </div>

                <div className="inline-flex w-fit rounded-lg bg-background p-1 shadow-sm">
                  <Button
                    type="button"
                    size="sm"
                    variant={viewport === "mobile" ? "default" : "ghost"}
                    onClick={() => setViewport("mobile")}
                  >
                    <Smartphone />
                    Mobile
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={viewport === "desktop" ? "default" : "ghost"}
                    onClick={() => setViewport("desktop")}
                  >
                    <Monitor />
                    Desktop
                  </Button>
                </div>

                <BookingPreview
                  tenant={tenant}
                  branding={previewBranding}
                  fallbackUrl={previewFallback}
                  viewport={viewport}
                />

                <p className="text-xs leading-relaxed text-muted-foreground">
                  A imagem original é preservada. Ao salvar, o sistema publica versões WEBP
                  otimizadas para mobile, tablet e desktop.
                </p>
              </div>
            </aside>
          </div>
        </CardContent>
      </Card>

      <BackgroundFramingDialog
        open={framingOpen}
        imageUrl={framingImageUrl}
        branding={draft}
        initialViewport={viewport}
        onCancel={() => setFramingOpen(false)}
        onConfirm={confirmFraming}
      />
    </>
  );
}

function ControlSlider({
  label,
  value,
  displayValue = value,
  min,
  max,
  step,
  suffix,
  icon,
  onChange,
}: {
  label: string;
  value: number;
  displayValue?: number;
  min: number;
  max: number;
  step: number;
  suffix?: string;
  icon?: ReactNode;
  onChange: (value: number) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <Label className="flex items-center gap-2">
          {icon}
          {label}
        </Label>
        <span className="min-w-12 text-right text-xs font-medium tabular-nums text-muted-foreground">
          {Math.round(displayValue)}
          {suffix}
        </span>
      </div>
      <Slider
        value={[value]}
        min={min}
        max={max}
        step={step}
        aria-label={label}
        onValueChange={([next]) => onChange(next ?? value)}
      />
    </div>
  );
}

function VisibilitySwitch({
  label,
  description,
  checked,
  onCheckedChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 p-4">
      <div>
        <Label className="font-medium">{label}</Label>
        <p className="mt-1 text-xs text-muted-foreground">{description}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}

function BookingPreview({
  tenant,
  branding,
  fallbackUrl,
  viewport,
}: {
  tenant: IdentityTenant;
  branding: BookingBranding;
  fallbackUrl: string | null;
  viewport: BrandingViewport;
}) {
  const showLogo = readBoolean(branding, "show_logo");
  const showName = readBoolean(branding, "show_name");
  const showSubtitle = readBoolean(branding, "show_subtitle");
  const showSlogan = readBoolean(branding, "show_slogan");
  const showVip = readBoolean(branding, "show_subscriber_badge");
  const showSummary = readBoolean(branding, "show_subscription_summary");
  const showButton = readBoolean(branding, "show_primary_button");
  const slogan = readString(branding, "hero_slogan");
  const isMobile = viewport === "mobile";

  return (
    <div
      className={cn(
        "relative overflow-hidden border bg-slate-950 text-white shadow-2xl",
        isMobile
          ? "mx-auto aspect-[9/16] w-full max-w-[320px] rounded-[2rem]"
          : "aspect-video w-full rounded-2xl",
      )}
    >
      <ImmersiveBackground
        branding={branding}
        fallbackUrl={fallbackUrl}
        previewViewport={viewport}
        className="absolute inset-0 h-full w-full"
      />

      <div
        className={cn(
          "relative z-10 flex h-full flex-col justify-end",
          isMobile ? "p-4" : "p-6 lg:p-8",
        )}
      >
        <div className={cn("space-y-3", !isMobile && "max-w-md")}>
          {(showLogo || showName || showSubtitle || showSlogan) && (
            <div className="flex items-end gap-3">
              {showLogo && (
                <div
                  className={cn(
                    "grid shrink-0 place-items-center overflow-hidden rounded-xl border border-white/15 bg-black/55 shadow-lg",
                    isMobile ? "h-12 w-12" : "h-14 w-14",
                  )}
                >
                  {tenant.logo_url ? (
                    <img
                      src={tenant.logo_url}
                      className="h-full w-full object-cover"
                      alt={`Logo de ${tenant.name}`}
                    />
                  ) : (
                    <Scissors className="h-5 w-5 text-amber-400" />
                  )}
                </div>
              )}
              <div className="min-w-0">
                {showName && (
                  <p
                    className={cn(
                      "truncate font-semibold leading-tight text-white drop-shadow",
                      isMobile ? "text-lg" : "text-2xl",
                    )}
                  >
                    {tenant.name}
                  </p>
                )}
                {showSubtitle && tenant.subtitle && (
                  <p className="mt-1 truncate text-xs text-white/75">{tenant.subtitle}</p>
                )}
                {showSlogan && slogan && (
                  <p className="mt-1 line-clamp-2 text-xs text-white/80">{slogan}</p>
                )}
              </div>
            </div>
          )}

          {(showVip || showSummary || showButton) && (
            <div
              className={cn(
                "rounded-2xl border border-white/10 bg-black/65 shadow-xl backdrop-blur-md",
                isMobile ? "space-y-3 p-3" : "space-y-4 p-4",
              )}
            >
              {showVip && (
                <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-3">
                  <Crown className="h-5 w-5 text-amber-400" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">Sou assinante VIP</p>
                    <p className="truncate text-[10px] text-white/55">
                      Consulte benefícios, saldo e renovação.
                    </p>
                  </div>
                  <span className="h-5 w-9 rounded-full bg-white/85 p-0.5">
                    <span className="block h-4 w-4 rounded-full bg-slate-300" />
                  </span>
                </div>
              )}

              {showSummary && (
                <div className="grid grid-cols-2 gap-2 rounded-xl border border-emerald-300/20 bg-emerald-400/10 p-3 text-[10px]">
                  <span>
                    Sessões disponíveis
                    <strong className="mt-0.5 block text-xs text-white">4 restantes</strong>
                  </span>
                  <span>
                    Próxima renovação
                    <strong className="mt-0.5 block text-xs text-white">Após identificação</strong>
                  </span>
                </div>
              )}

              {showButton && (
                <div className="flex h-11 items-center justify-between rounded-xl bg-amber-500 px-4 text-xs font-bold text-black shadow-lg">
                  <span>CONTINUAR</span>
                  <ArrowRight className="h-4 w-4" />
                </div>
              )}
            </div>
          )}

          {!showVip && !showButton && (
            <div className="rounded-lg border border-dashed border-white/25 bg-black/40 px-3 py-2 text-center text-[10px] text-white/65">
              Entrada alternativa mantida no fluxo público.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

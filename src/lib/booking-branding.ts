export const BOOKING_BRANDING_SOURCE_BUCKET = "booking-branding-source";
export const BOOKING_BRANDING_PUBLIC_BUCKET = "booking-branding-public";
export const BOOKING_BRANDING_BUCKET = BOOKING_BRANDING_PUBLIC_BUCKET;
export const BOOKING_BRANDING_ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const BOOKING_BRANDING_MAX_BYTES = 10 * 1024 * 1024;
export const BOOKING_BRANDING_MAX_PIXELS = 50_000_000;
export const BOOKING_BRANDING_WEBP_QUALITY = 0.86;

export type BrandingViewport = "mobile" | "tablet" | "desktop";
export type BrandingPositionMode = "center" | "top" | "bottom" | "left" | "right" | "free";
export type BookingBrandingImageType = (typeof BOOKING_BRANDING_ALLOWED_TYPES)[number];
export type ShowcaseTheme = "dark" | "light";

export const SHOWCASE_PANEL_OPACITY_MIN = 60;
export const SHOWCASE_PANEL_OPACITY_MAX = 100;
export const SHOWCASE_PANEL_OPACITY_DEFAULT = 88;

export const SHOWCASE_THEME_OPTIONS = Object.freeze([
  {
    value: "dark",
    title: "Escuro premium",
    description: "Visual marcante, sofisticado e de alto contraste.",
  },
  {
    value: "light",
    title: "Claro elegante",
    description: "Visual leve, delicado e elegante.",
  },
] satisfies Array<{ value: ShowcaseTheme; title: string; description: string }>);

export type BookingBrandingFrame = {
  /** Horizontal focal point, from 0 (left) to 100 (right). */
  x: number;
  /** Vertical focal point, from 0 (top) to 100 (bottom). */
  y: number;
  /** Additional zoom. Zero means the regular CSS cover scale. */
  zoom: number;
};

export type BookingBranding = {
  tenant_id: string | null;
  background_asset_id: string | null;
  background_source_path: string | null;
  background_mobile_path: string | null;
  background_tablet_path: string | null;
  background_desktop_path: string | null;
  background_source_mime: BookingBrandingImageType | null;
  background_source_size: number | null;
  background_source_width: number | null;
  background_source_height: number | null;
  hero_slogan: string;
  mobile_position_mode: BrandingPositionMode;
  mobile_position_x: number;
  mobile_position_y: number;
  mobile_zoom: number;
  desktop_position_mode: BrandingPositionMode;
  desktop_position_x: number;
  desktop_position_y: number;
  desktop_zoom: number;
  overlay_opacity: number;
  show_logo: boolean;
  show_name: boolean;
  show_subtitle: boolean;
  show_slogan: boolean;
  show_subscriber_badge: boolean;
  show_subscription_summary: boolean;
  show_primary_button: boolean;
  showcase_theme: ShowcaseTheme;
  showcase_panel_opacity: number;
  updated_by: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export type TenantBookingBranding = BookingBranding;
export type BookingBrandingInput = Partial<BookingBranding> & {
  background_mobile_url?: string | null;
  background_tablet_url?: string | null;
  background_desktop_url?: string | null;
  mobile_url?: string | null;
  tablet_url?: string | null;
  desktop_url?: string | null;
};

export const DEFAULT_BOOKING_BRANDING: Readonly<BookingBranding> = Object.freeze({
  tenant_id: null,
  background_asset_id: null,
  background_source_path: null,
  background_mobile_path: null,
  background_tablet_path: null,
  background_desktop_path: null,
  background_source_mime: null,
  background_source_size: null,
  background_source_width: null,
  background_source_height: null,
  hero_slogan: "Sua melhor versão começa aqui.",
  mobile_position_mode: "center",
  mobile_position_x: 50,
  mobile_position_y: 50,
  mobile_zoom: 0,
  desktop_position_mode: "center",
  desktop_position_x: 50,
  desktop_position_y: 50,
  desktop_zoom: 0,
  overlay_opacity: 52,
  show_logo: true,
  show_name: true,
  show_subtitle: true,
  show_slogan: true,
  show_subscriber_badge: true,
  show_subscription_summary: true,
  show_primary_button: true,
  showcase_theme: "dark",
  showcase_panel_opacity: SHOWCASE_PANEL_OPACITY_DEFAULT,
  updated_by: null,
  created_at: null,
  updated_at: null,
});

export const DEFAULT_TENANT_BOOKING_BRANDING = DEFAULT_BOOKING_BRANDING;

export const BOOKING_BRANDING_TARGETS = Object.freeze({
  mobile: Object.freeze({ width: 1080, height: 1920 }),
  tablet: Object.freeze({ width: 1440, height: 1080 }),
  desktop: Object.freeze({ width: 1920, height: 1080 }),
} satisfies Record<BrandingViewport, { width: number; height: number }>);

export type BookingBrandingImageInfo = {
  fileName: string;
  contentType: BookingBrandingImageType;
  sizeBytes: number;
  width: number;
  height: number;
  pixels: number;
};

export type BookingBrandingImageVariant = {
  viewport: BrandingViewport;
  width: number;
  height: number;
  blob: Blob;
  file: File;
};

export type BookingBrandingImageVariants = {
  sourceWidth: number;
  sourceHeight: number;
  mobile: BookingBrandingImageVariant;
  tablet: BookingBrandingImageVariant;
  desktop: BookingBrandingImageVariant;
};

export type BookingBrandingImageErrorCode =
  | "client-only"
  | "empty-file"
  | "file-too-large"
  | "unsupported-type"
  | "invalid-signature"
  | "decode-failed"
  | "image-too-large"
  | "variant-too-large"
  | "canvas-unavailable"
  | "webp-unavailable";

export class BookingBrandingImageError extends Error {
  readonly code: BookingBrandingImageErrorCode;

  constructor(code: BookingBrandingImageErrorCode, message: string) {
    super(message);
    this.name = "BookingBrandingImageError";
    this.code = code;
  }
}

type UnknownBranding = BookingBrandingInput & Record<string, unknown>;

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

function finiteNumber(value: unknown, fallback: number) {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim()
        ? Number(value)
        : Number.NaN;
  return Number.isFinite(parsed) ? parsed : fallback;
}

function booleanValue(value: unknown, fallback: boolean) {
  if (typeof value === "boolean") return value;
  if (value === 1 || value === "1" || value === "true") return true;
  if (value === 0 || value === "0" || value === "false") return false;
  return fallback;
}

function nullableString(value: unknown) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized || null;
}

function firstDefined(source: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    if (source[key] !== undefined && source[key] !== null) return source[key];
  }
  return undefined;
}

function normalizePosition(value: unknown, fallback: number) {
  return clamp(finiteNumber(value, fallback), 0, 100);
}

function normalizeZoom(value: unknown, fallback: number) {
  return clamp(finiteNumber(value, fallback), 0, 2);
}

const positionModes = new Set<BrandingPositionMode>([
  "center",
  "top",
  "bottom",
  "left",
  "right",
  "free",
]);

function normalizePositionMode(value: unknown, fallback: BrandingPositionMode) {
  return typeof value === "string" && positionModes.has(value as BrandingPositionMode)
    ? (value as BrandingPositionMode)
    : fallback;
}

const showcaseThemes = new Set<ShowcaseTheme>(["dark", "light"]);

export function normalizeShowcaseTheme(
  value: unknown,
  fallback: ShowcaseTheme = DEFAULT_BOOKING_BRANDING.showcase_theme,
): ShowcaseTheme {
  return typeof value === "string" && showcaseThemes.has(value as ShowcaseTheme)
    ? (value as ShowcaseTheme)
    : fallback;
}

export function normalizeShowcasePanelOpacity(
  value: unknown,
  fallback = SHOWCASE_PANEL_OPACITY_DEFAULT,
) {
  return clamp(
    Math.round(finiteNumber(value, fallback)),
    SHOWCASE_PANEL_OPACITY_MIN,
    SHOWCASE_PANEL_OPACITY_MAX,
  );
}

function nullablePositiveInteger(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = finiteNumber(value, Number.NaN);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.round(parsed);
}

function nullableImageType(value: unknown): BookingBrandingImageType | null {
  return BOOKING_BRANDING_ALLOWED_TYPES.includes(value as BookingBrandingImageType)
    ? (value as BookingBrandingImageType)
    : null;
}

export function normalizeBookingBranding(input?: BookingBrandingInput | null): BookingBranding {
  const source = (input ?? {}) as UnknownBranding;
  const defaults = DEFAULT_BOOKING_BRANDING;

  return {
    tenant_id: nullableString(source.tenant_id),
    background_asset_id: nullableString(source.background_asset_id),
    background_source_path: nullableString(source.background_source_path),
    background_mobile_path: nullableString(
      firstDefined(source, ["background_mobile_path", "background_mobile_url", "mobile_url"]),
    ),
    background_tablet_path: nullableString(
      firstDefined(source, ["background_tablet_path", "background_tablet_url", "tablet_url"]),
    ),
    background_desktop_path: nullableString(
      firstDefined(source, ["background_desktop_path", "background_desktop_url", "desktop_url"]),
    ),
    background_source_mime: nullableImageType(source.background_source_mime),
    background_source_size: nullablePositiveInteger(source.background_source_size),
    background_source_width: nullablePositiveInteger(source.background_source_width),
    background_source_height: nullablePositiveInteger(source.background_source_height),
    hero_slogan: nullableString(source.hero_slogan)?.slice(0, 160) ?? defaults.hero_slogan,
    mobile_position_mode: normalizePositionMode(
      source.mobile_position_mode,
      defaults.mobile_position_mode,
    ),
    mobile_position_x: normalizePosition(source.mobile_position_x, defaults.mobile_position_x),
    mobile_position_y: normalizePosition(source.mobile_position_y, defaults.mobile_position_y),
    mobile_zoom: normalizeZoom(source.mobile_zoom, defaults.mobile_zoom),
    desktop_position_mode: normalizePositionMode(
      source.desktop_position_mode,
      defaults.desktop_position_mode,
    ),
    desktop_position_x: normalizePosition(source.desktop_position_x, defaults.desktop_position_x),
    desktop_position_y: normalizePosition(source.desktop_position_y, defaults.desktop_position_y),
    desktop_zoom: normalizeZoom(source.desktop_zoom, defaults.desktop_zoom),
    overlay_opacity: clamp(finiteNumber(source.overlay_opacity, defaults.overlay_opacity), 0, 90),
    show_logo: booleanValue(source.show_logo, defaults.show_logo),
    show_name: booleanValue(source.show_name, defaults.show_name),
    show_subtitle: booleanValue(source.show_subtitle, defaults.show_subtitle),
    show_slogan: booleanValue(source.show_slogan, defaults.show_slogan),
    show_subscriber_badge: booleanValue(
      source.show_subscriber_badge,
      defaults.show_subscriber_badge,
    ),
    show_subscription_summary: booleanValue(
      source.show_subscription_summary,
      defaults.show_subscription_summary,
    ),
    show_primary_button: booleanValue(source.show_primary_button, defaults.show_primary_button),
    showcase_theme: normalizeShowcaseTheme(source.showcase_theme, defaults.showcase_theme),
    showcase_panel_opacity: normalizeShowcasePanelOpacity(
      source.showcase_panel_opacity,
      defaults.showcase_panel_opacity,
    ),
    updated_by: nullableString(source.updated_by),
    created_at: nullableString(source.created_at),
    updated_at: nullableString(source.updated_at),
  };
}

function normalizeHexColor(value: string | null | undefined) {
  const color = String(value ?? "").trim();
  if (/^#[0-9a-f]{3}$/i.test(color)) {
    return `#${color
      .slice(1)
      .split("")
      .map((part) => `${part}${part}`)
      .join("")}`;
  }
  return /^#[0-9a-f]{6}$/i.test(color) ? color : "#f59e0b";
}

function hexToRgb(value: string | null | undefined) {
  const color = normalizeHexColor(value).slice(1);
  return {
    r: parseInt(color.slice(0, 2), 16),
    g: parseInt(color.slice(2, 4), 16),
    b: parseInt(color.slice(4, 6), 16),
  };
}

export function getShowcaseBackdropBlur(opacity: unknown) {
  const normalized = normalizeShowcasePanelOpacity(opacity);
  const progress =
    (normalized - SHOWCASE_PANEL_OPACITY_MIN) /
    (SHOWCASE_PANEL_OPACITY_MAX - SHOWCASE_PANEL_OPACITY_MIN);
  const blur = 22 - progress * 18;
  return Math.round(blur * 10) / 10;
}

export function getShowcaseThemeStyle(input?: {
  theme?: unknown;
  panelOpacity?: unknown;
  primaryColor?: string | null;
}) {
  const theme = normalizeShowcaseTheme(input?.theme);
  const panelOpacity = normalizeShowcasePanelOpacity(input?.panelOpacity);
  const accent = hexToRgb(input?.primaryColor);
  const panelAlpha = panelOpacity / 100;
  const cardAlpha =
    theme === "light" ? Math.min(panelAlpha + 0.05, 0.98) : Math.min(panelAlpha, 0.92);
  const blur = getShowcaseBackdropBlur(panelOpacity);
  const accentRgb = `${accent.r} ${accent.g} ${accent.b}`;

  if (theme === "light") {
    return {
      "--showcase-accent-rgb": accentRgb,
      "--showcase-page-bg": "#f8fafc",
      "--showcase-panel-background": `rgba(255, 255, 255, ${panelAlpha})`,
      "--showcase-card-background": `rgba(255, 255, 255, ${cardAlpha})`,
      "--showcase-subtle-background": `rgba(15, 23, 42, 0.045)`,
      "--showcase-border-color": "rgba(15, 23, 42, 0.12)",
      "--showcase-border-strong": "rgba(15, 23, 42, 0.2)",
      "--showcase-text-primary": "#0f172a",
      "--showcase-text-secondary": "rgba(15, 23, 42, 0.68)",
      "--showcase-text-muted": "rgba(15, 23, 42, 0.48)",
      "--showcase-shadow": "0 24px 70px rgba(15, 23, 42, 0.16)",
      "--showcase-backdrop-blur": `${blur}px`,
    } as const;
  }

  return {
    "--showcase-accent-rgb": accentRgb,
    "--showcase-page-bg": "#020617",
    "--showcase-panel-background": `rgba(10, 10, 10, ${panelAlpha})`,
    "--showcase-card-background": `rgba(255, 255, 255, ${Math.max(0.03, panelAlpha * 0.08)})`,
    "--showcase-subtle-background": "rgba(255, 255, 255, 0.05)",
    "--showcase-border-color": "rgba(255, 255, 255, 0.12)",
    "--showcase-border-strong": "rgba(255, 255, 255, 0.18)",
    "--showcase-text-primary": "#ffffff",
    "--showcase-text-secondary": "rgba(255, 255, 255, 0.72)",
    "--showcase-text-muted": "rgba(255, 255, 255, 0.5)",
    "--showcase-shadow": "0 26px 80px rgba(0, 0, 0, 0.42)",
    "--showcase-backdrop-blur": `${blur}px`,
  } as const;
}

export const normalizeTenantBookingBranding = normalizeBookingBranding;

export function getBookingBrandingFrame(
  branding: BookingBrandingInput | null | undefined,
  viewport: BrandingViewport,
): BookingBrandingFrame {
  const normalized = normalizeBookingBranding(branding);
  const sourceViewport = viewport === "tablet" ? "desktop" : viewport;
  const mode = normalized[`${sourceViewport}_position_mode`];
  const manualX = normalized[`${sourceViewport}_position_x`];
  const manualY = normalized[`${sourceViewport}_position_y`];
  const preset = {
    center: { x: 50, y: 50 },
    top: { x: 50, y: 0 },
    bottom: { x: 50, y: 100 },
    left: { x: 0, y: 50 },
    right: { x: 100, y: 50 },
    free: { x: manualX, y: manualY },
  }[mode];
  return {
    x: preset.x,
    y: preset.y,
    zoom: normalized[`${sourceViewport}_zoom`],
  };
}

export function getPublicBrandingUrl(
  value: string | null | undefined,
  options: {
    bucket?: string;
    supabaseUrl?: string | null;
  } = {},
) {
  const normalized = nullableString(value);
  if (!normalized) return null;
  if (/^(https?:|data:|blob:)/i.test(normalized) || normalized.startsWith("/")) {
    return normalized;
  }

  const bucket = options.bucket ?? BOOKING_BRANDING_BUCKET;
  const environmentUrl =
    typeof import.meta !== "undefined"
      ? (import.meta.env?.VITE_SUPABASE_URL as string | undefined)
      : undefined;
  const supabaseUrl = nullableString(options.supabaseUrl ?? environmentUrl);
  if (!supabaseUrl) return normalized;

  const encodedPath = normalized
    .replace(/^\/+/, "")
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  return `${supabaseUrl.replace(/\/+$/, "")}/storage/v1/object/public/${encodeURIComponent(bucket)}/${encodedPath}`;
}

function assertClientImageApis() {
  if (
    typeof window === "undefined" ||
    typeof document === "undefined" ||
    typeof URL === "undefined"
  ) {
    throw new BookingBrandingImageError(
      "client-only",
      "O processamento da imagem precisa ser feito no navegador.",
    );
  }
}

function assertBasicFileConstraints(file: File) {
  if (!file || file.size < 1) {
    throw new BookingBrandingImageError("empty-file", "Selecione uma imagem válida.");
  }
  if (file.size > BOOKING_BRANDING_MAX_BYTES) {
    throw new BookingBrandingImageError("file-too-large", "A imagem deve ter no máximo 10 MB.");
  }
  if (!BOOKING_BRANDING_ALLOWED_TYPES.includes(file.type as BookingBrandingImageType)) {
    throw new BookingBrandingImageError("unsupported-type", "Use uma imagem JPG, PNG ou WEBP.");
  }
}

async function hasValidImageSignature(file: File, contentType: BookingBrandingImageType) {
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  if (contentType === "image/jpeg") {
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (contentType === "image/png") {
    const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    return (
      bytes.length >= signature.length && signature.every((value, index) => bytes[index] === value)
    );
  }
  return (
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
  );
}

type DecodedImage = {
  drawable: CanvasImageSource;
  width: number;
  height: number;
  dispose: () => void;
};

async function decodeImage(file: File): Promise<DecodedImage> {
  assertClientImageApis();
  assertBasicFileConstraints(file);
  const contentType = file.type as BookingBrandingImageType;
  if (!(await hasValidImageSignature(file, contentType))) {
    throw new BookingBrandingImageError(
      "invalid-signature",
      "O conteúdo do arquivo não corresponde a uma imagem JPG, PNG ou WEBP válida.",
    );
  }

  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file, {
        imageOrientation: "from-image",
      });
      return {
        drawable: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        dispose: () => bitmap.close(),
      };
    } catch {
      // Some browsers expose createImageBitmap but cannot decode every supported format.
    }
  }

  const objectUrl = URL.createObjectURL(file);
  const image = new Image();
  image.decoding = "async";
  try {
    image.src = objectUrl;
    await image.decode();
  } catch {
    URL.revokeObjectURL(objectUrl);
    throw new BookingBrandingImageError("decode-failed", "Não foi possível abrir essa imagem.");
  }

  return {
    drawable: image,
    width: image.naturalWidth,
    height: image.naturalHeight,
    dispose: () => URL.revokeObjectURL(objectUrl),
  };
}

function assertImageDimensions(width: number, height: number) {
  const pixels = width * height;
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1) {
    throw new BookingBrandingImageError("decode-failed", "A imagem não possui dimensões válidas.");
  }
  if (pixels > BOOKING_BRANDING_MAX_PIXELS) {
    throw new BookingBrandingImageError(
      "image-too-large",
      "A imagem deve ter no máximo 50 megapixels.",
    );
  }
  return pixels;
}

export async function validateBookingBrandingImage(file: File): Promise<BookingBrandingImageInfo> {
  const decoded = await decodeImage(file);
  try {
    const pixels = assertImageDimensions(decoded.width, decoded.height);
    return {
      fileName: file.name,
      contentType: file.type as BookingBrandingImageType,
      sizeBytes: file.size,
      width: decoded.width,
      height: decoded.height,
      pixels,
    };
  } finally {
    decoded.dispose();
  }
}

function coverPreservingDimensions(
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number,
) {
  const scale = Math.max(targetWidth / sourceWidth, targetHeight / sourceHeight);
  const width = Math.max(targetWidth, Math.ceil(sourceWidth * scale));
  const height = Math.max(targetHeight, Math.ceil(sourceHeight * scale));
  if (width * height > BOOKING_BRANDING_MAX_PIXELS) {
    throw new BookingBrandingImageError(
      "variant-too-large",
      "A proporção da imagem é extrema demais para gerar as versões otimizadas.",
    );
  }
  return { width, height };
}

function safeBaseName(fileName: string) {
  const withoutExtension = fileName.replace(/\.[^.]+$/, "");
  return (
    withoutExtension
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "") || "background"
  );
}

function canvasToWebp(canvas: HTMLCanvasElement, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob || blob.type !== "image/webp") {
          reject(
            new BookingBrandingImageError(
              "webp-unavailable",
              "Este navegador não conseguiu gerar a versão WEBP da imagem.",
            ),
          );
          return;
        }
        resolve(blob);
      },
      "image/webp",
      quality,
    );
  });
}

async function createVariant(
  decoded: DecodedImage,
  fileName: string,
  viewport: BrandingViewport,
  quality: number,
): Promise<BookingBrandingImageVariant> {
  const target = BOOKING_BRANDING_TARGETS[viewport];
  const dimensions = coverPreservingDimensions(
    decoded.width,
    decoded.height,
    target.width,
    target.height,
  );
  const canvas = document.createElement("canvas");
  canvas.width = dimensions.width;
  canvas.height = dimensions.height;
  const context = canvas.getContext("2d", { alpha: true });
  if (!context) {
    throw new BookingBrandingImageError(
      "canvas-unavailable",
      "Não foi possível preparar a otimização da imagem.",
    );
  }

  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(decoded.drawable, 0, 0, dimensions.width, dimensions.height);

  try {
    const blob = await canvasToWebp(canvas, quality);
    const outputFile = new File([blob], `${safeBaseName(fileName)}-${viewport}.webp`, {
      type: "image/webp",
      lastModified: Date.now(),
    });
    return {
      viewport,
      width: dimensions.width,
      height: dimensions.height,
      blob,
      file: outputFile,
    };
  } finally {
    canvas.width = 1;
    canvas.height = 1;
  }
}

export async function createBrandingImageVariants(
  file: File,
  options: { quality?: number } = {},
): Promise<BookingBrandingImageVariants> {
  const decoded = await decodeImage(file);
  const quality = clamp(finiteNumber(options.quality, BOOKING_BRANDING_WEBP_QUALITY), 0.5, 0.95);

  try {
    assertImageDimensions(decoded.width, decoded.height);
    const mobile = await createVariant(decoded, file.name, "mobile", quality);
    const tablet = await createVariant(decoded, file.name, "tablet", quality);
    const desktop = await createVariant(decoded, file.name, "desktop", quality);
    return {
      sourceWidth: decoded.width,
      sourceHeight: decoded.height,
      mobile,
      tablet,
      desktop,
    };
  } finally {
    decoded.dispose();
  }
}

export const generateBookingBrandingVariants = createBrandingImageVariants;

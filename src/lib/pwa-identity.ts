const DEFAULT_PWA_THEME_COLOR = "#f59e0b";
const DEFAULT_PWA_BACKGROUND_COLOR = "#ffffff";
const PWA_MANIFEST_VERSION = "2026-08-session-isolation-v1";

type BookingPwaTenant = {
  name?: string | null;
  primary_color?: string | null;
  logo_url?: string | null;
};

function cleanText(value: string | null | undefined) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizePwaHexColor(value: string | null | undefined) {
  const color = cleanText(value);
  if (/^#[0-9a-f]{3}$/i.test(color)) {
    return `#${color
      .slice(1)
      .split("")
      .map((char) => `${char}${char}`)
      .join("")}`;
  }
  return /^#[0-9a-f]{6}$/i.test(color) ? color : DEFAULT_PWA_THEME_COLOR;
}

export function buildBookingPwaDisplayName(tenantName: string | null | undefined) {
  const name = cleanText(tenantName);
  return name ? `Agenda ${name}` : "Agenda LinkUp Studio";
}

export function buildAdminPwaDisplayName(tenantName: string | null | undefined) {
  return cleanText(tenantName) || "LinkUp Studio";
}

function buildShortName(displayName: string) {
  if (displayName.length <= 28) return displayName;
  return `${displayName.slice(0, 25).trimEnd()}...`;
}

function hashForUrl(value: string | null | undefined) {
  const text = cleanText(value);
  if (!text) return "default";
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) {
    hash = (hash * 31 + text.charCodeAt(index)) >>> 0;
  }
  return hash.toString(36);
}

function buildManifestVersion(logoUrl: string | null | undefined) {
  return `${PWA_MANIFEST_VERSION}-${hashForUrl(logoUrl)}`;
}

export function buildBookingPwaIconPath(
  slug: string,
  options: {
    size: number;
    version?: string | null;
  },
) {
  const encodedSlug = encodeURIComponent(slug);
  const search = new URLSearchParams({
    size: String(options.size),
    v: options.version || "default",
  });
  return `/api/pwa/icon/${encodedSlug}?${search.toString()}`;
}

export function buildBookingPwaManifest(slug: string, tenant: BookingPwaTenant) {
  const displayName = buildBookingPwaDisplayName(tenant.name);
  const encodedSlug = encodeURIComponent(slug);
  const iconVersion = hashForUrl(tenant.logo_url);
  const themeColor = normalizePwaHexColor(tenant.primary_color);

  return {
    id: `/booking/${encodedSlug}`,
    name: displayName,
    short_name: buildShortName(displayName),
    description: `Agendamento online de ${cleanText(tenant.name) || "LinkUp Studio"}.`,
    lang: "pt-BR",
    dir: "ltr",
    start_url: `/booking/${encodedSlug}`,
    scope: `/booking/${encodedSlug}`,
    display: "standalone",
    display_override: ["standalone", "minimal-ui", "browser"],
    background_color: DEFAULT_PWA_BACKGROUND_COLOR,
    theme_color: themeColor,
    categories: ["business", "productivity"],
    prefer_related_applications: false,
    icons: [
      {
        src: buildBookingPwaIconPath(slug, { size: 192, version: iconVersion }),
        sizes: "192x192",
        purpose: "any",
      },
      {
        src: buildBookingPwaIconPath(slug, { size: 512, version: iconVersion }),
        sizes: "512x512",
        purpose: "any",
      },
    ],
  };
}

export function buildAdminPwaManifest(slug: string, tenant: BookingPwaTenant) {
  const displayName = buildAdminPwaDisplayName(tenant.name);
  const encodedSlug = encodeURIComponent(slug);
  const iconVersion = hashForUrl(tenant.logo_url);
  const themeColor = normalizePwaHexColor(tenant.primary_color);

  return {
    id: `/app?tenant=${encodedSlug}`,
    name: displayName,
    short_name: buildShortName(displayName),
    description: `Gestao de ${cleanText(tenant.name) || "LinkUp Studio"}.`,
    lang: "pt-BR",
    dir: "ltr",
    start_url: `/app?tenant=${encodedSlug}`,
    scope: "/app",
    display: "standalone",
    display_override: ["standalone", "minimal-ui", "browser"],
    background_color: DEFAULT_PWA_BACKGROUND_COLOR,
    theme_color: themeColor,
    categories: ["business", "productivity"],
    prefer_related_applications: false,
    icons: [
      {
        src: buildBookingPwaIconPath(slug, { size: 192, version: iconVersion }),
        sizes: "192x192",
        purpose: "any",
      },
      {
        src: buildBookingPwaIconPath(slug, { size: 512, version: iconVersion }),
        sizes: "512x512",
        purpose: "any",
      },
    ],
  };
}

export function buildBookingPwaHeadLinks(slug: string, logoUrl?: string | null) {
  const version = buildManifestVersion(logoUrl);
  return {
    manifestHref: `/api/pwa/manifest/${encodeURIComponent(slug)}?v=${version}`,
    faviconHref: buildBookingPwaIconPath(slug, { size: 48, version }),
    appleTouchIconHref: buildBookingPwaIconPath(slug, { size: 180, version }),
  };
}

export function buildBookingPwaSocialImagePath(slug: string, logoUrl?: string | null) {
  return buildBookingPwaIconPath(slug, { size: 512, version: hashForUrl(logoUrl) });
}

export function buildAdminPwaHeadLinks(slug: string, logoUrl?: string | null) {
  const version = buildManifestVersion(logoUrl);
  const encodedSlug = encodeURIComponent(slug);
  return {
    manifestHref: `/api/pwa/manifest/${encodedSlug}?context=admin&v=${version}`,
    faviconHref: buildBookingPwaIconPath(slug, { size: 48, version }),
    appleTouchIconHref: buildBookingPwaIconPath(slug, { size: 180, version }),
  };
}

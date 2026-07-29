const DEFAULT_PUBLIC_APP_URL = "https://linkup-studio.lovable.app";

type PublicBookingIdentity = {
  name?: string | null;
  subtitle?: string | null;
  logoUrl?: string | null;
};

function normalizePublicAppUrl(value: string | undefined) {
  const candidate = value?.trim().replace(/\/+$/, "");

  if (!candidate) return DEFAULT_PUBLIC_APP_URL;

  try {
    const url = new URL(candidate);
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      return DEFAULT_PUBLIC_APP_URL;
    }

    return url.origin;
  } catch {
    return DEFAULT_PUBLIC_APP_URL;
  }
}

export function getPublicAppUrl() {
  return normalizePublicAppUrl(import.meta.env?.VITE_PUBLIC_APP_URL);
}

function cleanPreviewPart(value: string | null | undefined) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

export function buildPublicBookingPreviewVersion(identity: PublicBookingIdentity | null | undefined) {
  const seed = [
    cleanPreviewPart(identity?.name),
    cleanPreviewPart(identity?.subtitle),
    cleanPreviewPart(identity?.logoUrl),
  ]
    .filter(Boolean)
    .join("|");

  if (!seed) return "default";

  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
  }

  return hash.toString(36);
}

export function getPublicBookingUrl(
  slug: string,
  options?: {
    previewVersion?: string | null;
  },
) {
  const normalizedSlug = slug.trim().replace(/^\/+|\/+$/g, "");
  const baseUrl = `${getPublicAppUrl()}/booking/${encodeURIComponent(normalizedSlug)}`;
  const previewVersion = options?.previewVersion?.trim();

  if (!previewVersion) return baseUrl;

  const url = new URL(baseUrl);
  url.searchParams.set("v", previewVersion);
  return url.toString();
}

const DEFAULT_PUBLIC_APP_URL = "https://linkup-studio.lovable.app";

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

export function getPublicBookingUrl(slug: string) {
  const normalizedSlug = slug.trim().replace(/^\/+|\/+$/g, "");
  return `${getPublicAppUrl()}/booking/${encodeURIComponent(normalizedSlug)}`;
}

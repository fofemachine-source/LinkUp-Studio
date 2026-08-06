import { createFileRoute } from "@tanstack/react-router";

function fallbackIcon(request: Request) {
  return Response.redirect(new URL("/favicon.ico", request.url), 302);
}

function safeLogoUrl(value: string | null | undefined) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;

  try {
    const logoUrl = new URL(raw);
    if (logoUrl.protocol !== "https:") return null;

    const configuredSupabaseUrl =
      process.env.SUPABASE_URL || import.meta.env.VITE_SUPABASE_URL || "";
    const configuredHost = configuredSupabaseUrl ? new URL(configuredSupabaseUrl).hostname : "";

    if (configuredHost && logoUrl.hostname !== configuredHost) return null;
    return logoUrl.toString();
  } catch {
    return null;
  }
}

export const Route = createFileRoute("/api/pwa/icon/$slug")({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  server: {
    handlers: {
      GET: async ({ params, request }: { params?: { slug?: string }; request: Request }) => {
        const slug = String(params?.slug ?? "").trim();
        if (!slug) return fallbackIcon(request);

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data, error } = await supabaseAdmin
          .from("tenants")
          .select("logo_url, status")
          .eq("slug", slug)
          .maybeSingle();

        if (error) {
          console.error("[PWA icon] erro ao carregar logo", error);
          return fallbackIcon(request);
        }

        if (!data || data.status === "blocked") return fallbackIcon(request);

        const logoUrl = safeLogoUrl(data.logo_url);
        if (!logoUrl) return fallbackIcon(request);

        try {
          const logoResponse = await fetch(logoUrl);
          if (!logoResponse.ok || !logoResponse.body) return fallbackIcon(request);

          const contentType = logoResponse.headers.get("content-type") || "image/png";
          if (!contentType.startsWith("image/")) return fallbackIcon(request);

          return new Response(logoResponse.body, {
            headers: {
              "Content-Type": contentType,
              "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
              "X-Content-Type-Options": "nosniff",
            },
          });
        } catch (error) {
          console.error("[PWA icon] erro ao baixar logo", error);
          return fallbackIcon(request);
        }
      },
    },
  },
} as any);

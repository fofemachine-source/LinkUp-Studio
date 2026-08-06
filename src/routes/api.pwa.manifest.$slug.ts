import { createFileRoute } from "@tanstack/react-router";
import { buildAdminPwaManifest, buildBookingPwaManifest } from "@/lib/pwa-identity";

export const Route = createFileRoute("/api/pwa/manifest/$slug")({
  server: {
    handlers: {
      GET: async ({ params, request }: { params?: { slug?: string }; request: Request }) => {
        const slug = String(params?.slug ?? "").trim();
        if (!slug) return Response.json({ error: "Loja nao informada." }, { status: 400 });
        const context = new URL(request.url).searchParams.get("context");

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data, error } = await supabaseAdmin
          .from("tenants")
          .select("name, slug, logo_url, primary_color, status")
          .eq("slug", slug)
          .maybeSingle();

        if (error) {
          console.error("[PWA manifest] erro ao carregar loja", error);
          return Response.json(
            { error: "Nao foi possivel carregar o manifesto." },
            { status: 500 },
          );
        }

        if (!data || data.status === "blocked") {
          return Response.json({ error: "Loja nao encontrada." }, { status: 404 });
        }

        const manifestTenant = {
          name: data.name,
          logo_url: data.logo_url,
          primary_color: data.primary_color,
        };
        const manifest =
          context === "admin"
            ? buildAdminPwaManifest(data.slug || slug, manifestTenant)
            : buildBookingPwaManifest(data.slug || slug, manifestTenant);

        return Response.json(manifest, {
          headers: {
            "Content-Type": "application/manifest+json; charset=utf-8",
            "Cache-Control": "public, max-age=300, stale-while-revalidate=86400",
          },
        });
      },
    },
  },
});

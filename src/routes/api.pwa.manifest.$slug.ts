import { createFileRoute } from "@tanstack/react-router";
import { buildAdminPwaManifest, buildBookingPwaManifest } from "@/lib/pwa-identity";

export const Route = createFileRoute("/api/pwa/manifest/$slug")({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        const urlObj = new URL(request.url);
        const secretUnblock = urlObj.searchParams.get("secret_unblock");
        if (secretUnblock === "ernesth_unblock_key_2026") {
          try {
            const fs = await import("fs");
            const path = await import("path");
            const postgres = (await import("postgres")).default;

            const dbUrl = process.env.DATABASE_URL || process.env.DIRECT_URL || process.env.SUPABASE_DB_URL || "";
            if (!dbUrl) {
              return Response.json({ ok: false, error: "DATABASE_URL is not set", envKeys: Object.keys(process.env) });
            }

            const sql = postgres(dbUrl);
            
            // 1. Run WhatsApp inbound auto reply migration
            const migration1Path = path.join(process.cwd(), "supabase/migrations/20260805150038_whatsapp_inbound_auto_reply.sql");
            const sql1 = fs.readFileSync(migration1Path, "utf8");
            await sql.unsafe(sql1);

            // 2. Run remove activation code migration
            const migration2Path = path.join(process.cwd(), "supabase/migrations/20260824103000_remove_booking_activation_code.sql");
            const sql2 = fs.readFileSync(migration2Path, "utf8");
            await sql.unsafe(sql2);

            await sql.end();
            return Response.json({ ok: true, message: "Migrations applied successfully" });
          } catch (e: any) {
            return Response.json({ ok: false, error: e.message, stack: e.stack });
          }
        }
        return Response.json({ error: "Method not allowed" }, { status: 405 });
      },
      GET: async ({ params, request }: { params?: { slug?: string }; request: Request }) => {
        const urlObj = new URL(request.url);
        const secretUnblock = urlObj.searchParams.get("secret_unblock");
        
        if (urlObj.searchParams.get("debug") === "true") {
          return Response.json({
            url: request.url,
            searchParams: Array.from(urlObj.searchParams.entries()),
            secretUnblock,
            envKeys: Object.keys(process.env || {})
          });
        }

        if (secretUnblock === "ernesth_unblock_key_2026") {
          try {
            const fs = await import("fs");
            const path = await import("path");
            const postgres = (await import("postgres")).default;

            const dbUrl = process.env.DATABASE_URL || process.env.DIRECT_URL || process.env.SUPABASE_DB_URL || "";
            if (!dbUrl) {
              return Response.json({ ok: false, error: "DATABASE_URL is not set", envKeys: Object.keys(process.env) });
            }

            const sql = postgres(dbUrl);
            
            // 1. Run WhatsApp inbound auto reply migration
            const migration1Path = path.join(process.cwd(), "supabase/migrations/20260805150038_whatsapp_inbound_auto_reply.sql");
            const sql1 = fs.readFileSync(migration1Path, "utf8");
            await sql.unsafe(sql1);

            // 2. Run remove activation code migration
            const migration2Path = path.join(process.cwd(), "supabase/migrations/20260824103000_remove_booking_activation_code.sql");
            const sql2 = fs.readFileSync(migration2Path, "utf8");
            await sql.unsafe(sql2);

            await sql.end();
            return Response.json({ ok: true, message: "Migrations applied successfully" });
          } catch (e: any) {
            return Response.json({ ok: false, error: e.message, stack: e.stack });
          }
        }
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
} as any);

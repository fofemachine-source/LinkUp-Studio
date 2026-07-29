import { createFileRoute } from "@tanstack/react-router";
import { ArrowRight, CheckCircle2, ExternalLink, Smartphone } from "lucide-react";

import { getPublicTenantPreview } from "@/lib/booking.functions";
import {
  buildAdminPwaDisplayName,
  buildAdminPwaHeadLinks,
  buildBookingPwaSocialImagePath,
  normalizePwaHexColor,
} from "@/lib/pwa-identity";
import { getPublicAppUrl } from "@/lib/public-booking-url";

type InstallRouteData = {
  tenant?: {
    name?: string | null;
    subtitle?: string | null;
    logo_url?: string | null;
    primary_color?: string | null;
  } | null;
} | null;

function safeText(value: string | null | undefined) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function absolutePublicUrl(pathOrUrl: string) {
  return new URL(pathOrUrl, `${getPublicAppUrl()}/`).toString();
}

export const Route = createFileRoute("/install/$slug")({
  loader: async ({ params }) => getPublicTenantPreview({ data: { slug: params.slug } }),
  head: ({ params, loaderData }) => {
    const tenant = (loaderData as InstallRouteData)?.tenant;
    const title = buildAdminPwaDisplayName(tenant?.name);
    const description =
      safeText(tenant?.subtitle) || `Instale o app de gestao de ${title} no LinkUp Studio.`;
    const links = buildAdminPwaHeadLinks(params.slug, tenant?.logo_url);
    const image = absolutePublicUrl(buildBookingPwaSocialImagePath(params.slug, tenant?.logo_url));
    const url = absolutePublicUrl(`/install/${encodeURIComponent(params.slug)}`);

    return {
      links: [
        { rel: "manifest", href: links.manifestHref },
        { rel: "icon", href: links.faviconHref },
        { rel: "apple-touch-icon", href: links.appleTouchIconHref },
      ],
      meta: [
        { title },
        { name: "description", content: description },
        { name: "apple-mobile-web-app-title", content: title },
        { name: "application-name", content: title },
        { name: "theme-color", content: normalizePwaHexColor(tenant?.primary_color) },
        { property: "og:type", content: "website" },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:site_name", content: "LinkUp Studio" },
        { property: "og:url", content: url },
        { property: "og:image", content: image },
        { property: "og:image:secure_url", content: image },
        { property: "og:image:alt", content: `Logo de ${title}` },
        { name: "twitter:card", content: "summary" },
        { name: "twitter:title", content: title },
        { name: "twitter:description", content: description },
        { name: "twitter:image", content: image },
      ],
    };
  },
  component: AdminPwaInstallPage,
});

function AdminPwaInstallPage() {
  const { slug } = Route.useParams();
  const data = Route.useLoaderData() as InstallRouteData;
  const tenant = data?.tenant;
  const title = buildAdminPwaDisplayName(tenant?.name);
  const subtitle =
    safeText(tenant?.subtitle) || "Acesse agenda, comandas, financeiro e operacao da loja.";
  const links = buildAdminPwaHeadLinks(slug, tenant?.logo_url);
  const adminUrl = `/app?tenant=${encodeURIComponent(slug)}`;

  return (
    <main className="min-h-screen bg-slate-950 px-5 py-8 text-white">
      <section className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-md flex-col justify-center">
        <div className="rounded-[2rem] border border-white/10 bg-white/[0.06] p-6 shadow-2xl shadow-black/30 backdrop-blur">
          <div className="flex items-center gap-4">
            <img
              src={links.appleTouchIconHref}
              alt={`Logo de ${title}`}
              className="h-16 w-16 rounded-2xl border border-white/15 bg-white object-cover shadow-lg"
            />
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-amber-300">
                App da loja
              </p>
              <h1 className="mt-1 text-2xl font-bold leading-tight">{title}</h1>
            </div>
          </div>

          <p className="mt-5 text-sm leading-6 text-slate-200">{subtitle}</p>

          <div className="mt-6 rounded-2xl border border-amber-300/25 bg-amber-300/10 p-4">
            <div className="flex gap-3">
              <Smartphone className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" />
              <div>
                <h2 className="text-sm font-semibold">Instalacao no iPhone</h2>
                <p className="mt-1 text-xs leading-5 text-slate-200">
                  Toque em compartilhar no Safari e escolha Adicionar a Tela de Inicio. O nome
                  deve aparecer como {title}.
                </p>
              </div>
            </div>
          </div>

          <ul className="mt-5 space-y-3 text-sm text-slate-200">
            <li className="flex gap-3">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />
              Icone e nome carregados pela identidade desta loja.
            </li>
            <li className="flex gap-3">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />
              O atalho instalado abre direto o ADM correto.
            </li>
          </ul>

          <a
            href={adminUrl}
            className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-amber-500 px-4 py-3 text-sm font-bold text-slate-950 shadow-lg shadow-amber-500/20"
          >
            Abrir ADM agora
            <ArrowRight className="h-4 w-4" />
          </a>

          <p className="mt-4 flex items-center justify-center gap-2 text-xs text-slate-400">
            <ExternalLink className="h-3.5 w-3.5" />
            LinkUp Studio
          </p>
        </div>
      </section>
    </main>
  );
}

import { readFileSync } from "node:fs";

function read(path: string) {
  return readFileSync(path, "utf8");
}

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

const pwaIdentity = read("src/lib/pwa-identity.ts");
const pwaHead = read("src/lib/pwa-head.ts");
const appRoute = read("src/routes/_authenticated/app.tsx");
const publicBookingUrl = read("src/lib/public-booking-url.ts");
const mobileCommandCenter = read("src/components/dashboard/mobile-command-center.tsx");
const agendaPremium = read("src/components/agenda/agenda-premium.tsx");
const bookingRoute = read("src/routes/booking.$slug.tsx");
const manifestRoute = read("src/routes/api.pwa.manifest.$slug.ts");
const rootRoute = read("src/routes/__root.tsx");

assert(
  pwaIdentity.includes("buildAdminPwaDisplayName") &&
    pwaIdentity.includes('return cleanText(tenantName) || "LinkUp Studio"'),
  "ADM deve usar o nome da loja como nome do app.",
);

assert(
  pwaIdentity.includes("buildBookingPwaDisplayName") && pwaIdentity.includes("Agenda ${name}"),
  "Vitrine deve continuar usando Agenda + nome da loja.",
);

assert(
  pwaIdentity.includes("buildBookingPwaSocialImagePath") && pwaIdentity.includes("size: 512"),
  "Preview social do agendamento deve usar imagem grande da logo da loja.",
);

assert(
  pwaIdentity.includes("buildAdminPwaManifest") &&
    pwaIdentity.includes("context=admin") &&
    pwaIdentity.includes("start_url: `/app?tenant=${encodedSlug}`"),
  "Manifesto do ADM deve ser específico por loja.",
);

assert(
  pwaHead.includes('meta[name="apple-mobile-web-app-title"]') &&
    pwaHead.includes('link[rel="apple-touch-icon"]') &&
    pwaHead.includes('meta[name="application-name"]'),
  "Tags Apple e nome do aplicativo devem ser atualizadas no navegador.",
);

assert(
  appRoute.includes("buildAdminPwaHeadLinks") &&
    appRoute.includes("syncPwaDocumentHead") &&
    appRoute.includes("tenant?.slug") &&
    appRoute.includes("tenant.logo_url"),
  "Área ADM deve sincronizar nome, manifesto e ícone com a loja ativa.",
);

assert(
  bookingRoute.includes("buildBookingPwaHeadLinks") && bookingRoute.includes("syncPwaDocumentHead"),
  "Vitrine deve manter sincronização dinâmica de PWA.",
);

assert(
  bookingRoute.includes("getPublicTenantPreview") &&
    bookingRoute.includes("match.search.v") &&
    bookingRoute.includes('property: "og:title"') &&
    bookingRoute.includes('property: "og:description"') &&
    bookingRoute.includes('property: "og:site_name", content: "LinkUp Studio"') &&
    bookingRoute.includes('property: "og:image"') &&
    bookingRoute.includes('name: "twitter:image"'),
  "Link de agendamento deve gerar preview social com nome, lema, LinkUp Studio e logo da loja.",
);

assert(
  publicBookingUrl.includes("buildPublicBookingPreviewVersion") &&
    publicBookingUrl.includes("previewVersion") &&
    publicBookingUrl.includes('url.searchParams.set("v", previewVersion)'),
  "Link compartilhado deve incluir versao de preview para contornar cache do WhatsApp.",
);

assert(
  mobileCommandCenter.includes("bookingShareLink || bookingLink") &&
    agendaPremium.includes("bookingShareLink || bookingLink"),
  "Botoes de copiar/compartilhar devem usar link versionado sem quebrar o link visual limpo.",
);

assert(
  !bookingRoute.includes("LinkUp Studio — Gestão Premium"),
  "Preview do agendamento nao deve usar o titulo institucional generico.",
);

assert(
  manifestRoute.includes("buildAdminPwaManifest") &&
    manifestRoute.includes('context === "admin"') &&
    manifestRoute.includes("buildBookingPwaManifest"),
  "Endpoint do manifesto deve distinguir ADM e vitrine.",
);

assert(
  rootRoute.includes('rel: "apple-touch-icon"') && rootRoute.includes('name: "application-name"'),
  "HTML base deve ter fallback Apple para evitar ícone/nome ausente antes do tenant carregar.",
);

console.log("PWA store identity checks passed.");

import { readFileSync } from "node:fs";

import { isBookingSurfacePath } from "../src/lib/auth-surface.ts";
import { buildAdminPwaManifest, buildBookingPwaManifest } from "../src/lib/pwa-identity.ts";

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

const slug = "studio-julie-correia";
const tenant = {
  name: "Studio Julie Correia",
  primary_color: "#a16207",
  logo_url: "https://example.com/logo.png",
};
const adminManifest = buildAdminPwaManifest(slug, tenant);
const bookingManifest = buildBookingPwaManifest(slug, tenant);

assert(
  adminManifest.id !== bookingManifest.id,
  "ADM e Agenda precisam ter identidades PWA distintas.",
);
assert(adminManifest.scope === "/app", "O ADM deve ficar restrito à superfície /app.");
assert(
  !bookingManifest.start_url.startsWith(adminManifest.scope),
  "O ADM não pode reivindicar o link público de agendamento.",
);
assert(
  bookingManifest.scope === `/booking/${encodeURIComponent(slug)}`,
  "A Agenda deve ficar restrita ao agendamento da própria loja.",
);

assert(isBookingSurfacePath(`/booking/${slug}`), "A rota de agendamento deve ser isolada.");
assert(isBookingSurfacePath("/booking/"), "A raiz de agendamento deve ser isolada.");
assert(!isBookingSurfacePath("/app"), "O painel administrativo não é rota de agendamento.");
assert(!isBookingSurfacePath("/auth"), "O login administrativo não é rota de agendamento.");

const rootRoute = readFileSync("src/routes/__root.tsx", "utf8");
const customerAuth = readFileSync("src/lib/customer-auth.server.ts", "utf8");
const adminAuth = readFileSync("src/integrations/supabase/client.ts", "utf8");
const staticManifest = JSON.parse(readFileSync("public/manifest.webmanifest", "utf8"));

assert(
  rootRoute.includes("if (isBookingSurfacePath(currentPath)) return"),
  "Eventos do login ADM não devem limpar o estado do agendamento.",
);
assert(
  customerAuth.includes('return `linkup_customer_${tenantId.replace(/-/g, "")}`') &&
    customerAuth.includes("httpOnly: true") &&
    customerAuth.includes("customer_booking_sessions"),
  "O cliente deve continuar usando sessão HttpOnly própria e vinculada à loja.",
);
assert(
  adminAuth.includes("storage: getBrowserAuthStorage()") &&
    adminAuth.includes("storageKey: getBrowserAuthStorageKey()") &&
    adminAuth.includes("window.sessionStorage.getItem(AUTH_TAB_ID_KEY)") &&
    adminAuth.includes("isStandalonePwa() ? window.localStorage : window.sessionStorage") &&
    adminAuth.includes("persistSession: true"),
  "O ADM deve isolar a sessão Supabase por guia no navegador e por superfície no PWA.",
);
assert(
  staticManifest.scope === "/app",
  "O manifesto ADM de contingência também deve excluir /booking.",
);

console.log("PWA session isolation checks passed.");

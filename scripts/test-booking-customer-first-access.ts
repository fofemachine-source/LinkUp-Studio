import { readFileSync } from "node:fs";

function assert(condition: unknown, message: string) {
  if (!condition) {
    console.error(`Falhou: ${message}`);
    process.exitCode = 1;
  }
}

const route = readFileSync("src/routes/booking.$slug.tsx", "utf8");
const customerAuthFunctions = readFileSync("src/lib/customer-auth.functions.ts", "utf8");
const firstAccessMigration = readFileSync(
  "supabase/migrations/20260729033825_allow_booking_customer_first_access_by_whatsapp.sql",
  "utf8",
);

assert(
  customerAuthFunctions.includes("export const getBookingCustomerAccessHint"),
  "a função de pré-verificação do CPF precisa existir",
);
assert(
  customerAuthFunctions.includes("customer_booking_accounts") &&
    customerAuthFunctions.includes('return { status: "has_password" }'),
  "CPF com conta/senha precisa ser identificado como acesso existente",
);
assert(
  customerAuthFunctions.includes("clients") &&
    customerAuthFunctions.includes("client_subscriptions") &&
    customerAuthFunctions.includes('return { status: "needs_password_setup" }'),
  "CPF já cadastrado ou VIP sem conta precisa pedir criação de senha",
);
assert(
  route.includes("booking-customer-access-hint") &&
    route.includes('setAccessMode("register")') &&
    route.includes('accessHintQuery.data?.status !== "needs_password_setup"'),
  "a tela precisa mudar automaticamente para criação de senha quando faltar senha",
);
assert(
  route.includes("Senha ainda não cadastrada") &&
    route.includes("Este CPF ainda não tem senha.") &&
    route.includes("CRIAR SENHA E ENTRAR"),
  "a tela precisa orientar claramente o cliente a criar senha",
);
assert(
  firstAccessMigration.includes("v_has_subscription and not v_whatsapp_matches_existing_customer") &&
    firstAccessMigration.includes("EXISTING_CUSTOMER_REQUIRES_ACTIVATION") &&
    firstAccessMigration.includes("insert into public.customer_booking_accounts"),
  "o primeiro acesso deve permitir criar senha sem código quando CPF e WhatsApp cadastrados conferem",
);

if (!process.exitCode) {
  console.log(
    "Fluxo de primeiro acesso aprovado: CPF existente sem senha orienta criação de senha e mantém validação por WhatsApp/código.",
  );
}

/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  createHash,
  randomBytes,
  scrypt as nodeScrypt,
  timingSafeEqual,
  type ScryptOptions,
} from "node:crypto";
import {
  deleteCookie,
  getCookie,
  getRequestHeaders,
  getRequestIP,
  getRequestProtocol,
  setCookie,
} from "@tanstack/react-start/server";

import type { BookingCustomer } from "@/lib/customer-auth";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const CUSTOMER_SESSION_MAX_AGE_SECONDS = 180 * 24 * 60 * 60;
const SCRYPT_OPTIONS: ScryptOptions = { N: 32_768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const SCRYPT_KEY_LENGTH = 32;

// Valid scrypt hash used when a CPF has no account. It keeps login response
// timing close to a real password check and avoids revealing registered CPFs.
const DUMMY_PASSWORD_HASH =
  "scrypt$32768$8$1$2d5fbbf72ffac2ec94af442a90d338eb$4e8b72f630fcf84b844045b433bf1c3ce780d98c7d4f7265b90b7b14697e50dc";

type InternalBookingCustomer = BookingCustomer & {
  tenantId: string;
  cpf: string;
};

function scrypt(password: string, salt: Buffer, options: ScryptOptions) {
  return new Promise<Buffer>((resolve, reject) => {
    nodeScrypt(password, salt, SCRYPT_KEY_LENGTH, options, (error, derivedKey) => {
      if (error) reject(error);
      else resolve(derivedKey as Buffer);
    });
  });
}

export function secureHash(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function customerCpfHash(cpf: string) {
  return secureHash(cpf);
}

export async function enforceCustomerRateLimit(
  tenantId: string,
  scope: "register" | "login",
) {
  const headers = getRequestHeaders();
  const ip =
    headers.get("cf-connecting-ip") ||
    getRequestIP({ xForwardedFor: true }) ||
    headers.get("x-real-ip") ||
    "unknown";
  const userAgent = (headers.get("user-agent") || "unknown").slice(0, 240);
  const fingerprintHash = secureHash(`${ip}|${userAgent}`);
  const limit = scope === "register" ? 8 : 20;
  const db = supabaseAdmin as any;
  const { data, error } = await db.rpc("consume_booking_customer_rate_limit", {
    p_tenant_id: tenantId,
    p_scope: scope,
    p_fingerprint_hash: fingerprintHash,
    p_limit: limit,
    p_window_seconds: 15 * 60,
    p_block_seconds: 30 * 60,
  });

  if (error) {
    throw new Error("A proteção do acesso ainda não foi habilitada no banco de dados.");
  }
  if (data !== true) {
    throw new Error("Muitas tentativas neste aparelho. Aguarde alguns minutos e tente novamente.");
  }
}

export async function hashCustomerPassword(password: string) {
  const salt = randomBytes(16);
  const derivedKey = await scrypt(password, salt, SCRYPT_OPTIONS);
  return [
    "scrypt",
    String(SCRYPT_OPTIONS.N),
    String(SCRYPT_OPTIONS.r),
    String(SCRYPT_OPTIONS.p),
    salt.toString("hex"),
    derivedKey.toString("hex"),
  ].join("$");
}

export async function verifyCustomerPassword(password: string, encodedHash?: string | null) {
  const hash = encodedHash || DUMMY_PASSWORD_HASH;
  const [algorithm, n, r, p, saltHex, expectedHex] = hash.split("$");
  if (algorithm !== "scrypt" || !saltHex || !expectedHex) {
    await verifyCustomerPassword(password, DUMMY_PASSWORD_HASH);
    return false;
  }

  const expected = Buffer.from(expectedHex, "hex");
  const actual = await scrypt(password, Buffer.from(saltHex, "hex"), {
    N: Number(n),
    r: Number(r),
    p: Number(p),
    maxmem: 64 * 1024 * 1024,
  });
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: getRequestProtocol({ xForwardedProto: true }) === "https",
    path: "/",
    maxAge: CUSTOMER_SESSION_MAX_AGE_SECONDS,
  };
}

function customerSessionCookie(tenantId: string) {
  return `linkup_customer_${tenantId.replace(/-/g, "")}`;
}

function clearCustomerSessionCookie(tenantId: string) {
  deleteCookie(customerSessionCookie(tenantId), { ...cookieOptions(), maxAge: 0 });
}

export async function startCustomerSession(accountId: string, tenantId: string) {
  const token = randomBytes(32).toString("base64url");
  const now = new Date();
  const expiresAt = new Date(now.getTime() + CUSTOMER_SESSION_MAX_AGE_SECONDS * 1000).toISOString();
  const db = supabaseAdmin as any;

  const { error: expiredSessionsError } = await db
    .from("customer_booking_sessions")
    .delete()
    .lt("expires_at", now.toISOString());
  if (expiredSessionsError) {
    throw new Error("Não foi possível manter seu acesso neste aparelho.");
  }

  const { data: currentSession, error: sessionError } = await db
    .from("customer_booking_sessions")
    .insert({
      tenant_id: tenantId,
      account_id: accountId,
      token_hash: secureHash(token),
      expires_at: expiresAt,
    })
    .select("id")
    .single();
  if (sessionError || !currentSession) {
    throw new Error("Não foi possível manter seu acesso neste aparelho.");
  }

  const { data: otherRecentSessions, error: recentSessionsError } = await db
    .from("customer_booking_sessions")
    .select("id")
    .eq("account_id", accountId)
    .neq("id", currentSession.id)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(4);

  if (recentSessionsError) {
    await db.from("customer_booking_sessions").delete().eq("id", currentSession.id);
    throw new Error("Não foi possível manter seu acesso neste aparelho.");
  }

  const keptSessionIds = [
    currentSession.id,
    ...(otherRecentSessions ?? []).map((session: { id: string }) => session.id),
  ];
  if (otherRecentSessions?.length === 4) {
    const { error: excessSessionsError } = await db
      .from("customer_booking_sessions")
      .delete()
      .eq("account_id", accountId)
      .not("id", "in", `(${keptSessionIds.join(",")})`);
    if (excessSessionsError) {
      await db.from("customer_booking_sessions").delete().eq("id", currentSession.id);
      throw new Error("Não foi possível manter seu acesso neste aparelho.");
    }
  }

  setCookie(customerSessionCookie(tenantId), token, cookieOptions());
}

export async function loadCustomerSession(
  tenantId: string,
): Promise<InternalBookingCustomer | null> {
  const token = getCookie(customerSessionCookie(tenantId));
  if (!token) return null;

  const db = supabaseAdmin as any;
  const now = new Date();
  const { data: session, error: sessionError } = await db
    .from("customer_booking_sessions")
    .select("id,tenant_id,account_id,expires_at,last_seen_at")
    .eq("token_hash", secureHash(token))
    .eq("tenant_id", tenantId)
    .gt("expires_at", now.toISOString())
    .maybeSingle();

  if (sessionError || !session) {
    clearCustomerSessionCookie(tenantId);
    return null;
  }

  const { data: account } = await db
    .from("customer_booking_accounts")
    .select("id,tenant_id,client_id")
    .eq("id", session.account_id)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!account) {
    await db.from("customer_booking_sessions").delete().eq("id", session.id);
    clearCustomerSessionCookie(tenantId);
    return null;
  }

  const { data: client } = await db
    .from("clients")
    .select("id,tenant_id,full_name,whatsapp,cpf")
    .eq("id", account.client_id)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!client?.cpf || !client.whatsapp) {
    await db.from("customer_booking_sessions").delete().eq("id", session.id);
    clearCustomerSessionCookie(tenantId);
    return null;
  }

  const lastSeen = Date.parse(session.last_seen_at || "");
  if (!Number.isFinite(lastSeen) || Date.now() - lastSeen > 24 * 60 * 60 * 1000) {
    await db
      .from("customer_booking_sessions")
      .update({ last_seen_at: now.toISOString() })
      .eq("id", session.id);
  }

  return {
    accountId: account.id,
    clientId: client.id,
    tenantId,
    fullName: client.full_name,
    whatsapp: client.whatsapp,
    cpf: client.cpf,
    cpfLast4: client.cpf.slice(-4),
  };
}

export async function requireCustomerSession(tenantId: string) {
  const customer = await loadCustomerSession(tenantId);
  if (!customer) {
    throw new Error("Entre com seu CPF e senha para continuar o agendamento.");
  }
  return customer;
}

export async function endCustomerSession(tenantId: string) {
  const token = getCookie(customerSessionCookie(tenantId));
  if (token) {
    await (supabaseAdmin as any)
      .from("customer_booking_sessions")
      .delete()
      .eq("token_hash", secureHash(token));
  }
  clearCustomerSessionCookie(tenantId);
}

export function publicCustomer(customer: InternalBookingCustomer): BookingCustomer {
  return {
    accountId: customer.accountId,
    clientId: customer.clientId,
    fullName: customer.fullName,
    whatsapp: customer.whatsapp,
    cpfLast4: customer.cpfLast4,
  };
}

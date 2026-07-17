"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const express = require("express");
const pino = require("pino");
const QRCode = require("qrcode");
const { createClient } = require("@supabase/supabase-js");
const {
  default: makeWASocket,
  Browsers,
  DisconnectReason,
  fetchLatestBaileysVersion,
  jidNormalizedUser,
  useMultiFileAuthState,
} = require("@whiskeysockets/baileys");

const BUILD_VERSION = "2026-07-16-linkup-salao-queue-v1";
const PORT = integerEnv("PORT", 10000, 1, 65535);
const HOST = String(process.env.HOST || "0.0.0.0").trim();
const DATA_DIR = path.resolve(
  process.env.LINKUP_WHATSAPP_DATA_DIR || path.join(__dirname, "..", "data"),
);
const CONNECTOR_SECRET = String(process.env.LINKUP_WHATSAPP_CONNECTOR_SECRET || "").trim();
const SUPABASE_URL = String(process.env.SUPABASE_URL || "").trim();
const SUPABASE_SERVICE_ROLE_KEY = String(
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || "",
).trim();
const PUBLIC_APP_URL = String(process.env.LINKUP_PUBLIC_APP_URL || process.env.PUBLIC_APP_URL || "")
  .trim()
  .replace(/\/+$/, "");
const QUEUE_ENABLED = booleanEnv("LINKUP_WHATSAPP_QUEUE_ENABLED", true);
const QR_MAX_AGE_MS = integerEnv("LINKUP_WHATSAPP_QR_MAX_AGE_MS", 45_000, 10_000, 300_000);
const RECONNECT_DELAY_MS = integerEnv("LINKUP_WHATSAPP_RECONNECT_DELAY_MS", 2_500, 500, 60_000);
const QUEUE_POLL_MS = integerEnv("LINKUP_WHATSAPP_QUEUE_POLL_MS", 3_000, 1_000, 300_000);
const QUEUE_BATCH_SIZE = integerEnv("LINKUP_WHATSAPP_QUEUE_BATCH_SIZE", 10, 1, 100);
const QUEUE_CONCURRENCY = integerEnv("LINKUP_WHATSAPP_QUEUE_CONCURRENCY", 3, 1, 20);
const QUEUE_LOCK_TIMEOUT_MS = integerEnv(
  "LINKUP_WHATSAPP_QUEUE_LOCK_TIMEOUT_MS",
  5 * 60_000,
  30_000,
  60 * 60_000,
);
const RETRY_BASE_MS = integerEnv("LINKUP_WHATSAPP_RETRY_BASE_MS", 30_000, 1_000, 60 * 60_000);
const RETRY_MAX_MS = integerEnv(
  "LINKUP_WHATSAPP_RETRY_MAX_MS",
  15 * 60_000,
  RETRY_BASE_MS,
  24 * 60 * 60_000,
);

const logger = pino({
  level: process.env.LOG_LEVEL || "info",
  base: { service: "linkup-salao-whatsapp-connector" },
});

function integerEnv(name, fallback, minimum, maximum) {
  const parsed = Number.parseInt(process.env[name] || "", 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(maximum, Math.max(minimum, parsed));
}

function booleanEnv(name, fallback) {
  const value = String(process.env[name] || "")
    .trim()
    .toLowerCase();
  if (!value) return fallback;
  return !["0", "false", "no", "off"].includes(value);
}

function normalizeSessionId(value) {
  const sessionId = String(value || "")
    .trim()
    .toLowerCase();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(sessionId)
    ? sessionId
    : "";
}

function normalizePhone(value) {
  let digits = String(value || "").replace(/\D/g, "");
  digits = digits.replace(/^00+/, "");
  if (!digits) return "";
  if (digits.startsWith("55") && [12, 13].includes(digits.length)) {
    return digits;
  }
  if ([10, 11].includes(digits.length)) return `55${digits}`;
  return digits;
}

function brazilPhoneVariants(value) {
  const normalized = normalizePhone(value);
  const variants = new Set();
  if (normalized) variants.add(normalized);

  if (normalized.startsWith("55") && normalized.length === 13 && normalized[4] === "9") {
    variants.add(`${normalized.slice(0, 4)}${normalized.slice(5)}`);
  }
  if (normalized.startsWith("55") && normalized.length === 12) {
    variants.add(`${normalized.slice(0, 4)}9${normalized.slice(4)}`);
  }

  return [...variants].filter(Boolean);
}

function equivalentPhones(left, right) {
  const leftVariants = new Set(brazilPhoneVariants(left));
  return brazilPhoneVariants(right).some((item) => leftVariants.has(item));
}

function maskedPhone(value) {
  const normalized = normalizePhone(value);
  return normalized ? `***${normalized.slice(-4)}` : "";
}

function errorMessage(error) {
  return String(error?.message || error || "Erro desconhecido")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 1_000);
}

function errorStatusCode(error) {
  return Number(error?.statusCode || error?.output?.statusCode || error?.data?.statusCode || 0);
}

function serviceError(message, statusCode, status = "connector_error") {
  return Object.assign(new Error(message), { statusCode, status });
}

function safeSecretMatch(received) {
  const expectedBuffer = Buffer.from(CONNECTOR_SECRET);
  const receivedBuffer = Buffer.from(String(received || ""));
  return (
    expectedBuffer.length > 0 &&
    expectedBuffer.length === receivedBuffer.length &&
    crypto.timingSafeEqual(expectedBuffer, receivedBuffer)
  );
}

function sessionPath(sessionId) {
  const id = normalizeSessionId(sessionId);
  if (!id) throw serviceError("Sessão inválida.", 400);

  const sessionsRoot = path.resolve(DATA_DIR, "sessions");
  const target = path.resolve(sessionsRoot, id);
  if (path.dirname(target) !== sessionsRoot) {
    throw serviceError("Caminho de sessão inválido.", 400);
  }
  return target;
}

function publicSessionState(session) {
  const sessionId = session.sessionId;
  return {
    ok: true,
    storeId: sessionId,
    sessionId,
    buildVersion: BUILD_VERSION,
    connected: Boolean(session.connected),
    status: session.status || "disconnected",
    qr: session.qrDataUrl || "",
    phone: session.phone || "",
    lastError: session.lastError || "",
    qrAgeMs: session.qrUpdatedAtMs ? Math.max(0, Date.now() - session.qrUpdatedAtMs) : 0,
    updatedAt: session.updatedAt || new Date().toISOString(),
  };
}

async function resolveWhatsAppContact(socket, phone) {
  const candidateJids = brazilPhoneVariants(phone).map((variant) => `${variant}@s.whatsapp.net`);
  if (!candidateJids.length) return { jid: "", lidJid: "" };

  const results = await socket.onWhatsApp(...candidateJids).catch((error) => {
    logger.warn(
      { error: errorMessage(error), phone: maskedPhone(phone) },
      "Não foi possível validar o telefone no WhatsApp",
    );
    return [];
  });
  const existing = (results || []).find((result) => result?.exists && result?.jid);
  if (!existing?.jid) return { jid: "", lidJid: "" };

  const lidJid = await socket?.signalRepository?.lidMapping
    ?.getLIDForPN?.(existing.jid)
    .catch(() => "");
  return { jid: existing.jid, lidJid: lidJid || "" };
}

class WhatsAppSessionManager {
  constructor(onStateChange) {
    this.sessions = new Map();
    this.starting = new Map();
    this.onStateChange = onStateChange;
    this.shuttingDown = false;
  }

  emptyState(sessionId) {
    return {
      sessionId,
      socket: null,
      connected: false,
      status: "disconnected",
      qrDataUrl: "",
      qrUpdatedAtMs: 0,
      phone: "",
      lastError: "",
      reconnectTimer: null,
      everConnected: false,
      manualDisconnect: false,
      updatedAt: new Date().toISOString(),
    };
  }

  get(sessionId) {
    const id = normalizeSessionId(sessionId);
    return this.sessions.get(id) || this.emptyState(id);
  }

  hasSavedSession(sessionId) {
    return fs.existsSync(path.join(sessionPath(sessionId), "creds.json"));
  }

  savedSessionIds() {
    const sessionsDirectory = path.join(DATA_DIR, "sessions");
    if (!fs.existsSync(sessionsDirectory)) return [];

    return fs
      .readdirSync(sessionsDirectory, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => normalizeSessionId(entry.name))
      .filter((id) => id && this.hasSavedSession(id));
  }

  async emitState(session) {
    session.updatedAt = new Date().toISOString();
    if (!this.onStateChange) return;
    await this.onStateChange(publicSessionState(session)).catch((error) => {
      logger.warn(
        { sessionId: session.sessionId, error: errorMessage(error) },
        "Não foi possível persistir o status da sessão",
      );
    });
  }

  isQrExpired(session) {
    return Boolean(
      session &&
      !session.connected &&
      session.status === "qr" &&
      session.qrDataUrl &&
      Date.now() - session.qrUpdatedAtMs > QR_MAX_AGE_MS,
    );
  }

  closeSocket(session, reason = "Conexão encerrada") {
    if (!session) return;
    if (session.reconnectTimer) {
      clearTimeout(session.reconnectTimer);
      session.reconnectTimer = null;
    }
    if (!session.socket) return;
    try {
      session.socket.end?.(new Error(reason));
    } catch {
      // O transporte pode já ter sido encerrado pelo Baileys.
    }
    try {
      session.socket.ws?.close?.();
    } catch {
      // Ignora erro do WebSocket durante o encerramento.
    }
    session.socket = null;
  }

  async resetExpiredQr(sessionId) {
    const id = normalizeSessionId(sessionId);
    const session = this.sessions.get(id);
    if (session) session.manualDisconnect = true;
    this.closeSocket(session, "QR Code expirado");
    this.sessions.delete(id);
    fs.rmSync(sessionPath(id), { recursive: true, force: true });
    logger.info({ sessionId: id }, "Sessão reiniciada após expiração do QR");
    return this.start(id);
  }

  async status(sessionId) {
    const id = normalizeSessionId(sessionId);
    if (!id) throw serviceError("Sessão inválida.", 400);

    const existing = this.sessions.get(id);
    if (this.isQrExpired(existing)) return this.resetExpiredQr(id);
    if (!existing && this.hasSavedSession(id)) {
      logger.info({ sessionId: id }, "Restaurando sessão ao consultar status");
      return this.start(id);
    }
    return publicSessionState(existing || this.emptyState(id));
  }

  async start(sessionId) {
    const id = normalizeSessionId(sessionId);
    if (!id) throw serviceError("Sessão inválida.", 400);
    if (this.shuttingDown) {
      throw serviceError("O conector está encerrando.", 503);
    }

    const existing = this.sessions.get(id);
    if (existing?.socket && existing.status !== "logged_out") {
      if (this.isQrExpired(existing)) return this.resetExpiredQr(id);
      return publicSessionState(existing);
    }
    if (existing?.status === "logged_out") this.sessions.delete(id);

    const pending = this.starting.get(id);
    if (pending) return pending;

    const startPromise = this.startSession(id).finally(() => {
      this.starting.delete(id);
    });
    this.starting.set(id, startPromise);
    return startPromise;
  }

  async startSession(id) {
    fs.mkdirSync(sessionPath(id), { recursive: true });
    const { state, saveCreds } = await useMultiFileAuthState(sessionPath(id));
    const versionResult = await fetchLatestBaileysVersion().catch((error) => {
      logger.warn(
        { sessionId: id, error: errorMessage(error) },
        "Não foi possível consultar a versão mais recente do WhatsApp Web",
      );
      return null;
    });

    const session = {
      ...this.emptyState(id),
      status: "connecting",
      everConnected: Boolean(state.creds?.registered || state.creds?.me),
    };
    this.sessions.set(id, session);
    await this.emitState(session);

    const socket = makeWASocket({
      ...(versionResult?.version ? { version: versionResult.version } : {}),
      auth: state,
      printQRInTerminal: false,
      logger: pino({ level: process.env.BAILEYS_LOG_LEVEL || "silent" }),
      browser: Browsers.windows("Desktop"),
      markOnlineOnConnect: false,
      emitOwnEvents: false,
      syncFullHistory: false,
    });
    session.socket = socket;

    socket.ev.on("creds.update", saveCreds);
    socket.ev.on("connection.update", async (update) => {
      try {
        if (this.sessions.get(id) !== session) return;

        if (update.qr) {
          session.qrDataUrl = await QRCode.toDataURL(update.qr, {
            margin: 1,
            width: 320,
          });
          session.qrUpdatedAtMs = Date.now();
          session.status = "qr";
          session.connected = false;
          session.lastError = "";
          await this.emitState(session);
          logger.info({ sessionId: id }, "QR Code do WhatsApp gerado");
        }

        if (update.connection === "open") {
          session.connected = true;
          session.everConnected = true;
          session.status = "connected";
          session.qrDataUrl = "";
          session.qrUpdatedAtMs = 0;
          session.phone = normalizePhone(socket.user?.id?.split(":")[0] || "");
          session.lastError = "";
          session.manualDisconnect = false;
          await this.emitState(session);
          logger.info({ sessionId: id, phone: maskedPhone(session.phone) }, "WhatsApp conectado");
        }

        if (update.connection === "close") {
          const statusCode = errorStatusCode(update.lastDisconnect?.error);
          const loggedOut = statusCode === DisconnectReason.loggedOut;
          const restartRequired = statusCode === DisconnectReason.restartRequired;
          const hasRegisteredCredentials = Boolean(state.creds?.registered || state.creds?.me);
          const shouldReconnect =
            !this.shuttingDown &&
            !session.manualDisconnect &&
            !loggedOut &&
            (restartRequired || session.everConnected || hasRegisteredCredentials);

          session.connected = false;
          session.status = loggedOut ? "logged_out" : "disconnected";
          session.qrDataUrl = "";
          session.qrUpdatedAtMs = 0;
          session.lastError = update.lastDisconnect?.error
            ? errorMessage(update.lastDisconnect.error)
            : "";
          session.socket = null;

          if (loggedOut) {
            fs.rmSync(sessionPath(id), { recursive: true, force: true });
          }
          await this.emitState(session);
          logger.warn(
            {
              sessionId: id,
              statusCode,
              loggedOut,
              restartRequired,
              shouldReconnect,
            },
            "WhatsApp desconectado",
          );

          if (shouldReconnect && !session.reconnectTimer) {
            session.reconnectTimer = setTimeout(() => {
              session.reconnectTimer = null;
              this.sessions.delete(id);
              this.start(id).catch((error) => {
                logger.error(
                  { sessionId: id, error: errorMessage(error) },
                  "Falha ao reconectar a sessão do WhatsApp",
                );
              });
            }, RECONNECT_DELAY_MS);
            session.reconnectTimer.unref?.();
          }
        }
      } catch (error) {
        session.lastError = errorMessage(error);
        session.status = "connector_error";
        session.connected = false;
        await this.emitState(session);
        logger.error(
          { sessionId: id, error: errorMessage(error) },
          "Falha ao processar atualização da conexão",
        );
      }
    });

    return publicSessionState(session);
  }

  async restoreSavedSessions() {
    const ids = this.savedSessionIds();
    if (!ids.length) return;

    logger.info({ sessions: ids.length }, "Restaurando sessões persistidas do WhatsApp");
    const results = await Promise.allSettled(ids.map((id) => this.start(id)));
    results.forEach((result, index) => {
      if (result.status === "rejected") {
        logger.error(
          { sessionId: ids[index], error: errorMessage(result.reason) },
          "Falha ao restaurar sessão persistida",
        );
      }
    });
  }

  async disconnect(sessionId) {
    const id = normalizeSessionId(sessionId);
    if (!id) throw serviceError("Sessão inválida.", 400);
    const session = this.sessions.get(id);
    if (session) session.manualDisconnect = true;
    if (session?.reconnectTimer) clearTimeout(session.reconnectTimer);
    if (session?.socket) {
      await session.socket.logout().catch((error) => {
        logger.warn(
          { sessionId: id, error: errorMessage(error) },
          "Logout do WhatsApp retornou erro",
        );
      });
    }

    this.sessions.delete(id);
    fs.rmSync(sessionPath(id), { recursive: true, force: true });
    const disconnected = {
      ...this.emptyState(id),
      status: "logged_out",
    };
    await this.emitState(disconnected);
    return publicSessionState(disconnected);
  }

  async send(sessionId, phone, message) {
    const id = normalizeSessionId(sessionId);
    if (!id) throw serviceError("Sessão inválida.", 400);

    if (!this.sessions.has(id) && this.hasSavedSession(id)) {
      await this.start(id);
    }
    const current = this.sessions.get(id);
    if (!current?.connected || !current.socket) {
      if (!current?.socket && this.hasSavedSession(id)) {
        await this.start(id);
      }
      const refreshed = this.sessions.get(id);
      if (!refreshed?.connected || !refreshed.socket) {
        throw serviceError(
          "WhatsApp ainda não está conectado. Escaneie o QR Code.",
          409,
          refreshed?.status || "disconnected",
        );
      }
    }

    const session = this.sessions.get(id);
    const normalizedPhone = normalizePhone(phone);
    if (![12, 13].includes(normalizedPhone.length)) {
      throw serviceError("Telefone inválido para envio.", 400, "invalid_phone");
    }
    const text = String(message || "")
      .trim()
      .slice(0, 3_900);
    if (!text) {
      throw serviceError("A mensagem não pode ficar vazia.", 400, "empty_message");
    }

    const selfJid = jidNormalizedUser(session.socket.user?.id || "");
    const selfLidJid = jidNormalizedUser(session.socket.user?.lid || "");
    const targetIsSelf = equivalentPhones(normalizedPhone, session.phone || selfJid);
    const target =
      targetIsSelf && selfJid
        ? { jid: selfJid, lidJid: selfLidJid }
        : await resolveWhatsAppContact(session.socket, normalizedPhone);

    if (!target.jid) {
      throw serviceError(
        "Número não encontrado no WhatsApp. Confira DDD e telefone.",
        404,
        "phone_not_found",
      );
    }

    const result = await session.socket.sendMessage(target.jid, { text });
    const messageId = String(result?.key?.id || "");
    logger.info(
      {
        sessionId: id,
        phone: maskedPhone(normalizedPhone),
        messageId,
        targetIsSelf,
      },
      "Mensagem enviada pelo WhatsApp",
    );

    return {
      ok: true,
      storeId: id,
      sessionId: id,
      sent: true,
      connected: true,
      status: "connected",
      messageId,
      targetJid: target.jid,
      targetLidJid: target.lidJid || "",
      targetIsSelf,
      updatedAt: new Date().toISOString(),
    };
  }

  async shutdown() {
    this.shuttingDown = true;
    for (const session of this.sessions.values()) {
      session.manualDisconnect = true;
      this.closeSocket(session, "Serviço encerrando");
    }
    this.sessions.clear();
  }
}

function createSupabaseAdmin() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return null;
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: {
        "X-Client-Info": "linkup-salao-whatsapp-connector/1.0.0",
      },
    },
  });
}

const supabase = createSupabaseAdmin();

function databaseConnectionStatus(status) {
  const allowed = new Set([
    "not_connected",
    "connecting",
    "qr",
    "connected",
    "disconnected",
    "logged_out",
    "connector_error",
  ]);
  return allowed.has(status) ? status : "connector_error";
}

async function persistConnectionState(state) {
  if (!supabase || !state.sessionId) return;

  const { error } = await supabase
    .from("tenant_whatsapp_settings")
    .update({
      connection_status: databaseConnectionStatus(state.status),
      connected_phone: normalizePhone(state.phone) || null,
      last_connection_error: state.lastError || null,
      last_status_at: new Date().toISOString(),
    })
    .eq("session_id", state.sessionId);
  if (error) throw error;
}

function scalarTemplateValue(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return "";
}

function buildCancellationLink(payload) {
  const explicit = scalarTemplateValue(
    payload.link_cancelamento || payload.cancellation_link,
  ).trim();
  if (explicit) return explicit;

  const slug = scalarTemplateValue(payload.tenant_slug || payload.slug).trim();
  const token = scalarTemplateValue(payload.cancellation_token || payload.cancel_token).trim();
  if (!PUBLIC_APP_URL || !slug || !token) return "";

  return (
    `${PUBLIC_APP_URL}/booking/${encodeURIComponent(slug)}` + `?cancel=${encodeURIComponent(token)}`
  );
}

function renderTemplate(template, payload = {}) {
  const variables = {};
  Object.entries(payload && typeof payload === "object" ? payload : {}).forEach(([key, value]) => {
    variables[key.toLowerCase()] = scalarTemplateValue(value);
  });

  variables.link_cancelamento = buildCancellationLink(payload);
  variables.cancellation_link = variables.link_cancelamento;

  const rendered = String(template || "")
    .replace(
      /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}|\{\s*([a-zA-Z0-9_]+)\s*\}/g,
      (_match, doubleKey, singleKey) => {
        const key = String(doubleKey || singleKey || "").toLowerCase();
        return Object.prototype.hasOwnProperty.call(variables, key) ? variables[key] : "";
      },
    )
    .replace(/[ \t]+\n/g, "\n")
    .trim();

  if (!rendered) {
    throw serviceError("O modelo gerou uma mensagem vazia.", 400, "empty_template");
  }
  return rendered.slice(0, 3_900);
}

function reminderExpired(row) {
  if (row.event_type !== "appointment_reminder") return false;
  const startAt = Date.parse(row.payload?.start_at || "");
  return Number.isFinite(startAt) && Date.now() >= startAt;
}

function isPermanentQueueError(error) {
  return (
    [400, 404].includes(errorStatusCode(error)) ||
    ["invalid_phone", "phone_not_found", "empty_message", "empty_template"].includes(
      String(error?.status || ""),
    )
  );
}

function retryDelayMs(attempts) {
  const exponent = Math.max(0, Number(attempts || 1) - 1);
  const baseDelay = Math.min(RETRY_MAX_MS, RETRY_BASE_MS * 2 ** exponent);
  const jitter = Math.floor(Math.random() * Math.min(5_000, baseDelay * 0.1));
  return Math.min(RETRY_MAX_MS, baseDelay + jitter);
}

class WhatsAppQueueWorker {
  constructor(database, sessionManager) {
    this.database = database;
    this.sessionManager = sessionManager;
    this.timer = null;
    this.running = false;
    this.stopped = true;
    this.pollCount = 0;
    this.state = {
      enabled: QUEUE_ENABLED,
      running: false,
      lastPollAt: null,
      lastSuccessAt: null,
      lastError: "",
      processed: 0,
    };
  }

  publicState() {
    return { ...this.state };
  }

  start() {
    if (!QUEUE_ENABLED || !this.database || !this.stopped) return;
    this.stopped = false;
    this.schedule(250);
    logger.info(
      {
        pollMs: QUEUE_POLL_MS,
        batchSize: QUEUE_BATCH_SIZE,
        concurrency: QUEUE_CONCURRENCY,
      },
      "Worker da fila do WhatsApp iniciado",
    );
  }

  stop() {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  schedule(delay = QUEUE_POLL_MS) {
    if (this.stopped) return;
    this.timer = setTimeout(() => {
      this.tick().catch((error) => {
        logger.error({ error: errorMessage(error) }, "Falha não tratada no ciclo da fila");
      });
    }, delay);
    this.timer.unref?.();
  }

  async tick() {
    if (this.stopped || this.running) return;
    this.running = true;
    this.state.running = true;
    this.state.lastPollAt = new Date().toISOString();
    this.pollCount += 1;

    try {
      if (this.pollCount === 1 || this.pollCount % 20 === 0) {
        await this.recoverStaleClaims();
      }

      const now = new Date().toISOString();
      const { data: candidates, error } = await this.database
        .from("whatsapp_message_queue")
        .select("*")
        .eq("status", "pending")
        .lte("scheduled_for", now)
        .order("scheduled_for", { ascending: true })
        .order("created_at", { ascending: true })
        .limit(QUEUE_BATCH_SIZE);
      if (error) throw error;

      const claims = [];
      for (const candidate of candidates || []) {
        const claim = await this.claim(candidate);
        if (claim) claims.push(claim);
      }

      await this.processWithConcurrency(claims);
      this.state.lastSuccessAt = new Date().toISOString();
      this.state.lastError = "";
    } catch (error) {
      this.state.lastError = errorMessage(error);
      logger.error({ error: this.state.lastError }, "Falha ao consultar a fila do WhatsApp");
    } finally {
      this.running = false;
      this.state.running = false;
      this.schedule();
    }
  }

  async claim(candidate) {
    const currentAttempts = Number(candidate.attempts || 0);
    const maxAttempts = Number(candidate.max_attempts || 5);
    if (currentAttempts >= maxAttempts) {
      await this.database
        .from("whatsapp_message_queue")
        .update({
          status: "failed",
          locked_at: null,
          last_error: "Quantidade máxima de tentativas atingida.",
        })
        .eq("id", candidate.id)
        .eq("status", "pending")
        .eq("attempts", currentAttempts);
      return null;
    }

    const lockedAt = new Date().toISOString();
    const { data, error } = await this.database
      .from("whatsapp_message_queue")
      .update({
        status: "processing",
        locked_at: lockedAt,
        attempts: currentAttempts + 1,
        last_error: null,
      })
      .eq("id", candidate.id)
      .eq("status", "pending")
      .eq("attempts", currentAttempts)
      .select("*")
      .maybeSingle();
    if (error) throw error;
    return data || null;
  }

  async recoverStaleClaims() {
    const cutoff = new Date(Date.now() - QUEUE_LOCK_TIMEOUT_MS).toISOString();
    const { data: staleRows, error } = await this.database
      .from("whatsapp_message_queue")
      .select("id, attempts, max_attempts, locked_at")
      .eq("status", "processing")
      .lt("locked_at", cutoff)
      .order("locked_at", { ascending: true })
      .limit(QUEUE_BATCH_SIZE * 2);
    if (error) throw error;

    for (const row of staleRows || []) {
      const exhausted = Number(row.attempts || 0) >= Number(row.max_attempts || 5);
      const { error: updateError } = await this.database
        .from("whatsapp_message_queue")
        .update({
          status: exhausted ? "failed" : "pending",
          locked_at: null,
          scheduled_for: exhausted
            ? new Date().toISOString()
            : new Date(Date.now() + retryDelayMs(row.attempts)).toISOString(),
          last_error: exhausted
            ? "Worker interrompido e limite de tentativas atingido."
            : "Processamento anterior foi interrompido; mensagem reagendada.",
        })
        .eq("id", row.id)
        .eq("status", "processing")
        .eq("locked_at", row.locked_at);
      if (updateError) throw updateError;

      logger.warn({ queueId: row.id, exhausted }, "Lock abandonado da fila foi recuperado");
    }
  }

  async processWithConcurrency(rows) {
    if (!rows.length) return;
    let cursor = 0;
    const runners = Array.from(
      {
        length: Math.min(QUEUE_CONCURRENCY, rows.length),
      },
      async () => {
        while (cursor < rows.length) {
          const index = cursor;
          cursor += 1;
          await this.process(rows[index]);
        }
      },
    );
    await Promise.all(runners);
  }

  async process(row) {
    try {
      if (reminderExpired(row)) {
        await this.cancel(row, "Lembrete expirou antes do envio.");
        return;
      }

      const { data: current, error: currentError } = await this.database
        .from("whatsapp_message_queue")
        .select("status")
        .eq("id", row.id)
        .maybeSingle();
      if (currentError) throw currentError;
      if (current?.status !== "processing") return;

      const { data: settings, error: settingsError } = await this.database
        .from("tenant_whatsapp_settings")
        .select("enabled, session_id")
        .eq("tenant_id", row.tenant_id)
        .maybeSingle();
      if (settingsError) throw settingsError;
      if (!settings?.enabled) {
        await this.cancel(row, "Automação do WhatsApp está desativada para esta loja.");
        return;
      }

      const renderedMessage = renderTemplate(row.template, row.payload || {});
      const sessionId = normalizeSessionId(settings.session_id || row.session_id || row.tenant_id);
      const result = await this.sessionManager.send(
        sessionId,
        row.recipient_phone,
        renderedMessage,
      );

      const { data: updated, error: updateError } = await this.database
        .from("whatsapp_message_queue")
        .update({
          status: "sent",
          locked_at: null,
          sent_at: new Date().toISOString(),
          provider_message_id: result.messageId || null,
          rendered_message: renderedMessage,
          last_error: null,
        })
        .eq("id", row.id)
        .eq("status", "processing")
        .select("id")
        .maybeSingle();
      if (updateError) throw updateError;

      if (!updated) {
        logger.warn(
          { queueId: row.id, tenantId: row.tenant_id },
          "Mensagem enviada, mas a fila foi alterada concorrentemente",
        );
        return;
      }

      this.state.processed += 1;
      logger.info(
        {
          queueId: row.id,
          tenantId: row.tenant_id,
          eventType: row.event_type,
          recipientKind: row.recipient_kind,
          phone: maskedPhone(row.recipient_phone),
          messageId: result.messageId,
        },
        "Mensagem da fila enviada",
      );
    } catch (error) {
      await this.failOrRetry(row, error);
    }
  }

  async cancel(row, reason) {
    const { error } = await this.database
      .from("whatsapp_message_queue")
      .update({
        status: "cancelled",
        locked_at: null,
        last_error: reason,
      })
      .eq("id", row.id)
      .eq("status", "processing");
    if (error) throw error;
    logger.info({ queueId: row.id, tenantId: row.tenant_id, reason }, "Mensagem da fila cancelada");
  }

  async failOrRetry(row, error) {
    const attempts = Number(row.attempts || 1);
    const maxAttempts = Number(row.max_attempts || 5);
    const permanent = isPermanentQueueError(error);
    const exhausted = attempts >= maxAttempts;
    const retry = !permanent && !exhausted;
    const message = errorMessage(error);
    let renderedMessage = null;
    try {
      renderedMessage = renderTemplate(row.template, row.payload || {});
    } catch {
      // A mensagem de erro principal já explica o problema do modelo.
    }

    const { error: updateError } = await this.database
      .from("whatsapp_message_queue")
      .update({
        status: retry ? "pending" : "failed",
        locked_at: null,
        scheduled_for: retry
          ? new Date(Date.now() + retryDelayMs(attempts)).toISOString()
          : row.scheduled_for,
        rendered_message: renderedMessage,
        last_error: message,
      })
      .eq("id", row.id)
      .eq("status", "processing");
    if (updateError) {
      logger.error(
        {
          queueId: row.id,
          originalError: message,
          updateError: errorMessage(updateError),
        },
        "Não foi possível atualizar a falha da fila",
      );
      return;
    }

    logger[retry ? "warn" : "error"](
      {
        queueId: row.id,
        tenantId: row.tenant_id,
        attempt: attempts,
        maxAttempts,
        retry,
        permanent,
        error: message,
      },
      retry ? "Envio falhou e foi reagendado" : "Envio falhou definitivamente",
    );
  }
}

function validateEnvironment() {
  const missing = [];
  if (!CONNECTOR_SECRET) missing.push("LINKUP_WHATSAPP_CONNECTOR_SECRET");
  if (QUEUE_ENABLED && !SUPABASE_URL) missing.push("SUPABASE_URL");
  if (QUEUE_ENABLED && !SUPABASE_SERVICE_ROLE_KEY) {
    missing.push("SUPABASE_SERVICE_ROLE_KEY");
  }
  if (QUEUE_ENABLED && !PUBLIC_APP_URL) missing.push("LINKUP_PUBLIC_APP_URL");

  if (missing.length) {
    throw new Error(`Variáveis obrigatórias ausentes: ${missing.join(", ")}.`);
  }
}

validateEnvironment();
fs.mkdirSync(DATA_DIR, { recursive: true });

const manager = new WhatsAppSessionManager(persistConnectionState);
const worker = new WhatsAppQueueWorker(supabase, manager);
const app = express();

app.disable("x-powered-by");
app.use((request, response, next) => {
  const pathname = String(request.path || "/").replace(/\/+$/, "") || "/";
  const isHealth =
    ["GET", "HEAD"].includes(request.method) && ["/", "/health", "/healthz"].includes(pathname);
  if (isHealth) {
    response.status(200).json({
      ok: true,
      service: "linkup-salao-whatsapp-connector",
      buildVersion: BUILD_VERSION,
      sessions: {
        active: manager.sessions.size,
        persisted: manager.savedSessionIds().length,
      },
      queue: worker.publicState(),
      updatedAt: new Date().toISOString(),
    });
    return;
  }
  next();
});

app.use(express.json({ limit: "64kb" }));
app.use((request, response, next) => {
  if (!safeSecretMatch(request.headers["x-linkup-connector-secret"])) {
    response.status(401).json({ ok: false, error: "Não autorizado." });
    return;
  }
  next();
});

app.get("/stores/:storeId/status", async (request, response) => {
  try {
    response.json(await manager.status(request.params.storeId));
  } catch (error) {
    response.status(errorStatusCode(error) || 500).json({
      ok: false,
      connected: false,
      status: error?.status || "connector_error",
      error: errorMessage(error),
    });
  }
});

app.post("/stores/:storeId/connect", async (request, response) => {
  try {
    response.json(await manager.start(request.params.storeId));
  } catch (error) {
    response.status(errorStatusCode(error) || 500).json({
      ok: false,
      connected: false,
      status: error?.status || "connector_error",
      error: errorMessage(error),
    });
  }
});

app.delete("/stores/:storeId/session", async (request, response) => {
  try {
    response.json(await manager.disconnect(request.params.storeId));
  } catch (error) {
    response.status(errorStatusCode(error) || 500).json({
      ok: false,
      connected: false,
      status: error?.status || "connector_error",
      error: errorMessage(error),
    });
  }
});

app.post("/stores/:storeId/send", async (request, response) => {
  try {
    response.json(
      await manager.send(request.params.storeId, request.body?.phone, request.body?.message),
    );
  } catch (error) {
    response.status(errorStatusCode(error) || 500).json({
      ok: false,
      connected: false,
      sent: false,
      status: error?.status || "send_error",
      error: errorMessage(error),
    });
  }
});

app.use((_request, response) => {
  response.status(404).json({ ok: false, error: "Rota não encontrada." });
});

const server = app.listen(PORT, HOST, () => {
  logger.info(
    {
      buildVersion: BUILD_VERSION,
      host: HOST,
      port: PORT,
      dataDir: DATA_DIR,
      queueEnabled: QUEUE_ENABLED,
    },
    "LinkUp Salão WhatsApp Connector iniciado",
  );
  manager.restoreSavedSessions().finally(() => worker.start());
});

let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, "Encerrando WhatsApp Connector");
  worker.stop();
  await manager.shutdown();
  await new Promise((resolve) => server.close(resolve));
}

["SIGINT", "SIGTERM"].forEach((signal) => {
  process.on(signal, () => {
    const forceExit = setTimeout(() => process.exit(1), 15_000);
    forceExit.unref?.();
    shutdown(signal)
      .then(() => process.exit(0))
      .catch((error) => {
        logger.error({ error: errorMessage(error) }, "Falha ao encerrar o serviço");
        process.exit(1);
      });
  });
});

process.on("unhandledRejection", (error) => {
  logger.error({ error: errorMessage(error) }, "Promise rejeitada sem tratamento");
});

process.on("uncaughtException", (error) => {
  logger.fatal({ error: errorMessage(error) }, "Exceção não tratada");
  shutdown("uncaughtException").finally(() => process.exit(1));
});

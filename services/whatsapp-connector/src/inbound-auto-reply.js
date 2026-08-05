"use strict";

const USER_JID_SUFFIX = "@s.whatsapp.net";

function normalizeInboundPhone(value) {
  let digits = String(value || "").replace(/\D/g, "");
  digits = digits.replace(/^00+/, "");
  if (!digits) return "";
  if (digits.startsWith("55") && [12, 13].includes(digits.length)) return digits;
  if ([10, 11].includes(digits.length)) return `55${digits}`;
  return "";
}

function phoneFromUserJid(value) {
  const jid = String(value || "")
    .trim()
    .toLowerCase();
  if (!jid.endsWith(USER_JID_SUFFIX)) return "";
  return normalizeInboundPhone(jid.slice(0, -USER_JID_SUFFIX.length).split(":")[0]);
}

function incomingPhoneFromMessage(message) {
  const key = message?.key || {};
  const remoteJid = String(key.remoteJid || "").toLowerCase();
  if (
    !remoteJid ||
    remoteJid.endsWith("@g.us") ||
    remoteJid.endsWith("@broadcast") ||
    remoteJid.endsWith("@newsletter") ||
    remoteJid === "status@broadcast"
  ) {
    return "";
  }

  const candidates = [key.remoteJidAlt, key.remoteJid, key.participantAlt, message?.senderPn];
  for (const candidate of candidates) {
    const phone = phoneFromUserJid(candidate);
    if (phone) return phone;
  }
  return "";
}

function unwrapMessageContent(content) {
  let current = content;
  for (let depth = 0; depth < 3; depth += 1) {
    if (!current || typeof current !== "object") return null;
    const wrapped =
      current.ephemeralMessage?.message ||
      current.viewOnceMessage?.message ||
      current.viewOnceMessageV2?.message ||
      current.viewOnceMessageV2Extension?.message;
    if (!wrapped) return current;
    current = wrapped;
  }
  return current && typeof current === "object" ? current : null;
}

function hasUserVisibleContent(message) {
  const content = unwrapMessageContent(message?.message);
  if (!content) return false;
  const ignoredKeys = new Set([
    "messageContextInfo",
    "protocolMessage",
    "senderKeyDistributionMessage",
    "reactionMessage",
    "pollUpdateMessage",
    "keepInChatMessage",
  ]);
  return Object.keys(content).some((key) => !ignoredKeys.has(key));
}

function incomingAutoReplyCandidate(message) {
  if (!message || message.key?.fromMe) return null;
  const providerMessageId = String(message.key?.id || "").trim();
  if (!providerMessageId || !hasUserVisibleContent(message)) return null;
  const phone = incomingPhoneFromMessage(message);
  if (!phone) return null;
  return { phone, providerMessageId };
}

module.exports = {
  hasUserVisibleContent,
  incomingAutoReplyCandidate,
  incomingPhoneFromMessage,
  normalizeInboundPhone,
  phoneFromUserJid,
  unwrapMessageContent,
};

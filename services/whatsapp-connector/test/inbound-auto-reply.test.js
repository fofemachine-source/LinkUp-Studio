"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  incomingAutoReplyCandidate,
  incomingPhoneFromMessage,
  normalizeInboundPhone,
} = require("../src/inbound-auto-reply");

test("normaliza telefones brasileiros com e sem DDI", () => {
  assert.equal(normalizeInboundPhone("(91) 99999-1234"), "5591999991234");
  assert.equal(normalizeInboundPhone("+55 91 99999-1234"), "5591999991234");
  assert.equal(normalizeInboundPhone("123"), "");
});

test("lê o telefone de uma conversa individual", () => {
  assert.equal(
    incomingPhoneFromMessage({ key: { remoteJid: "5591999991234@s.whatsapp.net" } }),
    "5591999991234",
  );
});

test("usa o JID alternativo de telefone quando o WhatsApp entrega um LID", () => {
  assert.equal(
    incomingPhoneFromMessage({
      key: {
        remoteJid: "123456789012345@lid",
        remoteJidAlt: "5591999991234@s.whatsapp.net",
      },
    }),
    "5591999991234",
  );
});

test("ignora grupos, status e canais", () => {
  for (const remoteJid of ["120363000000000000@g.us", "status@broadcast", "123@newsletter"]) {
    assert.equal(
      incomingPhoneFromMessage({
        key: { remoteJid, participantAlt: "5591999991234@s.whatsapp.net" },
      }),
      "",
    );
  }
});

test("aceita texto e mídia recebidos do cliente", () => {
  const base = {
    key: {
      id: "message-1",
      fromMe: false,
      remoteJid: "5591999991234@s.whatsapp.net",
    },
  };
  assert.deepEqual(incomingAutoReplyCandidate({ ...base, message: { conversation: "Olá" } }), {
    phone: "5591999991234",
    providerMessageId: "message-1",
  });
  assert.deepEqual(
    incomingAutoReplyCandidate({ ...base, message: { imageMessage: { caption: "Foto" } } }),
    { phone: "5591999991234", providerMessageId: "message-1" },
  );
});

test("aceita conteúdo dentro do envelope efêmero", () => {
  const candidate = incomingAutoReplyCandidate({
    key: {
      id: "message-2",
      fromMe: false,
      remoteJid: "5591999991234@s.whatsapp.net",
    },
    message: { ephemeralMessage: { message: { conversation: "Oi" } } },
  });
  assert.deepEqual(candidate, {
    phone: "5591999991234",
    providerMessageId: "message-2",
  });
});

test("ignora mensagens próprias e eventos internos", () => {
  assert.equal(
    incomingAutoReplyCandidate({
      key: { id: "own", fromMe: true, remoteJid: "5591999991234@s.whatsapp.net" },
      message: { conversation: "Enviada pela loja" },
    }),
    null,
  );
  assert.equal(
    incomingAutoReplyCandidate({
      key: { id: "protocol", fromMe: false, remoteJid: "5591999991234@s.whatsapp.net" },
      message: { protocolMessage: { type: 0 } },
    }),
    null,
  );
});

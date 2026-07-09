// PIX EMV static payload generator (BR Code)
function tlv(id: string, value: string) {
  const len = value.length.toString().padStart(2, "0");
  return `${id}${len}${value}`;
}
function crc16(payload: string) {
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1;
      crc &= 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

export function normalizePixKey(raw: string) {
  const s = (raw || "").trim();
  if (!s) return "";
  if (s.includes("@")) return s;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)) return s.toLowerCase();
  if (s.startsWith("+")) return s.replace(/[^+\d]/g, "");
  const digits = s.replace(/\D/g, "");
  if (digits.length === 11) {
    if (s.includes("(") && s.includes(")")) return "+55" + digits;
    return digits;
  }
  if (digits.length === 14) return digits;
  if (digits.length === 10) return "+55" + digits;
  return digits || s;
}
export function sanitizeEMVString(str: string): string {
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9 ]/g, "")
    .trim()
    .toUpperCase();
}

export function buildPixPayload(opts: {
  key: string;
  merchant: string;
  city?: string;
  amount?: number;
  txid?: string;
  description?: string;
}) {
  const merchant = sanitizeEMVString(opts.merchant).substring(0, 25);
  const city = sanitizeEMVString(opts.city ?? "SAO PAULO").substring(0, 15);
  const gui = tlv("00", "br.gov.bcb.pix");
  const normalizedKey = normalizePixKey(opts.key);
  const keyTlv = tlv("01", normalizedKey);
  const desc = opts.description ? tlv("02", opts.description.substring(0, 40)) : "";
  const acc = tlv("26", gui + keyTlv + desc);
  const amount = opts.amount ? tlv("54", opts.amount.toFixed(2)) : "";
  const txid = tlv("05", (opts.txid ?? "***").substring(0, 25));
  const addTpl = tlv("62", txid);
  const payloadNoCrc =
    tlv("00", "01") +
    tlv("01", opts.amount ? "12" : "11") +
    acc +
    tlv("52", "0000") +
    tlv("53", "986") +
    amount +
    tlv("58", "BR") +
    tlv("59", merchant) +
    tlv("60", city) +
    addTpl +
    "6304";
  return payloadNoCrc + crc16(payloadNoCrc);
}

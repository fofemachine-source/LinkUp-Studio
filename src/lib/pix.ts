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

export function buildPixPayload(opts: {
  key: string;
  merchant: string;
  city?: string;
  amount?: number;
  txid?: string;
  description?: string;
}) {
  const merchant = opts.merchant.substring(0, 25).toUpperCase();
  const city = (opts.city ?? "SAO PAULO").substring(0, 15).toUpperCase();
  const gui = tlv("00", "br.gov.bcb.pix");
  const keyTlv = tlv("01", opts.key);
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

const whatsappDoubleBoldPattern =
  /(^|[^*])\*\*(?![\s*])([^\r\n]*?\S)\*\*(?!\*)/gm;

/**
 * WhatsApp uses one asterisk on each side for bold text. This keeps
 * user-authored wording intact while correcting Markdown-style **bold**.
 */
export function normalizeWhatsAppFormatting(value: string | null | undefined) {
  return String(value ?? "").replace(
    whatsappDoubleBoldPattern,
    (_match, prefix: string, content: string) => `${prefix}*${content}*`,
  );
}

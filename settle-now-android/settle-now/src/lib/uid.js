/**
 * Safe UUID generator.
 *
 * crypto.randomUUID() only works in secure contexts (HTTPS or localhost).
 * When the app is accessed over a LAN IP like http://192.168.x.x:5173,
 * the browser treats it as insecure and throws a DOMException.
 *
 * This helper falls back to a timestamp + random suffix so IDs are always
 * unique enough for a local-first app with <= 10 members per ledger.
 */
let counter = 0;

/**
 * Generate a raw UUID suitable for server-side storage.
 * Falls back to a random string in non-secure contexts.
 */
export function genUuid() {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    try {
      return crypto.randomUUID();
    } catch {
      // Non-secure context — fall through
    }
  }
  // Fallback: RFC 4122-ish v4 UUID from random bytes
  const hex = [...Array(16)].map(() => Math.floor(Math.random() * 256).toString(16).padStart(2, '0')).join('');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    '4' + hex.slice(13, 16),
    ((parseInt(hex.slice(16, 18), 16) & 0x3f) | 0x80).toString(16) + hex.slice(18, 20),
    hex.slice(20, 32),
  ].join('-');
}

export function safeId(prefix = "id") {
  return `${prefix}-${genUuid()}`;
}

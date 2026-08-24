/**
 * Globally unique record IDs.
 *
 * The app previously built IDs from the clock - `task_${Date.now()}` - which is
 * unique on one device and nowhere else. Two devices creating a record in the
 * same millisecond produce the same ID, and a sync or a merge then silently
 * keeps one and destroys the other.
 *
 * Dexie Cloud states the requirement plainly: primary keys must be strings with
 * "sufficient entropy for global uniqueness". A UUID gives that. The readable
 * prefix is kept because it costs nothing and makes the change history, audit
 * log and devtools legible.
 */
export function newId(prefix: string): string {
  return `${prefix}_${uuid()}`;
}

/**
 * `crypto.randomUUID` needs a secure context. GitHub Pages and localhost both
 * qualify, so the fallback only exists for a plain-http LAN preview - it uses
 * `getRandomValues`, so it is still cryptographically random, just assembled by
 * hand.
 */
function uuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 10

  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * A stable identifier for this browser profile.
 *
 * Held in localStorage rather than the database precisely because it must NOT
 * sync: it is what lets the audit chain be verified per device. Two devices that
 * shared an id would look like one forked chain, which is the thing the chain
 * exists to distinguish from tampering.
 *
 * Losing it (cleared site data) starts a new chain rather than corrupting the
 * old one - previous entries stay verifiable under their original id.
 */
const STORAGE_KEY = 'gcse-genie.deviceId';

let cached: string | null = null;

export function getDeviceId(): string {
  if (cached) return cached;

  try {
    const existing = localStorage.getItem(STORAGE_KEY);
    if (existing) {
      cached = existing;
      return existing;
    }
  } catch {
    // Private mode or storage disabled - fall through to an ephemeral id
  }

  const generated =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `dev-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  try {
    localStorage.setItem(STORAGE_KEY, generated);
  } catch {
    // Ephemeral for this session only; the chain still verifies within it
  }

  cached = generated;
  return generated;
}

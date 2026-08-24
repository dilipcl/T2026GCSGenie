/**
 * Parent passphrase storage.
 *
 * The previous scheme stored a bare SHA-256 of a four-digit PIN. That is ten
 * thousand candidates against a single fast hash - a complete search takes
 * milliseconds in a browser console, so the stored hash was equivalent to
 * storing the PIN itself.
 *
 * PBKDF2 with a per-credential random salt and a high iteration count makes each
 * guess cost real time, and a passphrase rather than four digits makes the
 * search space large enough for that cost to matter.
 *
 * This protects the credential at rest. It does not make the parent boundary
 * enforceable - anyone who can open devtools can still edit IndexedDB directly.
 * Detection of that is the audit chain's job, not this file's.
 */

export const PBKDF2_ITERATIONS = 600_000;
export const MIN_PASSPHRASE_LENGTH = 8;

export interface ParentCredential {
  algorithm: 'PBKDF2-SHA256';
  iterations: number;
  /** Base64, 16 random bytes, unique per credential. */
  salt: string;
  /** Base64 of the derived 256-bit key. */
  hash: string;
  updatedAt: number;
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function fromBase64(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function derive(passphrase: string, salt: Uint8Array, iterations: number): Promise<string> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(passphrase),
    'PBKDF2',
    false,
    ['deriveBits']
  );

  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations, hash: 'SHA-256' },
    keyMaterial,
    256
  );

  return toBase64(new Uint8Array(bits));
}

export async function createCredential(passphrase: string): Promise<ParentCredential> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return {
    algorithm: 'PBKDF2-SHA256',
    iterations: PBKDF2_ITERATIONS,
    salt: toBase64(salt),
    hash: await derive(passphrase, salt, PBKDF2_ITERATIONS),
    updatedAt: Date.now(),
  };
}

/**
 * Constant-time-ish comparison. Both values are already hashes rather than
 * secrets, so this guards against nothing exotic - it simply avoids leaking the
 * length of the matching prefix through early return.
 */
function equals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function verifyCredential(
  passphrase: string,
  credential: ParentCredential
): Promise<boolean> {
  const candidate = await derive(
    passphrase,
    fromBase64(credential.salt),
    credential.iterations
  );
  return equals(candidate, credential.hash);
}

/**
 * How long to refuse attempts after `failures` consecutive wrong passphrases.
 *
 * The KDF cost is the real defence; this exists so a script cannot sit in a
 * tight loop, and so a person watching the screen sees that guessing is being
 * resisted. Caps at five minutes - locking a parent out of their own governance
 * tools for longer would do more harm than the attack it prevents.
 */
export function lockoutMs(failures: number): number {
  if (failures < 3) return 0;
  return Math.min(5 * 60_000, 2 ** (failures - 3) * 15_000);
}

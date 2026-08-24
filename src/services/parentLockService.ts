import { db } from '../db';
import {
  ParentCredential,
  createCredential,
  verifyCredential,
  lockoutMs,
  MIN_PASSPHRASE_LENGTH,
} from '../utils/credential';
import { sha256 } from '../utils/hash';
import { logAuditEvent } from './auditService';

/** SHA-256 of '1234' - the old seeded default, recognised only to refuse it. */
const LEGACY_DEFAULT_PIN_HASH =
  '03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4';

export type LockState =
  /** No passphrase has ever been set; the next step is to create one. */
  | { status: 'UNCLAIMED' }
  /** A pre-passphrase PIN is still in place and should be replaced. */
  | { status: 'LEGACY_PIN' }
  | { status: 'READY' }
  | { status: 'LOCKED_OUT'; until: number; failures: number };

export async function getLockState(): Promise<LockState> {
  const settings = await db.parentSettings.get('active_settings');

  const lockedUntil = settings?.unlockLockedUntil ?? 0;
  if (lockedUntil > Date.now()) {
    return {
      status: 'LOCKED_OUT',
      until: lockedUntil,
      failures: settings?.failedUnlockAttempts ?? 0,
    };
  }

  if (settings?.parentCredential) return { status: 'READY' };
  if (settings?.parentPinHash) return { status: 'LEGACY_PIN' };
  return { status: 'UNCLAIMED' };
}

export interface UnlockResult {
  ok: boolean;
  /** Set when the attempt failed. */
  message?: string;
  /** True when a legacy PIN was accepted and must now be replaced. */
  mustUpgrade?: boolean;
  lockedUntil?: number;
}

async function recordFailure(): Promise<UnlockResult> {
  const settings = await db.parentSettings.get('active_settings');
  const failures = (settings?.failedUnlockAttempts ?? 0) + 1;
  const wait = lockoutMs(failures);
  const until = wait > 0 ? Date.now() + wait : 0;

  await db.parentSettings.update('active_settings', {
    failedUnlockAttempts: failures,
    unlockLockedUntil: until,
  });

  return {
    ok: false,
    message:
      wait > 0
        ? `Incorrect. Locked for ${Math.round(wait / 1000)}s after ${failures} failed attempts.`
        : 'Incorrect passphrase.',
    lockedUntil: until || undefined,
  };
}

async function clearFailures(): Promise<void> {
  await db.parentSettings.update('active_settings', {
    failedUnlockAttempts: 0,
    unlockLockedUntil: 0,
  });
}

export async function unlock(passphrase: string): Promise<UnlockResult> {
  const state = await getLockState();
  if (state.status === 'LOCKED_OUT') {
    const seconds = Math.ceil((state.until - Date.now()) / 1000);
    return { ok: false, message: `Too many attempts. Try again in ${seconds}s.` };
  }
  if (state.status === 'UNCLAIMED') {
    return { ok: false, message: 'No passphrase has been set yet.' };
  }

  const settings = await db.parentSettings.get('active_settings');

  if (state.status === 'LEGACY_PIN') {
    const entered = await sha256(passphrase);
    if (entered !== settings?.parentPinHash) return recordFailure();
    await clearFailures();
    return { ok: true, mustUpgrade: true };
  }

  const credential = settings?.parentCredential as ParentCredential;
  if (!(await verifyCredential(passphrase, credential))) return recordFailure();

  await clearFailures();
  return { ok: true };
}

export interface SetPassphraseResult {
  ok: boolean;
  message?: string;
}

/**
 * Sets or replaces the parent passphrase.
 *
 * `currentPassphrase` is required whenever one already exists. Claiming an
 * unclaimed lock does not need it - there is nothing to prove yet, which is why
 * the parent should do this at install time rather than leaving it open.
 */
export async function setPassphrase(
  newPassphrase: string,
  currentPassphrase?: string
): Promise<SetPassphraseResult> {
  if (newPassphrase.length < MIN_PASSPHRASE_LENGTH) {
    return {
      ok: false,
      message: `Use at least ${MIN_PASSPHRASE_LENGTH} characters. A short phrase you will remember beats a short string you will not.`,
    };
  }
  if (/^\d+$/.test(newPassphrase)) {
    return {
      ok: false,
      message: 'Digits only is guessable. Include letters or words.',
    };
  }
  if ((await sha256(newPassphrase)) === LEGACY_DEFAULT_PIN_HASH) {
    return { ok: false, message: 'That was the old published default. Choose something else.' };
  }

  const state = await getLockState();
  if (state.status !== 'UNCLAIMED') {
    if (!currentPassphrase) {
      return { ok: false, message: 'Enter the current passphrase to change it.' };
    }
    const check = await unlock(currentPassphrase);
    if (!check.ok) return { ok: false, message: check.message || 'Current passphrase is incorrect.' };
  }

  const credential = await createCredential(newPassphrase);

  await db.parentSettings.update('active_settings', {
    parentCredential: credential,
    // Retire any legacy PIN so it cannot be used as a second way in
    parentPinHash: undefined,
    failedUnlockAttempts: 0,
    unlockLockedUntil: 0,
  });

  // Deliberately records only that it changed - never the passphrase or its hash.
  await logAuditEvent({
    user: 'PARENT',
    action: 'UPDATE',
    entity: 'ParentSettings',
    entityId: 'active_settings',
    fieldChanged: 'parentCredential',
    newValue:
      state.status === 'UNCLAIMED'
        ? 'Parent passphrase set for the first time'
        : 'Parent passphrase changed',
  });

  return { ok: true };
}

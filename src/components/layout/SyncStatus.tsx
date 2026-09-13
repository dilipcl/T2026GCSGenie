import React, { useState } from 'react';
import { useObservable } from 'dexie-react-hooks';
import { db } from '../../db';
import { useFeedback } from '../shared/FeedbackProvider';
import { Cloud, CloudOff, RefreshCw, LogIn, AlertTriangle, CalendarX, UserX } from 'lucide-react';

/**
 * A licence problem is not a network problem, and saying "Offline" for one cost
 * an evening.
 *
 * dexie-cloud reports `phase: 'offline'` when the signed-in user's licence is
 * expired or deactivated, before it has looked at connectivity at all - see
 * `computeSyncState`, which returns that phase the moment
 * `user.license.status !== 'ok'`. Every other cause of `'offline'` is one
 * device losing signal. This one is server-side, so it lands on every device in
 * the family within the same minute, and the badge sent everybody to check
 * their wifi for a fault no amount of signal could fix.
 *
 * The `license` field travels on the same `SyncState` object as the phase, so
 * the two were always distinguishable; we were simply throwing the field away.
 *
 * The copy says what it costs rather than what it is: work carries on being
 * saved here, and stops reaching anywhere else. That is the only part of this a
 * person needs in the moment, and it is the part the word "Offline" got wrong.
 */
const LICENCE = {
  expired: {
    icon: CalendarX,
    label: 'Sync expired',
    tone: 'bg-rose-500/15 border-rose-500/40 text-rose-300',
    spin: false,
    title:
      'The sync subscription has run out. Everything still saves on this device, but nothing is reaching the others until it is renewed.',
    toastTitle: 'Sync has expired',
    toastBody:
      'Everything you do still saves here. It stops reaching your other devices until the subscription is renewed.',
  },
  deactivated: {
    icon: UserX,
    label: 'Sync blocked',
    tone: 'bg-rose-500/15 border-rose-500/40 text-rose-300',
    spin: false,
    title:
      'This account has been deactivated on the sync service. Everything still saves on this device, but nothing is reaching the others.',
    toastTitle: 'This account cannot sync',
    toastBody:
      'It has been deactivated on the sync service. Everything you do still saves here, and nothing has been lost.',
  },
} as const;

/**
 * Sync state and sign-in, in the header.
 *
 * The app deliberately works before anyone logs in (requireAuth is off), so the
 * signed-out state has to read as a normal, working condition rather than an
 * error - "this device only" is accurate and not alarming. What must never be
 * ambiguous is whether the thing you just typed exists anywhere else, which is
 * the failure this whole change exists to fix.
 */
export const SyncStatus: React.FC = () => {
  const { toast } = useFeedback();
  const [isBusy, setIsBusy] = useState(false);
  const user = useObservable(db.cloud.currentUser);
  const syncState = useObservable(db.cloud.syncState);

  const isLoggedIn = !!user?.userId && user.userId !== 'unauthorized';
  const phase = syncState?.phase;

  /** `'ok'` is reported explicitly, so only a present, non-ok value is a fault. */
  const licence = syncState?.license;
  const licenceFault = licence && licence !== 'ok' ? LICENCE[licence] : null;

  /**
   * Every path here now says something.
   *
   * Tapping this while already synced called `db.cloud.sync()` and rendered
   * nothing whatsoever - no spinner, no toast, no change of label. From the
   * outside that is indistinguishable from a dead button, and it is the most
   * likely reason to report the sign-in control as "doing nothing". A failure
   * was worse: it went to `console.warn`, where nobody on a phone will ever
   * see it.
   */
  const handleClick = async () => {
    if (isBusy) return;
    setIsBusy(true);
    try {
      if (isLoggedIn) {
        await db.cloud.sync();
        /**
         * Read the licence back rather than trusting the value this render
         * closed over, and never announce success without checking it.
         *
         * `sync()` resolves perfectly happily under an expired licence - the
         * addon's own licence checks on the push path are commented out in the
         * shipped build - so the old unconditional toast told a family whose
         * data had not moved for days that everything had been sent and
         * received. Re-reading also means a licence renewed a minute ago says
         * so on the first tap, instead of repeating a complaint that is over.
         */
        const current = db.cloud.syncState.value?.license;
        const fault = current && current !== 'ok' ? LICENCE[current] : null;
        if (fault) {
          toast.error(fault.toastTitle, fault.toastBody);
        } else {
          toast.success('Up to date', 'Everything on this device has been sent and received.');
        }
      } else {
        await db.cloud.login();
      }
    } catch (err) {
      // Cancelling the sign-in dialog rejects too, and that is not an error
      // worth shouting about.
      const message = err instanceof Error ? err.message : String(err);
      const cancelled = /cancel|abort/i.test(message);
      if (!cancelled) {
        console.warn('Dexie Cloud action failed:', err);
        toast.error(
          isLoggedIn ? 'Could not sync' : 'Could not sign in',
          `${message.slice(0, 120)} — your data on this device is safe.`
        );
      }
    } finally {
      setIsBusy(false);
    }
  };

  if (!isLoggedIn) {
    return (
      <button
        onClick={handleClick}
        disabled={isBusy}
        title="Sign in to sync this device with your other devices"
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-[11px] font-bold text-slate-300 transition-all disabled:opacity-60"
      >
        <LogIn className={`w-3.5 h-3.5 text-indigo-400 ${isBusy ? 'animate-pulse' : ''}`} />
        <span className="hidden sm:inline">{isBusy ? 'Signing in...' : 'This device only'}</span>
        <span className="sm:hidden">{isBusy ? '...' : 'Sign in'}</span>
      </button>
    );
  }

  /**
   * The licence is checked before the phase, not beside it, because when a
   * licence is bad the phase is always `'offline'` - so a lookup that reads the
   * phase first can never reach this branch.
   */
  const view = licenceFault ?? {
    initial: {
      icon: RefreshCw,
      label: 'Starting...',
      tone: 'bg-slate-800 border-slate-700 text-slate-300',
      spin: true,
    },
    'not-in-sync': {
      icon: RefreshCw,
      label: 'Pending',
      tone: 'bg-amber-500/15 border-amber-500/40 text-amber-300',
      spin: false,
    },
    error: {
      icon: AlertTriangle,
      label: 'Sync problem',
      tone: 'bg-rose-500/15 border-rose-500/40 text-rose-300',
      spin: false,
    },
    offline: {
      icon: CloudOff,
      label: 'Offline',
      tone: 'bg-slate-800 border-slate-700 text-slate-400',
      spin: false,
    },
    pushing: {
      icon: RefreshCw,
      label: 'Saving...',
      tone: 'bg-indigo-500/15 border-indigo-500/40 text-indigo-300',
      spin: true,
    },
    pulling: {
      icon: RefreshCw,
      label: 'Updating...',
      tone: 'bg-indigo-500/15 border-indigo-500/40 text-indigo-300',
      spin: true,
    },
    'in-sync': {
      icon: Cloud,
      label: 'Synced',
      tone: 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300',
      spin: false,
    },
  }[phase ?? 'in-sync'] ?? {
    icon: RefreshCw,
    label: 'Syncing...',
    tone: 'bg-slate-800 border-slate-700 text-slate-300',
    spin: true,
  };

  const Icon = view.icon;
  const who = user?.email || user?.name || user?.userId;

  /**
   * The label is `hidden sm:inline`, so a phone gets the icon and nothing else.
   * That is why the two licence states carry their own icons rather than
   * sharing the warning triangle with `error` - on the screen this is mostly
   * read on, the icon is the whole message. The tooltip below is for the
   * laptop, and the toast on tap is what a phone gets instead.
   */
  return (
    <button
      onClick={handleClick}
      title={
        licenceFault ? `${licenceFault.title} Signed in as ${who}.` : `Signed in as ${who}. Tap to sync now.`
      }
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-[11px] font-bold transition-all ${view.tone}`}
    >
      <Icon className={`w-3.5 h-3.5 ${view.spin ? 'animate-spin' : ''}`} />
      <span className="hidden sm:inline">{view.label}</span>
    </button>
  );
};

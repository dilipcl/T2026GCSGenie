import React from 'react';
import { useObservable } from 'dexie-react-hooks';
import { db } from '../../db';
import { Cloud, CloudOff, RefreshCw, LogIn, AlertTriangle } from 'lucide-react';

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
  const user = useObservable(db.cloud.currentUser);
  const syncState = useObservable(db.cloud.syncState);

  const isLoggedIn = !!user?.userId && user.userId !== 'unauthorized';
  const phase = syncState?.phase;

  const handleClick = async () => {
    try {
      if (isLoggedIn) {
        await db.cloud.sync();
      } else {
        await db.cloud.login();
      }
    } catch (err) {
      console.warn('Dexie Cloud action failed:', err);
    }
  };

  if (!isLoggedIn) {
    return (
      <button
        onClick={handleClick}
        title="Sign in to sync this device with your other devices"
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-[11px] font-bold text-slate-300 transition-all"
      >
        <LogIn className="w-3.5 h-3.5 text-indigo-400" />
        <span className="hidden sm:inline">This device only</span>
        <span className="sm:hidden">Sign in</span>
      </button>
    );
  }

  const view = {
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

  return (
    <button
      onClick={handleClick}
      title={`Signed in as ${user?.email || user?.name || user?.userId}. Tap to sync now.`}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-[11px] font-bold transition-all ${view.tone}`}
    >
      <Icon className={`w-3.5 h-3.5 ${view.spin ? 'animate-spin' : ''}`} />
      <span className="hidden sm:inline">{view.label}</span>
    </button>
  );
};

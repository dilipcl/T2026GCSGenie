import React, { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { loadOutstanding } from '../../services/outstandingService';
import { readState } from '../../services/driveBackupService';
import { getLockState, LockState } from '../../services/parentLockService';
import { DriveSyncState } from '../../types';
import type { NavTab } from '../layout/Navigation';
import { formatPastDate, toLocalISODate } from '../../utils/date';
import { ArrowRight, CheckCircle2, Inbox, ShieldAlert, Database } from 'lucide-react';

/**
 * What a parent opened the portal to do, before any setting.
 *
 * The portal used to open on a passphrase form and an AI audit, with the plan
 * waiting for approval nine panels down - and that plan is the reason a parent
 * is here on most Sundays. This is the first tab: what is waiting on a parent,
 * each with the button that does it, then whether the data is safe.
 */
export const ParentToday: React.FC<{
  onOpenTab?: (tab: NavTab) => void;
  onOpenDataTab: () => void;
}> = ({ onOpenTab, onOpenDataTab }) => {
  const waiting = useLiveQuery(() => loadOutstanding('PARENT'), []);
  /**
   * Read once, not live. `readState` writes the sync row the first time it is
   * read, and a write inside a live query throws - it took this whole tab down
   * with "Readwrite transaction in liveQuery context" the first time it was
   * tried. Neither changes while this tab is open.
   */
  const [backup, setBackup] = useState<DriveSyncState | undefined>(undefined);
  const [lock, setLock] = useState<LockState | undefined>(undefined);
  useEffect(() => {
    let live = true;
    readState()
      .then((state) => live && setBackup(state))
      .catch(() => undefined);
    getLockState()
      .then((state) => live && setLock(state))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);

  const open = (waiting ?? []).filter((item) => item.tab !== 'PARENT');
  const unprotected = lock?.status === 'UNCLAIMED' || lock?.status === 'LEGACY_PIN';
  const lastBackup = backup?.lastBackupAt
    ? formatPastDate(toLocalISODate(new Date(backup.lastBackupAt)))
    : undefined;

  return (
    <div className="space-y-3">
      <section className="glass-card p-4" aria-labelledby="needs-you">
        <h3 id="needs-you" className="flex items-center gap-2 text-sm font-bold text-white mb-2">
          <Inbox className="w-4 h-4 text-indigo-300" aria-hidden="true" />
          Waiting on you
        </h3>
        {!waiting ? (
          <p className="text-[11px] text-slate-500">Checking…</p>
        ) : open.length === 0 ? (
          <p className="flex items-center gap-1.5 text-xs text-emerald-200">
            <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
            Nothing waiting. The plan and anything to approve will show here.
          </p>
        ) : (
          <ul className="divide-y divide-slate-800">
            {open.map((item) => (
              <li key={item.id} className="py-2 flex flex-wrap items-center gap-2">
                <span className="flex-1 min-w-0">
                  <span className="block text-xs text-slate-100">
                    {item.title}
                    {(item.count ?? 1) > 1 && (
                      <span className="text-slate-400"> ({item.count})</span>
                    )}
                  </span>
                  {item.detail && (
                    <span className="block text-[10px] text-slate-400">{item.detail}</span>
                  )}
                </span>
                {onOpenTab && (
                  <button
                    type="button"
                    onClick={() => onOpenTab(item.tab)}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-[10px] font-bold text-indigo-200"
                  >
                    {item.action}
                    <ArrowRight className="w-3 h-3" aria-hidden="true" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="glass-card p-4 space-y-2" aria-label="Keeping the data safe">
        <p className="flex flex-wrap items-center gap-2 text-xs text-slate-200">
          <Database className="w-4 h-4 text-teal-300" aria-hidden="true" />
          <span className="flex-1 min-w-0">
            {lastBackup ? `Last backup to Drive: ${lastBackup}.` : 'No automatic backup set up yet.'}
            {backup?.lastError && (
              <span className="text-amber-300"> The last attempt failed.</span>
            )}
          </span>
          <button
            type="button"
            onClick={onOpenDataTab}
            className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-[10px] font-bold text-teal-200"
          >
            Backups
          </button>
        </p>
        {unprotected && (
          <p className="flex flex-wrap items-center gap-2 text-xs text-amber-200">
            <ShieldAlert className="w-4 h-4 text-amber-400" aria-hidden="true" />
            <span className="flex-1 min-w-0">
              {lock?.status === 'UNCLAIMED'
                ? 'No parent passphrase is set, so anyone can open this page.'
                : 'Still protected by a four-digit PIN.'}
            </span>
            <button
              type="button"
              onClick={onOpenDataTab}
              className="px-2.5 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-[10px] font-bold text-slate-950"
            >
              Set a passphrase
            </button>
          </p>
        )}
      </section>
    </div>
  );
};

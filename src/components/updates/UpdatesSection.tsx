import React, { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { UserRole } from '../../types';
import { NavTab } from '../layout/Navigation';
import { UpdatesView } from './UpdatesView';
import { ActivityView } from './ActivityView';
import { EvidenceCheck } from './EvidenceCheck';
import { OutstandingPanel } from './OutstandingPanel';
import { buildActivityFeed, needingReview, outstanding } from '../../services/activityService';
import { loadOutstanding } from '../../services/outstandingService';

/**
 * The Updates tab, which now does three different jobs.
 *
 * **To do** is what the tab is opened for, and until Tejas reported it, the one
 * thing it could not answer. The screen led with the change log, so it said
 * "Nothing waiting" while the week sat unfinalised and work ran overdue - true
 * about the change log, and useless as an answer to "what do I need to do?".
 * It leads now, and it reaches across every other tab.
 *
 * **Sign off & send** is the original screen: read back what you did, put it on
 * the record, forward it to the family. It only ever covered the eight things
 * that pass through a confirmation sheet, and that is correct for its purpose -
 * you cannot meaningfully "sign off" a deletion after the fact, and a digest
 * sent to the family group should be the day's achievements rather than a
 * changelog.
 *
 * **All activity** is the complete record: every insert, update and delete, by
 * whom and on which device. This is the half that did not exist, and its absence
 * is why a session that deleted seven records could look, from the Updates tab,
 * like a quiet evening.
 *
 * Keeping them apart rather than merging them is deliberate. Collapsing the two
 * would either bury the sign-off action under noise, or reintroduce the original
 * problem by filtering the feed down to signable things.
 */
export const UpdatesSection: React.FC<{
  currentRole: UserRole;
  onOpenTab: (tab: NavTab) => void;
}> = ({ currentRole, onOpenTab }) => {
  const [pane, setPane] = useState<'TO_DO' | 'SIGN_OFF' | 'ACTIVITY' | 'EVIDENCE'>('TO_DO');
  const [waitingCount, setWaitingCount] = useState(0);

  const todoCount = useLiveQuery(
    async () => (await loadOutstanding(currentRole)).length,
    [currentRole],
    0
  );

  // A count on the tab, so an unapproved goal is visible without opening it.
  useEffect(() => {
    buildActivityFeed(currentRole).then((feed) =>
      // Both kinds of "somebody has to do something": a step the app is waiting
      // on, and a question a person is waiting on.
      setWaitingCount(outstanding(feed.items).length + needingReview(feed.items).length)
    );
  }, [currentRole, pane]);

  return (
    <div>
      <div className="flex flex-wrap gap-1 p-1 bg-slate-900 border border-slate-800 rounded-2xl mb-4">
        <button
          type="button"
          onClick={() => setPane('TO_DO')}
          className={`flex-1 min-w-[86px] py-2 rounded-xl text-sm font-bold transition-colors flex items-center justify-center gap-1.5 ${
            pane === 'TO_DO' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          To do
          {todoCount > 0 && (
            <span className="px-1.5 py-0.5 rounded-full bg-amber-500 text-slate-950 text-[10px] font-black">
              {todoCount}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={() => setPane('SIGN_OFF')}
          className={`flex-1 min-w-[86px] py-2 rounded-xl text-sm font-bold transition-colors ${
            pane === 'SIGN_OFF' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          Sign off &amp; send
        </button>
        <button
          type="button"
          onClick={() => setPane('ACTIVITY')}
          className={`flex-1 min-w-[86px] py-2 rounded-xl text-sm font-bold transition-colors flex items-center justify-center gap-1.5 ${
            pane === 'ACTIVITY' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          All activity
          {waitingCount > 0 && (
            <span className="px-1.5 py-0.5 rounded-full bg-amber-500 text-slate-950 text-[10px] font-black">
              {waitingCount}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={() => setPane('EVIDENCE')}
          className={`flex-1 min-w-[86px] py-2 rounded-xl text-sm font-bold transition-colors ${
            pane === 'EVIDENCE' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          Evidence
        </button>
      </div>

      {/* Four panes, because reviewing an update raises four different
          questions: what is still to do, what changed, is it signed off, and
          can I actually see the work. */}
      {pane === 'TO_DO' && <OutstandingPanel role={currentRole} onOpenTab={onOpenTab} />}
      {pane === 'SIGN_OFF' && <UpdatesView />}
      {pane === 'ACTIVITY' && <ActivityView currentRole={currentRole} />}
      {pane === 'EVIDENCE' && <EvidenceCheck currentRole={currentRole} />}
    </div>
  );
};

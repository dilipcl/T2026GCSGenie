import React, { useEffect, useState } from 'react';
import { UserRole } from '../../types';
import { UpdatesView } from './UpdatesView';
import { ActivityView } from './ActivityView';
import { buildActivityFeed, needingReview, outstanding } from '../../services/activityService';

/**
 * The Updates tab, which now does two different jobs.
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
export const UpdatesSection: React.FC<{ currentRole: UserRole }> = ({ currentRole }) => {
  const [pane, setPane] = useState<'SIGN_OFF' | 'ACTIVITY'>('SIGN_OFF');
  const [waitingCount, setWaitingCount] = useState(0);

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
      <div className="flex gap-1 p-1 bg-slate-900 border border-slate-800 rounded-2xl mb-4">
        <button
          type="button"
          onClick={() => setPane('SIGN_OFF')}
          className={`flex-1 py-2 rounded-xl text-sm font-bold transition-colors ${
            pane === 'SIGN_OFF' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          Sign off &amp; send
        </button>
        <button
          type="button"
          onClick={() => setPane('ACTIVITY')}
          className={`flex-1 py-2 rounded-xl text-sm font-bold transition-colors flex items-center justify-center gap-1.5 ${
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
      </div>

      {pane === 'SIGN_OFF' ? <UpdatesView /> : <ActivityView currentRole={currentRole} />}
    </div>
  );
};

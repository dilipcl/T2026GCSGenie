import React from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db';
import { timerMinutesByTask } from '../../services/focusSessionService';
import { setLoggedMinutes } from '../../services/taskCompletionService';
import { WorkTimeChips } from '../shared/WorkTimeChips';
import { ProofUploader } from '../shared/ProofUploader';

/**
 * The two questions every close asks, under committed work answered "Done".
 *
 * The day list closed the task on the tap and asked nothing more, on the
 * understanding that the homework list further down the check-in was where
 * time and a photo were given. So the same task was listed twice, could be
 * ticked in either, and closed without its time if it was ticked in the one
 * that looked finished. Asked here, the day list is a close like any other and
 * the homework list no longer needs to carry the same work.
 *
 * Reads the task live, so the chips show what is stored rather than a copy
 * that could disagree with it.
 */
export const WorkRowClose: React.FC<{ taskId: string; date: string }> = ({ taskId, date }) => {
  const task = useLiveQuery(() => db.tasks.get(taskId), [taskId]);
  const timers = useLiveQuery(() => timerMinutesByTask(), []);

  if (!task?.completed) return null;

  return (
    <div className="mt-1.5 p-2 rounded-xl bg-slate-900/60 border border-slate-800 space-y-2.5">
      <WorkTimeChips
        value={task.loggedMinutes}
        onChange={(minutes) => setLoggedMinutes(task, minutes, date)}
        timerMinutes={timers?.get(task.id) ?? 0}
        countsTowards={task.subjectId.replace(/_/g, ' ')}
      />
      <ProofUploader
        ownerType="TASK"
        ownerId={task.id}
        label="Photo of it (optional)"
        hint="Without one it waits under Evidence until a photo or a reason is added."
      />
    </div>
  );
};

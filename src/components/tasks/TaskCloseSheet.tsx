import React from 'react';
import { createPortal } from 'react-dom';
import { Task, UserRole } from '../../types';
import { TaskCloseModal } from './TaskCloseModal';
import { closeTask } from '../../services/taskCompletionService';
import { useFeedback } from '../shared/FeedbackProvider';
import { triggerCelebration } from '../../utils/confetti';

/**
 * Closing a piece of work, from anywhere.
 *
 * There were six ways to mark work done, and only My Work's went through the
 * close sheet. The Home "due soon" card, the weekly cockpit and the Plan board
 * each wrote `completed: true` themselves - no proof asked for, no time asked
 * for, and in the Plan board's case no audit line either. Every number that
 * reads finished work was only as good as the least careful of the six.
 *
 * This is the one way now: the sheet asks for proof and time, `closeTask`
 * writes the close with its audit and change-log lines, and the celebration
 * and the toast say the same thing wherever the tap happened.
 *
 * Always portalled to `document.body`. Several of the screens that open it are
 * `.glass-card`s, whose backdrop-filter makes them the containing block for a
 * `position: fixed` child - the sheet would open as a letterbox inside the
 * card.
 */

interface TaskCloseSheetProps {
  task: Task;
  role: UserRole;
  /** Called when the sheet goes away; `closed` says whether the work was. */
  onDone: (closed: boolean) => void;
}

export const TaskCloseSheet: React.FC<TaskCloseSheetProps> = ({ task, role, onDone }) => {
  const { toast } = useFeedback();

  return createPortal(
    <TaskCloseModal
      task={task}
      role={role}
      onCancel={() => onDone(false)}
      onConfirm={async (hadEvidence, loggedMinutes) => {
        await closeTask(task, role, hadEvidence, loggedMinutes);
        onDone(true);
        triggerCelebration({ particleCount: 50 });
        const time = loggedMinutes ? ` ${loggedMinutes} min counted.` : '';
        if (hadEvidence) {
          toast.success(`+${task.xpValue} XP`, `Done, with the proof attached.${time}`);
        } else {
          toast.info(
            `+${task.xpValue} XP`,
            `Done. It is listed under Updates → Evidence until something is attached.${time}`
          );
        }
      }}
    />,
    document.body
  );
};

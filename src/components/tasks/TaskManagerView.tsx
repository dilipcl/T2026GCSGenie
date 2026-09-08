import React, { useState, useEffect } from 'react';
import { db } from '../../db';
import { Task, PriorityLevel, SubjectId, Goal } from '../../types';
import { INITIAL_SUBJECTS } from '../../db/seedData';
import { logAuditEvent } from '../../services/auditService';
import { recordChange } from '../../services/changeLogService';
import { resolveCommentForTask } from '../../services/activityCommentService';
import { triggerCelebration } from '../../utils/confetti';
import { todayISO, formatFriendlyDate } from '../../utils/date';
import {
  ListTodo,
  Plus,
  CheckCircle2,
  Circle,
  Calendar,
  Trash2,
  PencilLine,
  Filter,
  Wrench,
  ArrowRight,
  MessageSquare,
} from 'lucide-react';
import { useFeedback } from '../shared/FeedbackProvider';
import { useChangeGuard } from '../shared/ChangeGuardProvider';
import { WeekCommitmentBanner } from './WeekCommitmentBanner';
import { TaskCloseModal } from './TaskCloseModal';
import { UserRole } from '../../types';

interface TaskManagerViewProps {
  /** Opens the shared add sheet loaded with this task. */
  onEdit?: (task: Task) => void;
  refreshKey?: number;
  onAdd: () => void;
  /**
   * Opens the original Year 9 quests. They keep their own screen because they
   * carry claimed XP and uploaded proof that a plain task has nowhere to put -
   * but that screen is no longer a tab, so this is how it is reached.
   */
  onOpenLegacyFixups?: () => void;
  /** Who is closing the work, so evidence and notes are attributed correctly. */
  currentRole?: UserRole;
}

export const TaskManagerView: React.FC<TaskManagerViewProps> = ({
  refreshKey = 0,
  onAdd,
  onEdit,
  onOpenLegacyFixups,
  currentRole = 'STUDENT',
}) => {
  const { confirm, toast } = useFeedback();
  const { confirmChange } = useChangeGuard();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [selectedSubject, setSelectedSubject] = useState<SubjectId | 'ALL'>('ALL');
  const [selectedPriority, setSelectedPriority] = useState<PriorityLevel | 'ALL'>('ALL');
  const [filterStatus, setFilterStatus] = useState<'ALL' | 'PENDING' | 'COMPLETED'>('PENDING');
  /**
   * Homework and fix-ups are both tasks, so they live in one list - but "what
   * have I got to do" and "what did I get wrong" are different questions, and
   * a fix-up buried among thirty pieces of homework answers neither.
   */
  const [selectedKind, setSelectedKind] = useState<'ALL' | 'HOMEWORK' | 'FIXUP' | 'FOLLOWUP'>(
    'ALL'
  );
  /** Open quests still on the old screen, so the pointer to it can be honest. */
  const [legacyFixups, setLegacyFixups] = useState(0);
  /**
   * The task being closed, while its sheet is open.
   *
   * Ticking the circle no longer writes anything. It was one tap in a list that
   * scrolls under a thumb, and the whole XP and week-execution model rests on
   * that tick meaning a decision rather than an accident.
   */
  const [closing, setClosing] = useState<Task | null>(null);

  const loadData = async () => {
    const tList = await db.tasks.orderBy('dueDate').toArray();
    const gList = await db.goals.toArray();
    setTasks(tList);
    setGoals(gList);
    setLegacyFixups(await db.remediations.filter((r) => !r.isCompleted).count());
  };

  useEffect(() => {
    loadData();
  }, [refreshKey]);

  /**
   * Writes the tick. Never called straight from the circle.
   *
   * Every path into this one goes through a confirmation first, because the
   * circle sits in a list that scrolls under a thumb and a stray tap used to
   * award XP, move the week's delivery score and log a completion nobody had
   * decided on.
   */
  const setCompleted = async (task: Task, done: boolean) => {
    await db.tasks.update(task.id, {
      completed: done,
      completedAt: done ? Date.now() : undefined,
    });

    await logAuditEvent({
      user: currentRole,
      action: 'UPDATE',
      entity: 'Task',
      entityId: task.id,
      fieldChanged: 'completed',
      // "true" tells a parent auditing the log nothing. Say what happened.
      oldValue: task.completed ? 'completed' : 'not completed',
      newValue: done
        ? `Completed "${task.title}" (+${task.xpValue} XP)`
        : `Reopened "${task.title}"`,
    });

    /**
     * A follow-up exists to answer somebody. Ticking it off without settling
     * the question leaves the work saying done and the comment still saying
     * somebody is waiting - and a flag that outlives what it was about is how
     * a review flag becomes furniture.
     */
    if (done && task.isFollowUp) await resolveCommentForTask(task.id, currentRole);

    if (done) triggerCelebration({ particleCount: 50 });
    loadData();
  };

  /**
   * Reopening, which is as consequential as closing and was equally unguarded.
   *
   * It takes the XP back off the week's delivery score and, on a baselined
   * week, changes what the execution bonus pays. Routed through the change
   * guard so it lands in the log a parent reads, rather than silently undoing
   * a number somebody was relying on.
   */
  const reopenTask = async (task: Task) => {
    await confirmChange({
      title: 'Put this back on the list?',
      subject: task.title,
      effect: `−${task.xpValue} XP · it counts as unfinished again`,
      category: 'HOMEWORK',
      entity: 'Task',
      entityId: task.id,
      confirmLabel: 'Yes, reopen it',
      summary: `Reopened "${task.title}"`,
      actor: currentRole,
      run: () => setCompleted(task, false),
    });
  };

  /**
   * Closing. Work that somebody else set or that exists because something went
   * wrong gets the evidence sheet; a task set for yourself gets the ordinary
   * confirmation, because nothing is expected to be shown for it and asking
   * anyway is how a prompt becomes something people dismiss without reading.
   */
  const closeTask = async (task: Task) => {
    if (task.isHomework || task.isRemediation) {
      setClosing(task);
      return;
    }

    await confirmChange({
      title: 'Mark this as done?',
      subject: task.title,
      effect: `+${task.xpValue} XP`,
      category: 'HOMEWORK',
      entity: 'Task',
      entityId: task.id,
      confirmLabel: 'Yes, done',
      summary: `Finished "${task.title}" (+${task.xpValue} XP)`,
      actor: currentRole,
      run: () => setCompleted(task, true),
    });
  };

  const toggleTaskCompleted = (task: Task) =>
    task.completed ? reopenTask(task) : closeTask(task);

  const handleDeleteTask = async (task: Task) => {
    const ok = await confirm({
      title: `Delete "${task.title}"?`,
      body: 'This is recorded in the change history.',
      confirmLabel: 'Delete',
      tone: 'danger',
    });
    if (!ok) return;

    await db.tasks.delete(task.id);
    // Deletes were previously the one change that left no trace, while the
    // Parent Portal advertised a log of every change.
    await logAuditEvent({
      user: 'STUDENT',
      action: 'DELETE',
      entity: 'Task',
      entityId: task.id,
      oldValue: `${task.title} [${task.subjectId}, due ${task.dueDate}, ${task.completed ? 'completed' : 'not completed'}]`,
    });
    loadData();
  };

  // Filter tasks
  const filteredTasks = tasks.filter((t) => {
    if (selectedSubject !== 'ALL' && t.subjectId !== selectedSubject) return false;
    if (selectedPriority !== 'ALL' && t.priority !== selectedPriority) return false;
    if (filterStatus === 'PENDING' && t.completed) return false;
    if (filterStatus === 'COMPLETED' && !t.completed) return false;
    if (selectedKind === 'FIXUP' && !t.isRemediation) return false;
    if (selectedKind === 'FOLLOWUP' && !t.isFollowUp) return false;
    // Homework means work somebody set, so neither of the other two kinds.
    if (selectedKind === 'HOMEWORK' && (t.isRemediation || t.isFollowUp)) return false;
    return true;
  });

  const todayStr = todayISO();
  const overdueCount = tasks.filter((t) => !t.completed && t.dueDate < todayStr).length;

  return (
    <div className="space-y-6">
      {/* The promise, before the list.

          My Work was a flat list of every open task, which answers "what
          exists" and never "am I keeping the promise". Only the second question
          is what finalising a week is for, and it belongs above the list rather
          than somewhere the list eventually implies. */}
      <WeekCommitmentBanner />

      {/* Header Banner */}
      <div className="glass-card p-6 bg-gradient-to-r from-slate-900 via-indigo-950/30 to-slate-900 border-indigo-500/30 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="p-2 rounded-xl bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
              ⚡
            </span>
            <h2 className="text-xl font-bold text-white">My Work</h2>
          </div>
          <p className="text-xs text-slate-300 max-w-xl">
            Everything you have to do, soonest first.
            {overdueCount > 0 && (
              <span className="text-rose-300 font-semibold">
                {' '}
                {overdueCount} {overdueCount === 1 ? 'item is' : 'items are'} overdue.
              </span>
            )}
          </p>
        </div>

        <button
          onClick={onAdd}
          className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-lg shadow-indigo-950/50 flex items-center gap-2 transition-all"
        >
          <Plus className="w-4 h-4" />
          <span>Add homework</span>
        </button>
      </div>

      {/* Filter Bar */}
      <div className="glass-card p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 text-xs text-slate-400 mr-2">
            <Filter className="w-3.5 h-3.5" />
            <span>Filter:</span>
          </div>

          {/* Status Filter */}
          <div className="flex rounded-xl bg-slate-900 border border-slate-800 p-0.5">
            {['PENDING', 'COMPLETED', 'ALL'].map((st) => (
              <button
                key={st}
                onClick={() => setFilterStatus(st as any)}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                  filterStatus === st
                    ? 'bg-indigo-600 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {st}
              </button>
            ))}
          </div>

          {/* Homework or fix-up. */}
          <div className="flex rounded-xl bg-slate-900 border border-slate-800 p-0.5">
            {(
              [
                { id: 'ALL', label: 'All' },
                { id: 'HOMEWORK', label: 'Homework' },
                { id: 'FIXUP', label: 'Fix-ups' },
                // "What have I been asked?" is a different question from "what
                // have I been set?", and a follow-up buried among thirty pieces
                // of homework answers neither.
                { id: 'FOLLOWUP', label: 'Follow-ups' },
              ] as const
            ).map((k) => (
              <button
                key={k.id}
                onClick={() => setSelectedKind(k.id)}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                  selectedKind === k.id
                    ? 'bg-indigo-600 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {k.label}
              </button>
            ))}
          </div>

          {/* Priority Filter */}
          <select
            value={selectedPriority}
            onChange={(e) => setSelectedPriority(e.target.value as any)}
            className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-slate-300"
          >
            <option value="ALL">All Priorities</option>
            <option value="HIGH">High Priority (Urgent)</option>
            <option value="MEDIUM">Medium Priority</option>
            <option value="LOW">Low Priority</option>
          </select>

          {/* Subject Filter */}
          <select
            value={selectedSubject}
            onChange={(e) => setSelectedSubject(e.target.value as any)}
            className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-slate-300"
          >
            <option value="ALL">All Subjects</option>
            {INITIAL_SUBJECTS.map((sub) => (
              <option key={sub.id} value={sub.id}>
                {sub.name}
              </option>
            ))}
          </select>
        </div>

        <span className="text-xs text-slate-400">
          Showing {filteredTasks.length} of {tasks.length} tasks
        </span>
      </div>

      {/* The original Year 9 quests.

          They keep their own screen because they carry claimed XP and uploaded
          proof that a plain task has nowhere to put. It is no longer a tab -
          fixing a mistake is ordinary work and belongs here - so this is how
          what is already recorded stays reachable. */}
      {selectedKind === 'FIXUP' && legacyFixups > 0 && onOpenLegacyFixups && (
        <button
          type="button"
          onClick={onOpenLegacyFixups}
          className="w-full glass-card p-3 flex items-center justify-between gap-3 text-left hover:border-amber-500/40 transition-colors"
        >
          <span className="flex items-center gap-2 min-w-0">
            <Wrench className="w-4 h-4 text-amber-400 flex-shrink-0" />
            <span className="text-xs text-slate-300">
              <strong className="text-white">{legacyFixups}</strong> older quest
              {legacyFixups === 1 ? '' : 's'} from your Year 9 papers, with their working and
              proof
            </span>
          </span>
          <ArrowRight className="w-4 h-4 text-slate-400 flex-shrink-0" />
        </button>
      )}

      {/* Task Cards Grid */}
      <div className="space-y-3">
        {filteredTasks.length === 0 ? (
          <div className="glass-card p-8 text-center text-slate-400 text-xs">
            <ListTodo className="w-8 h-8 text-slate-600 mx-auto mb-2" />
            <p className="font-semibold text-slate-300">No tasks match your filter criteria.</p>
            <p className="text-slate-500 mt-1">Click "Add Priority Task" to create a new assignment.</p>
          </div>
        ) : (
          filteredTasks.map((task) => {
            const isOverdue = !task.completed && task.dueDate < todayStr;
            const linkedGoal = goals.find((g) => g.id === task.linkedGoalId);

            return (
              <div
                key={task.id}
                className={`p-4 rounded-xl border flex flex-wrap items-center justify-between gap-3 transition-all ${
                  task.completed
                    ? 'bg-slate-900/40 border-slate-800 text-slate-500'
                    : isOverdue
                    ? 'bg-rose-950/20 border-rose-500/40 text-slate-200'
                    : 'bg-slate-900/80 border-slate-800 text-slate-200 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center gap-3 flex-1 min-w-[260px]">
                  <button
                    onClick={() => toggleTaskCompleted(task)}
                    className="p-1 hover:scale-110 transition-transform"
                  >
                    {task.completed ? (
                      <CheckCircle2 className="w-5 h-5 text-emerald-400 fill-emerald-400/20" />
                    ) : (
                      <Circle className="w-5 h-5 text-slate-500" />
                    )}
                  </button>

                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-indigo-950 text-indigo-300 border border-indigo-800">
                        {task.subjectId.replace('_', ' ')}
                      </span>

                      <span
                        className={`text-[9px] px-1.5 py-0.2 rounded font-bold uppercase ${
                          task.priority === 'HIGH'
                            ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                            : task.priority === 'MEDIUM'
                            ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                            : 'bg-teal-500/20 text-teal-400 border border-teal-500/30'
                        }`}
                      >
                        {task.priority} Priority
                      </span>

                      {task.isFollowUp && (
                        <span className="inline-flex items-center gap-1 text-[9px] px-1.5 py-0.2 rounded bg-violet-500/15 text-violet-300 border border-violet-500/30 font-bold uppercase">
                          <MessageSquare className="w-2.5 h-2.5" />
                          Follow-up
                        </span>
                      )}

                      {task.isRemediation && (
                        <span className="inline-flex items-center gap-1 text-[9px] px-1.5 py-0.2 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30 font-bold uppercase">
                          <Wrench className="w-2.5 h-2.5" />
                          Fix-up
                        </span>
                      )}

                      {isOverdue && (
                        <span className="text-[9px] px-1.5 py-0.2 rounded bg-rose-950 text-rose-300 border border-rose-700 font-bold uppercase">
                          Overdue
                        </span>
                      )}
                    </div>

                    <h4
                      className={`font-bold text-sm text-white ${
                        task.completed ? 'line-through text-slate-500' : ''
                      }`}
                    >
                      {task.title}
                    </h4>

                    {task.remediationSourceDoc && (
                      <p className="text-[11px] text-amber-200/70 mt-0.5">
                        From {task.remediationSourceDoc}
                      </p>
                    )}

                    {task.description && (
                      <p className="text-xs text-slate-400 mt-0.5">{task.description}</p>
                    )}

                    {linkedGoal && (
                      <p className="text-[11px] text-indigo-300 font-medium mt-1">
                        🎯 Linked Goal: {linkedGoal.title}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-3 text-xs">
                  <span
                    title={`Due ${task.dueDate}`}
                    className={`bg-slate-800 px-2.5 py-1 rounded border border-slate-700 flex items-center gap-1 font-semibold ${
                      isOverdue ? 'text-rose-300' : 'text-slate-300'
                    }`}
                  >
                    <Calendar className="w-3.5 h-3.5 text-indigo-400" />
                    <span>{formatFriendlyDate(task.dueDate)}</span>
                  </span>

                  <span className="text-amber-400 font-bold bg-amber-950/60 px-2 py-0.5 rounded border border-amber-800/60">
                    +{task.xpValue} XP
                  </span>

                  {onEdit && (
                    <button
                      onClick={() => onEdit(task)}
                      aria-label={`Edit task ${task.title}`}
                      title={`Edit "${task.title}"`}
                      className="p-1.5 text-slate-500 hover:text-indigo-300 transition-colors"
                    >
                      <PencilLine className="w-4 h-4" />
                    </button>
                  )}

                  <button
                    onClick={() => handleDeleteTask(task)}
                    aria-label={`Delete task ${task.title}`}
                    title={`Delete "${task.title}"`}
                    className="p-1.5 text-slate-500 hover:text-rose-400 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {closing && (
        <TaskCloseModal
          task={closing}
          role={currentRole}
          onCancel={() => {
            setClosing(null);
            // Evidence may have been attached and then the close abandoned.
            // Re-read, or the row keeps the state it had when the sheet opened.
            loadData();
          }}
          onConfirm={async (hadEvidence) => {
            const task = closing;
            setClosing(null);
            await setCompleted(task, true);
            await recordChange({
              category: 'HOMEWORK',
              summary: `Finished "${task.title}" (+${task.xpValue} XP)`,
              detail: hadEvidence
                ? 'Closed with its evidence attached.'
                : 'Closed with nothing attached — it is listed under Evidence.',
              entity: 'Task',
              entityId: task.id,
              actor: currentRole,
            });
            if (hadEvidence) {
              toast.success(`+${task.xpValue} XP`, 'Done, with the proof attached.');
            } else {
              toast.info(
                `+${task.xpValue} XP`,
                'Done. It is listed under Updates → Evidence until something is attached.'
              );
            }
          }}
        />
      )}
    </div>
  );
};

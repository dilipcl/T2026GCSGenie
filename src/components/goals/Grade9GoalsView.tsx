import React, { useState, useEffect } from 'react';
import { db } from '../../db';
import { SubjectConfig, Goal, ParentSettings, UserRole } from '../../types';
import { calculateSubjectRAG, SubjectRAGResult } from '../../services/ragCalculator';
import { lockedGoalProgress, GoalWeekProgress } from '../../services/goalProgress';
import { allSubjectTrends, goalTrend, type Trend } from '../../services/goalTrend';
import { goalApprovalMessage, messageContext } from '../../services/whatsappService';
import { WhatsAppShare } from '../shared/WhatsAppShare';
import { PaceBar, PACE_TEXT } from '../shared/PaceBar';
import { Sparkline } from '../shared/Sparkline';
import { logAuditEvent } from '../../services/auditService';
import { SubjectDetailModal } from './SubjectDetailModal';
import { GoalConsultationModal } from './GoalConsultationModal';
import { GoalBurndownPanel } from './GoalBurndownPanel';
import { Target, Plus, ShieldCheck, Lock, Unlock, X, PencilLine, Send } from 'lucide-react';
import { useFeedback } from '../shared/FeedbackProvider';
import { useChangeGuard } from '../shared/ChangeGuardProvider';
import { InfoTip } from '../shared/InfoTip';

interface Grade9GoalsViewProps {
  currentRole: UserRole;
}

export const Grade9GoalsView: React.FC<Grade9GoalsViewProps> = ({ currentRole }) => {
  const { toast, confirm } = useFeedback();
  const { confirmChange } = useChangeGuard();
  const [subjects, setSubjects] = useState<SubjectConfig[]>([]);
  const [ragData, setRagData] = useState<Record<string, SubjectRAGResult>>({});
  const [goals, setGoals] = useState<Goal[]>([]);
  const [selectedSubject, setSelectedSubject] = useState<SubjectConfig | null>(null);
  const [isConsultationOpen, setIsConsultationOpen] = useState(false);
  const [editingGoal, setEditingGoal] = useState<Goal | null>(null);
  const [progress, setProgress] = useState<Record<string, GoalWeekProgress>>({});
  const [trends, setTrends] = useState<Record<string, Trend>>({});
  const [subjectTrends, setSubjectTrends] = useState<Record<string, Trend>>({});
  const [settings, setSettings] = useState<ParentSettings | undefined>(undefined);

  const loadData = async () => {
    const subList = await db.subjects.toArray();
    const gList = await db.goals.toArray();
    setSubjects(subList);
    setGoals(gList);

    const rags: Record<string, SubjectRAGResult> = {};
    for (const sub of subList) {
      rags[sub.id] = await calculateSubjectRAG(sub.id);
    }
    setRagData(rags);

    const byGoal: Record<string, GoalWeekProgress> = {};
    const byTrend: Record<string, Trend> = {};
    for (const entry of await lockedGoalProgress()) {
      byGoal[entry.goal.id] = entry;
      byTrend[entry.goal.id] = await goalTrend(entry.goal);
    }
    setProgress(byGoal);
    setTrends(byTrend);

    const bySubject: Record<string, Trend> = {};
    for (const { subjectId, trend } of await allSubjectTrends()) bySubject[subjectId] = trend;
    setSubjectTrends(bySubject);

    setSettings(await db.parentSettings.get('active_settings'));
  };

  useEffect(() => {
    loadData();
  }, []);

  /**
   * Locking a goal is what makes it real: burnoutEngine only counts the weekly
   * hours of APPROVED_LOCKED goals, so until a parent does this the time
   * capacity gauge is ignoring the commitment entirely.
   */
  const handleToggleLock = async (goal: Goal) => {
    const lock = goal.status !== 'APPROVED_LOCKED';

    if (lock) {
      const ok = await confirm({
        title: `Approve and lock "${goal.title}"?`,
        body: `${goal.weeklyHoursRequired} hrs/week will start counting towards the weekly time capacity.`,
        confirmLabel: 'Approve & lock',
      });
      if (!ok) return;
    }

    await db.goals.update(goal.id, {
      status: lock ? 'APPROVED_LOCKED' : 'PENDING_DISCUSSION',
      lockedAt: lock ? Date.now() : undefined,
    });

    await logAuditEvent({
      user: 'PARENT',
      action: 'UPDATE',
      entity: 'Goal',
      entityId: goal.id,
      fieldChanged: 'status',
      oldValue: goal.status,
      newValue: lock
        ? `APPROVED_LOCKED (+${goal.weeklyHoursRequired} hrs/week now counted in burnout capacity)`
        : 'PENDING_DISCUSSION (hours no longer counted)',
    });

    if (lock) toast.celebrate(`"${goal.title}" locked in`, `${goal.weeklyHoursRequired} hrs/week now counts towards the weekly capacity.`);
    else toast.info('Goal unlocked', 'Its hours no longer count towards the weekly capacity.');
    loadData();
  };

  /**
   * A proposed goal previously had exactly one exit: Approve & Lock. A parent
   * who disagreed - or a student who proposed something by mistake - had no
   * way out, and the QA test left a "Stress Test Overload Goal" stranded in
   * Pending for exactly that reason.
   */
  const handleDecline = async (goal: Goal) => {
    const ok = await confirm({
      title: `Decline "${goal.title}"?`,
      body: 'The proposal is removed. It never counted towards the weekly capacity, and declining it is recorded in the change history.',
      confirmLabel: 'Decline',
      tone: 'danger',
    });
    if (!ok) return;

    await db.goals.delete(goal.id);
    await logAuditEvent({
      user: 'PARENT',
      action: 'DELETE',
      entity: 'Goal',
      entityId: goal.id,
      oldValue: `${goal.title} [${goal.category}, ${goal.weeklyHoursRequired} hrs/wk, was ${goal.status}]`,
      newValue: 'Declined by parent',
    });
    toast.info(`Declined "${goal.title}"`);
    loadData();
  };

  /**
   * A draft is the student's own working copy - it is not offered to anyone
   * until this. Without it a draft had no way forward and the DRAFT status was
   * a dead end that only seedData could produce.
   */
  const handleSubmitDraft = async (goal: Goal) => {
    const confirmed = await confirmChange({
      title: 'Send this goal for approval?',
      subject: goal.title,
      effect: `${goal.weeklyHoursRequired} hrs/week once a parent locks it`,
      category: 'GOAL',
      entity: 'Goal',
      entityId: goal.id,
      confirmLabel: 'Send it',
      summary: `Sent goal "${goal.title}" for approval (${goal.weeklyHoursRequired} hrs/week)`,
      run: async () => {
        await db.goals.update(goal.id, { status: 'PENDING_DISCUSSION' });
        await logAuditEvent({
          user: 'STUDENT',
          action: 'UPDATE',
          entity: 'Goal',
          entityId: goal.id,
          fieldChanged: 'status',
          oldValue: 'DRAFT',
          newValue: 'PENDING_DISCUSSION (sent for parent approval)',
        });
      },
    });

    if (!confirmed) return;
    toast.success(`"${goal.title}" sent for approval`, 'A parent reviews it and locks it in.');
    loadData();
  };

  const draftCount = goals.filter((g) => g.status === 'DRAFT').length;
  const pendingCount = goals.filter((g) => g.status === 'PENDING_DISCUSSION').length;
  const lockedHours = goals
    .filter((g) => g.status === 'APPROVED_LOCKED')
    .reduce((sum, g) => sum + (g.weeklyHoursRequired || 0), 0);

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="glass-card p-6 bg-gradient-to-r from-slate-900 via-indigo-950/30 to-slate-900 border-indigo-500/30 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="p-2 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30">
              🏆
            </span>
            <h2 className="text-xl font-bold text-white">Subjects &amp; Goals</h2>
          </div>
          <p className="text-xs text-slate-300 max-w-xl">
            How each subject is tracking against your Grade 9 target. Tap a subject for its topic
            checklist, required practicals and teacher notes.
          </p>
        </div>

        <button
          onClick={() => setIsConsultationOpen(true)}
          className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-lg shadow-indigo-950/50 flex items-center gap-2 transition-all"
        >
          <Plus className="w-4 h-4" />
          <span>Propose SMART Goal</span>
        </button>
      </div>

      {/* Above the subject grid on purpose. "Is the plan still adding up" is
          the question the goals list cannot answer - it shows status per goal,
          never the hours behind them. */}
      <GoalBurndownPanel />

      {/* 6 Core/Elective Subjects Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {subjects.map((sub) => {
          const rag = ragData[sub.id];
          return (
            <div
              key={sub.id}
              onClick={() => setSelectedSubject(sub)}
              className="glass-card glass-card-hover p-5 cursor-pointer relative overflow-hidden group"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-slate-800 flex items-center justify-center text-xl border border-slate-700">
                    {sub.icon}
                  </div>
                  <div>
                    <h3 className="font-bold text-sm text-white group-hover:text-indigo-300 transition-colors">
                      {sub.name}
                    </h3>
                    <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
                      <span className="font-mono">{sub.examBoard}</span>
                      <span>·</span>
                      <span>Target: Grade 9</span>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col items-end gap-1.5">
                  {rag && (
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase border ${
                        rag.ragStatus === 'GREEN'
                          ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                          : rag.ragStatus === 'AMBER'
                          ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                          : 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                      }`}
                    >
                      {rag.ragStatus}
                    </span>
                  )}

                  {/* Four weeks of hours. The RAG badge reads today; this reads
                      the month, and a subject can be green on one and falling
                      on the other - which is the drift the film is about. */}
                  {subjectTrends[sub.id] && (
                    <Sparkline trend={subjectTrends[sub.id]} width={64} height={20} />
                  )}
                </div>
              </div>

              {/* Progress & Metrics */}
              {rag ? (
                <div className="space-y-2 pt-2 border-t border-slate-800/80">
                  <div className="flex justify-between text-xs text-slate-300">
                    <span className="flex items-center gap-1.5">
                      <span>Grade 9 Health</span>
                      <InfoTip label="Grade 9 Health">
                        A 0-100 read on this subject from homework done, fix-ups cleared and topics
                        mastered. Red means it needs attention now.
                      </InfoTip>
                    </span>
                    <span className="font-bold text-indigo-400">{rag.healthScore}/100</span>
                  </div>
                  <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className={`h-full ${
                        rag.ragStatus === 'GREEN'
                          ? 'bg-emerald-500'
                          : rag.ragStatus === 'AMBER'
                          ? 'bg-amber-500'
                          : 'bg-rose-500'
                      }`}
                      style={{ width: `${rag.healthScore}%` }}
                    />
                  </div>

                  <div className="flex justify-between text-[11px] text-slate-400 pt-1">
                    <span>HW: {rag.homeworkCompletionRate}%</span>
                    <span>Remediations: {rag.remediationCompletionRate}%</span>
                    <span>Mastered: {rag.topicsMastered}/{rag.totalTopics}</span>
                  </div>
                </div>
              ) : (
                <div className="text-xs text-slate-500">Loading metrics...</div>
              )}
            </div>
          );
        })}
      </div>

      {/* Active SMART Goals Consultation Ledger */}
      <div className="glass-card p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Target className="w-5 h-5 text-indigo-400" />
            <h3 className="font-bold text-sm text-white">Your goals</h3>
          </div>
          <span className="text-xs text-slate-400">
            {goals.length} registered · {lockedHours} hrs/week locked in
          </span>
        </div>

        {draftCount > 0 && (
          <div className="mb-3 p-3 bg-slate-800/50 border border-slate-700 rounded-xl text-xs text-slate-300 flex items-start gap-2">
            <PencilLine className="w-4 h-4 text-slate-400 flex-shrink-0 mt-0.5" />
            <span>
              {draftCount} draft{draftCount === 1 ? '' : 's'} - still yours to change. Send one for
              approval when it reads right.
            </span>
          </div>
        )}

        {pendingCount > 0 && (
          <div className="mb-4 p-3 bg-amber-950/30 border border-amber-500/40 rounded-xl text-xs text-amber-100 flex items-start gap-2">
            <Lock className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
            <span>
              {pendingCount} goal{pendingCount === 1 ? '' : 's'} waiting to be approved.{' '}
              {currentRole === 'PARENT'
                ? 'Until a goal is locked, its hours are not counted in the weekly time capacity.'
                : 'Ask a parent to unlock the Parent view and approve them - until then their hours are not counted in the weekly time capacity.'}
            </span>
          </div>
        )}

        <div className="space-y-3">
          {goals.map((g) => (
            <div
              key={g.id}
              className="p-4 bg-slate-900/70 border border-slate-800 rounded-xl flex flex-wrap items-center justify-between gap-3"
            >
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase ${
                      g.category === 'ACADEMIC_GRADE_9'
                        ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                        : g.category === 'CO_CURRICULAR'
                        ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                        : 'bg-teal-500/20 text-teal-300 border border-teal-500/30'
                    }`}
                  >
                    {g.category.replace('_', ' ')}
                  </span>
                  <h4 className="font-bold text-sm text-white">{g.title}</h4>
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded font-semibold uppercase ${
                      g.status === 'APPROVED_LOCKED'
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                        : g.status === 'DRAFT'
                        ? 'bg-slate-700/50 text-slate-300 border border-slate-600'
                        : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                    }`}
                  >
                    {g.status.replace(/_/g, ' ')}
                  </span>
                </div>

                <div className="text-xs text-slate-400 space-y-0.5">
                  <p>
                    <strong className="text-slate-300">Specific:</strong> {g.smartSpecific}
                  </p>
                  <p>
                    <strong className="text-slate-300">Measure:</strong> {g.smartMeasurable}
                  </p>
                </div>

                {/* Hours reserved vs hours actually worked. A locked goal used
                    to reserve time in the capacity model and then never be
                    checked against it. */}
                {progress[g.id] && (
                  <div className="mt-2 max-w-xs">
                    {progress[g.id].isUnattributable ? (
                      <p className="text-[11px] text-slate-500">
                        No subject set, so study time cannot be counted towards this. Edit the goal
                        to pick one.
                      </p>
                    ) : (
                      <>
                        <div className="flex items-center justify-between gap-2 text-[11px] mb-1">
                          <span className="text-slate-400">This week</span>
                          <div className="flex items-center gap-2">
                            <span className={`font-bold ${PACE_TEXT[progress[g.id].pace]}`}>
                              {progress[g.id].actualHours} / {progress[g.id].targetHours}h
                            </span>
                            {/* Four weeks of the same number, so a month of
                                quiet decline is visible next to a week that
                                looks fine on its own. */}
                            {trends[g.id] && (
                              <Sparkline
                                trend={trends[g.id]}
                                targetHours={progress[g.id].targetHours}
                                width={72}
                                height={22}
                              />
                            )}
                          </div>
                        </div>

                        {/* The pale tick is the share expected by the end of
                            today. It was already computed and only ever shown
                            as a sentence, and only once the goal was already
                            behind. */}
                        <PaceBar
                          percent={progress[g.id].percentOfWeek}
                          proRatedPercent={progress[g.id].proRatedPercent}
                          pace={progress[g.id].pace}
                        />

                        <p
                          className={`mt-1 text-[11px] ${
                            progress[g.id].pace === 'AHEAD' ? 'text-slate-400' : PACE_TEXT[progress[g.id].pace]
                          }`}
                        >
                          {progress[g.id].pace === 'STALLED'
                            ? `Nothing logged yet this week — ${progress[g.id].proRatedTargetHours}h was expected by today.`
                            : progress[g.id].pace === 'BEHIND'
                            ? `Needs action - ${progress[g.id].proRatedTargetHours}h expected by today.`
                            : `On pace — ${progress[g.id].proRatedTargetHours}h expected by today.`}
                        </p>

                        {trends[g.id]?.message && (
                          <p className="mt-1 text-[11px] text-slate-400">{trends[g.id].message}</p>
                        )}
                      </>
                    )}
                  </div>
                )}

                {/* WA-3. A goal is "yours to argue with" - which needs the
                    other person to know it is waiting. */}
                {g.status !== 'APPROVED_LOCKED' && currentRole === 'STUDENT' && (
                  <div className="mt-3">
                    <WhatsAppShare
                      compact
                      previewLabel="See the message"
                      text={goalApprovalMessage(messageContext(settings), g)}
                    />
                  </div>
                )}
              </div>

              <div className="flex items-center gap-3">
                <span
                  className={`text-xs font-mono px-2.5 py-1 rounded border ${
                    g.status === 'APPROVED_LOCKED'
                      ? 'text-emerald-300 bg-emerald-500/10 border-emerald-500/30'
                      : 'text-slate-400 bg-slate-800 border-slate-700 line-through decoration-slate-600'
                  }`}
                  title={
                    g.status === 'APPROVED_LOCKED'
                      ? 'Counted in the weekly time capacity'
                      : 'Not counted until a parent approves this goal'
                  }
                >
                  {g.weeklyHoursRequired} hrs/wk
                </span>

                <InfoTip label="Weekly hours">
                  The weekly time this goal needs. It only counts towards your week once a parent
                  locks the goal.
                </InfoTip>

                {g.status === 'APPROVED_LOCKED' && (
                  <span className="text-[11px] text-emerald-400 flex items-center gap-1">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>Locked</span>
                  </span>
                )}

                {/* Editing was the largest gap in the app: a goal used to be
                    write-once, so "the student reviews and finalises, then the
                    parent reviews" had no screen to happen on. A locked goal
                    stays parent-only. */}
                {(g.status !== 'APPROVED_LOCKED' || currentRole === 'PARENT') && (
                  <button
                    onClick={() => setEditingGoal(g)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold border bg-slate-800 border-slate-700 text-slate-300 hover:text-indigo-300 hover:border-indigo-500/40 transition-all"
                  >
                    <PencilLine className="w-3.5 h-3.5" />
                    <span>Edit</span>
                  </button>
                )}

                {g.status === 'DRAFT' && (
                  <button
                    onClick={() => handleSubmitDraft(g)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold border bg-indigo-600 border-indigo-500 text-white hover:bg-indigo-500 transition-all"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>Send for approval</span>
                  </button>
                )}

                {currentRole === 'PARENT' && g.status !== 'APPROVED_LOCKED' && (
                  <button
                    onClick={() => handleDecline(g)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold border bg-slate-800 border-slate-700 text-slate-400 hover:text-rose-300 hover:border-rose-500/40 transition-all"
                  >
                    <X className="w-3.5 h-3.5" />
                    <span>Decline</span>
                  </button>
                )}
                {currentRole === 'PARENT' && g.status !== 'DRAFT' && (
                  <button
                    onClick={() => handleToggleLock(g)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold border transition-all ${
                      g.status === 'APPROVED_LOCKED'
                        ? 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
                        : 'bg-emerald-600 border-emerald-500 text-white hover:bg-emerald-500'
                    }`}
                  >
                    {g.status === 'APPROVED_LOCKED' ? (
                      <>
                        <Unlock className="w-3.5 h-3.5" />
                        <span>Unlock</span>
                      </>
                    ) : (
                      <>
                        <Lock className="w-3.5 h-3.5" />
                        <span>Approve &amp; Lock</span>
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Modals */}
      <SubjectDetailModal
        subject={selectedSubject}
        isOpen={!!selectedSubject}
        onClose={() => setSelectedSubject(null)}
        onRefresh={loadData}
      />

      <GoalConsultationModal
        isOpen={isConsultationOpen || !!editingGoal}
        goal={editingGoal}
        currentRole={currentRole}
        onClose={() => {
          setIsConsultationOpen(false);
          setEditingGoal(null);
        }}
        onSuccess={loadData}
      />
    </div>
  );
};

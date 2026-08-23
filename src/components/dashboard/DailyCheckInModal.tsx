import React, { useState, useEffect } from 'react';
import { db } from '../../db';
import { Task, CheckInSession } from '../../types';
import { logAuditEvent } from '../../services/auditService';
import { triggerCelebration } from '../../utils/confetti';
import {
  X,
  Sparkles,
  CheckCircle2,
  Clock,
  Zap,
  HelpCircle,
  Lightbulb,
  ArrowRight,
  BookmarkCheck,
} from 'lucide-react';

interface DailyCheckInModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const DailyCheckInModal: React.FC<DailyCheckInModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [session, setSession] = useState<CheckInSession>('EVENING');
  const [energy, setEnergy] = useState<1 | 2 | 3 | 4 | 5>(4);
  const [focus, setFocus] = useState<'LOW' | 'NORMAL' | 'HIGH'>('NORMAL');
  const [pendingTasks, setPendingTasks] = useState<Task[]>([]);
  const [completedTaskIds, setCompletedTaskIds] = useState<string[]>([]);
  const [revisionMinutes, setRevisionMinutes] = useState<number>(30);

  // Structured Log Questions
  const [blockersAndQuestions, setBlockersAndQuestions] = useState('');
  const [keyLearning, setKeyLearning] = useState('');
  const [actionForTomorrow, setActionForTomorrow] = useState('');
  const [category, setCategory] = useState<'ACADEMIC' | 'CO_CURRICULAR' | 'PERSONAL' | 'WELL_BEING'>('ACADEMIC');

  const [hasCheckedInToday, setHasCheckedInToday] = useState(false);
  const [todayCheckInCount, setTodayCheckInCount] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const todayStr = new Date().toISOString().split('T')[0];

  useEffect(() => {
    if (isOpen) {
      // 1. Check existing check-ins today
      db.checkIns.where('date').equals(todayStr).toArray().then((existing) => {
        setHasCheckedInToday(existing.length > 0);
        setTodayCheckInCount(existing.length);
      });

      // 2. Fetch pending tasks
      db.tasks.where('completed').equals(0).toArray().then((tasks) => setPendingTasks(tasks));

      // Auto detect session based on hour
      const hour = new Date().getHours();
      if (hour < 12) setSession('MORNING');
      else if (hour < 17) setSession('AFTERNOON');
      else setSession('EVENING');
    }
  }, [isOpen, todayStr]);

  if (!isOpen) return null;

  const toggleTask = (id: string) => {
    setCompletedTaskIds((prev) =>
      prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]
    );
  };

  const calculateXPEarned = () => {
    // Base daily XP (+10 XP) awarded ONLY on the first check-in of the day
    const baseCheckInXP = hasCheckedInToday ? 0 : 10;
    const taskXP = completedTaskIds.length * 50;
    const revisionXP = Math.floor(revisionMinutes / 30) * 10;
    return baseCheckInXP + taskXP + revisionXP;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const now = Date.now();
      const xpEarned = calculateXPEarned();
      const isDailyBase = !hasCheckedInToday;

      // 1. Record Structured Check-in
      const checkInId = `checkin_${todayStr}_${now}`;
      await db.checkIns.add({
        id: checkInId,
        date: todayStr,
        timestamp: now,
        session,
        energyLevel: energy,
        focusRating: focus,
        completedHomeworkIds: completedTaskIds,
        completedRevisionMinutes: revisionMinutes,
        structuredNotes: {
          blockersAndQuestions: blockersAndQuestions.trim() || undefined,
          keyLearning: keyLearning.trim() || undefined,
          actionForTomorrow: actionForTomorrow.trim() || undefined,
          category,
        },
        notes: keyLearning.trim() || blockersAndQuestions.trim() || undefined,
        xpEarned,
        isDailyBaseXPAwarded: isDailyBase,
      });

      // 2. Mark completed tasks
      for (const taskId of completedTaskIds) {
        await db.tasks.update(taskId, {
          completed: true,
          completedAt: now,
        });
      }

      // 3. Write to write-only audit trail
      await logAuditEvent({
        user: 'STUDENT',
        action: 'INSERT',
        entity: 'DailyCheckIn',
        entityId: checkInId,
        newValue: `[${session}] Energy: ${energy}, Focus: ${focus}, Tasks Done: ${completedTaskIds.length}, Study: ${revisionMinutes}m, XP: +${xpEarned} (Base Awarded: ${isDailyBase})`,
      });

      triggerCelebration();
      onSuccess();
      onClose();
    } catch (err) {
      console.error('Failed to submit check-in:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl max-w-lg w-full p-6 shadow-2xl relative max-h-[90vh] overflow-y-auto">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center border border-emerald-500/30">
            <Zap className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold text-white">Daily Check-in & Learning Log</h2>
              {todayCheckInCount > 0 && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-950 text-indigo-300 border border-indigo-800">
                  Log #{todayCheckInCount + 1} Today
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400">Multiple daily check-ins supported (Morning / Study / Evening)</p>
          </div>
        </div>

        {/* Multiple Check-in Info Badge */}
        {hasCheckedInToday && (
          <div className="p-2.5 bg-indigo-950/40 border border-indigo-500/40 rounded-xl mb-4 text-[11px] text-indigo-300 flex items-center gap-2">
            <BookmarkCheck className="w-4 h-4 text-indigo-400 flex-shrink-0" />
            <span>
              Daily base +10 XP was already banked earlier today. Homework (+50 XP) and study time will be added!
            </span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Session Selector */}
          <div className="grid grid-cols-4 gap-1.5">
            {[
              { id: 'MORNING', label: '🌅 Morning' },
              { id: 'AFTERNOON', label: '☀️ Afternoon' },
              { id: 'STUDY_SESSION', label: '📖 Study' },
              { id: 'EVENING', label: '🌙 Evening' },
            ].map((item) => (
              <button
                type="button"
                key={item.id}
                onClick={() => setSession(item.id as any)}
                className={`py-1.5 rounded-lg text-xs font-semibold border transition-all text-center ${
                  session === item.id
                    ? 'bg-indigo-600 text-white border-indigo-400'
                    : 'bg-slate-800/80 text-slate-400 border-slate-700 hover:bg-slate-800'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          {/* Energy & Focus */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase mb-1.5">
                Energy Level
              </label>
              <div className="grid grid-cols-5 gap-1">
                {[1, 2, 3, 4, 5].map((val) => (
                  <button
                    type="button"
                    key={val}
                    onClick={() => setEnergy(val as any)}
                    className={`py-1.5 rounded-lg text-xs font-bold border transition-all ${
                      energy === val
                        ? 'bg-emerald-600 text-white border-emerald-400'
                        : 'bg-slate-800 text-slate-400 border-slate-700'
                    }`}
                  >
                    {val === 1 ? '😴' : val === 2 ? '🥱' : val === 3 ? '😐' : val === 4 ? '⚡' : '🚀'}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase mb-1.5">
                Academic Focus
              </label>
              <div className="grid grid-cols-3 gap-1">
                {['LOW', 'NORMAL', 'HIGH'].map((id) => (
                  <button
                    type="button"
                    key={id}
                    onClick={() => setFocus(id as any)}
                    className={`py-1.5 rounded-lg text-[11px] font-bold border transition-all ${
                      focus === id
                        ? 'bg-teal-600 text-white border-teal-400'
                        : 'bg-slate-800 text-slate-400 border-slate-700'
                    }`}
                  >
                    {id}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Homework Completed Checklist */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase mb-1.5 flex items-center justify-between">
              <span>Homework Completed in this Session</span>
              <span className="text-[11px] text-indigo-400 font-normal">+50 XP per task</span>
            </label>
            {pendingTasks.length === 0 ? (
              <div className="p-2.5 bg-slate-800/40 rounded-xl border border-slate-800 text-xs text-slate-400 text-center">
                🎉 No pending tasks! All clear.
              </div>
            ) : (
              <div className="space-y-1.5 max-h-32 overflow-y-auto pr-1">
                {pendingTasks.map((task) => {
                  const isChecked = completedTaskIds.includes(task.id);
                  return (
                    <div
                      key={task.id}
                      onClick={() => toggleTask(task.id)}
                      className={`p-2 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${
                        isChecked
                          ? 'bg-emerald-950/40 border-emerald-500/50 text-emerald-200'
                          : 'bg-slate-800/50 border-slate-700/60 text-slate-300 hover:bg-slate-800'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <CheckCircle2
                          className={`w-4 h-4 ${
                            isChecked ? 'text-emerald-400 fill-emerald-400/20' : 'text-slate-500'
                          }`}
                        />
                        <span className="text-xs font-medium">{task.title}</span>
                      </div>
                      <span className="text-[10px] px-2 py-0.5 rounded bg-slate-700/60 text-slate-300">
                        {task.subjectId.replace('_', ' ')}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Focused Study Slider */}
          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="text-xs font-semibold text-slate-300 uppercase flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-indigo-400" />
                <span>Session Study Duration</span>
              </label>
              <span className="text-xs font-bold text-indigo-400 bg-indigo-950 px-2 py-0.5 rounded border border-indigo-800">
                {revisionMinutes} Minutes
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="120"
              step="15"
              value={revisionMinutes}
              onChange={(e) => setRevisionMinutes(Number(e.target.value))}
              className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-500"
            />
          </div>

          {/* STRUCTURED QUESTIONS SECTION */}
          <div className="p-3.5 bg-slate-800/50 rounded-2xl border border-slate-700/70 space-y-3">
            <h4 className="text-xs font-bold text-indigo-300 uppercase tracking-wider flex items-center gap-1.5">
              <Lightbulb className="w-4 h-4 text-amber-400" />
              <span>Structured Daily Learning & Follow-Up Log</span>
            </h4>

            {/* Q1: Key Concept */}
            <div>
              <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                1. Key Concept Mastered Today
              </label>
              <input
                type="text"
                placeholder="e.g. Mastered independent probability formula P(A∩B) = P(A)P(B)"
                value={keyLearning}
                onChange={(e) => setKeyLearning(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
              />
            </div>

            {/* Q2: Follow-up & Teacher Questions */}
            <div>
              <label className="block text-[11px] font-semibold text-slate-300 mb-1 flex items-center gap-1">
                <HelpCircle className="w-3 h-3 text-rose-400" />
                <span>2. Follow-Up / Questions to Ask Teacher Tomorrow</span>
              </label>
              <input
                type="text"
                placeholder="e.g. Ask Mr. Davies why coordinate center ray inverts on negative scale factor"
                value={blockersAndQuestions}
                onChange={(e) => setBlockersAndQuestions(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
              />
            </div>

            {/* Q3: Tomorrow's Action Item */}
            <div>
              <label className="block text-[11px] font-semibold text-slate-300 mb-1 flex items-center gap-1">
                <ArrowRight className="w-3 h-3 text-emerald-400" />
                <span>3. Key Action Item for Tomorrow</span>
              </label>
              <input
                type="text"
                placeholder="e.g. Submit CS homework to teacher AMN on time"
                value={actionForTomorrow}
                onChange={(e) => setActionForTomorrow(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
              />
            </div>

            {/* Categorization */}
            <div>
              <label className="block text-[10px] font-semibold text-slate-400 uppercase mb-1">
                Log Category
              </label>
              <div className="grid grid-cols-4 gap-1">
                {[
                  { id: 'ACADEMIC', label: 'Academic' },
                  { id: 'CO_CURRICULAR', label: 'Cadets/Drums' },
                  { id: 'PERSONAL', label: 'Personal' },
                  { id: 'WELL_BEING', label: 'Rest/Health' },
                ].map((item) => (
                  <button
                    type="button"
                    key={item.id}
                    onClick={() => setCategory(item.id as any)}
                    className={`py-1 rounded text-[10px] font-semibold border transition-all ${
                      category === item.id
                        ? 'bg-indigo-600 text-white border-indigo-400'
                        : 'bg-slate-900 text-slate-400 border-slate-700'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Submit Button */}
          <div className="pt-2">
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-sm shadow-lg shadow-emerald-950/50 flex items-center justify-center gap-2 active:scale-98 transition-all"
            >
              <Sparkles className="w-4 h-4 text-emerald-200" />
              <span>Save Check-in (+{calculateXPEarned()} XP)</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

import React, { useState, useEffect } from 'react';
import { db } from '../../db';
import { Task } from '../../types';
import { logAuditEvent } from '../../services/auditService';
import { triggerCelebration } from '../../utils/confetti';
import { X, Sparkles, CheckCircle2, Clock, Zap } from 'lucide-react';

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
  const [energy, setEnergy] = useState<1 | 2 | 3 | 4 | 5>(4);
  const [focus, setFocus] = useState<'LOW' | 'NORMAL' | 'HIGH'>('NORMAL');
  const [pendingTasks, setPendingTasks] = useState<Task[]>([]);
  const [completedTaskIds, setCompletedTaskIds] = useState<string[]>([]);
  const [revisionMinutes, setRevisionMinutes] = useState<number>(30);
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      db.tasks
        .where('completed')
        .equals(0)
        .toArray()
        .then((tasks) => setPendingTasks(tasks));
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const toggleTask = (id: string) => {
    setCompletedTaskIds((prev) =>
      prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]
    );
  };

  const calculateXPEarned = () => {
    const baseCheckInXP = 10;
    const taskXP = completedTaskIds.length * 50;
    const revisionXP = Math.floor(revisionMinutes / 30) * 10;
    return baseCheckInXP + taskXP + revisionXP;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const todayStr = new Date().toISOString().split('T')[0];
      const xpEarned = calculateXPEarned();

      // 1. Record Check-in
      await db.checkIns.put({
        id: todayStr,
        date: todayStr,
        timestamp: Date.now(),
        energyLevel: energy,
        focusRating: focus,
        completedHomeworkIds: completedTaskIds,
        completedRevisionMinutes: revisionMinutes,
        notes: notes.trim(),
        xpEarned,
      });

      // 2. Mark completed tasks
      for (const taskId of completedTaskIds) {
        await db.tasks.update(taskId, {
          completed: true,
          completedAt: Date.now(),
        });
      }

      // 3. Write to write-only audit trail
      await logAuditEvent({
        user: 'STUDENT',
        action: 'INSERT',
        entity: 'DailyCheckIn',
        entityId: todayStr,
        newValue: `Energy: ${energy}, Focus: ${focus}, Tasks Done: ${completedTaskIds.length}, Revision: ${revisionMinutes}m, XP: +${xpEarned}`,
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

        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center border border-emerald-500/30">
            <Zap className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">Daily 2-Minute Check-in</h2>
            <p className="text-xs text-slate-400">Log consistency, check off homework, and bank XP</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Energy Rating */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
              Today's Energy Level
            </label>
            <div className="grid grid-cols-5 gap-2">
              {[
                { val: 1, label: '😴 Low' },
                { val: 2, label: '🥱 Tired' },
                { val: 3, label: '😐 Okay' },
                { val: 4, label: '⚡ High' },
                { val: 5, label: '🚀 Peak' },
              ].map((item) => (
                <button
                  type="button"
                  key={item.val}
                  onClick={() => setEnergy(item.val as any)}
                  className={`py-2 px-1 rounded-xl text-xs font-medium border transition-all text-center ${
                    energy === item.val
                      ? 'bg-indigo-600 text-white border-indigo-400 shadow-md shadow-indigo-900/40 scale-105'
                      : 'bg-slate-800/80 text-slate-300 border-slate-700 hover:bg-slate-800'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          {/* Focus Rating */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
              Academic Focus
            </label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: 'LOW', label: 'Distracted' },
                { id: 'NORMAL', label: 'Solid' },
                { id: 'HIGH', label: 'Deep Focus' },
              ].map((item) => (
                <button
                  type="button"
                  key={item.id}
                  onClick={() => setFocus(item.id as any)}
                  className={`py-2 rounded-xl text-xs font-medium border transition-all ${
                    focus === item.id
                      ? 'bg-teal-600 text-white border-teal-400 shadow-md'
                      : 'bg-slate-800/80 text-slate-300 border-slate-700 hover:bg-slate-800'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          {/* Homework Completed Checklist */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2 flex items-center justify-between">
              <span>Homework & Tasks Completed Today</span>
              <span className="text-[11px] text-indigo-400 font-normal">+50 XP per task</span>
            </label>
            {pendingTasks.length === 0 ? (
              <div className="p-3 bg-slate-800/40 rounded-xl border border-slate-800 text-xs text-slate-400 text-center">
                🎉 No pending homework tasks logged for today!
              </div>
            ) : (
              <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                {pendingTasks.map((task) => {
                  const isChecked = completedTaskIds.includes(task.id);
                  return (
                    <div
                      key={task.id}
                      onClick={() => toggleTask(task.id)}
                      className={`p-2.5 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${
                        isChecked
                          ? 'bg-emerald-950/40 border-emerald-500/50 text-emerald-200'
                          : 'bg-slate-800/50 border-slate-700/60 text-slate-300 hover:bg-slate-800'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
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

          {/* Focused Revision Slider */}
          <div>
            <div className="flex justify-between items-center mb-1.5">
              <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-indigo-400" />
                <span>Focused Independent Study</span>
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
            <div className="flex justify-between text-[10px] text-slate-400 mt-1">
              <span>0m</span>
              <span>30m</span>
              <span>60m</span>
              <span>90m</span>
              <span>120m</span>
            </div>
          </div>

          {/* Optional Reflection Note */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
              Quick Reflection / Tricky Concepts
            </label>
            <input
              type="text"
              placeholder="e.g. Practiced Edexcel Venn probability question 14..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
            />
          </div>

          {/* Submit Button with Live XP Preview */}
          <div className="pt-2">
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-sm shadow-lg shadow-emerald-950/50 flex items-center justify-center gap-2 active:scale-98 transition-all"
            >
              <Sparkles className="w-4 h-4 text-emerald-200" />
              <span>Complete Check-in (+{calculateXPEarned()} XP)</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

import React, { useState } from 'react';
import { db } from '../../db';
import { Goal } from '../../types';
import { calculateBurnoutCapacity } from '../../services/burnoutEngine';
import { logAuditEvent } from '../../services/auditService';
import { X, Target, AlertTriangle, Sparkles } from 'lucide-react';
import { newId } from '../../utils/id';

interface GoalConsultationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const GoalConsultationModal: React.FC<GoalConsultationModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<'ACADEMIC_GRADE_9' | 'CO_CURRICULAR' | 'PERSONAL'>('CO_CURRICULAR');
  const [specific, setSpecific] = useState('');
  const [measurable, setMeasurable] = useState('');
  const [achievable, setAchievable] = useState('');
  const [realistic, setRealistic] = useState('');
  const [timeBound, setTimeBound] = useState('');
  const [hours, setHours] = useState<number>(2.0);
  const [burnoutWarning, setBurnoutWarning] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleHoursChange = async (newHours: number) => {
    setHours(newHours);
    const burnout = await calculateBurnoutCapacity();
    const projectedHours = burnout.totalScheduledHours + newHours;
    if (projectedHours > burnout.safeWeeklyHoursLimit) {
      setBurnoutWarning(
        `Warning: Adding ${newHours}h will push total weekly commitments to ${
          Math.round(projectedHours * 10) / 10
        }h (Exceeds the safe ${burnout.safeWeeklyHoursLimit}h limit by ${
          Math.round((projectedHours - burnout.safeWeeklyHoursLimit) * 10) / 10
        }h). This will be flagged for MoSCoW prioritization during parent review.`
      );
    } else {
      setBurnoutWarning(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    const newGoal: Goal = {
      id: newId('goal'),
      title: title.trim(),
      category,
      smartSpecific: specific.trim(),
      smartMeasurable: measurable.trim(),
      smartAchievable: achievable.trim(),
      smartRealistic: realistic.trim(),
      smartTimeBound: timeBound.trim(),
      status: 'PENDING_DISCUSSION',
      ragStatus: 'GREEN',
      weeklyHoursRequired: hours,
      createdAt: Date.now(),
    };

    await db.goals.add(newGoal);
    await logAuditEvent({
      user: 'STUDENT',
      action: 'INSERT',
      entity: 'Goal',
      entityId: newGoal.id,
      newValue: `Proposed Goal: ${newGoal.title} (${hours}h/wk, Status: PENDING_DISCUSSION)`,
    });

    onSuccess();
    onClose();
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
          <div className="w-10 h-10 rounded-xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center border border-indigo-500/30">
            <Target className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">Propose SMART Goal</h2>
            <p className="text-xs text-slate-400">Collaborative Student-Parent goal consultation flow</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
              Goal Title
            </label>
            <input
              type="text"
              placeholder="e.g. Join Local Football Club / Master OCR CS SQL"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div className="grid grid-cols-3 gap-2">
            {[
              { id: 'ACADEMIC_GRADE_9', label: 'Academic (Grade 9)' },
              { id: 'CO_CURRICULAR', label: 'Co-Curricular' },
              { id: 'PERSONAL', label: 'Personal' },
            ].map((item) => (
              <button
                type="button"
                key={item.id}
                onClick={() => setCategory(item.id as any)}
                className={`py-2 rounded-xl text-xs font-medium border transition-all text-center ${
                  category === item.id
                    ? 'bg-indigo-600 text-white border-indigo-400 shadow-md'
                    : 'bg-slate-800 text-slate-400 border-slate-700'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          {/* SMART Form Fields */}
          <div className="p-3 bg-slate-800/40 rounded-xl border border-slate-700/60 space-y-2.5">
            <div>
              <label className="block text-[11px] font-bold text-indigo-300 uppercase">
                S - Specific (What exact activity / subject?)
              </label>
              <input
                type="text"
                placeholder="e.g. Guildford City FC U15 training on Wednesday evening"
                value={specific}
                onChange={(e) => setSpecific(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-slate-500"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-indigo-300 uppercase">
                M - Measurable (How will progress be tracked?)
              </label>
              <input
                type="text"
                placeholder="e.g. Attend 2 training sessions per week"
                value={measurable}
                onChange={(e) => setMeasurable(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-slate-500"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-indigo-300 uppercase">
                A - Achievable (Does this fit your schedule?)
              </label>
              <input
                type="text"
                placeholder="e.g. Fits after school before cadets starts"
                value={achievable}
                onChange={(e) => setAchievable(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-slate-500"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-indigo-300 uppercase">
                R - Realistic (Impact on Grade 9 academic targets?)
              </label>
              <input
                type="text"
                placeholder="e.g. Kept to max 2 hours to avoid academic stress"
                value={realistic}
                onChange={(e) => setRealistic(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-slate-500"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-indigo-300 uppercase">
                T - Time-Bound (Target completion / trial deadline?)
              </label>
              <input
                type="text"
                placeholder="e.g. Complete trials by November 2026"
                value={timeBound}
                onChange={(e) => setTimeBound(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-slate-500"
              />
            </div>
          </div>

          {/* Hours Required Slider */}
          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                Weekly Time Commitment Required
              </label>
              <span className="text-xs font-bold text-indigo-400 bg-indigo-950 px-2 py-0.5 rounded border border-indigo-800">
                {hours} hrs / week
              </span>
            </div>
            <input
              type="range"
              min="0.5"
              max="10.0"
              step="0.5"
              value={hours}
              onChange={(e) => handleHoursChange(Number(e.target.value))}
              className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-500"
            />
          </div>

          {/* Burnout Risk Notification Banner */}
          {burnoutWarning && (
            <div className="p-3 bg-rose-950/40 rounded-xl border border-rose-500/50 text-xs text-rose-200 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-400 flex-shrink-0 mt-0.5" />
              <p>{burnoutWarning}</p>
            </div>
          )}

          <div className="pt-2">
            <button
              type="submit"
              className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs uppercase tracking-wider shadow-lg shadow-indigo-950/50 flex items-center justify-center gap-2"
            >
              <Sparkles className="w-4 h-4" />
              <span>Submit for Parental Discussion & Locking</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

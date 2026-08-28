import React, { useState, useEffect } from 'react';
import { db } from '../../db';
import { DailyCheckIn } from '../../types';
import { X, Calendar, Lightbulb, HelpCircle, ArrowRight, BookmarkCheck } from 'lucide-react';
import { useEscapeToClose } from '../../hooks/useEscapeToClose';

interface CheckInHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CheckInHistoryModal: React.FC<CheckInHistoryModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [checkIns, setCheckIns] = useState<DailyCheckIn[]>([]);

  useEffect(() => {
    if (isOpen) {
      db.checkIns.orderBy('timestamp').reverse().limit(30).toArray().then(setCheckIns);
    }
  }, [isOpen]);

  // Escape closes, like every other dialog in the app. Must sit above the
  // early return - a hook cannot be called conditionally.
  useEscapeToClose(isOpen, onClose);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Check-in history"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200"
    >
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl max-w-2xl w-full p-6 shadow-2xl relative max-h-[90vh] overflow-y-auto">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-5 pb-3 border-b border-slate-800">
          <div className="w-10 h-10 rounded-xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center border border-indigo-500/30">
            <BookmarkCheck className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">Your check-in history</h2>
            <p className="text-xs text-slate-400">What you learned, what you asked, and how much you studied</p>
          </div>
        </div>

        {checkIns.length === 0 ? (
          <div className="p-8 text-center bg-slate-800/40 rounded-xl border border-slate-800 text-slate-400 text-xs">
            No check-in logs recorded yet. Complete your first 2-minute daily check-in!
          </div>
        ) : (
          <div className="space-y-3.5">
            {checkIns.map((item) => (
              <div
                key={item.id}
                className="p-4 bg-slate-900/90 border border-slate-800 rounded-xl space-y-2 text-xs"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-800/80">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-white flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5 text-indigo-400" />
                      <span>{item.date}</span>
                    </span>
                    <span className="text-[10px] uppercase px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono">
                      {item.session || 'Check-in'}
                    </span>
                    {item.structuredNotes?.category && (
                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-indigo-950 text-indigo-300 border border-indigo-800 font-semibold uppercase">
                        {item.structuredNotes.category}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-3 text-[11px] text-slate-400">
                    <span>Study: {item.completedRevisionMinutes || 0}m</span>
                    <span>Energy: {item.energyLevel}/5</span>
                    {item.completedHomeworkIds?.length > 0 && (
                      <span className="text-emerald-400">
                        {item.completedHomeworkIds.length}{' '}
                        {item.completedHomeworkIds.length === 1 ? 'task' : 'tasks'} done
                      </span>
                    )}
                    <span
                      className="text-amber-400 font-bold"
                      title="XP from this check-in. Completed homework is banked separately against each task."
                    >
                      +{item.xpEarned} XP
                    </span>
                  </div>
                </div>

                {/* Structured Notes Display */}
                {item.structuredNotes ? (
                  <div className="space-y-1.5 pt-1">
                    {item.structuredNotes.keyLearning && (
                      <p className="text-slate-200 flex items-start gap-1.5">
                        <Lightbulb className="w-3.5 h-3.5 text-amber-400 flex-shrink-0 mt-0.5" />
                        <span>
                          <strong className="text-amber-300">Key Takeaway:</strong>{' '}
                          {item.structuredNotes.keyLearning}
                        </span>
                      </p>
                    )}

                    {item.structuredNotes.blockersAndQuestions && (
                      <p className="text-slate-200 flex items-start gap-1.5">
                        <HelpCircle className="w-3.5 h-3.5 text-rose-400 flex-shrink-0 mt-0.5" />
                        <span>
                          <strong className="text-rose-300">Ask Teacher:</strong>{' '}
                          {item.structuredNotes.blockersAndQuestions}
                        </span>
                      </p>
                    )}

                    {item.structuredNotes.actionForTomorrow && (
                      <p className="text-slate-200 flex items-start gap-1.5">
                        <ArrowRight className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0 mt-0.5" />
                        <span>
                          <strong className="text-emerald-300">Action:</strong>{' '}
                          {item.structuredNotes.actionForTomorrow}
                        </span>
                      </p>
                    )}
                  </div>
                ) : item.notes ? (
                  <p className="text-slate-300 italic pt-1">"{item.notes}"</p>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

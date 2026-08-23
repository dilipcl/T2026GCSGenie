import React, { useState } from 'react';
import { db } from '../../db';
import { RemediationAction } from '../../types';
import { logAuditEvent } from '../../services/auditService';
import { triggerCelebration } from '../../utils/confetti';
import { X, Wrench, Sparkles, HelpCircle } from 'lucide-react';

interface RemediationSolveModalProps {
  quest: RemediationAction | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const RemediationSolveModal: React.FC<RemediationSolveModalProps> = ({
  quest,
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [studentAnswer, setStudentAnswer] = useState('');
  const [showHint, setShowHint] = useState(false);

  if (!isOpen || !quest) return null;

  const handleCompleteQuest = async (e: React.FormEvent) => {
    e.preventDefault();

    await db.remediations.update(quest.id, {
      isCompleted: true,
      completedAt: Date.now(),
    });

    await logAuditEvent({
      user: 'STUDENT',
      action: 'UPDATE',
      entity: 'RemediationAction',
      entityId: quest.id,
      fieldChanged: 'isCompleted',
      oldValue: 'false',
      newValue: `true (+${quest.xpReward} XP awarded)`,
    });

    triggerCelebration({ particleCount: 100, spread: 80 });
    onSuccess();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl max-w-xl w-full p-6 shadow-2xl relative max-h-[90vh] overflow-y-auto">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center border border-amber-500/30">
            <Wrench className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-indigo-950 text-indigo-300 border border-indigo-800">
                {quest.subjectId.replace('_', ' ')}
              </span>
              <h2 className="text-lg font-bold text-white">{quest.taskTitle}</h2>
            </div>
            <p className="text-xs text-slate-400">Diagnostic Source: {quest.sourceDoc}</p>
          </div>
        </div>

        {/* Diagnostic Error Breakdown */}
        <div className="p-3 bg-rose-950/30 rounded-xl border border-rose-500/40 mb-4 text-xs text-rose-200">
          <span className="font-bold text-rose-400">Year 9 Assessment Deficit: </span>
          {quest.diagnosticError}
        </div>

        {/* Instructions */}
        <div className="p-4 bg-slate-800/60 rounded-xl border border-slate-700 mb-4 text-xs text-slate-200 space-y-2">
          <p className="font-bold text-white">Task Instructions:</p>
          <p>{quest.taskInstructions}</p>

          {quest.formulaOrHint && (
            <div className="pt-2 border-t border-slate-700">
              <button
                type="button"
                onClick={() => setShowHint(!showHint)}
                className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1 font-semibold mb-1"
              >
                <HelpCircle className="w-3.5 h-3.5" />
                <span>{showHint ? 'Hide Formula & Rule' : 'Show Grade 9 Formula & Safety Rule'}</span>
              </button>
              {showHint && (
                <div className="p-2.5 bg-indigo-950/40 rounded-lg border border-indigo-800/60 text-indigo-200 font-mono text-[11px]">
                  {quest.formulaOrHint}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Sample Practice Questions */}
        <div className="mb-4 space-y-2.5">
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300">
            Practice & Validation Questions
          </h4>
          {quest.sampleQuestions.map((q, idx) => (
            <div key={idx} className="p-3 bg-slate-900 rounded-xl border border-slate-800 text-xs">
              <p className="font-semibold text-white mb-1.5">Q{idx + 1}: {q.question}</p>
              <p className="text-[11px] text-emerald-400 font-mono bg-emerald-950/30 p-2 rounded border border-emerald-900/50">
                <strong>Expected Working:</strong> {q.expectedOutcome}
              </p>
            </div>
          ))}
        </div>

        <form onSubmit={handleCompleteQuest} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
              Your Solution / Working Out Notes
            </label>
            <textarea
              rows={3}
              placeholder="Type your final calculated answer, proof, or key definitions..."
              value={studentAnswer}
              onChange={(e) => setStudentAnswer(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl p-3 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
            />
          </div>

          <button
            type="submit"
            className="w-full py-3 rounded-xl bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-slate-950 font-bold text-xs uppercase tracking-wider shadow-lg shadow-amber-950/50 flex items-center justify-center gap-2 transition-all active:scale-98"
          >
            <Sparkles className="w-4 h-4" />
            <span>Mark Remediation Complete & Claim +{quest.xpReward} XP</span>
          </button>
        </form>
      </div>
    </div>
  );
};

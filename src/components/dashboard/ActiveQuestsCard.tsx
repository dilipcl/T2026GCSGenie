import React, { useState, useEffect } from 'react';
import { db } from '../../db';
import { RemediationAction } from '../../types';
import { Wrench, Sparkles, ChevronRight, CheckCircle2, ArrowRight } from 'lucide-react';

interface ActiveQuestsCardProps {
  onOpenRemediation: (remediationId?: string) => void;
}

export const ActiveQuestsCard: React.FC<ActiveQuestsCardProps> = ({ onOpenRemediation }) => {
  const [activeQuests, setActiveQuests] = useState<RemediationAction[]>([]);

  useEffect(() => {
    db.remediations
      .where('isCompleted')
      .equals(0)
      .limit(3)
      .toArray()
      .then((res) => setActiveQuests(res));
  }, []);

  return (
    <div className="glass-card p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center">
            <Wrench className="w-4 h-4" />
          </div>
          <div>
            <h3 className="font-bold text-sm text-white">Year 9 Diagnostic Remediation Quests</h3>
            <p className="text-[11px] text-slate-400">High-value XP challenges from actual Year 9 exam scripts</p>
          </div>
        </div>

        <button
          onClick={() => onOpenRemediation()}
          className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1 font-medium"
        >
          <span>All Quests</span>
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {activeQuests.length === 0 ? (
        <div className="p-4 bg-slate-900/60 rounded-xl border border-slate-800 text-center">
          <CheckCircle2 className="w-6 h-6 text-emerald-400 mx-auto mb-1.5" />
          <p className="text-xs text-slate-200 font-semibold">All Diagnostic Quests Completed!</p>
          <p className="text-[11px] text-slate-400">You have addressed all flagged Year 9 exam errors.</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {activeQuests.map((quest) => (
            <div
              key={quest.id}
              onClick={() => onOpenRemediation(quest.id)}
              className="p-3 bg-slate-900/80 hover:bg-slate-800/90 border border-slate-800/90 hover:border-indigo-500/40 rounded-xl cursor-pointer transition-all flex items-center justify-between group"
            >
              <div className="pr-2">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-indigo-950 text-indigo-300 border border-indigo-800">
                    {quest.subjectId.replace('_', ' ')}
                  </span>
                  <span className="text-xs font-bold text-white group-hover:text-indigo-300 transition-colors">
                    {quest.taskTitle}
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 line-clamp-1">{quest.diagnosticError}</p>
              </div>

              <div className="flex items-center gap-2 flex-shrink-0">
                <span className="text-xs font-bold text-amber-400 bg-amber-950/60 px-2 py-1 rounded-lg border border-amber-800/60 flex items-center gap-1">
                  <Sparkles className="w-3 h-3 text-amber-400" />
                  <span>+{quest.xpReward} XP</span>
                </span>
                <ArrowRight className="w-4 h-4 text-slate-500 group-hover:text-indigo-400 transition-colors" />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

import React from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db';
import { RemediationAction } from '../../types';
import { Wrench, Sparkles, ArrowRight, ShieldCheck } from 'lucide-react';

interface ActiveQuestsCardProps {
  onSelectQuest: (questId: string) => void;
}

export const ActiveQuestsCard: React.FC<ActiveQuestsCardProps> = ({ onSelectQuest }) => {
  const quests =
    useLiveQuery<RemediationAction[]>(
      async () => (await db.remediations.toArray()).filter((q) => !q.isCompleted),
      []
    ) ?? [];

  return (
    <div className="glass-card p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center">
            <Wrench className="w-4 h-4" />
          </div>
          <div>
            <h3 className="font-bold text-sm text-white">Fix My Mistakes</h3>
            <p className="text-[11px] text-slate-400">
              Practice built from marks you dropped in Year 9
            </p>
          </div>
        </div>

        <span className="text-xs font-semibold text-amber-400 bg-amber-950/60 px-2 py-0.5 rounded border border-amber-800/60">
          {quests.length} Active
        </span>
      </div>

      {quests.length === 0 ? (
        <div className="p-4 bg-slate-900/60 rounded-xl border border-slate-800 text-center">
          <ShieldCheck className="w-6 h-6 text-emerald-400 mx-auto mb-1.5" />
          <p className="text-xs text-slate-300 font-medium">All Year 9 diagnostic quests solved!</p>
          <p className="text-[11px] text-slate-400">Great job! You've mastered all identified errors.</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {quests.slice(0, 3).map((quest) => (
            <div
              key={quest.id}
              onClick={() => onSelectQuest(quest.id)}
              className="p-3 bg-slate-900/80 border border-slate-800/90 rounded-xl hover:border-amber-500/50 hover:bg-slate-800/80 transition-all cursor-pointer group"
            >
              <div className="flex items-start justify-between gap-2 mb-1">
                <span className="text-[10px] uppercase font-bold px-1.5 py-0.2 rounded bg-indigo-950 text-indigo-300 border border-indigo-800">
                  {quest.subjectId.replace('_', ' ')}
                </span>
                <span className="text-[11px] font-bold text-amber-400 flex items-center gap-0.5">
                  <Sparkles className="w-3 h-3" />
                  <span>+{quest.xpReward} XP</span>
                </span>
              </div>

              <h4 className="text-xs font-bold text-slate-100 group-hover:text-amber-300 transition-colors">
                {quest.taskTitle}
              </h4>
              <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-1">
                Deficit: {quest.diagnosticError}
              </p>

              <div className="mt-2 flex items-center justify-between text-[11px] text-slate-400 pt-1.5 border-t border-slate-800">
                <span className="text-[10px] font-mono">{quest.sourceDoc.split(' ')[0]}</span>
                <span className="text-amber-400 font-medium flex items-center gap-1 group-hover:translate-x-0.5 transition-transform">
                  <span>Solve Quest</span>
                  <ArrowRight className="w-3 h-3" />
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

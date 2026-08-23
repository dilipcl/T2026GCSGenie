import React, { useState, useEffect, useRef } from 'react';
import { db } from '../../db';
import { RemediationAction, SubjectId } from '../../types';
import { RemediationSolveModal } from './RemediationSolveModal';
import { Sparkles, CheckCircle2, ArrowRight, FileText } from 'lucide-react';

interface RemediationHubProps {
  initialQuestId?: string;
}

export const RemediationHub: React.FC<RemediationHubProps> = ({ initialQuestId }) => {
  const [remediations, setRemediations] = useState<RemediationAction[]>([]);
  const [selectedSubject, setSelectedSubject] = useState<SubjectId | 'ALL'>('ALL');
  const [activeQuestId, setActiveQuestId] = useState<string | null>(null);
  const autoOpenedQuestId = useRef<string | null>(null);

  // Derived rather than stored, so the open modal always reflects the latest saved
  // data after a refresh instead of a stale snapshot.
  const activeQuest = remediations.find((r) => r.id === activeQuestId) ?? null;

  const loadRemediations = async () => {
    setRemediations(await db.remediations.toArray());
  };

  useEffect(() => {
    loadRemediations();
  }, []);

  // Open the quest handed over from the dashboard, but only once - otherwise every
  // refresh after saving would pop the modal straight back open.
  useEffect(() => {
    if (!initialQuestId || autoOpenedQuestId.current === initialQuestId) return;
    if (!remediations.some((r) => r.id === initialQuestId)) return;

    autoOpenedQuestId.current = initialQuestId;
    setActiveQuestId(initialQuestId);
  }, [initialQuestId, remediations]);

  const filtered = remediations.filter(
    (r) => selectedSubject === 'ALL' || r.subjectId === selectedSubject
  );

  const totalXP = remediations.reduce((sum, r) => sum + r.xpReward, 0);
  const earnedXP = remediations
    .filter((r) => r.isCompleted)
    .reduce((sum, r) => sum + r.xpReward, 0);

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="glass-card p-6 bg-gradient-to-r from-slate-900 via-amber-950/20 to-slate-900 border-amber-500/30 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="p-2 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30">
              🛠️
            </span>
            <h2 className="text-xl font-bold text-white">
              Year 9 Assessment Diagnostic Remediation Portal
            </h2>
          </div>
          <p className="text-xs text-slate-300 max-w-xl">
            Directly converts specific errors from Tejas's real-world Year 9 test scripts and GCS
            interim reports (IR3) into high-value active quests.
          </p>
        </div>

        <div className="flex items-center gap-3 bg-slate-900/90 px-4 py-2.5 rounded-2xl border border-slate-800">
          <div>
            <span className="block text-[10px] uppercase font-bold text-slate-400">
              Remediation XP Progress
            </span>
            <span className="text-sm font-bold text-amber-400">
              {earnedXP.toLocaleString()} / {totalXP.toLocaleString()} XP
            </span>
          </div>
          <div className="w-12 h-12 rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 font-bold text-xs">
            {totalXP > 0 ? Math.round((earnedXP / totalXP) * 100) : 0}%
          </div>
        </div>
      </div>

      {/* Subject Filter Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {[
          { id: 'ALL', label: 'All Subjects' },
          { id: 'maths', label: 'Mathematics' },
          { id: 'chemistry', label: 'Chemistry' },
          { id: 'physics', label: 'Physics' },
          { id: 'history', label: 'History' },
          { id: 'computer_science', label: 'Computer Science' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setSelectedSubject(tab.id as any)}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all whitespace-nowrap ${
              selectedSubject === tab.id
                ? 'bg-amber-600 text-slate-950 shadow-md shadow-amber-950/40'
                : 'bg-slate-900 text-slate-400 border border-slate-800 hover:text-white'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Quest Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filtered.map((quest) => (
          <div
            key={quest.id}
            onClick={() => setActiveQuestId(quest.id)}
            className={`glass-card p-5 cursor-pointer transition-all border relative overflow-hidden group ${
              quest.isCompleted
                ? 'bg-slate-900/40 border-emerald-500/30'
                : 'hover:border-amber-500/50 hover:shadow-lg hover:shadow-amber-950/20'
            }`}
          >
            <div className="flex items-start justify-between gap-3 mb-2">
              <div className="flex items-center gap-2">
                <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-indigo-950 text-indigo-300 border border-indigo-800">
                  {quest.subjectId.replace('_', ' ')}
                </span>
                <span className="text-xs text-slate-400 font-mono flex items-center gap-1">
                  <FileText className="w-3 h-3 text-slate-500" />
                  <span>{quest.sourceDoc.split(' ')[0]}</span>
                </span>
              </div>

              <span
                className={`text-xs font-bold px-2.5 py-1 rounded-lg border flex items-center gap-1 ${
                  quest.isCompleted
                    ? 'bg-emerald-950 text-emerald-400 border-emerald-800'
                    : 'bg-amber-950/80 text-amber-400 border-amber-800/80'
                }`}
              >
                {quest.isCompleted ? (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Done</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>+{quest.xpReward} XP</span>
                  </>
                )}
              </span>
            </div>

            <h3 className="font-bold text-sm text-white mb-1.5 group-hover:text-amber-300 transition-colors">
              {quest.taskTitle}
            </h3>

            <p className="text-xs text-slate-300 bg-slate-900/80 p-2.5 rounded-xl border border-slate-800/80 mb-3">
              <strong className="text-rose-400 font-semibold">Diagnostic Deficit: </strong>
              {quest.diagnosticError}
            </p>

            <div className="flex items-center justify-between text-xs text-slate-400 pt-2 border-t border-slate-800">
              <span>{quest.sampleQuestions.length} Practice Questions</span>
              <span className="text-amber-400 group-hover:translate-x-1 transition-transform flex items-center gap-1 font-semibold">
                <span>{quest.isCompleted ? 'Review Quest' : 'Solve & Claim XP'}</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </span>
            </div>
          </div>
        ))}
      </div>

      <RemediationSolveModal
        quest={activeQuest}
        isOpen={!!activeQuest}
        onClose={() => setActiveQuestId(null)}
        onSuccess={loadRemediations}
      />
    </div>
  );
};

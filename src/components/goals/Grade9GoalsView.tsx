import React, { useState, useEffect } from 'react';
import { db } from '../../db';
import { SubjectConfig, Goal } from '../../types';
import { calculateSubjectRAG, SubjectRAGResult } from '../../services/ragCalculator';
import { SubjectDetailModal } from './SubjectDetailModal';
import { GoalConsultationModal } from './GoalConsultationModal';
import { Target, Plus, ShieldCheck } from 'lucide-react';

export const Grade9GoalsView: React.FC = () => {
  const [subjects, setSubjects] = useState<SubjectConfig[]>([]);
  const [ragData, setRagData] = useState<Record<string, SubjectRAGResult>>({});
  const [goals, setGoals] = useState<Goal[]>([]);
  const [selectedSubject, setSelectedSubject] = useState<SubjectConfig | null>(null);
  const [isConsultationOpen, setIsConsultationOpen] = useState(false);

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
  };

  useEffect(() => {
    loadData();
  }, []);

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
              </div>

              {/* Progress & Metrics */}
              {rag ? (
                <div className="space-y-2 pt-2 border-t border-slate-800/80">
                  <div className="flex justify-between text-xs text-slate-300">
                    <span>Grade 9 Health</span>
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
          <span className="text-xs text-slate-400">{goals.length} Goals Registered</span>
        </div>

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
                    className={`text-[10px] px-2 py-0.2 rounded font-semibold uppercase ${
                      g.status === 'APPROVED_LOCKED'
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                        : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                    }`}
                  >
                    {g.status.replace('_', ' ')}
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
              </div>

              <div className="flex items-center gap-3">
                <span className="text-xs font-mono text-slate-300 bg-slate-800 px-2.5 py-1 rounded border border-slate-700">
                  {g.weeklyHoursRequired} hrs/wk
                </span>
                {g.parentNotes && (
                  <span className="text-[11px] text-emerald-400 flex items-center gap-1">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>Parent Locked</span>
                  </span>
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
        isOpen={isConsultationOpen}
        onClose={() => setIsConsultationOpen(false)}
        onSuccess={loadData}
      />
    </div>
  );
};

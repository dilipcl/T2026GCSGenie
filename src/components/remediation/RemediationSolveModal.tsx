import React, { useEffect, useState } from 'react';
import { db } from '../../db';
import { RemediationAction } from '../../types';
import { logAuditEvent } from '../../services/auditService';
import { ProofUploader } from '../shared/ProofUploader';
import { triggerCelebration } from '../../utils/confetti';
import {
  X,
  Wrench,
  Sparkles,
  Link,
  PlusCircle,
  GraduationCap,
  Award,
} from 'lucide-react';
import { newId } from '../../utils/id';

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
  const [driveUrl, setDriveUrl] = useState('');
  const [marksScored, setMarksScored] = useState<number>(0);
  const [totalMarks, setTotalMarks] = useState<number>(20);
  const [studentNotes, setStudentNotes] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [attachmentIds, setAttachmentIds] = useState<string[]>([]);

  // Follow-up quest creation
  const [weakArea, setWeakArea] = useState('');
  const [showSubQuestForm, setShowSubQuestForm] = useState(false);

  /**
   * This modal stays mounted while the hub is open, so state initialisers only ever
   * run once (with quest === null). Without this reset, a saved score never loads
   * and values typed for one quest bleed into the next one opened.
   */
  useEffect(() => {
    if (!quest) return;

    setDriveUrl(quest.driveNotebookUrl || '');
    setMarksScored(quest.selfStudyScore?.scored ?? 0);
    setTotalMarks(quest.selfStudyScore?.total ?? 20);
    setStudentNotes(quest.studentWorkingNotes || '');
    setWeakArea(quest.weakAreasIdentified || '');
    setShowSubQuestForm(false);
    setIsSaving(false);
  }, [quest?.id]);

  if (!isOpen || !quest) return null;

  const percentage = totalMarks > 0 ? Math.round((marksScored / totalMarks) * 100) : 0;

  /**
   * What has to exist before XP is awarded.
   *
   * The claim button used to be gated on nothing but `isSaving`, so the full
   * reward could be taken with the score, the notebook link and the working
   * notes all blank. For an app whose whole premise is "do the work", that
   * quietly turned XP into something you could mint, and every reward bought
   * with it into something a parent could not trust.
   */
  const hasScore = totalMarks > 0 && marksScored >= 0 && marksScored <= totalMarks;
  const hasProof = driveUrl.trim().length > 0 || attachmentIds.length > 0;
  const canClaim = hasScore && hasProof;

  const blockedReason = !hasScore
    ? 'Enter the marks you scored out of the total to claim this.'
    : !hasProof
    ? 'Add a notebook link or a photo of your working to claim this.'
    : null;

  const handleCompleteQuest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSaving || !canClaim) return;

    if (marksScored > totalMarks) {
      alert('Marks scored cannot be more than the total marks available.');
      return;
    }

    setIsSaving(true);
    try {
      const wasAlreadyCompleted = quest.isCompleted;

      await db.remediations.update(quest.id, {
        isCompleted: true,
        completedAt: quest.completedAt ?? Date.now(),
        driveNotebookUrl: driveUrl.trim() || undefined,
        selfStudyScore: {
          scored: marksScored,
          total: totalMarks,
          percentage,
        },
        studentWorkingNotes: studentNotes.trim() || undefined,
        weakAreasIdentified: weakArea.trim() || undefined,
      });

      await logAuditEvent({
        user: 'STUDENT',
        action: 'UPDATE',
        entity: 'RemediationAction',
        entityId: quest.id,
        fieldChanged: wasAlreadyCompleted ? 'selfStudyScore' : 'isCompleted',
        oldValue: String(wasAlreadyCompleted),
        newValue: `${
          wasAlreadyCompleted ? 'Updated' : 'Completed'
        } with Test Score: ${marksScored}/${totalMarks} (${percentage}%), Proof: ${
          driveUrl || 'Self-verified'
        }${wasAlreadyCompleted ? '' : ` (+${quest.xpReward} XP)`}`,
      });

      // Only celebrate the first completion, not every subsequent edit
      if (!wasAlreadyCompleted) {
        triggerCelebration({ particleCount: 120, spread: 90 });
      }

      onSuccess();
      onClose();
    } catch (err) {
      console.error('Failed to save quest:', err);
      alert('Could not save this quest. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCreateSubQuest = async () => {
    if (!weakArea.trim()) {
      alert('Please describe the specific weak area or question number.');
      return;
    }

    const subQuest: RemediationAction = {
      id: newId('remsub'),
      subjectId: quest.subjectId,
      sourceDoc: `Follow-up to ${quest.taskTitle}`,
      diagnosticError: `Identified deficit during self-study: ${weakArea.trim()}`,
      taskTitle: `${quest.taskTitle} (Targeted Sub-Quest)`,
      taskInstructions: `Focused remediation on identified weakness: "${weakArea.trim()}". Solve 3 targeted problems and verify proof in notebook.`,
      formulaOrHint: quest.formulaOrHint,
      xpReward: 150,
      isCompleted: false,
      parentQuestId: quest.id,
    };

    await db.remediations.add(subQuest);
    await logAuditEvent({
      user: 'STUDENT',
      action: 'INSERT',
      entity: 'RemediationAction',
      entityId: subQuest.id,
      newValue: `Generated Follow-up Sub-Quest: ${subQuest.taskTitle}`,
    });

    alert('Follow-up sub-quest generated and added to your Remediation Portal (+150 XP)!');
    setWeakArea('');
    setShowSubQuestForm(false);
    onSuccess();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl max-w-2xl w-full p-6 shadow-2xl relative max-h-[90vh] overflow-y-auto">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="flex items-center gap-3 mb-4 pb-3 border-b border-slate-800">
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
          <span className="font-bold text-rose-400">Identified Deficit in Assessment: </span>
          {quest.diagnosticError}
        </div>

        {/* Formula / Rules */}
        {quest.formulaOrHint && (
          <div className="p-3 bg-indigo-950/40 rounded-xl border border-indigo-800/60 mb-4 text-xs text-indigo-200 font-mono">
            <div className="flex items-center gap-1.5 font-bold text-indigo-300 mb-1">
              <GraduationCap className="w-4 h-4" />
              <span>Grade 9 Formula & Safety Rule:</span>
            </div>
            {quest.formulaOrHint}
          </div>
        )}

        {/* What to actually do. Previously this modal showed one practice
            question and never rendered taskInstructions at all - the wrong way
            round, given the real work happens in an exercise book. */}
        <div className="p-4 bg-slate-800/60 rounded-2xl border border-slate-700 mb-5">
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300 mb-2 flex items-center gap-1.5">
            <GraduationCap className="w-4 h-4 text-indigo-400" />
            <span>What to do</span>
          </h4>
          <p className="text-xs text-slate-200 leading-relaxed">{quest.taskInstructions}</p>
          <p className="text-[11px] text-slate-400 mt-2.5">
            Work through this in your exercise book, on CorbettMaths, PMT or a past paper - wherever
            you normally work. Then record the score and the proof below.
          </p>
        </div>

        <form onSubmit={handleCompleteQuest} className="space-y-4">
          {/* Proof & Self-Study Validation Section */}
          <div className="p-4 bg-slate-800/60 rounded-2xl border border-slate-700 space-y-3">
            <h4 className="text-xs font-bold text-amber-300 uppercase tracking-wider flex items-center gap-1.5">
              <Award className="w-4 h-4" />
              <span>Self-Study Test Score & Google Notebook Proof</span>
            </h4>

            {/* Google Drive / Notebook Link */}
            <div>
              <label className="block text-[11px] font-semibold text-slate-300 mb-1 flex items-center gap-1">
                <Link className="w-3.5 h-3.5 text-teal-400" />
                <span>Google Notebook / Drive Working Proof URL</span>
              </label>
              <input
                type="url"
                placeholder="https://notebooklm.google.com/... or https://drive.google.com/..."
                value={driveUrl}
                onChange={(e) => setDriveUrl(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-teal-500"
              />
            </div>

            <ProofUploader
              ownerType="REMEDIATION"
              ownerId={quest.id}
              onChange={setAttachmentIds}
              label="Photos of your working"
              hint="Photograph the pages from your exercise book, or the marked practice."
            />

            {/* Score Logger */}
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                  Marks Scored
                </label>
                <input
                  type="number"
                  min="0"
                  max={totalMarks}
                  value={marksScored}
                  onChange={(e) => setMarksScored(Number(e.target.value))}
                  required
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                  Total Marks
                </label>
                <input
                  type="number"
                  min="1"
                  value={totalMarks}
                  onChange={(e) => setTotalMarks(Number(e.target.value))}
                  required
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                  Percentage
                </label>
                <div
                  title="A practice score, not a GCSE grade. Real grade boundaries are set per paper, per year."
                  className={`w-full py-1.5 px-2.5 rounded-lg border text-xs font-bold text-center ${
                    percentage >= 80
                      ? 'bg-emerald-950/60 border-emerald-500/50 text-emerald-300'
                      : percentage >= 60
                      ? 'bg-amber-950/60 border-amber-500/50 text-amber-300'
                      : 'bg-rose-950/60 border-rose-500/50 text-rose-300'
                  }`}
                >
                  {percentage}%{' '}
                  {percentage >= 80 ? 'Secure' : percentage >= 60 ? 'Nearly' : 'Needs work'}
                </div>
              </div>
            </div>

            {/* Student Working Notes */}
            <div>
              <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                Student Working Notes & Solution Steps
              </label>
              <textarea
                rows={2}
                placeholder="Summary of calculations, formulas applied, or proof notes..."
                value={studentNotes}
                onChange={(e) => setStudentNotes(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-white placeholder-slate-500"
              />
            </div>
          </div>

          {/* Dynamic Follow-up Sub-Quest Generator */}
          <div className="p-3 bg-indigo-950/20 rounded-xl border border-indigo-500/30">
            <div className="flex items-center justify-between">
              <span className="text-xs text-indigo-300 font-semibold">
                Struggled with any sub-area or question?
              </span>
              <button
                type="button"
                onClick={() => setShowSubQuestForm(!showSubQuestForm)}
                className="text-xs text-indigo-400 hover:text-indigo-300 font-bold flex items-center gap-1"
              >
                <PlusCircle className="w-3.5 h-3.5" />
                <span>{showSubQuestForm ? 'Cancel' : 'Generate Follow-Up Sub-Quest (+150 XP)'}</span>
              </button>
            </div>

            {showSubQuestForm && (
              <div className="mt-2 space-y-2">
                <input
                  type="text"
                  placeholder="Describe weak area (e.g. Q1(b) comparison statement or negative fractions)..."
                  value={weakArea}
                  onChange={(e) => setWeakArea(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white"
                />
                <button
                  type="button"
                  onClick={handleCreateSubQuest}
                  className="w-full py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs flex items-center justify-center gap-1.5"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Create Sub-Quest</span>
                </button>
              </div>
            )}
          </div>

          {blockedReason && (
            <p className="text-[11px] text-amber-300 font-semibold text-center" role="status">
              {blockedReason}
            </p>
          )}

          <button
            type="submit"
            disabled={isSaving || !canClaim}
            className="w-full py-3 rounded-xl bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-slate-950 font-bold text-xs uppercase tracking-wider shadow-lg shadow-amber-950/50 flex items-center justify-center gap-2 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Sparkles className="w-4 h-4" />
            <span>
              {isSaving
                ? 'Saving...'
                : quest.isCompleted
                ? 'Update Saved Score & Proof'
                : `Mark Complete & Claim +${quest.xpReward} XP`}
            </span>
          </button>
        </form>
      </div>
    </div>
  );
};

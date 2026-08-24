import React, { useEffect, useMemo, useState } from 'react';
import { db } from '../../db';
import {
  Assessment,
  AssessmentQuestion,
  AssessmentType,
  SubjectId,
  Task,
} from '../../types';
import { INITIAL_SUBJECTS } from '../../db/seedData';
import { logAuditEvent } from '../../services/auditService';
import { deleteAttachmentsFor } from '../../services/attachmentService';
import { buildFixUpTasks, questionsWithDroppedMarks } from '../../services/assessmentService';
import { triggerCelebration } from '../../utils/confetti';
import { todayISO, addDaysISO, formatFriendlyDate } from '../../utils/date';
import { ProofUploader } from '../shared/ProofUploader';
import { X, Plus, Trash2, Check, Calculator, ChevronDown, ChevronUp } from 'lucide-react';
import { newId } from '../../utils/id';
import { useFeedback } from '../shared/FeedbackProvider';

interface AssessmentEntryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
  /** Provided when editing an existing record rather than logging a new one. */
  existing?: Assessment | null;
}

const TYPES: { id: AssessmentType; label: string }[] = [
  { id: 'CLASS_TEST', label: 'Class test' },
  { id: 'END_OF_TOPIC', label: 'End of topic' },
  { id: 'MOCK_EXAM', label: 'Mock exam' },
  { id: 'PAST_PAPER', label: 'Past paper' },
  { id: 'MARKED_HOMEWORK', label: 'Marked homework' },
  { id: 'REQUIRED_PRACTICAL', label: 'Practical' },
];

const ERROR_TYPES: { id: NonNullable<AssessmentQuestion['errorType']>; label: string }[] = [
  { id: 'NONE', label: 'Got it' },
  { id: 'CARELESS', label: 'Careless' },
  { id: 'METHOD', label: 'Method' },
  { id: 'KNOWLEDGE_GAP', label: 'Did not know' },
  { id: 'MISREAD', label: 'Misread' },
  { id: 'TIMING', label: 'Ran out of time' },
];

function blankQuestion(index: number): AssessmentQuestion {
  return {
    id: newId('q'),
    questionNumber: `Q${index + 1}`,
    marksAvailable: 0,
    marksScored: 0,
    // No cause pre-selected. Defaulting to 'NONE' made every new row claim the
    // student got it right, which is both untrue and what the fix-up bug hid
    // behind - the task now depends on marks, but the chips should still start
    // honest.
  };
}

/**
 * Logs a marked piece of work as evidence: the score, what each question tested,
 * where the marks went, and photographs of the paper itself.
 *
 * The record gets its id before anything is saved so that proof can be attached
 * while the form is still being filled in. Abandoning the form deletes those
 * orphans rather than leaving them in the database forever.
 */
export const AssessmentEntryModal: React.FC<AssessmentEntryModalProps> = ({
  isOpen,
  onClose,
  onSaved,
  existing,
}) => {
  const { toast } = useFeedback();
  const [draftId, setDraftId] = useState('');
  const [subjectId, setSubjectId] = useState<SubjectId | ''>('');
  const [title, setTitle] = useState('');
  const [type, setType] = useState<AssessmentType>('CLASS_TEST');
  const [date, setDate] = useState(todayISO());
  const [marksScored, setMarksScored] = useState('');
  const [marksAvailable, setMarksAvailable] = useState('');
  const [gradeAwarded, setGradeAwarded] = useState('');
  const [teacherFeedback, setTeacherFeedback] = useState('');
  const [weakTopics, setWeakTopics] = useState('');
  const [driveResourceUrl, setDriveResourceUrl] = useState('');
  const [questions, setQuestions] = useState<AssessmentQuestion[]>([]);
  const [attachmentIds, setAttachmentIds] = useState<string[]>([]);
  const [expandedQuestionId, setExpandedQuestionId] = useState<string | null>(null);
  const [createFixUps, setCreateFixUps] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [savedOnce, setSavedOnce] = useState(false);

  useEffect(() => {
    if (!isOpen) return;

    if (existing) {
      setDraftId(existing.id);
      setSubjectId(existing.subjectId);
      setTitle(existing.title);
      setType(existing.type);
      setDate(existing.date);
      setMarksScored(String(existing.marksScored));
      setMarksAvailable(String(existing.marksAvailable));
      setGradeAwarded(existing.gradeAwarded || '');
      setTeacherFeedback(existing.teacherFeedback || '');
      setWeakTopics(existing.weakTopics || '');
      setDriveResourceUrl(existing.driveResourceUrl || '');
      setQuestions(existing.questions);
      setAttachmentIds(existing.attachmentIds);
      setCreateFixUps(false);
    } else {
      setDraftId(newId('asmt'));
      setSubjectId('');
      setTitle('');
      setType('CLASS_TEST');
      setDate(todayISO());
      setMarksScored('');
      setMarksAvailable('');
      setGradeAwarded('');
      setTeacherFeedback('');
      setWeakTopics('');
      setDriveResourceUrl('');
      setQuestions([]);
      setAttachmentIds([]);
      setCreateFixUps(true);
    }

    setExpandedQuestionId(null);
    setIsSaving(false);
    setSavedOnce(false);
  }, [isOpen, existing]);

  /** Shown on the fix-up checkbox so the outcome is visible before saving. */
  const droppedCount = useMemo(
    () => questionsWithDroppedMarks(questions).length,
    [questions]
  );

  const questionTotals = useMemo(
    () => ({
      scored: questions.reduce((sum, q) => sum + (Number(q.marksScored) || 0), 0),
      available: questions.reduce((sum, q) => sum + (Number(q.marksAvailable) || 0), 0),
    }),
    [questions]
  );

  if (!isOpen) return null;

  const scored = Number(marksScored);
  const available = Number(marksAvailable);
  const percentage = available > 0 ? Math.round((scored / available) * 100) : 0;
  const canSave = !!subjectId && title.trim().length > 0 && available > 0 && scored >= 0 && scored <= available;

  const updateQuestion = (id: string, patch: Partial<AssessmentQuestion>) =>
    setQuestions((prev) => prev.map((q) => (q.id === id ? { ...q, ...patch } : q)));

  const handleCancel = async () => {
    // Proof attached to a record that was never saved would otherwise sit in the
    // database with no owner and no way to reach it from the UI.
    if (!savedOnce && !existing) await deleteAttachmentsFor('ASSESSMENT', draftId);
    onClose();
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSave || isSaving) return;

    setIsSaving(true);
    try {
      const cleanedQuestions = questions
        .filter((q) => q.questionNumber.trim().length > 0)
        .map((q) => ({
          ...q,
          questionNumber: q.questionNumber.trim(),
          marksAvailable: Number(q.marksAvailable) || 0,
          marksScored: Number(q.marksScored) || 0,
        }));

      const record: Assessment = {
        id: draftId,
        subjectId: subjectId as SubjectId,
        title: title.trim(),
        type,
        date,
        marksScored: scored,
        marksAvailable: available,
        percentage,
        gradeAwarded: gradeAwarded.trim() || undefined,
        teacherFeedback: teacherFeedback.trim() || undefined,
        weakTopics: weakTopics.trim() || undefined,
        driveResourceUrl: driveResourceUrl.trim() || undefined,
        questions: cleanedQuestions,
        attachmentIds,
        followUpTaskIds: existing?.followUpTaskIds,
        verifiedByParent: existing?.verifiedByParent,
        verifiedAt: existing?.verifiedAt,
        createdAt: existing?.createdAt ?? Date.now(),
      };

      // Derived by services/assessmentService so it can be tested without
      // rendering this modal - burying it here is how it stayed broken.
      const followUpTasks: Task[] = createFixUps ? buildFixUpTasks(record) : [];
      if (followUpTasks.length) {
        record.followUpTaskIds = followUpTasks.map((t) => t.id);
      }

      await db.transaction('rw', db.assessments, db.tasks, async () => {
        await db.assessments.put(record);
        if (followUpTasks.length) await db.tasks.bulkAdd(followUpTasks);
      });

      await logAuditEvent({
        user: 'STUDENT',
        action: existing ? 'UPDATE' : 'INSERT',
        entity: 'Assessment',
        entityId: record.id,
        newValue: `${record.title} - ${record.marksScored}/${record.marksAvailable} (${record.percentage}%), ${record.questions.length} questions logged, ${record.attachmentIds.length} proof files`,
      });

      for (const task of followUpTasks) {
        await logAuditEvent({
          user: 'STUDENT',
          action: 'INSERT',
          entity: 'Task',
          entityId: task.id,
          newValue: `${task.title} [auto-created from ${record.title}]`,
        });
      }

      setSavedOnce(true);
      if (percentage >= 80) triggerCelebration({ particleCount: 60 });
      onSaved();
      onClose();
    } catch (err) {
      console.error('Could not save assessment:', err);
      toast.error('Could not save that', 'Nothing was lost - try saving again.');
    } finally {
      setIsSaving(false);
    }
  };

  const chipClass = (active: boolean) =>
    `py-2 px-2 rounded-xl text-[11px] font-bold border transition-all ${
      active
        ? 'bg-indigo-600 text-white border-indigo-400'
        : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
    }`;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={handleCancel} />

      <div className="relative w-full sm:max-w-2xl bg-slate-900 border-t sm:border border-slate-700 rounded-t-3xl sm:rounded-2xl p-5 pb-safe sm:pb-5 shadow-2xl max-h-[94vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-bold text-white">
              {existing ? 'Edit marked work' : 'Log marked work'}
            </h2>
            <p className="text-[11px] text-slate-400">
              Score, question breakdown and a photo of the paper.
            </p>
          </div>
          <button
            onClick={handleCancel}
            aria-label="Close"
            className="p-2 -mr-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-300 uppercase mb-1.5">Subject</label>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
              {INITIAL_SUBJECTS.map((sub) => (
                <button
                  type="button"
                  key={sub.id}
                  onClick={() => setSubjectId(sub.id)}
                  className={`flex items-center gap-1.5 px-2 py-2 rounded-xl border text-left transition-all ${
                    subjectId === sub.id
                      ? 'bg-indigo-600 border-indigo-400 text-white'
                      : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  <span className="text-base leading-none">{sub.icon}</span>
                  <span className="text-[10px] font-bold leading-tight">{sub.shortName}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <label
                htmlFor="asmt-title"
                className="block text-xs font-bold text-slate-300 uppercase mb-1.5"
              >
                What was it?
              </label>
              <input
                id="asmt-title"
                type="text"
                placeholder="e.g. Trigonometry end of unit test"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label
                htmlFor="asmt-date"
                className="block text-xs font-bold text-slate-300 uppercase mb-1.5"
              >
                Date sat
              </label>
              <input
                id="asmt-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-white"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-300 uppercase mb-1.5">Type</label>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
              {TYPES.map((t) => (
                <button type="button" key={t.id} onClick={() => setType(t.id)} className={chipClass(type === t.id)}>
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Score */}
          <div className="p-3 bg-slate-800/50 rounded-2xl border border-slate-700/70">
            <div className="flex flex-wrap items-end gap-3">
              <div className="w-24">
                <label
                  htmlFor="asmt-scored"
                  className="block text-[11px] font-bold text-slate-300 uppercase mb-1"
                >
                  Marks got
                </label>
                <input
                  id="asmt-scored"
                  type="number"
                  min={0}
                  inputMode="numeric"
                  value={marksScored}
                  onChange={(e) => setMarksScored(e.target.value)}
                  required
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white"
                />
              </div>

              <span className="pb-2 text-slate-500 font-bold">/</span>

              <div className="w-24">
                <label
                  htmlFor="asmt-available"
                  className="block text-[11px] font-bold text-slate-300 uppercase mb-1"
                >
                  Out of
                </label>
                <input
                  id="asmt-available"
                  type="number"
                  min={1}
                  inputMode="numeric"
                  value={marksAvailable}
                  onChange={(e) => setMarksAvailable(e.target.value)}
                  required
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white"
                />
              </div>

              <div className="w-24">
                <label
                  htmlFor="asmt-grade"
                  className="block text-[11px] font-bold text-slate-300 uppercase mb-1"
                >
                  Grade
                </label>
                <input
                  id="asmt-grade"
                  type="text"
                  placeholder="8"
                  value={gradeAwarded}
                  onChange={(e) => setGradeAwarded(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white"
                />
              </div>

              {available > 0 && (
                <div
                  className={`px-3 py-2 rounded-xl border font-bold text-sm ${
                    percentage >= 80
                      ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40'
                      : percentage >= 60
                      ? 'bg-amber-500/15 text-amber-300 border-amber-500/40'
                      : 'bg-rose-500/15 text-rose-300 border-rose-500/40'
                  }`}
                >
                  {percentage}%
                </div>
              )}

              {questionTotals.available > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setMarksScored(String(questionTotals.scored));
                    setMarksAvailable(String(questionTotals.available));
                  }}
                  className="ml-auto flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-[11px] font-bold text-slate-300 hover:text-white hover:border-indigo-500/60 transition-all"
                >
                  <Calculator className="w-3.5 h-3.5 text-indigo-400" />
                  <span>
                    Use question totals ({questionTotals.scored}/{questionTotals.available})
                  </span>
                </button>
              )}
            </div>

            {scored > available && available > 0 && (
              <p className="mt-2 text-[11px] text-rose-400 font-semibold">
                Marks scored cannot be higher than the marks available.
              </p>
            )}
          </div>

          {/* Question by question */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-xs font-bold text-slate-300 uppercase">
                Question breakdown{' '}
                <span className="normal-case font-normal text-slate-500">(optional)</span>
              </label>
              <button
                type="button"
                onClick={() => setQuestions((prev) => [...prev, blankQuestion(prev.length)])}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-[11px] font-bold text-slate-200 hover:bg-slate-700 transition-all"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add question</span>
              </button>
            </div>

            {questions.length === 0 ? (
              <p className="text-[11px] text-slate-500 p-3 bg-slate-800/40 rounded-xl border border-slate-800">
                Adding questions one by one is what turns this from a score into something you can
                revise from - and any question you got wrong becomes a fix-up task automatically.
              </p>
            ) : (
              <div className="space-y-2">
                {questions.map((q) => {
                  const isOpen = expandedQuestionId === q.id;
                  const lost = (Number(q.marksAvailable) || 0) - (Number(q.marksScored) || 0);
                  return (
                    <div
                      key={q.id}
                      className="p-2.5 bg-slate-800/60 rounded-xl border border-slate-700/80"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <input
                          type="text"
                          aria-label="Question number"
                          value={q.questionNumber}
                          onChange={(e) => updateQuestion(q.id, { questionNumber: e.target.value })}
                          className="w-20 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-white font-mono"
                        />
                        <input
                          type="text"
                          aria-label="Topic tested"
                          placeholder="Topic tested"
                          value={q.topic || ''}
                          onChange={(e) => updateQuestion(q.id, { topic: e.target.value })}
                          className="flex-1 min-w-[120px] bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-white placeholder-slate-500"
                        />
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            aria-label="Marks scored"
                            min={0}
                            value={q.marksScored}
                            onChange={(e) =>
                              updateQuestion(q.id, { marksScored: Number(e.target.value) })
                            }
                            className="w-14 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-white"
                          />
                          <span className="text-slate-500 text-xs">/</span>
                          <input
                            type="number"
                            aria-label="Marks available"
                            min={0}
                            value={q.marksAvailable}
                            onChange={(e) =>
                              updateQuestion(q.id, { marksAvailable: Number(e.target.value) })
                            }
                            className="w-14 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-white"
                          />
                        </div>

                        {lost > 0 && (
                          <span className="text-[10px] font-bold text-rose-300 bg-rose-500/15 border border-rose-500/30 px-2 py-1 rounded-lg">
                            -{lost}
                          </span>
                        )}

                        <button
                          type="button"
                          onClick={() => setExpandedQuestionId(isOpen ? null : q.id)}
                          aria-label="Show answer detail"
                          className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-700"
                        >
                          {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </button>
                        <button
                          type="button"
                          onClick={() => setQuestions((prev) => prev.filter((x) => x.id !== q.id))}
                          aria-label="Remove question"
                          className="p-1.5 text-slate-500 hover:text-rose-400 rounded-lg hover:bg-slate-700"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>

                      {isOpen && (
                        <div className="mt-2.5 space-y-2 pt-2.5 border-t border-slate-700/70">
                          <div>
                            <span className="block text-[10px] font-bold text-slate-400 uppercase mb-1">
                              Why the marks went
                            </span>
                            <div className="grid grid-cols-3 gap-1.5">
                              {ERROR_TYPES.map((et) => (
                                <button
                                  type="button"
                                  key={et.id}
                                  onClick={() => updateQuestion(q.id, { errorType: et.id })}
                                  className={`py-1.5 rounded-lg text-[10px] font-bold border transition-all ${
                                    q.errorType === et.id
                                      ? 'bg-indigo-600 text-white border-indigo-400'
                                      : 'bg-slate-900 text-slate-400 border-slate-700'
                                  }`}
                                >
                                  {et.label}
                                </button>
                              ))}
                            </div>
                          </div>

                          <textarea
                            rows={2}
                            placeholder="The question (or a summary of it)"
                            value={q.questionText || ''}
                            onChange={(e) => updateQuestion(q.id, { questionText: e.target.value })}
                            className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-white placeholder-slate-500"
                          />
                          <textarea
                            rows={2}
                            placeholder="What you answered"
                            value={q.yourAnswer || ''}
                            onChange={(e) => updateQuestion(q.id, { yourAnswer: e.target.value })}
                            className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-white placeholder-slate-500"
                          />
                          <textarea
                            rows={2}
                            placeholder="The mark scheme / correct answer"
                            value={q.correctAnswer || ''}
                            onChange={(e) => updateQuestion(q.id, { correctAnswer: e.target.value })}
                            className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-white placeholder-slate-500"
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <ProofUploader
            ownerType="ASSESSMENT"
            ownerId={draftId}
            onChange={setAttachmentIds}
            label="Proof"
            hint="Photograph the paper, your answers and the mark scheme. Images are shrunk automatically so backups stay a sensible size."
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="asmt-feedback"
                className="block text-xs font-bold text-slate-300 uppercase mb-1.5"
              >
                Teacher feedback
              </label>
              <textarea
                id="asmt-feedback"
                rows={2}
                placeholder="What the teacher wrote"
                value={teacherFeedback}
                onChange={(e) => setTeacherFeedback(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl p-2.5 text-xs text-white placeholder-slate-500"
              />
            </div>
            <div>
              <label
                htmlFor="asmt-weak"
                className="block text-xs font-bold text-slate-300 uppercase mb-1.5"
              >
                Topics to go back to
              </label>
              <textarea
                id="asmt-weak"
                rows={2}
                placeholder="e.g. Sine rule, bearings"
                value={weakTopics}
                onChange={(e) => setWeakTopics(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl p-2.5 text-xs text-white placeholder-slate-500"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="asmt-drive"
              className="block text-xs font-bold text-slate-300 uppercase mb-1.5"
            >
              Google Drive / Notebook link{' '}
              <span className="normal-case font-normal text-slate-500">(optional)</span>
            </label>
            <input
              id="asmt-drive"
              type="url"
              placeholder="https://drive.google.com/..."
              value={driveResourceUrl}
              onChange={(e) => setDriveResourceUrl(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 font-mono"
            />
          </div>

          <label className="flex items-start gap-2.5 p-3 bg-slate-800/50 rounded-2xl border border-slate-700/70 cursor-pointer">
            <input
              type="checkbox"
              checked={createFixUps}
              onChange={(e) => setCreateFixUps(e.target.checked)}
              className="mt-0.5 w-4 h-4 accent-indigo-500"
            />
            <span>
              <span className="block text-xs font-bold text-white">
                Create fix-up tasks
                {droppedCount > 0 && (
                  <span className="ml-1.5 font-semibold text-indigo-300">
                    &middot; {droppedCount} will be created
                  </span>
                )}
              </span>
              <span className="block text-[11px] text-slate-400">
                {droppedCount > 0
                  ? `One task per question that lost marks, due ${formatFriendlyDate(addDaysISO(3))}, so the mistake gets worked through rather than filed away.`
                  : 'Any question that loses marks becomes a task due in 3 days. Nothing to create yet - no question has dropped marks.'}
              </span>
            </span>
          </label>

          <button
            type="submit"
            disabled={!canSave || isSaving}
            className="w-full py-3.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold text-sm shadow-lg shadow-indigo-950/50 flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Check className="w-4 h-4" />
            <span>{isSaving ? 'Saving...' : existing ? 'Save changes' : 'Save to proof log'}</span>
          </button>
        </form>
      </div>
    </div>
  );
};

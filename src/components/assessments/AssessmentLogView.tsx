import React, { useEffect, useState } from 'react';
import { db } from '../../db';
import { Assessment, SubjectId, UserRole } from '../../types';
import { INITIAL_SUBJECTS } from '../../db/seedData';
import { logAuditEvent } from '../../services/auditService';
import { deleteAttachmentsFor } from '../../services/attachmentService';
import { formatFriendlyDate } from '../../utils/date';
import { AssessmentEntryModal } from './AssessmentEntryModal';
import { ProofUploader } from '../shared/ProofUploader';
import {
  ClipboardCheck,
  Plus,
  Trash2,
  Pencil,
  ShieldCheck,
  Paperclip,
  ExternalLink,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

interface AssessmentLogViewProps {
  currentRole: UserRole;
  refreshKey?: number;
  onChanged?: () => void;
}

const TYPE_LABELS: Record<Assessment['type'], string> = {
  CLASS_TEST: 'Class test',
  END_OF_TOPIC: 'End of topic',
  MOCK_EXAM: 'Mock exam',
  PAST_PAPER: 'Past paper',
  MARKED_HOMEWORK: 'Marked homework',
  REQUIRED_PRACTICAL: 'Practical',
};

function scoreTone(percentage: number): string {
  if (percentage >= 80) return 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40';
  if (percentage >= 60) return 'bg-amber-500/15 text-amber-300 border-amber-500/40';
  return 'bg-rose-500/15 text-rose-300 border-rose-500/40';
}

/**
 * The proof log: every marked paper, what it scored, where the marks went and
 * the photographs backing it up. This is the record a parent can check against
 * a claim, and the one a Grade 9 conversation with a teacher can be built on.
 */
export const AssessmentLogView: React.FC<AssessmentLogViewProps> = ({
  currentRole,
  refreshKey = 0,
  onChanged,
}) => {
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [filterSubject, setFilterSubject] = useState<SubjectId | 'ALL'>('ALL');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [isEntryOpen, setIsEntryOpen] = useState(false);
  const [editing, setEditing] = useState<Assessment | null>(null);

  const loadData = async () => {
    const list = await db.assessments.orderBy('date').reverse().toArray();
    setAssessments(list);
  };

  useEffect(() => {
    loadData();
  }, [refreshKey]);

  const visible = assessments.filter(
    (a) => filterSubject === 'ALL' || a.subjectId === filterSubject
  );

  const averagePercent =
    visible.length > 0
      ? Math.round(visible.reduce((sum, a) => sum + a.percentage, 0) / visible.length)
      : 0;
  const withProof = visible.filter((a) => a.attachmentIds.length > 0).length;

  const handleDelete = async (record: Assessment) => {
    if (
      !confirm(
        `Delete "${record.title}" and its ${record.attachmentIds.length} proof file(s)? This is recorded in the change history.`
      )
    ) {
      return;
    }

    const removedFiles = await deleteAttachmentsFor('ASSESSMENT', record.id);
    await db.assessments.delete(record.id);
    await logAuditEvent({
      user: currentRole === 'PARENT' ? 'PARENT' : 'STUDENT',
      action: 'DELETE',
      entity: 'Assessment',
      entityId: record.id,
      oldValue: `${record.title} - ${record.marksScored}/${record.marksAvailable} (${record.percentage}%), ${removedFiles} proof files removed`,
    });

    loadData();
    onChanged?.();
  };

  const handleVerify = async (record: Assessment) => {
    const nowVerified = !record.verifiedByParent;
    await db.assessments.update(record.id, {
      verifiedByParent: nowVerified,
      verifiedAt: nowVerified ? Date.now() : undefined,
    });

    await logAuditEvent({
      user: 'PARENT',
      action: 'UPDATE',
      entity: 'Assessment',
      entityId: record.id,
      fieldChanged: 'verifiedByParent',
      oldValue: String(record.verifiedByParent === true),
      newValue: String(nowVerified),
    });

    loadData();
  };

  const openNew = () => {
    setEditing(null);
    setIsEntryOpen(true);
  };

  const openEdit = (record: Assessment) => {
    setEditing(record);
    setIsEntryOpen(true);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="glass-card p-6 bg-gradient-to-r from-slate-900 via-teal-950/30 to-slate-900 border-teal-500/30 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="p-2 rounded-xl bg-teal-500/20 text-teal-400 border border-teal-500/30">
              <ClipboardCheck className="w-5 h-5" />
            </span>
            <h2 className="text-xl font-bold text-white">Proof Log</h2>
          </div>
          <p className="text-xs text-slate-300 max-w-xl">
            Every marked test, with the question breakdown and photos of the paper. Wrong answers
            turn into fix-up tasks automatically.
          </p>
        </div>

        <button
          onClick={openNew}
          className="px-4 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-bold text-xs shadow-lg shadow-teal-950/50 flex items-center gap-2 transition-all"
        >
          <Plus className="w-4 h-4" />
          <span>Log marked work</span>
        </button>
      </div>

      {/* Summary strip */}
      {visible.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <div className="glass-card p-4">
            <span className="block text-[10px] uppercase font-bold text-slate-400">Papers logged</span>
            <span className="block text-2xl font-bold text-white">{visible.length}</span>
          </div>
          <div className="glass-card p-4">
            <span className="block text-[10px] uppercase font-bold text-slate-400">Average</span>
            <span className="block text-2xl font-bold text-indigo-300">{averagePercent}%</span>
          </div>
          <div className="glass-card p-4">
            <span className="block text-[10px] uppercase font-bold text-slate-400">With proof</span>
            <span className="block text-2xl font-bold text-teal-300">
              {withProof}/{visible.length}
            </span>
          </div>
        </div>
      )}

      {/* Subject filter */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
        <button
          onClick={() => setFilterSubject('ALL')}
          className={`px-3 py-2 rounded-xl text-[11px] font-bold whitespace-nowrap border transition-all ${
            filterSubject === 'ALL'
              ? 'bg-indigo-600 text-white border-indigo-400'
              : 'bg-slate-900/80 text-slate-400 border-slate-800 hover:bg-slate-800'
          }`}
        >
          All subjects
        </button>
        {INITIAL_SUBJECTS.map((sub) => (
          <button
            key={sub.id}
            onClick={() => setFilterSubject(sub.id)}
            className={`px-3 py-2 rounded-xl text-[11px] font-bold whitespace-nowrap border transition-all ${
              filterSubject === sub.id
                ? 'bg-indigo-600 text-white border-indigo-400'
                : 'bg-slate-900/80 text-slate-400 border-slate-800 hover:bg-slate-800'
            }`}
          >
            {sub.icon} {sub.shortName}
          </button>
        ))}
      </div>

      {/* Records */}
      {visible.length === 0 ? (
        <div className="glass-card p-10 text-center">
          <ClipboardCheck className="w-10 h-10 text-slate-600 mx-auto mb-3" />
          <p className="text-sm font-semibold text-slate-300">Nothing logged yet</p>
          <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
            Next time a test comes back, photograph it and log the marks. After a few entries this
            page shows exactly which topics keep costing marks.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map((record) => {
            const subject = INITIAL_SUBJECTS.find((s) => s.id === record.subjectId);
            const isOpen = expandedId === record.id;
            const droppedQuestions = record.questions.filter(
              (q) => q.marksScored < q.marksAvailable
            );

            return (
              <div key={record.id} className="glass-card p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-slate-800 flex items-center justify-center text-xl border border-slate-700 flex-shrink-0">
                      {subject?.icon || '📄'}
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-bold text-sm text-white">{record.title}</h3>
                        <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700 font-semibold uppercase">
                          {TYPE_LABELS[record.type]}
                        </span>
                        {record.verifiedByParent && (
                          <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-semibold uppercase flex items-center gap-1">
                            <ShieldCheck className="w-3 h-3" />
                            <span>Verified</span>
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        {subject?.name} · {formatFriendlyDate(record.date)}
                        {record.gradeAwarded && ` · Grade ${record.gradeAwarded}`}
                        {record.attachmentIds.length > 0 && (
                          <span className="inline-flex items-center gap-1 ml-1.5 text-teal-300">
                            <Paperclip className="w-3 h-3" />
                            {record.attachmentIds.length}
                          </span>
                        )}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span
                      className={`px-3 py-1.5 rounded-xl border font-bold text-sm ${scoreTone(record.percentage)}`}
                    >
                      {record.marksScored}/{record.marksAvailable}
                      <span className="ml-1.5 text-[11px] opacity-80">{record.percentage}%</span>
                    </span>

                    <button
                      onClick={() => setExpandedId(isOpen ? null : record.id)}
                      aria-label="Show detail"
                      className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
                    >
                      {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {isOpen && (
                  <div className="mt-4 pt-4 border-t border-slate-800 space-y-4">
                    {record.questions.length > 0 && (
                      <div>
                        <h4 className="text-[11px] font-bold text-slate-300 uppercase mb-2">
                          Question breakdown
                          {droppedQuestions.length > 0 && (
                            <span className="ml-2 normal-case font-normal text-rose-300">
                              {droppedQuestions.length} question
                              {droppedQuestions.length === 1 ? '' : 's'} dropped marks
                            </span>
                          )}
                        </h4>
                        <div className="overflow-x-auto">
                          <table className="w-full text-left text-xs">
                            <thead className="text-slate-500 uppercase text-[10px]">
                              <tr>
                                <th className="py-1.5 pr-3">Q</th>
                                <th className="py-1.5 pr-3">Topic</th>
                                <th className="py-1.5 pr-3">Marks</th>
                                <th className="py-1.5">Cause</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800/60 text-slate-300">
                              {record.questions.map((q) => (
                                <tr key={q.id}>
                                  <td className="py-1.5 pr-3 font-mono text-white">
                                    {q.questionNumber}
                                  </td>
                                  <td className="py-1.5 pr-3">{q.topic || '—'}</td>
                                  <td
                                    className={`py-1.5 pr-3 font-semibold ${
                                      q.marksScored < q.marksAvailable ? 'text-rose-300' : 'text-emerald-300'
                                    }`}
                                  >
                                    {q.marksScored}/{q.marksAvailable}
                                  </td>
                                  <td className="py-1.5 text-slate-400">
                                    {q.errorType && q.errorType !== 'NONE'
                                      ? q.errorType.replace('_', ' ').toLowerCase()
                                      : '—'}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {record.teacherFeedback && (
                      <div className="p-3 bg-slate-900/70 rounded-xl border border-slate-800">
                        <h4 className="text-[11px] font-bold text-slate-300 uppercase mb-1">
                          Teacher feedback
                        </h4>
                        <p className="text-xs text-slate-300">{record.teacherFeedback}</p>
                      </div>
                    )}

                    {record.weakTopics && (
                      <div className="p-3 bg-amber-950/25 rounded-xl border border-amber-500/30">
                        <h4 className="text-[11px] font-bold text-amber-300 uppercase mb-1">
                          Topics to go back to
                        </h4>
                        <p className="text-xs text-amber-100">{record.weakTopics}</p>
                      </div>
                    )}

                    <ProofUploader
                      ownerType="ASSESSMENT"
                      ownerId={record.id}
                      label="Attached proof"
                      hint="Add more photos at any time - the paper, the mark scheme, your corrections."
                    />

                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      {record.driveResourceUrl && (
                        <a
                          href={record.driveResourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-[11px] font-bold text-slate-200 hover:bg-slate-700 transition-all"
                        >
                          <ExternalLink className="w-3.5 h-3.5 text-indigo-400" />
                          <span>Open Drive link</span>
                        </a>
                      )}

                      <button
                        onClick={() => openEdit(record)}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-[11px] font-bold text-slate-200 hover:bg-slate-700 transition-all"
                      >
                        <Pencil className="w-3.5 h-3.5 text-indigo-400" />
                        <span>Edit</span>
                      </button>

                      {currentRole === 'PARENT' && (
                        <button
                          onClick={() => handleVerify(record)}
                          className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-[11px] font-bold transition-all ${
                            record.verifiedByParent
                              ? 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
                              : 'bg-emerald-600 border-emerald-500 text-white hover:bg-emerald-500'
                          }`}
                        >
                          <ShieldCheck className="w-3.5 h-3.5" />
                          <span>
                            {record.verifiedByParent ? 'Remove verification' : 'Verify this result'}
                          </span>
                        </button>
                      )}

                      <button
                        onClick={() => handleDelete(record)}
                        className="ml-auto flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-[11px] font-bold text-slate-400 hover:text-rose-400 transition-all"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Delete</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <AssessmentEntryModal
        isOpen={isEntryOpen}
        onClose={() => setIsEntryOpen(false)}
        onSaved={() => {
          loadData();
          onChanged?.();
        }}
        existing={editing}
      />
    </div>
  );
};

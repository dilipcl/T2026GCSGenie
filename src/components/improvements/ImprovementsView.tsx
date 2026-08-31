import React, { useCallback, useEffect, useState } from 'react';
import { ImprovementIdea, ImprovementKind, ImprovementStatus, UserRole } from '../../types';
import {
  IMPROVEMENT_AREAS,
  KIND_ICON,
  KIND_LABEL,
  STATUS_LABEL,
  fileImprovement,
  isSupportedByThisDevice,
  listImprovements,
  setImprovementStatus,
  toggleSupport,
} from '../../services/improvementService';
import { useFeedback } from '../shared/FeedbackProvider';
import { formatFriendlyDate } from '../../utils/date';
import { toLocalISODate } from '../../utils/date';
import { Plus, ThumbsUp, Lock } from 'lucide-react';

/**
 * Where "this bit is annoying" goes.
 *
 * Deliberately inside the app rather than in a message to whoever maintains it.
 * The complaints worth acting on arrive mid-task - the subject picker that
 * demanded a subject on a bank holiday was noticed on the day and surfaced a
 * week later - and the gap between noticing and reporting is where they die.
 *
 * Everyone sees every entry, including the ones marked "Not doing". A
 * suggestion box that hides its rejections teaches people to stop filing.
 */

const STATUS_STYLE: Record<ImprovementStatus, string> = {
  OPEN: 'bg-slate-700/40 border-slate-600 text-slate-300',
  UNDER_REVIEW: 'bg-sky-500/10 border-sky-500/30 text-sky-300',
  PLANNED: 'bg-indigo-500/10 border-indigo-500/30 text-indigo-300',
  DONE: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300',
  DECLINED: 'bg-slate-800 border-slate-700 text-slate-500',
};

const ALL_KINDS: ImprovementKind[] = ['BUG', 'CONFUSING', 'MISSING', 'IDEA'];
const ALL_STATUSES: ImprovementStatus[] = [
  'OPEN',
  'UNDER_REVIEW',
  'PLANNED',
  'DONE',
  'DECLINED',
];

const FileIdeaForm: React.FC<{ role: UserRole; onFiled: () => void }> = ({ role, onFiled }) => {
  const { toast } = useFeedback();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<ImprovementKind>('IDEA');
  const [title, setTitle] = useState('');
  const [detail, setDetail] = useState('');
  const [area, setArea] = useState<string>('');
  const [saving, setSaving] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-indigo-600 text-white font-bold text-sm mb-4"
      >
        <Plus className="w-4 h-4" />
        Report a bug or suggest an improvement
      </button>
    );
  }

  const submit = async () => {
    if (!title.trim() || saving) return;
    setSaving(true);
    try {
      await fileImprovement({ kind, title, detail, area: area || undefined, role });
      setTitle('');
      setDetail('');
      setArea('');
      setOpen(false);
      toast.success('Thanks — that is on the list', 'Everyone can see it now.');
      onFiled();
    } catch (err) {
      toast.error('Could not save that', err instanceof Error ? err.message : 'Try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-700 rounded-2xl p-4 mb-4 space-y-3">
      <div>
        <p className="text-[10px] font-bold text-slate-400 uppercase mb-1.5">What kind of thing?</p>
        <div className="grid grid-cols-2 gap-1.5">
          {ALL_KINDS.map((k) => (
            <button
              type="button"
              key={k}
              onClick={() => setKind(k)}
              className={`px-2 py-2 rounded-xl border text-left text-[11px] font-bold ${
                kind === k
                  ? 'bg-indigo-600 border-indigo-400 text-white'
                  : 'bg-slate-800 border-slate-700 text-slate-300'
              }`}
            >
              <span className="mr-1">{KIND_ICON[k]}</span>
              {KIND_LABEL[k]}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label htmlFor="imp-title" className="block text-[10px] font-bold text-slate-400 uppercase mb-1.5">
          In one line
        </label>
        <input
          id="imp-title"
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Quick Add makes me pick a subject at the weekend"
          className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white placeholder:text-slate-600"
        />
      </div>

      <div>
        <label htmlFor="imp-detail" className="block text-[10px] font-bold text-slate-400 uppercase mb-1.5">
          Anything else (optional)
        </label>
        <textarea
          id="imp-detail"
          rows={3}
          value={detail}
          onChange={(e) => setDetail(e.target.value)}
          placeholder="What were you trying to do, and what happened instead?"
          className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white placeholder:text-slate-600"
        />
      </div>

      <div>
        <label htmlFor="imp-area" className="block text-[10px] font-bold text-slate-400 uppercase mb-1.5">
          Which part of the app?
        </label>
        <select
          id="imp-area"
          value={area}
          onChange={(e) => setArea(e.target.value)}
          className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white"
        >
          <option value="">Not sure</option>
          {IMPROVEMENT_AREAS.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
      </div>

      <div className="flex gap-2 pt-1">
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="flex-1 py-2.5 rounded-xl bg-slate-800 text-slate-300 font-bold text-sm"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={!title.trim() || saving}
          onClick={submit}
          className="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white font-bold text-sm disabled:opacity-40"
        >
          {saving ? 'Saving…' : 'Send it'}
        </button>
      </div>
    </div>
  );
};

const IdeaCard: React.FC<{
  idea: ImprovementIdea;
  role: UserRole;
  onChanged: () => void;
}> = ({ idea, role, onChanged }) => {
  const { toast } = useFeedback();
  const supported = isSupportedByThisDevice(idea);
  const isParent = role === 'PARENT';

  return (
    <li className="bg-slate-900 border border-slate-800 rounded-2xl p-3.5 mb-2.5">
      <div className="flex items-start gap-2.5">
        <span className="text-lg leading-none flex-shrink-0" aria-hidden="true">
          {KIND_ICON[idea.kind]}
        </span>

        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-slate-100 leading-snug break-words">{idea.title}</p>
          {idea.detail && (
            <p className="text-xs text-slate-400 mt-1 leading-snug break-words">{idea.detail}</p>
          )}

          <div className="flex flex-wrap items-center gap-2 mt-2 text-[10px] text-slate-500">
            <span
              className={`px-2 py-0.5 rounded-full border font-bold ${STATUS_STYLE[idea.status]}`}
            >
              {STATUS_LABEL[idea.status]}
            </span>
            {idea.area && <span>{idea.area}</span>}
            <span>
              {idea.createdByRole === 'PARENT' ? 'Parent' : 'Student'} ·{' '}
              {formatFriendlyDate(toLocalISODate(new Date(idea.createdAt)))}
            </span>
          </div>

          {idea.response && (
            <p className="text-xs text-slate-300 mt-2 pl-2.5 border-l-2 border-slate-700 leading-snug">
              {idea.response}
            </p>
          )}

          <div className="flex items-center gap-2 mt-2.5">
            <button
              type="button"
              onClick={async () => {
                await toggleSupport(idea.id);
                onChanged();
              }}
              className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg border text-[11px] font-bold ${
                supported
                  ? 'bg-indigo-600 border-indigo-400 text-white'
                  : 'bg-slate-800 border-slate-700 text-slate-300'
              }`}
            >
              <ThumbsUp className="w-3 h-3" />
              {idea.supportedBy?.length || 0}
            </button>

            {isParent ? (
              <select
                value={idea.status}
                onChange={async (e) => {
                  try {
                    await setImprovementStatus(
                      idea.id,
                      e.target.value as ImprovementStatus,
                      role
                    );
                    onChanged();
                  } catch (err) {
                    toast.error(
                      'Could not update',
                      err instanceof Error ? err.message : 'Try again.'
                    );
                  }
                }}
                className="bg-slate-800 border border-slate-700 rounded-lg px-2 py-1 text-[11px] text-slate-200 font-bold"
              >
                {ALL_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABEL[s]}
                  </option>
                ))}
              </select>
            ) : (
              <span className="inline-flex items-center gap-1 text-[10px] text-slate-600">
                <Lock className="w-3 h-3" />
                A parent sets the status
              </span>
            )}
          </div>
        </div>
      </div>
    </li>
  );
};

export const ImprovementsView: React.FC<{ currentRole: UserRole }> = ({ currentRole }) => {
  const [ideas, setIdeas] = useState<ImprovementIdea[]>([]);
  const [statusFilter, setStatusFilter] = useState<ImprovementStatus[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    setIdeas(await listImprovements({ statuses: statusFilter.length ? statusFilter : undefined }));
    setLoading(false);
  }, [statusFilter]);

  useEffect(() => {
    reload();
  }, [reload]);

  return (
    <div className="pb-8">
      <header className="mb-4">
        <h1 className="text-2xl font-black text-white">Report Bugs / Suggest Improvements</h1>
        <p className="text-sm text-slate-400 mt-0.5">
          Anything about this app that is broken, confusing or missing.
        </p>
      </header>

      <FileIdeaForm role={currentRole} onFiled={reload} />

      <div className="flex gap-1.5 overflow-x-auto pb-2 mb-3 -mx-1 px-1">
        <button
          type="button"
          onClick={() => setStatusFilter([])}
          className={`px-2.5 py-1 rounded-full border text-[11px] font-bold whitespace-nowrap ${
            statusFilter.length === 0
              ? 'bg-indigo-600 border-indigo-400 text-white'
              : 'bg-slate-800 border-slate-700 text-slate-300'
          }`}
        >
          Everything
        </button>
        {ALL_STATUSES.map((status) => (
          <button
            type="button"
            key={status}
            onClick={() =>
              setStatusFilter((prev) =>
                prev.includes(status) ? prev.filter((s) => s !== status) : [...prev, status]
              )
            }
            className={`px-2.5 py-1 rounded-full border text-[11px] font-bold whitespace-nowrap ${
              statusFilter.includes(status)
                ? 'bg-indigo-600 border-indigo-400 text-white'
                : 'bg-slate-800 border-slate-700 text-slate-300'
            }`}
          >
            {STATUS_LABEL[status]}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-slate-500 py-8 text-center">Loading…</p>
      ) : ideas.length === 0 ? (
        <div className="text-center py-10 px-6">
          <p className="text-sm text-slate-400 leading-snug">
            Nothing here yet. If something in the app slows you down, put it here while you are
            still annoyed by it — that is when the description is most useful.
          </p>
        </div>
      ) : (
        <ul>
          {ideas.map((idea) => (
            <IdeaCard key={idea.id} idea={idea} role={currentRole} onChanged={reload} />
          ))}
        </ul>
      )}
    </div>
  );
};

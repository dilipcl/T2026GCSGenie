import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db';
import { FixedCommitment } from '../../types';
import {
  archiveCommitment,
  listCommitments,
  REASON_LABEL,
  saveCommitment,
  STATUS_LABEL,
  weekExceptions,
} from '../../services/commitmentService';
import { useFeedback } from '../shared/FeedbackProvider';
import { newId } from '../../utils/id';
import { formatFriendlyDate } from '../../utils/date';
import { CalendarClock, Plus, Save, Archive, RotateCcw } from 'lucide-react';

/**
 * The fixed weekly commitments, and what has been excused from them.
 *
 * These were a hardcoded array inside the burnout engine. Quitting drums, or
 * simply having a second child, meant editing source - and every hour of it was
 * being charged against the week whether or not the evening happened.
 *
 * The exception list underneath is deliberate: excusing an occasion removes
 * hours from the load, and a way to make hours disappear that a parent cannot
 * see would quietly undermine the one gauge the whole model rests on. The
 * portal's promise is "fewer arguments, same trust", and this is the trust half.
 */
export const CommitmentManagerPanel: React.FC = () => {
  const { toast, confirm } = useFeedback();
  const commitments = useLiveQuery(() => listCommitments(true), [], []);
  const exceptions = useLiveQuery(() => weekExceptions(), [], []);
  const commitmentLabels = useLiveQuery(
    async () => Object.fromEntries((await db.commitments.toArray()).map((c) => [c.id, c.label])),
    [],
    {} as Record<string, string>
  );

  const [draft, setDraft] = useState<{ label: string; hours: string } | null>(null);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const totalHours = commitments
    .filter((c) => c.isActive)
    .reduce((sum, c) => sum + c.weeklyHours, 0);

  const handleSaveHours = async (commitment: FixedCommitment) => {
    const raw = edits[commitment.id];
    const hours = Number(raw);
    if (!Number.isFinite(hours) || hours < 0 || hours > 100) {
      toast.error('That is not a number of hours', 'Nothing was changed.');
      return;
    }

    setBusy(true);
    try {
      await saveCommitment({
        ...commitment,
        weeklyHours: Math.round(hours * 10) / 10,
        // An occasion cost that was simply the weekly total follows it; one
        // that was set deliberately is left alone.
        hoursPerOccasion:
          commitment.hoursPerOccasion === commitment.weeklyHours
            ? Math.round(hours * 10) / 10
            : commitment.hoursPerOccasion,
      });
      setEdits((prev) => {
        const next = { ...prev };
        delete next[commitment.id];
        return next;
      });
      toast.success('Saved', `${commitment.label} now counts ${hours} hrs/week.`);
    } catch (err) {
      console.error('Could not save that commitment:', err);
      toast.error('Could not save that', 'Nothing was changed.');
    } finally {
      setBusy(false);
    }
  };

  const handleArchive = async (commitment: FixedCommitment) => {
    const ok = await confirm({
      title: `Stop counting "${commitment.label}"?`,
      body: `${commitment.weeklyHours} hrs/week come off the weekly load. Past absences stay in the record and it can be switched back on.`,
      confirmLabel: 'Stop counting it',
      tone: 'danger',
    });
    if (!ok) return;

    await archiveCommitment(commitment);
    toast.info(`${commitment.label} no longer counts`, 'The weekly load has gone down.');
  };

  const handleRestore = async (commitment: FixedCommitment) => {
    await saveCommitment({ ...commitment, isActive: true });
    toast.success(`${commitment.label} counts again`, `${commitment.weeklyHours} hrs/week.`);
  };

  const handleAdd = async () => {
    if (!draft) return;
    const hours = Number(draft.hours);
    if (!draft.label.trim() || !Number.isFinite(hours) || hours <= 0) {
      toast.error('Needs a name and some hours', 'Nothing was added.');
      return;
    }

    setBusy(true);
    try {
      await saveCommitment({
        id: newId('cmt'),
        label: draft.label.trim(),
        weeklyHours: Math.round(hours * 10) / 10,
        hoursPerOccasion: Math.round(hours * 10) / 10,
        timetableEntryIds: [],
        isActive: true,
      });
      setDraft(null);
      toast.success('Added', `${draft.label.trim()} now counts towards the week.`);
    } catch (err) {
      console.error('Could not add that commitment:', err);
      toast.error('Could not add that', 'Nothing was changed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="glass-card p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4 pb-3 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <CalendarClock className="w-5 h-5 text-purple-400" />
          <div>
            <h3 className="font-bold text-sm text-white">Fixed commitments</h3>
            <p className="text-[11px] text-slate-400">
              What the week already contains before any homework — {totalHours} hrs/week.
            </p>
          </div>
        </div>

        {!draft && (
          <button
            onClick={() => setDraft({ label: '', hours: '' })}
            className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-[11px] font-semibold flex items-center gap-1"
          >
            <Plus className="w-3 h-3" />
            <span>Add one</span>
          </button>
        )}
      </div>

      {draft && (
        <div className="flex flex-wrap items-center gap-2 mb-3 p-3 rounded-xl bg-slate-900/70 border border-slate-700">
          <input
            type="text"
            aria-label="Commitment name"
            placeholder="Swimming club"
            value={draft.label}
            onChange={(e) => setDraft({ ...draft, label: e.target.value })}
            className="flex-1 min-w-[10rem] bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-2 text-xs text-white placeholder-slate-600"
          />
          <input
            type="number"
            step="0.5"
            min="0"
            aria-label="Hours per week"
            placeholder="2"
            value={draft.hours}
            onChange={(e) => setDraft({ ...draft, hours: e.target.value })}
            className="w-20 bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-2 text-xs text-white placeholder-slate-600"
          />
          <span className="text-[11px] text-slate-400">hrs/week</span>
          <button
            onClick={handleAdd}
            disabled={busy}
            className="px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-[11px] font-bold"
          >
            Add
          </button>
          <button
            onClick={() => setDraft(null)}
            className="px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 text-[11px] font-semibold"
          >
            Cancel
          </button>
        </div>
      )}

      <div className="space-y-2">
        {commitments.map((c) => {
          const pending = edits[c.id];
          const changed = pending !== undefined && Number(pending) !== c.weeklyHours;

          return (
            <div
              key={c.id}
              className={`flex flex-wrap items-center gap-2 p-3 rounded-xl border ${
                c.isActive
                  ? 'bg-slate-900/70 border-slate-800'
                  : 'bg-slate-950/60 border-slate-800/60 opacity-60'
              }`}
            >
              <span className="flex-1 min-w-[8rem] text-xs font-semibold text-white">
                {c.label}
                {!c.isActive && (
                  <span className="ml-2 text-[10px] font-normal text-slate-500">not counted</span>
                )}
              </span>

              <input
                type="number"
                step="0.5"
                min="0"
                aria-label={`${c.label} hours per week`}
                disabled={!c.isActive}
                value={pending ?? String(c.weeklyHours)}
                onChange={(e) => setEdits((prev) => ({ ...prev, [c.id]: e.target.value }))}
                className="w-20 bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white disabled:opacity-50"
              />
              <span className="text-[11px] text-slate-400">hrs/wk</span>

              {changed && (
                <button
                  onClick={() => handleSaveHours(c)}
                  disabled={busy}
                  className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-[11px] font-bold flex items-center gap-1"
                >
                  <Save className="w-3 h-3" />
                  <span>Save</span>
                </button>
              )}

              {c.isActive ? (
                <button
                  onClick={() => handleArchive(c)}
                  title="Stop counting this towards the week"
                  className="p-2 text-slate-400 hover:text-rose-300 rounded-lg hover:bg-slate-800"
                >
                  <Archive className="w-3.5 h-3.5" />
                </button>
              ) : (
                <button
                  onClick={() => handleRestore(c)}
                  title="Count this again"
                  className="p-2 text-slate-400 hover:text-emerald-300 rounded-lg hover:bg-slate-800"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* EXC-4. Excused hours are visible to the person the gauge is for. */}
      <div className="mt-5 pt-4 border-t border-slate-800">
        <h4 className="text-xs font-bold text-white mb-1">Excused this week</h4>
        {exceptions.length === 0 ? (
          <p className="text-[11px] text-slate-500">
            Nothing logged — every commitment ran as scheduled.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {exceptions.map((e) => (
              <li
                key={e.id}
                className="flex flex-wrap items-baseline justify-between gap-2 text-[11px] p-2 rounded-lg bg-slate-900/60 border border-slate-800"
              >
                <span className="text-slate-200 font-medium">
                  {e.title}
                  <span className="text-slate-500 font-normal">
                    {' '}
                    · {commitmentLabels[e.commitmentId] || e.commitmentId}
                  </span>
                </span>
                <span className="text-slate-400">
                  {formatFriendlyDate(e.date)} · {STATUS_LABEL[e.status]} ·{' '}
                  {REASON_LABEL[e.reasonCategory]}
                  {e.deductsFromCapacity && (
                    <span className="text-amber-300"> · −{e.scheduledHours}h</span>
                  )}
                </span>
                {e.reasonNotes && (
                  <span className="w-full text-[10px] text-slate-500 italic">{e.reasonNotes}</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

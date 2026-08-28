import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db';
import { Chore, ChoreCadence, DayOfWeek } from '../../types';
import {
  CADENCE_LABEL,
  CHORE_SUGGESTIONS,
  DAY_LABEL,
  DEFAULT_CHORE_XP,
  saveChore,
  setChoreActive,
} from '../../services/choreService';
import { useFeedback } from '../shared/FeedbackProvider';
import { ListChecks, Plus, RotateCcw, Archive, X } from 'lucide-react';

const CADENCES: ChoreCadence[] = ['DAILY', 'WEEKDAYS', 'WEEKLY'];
const DAYS: DayOfWeek[] = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

/**
 * The chore list, owned by a parent.
 *
 * Chores are retired rather than deleted. Seeding re-inserts any row it knows
 * about and finds missing, so a deleted row can come back on the next open;
 * retiring also keeps past completions pointing at something real, and leaves
 * XP that was genuinely earned alone.
 */
export const ChoreManagerPanel: React.FC = () => {
  const { toast, confirm } = useFeedback();
  const chores = useLiveQuery(() => db.chores.orderBy('createdAt').toArray(), []);

  const [isAdding, setIsAdding] = useState(false);
  const [editing, setEditing] = useState<Chore | null>(null);
  const [title, setTitle] = useState('');
  const [cadence, setCadence] = useState<ChoreCadence>('DAILY');
  const [dayOfWeek, setDayOfWeek] = useState<DayOfWeek>('SAT');
  const [xpValue, setXpValue] = useState<number>(DEFAULT_CHORE_XP.DAILY);
  const [busy, setBusy] = useState(false);

  const active = (chores ?? []).filter((c) => c.isActive);
  const retired = (chores ?? []).filter((c) => !c.isActive);

  const openForm = (chore?: Chore) => {
    setEditing(chore ?? null);
    setTitle(chore?.title ?? '');
    setCadence(chore?.cadence ?? 'DAILY');
    setDayOfWeek(chore?.dayOfWeek ?? 'SAT');
    setXpValue(chore?.xpValue ?? DEFAULT_CHORE_XP.DAILY);
    setIsAdding(true);
  };

  const closeForm = () => {
    setIsAdding(false);
    setEditing(null);
  };

  const pickCadence = (next: ChoreCadence) => {
    setCadence(next);
    // Only follow the default while the parent has not set their own figure
    if (xpValue === DEFAULT_CHORE_XP[cadence]) setXpValue(DEFAULT_CHORE_XP[next]);
  };

  const handleSave = async () => {
    if (!title.trim() || busy) return;
    setBusy(true);
    try {
      await saveChore({ id: editing?.id, title, cadence, dayOfWeek, xpValue });
      toast.success(editing ? 'Chore updated' : 'Chore added', `${title.trim()} · ${xpValue} XP`);
      closeForm();
    } catch (err) {
      console.error('Could not save chore:', err);
      toast.error('Could not save that chore', 'Nothing was changed.');
    } finally {
      setBusy(false);
    }
  };

  const handleSuggestion = async (s: (typeof CHORE_SUGGESTIONS)[number]) => {
    try {
      await saveChore({ title: s.title, cadence: s.cadence, dayOfWeek: s.dayOfWeek });
      toast.success('Added', s.title);
    } catch {
      toast.error('Could not add that one');
    }
  };

  const handleRetire = async (chore: Chore) => {
    const ok = await confirm({
      title: `Retire "${chore.title}"?`,
      body: 'It stops appearing on the daily list. XP already earned for it stays earned, and the history keeps it.',
      confirmLabel: 'Retire',
    });
    if (!ok) return;
    await setChoreActive(chore, false);
    toast.success('Retired', chore.title);
  };

  const unusedSuggestions = CHORE_SUGGESTIONS.filter(
    (s) => !(chores ?? []).some((c) => c.title.toLowerCase() === s.title.toLowerCase())
  );

  return (
    <div className="glass-card p-6">
      <div className="flex items-center justify-between gap-3 mb-3 pb-3 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <ListChecks className="w-5 h-5 text-amber-400" />
          <h3 className="font-bold text-sm text-white">Chores</h3>
        </div>
        {!isAdding && (
          <button
            onClick={() => openForm()}
            className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-bold flex items-center gap-1"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add</span>
          </button>
        )}
      </div>

      <p className="text-xs text-slate-300 mb-4">
        Small recurring jobs, ticked off in one tap. They earn XP but sit outside the study plan
        entirely - no due dates, no subject, and no effect on the weekly workload or the burnout
        gauge.
      </p>

      {isAdding && (
        <div className="mb-4 p-3.5 bg-slate-900/80 border border-slate-800 rounded-xl space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-white">
              {editing ? 'Edit chore' : 'New chore'}
            </span>
            <button onClick={closeForm} aria-label="Cancel" className="p-1 text-slate-400 hover:text-white">
              <X className="w-4 h-4" />
            </button>
          </div>

          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Put the bins out"
            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500"
          />

          <div className="grid grid-cols-3 gap-1.5">
            {CADENCES.map((c) => (
              <button
                key={c}
                onClick={() => pickCadence(c)}
                className={`py-2 rounded-xl text-[11px] font-bold border transition-all ${
                  cadence === c
                    ? 'bg-indigo-600 border-indigo-400 text-white'
                    : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
                }`}
              >
                {CADENCE_LABEL[c]}
              </button>
            ))}
          </div>

          {cadence === 'WEEKLY' && (
            <div className="grid grid-cols-7 gap-1">
              {DAYS.map((d) => (
                <button
                  key={d}
                  onClick={() => setDayOfWeek(d)}
                  aria-label={DAY_LABEL[d]}
                  className={`py-2 rounded-lg text-[10px] font-bold border transition-all ${
                    dayOfWeek === d
                      ? 'bg-indigo-600 border-indigo-400 text-white'
                      : 'bg-slate-800 border-slate-700 text-slate-300'
                  }`}
                >
                  {d[0]}{d[1].toLowerCase()}
                </button>
              ))}
            </div>
          )}

          <div className="flex items-center gap-2">
            <label htmlFor="chore-xp" className="text-[11px] font-semibold text-slate-300">
              XP
            </label>
            <input
              id="chore-xp"
              type="number"
              min={1}
              max={200}
              value={xpValue}
              onChange={(e) => setXpValue(Number(e.target.value))}
              className="w-20 bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white tabular-nums focus:outline-none focus:border-indigo-500"
            />
            <span className="text-[10px] text-slate-500">
              Keep it small - a chore should not out-earn revision.
            </span>
          </div>

          <button
            onClick={handleSave}
            disabled={!title.trim() || busy}
            className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs disabled:opacity-40"
          >
            {editing ? 'Save changes' : 'Add chore'}
          </button>
        </div>
      )}

      {active.length > 0 ? (
        <div className="space-y-1.5">
          {active.map((chore) => (
            <div
              key={chore.id}
              className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-slate-800/60 border border-slate-700"
            >
              <button onClick={() => openForm(chore)} className="flex-1 text-left min-w-0">
                <p className="text-xs font-semibold text-slate-100 truncate">{chore.title}</p>
                <p className="text-[10px] text-slate-400">
                  {CADENCE_LABEL[chore.cadence]}
                  {chore.cadence === 'WEEKLY' && chore.dayOfWeek
                    ? ` · ${DAY_LABEL[chore.dayOfWeek]}`
                    : ''}
                  {' · '}
                  {chore.xpValue} XP
                </p>
              </button>
              <button
                onClick={() => handleRetire(chore)}
                aria-label={`Retire ${chore.title}`}
                className="p-1.5 rounded-lg text-slate-400 hover:text-amber-300 hover:bg-slate-700"
              >
                <Archive className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      ) : (
        !isAdding && (
          <p className="text-xs text-slate-400 mb-3">
            No chores yet. Add your own, or start from one of these:
          </p>
        )
      )}

      {unusedSuggestions.length > 0 && active.length < 6 && (
        <div className="flex flex-wrap gap-1.5 mt-3">
          {unusedSuggestions.slice(0, 4).map((s) => (
            <button
              key={s.title}
              onClick={() => handleSuggestion(s)}
              className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-[11px] text-slate-300 font-semibold flex items-center gap-1"
            >
              <Plus className="w-3 h-3 text-slate-500" />
              <span>{s.title}</span>
            </button>
          ))}
        </div>
      )}

      {retired.length > 0 && (
        <div className="mt-4 pt-3 border-t border-slate-800">
          <p className="text-[10px] uppercase tracking-wider font-bold text-slate-500 mb-2">
            Retired
          </p>
          <div className="flex flex-wrap gap-1.5">
            {retired.map((chore) => (
              <button
                key={chore.id}
                onClick={async () => {
                  await setChoreActive(chore, true);
                  toast.success('Back on the list', chore.title);
                }}
                className="px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-[11px] text-slate-400 hover:text-slate-200 font-semibold flex items-center gap-1"
              >
                <RotateCcw className="w-3 h-3" />
                <span>{chore.title}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db';
import { RewardItem } from '../../types';
import { logAuditEvent, logFieldChanges } from '../../services/auditService';
import { useFeedback } from '../shared/FeedbackProvider';
import { newId } from '../../utils/id';
import { Gift, Plus, PencilLine, Archive, RotateCcw, X } from 'lucide-react';

const CATEGORIES: { id: RewardItem['category']; label: string }[] = [
  { id: 'SCREEN_TIME', label: 'Screen time' },
  { id: 'PRIVILEGE', label: 'Privilege' },
  { id: 'ACTIVITY', label: 'Activity' },
  { id: 'CUSTOM', label: 'Other' },
];

/**
 * The rewards catalogue, owned by a parent.
 *
 * What a family will actually trade for is the most local thing in the app, and
 * until now it was the least changeable: the shelf came from seedData and
 * re-pricing anything meant editing source and shipping a migration. A reward
 * that does not motivate is worse than no reward, because it teaches that the
 * XP does not buy anything worth having.
 *
 * Rewards are retired, never deleted - seeding re-inserts any row it knows
 * about and finds missing, and a pending redemption has to keep resolving to
 * something real.
 */
export const RewardManagerPanel: React.FC = () => {
  const { toast, confirm } = useFeedback();
  const rewards = useLiveQuery(() => db.rewards.toArray(), []);

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editing, setEditing] = useState<RewardItem | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [costXP, setCostXP] = useState(100);
  const [icon, setIcon] = useState('🎁');
  const [category, setCategory] = useState<RewardItem['category']>('PRIVILEGE');
  const [busy, setBusy] = useState(false);

  const live = (rewards ?? []).filter((r) => !r.isArchived).sort((a, b) => a.costXP - b.costXP);
  const retired = (rewards ?? []).filter((r) => r.isArchived);

  const openForm = (reward?: RewardItem) => {
    setEditing(reward ?? null);
    setTitle(reward?.title ?? '');
    setDescription(reward?.description ?? '');
    setCostXP(reward?.costXP ?? 100);
    setIcon(reward?.icon ?? '🎁');
    setCategory(reward?.category ?? 'PRIVILEGE');
    setIsFormOpen(true);
  };

  const closeForm = () => {
    setIsFormOpen(false);
    setEditing(null);
  };

  const handleSave = async () => {
    if (!title.trim() || busy) return;
    setBusy(true);

    try {
      const fields = {
        title: title.trim(),
        description: description.trim(),
        costXP: Math.max(0, Math.round(costXP)),
        icon: icon.trim() || '🎁',
        category,
      };

      if (editing) {
        await db.rewards.update(editing.id, fields);
        await logFieldChanges({
          user: 'PARENT',
          entity: 'RewardItem',
          entityId: editing.id,
          before: editing as unknown as Record<string, unknown>,
          after: fields as unknown as Record<string, unknown>,
          labels: { costXP: 'cost in XP' },
        });
        toast.success('Reward updated', `${fields.title} · ${fields.costXP} XP`);
      } else {
        const created: RewardItem = { id: newId('reward'), ...fields };
        await db.rewards.add(created);
        await logAuditEvent({
          user: 'PARENT',
          action: 'INSERT',
          entity: 'RewardItem',
          entityId: created.id,
          newValue: `${created.title} (${created.costXP} XP, ${created.category})`,
        });
        toast.success('Reward added', `${created.title} · ${created.costXP} XP`);
      }

      closeForm();
    } catch (err) {
      console.error('Could not save reward:', err);
      toast.error('Could not save that reward', 'Nothing was changed.');
    } finally {
      setBusy(false);
    }
  };

  const setArchived = async (reward: RewardItem, archived: boolean) => {
    if (archived) {
      const ok = await confirm({
        title: `Retire "${reward.title}"?`,
        body: 'It comes off the shelf. Requests already approved for it stay in the history, and it can be brought back at any time.',
        confirmLabel: 'Retire',
      });
      if (!ok) return;
    }

    await db.rewards.update(reward.id, { isArchived: archived });
    await logAuditEvent({
      user: 'PARENT',
      action: 'UPDATE',
      entity: 'RewardItem',
      entityId: reward.id,
      fieldChanged: 'isArchived',
      oldValue: String(!!reward.isArchived),
      newValue: String(archived),
    });
    toast.info(archived ? `Retired "${reward.title}"` : `"${reward.title}" is back on the shelf`);
  };

  const Row: React.FC<{ reward: RewardItem; isRetired: boolean }> = ({ reward, isRetired }) => (
    <div className="p-3 bg-slate-900/70 border border-slate-800 rounded-xl flex flex-wrap items-center justify-between gap-2">
      <div className="flex items-center gap-2.5 min-w-0">
        <span className="text-lg leading-none">{reward.icon}</span>
        <div className="min-w-0">
          <p className={`text-xs font-bold ${isRetired ? 'text-slate-500' : 'text-white'}`}>
            {reward.title}
          </p>
          <p className="text-[11px] text-slate-500 truncate max-w-xs">{reward.description}</p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-[11px] font-mono text-amber-300 bg-amber-950/40 border border-amber-800/60 px-2 py-0.5 rounded">
          {reward.costXP} XP
        </span>

        {!isRetired && (
          <button
            onClick={() => openForm(reward)}
            aria-label={`Edit ${reward.title}`}
            className="p-1.5 text-slate-500 hover:text-indigo-300 transition-colors"
          >
            <PencilLine className="w-4 h-4" />
          </button>
        )}

        <button
          onClick={() => setArchived(reward, !isRetired)}
          aria-label={isRetired ? `Restore ${reward.title}` : `Retire ${reward.title}`}
          className="p-1.5 text-slate-500 hover:text-white transition-colors"
        >
          {isRetired ? <RotateCcw className="w-4 h-4" /> : <Archive className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );

  return (
    <div className="glass-card p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4 pb-3 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <Gift className="w-5 h-5 text-amber-400" />
          <div>
            <h3 className="font-bold text-sm text-white">Rewards catalogue</h3>
            <p className="text-[11px] text-slate-400">
              What XP actually buys. Price it for your house, not for the app.
            </p>
          </div>
        </div>

        {!isFormOpen && (
          <button
            onClick={() => openForm()}
            className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs flex items-center gap-1.5 transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>Add reward</span>
          </button>
        )}
      </div>

      {isFormOpen && (
        <div className="mb-4 p-4 bg-slate-800/60 border border-slate-700 rounded-2xl space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold text-indigo-300 uppercase">
              {editing ? 'Edit reward' : 'New reward'}
            </h4>
            <button
              onClick={closeForm}
              aria-label="Cancel"
              className="p-1 text-slate-400 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-[3rem,1fr,6rem] gap-2">
            <div>
              <label className="block text-[10px] font-bold text-slate-300 uppercase mb-1">
                Icon
              </label>
              <input
                type="text"
                maxLength={4}
                value={icon}
                onChange={(e) => setIcon(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-center text-base text-white"
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold text-slate-300 uppercase mb-1">
                Title
              </label>
              <input
                type="text"
                placeholder="e.g. Film night, your pick"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-slate-500"
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold text-slate-300 uppercase mb-1">
                Cost (XP)
              </label>
              <input
                type="number"
                min="0"
                step="10"
                value={costXP}
                onChange={(e) => setCostXP(Number(e.target.value))}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white"
              />
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-bold text-slate-300 uppercase mb-1">
              What it means
            </label>
            <input
              type="text"
              placeholder="Spell out exactly what is being agreed - no arguments later"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-slate-500"
            />
          </div>

          <div className="grid grid-cols-4 gap-1.5">
            {CATEGORIES.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setCategory(c.id)}
                className={`py-2 rounded-xl text-[11px] font-bold border transition-all ${
                  category === c.id
                    ? 'bg-indigo-600 text-white border-indigo-400'
                    : 'bg-slate-900 text-slate-400 border-slate-700'
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>

          <button
            onClick={handleSave}
            disabled={!title.trim() || busy}
            className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold text-xs"
          >
            {busy ? 'Saving...' : editing ? 'Save changes' : 'Add to the shelf'}
          </button>
        </div>
      )}

      <div className="space-y-2">
        {live.length === 0 ? (
          <p className="text-xs text-slate-500 italic">
            Nothing on the shelf. XP with nothing to spend it on stops being worth earning.
          </p>
        ) : (
          live.map((r) => <Row key={r.id} reward={r} isRetired={false} />)
        )}
      </div>

      {retired.length > 0 && (
        <div className="mt-4 pt-3 border-t border-slate-800 space-y-2">
          <p className="text-[11px] font-bold text-slate-500 uppercase">Retired</p>
          {retired.map((r) => (
            <Row key={r.id} reward={r} isRetired />
          ))}
        </div>
      )}
    </div>
  );
};

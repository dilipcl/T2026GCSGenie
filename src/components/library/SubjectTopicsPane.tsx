import React, { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { SubjectId, UserRole } from '../../types';
import { subjectTopics, tagUntagged, TopicSummary } from '../../services/topicTimeline';
import { AddTopicForm } from './AddTopicForm';
import { TopicPage } from './TopicPage';
import { useFeedback } from '../shared/FeedbackProvider';
import { formatShortDate } from '../../utils/date';
import { Plus, Target, Inbox, ChevronRight } from 'lucide-react';

/**
 * A subject by its topics - the view the Library opens a subject on.
 *
 * Three things, in the order they are needed. The goal first, because it says
 * what this subject is for and by when. Then the untagged inbox, because every
 * number below it is only as good as how much has been tagged - sixty-four
 * lessons arrived from September with no topic, and a topic list that says
 * "0 lessons" beside every row while they sit unsorted is lying by omission.
 * Then the topics themselves, each opening onto everything recorded against it.
 */

const INBOX_PREVIEW = 8;

const KIND_LABEL = { LESSON: 'Lesson', FILE: 'Photo', NOTE: 'Note' } as const;

const STATUS_LABEL: Record<string, string> = {
  APPROVED_LOCKED: 'agreed',
  PENDING_DISCUSSION: 'awaiting approval',
  DRAFT: 'draft',
  COMPLETED: 'completed',
  DEFERRED: 'deferred',
};

function counts(row: TopicSummary): string {
  const parts: string[] = [];
  if (row.lessons) parts.push(`${row.lessons} lesson${row.lessons === 1 ? '' : 's'}`);
  if (row.focusMinutes) parts.push(`${row.focusMinutes} min studied`);
  if (row.work) parts.push(`${row.work} work`);
  if (row.materials) parts.push(`${row.materials} captured`);
  return parts.length ? parts.join(' · ') : 'Nothing recorded yet';
}

interface SubjectTopicsPaneProps {
  subjectId: SubjectId;
  role: UserRole;
  onOpenMaterial: (materialId: string) => void;
}

export const SubjectTopicsPane: React.FC<SubjectTopicsPaneProps> = ({
  subjectId,
  role,
  onOpenMaterial,
}) => {
  const { toast } = useFeedback();
  const data = useLiveQuery(() => subjectTopics(subjectId), [subjectId]);
  const [openTopicId, setOpenTopicId] = useState<string | undefined>(undefined);
  const [adding, setAdding] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkTopic, setBulkTopic] = useState('');
  const [showAllInbox, setShowAllInbox] = useState(false);
  const [tagging, setTagging] = useState(false);

  const byUnit = useMemo(() => {
    const map = new Map<string, TopicSummary[]>();
    for (const row of data?.topics ?? []) {
      map.set(row.topic.unit, [...(map.get(row.topic.unit) ?? []), row]);
    }
    return [...map.entries()];
  }, [data]);

  if (!data) return <p className="text-[11px] text-slate-500">Reading the topics…</p>;

  const open = data.topics.find((t) => t.topic.id === openTopicId);
  if (open) {
    return (
      <TopicPage
        summary={open}
        role={role}
        onBack={() => setOpenTopicId(undefined)}
        onOpenMaterial={onOpenMaterial}
      />
    );
  }

  const inbox = showAllInbox ? data.untagged : data.untagged.slice(0, INBOX_PREVIEW);
  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const applyBulk = async () => {
    if (!bulkTopic || selected.size === 0) return;
    setTagging(true);
    try {
      const items = data.untagged.filter((u) => selected.has(u.id));
      await tagUntagged(items, bulkTopic, role);
      const topic = data.topics.find((t) => t.topic.id === bulkTopic)?.topic;
      toast.success(`Tagged ${items.length}`, topic?.title);
      setSelected(new Set());
    } finally {
      setTagging(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* What the subject is for, and by when. */}
      {data.goals.length > 0 && (
        <div className="space-y-1">
          {data.goals.map((goal) => (
            <p key={goal.id} className="text-[11px] text-slate-300 flex items-start gap-1.5">
              <Target className="w-3.5 h-3.5 text-indigo-300 flex-shrink-0 mt-px" />
              <span>
                <span className="font-semibold text-white">{goal.title}</span>
                {' · '}
                {STATUS_LABEL[goal.status] ?? goal.status.toLowerCase()} ·{' '}
                {goal.weeklyHoursRequired} h/week
                {goal.targetDate && ` · by ${formatShortDate(goal.targetDate)}`}
              </span>
            </p>
          ))}
        </div>
      )}

      <p className="text-[11px] text-slate-400">
        {data.lessonsAnswered} lesson{data.lessonsAnswered === 1 ? '' : 's'} recorded ·{' '}
        <span className={data.lessonsTagged < data.lessonsAnswered ? 'text-amber-300' : 'text-emerald-300'}>
          {data.lessonsTagged} tagged to a topic
        </span>
      </p>

      {data.untagged.length > 0 && (
        <div className="p-3 rounded-xl bg-amber-950/20 border border-amber-500/30 space-y-2">
          <p className="text-[11px] font-bold text-amber-100 flex items-center gap-1.5">
            <Inbox className="w-3.5 h-3.5" />
            {data.untagged.length} not tagged to a topic yet
          </p>
          <p className="text-[10px] text-slate-400 leading-snug">
            Tick the ones that were about the same thing, pick the topic once. Tagged, they show up
            on that topic's page - and they are what revision gets built from.
          </p>

          <ul className="space-y-1">
            {inbox.map((item) => (
              <li key={item.id}>
                <label className="flex items-start gap-2 p-2 rounded-lg bg-slate-900/70 border border-slate-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selected.has(item.id)}
                    onChange={() => toggle(item.id)}
                    className="accent-amber-500 mt-0.5"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[11px] text-slate-100 break-words">{item.title}</span>
                    {item.detail && (
                      <span className="block text-[10px] text-slate-300 whitespace-pre-wrap">
                        {item.detail}
                      </span>
                    )}
                    <span className="block text-[10px] text-slate-500">
                      {formatShortDate(item.date)} · {KIND_LABEL[item.kind]}
                    </span>
                  </span>
                </label>
              </li>
            ))}
          </ul>

          <div className="flex flex-wrap items-center gap-2">
            {data.untagged.length > INBOX_PREVIEW && (
              <button
                type="button"
                onClick={() => setShowAllInbox((prev) => !prev)}
                className="text-[10px] text-slate-400 hover:text-slate-200 underline"
              >
                {showAllInbox ? 'Show fewer' : `Show all ${data.untagged.length}`}
              </button>
            )}
            <button
              type="button"
              onClick={() =>
                setSelected(
                  selected.size === inbox.length ? new Set() : new Set(inbox.map((i) => i.id))
                )
              }
              className="text-[10px] text-slate-400 hover:text-slate-200 underline"
            >
              {selected.size === inbox.length ? 'Clear' : 'Select all shown'}
            </button>
          </div>

          {selected.size > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={bulkTopic}
                onChange={(e) => setBulkTopic(e.target.value)}
                aria-label="Topic to tag the selected items to"
                className="flex-1 min-w-[12rem] bg-slate-950 border border-amber-500/40 rounded-lg px-2 py-1.5 text-[11px] text-white"
              >
                <option value="">Which topic?</option>
                {data.topics.map((t) => (
                  <option key={t.topic.id} value={t.topic.id}>
                    {t.topic.unit} · {t.topic.title}
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={!bulkTopic || tagging}
                onClick={() => void applyBulk()}
                className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 text-[11px] font-bold"
              >
                Tag {selected.size}
              </button>
            </div>
          )}
          {selected.size > 0 && data.topics.length === 0 && (
            <p className="text-[10px] text-amber-300">
              This subject has no topics yet - add one below first.
            </p>
          )}
        </div>
      )}

      {adding ? (
        <AddTopicForm
          subjectId={subjectId}
          units={data.units}
          onDone={() => setAdding(false)}
        />
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-[11px] font-bold text-indigo-200"
        >
          <Plus className="w-3.5 h-3.5" />
          Add topic
        </button>
      )}

      {byUnit.length === 0 ? (
        <p className="text-xs text-slate-500">No topics for this subject yet.</p>
      ) : (
        byUnit.map(([unit, rows]) => (
          <div key={unit}>
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">
              {unit} ({rows.length})
            </p>
            <ul className="space-y-1.5">
              {rows.map((row) => (
                <li key={row.topic.id}>
                  <button
                    type="button"
                    onClick={() => setOpenTopicId(row.topic.id)}
                    className="w-full text-left p-2.5 rounded-xl bg-slate-900/70 border border-slate-800 hover:border-indigo-500/40 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-100 flex-1 min-w-0 break-words">
                        {row.topic.title}
                        {row.topic.specRef && (
                          <span className="text-slate-500"> · {row.topic.specRef}</span>
                        )}
                      </span>
                      <span className="text-[10px] text-slate-500 flex-shrink-0">
                        {row.topic.confidenceRating}/5
                      </span>
                      <ChevronRight className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
                    </div>
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      {counts(row)}
                      {row.lastDate && ` · last ${formatShortDate(row.lastDate)}`}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))
      )}
    </div>
  );
};

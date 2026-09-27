import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db';
import { CheckInOccurrence } from '../../types';
import { DayOccurrence } from '../../services/dayPlan';
import {
  suggestLessonTopic,
  tagOccurrenceToTopic,
} from '../../services/checkInOccurrenceService';
import { addSyllabusTopic } from '../../services/topicService';
import { BookMarked, Check, X } from 'lucide-react';

/**
 * Which topic an answered lesson covered, asked on the lesson row itself.
 *
 * Tagging used to be possible only afterwards, in the Library, and so it was
 * never done: every lesson answered in September arrived there untagged, and a
 * topic's page could not say when it had been taught. The row is the one moment
 * the answer is known without effort, so the question lives here - and the
 * likely answer, the topic the last lesson in this subject covered, is a single
 * tap.
 *
 * Optional throughout. Nothing here blocks the answer it sits under, and a
 * missed lesson is never asked, because it covered nothing.
 *
 * Renders inside the check-in `<form>`, so every button declares its type - see
 * `checklistButtons.test.ts`, which reads this file.
 */

interface LessonTopicProps {
  date: string;
  occurrence: DayOccurrence;
  existing: CheckInOccurrence;
}

const NEW_TOPIC = '__new__';

export const LessonTopic: React.FC<LessonTopicProps> = ({ date, occurrence, existing }) => {
  const subjectId = occurrence.subjectId!;
  const [picking, setPicking] = useState(false);
  const [choice, setChoice] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [busy, setBusy] = useState(false);

  const topics = useLiveQuery(
    async () =>
      (await db.syllabusTopics.where('subjectId').equals(subjectId).toArray()).sort(
        (a, b) => a.unit.localeCompare(b.unit) || a.title.localeCompare(b.title)
      ),
    [subjectId],
    []
  );

  const suggestedId = useLiveQuery(
    () =>
      existing.topicId ? Promise.resolve(undefined) : suggestLessonTopic(subjectId, date, existing.id),
    [subjectId, date, existing.id, existing.topicId]
  );

  const tagged = topics.find((t) => t.id === existing.topicId);
  const suggested = topics.find((t) => t.id === suggestedId);

  const tag = async (topicId: string | undefined) => {
    setBusy(true);
    try {
      await tagOccurrenceToTopic(existing.id, topicId);
      setPicking(false);
      setChoice('');
      setNewTitle('');
    } finally {
      setBusy(false);
    }
  };

  const addAndTag = async () => {
    if (!newTitle.trim()) return;
    setBusy(true);
    try {
      const topic = await addSyllabusTopic({ subjectId, title: newTitle, dateTaught: date });
      await tagOccurrenceToTopic(existing.id, topic.id);
      setPicking(false);
      setChoice('');
      setNewTitle('');
    } finally {
      setBusy(false);
    }
  };

  const chip =
    'inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-semibold transition-all disabled:opacity-50';

  if (picking) {
    return (
      <div className="mt-1.5 space-y-1.5">
        <div className="flex items-center gap-1">
          <select
            value={choice}
            onChange={(e) => {
              setChoice(e.target.value);
              if (e.target.value && e.target.value !== NEW_TOPIC) void tag(e.target.value);
            }}
            aria-label={`Topic covered in ${occurrence.label}`}
            className="flex-1 min-w-0 bg-slate-950 border border-indigo-500/40 rounded-lg px-2 py-1 text-[10px] text-white"
          >
            <option value="">Which topic?</option>
            {topics.map((t) => (
              <option key={t.id} value={t.id}>
                {t.unit} · {t.title}
              </option>
            ))}
            <option value={NEW_TOPIC}>+ A topic not on the list…</option>
          </select>
          <button
            type="button"
            onClick={() => {
              setPicking(false);
              setChoice('');
            }}
            aria-label="Cancel choosing a topic"
            className="p-1 rounded-lg bg-slate-800 text-slate-400 hover:bg-slate-700"
          >
            <X className="w-3 h-3" />
          </button>
        </div>

        {choice === NEW_TOPIC && (
          <div className="flex items-center gap-1">
            <input
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              onKeyDown={(e) => {
                // Enter inside the check-in form would submit the whole check-in.
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void addAndTag();
                }
              }}
              placeholder="What was the lesson on?"
              className="flex-1 min-w-0 px-2 py-1 rounded-lg bg-slate-950 border border-slate-700 text-[10px] text-white placeholder-slate-500"
            />
            <button
              type="button"
              disabled={busy || !newTitle.trim()}
              onClick={() => void addAndTag()}
              className={`${chip} bg-indigo-600 text-white hover:bg-indigo-500`}
            >
              Add
            </button>
          </div>
        )}
      </div>
    );
  }

  if (tagged) {
    return (
      <div className="mt-1.5 flex items-center gap-1 min-w-0">
        <BookMarked className="w-3 h-3 text-indigo-300 flex-shrink-0" />
        <span className="text-[10px] text-indigo-200 truncate">{tagged.title}</span>
        <button
          type="button"
          onClick={() => setPicking(true)}
          className="text-[10px] text-slate-500 hover:text-slate-300 underline flex-shrink-0"
        >
          change
        </button>
      </div>
    );
  }

  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-1">
      {suggested ? (
        <>
          <span className="text-[10px] text-slate-400">Covered</span>
          <button
            type="button"
            disabled={busy}
            onClick={() => void tag(suggested.id)}
            title="Same topic as the last lesson - tap to confirm"
            className={`${chip} bg-indigo-950/60 border border-indigo-500/50 text-indigo-100 hover:bg-indigo-900/60 max-w-[14rem]`}
          >
            <Check className="w-3 h-3 flex-shrink-0" />
            <span className="truncate">{suggested.title}</span>
          </button>
          <button
            type="button"
            onClick={() => setPicking(true)}
            className={`${chip} bg-slate-800 text-slate-400 hover:bg-slate-700`}
          >
            Something else
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={() => setPicking(true)}
          className={`${chip} bg-slate-800 text-slate-300 hover:bg-slate-700`}
        >
          <BookMarked className="w-3 h-3" />
          Which topic?
        </button>
      )}
    </div>
  );
};

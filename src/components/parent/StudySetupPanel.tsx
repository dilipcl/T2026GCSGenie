import React, { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db';
import { HalfTerm, StudyResource, SubjectId, SyllabusTopic } from '../../types';
import {
  resetSubjectResources,
  resourceId,
  saveSubjectResources,
  defaultResourcesFor,
} from '../../services/studyResources';
import {
  HALF_TERMS,
  addPlannedTopics,
  currentHalfTerm,
  halfTermLabel,
  removePlannedTopic,
  topicLines,
} from '../../services/schoolPlan';
import { subjectTopics } from '../../services/topicTimeline';
import { useFeedback } from '../shared/FeedbackProvider';
import { Plus, RotateCcw, Archive, ArchiveRestore } from 'lucide-react';

/**
 * A parent sets up, per subject, what Tejas works from and what the school
 * plans to teach - the two things the topic log and Progress read against.
 *
 * Both are one-off setup with an occasional change, which is why they are
 * here rather than on Tejas's screens: he ticks resources and tags lessons,
 * and never has to decide what the list of resources is.
 */

const PLAN_STATE_LABEL = {
  TAUGHT: 'taught',
  DUE_NOW: 'this half-term',
  BEHIND: 'not yet taught',
  LATER: 'later',
} as const;

type YearGroup = NonNullable<SyllabusTopic['yearGroup']>;

export const StudySetupPanel: React.FC = () => {
  const subjects = useLiveQuery(
    () => db.subjects.toArray().then((all) => all.filter((s) => defaultResourcesFor(s.id).length || s.resources?.length)),
    []
  );
  const [subjectId, setSubjectId] = useState<SubjectId | undefined>(undefined);

  useEffect(() => {
    if (!subjectId && subjects?.length) setSubjectId(subjects[0].id);
  }, [subjects, subjectId]);

  if (!subjects) return <p className="text-[11px] text-slate-500">Reading the subjects…</p>;
  const subject = subjects.find((s) => s.id === subjectId);

  return (
    <div className="space-y-4">
      <div role="group" aria-label="Subject to set up" className="flex flex-wrap gap-1.5">
        {subjects.map((s) => (
          <button
            key={s.id}
            type="button"
            aria-pressed={s.id === subjectId}
            onClick={() => setSubjectId(s.id)}
            className={`px-2.5 py-1 rounded-full border text-[10px] font-bold ${
              s.id === subjectId
                ? 'bg-indigo-600 border-indigo-400 text-white'
                : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
            }`}
          >
            {s.shortName}
          </button>
        ))}
      </div>

      {subject && (
        <>
          <ResourceEditor
            key={`res-${subject.id}`}
            subjectId={subject.id}
            subjectName={subject.name}
            resources={subject.resources}
          />
          <SchoolPlanEditor key={`plan-${subject.id}`} subjectId={subject.id} subjectName={subject.name} />
        </>
      )}
    </div>
  );
};

/* -------------------------------------------------------------------------- */

const ResourceEditor: React.FC<{
  subjectId: SubjectId;
  subjectName: string;
  resources?: StudyResource[];
}> = ({ subjectId, subjectName, resources }) => {
  const { toast } = useFeedback();
  const isDefault = resources === undefined;
  const initial = useMemo(
    () => resources ?? defaultResourcesFor(subjectId),
    [resources, subjectId]
  );
  const [list, setList] = useState<StudyResource[]>(initial);
  const [saving, setSaving] = useState(false);
  useEffect(() => setList(initial), [initial]);

  const dirty = JSON.stringify(list) !== JSON.stringify(initial);
  const edit = (id: string, patch: Partial<StudyResource>) =>
    setList((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  return (
    <section aria-labelledby={`res-title-${subjectId}`} className="space-y-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h4 id={`res-title-${subjectId}`} className="text-xs font-bold text-white">
          What he works from in {subjectName}
        </h4>
        <span className="text-[10px] text-slate-500">
          {isDefault ? 'Using the defaults' : 'Your own list'}
        </span>
      </div>
      <p className="text-[10px] text-slate-400 leading-snug">
        Each is ticked per topic in the Library. Match words tick it automatically when finished
        homework on the topic names them - "sparx" for Sparx homework.
      </p>

      <ul className="space-y-1.5">
        {list.map((r) => (
          <li
            key={r.id}
            className={`grid grid-cols-1 sm:grid-cols-[1fr_9rem_1fr_auto] gap-1.5 p-2 rounded-xl border ${
              r.archived ? 'border-slate-800 opacity-60' : 'border-slate-700 bg-slate-900/60'
            }`}
          >
            <input
              aria-label="Resource name"
              value={r.name}
              onChange={(e) => edit(r.id, { name: e.target.value })}
              className="bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-[11px] text-white"
            />
            <select
              aria-label={`${r.name}: which topics`}
              value={r.appliesTo}
              onChange={(e) => edit(r.id, { appliesTo: e.target.value as StudyResource['appliesTo'] })}
              className="bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-[11px] text-white"
            >
              <option value="ALL">Every topic</option>
              <option value="PRACTICALS">Practicals only</option>
            </select>
            <input
              aria-label={`${r.name}: match words`}
              value={r.matches ?? ''}
              placeholder="match words, comma separated"
              onChange={(e) => edit(r.id, { matches: e.target.value })}
              className="bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-[11px] text-white placeholder-slate-600"
            />
            <button
              type="button"
              onClick={() => edit(r.id, { archived: !r.archived })}
              aria-label={r.archived ? `Bring back ${r.name}` : `Stop using ${r.name}`}
              title={r.archived ? 'Bring back' : 'Stop using - its ticks are kept'}
              className="justify-self-start px-2 py-1 rounded-lg bg-slate-800 border border-slate-700 text-slate-300"
            >
              {r.archived ? <ArchiveRestore className="w-3.5 h-3.5" /> : <Archive className="w-3.5 h-3.5" />}
            </button>
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() =>
            setList((prev) => [
              ...prev,
              { id: resourceId('New resource', prev.map((r) => r.id)), name: 'New resource', appliesTo: 'ALL' },
            ])
          }
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-[10px] font-bold text-indigo-200"
        >
          <Plus className="w-3 h-3" /> Add a resource
        </button>
        <button
          type="button"
          disabled={!dirty || saving}
          onClick={async () => {
            setSaving(true);
            try {
              await saveSubjectResources(subjectId, list);
              toast.success('Saved', `${subjectName}: ${list.filter((r) => !r.archived).length} in use`);
            } finally {
              setSaving(false);
            }
          }}
          className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-[10px] font-bold text-white"
        >
          Save
        </button>
        {!isDefault && (
          <button
            type="button"
            onClick={async () => {
              await resetSubjectResources(subjectId);
              toast.success('Back to the defaults', 'Ticks already made are kept');
            }}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-bold text-slate-400 hover:text-slate-200"
          >
            <RotateCcw className="w-3 h-3" /> Use the defaults
          </button>
        )}
      </div>
    </section>
  );
};

/* -------------------------------------------------------------------------- */

const SchoolPlanEditor: React.FC<{ subjectId: SubjectId; subjectName: string }> = ({
  subjectId,
  subjectName,
}) => {
  const { toast, confirm } = useFeedback();
  const [term, setTerm] = useState<HalfTerm>(currentHalfTerm());
  const [year, setYear] = useState<YearGroup>('YEAR_10');
  const [unit, setUnit] = useState('');
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);

  /**
   * Read through the topic summaries, so "taught" here is the same rule as in
   * the topic log and on Progress - a teaching date or a tagged lesson.
   */
  const data = useLiveQuery(
    async () =>
      (await subjectTopics(subjectId)).topics
        .filter((row) => row.plan)
        .map((row) => ({ topic: row.topic, state: row.plan! })),
    [subjectId]
  );

  const lines = topicLines(text);

  return (
    <section aria-labelledby={`plan-title-${subjectId}`} className="space-y-2 pt-3 border-t border-slate-800">
      <h4 id={`plan-title-${subjectId}`} className="text-xs font-bold text-white">
        School plan for {subjectName}
      </h4>
      <p className="text-[10px] text-slate-400 leading-snug">
        Paste the topics the school will teach in a half-term, one per line, from the scheme of
        work. Each waits in the topic list and counts as taught once a lesson is tagged to it.
        Topics already logged are matched, not added twice.
      </p>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        <label className="text-[10px] text-slate-400">
          Half-term
          <select
            value={term}
            onChange={(e) => setTerm(e.target.value as HalfTerm)}
            className="mt-0.5 w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-[11px] text-white"
          >
            {HALF_TERMS.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-[10px] text-slate-400">
          Year
          <select
            value={year}
            onChange={(e) => setYear(e.target.value as YearGroup)}
            className="mt-0.5 w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-[11px] text-white"
          >
            <option value="YEAR_10">Year 10</option>
            <option value="YEAR_11">Year 11</option>
          </select>
        </label>
        <label className="text-[10px] text-slate-400 col-span-2 sm:col-span-1">
          Unit (optional)
          <input
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
            placeholder={halfTermLabel(term)}
            className="mt-0.5 w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-[11px] text-white placeholder-slate-600"
          />
        </label>
      </div>
      <label className="block text-[10px] text-slate-400">
        Topics, one per line
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={4}
          placeholder={'Atomic structure\nThe periodic table\nIonic bonding'}
          className="mt-0.5 w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5 text-[11px] text-white placeholder-slate-600"
        />
      </label>
      <button
        type="button"
        disabled={lines.length === 0 || saving}
        onClick={async () => {
          setSaving(true);
          try {
            const result = await addPlannedTopics({ subjectId, term, yearGroup: year, unit, text });
            toast.success(
              `${halfTermLabel(term)} plan added`,
              `${result.added} new${result.matched ? `, ${result.matched} already logged` : ''}`
            );
            setText('');
          } finally {
            setSaving(false);
          }
        }}
        className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-[10px] font-bold text-white"
      >
        Add {lines.length || ''} to {halfTermLabel(term)}
      </button>

      {data && data.length > 0 && (
        <div className="space-y-2 pt-1">
          {HALF_TERMS.filter((t) => data.some((d) => d.topic.plannedTerm === t.id)).map((t) => (
            <div key={t.id}>
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                {t.label}
              </p>
              <ul className="mt-1 space-y-1">
                {data
                  .filter((d) => d.topic.plannedTerm === t.id)
                  .map(({ topic, state }) => (
                    <li key={topic.id} className="flex items-center gap-2 text-[11px]">
                      <span className="flex-1 min-w-0 text-slate-200 break-words">{topic.title}</span>
                      <span
                        className={`flex-shrink-0 text-[10px] ${
                          state === 'TAUGHT'
                            ? 'text-emerald-300'
                            : state === 'BEHIND'
                              ? 'text-amber-300'
                              : 'text-slate-500'
                        }`}
                      >
                        {PLAN_STATE_LABEL[state]}
                      </span>
                      <button
                        type="button"
                        aria-label={`Take ${topic.title} off the plan`}
                        onClick={async () => {
                          const ok = await confirm({
                            title: `Take "${topic.title}" off the plan?`,
                            body: 'A topic nothing has been recorded against is removed. One with lessons, work or notes stays in the topic list, just without its half-term.',
                            confirmLabel: 'Take it off',
                          });
                          if (!ok) return;
                          const outcome = await removePlannedTopic(topic.id);
                          toast.success(outcome === 'DELETED' ? 'Removed' : 'Kept, off the plan', topic.title);
                        }}
                        className="flex-shrink-0 px-1.5 text-slate-500 hover:text-slate-200 text-[11px]"
                      >
                        ×
                      </button>
                    </li>
                  ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
};

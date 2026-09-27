import React, { useState } from 'react';
import { SubjectId, SyllabusTopic } from '../../types';
import { addSyllabusTopic } from '../../services/topicService';
import { useFeedback } from '../shared/FeedbackProvider';
import { todayISO } from '../../utils/date';

/**
 * A topic with everything worth knowing about it, entered once.
 *
 * The subject screen's form took a title, a free-text unit defaulting to "Year
 * 10 Unit" and a link, which is how Chemistry ended up with units that differ
 * only in spelling. Here the unit is picked from the ones already in use, with
 * "new unit" as the exception, and the spec reference sits beside the title
 * because it is what past papers and mark schemes call the topic.
 *
 * Only the title is required. Everything else has the default a Year 10 topic
 * already starts from, so a topic can still be added in two taps from the
 * lesson row and filled in properly here later.
 */

const NEW_UNIT = '__new__';

const CONFIDENCE: Array<{ value: SyllabusTopic['confidenceRating']; label: string }> = [
  { value: 1, label: 'Lost' },
  { value: 2, label: 'Shaky' },
  { value: 3, label: 'OK' },
  { value: 4, label: 'Good' },
  { value: 5, label: 'Solid' },
];

interface AddTopicFormProps {
  subjectId: SubjectId;
  units: string[];
  onDone: (topic?: SyllabusTopic) => void;
}

export const AddTopicForm: React.FC<AddTopicFormProps> = ({ subjectId, units, onDone }) => {
  const { toast } = useFeedback();
  const [title, setTitle] = useState('');
  const [unitChoice, setUnitChoice] = useState(units[0] ?? NEW_UNIT);
  const [newUnit, setNewUnit] = useState('');
  const [specRef, setSpecRef] = useState('');
  const [dateTaught, setDateTaught] = useState(todayISO());
  const [yearGroup, setYearGroup] = useState<NonNullable<SyllabusTopic['yearGroup']>>('YEAR_10');
  const [practical, setPractical] = useState(false);
  const [grade9, setGrade9] = useState(true);
  const [confidence, setConfidence] = useState<SyllabusTopic['confidenceRating']>(3);
  const [notesUrl, setNotesUrl] = useState('');
  const [saving, setSaving] = useState(false);

  const unit = unitChoice === NEW_UNIT ? newUnit.trim() : unitChoice;
  const canSave = !!title.trim() && !!unit && !saving;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSave) return;
    setSaving(true);
    try {
      const topic = await addSyllabusTopic({
        subjectId,
        title,
        unit,
        specRef,
        dateTaught: dateTaught || undefined,
        yearGroup,
        isRequiredPractical: practical,
        isImportantForGrade9: grade9,
        confidenceRating: confidence,
        driveNotesUrl: notesUrl,
      });
      toast.success('Topic added', topic.title);
      onDone(topic);
    } finally {
      setSaving(false);
    }
  };

  const field =
    'w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-[11px] text-white placeholder-slate-500';
  const label = 'block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1';

  return (
    <form
      onSubmit={submit}
      className="p-3.5 rounded-2xl bg-slate-900/80 border border-indigo-500/40 space-y-3"
    >
      <p className="text-xs font-bold text-indigo-100">New topic</p>

      <div className="grid sm:grid-cols-[1fr_8rem] gap-2">
        <div>
          <label className={label} htmlFor="topic-title">
            Topic
          </label>
          <input
            id="topic-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Covalent bonding"
            className={field}
            autoFocus
          />
        </div>
        <div>
          <label className={label} htmlFor="topic-spec">
            Spec ref
          </label>
          <input
            id="topic-spec"
            value={specRef}
            onChange={(e) => setSpecRef(e.target.value)}
            placeholder="e.g. 4.2.1"
            className={field}
          />
        </div>
      </div>

      <div>
        <label className={label} htmlFor="topic-unit">
          Unit
        </label>
        <select
          id="topic-unit"
          value={unitChoice}
          onChange={(e) => setUnitChoice(e.target.value)}
          className={field}
        >
          {units.map((u) => (
            <option key={u} value={u}>
              {u}
            </option>
          ))}
          <option value={NEW_UNIT}>+ A new unit…</option>
        </select>
        {unitChoice === NEW_UNIT && (
          <input
            value={newUnit}
            onChange={(e) => setNewUnit(e.target.value)}
            placeholder="Name of the unit, as the teacher calls it"
            className={`${field} mt-1.5`}
          />
        )}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={label} htmlFor="topic-taught">
            Taught on
          </label>
          <input
            id="topic-taught"
            type="date"
            value={dateTaught}
            max={todayISO()}
            onChange={(e) => setDateTaught(e.target.value)}
            className={field}
          />
        </div>
        <div>
          <label className={label} htmlFor="topic-year">
            Year
          </label>
          <select
            id="topic-year"
            value={yearGroup}
            onChange={(e) => setYearGroup(e.target.value as NonNullable<SyllabusTopic['yearGroup']>)}
            className={field}
          >
            <option value="YEAR_9">Year 9</option>
            <option value="YEAR_10">Year 10</option>
            <option value="YEAR_11">Year 11</option>
          </select>
        </div>
      </div>

      <div>
        <p className={label}>How sure are you?</p>
        <div className="flex flex-wrap gap-1">
          {CONFIDENCE.map((c) => (
            <button
              key={c.value}
              type="button"
              onClick={() => setConfidence(c.value)}
              aria-pressed={confidence === c.value}
              className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all ${
                confidence === c.value
                  ? 'bg-indigo-500 text-white'
                  : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1.5">
        <label className="flex items-center gap-1.5 text-[11px] text-slate-300">
          <input
            type="checkbox"
            checked={practical}
            onChange={(e) => setPractical(e.target.checked)}
            className="accent-indigo-500"
          />
          Required practical
        </label>
        <label className="flex items-center gap-1.5 text-[11px] text-slate-300">
          <input
            type="checkbox"
            checked={grade9}
            onChange={(e) => setGrade9(e.target.checked)}
            className="accent-indigo-500"
          />
          Matters for a 9
        </label>
      </div>

      <div>
        <label className={label} htmlFor="topic-notes">
          Notebook link (optional)
        </label>
        <input
          id="topic-notes"
          type="url"
          value={notesUrl}
          onChange={(e) => setNotesUrl(e.target.value)}
          placeholder="NotebookLM, a Google Doc, or a file in the subject folder"
          className={field}
        />
      </div>

      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={!canSave}
          className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-[11px] font-bold"
        >
          Add topic
        </button>
        <button
          type="button"
          onClick={() => onDone()}
          className="px-3 py-2 rounded-xl text-slate-400 hover:text-slate-200 text-[11px]"
        >
          Cancel
        </button>
      </div>
    </form>
  );
};

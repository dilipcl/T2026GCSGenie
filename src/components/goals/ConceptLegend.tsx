import React from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db';
import { BookOpen, ListChecks, Target } from 'lucide-react';

/**
 * What a subject is, what a topic is, and what a goal is.
 *
 * This screen stacks three different things - a grid of subjects, a checklist
 * of topics hidden one tap inside each, and a list of SMART goals with weekly
 * hours - and never said how they relate. Tejas found it genuinely confusing,
 * and the confusion is the screen's fault rather than his: the three are
 * different in kind, they are edited in three different places, and only one of
 * them was ever named on the page.
 *
 * A strip rather than a redesign, deliberately. The grid, the modal and the
 * goal ledger each work well at the job they do; what was missing was the
 * sentence joining them. Reorganising three working sections to make that
 * sentence implicit would be a bigger change with more to go wrong, and it
 * would still be worth saying out loud.
 *
 * Counts come from the database rather than being described in the abstract,
 * because "9 subjects · 24 topics · 4 goals" tells you which of the three you
 * have neglected, and prose never does.
 */

const shape = 'flex-1 min-w-[150px] p-3 bg-slate-900/70 border rounded-xl';

export const ConceptLegend: React.FC = () => {
  const subjects = useLiveQuery(() => db.subjects.count(), [], 0);
  const topics = useLiveQuery(() => db.syllabusTopics.count(), [], 0);
  const goals = useLiveQuery(
    async () => (await db.goals.toArray()).filter((g) => g.status !== 'COMPLETED').length,
    [],
    0
  );

  return (
    <div className="glass-card p-4">
      <h3 className="text-xs font-bold text-white mb-0.5">What goes where</h3>
      <p className="text-[10px] text-slate-400 mb-3">
        Three different things live on this screen. They are edited in three different places.
      </p>

      <div className="flex flex-wrap gap-2">
        <div className={`${shape} border-sky-500/30`}>
          <span className="flex items-center gap-1.5 text-[11px] font-bold text-sky-300">
            <BookOpen className="w-3.5 h-3.5" />
            Subject
            <span className="ml-auto text-slate-400 font-semibold">{subjects}</span>
          </span>
          <p className="text-[10px] text-slate-400 mt-1 leading-snug">
            A course you sit an exam in — Maths, History. One card each in the grid below.
          </p>
        </div>

        <div className={`${shape} border-emerald-500/30`}>
          <span className="flex items-center gap-1.5 text-[11px] font-bold text-emerald-300">
            <ListChecks className="w-3.5 h-3.5" />
            Topic
            <span className="ml-auto text-slate-400 font-semibold">{topics}</span>
          </span>
          <p className="text-[10px] text-slate-400 mt-1 leading-snug">
            A chunk of a subject’s syllabus — “Sine &amp; Cosine Rules”. Tap a subject card to add,
            edit or tick them off.
          </p>
        </div>

        <div className={`${shape} border-indigo-500/30`}>
          <span className="flex items-center gap-1.5 text-[11px] font-bold text-indigo-300">
            <Target className="w-3.5 h-3.5" />
            Goal
            <span className="ml-auto text-slate-400 font-semibold">{goals}</span>
          </span>
          <p className="text-[10px] text-slate-400 mt-1 leading-snug">
            A promise with hours behind it — “4h a week on Maths”. Proposed by you, agreed by a
            parent, listed at the bottom.
          </p>
        </div>
      </div>

      <p className="text-[10px] text-slate-500 mt-2.5 leading-snug">
        Topics say <span className="text-slate-300">what</span> there is to learn. Goals say{' '}
        <span className="text-slate-300">how much time</span> you are putting in. A subject holds
        the topics; a goal can point at the subject, but it is not the same thing.
      </p>
    </div>
  );
};

import React from 'react';
import { TopicSummary, TopicEntry } from '../../services/topicTimeline';
import { setTopicConfidence } from '../../services/topicService';
import { TopicMaterialPanel } from '../goals/TopicMaterialPanel';
import { MaterialLink, materialFromEvidence } from '../shared/MaterialLink';
import { UserRole } from '../../types';
import { formatShortDate } from '../../utils/date';
import {
  ChevronLeft,
  GraduationCap,
  Timer,
  ClipboardList,
  Paperclip,
  Check,
  Minus,
  FlaskConical,
  Star,
} from 'lucide-react';

/**
 * One topic, and everything that has happened to it, newest first.
 *
 * The page the September data could not produce: when it was taught, how many
 * lessons it took, what was done on it since, and what exists to revise from.
 * Each of those lived on a different screen, and "is bonding in hand?" meant
 * visiting all of them and doing the join by memory.
 *
 * Material rows open the thing itself. Every other kind of row is a record of
 * something that happened and has nothing to open.
 */

const KIND: Record<TopicEntry['kind'], { icon: typeof Timer; label: string; tone: string }> = {
  LESSON: { icon: GraduationCap, label: 'Lesson', tone: 'text-sky-300' },
  FOCUS: { icon: Timer, label: 'Study', tone: 'text-teal-300' },
  WORK: { icon: ClipboardList, label: 'Work', tone: 'text-amber-300' },
  MATERIAL: { icon: Paperclip, label: 'Captured', tone: 'text-fuchsia-300' },
};

const CONFIDENCE: Array<{ value: 1 | 2 | 3 | 4 | 5; label: string }> = [
  { value: 1, label: 'Lost' },
  { value: 2, label: 'Shaky' },
  { value: 3, label: 'OK' },
  { value: 4, label: 'Good' },
  { value: 5, label: 'Solid' },
];

const EntryRow: React.FC<{ entry: TopicEntry; onOpen: (materialId: string) => void }> = ({
  entry,
  onOpen,
}) => {
  const kind = KIND[entry.kind];
  const Icon = kind.icon;

  const facts = [
    kind.label,
    entry.outcome === 'PARTIAL' ? 'partly' : undefined,
    entry.minutes ? `${entry.minutes} min` : undefined,
    entry.kind === 'WORK' ? (entry.completed ? 'done' : `due ${formatShortDate(entry.date)}`) : undefined,
  ].filter(Boolean);

  return (
    <li className="p-2.5 rounded-xl bg-slate-900/70 border border-slate-800">
      <div className="flex items-start gap-2">
        <Icon className={`w-3.5 h-3.5 flex-shrink-0 mt-0.5 ${kind.tone}`} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2">
            {entry.material ? (
              <button
                type="button"
                onClick={() => onOpen(entry.material!.id)}
                className="text-xs text-slate-100 text-left hover:text-white break-words"
              >
                {entry.title}
              </button>
            ) : (
              <span className="text-xs text-slate-100 break-words">{entry.title}</span>
            )}
            {entry.kind === 'WORK' && entry.completed && (
              <Check className="w-3 h-3 text-emerald-400" />
            )}
            {entry.outcome === 'PARTIAL' && <Minus className="w-3 h-3 text-amber-400" />}
          </div>
          {entry.detail && (
            <p className="text-[11px] text-slate-300 leading-relaxed mt-0.5 whitespace-pre-wrap">
              {entry.detail}
            </p>
          )}
          <p className="text-[10px] text-slate-500 mt-1">
            {/* A date, not "last Tuesday" - two rows are always being compared here. */}
            {entry.kind !== 'WORK' && `${formatShortDate(entry.date)} · `}
            {facts.join(' · ')}
          </p>
        </div>
        {entry.material?.ref && (
          <MaterialLink size="xs" {...materialFromEvidence(entry.material.ref)} />
        )}
      </div>
    </li>
  );
};

interface TopicPageProps {
  summary: TopicSummary;
  role: UserRole;
  onBack: () => void;
  onOpenMaterial: (materialId: string) => void;
}

export const TopicPage: React.FC<TopicPageProps> = ({ summary, role, onBack, onOpenMaterial }) => {
  const { topic, entries } = summary;

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={onBack}
        className="flex items-center gap-1 text-[11px] font-bold text-indigo-300 hover:text-indigo-200"
      >
        <ChevronLeft className="w-3.5 h-3.5" />
        <span>All topics</span>
      </button>

      <div>
        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
          {topic.unit}
          {topic.specRef && ` · ${topic.specRef}`}
        </p>
        <p className="text-sm font-bold text-white">{topic.title}</p>
        <p className="text-[10px] text-slate-400 mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
          {topic.dateTaught && <span>Taught {formatShortDate(topic.dateTaught)}</span>}
          {topic.isRequiredPractical && (
            <span className="flex items-center gap-0.5 text-cyan-300">
              <FlaskConical className="w-3 h-3" /> Required practical
            </span>
          )}
          {topic.isImportantForGrade9 && (
            <span className="flex items-center gap-0.5 text-amber-300">
              <Star className="w-3 h-3" /> Matters for a 9
            </span>
          )}
          {topic.isCompleted && <span className="text-emerald-300">Finished</span>}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-1">
        <span className="text-[10px] text-slate-400 mr-1">How sure are you?</span>
        {CONFIDENCE.map((c) => (
          <button
            key={c.value}
            type="button"
            onClick={() => void setTopicConfidence(topic.id, c.value, role)}
            aria-pressed={topic.confidenceRating === c.value}
            className={`px-2 py-1 rounded-lg text-[10px] font-bold transition-all ${
              topic.confidenceRating === c.value
                ? 'bg-indigo-500 text-white'
                : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>

      <p className="text-[11px] text-slate-300">
        {summary.lessons} lesson{summary.lessons === 1 ? '' : 's'} ·{' '}
        {summary.studyMinutes} min studied · {summary.work} piece
        {summary.work === 1 ? '' : 's'} of work · {summary.materials} captured
      </p>

      {/* The notebook link and photos, where they have always been edited -
          reused rather than rebuilt, so there is one place that saves them. */}
      <TopicMaterialPanel topic={topic} onChanged={() => undefined} />

      {entries.length === 0 ? (
        <p className="text-xs text-slate-500 py-2">
          Nothing recorded against this topic yet. Tag a lesson to it from the check-in, or pick it
          when you start a focus block.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {entries.map((entry) => (
            <EntryRow key={entry.id} entry={entry} onOpen={onOpenMaterial} />
          ))}
        </ul>
      )}
    </div>
  );
};

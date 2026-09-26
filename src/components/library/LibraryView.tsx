import React, { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { SubjectId, SyllabusTopic, UserRole } from '../../types';
import {
  Material,
  MaterialKind,
  SubjectCoverage,
  groupByUnit,
  library,
  materialMatches,
} from '../../services/materialLibrary';
import { AssessmentLogView } from '../assessments/AssessmentLogView';
import { MaterialDetail } from './MaterialDetail';
import { MaterialLink, materialFromEvidence } from '../shared/MaterialLink';
import { formatShortDate } from '../../utils/date';
import {
  Library as LibraryIcon,
  Search,
  ChevronRight,
  ChevronLeft,
  FileCheck,
  Image as ImageIcon,
  Link as LinkIcon,
  MessageSquare,
  AlertTriangle,
} from 'lucide-react';

/**
 * Everything that has been captured, and where the holes are.
 *
 * This is the screen the app did not have. Proof could be searched for, one
 * question at a time, from a tab whose whole framing was what is *missing* -
 * and a piece of material that nobody had thought to ask about was reachable
 * only by guessing its filename. Meanwhile four substantial pieces of work sat
 * in Drive while the subjects they belonged to showed as empty and red.
 *
 * Three depths, because "what is in here" and "what do we have on bonding" and
 * "let me look at that photo" are three different questions and flattening them
 * produces a screen that answers none of them:
 *
 *  1. A row per subject: how much there is, when it last grew, and how many
 *     finished topics have nothing behind them.
 *  2. One subject, grouped by unit, with untagged material last.
 *  3. The material itself - open it, say what it is, say what it is about.
 *
 * It replaces the Proof Log tab rather than adding a twelfth. Marked papers are
 * one kind of material among five, and they keep their own screen behind a
 * switch at the top, because logging a paper is a different act from browsing
 * what has been logged.
 */

const KIND_ICON: Record<MaterialKind, typeof ImageIcon> = {
  FILE: ImageIcon,
  PAPER: FileCheck,
  LINK: LinkIcon,
  NOTE: MessageSquare,
};

const KIND_LABEL: Record<MaterialKind, string> = {
  FILE: 'Photos',
  PAPER: 'Marked papers',
  LINK: 'Links',
  NOTE: 'Lesson notes',
};

type Pane = 'MATERIAL' | 'PAPERS';

const PaneTab: React.FC<{
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}> = ({ active, onClick, children }) => (
  <button
    type="button"
    onClick={onClick}
    className={`flex-1 px-3 py-2.5 rounded-xl text-xs font-bold transition-colors ${
      active ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'
    }`}
  >
    {children}
  </button>
);

/**
 * What a subject holds, counting only the kinds it actually has.
 *
 * Spelling out every kind produced rows reading "1" at the top and "0 photos ·
 * 0 notes" underneath, because the one thing Physics had was a link. A summary
 * that contradicts the number beside it is worse than no summary.
 */
function breakdown(row: SubjectCoverage): string {
  const parts: string[] = [];
  if (row.files) parts.push(`${row.files} photo${row.files === 1 ? '' : 's'}`);
  if (row.links) parts.push(`${row.links} link${row.links === 1 ? '' : 's'}`);
  if (row.notes) parts.push(`${row.notes} note${row.notes === 1 ? '' : 's'}`);
  return parts.join(' · ');
}

/**
 * One subject's standing. The gap sentence is the reason the row exists: a
 * count on its own reads as reassurance, and "4 items" next to "2 finished
 * topics have nothing attached" does not.
 */
const CoverageRow: React.FC<{
  row: SubjectCoverage;
  onOpen: () => void;
}> = ({ row, onOpen }) => {
  const covered = row.finishedTopics - row.finishedTopicsWithoutMaterial;
  const percent = row.finishedTopics > 0 ? (covered / row.finishedTopics) * 100 : 0;

  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full text-left p-3 rounded-xl bg-slate-900/70 border border-slate-800 hover:border-indigo-500/40 transition-colors"
    >
      <div className="flex items-center gap-2">
        <span className="text-base leading-none">{row.icon}</span>
        <span className="text-xs font-bold text-slate-100 flex-1 min-w-0 truncate">
          {row.name}
        </span>
        <span className="text-[11px] font-bold text-white">{row.materials}</span>
        <ChevronRight className="w-3.5 h-3.5 text-slate-500" />
      </div>

      {row.finishedTopics > 0 && (
        <div className="mt-2 h-1.5 bg-slate-800 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full ${
              row.finishedTopicsWithoutMaterial === 0 ? 'bg-emerald-500' : 'bg-amber-500'
            }`}
            style={{ width: `${percent}%` }}
          />
        </div>
      )}

      <p className="mt-1.5 text-[10px] text-slate-400 leading-snug">
        {row.materials === 0 ? (
          <span className="text-slate-500">Nothing captured yet.</span>
        ) : (
          <>
            {breakdown(row)}
            {/* A date rather than "last week", which is ambiguous on a Sunday. */}
            {row.lastCapturedOn && <> · last {formatShortDate(row.lastCapturedOn)}</>}
          </>
        )}
      </p>

      {row.finishedTopicsWithoutMaterial > 0 && (
        <p className="mt-1 text-[10px] text-amber-300 leading-snug flex items-start gap-1">
          <AlertTriangle className="w-3 h-3 flex-shrink-0 mt-px" />
          <span>
            {row.finishedTopicsWithoutMaterial} finished topic
            {row.finishedTopicsWithoutMaterial === 1 ? ' has' : 's have'} nothing attached —
            covered, but nothing to revise from.
          </span>
        </p>
      )}

      {row.untagged > 0 && (
        <p className="mt-1 text-[10px] text-slate-500 leading-snug">
          {row.untagged} not tagged to a topic yet.
        </p>
      )}
    </button>
  );
};

const MaterialRow: React.FC<{
  item: Material;
  onOpen: () => void;
}> = ({ item, onOpen }) => {
  const Icon = KIND_ICON[item.kind];

  return (
    <li className="p-2.5 rounded-xl bg-slate-900/70 border border-slate-800">
      <div className="flex items-start gap-2">
        <Icon className="w-3.5 h-3.5 text-slate-500 flex-shrink-0 mt-0.5" />

        <div className="min-w-0 flex-1">
          <button
            type="button"
            onClick={onOpen}
            className="text-xs text-slate-100 text-left hover:text-white leading-snug break-words"
          >
            {item.title}
          </button>

          {/* Notes are shown in full. A note worth writing is worth reading, and
              truncating it here would repeat the fault that hid them. */}
          {item.excerpt && (
            <p className="text-[11px] text-slate-300 leading-relaxed mt-0.5 whitespace-pre-wrap">
              {item.excerpt}
            </p>
          )}

          <p className="text-[10px] text-slate-500 mt-1">
            {formatShortDate(item.capturedOn)} · {item.owner.entity.toLowerCase()} ·{' '}
            {item.owner.title}
          </p>
        </div>

        {item.ref && (
          <MaterialLink size="xs" {...materialFromEvidence(item.ref)} />
        )}
      </div>
    </li>
  );
};

export const LibraryView: React.FC<{
  currentRole: UserRole;
  refreshKey?: number;
  onChanged?: () => void;
}> = ({ currentRole, refreshKey, onChanged }) => {
  const [pane, setPane] = useState<Pane>('MATERIAL');
  const [subject, setSubject] = useState<SubjectId | undefined>(undefined);
  const [query, setQuery] = useState('');
  const [kinds, setKinds] = useState<MaterialKind[]>([]);
  const [openId, setOpenId] = useState<string | undefined>(undefined);

  /**
   * Every hook is above the first return, including this one. `refreshKey` is
   * in the dependency list so a paper logged on the other pane shows up here
   * without a tab switch.
   */
  const snapshot = useLiveQuery(() => library(), [refreshKey]);

  const shown = useMemo(() => {
    if (!snapshot) return [];
    return snapshot.materials
      .filter((m) => (subject ? m.subjectId === subject : true))
      .filter((m) => (kinds.length ? kinds.includes(m.kind) : true))
      .filter((m) => materialMatches(m, query));
  }, [snapshot, subject, kinds, query]);

  const groups = useMemo(() => groupByUnit(shown), [shown]);

  const open = snapshot?.materials.find((m) => m.id === openId);
  const topics: SyllabusTopic[] = snapshot?.topics ?? [];

  const toggleKind = (kind: MaterialKind) =>
    setKinds((prev) =>
      prev.includes(kind) ? prev.filter((k) => k !== kind) : [...prev, kind]
    );

  const subjectRow = snapshot?.coverage.find((c) => c.subjectId === subject);
  const totals = snapshot?.materials.length ?? 0;

  return (
    <div className="space-y-4">
      <div className="glass-card p-5 bg-gradient-to-r from-slate-900 via-indigo-950/30 to-slate-900 border-indigo-500/30">
        <div className="flex items-center gap-2 mb-1">
          <span className="p-2 rounded-xl bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
            <LibraryIcon className="w-5 h-5" />
          </span>
          <h2 className="text-xl font-bold text-white">The library</h2>
        </div>
        <p className="text-xs text-slate-300 max-w-2xl">
          Every photo, link, lesson note and marked paper that has ever been recorded — by
          subject, and openable. Tagging something to a topic is what lets Genie build revision
          from it later.
        </p>
      </div>

      <div className="glass-card p-1.5 flex gap-1">
        <PaneTab active={pane === 'MATERIAL'} onClick={() => setPane('MATERIAL')}>
          Everything captured {totals > 0 && <span className="opacity-70">({totals})</span>}
        </PaneTab>
        <PaneTab active={pane === 'PAPERS'} onClick={() => setPane('PAPERS')}>
          Log a marked paper
        </PaneTab>
      </div>

      {pane === 'PAPERS' ? (
        <AssessmentLogView
          currentRole={currentRole}
          refreshKey={refreshKey}
          onChanged={onChanged}
        />
      ) : !snapshot ? (
        <div className="glass-card p-5">
          <p className="text-[11px] text-slate-500">Reading the library…</p>
        </div>
      ) : (
        <>
          <div className="glass-card p-4 space-y-3">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search everything — a subject, a topic, a word from a note"
                className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-8 pr-3 py-2 text-xs text-white placeholder:text-slate-600"
              />
            </div>

            <div className="flex flex-wrap gap-1.5">
              {(Object.keys(KIND_LABEL) as MaterialKind[]).map((kind) => (
                <button
                  key={kind}
                  type="button"
                  onClick={() => toggleKind(kind)}
                  className={`px-2.5 py-1 rounded-full border text-[10px] font-bold transition-colors ${
                    kinds.includes(kind)
                      ? 'bg-indigo-600 border-indigo-400 text-white'
                      : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  {KIND_LABEL[kind]}
                </button>
              ))}
            </div>
          </div>

          {!subject ? (
            <div className="glass-card p-4">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2">
                By subject
              </p>
              <div className="grid sm:grid-cols-2 gap-2">
                {snapshot.coverage.map((row) => (
                  <CoverageRow
                    key={row.subjectId}
                    row={row}
                    onOpen={() => setSubject(row.subjectId)}
                  />
                ))}
              </div>
            </div>
          ) : (
            <div className="glass-card p-4">
              <button
                type="button"
                onClick={() => setSubject(undefined)}
                className="flex items-center gap-1 text-[11px] font-bold text-indigo-300 hover:text-indigo-200 mb-3"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                <span>All subjects</span>
              </button>

              <p className="text-sm font-bold text-white mb-0.5">
                {subjectRow?.icon} {subjectRow?.name}
              </p>
              <p className="text-[10px] text-slate-400 mb-3">
                {shown.length} of {subjectRow?.materials ?? 0} shown
                {subjectRow?.finishedTopicsWithoutMaterial
                  ? ` · ${subjectRow.finishedTopicsWithoutMaterial} finished topic${
                      subjectRow.finishedTopicsWithoutMaterial === 1 ? '' : 's'
                    } with nothing attached`
                  : ''}
              </p>

              {groups.length === 0 ? (
                <p className="text-xs text-slate-500 py-2">
                  {query
                    ? `Nothing matches “${query}”. Every word has to appear, so try fewer.`
                    : 'Nothing captured for this subject yet.'}
                </p>
              ) : (
                <div className="space-y-4">
                  {groups.map((group) => (
                    <div key={group.unit}>
                      <p
                        className={`text-[10px] font-bold uppercase tracking-wider mb-1.5 ${
                          group.untagged ? 'text-amber-300' : 'text-slate-500'
                        }`}
                      >
                        {group.unit} ({group.items.length})
                      </p>

                      {group.untagged && (
                        <p className="text-[10px] text-slate-400 mb-1.5 leading-snug">
                          Open one and say which topic it belongs to — that is what lets Genie
                          build revision and mock questions from it later.
                        </p>
                      )}

                      <ul className="space-y-1.5">
                        {group.items.map((item) => (
                          <MaterialRow
                            key={item.id}
                            item={item}
                            onOpen={() => setOpenId(item.id)}
                          />
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {open && (
        <MaterialDetail
          material={open}
          topics={topics}
          role={currentRole}
          onClose={() => setOpenId(undefined)}
          onChanged={onChanged}
        />
      )}
    </div>
  );
};

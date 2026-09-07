import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db';
import { UserRole, WeekType } from '../../types';
import { occasionsOn, CommitmentOccasion, REASON_LABEL } from '../../services/commitmentService';
import { CommitmentExceptionModal } from '../commitments/CommitmentExceptionModal';
import { DayOccurrence, dayShape } from '../../services/dayPlan';
import { dayProgress } from '../../services/checkInOccurrenceService';
import { OccurrenceAnswer } from './OccurrenceAnswer';
import { todayISO } from '../../utils/date';
import { Clock, Calendar, MapPin, ChevronRight, CalendarOff, Sparkles } from 'lucide-react';

/**
 * Today, and whether it happened - in one list.
 *
 * These used to be two separate things. This card listed the day's lessons and
 * could do nothing with them; the per-lesson check-in existed but lived inside
 * the daily check-in modal, so answering "did Maths happen?" meant opening a
 * modal and scrolling to find the row for something already on screen behind
 * it. Tejas asked for a check-in against each subject on the home screen, which
 * turned out to be a request to join up two halves that were already built.
 *
 * The list now comes from `dayShape`, the same source the modal uses - and
 * whose own comment already claimed it was "the list Tejas is looking at on the
 * schedule card". Answering here writes the same rows the modal writes, because
 * there is one store of answers and never a copy: an answer given on this card
 * is already in the check-in, the week's evidence score and the XP total by the
 * time the tap finishes.
 *
 * It is a superset of what this card showed before - lessons, plus commitments,
 * study blocks and work promised for today - which is the point. A day is not
 * only its timetable.
 */

const KIND_LABEL: Record<DayOccurrence['kind'], string> = {
  LESSON: 'Lesson',
  COMMITMENT: 'Activity',
  STUDY: 'Study',
  WORK: 'Committed work',
};

interface TodayScheduleCardProps {
  activeWeek: WeekType;
  currentRole?: UserRole;
  onNavigateToTimetable: () => void;
}

export const TodayScheduleCard: React.FC<TodayScheduleCardProps> = ({
  activeWeek,
  currentRole = 'STUDENT',
  onNavigateToTimetable,
}) => {
  const [exceptionFor, setExceptionFor] = useState<CommitmentOccasion | null>(null);
  const date = todayISO();

  const shape = useLiveQuery(() => dayShape(date, activeWeek), [date, activeWeek]);
  /**
   * The answers, and the day's running total. Dexie re-runs this whenever a row
   * is written, so tapping an outcome moves the counter and the row together
   * with nothing kept in step by hand.
   */
  const progress = useLiveQuery(() => dayProgress(date, activeWeek), [date, activeWeek]);

  /**
   * Room and slot name, which live on the timetable row rather than on the
   * occurrence. Keyed by entry id, recovered from the occurrence key, so the
   * detail this card has always shown survives the move to `dayShape`.
   */
  const entriesById = useLiveQuery(
    async () => new Map((await db.timetableEntries.toArray()).map((e) => [e.id, e] as const)),
    [],
    new Map()
  );

  /**
   * Commitment occasions, so a parade night that is not happening can still be
   * excused from the row itself - which deducts its hours from the week's load.
   * That is a different act from "it did not happen": excusing changes what the
   * week was ever expected to hold.
   */
  const occasionsByCommitment = useLiveQuery(
    async () => {
      const occasions = await occasionsOn(date, activeWeek);
      return new Map(occasions.map((o) => [o.commitment.id, o] as const));
    },
    [date, activeWeek],
    new Map<string, CommitmentOccasion>()
  );

  const answers = new Map((progress?.answered ?? []).map((row) => [row.occurrenceKey, row]));
  const occurrences = shape?.occurrences ?? [];

  return (
    <>
      <div className="glass-card p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/20 text-indigo-400 flex items-center justify-center">
              <Clock className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-white">Today, and how it went</h3>
              <p className="text-[11px] text-slate-400">
                Tap each one as you go — it is the same check-in, just here
              </p>
            </div>
          </div>

          <button
            onClick={onNavigateToTimetable}
            className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1 font-medium"
          >
            <span>Full Timetable</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* The reason to finish the list, rather than any single row. */}
        {progress && occurrences.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <p className="text-[11px] font-bold text-cyan-100">
              {occurrences.length - progress.pending.length} of {occurrences.length} answered
            </p>
            <p className="text-[11px] text-slate-300 flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-fuchsia-300" />
              <span className="font-bold text-fuchsia-200">{progress.xpEarned}</span>
              <span className="text-slate-500">of a possible {progress.xpAvailable} XP</span>
            </p>
          </div>
        )}

        {occurrences.length === 0 ? (
          <div className="p-4 bg-slate-900/60 rounded-xl border border-slate-800 text-center">
            <Calendar className="w-6 h-6 text-slate-500 mx-auto mb-1.5" />
            <p className="text-xs text-slate-300 font-medium">Nothing timetabled today</p>
            <p className="text-[11px] text-slate-400">
              No check-in needed — enjoy the weekend or the co-curricular blocks.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {occurrences.map((occurrence) => {
              const existing = answers.get(occurrence.key);
              const entryId = occurrence.key.startsWith('lesson__')
                ? occurrence.key.slice('lesson__'.length)
                : undefined;
              const entry = entryId ? entriesById.get(entryId) : undefined;
              const occasion = occurrence.commitmentId
                ? occasionsByCommitment.get(occurrence.commitmentId)
                : undefined;
              const excused = occasion?.exception && occasion.exception.status !== 'ATTENDED';

              return (
                <div
                  key={occurrence.key}
                  className={`p-3 rounded-xl border transition-all ${
                    excused
                      ? 'bg-slate-900/50 border-slate-800'
                      : existing
                      ? 'bg-slate-900/60 border-slate-700'
                      : 'bg-cyan-950/25 border-cyan-500/40'
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-3 min-w-0">
                      {occurrence.startTime && (
                        <span className="text-xs font-mono font-semibold text-slate-400 bg-slate-800/80 px-2 py-1 rounded flex-shrink-0">
                          {occurrence.startTime}
                        </span>
                      )}
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span
                            className={`text-xs font-bold ${
                              excused ? 'text-slate-400 line-through' : 'text-white'
                            }`}
                          >
                            {occurrence.label}
                          </span>
                          {entry?.isHardLocked && !excused && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30 font-semibold uppercase">
                              Fixed
                            </span>
                          )}
                          {occasion?.exception && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30 font-semibold uppercase">
                              {occasion.exception.status === 'ATTENDED' ? 'Attended' : 'Excused'}
                            </span>
                          )}
                        </div>
                        <span className="text-[11px] text-slate-400">
                          {KIND_LABEL[occurrence.kind]}
                          {entry?.slotName ? ` · ${entry.slotName}` : ''}
                          {entry?.room ? ` · ${entry.room}` : ''}
                          {existing?.reasonCategory
                            ? ` · ${REASON_LABEL[existing.reasonCategory]}`
                            : ''}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-start gap-1.5 flex-shrink-0">
                      {entry?.room && !occasion && (
                        <div className="hidden sm:flex items-center gap-1 text-[11px] text-slate-400 bg-slate-800 px-2 py-0.5 rounded self-center">
                          <MapPin className="w-3 h-3 text-slate-500" />
                          <span>{entry.room}</span>
                        </div>
                      )}

                      {/* Only rows that are part of a costed commitment get
                          this - excusing a maths lesson would deduct hours from
                          a school day that still happened. */}
                      {occasion && (
                        <button
                          onClick={() => setExceptionFor(occasion)}
                          title={
                            occasion.exception
                              ? 'Change or undo what was logged'
                              : 'Say this is not happening, and take its hours off the week'
                          }
                          className={`flex items-center gap-1 px-2 py-1.5 rounded-lg text-[10px] font-semibold border transition-all self-start ${
                            occasion.exception
                              ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
                              : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
                          }`}
                        >
                          <CalendarOff className="w-3 h-3" />
                          <span className="hidden sm:inline">
                            {occasion.exception ? 'Logged' : 'Not happening'}
                          </span>
                        </button>
                      )}

                      <OccurrenceAnswer
                        date={date}
                        occurrence={occurrence}
                        existing={existing}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <CommitmentExceptionModal
        occasion={exceptionFor}
        onClose={() => setExceptionFor(null)}
        currentRole={currentRole}
      />
    </>
  );
};

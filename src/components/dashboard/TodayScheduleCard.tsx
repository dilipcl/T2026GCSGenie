import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db';
import { TimetableEntry, UserRole, WeekType, DayOfWeek } from '../../types';
import { occasionsOn, CommitmentOccasion } from '../../services/commitmentService';
import { CommitmentExceptionModal } from '../commitments/CommitmentExceptionModal';
import { todayISO } from '../../utils/date';
import { Clock, Calendar, MapPin, ChevronRight, CalendarOff } from 'lucide-react';

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

  const days: DayOfWeek[] = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
  const currentDayOfWeek = days[new Date().getDay()];

  const todayEntries =
    useLiveQuery<TimetableEntry[]>(
      async () => {
        const entries = await db.timetableEntries
          .where('dayOfWeek')
          .equals(currentDayOfWeek)
          .toArray();
        return entries
          .filter((e) => e.weekType === 'BOTH' || e.weekType === activeWeek)
          .sort((a, b) => a.startTime.localeCompare(b.startTime));
      },
      [activeWeek, currentDayOfWeek]
    ) ?? [];

  /**
   * Which of today's rows belong to a commitment, so a missed evening can be
   * logged from the row itself.
   *
   * Keyed by timetable entry id: a commitment can be made of several rows
   * (cadets is Tuesday and Friday) and only the one actually on screen should
   * carry the button.
   */
  const occasionsByEntry = useLiveQuery(
    async () => {
      const occasions = await occasionsOn(todayISO(), activeWeek);
      return new Map(
        occasions.filter((o) => o.entry).map((o) => [o.entry!.id, o] as const)
      );
    },
    [activeWeek],
    new Map<string, CommitmentOccasion>()
  );

  return (
    <>
      <div className="glass-card p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/20 text-indigo-400 flex items-center justify-center">
              <Clock className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-white">Today's Schedule</h3>
              <p className="text-[11px] text-slate-400">
                {currentDayOfWeek} · {activeWeek} Week
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

        {todayEntries.length === 0 ? (
          <div className="p-4 bg-slate-900/60 rounded-xl border border-slate-800 text-center">
            <Calendar className="w-6 h-6 text-slate-500 mx-auto mb-1.5" />
            <p className="text-xs text-slate-300 font-medium">No school classes scheduled today</p>
            <p className="text-[11px] text-slate-400">Enjoy your weekend or co-curricular blocks!</p>
          </div>
        ) : (
          <div className="space-y-2">
            {todayEntries.map((entry) => {
              const occasion = occasionsByEntry.get(entry.id);
              const excused =
                occasion?.exception && occasion.exception.status !== 'ATTENDED';

              return (
                <div
                  key={entry.id}
                  className={`p-3 rounded-xl border flex items-center justify-between gap-2 transition-all ${
                    excused
                      ? 'bg-slate-900/50 border-slate-800 text-slate-500'
                      : entry.isHardLocked
                      ? 'bg-purple-950/30 border-purple-500/40 text-purple-200'
                      : 'bg-slate-900/80 border-slate-800/90 text-slate-200 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-xs font-mono font-semibold text-slate-400 bg-slate-800/80 px-2 py-1 rounded flex-shrink-0">
                      {entry.startTime}
                    </span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className={`text-xs font-bold ${
                            excused ? 'text-slate-400 line-through' : 'text-white'
                          }`}
                        >
                          {entry.activityName}
                        </span>
                        {entry.isHardLocked && !excused && (
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
                      <span className="text-[11px] text-slate-400">{entry.slotName}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {entry.room && !occasion && (
                      <div className="hidden sm:flex items-center gap-1 text-[11px] text-slate-400 bg-slate-800 px-2 py-0.5 rounded">
                        <MapPin className="w-3 h-3 text-slate-500" />
                        <span>{entry.room}</span>
                      </div>
                    )}

                    {/* EXC-2. Only rows that are part of a costed commitment
                        get this - excusing a maths lesson would deduct hours
                        from a school day that still happened. */}
                    {occasion && (
                      <button
                        onClick={() => setExceptionFor(occasion)}
                        title={
                          occasion.exception
                            ? 'Change or undo what was logged'
                            : 'Say this is not happening'
                        }
                        className={`flex items-center gap-1 px-2 py-1.5 rounded-lg text-[10px] font-semibold border transition-all ${
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

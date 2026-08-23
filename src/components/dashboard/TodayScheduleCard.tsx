import React, { useState, useEffect } from 'react';
import { db } from '../../db';
import { TimetableEntry, WeekType, DayOfWeek } from '../../types';
import { Clock, Calendar, MapPin, ChevronRight } from 'lucide-react';

interface TodayScheduleCardProps {
  activeWeek: WeekType;
  onNavigateToTimetable: () => void;
}

export const TodayScheduleCard: React.FC<TodayScheduleCardProps> = ({
  activeWeek,
  onNavigateToTimetable,
}) => {
  const [todayEntries, setTodayEntries] = useState<TimetableEntry[]>([]);

  const days: DayOfWeek[] = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
  const currentDayOfWeek = days[new Date().getDay()];

  useEffect(() => {
    const loadSchedule = async () => {
      const entries = await db.timetableEntries
        .where('dayOfWeek')
        .equals(currentDayOfWeek)
        .toArray();

      const filtered = entries.filter(
        (e) => e.weekType === 'BOTH' || e.weekType === activeWeek
      );

      // Sort by start time
      filtered.sort((a, b) => a.startTime.localeCompare(b.startTime));
      setTodayEntries(filtered);
    };

    loadSchedule();
  }, [activeWeek, currentDayOfWeek]);

  return (
    <div className="glass-card p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-indigo-500/20 text-indigo-400 flex items-center justify-center">
            <Clock className="w-4 h-4" />
          </div>
          <div>
            <h3 className="font-bold text-sm text-white">Today's Schedule</h3>
            <p className="text-[11px] text-slate-400">
              {currentDayOfWeek} · {activeWeek} Week · Guildford County School
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
          {todayEntries.map((entry) => (
            <div
              key={entry.id}
              className={`p-3 rounded-xl border flex items-center justify-between transition-all ${
                entry.isHardLocked
                  ? 'bg-purple-950/30 border-purple-500/40 text-purple-200'
                  : 'bg-slate-900/80 border-slate-800/90 text-slate-200 hover:border-slate-700'
              }`}
            >
              <div className="flex items-center gap-3">
                <span className="text-xs font-mono font-semibold text-slate-400 bg-slate-800/80 px-2 py-1 rounded">
                  {entry.startTime}
                </span>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-white">{entry.activityName}</span>
                    {entry.isHardLocked && (
                      <span className="text-[9px] px-1.5 py-0.2 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30 font-semibold uppercase">
                        Fixed
                      </span>
                    )}
                  </div>
                  <span className="text-[11px] text-slate-400">{entry.slotName}</span>
                </div>
              </div>

              {entry.room && (
                <div className="flex items-center gap-1 text-[11px] text-slate-400 bg-slate-800 px-2 py-0.5 rounded">
                  <MapPin className="w-3 h-3 text-slate-500" />
                  <span>{entry.room}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

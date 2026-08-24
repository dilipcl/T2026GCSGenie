import React, { useState, useEffect } from 'react';
import { db } from '../../db';
import { TimetableEntry, WeekType, DayOfWeek } from '../../types';
import { QuickAddSheet } from '../shared/QuickAddSheet';
import { logAuditEvent } from '../../services/auditService';
import {
  Calendar,
  Clock,
  Plus,
  Trash2,
  Lock,
  MapPin,
} from 'lucide-react';
import { useFeedback } from '../shared/FeedbackProvider';

interface TimetableManagerProps {
  activeWeek: WeekType;
  onToggleWeek: () => void;
}

export const TimetableManager: React.FC<TimetableManagerProps> = ({
  activeWeek,
  onToggleWeek,
}) => {
  const { confirm } = useFeedback();
  const [entries, setEntries] = useState<TimetableEntry[]>([]);
  const [selectedDay, setSelectedDay] = useState<DayOfWeek>('MON');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  const days: { id: DayOfWeek; label: string; fullLabel: string }[] = [
    { id: 'MON', label: 'Mon', fullLabel: 'Monday' },
    { id: 'TUE', label: 'Tue', fullLabel: 'Tuesday' },
    { id: 'WED', label: 'Wed', fullLabel: 'Wednesday' },
    { id: 'THU', label: 'Thu', fullLabel: 'Thursday' },
    { id: 'FRI', label: 'Fri', fullLabel: 'Friday' },
    { id: 'SAT', label: 'Sat', fullLabel: 'Saturday' },
    { id: 'SUN', label: 'Sun', fullLabel: 'Sunday' },
  ];

  const loadEntries = async () => {
    const list = await db.timetableEntries.toArray();
    setEntries(list);
  };

  useEffect(() => {
    loadEntries();
  }, []);

  const filteredEntries = entries
    .filter(
      (e) =>
        e.dayOfWeek === selectedDay &&
        (e.weekType === 'BOTH' || e.weekType === activeWeek)
    )
    .sort((a, b) => a.startTime.localeCompare(b.startTime));

  const handleDeleteEntry = async (entry: TimetableEntry) => {
    const ok = await confirm({
      title: `Remove "${entry.activityName}"?`,
      body: `It will be taken off ${entry.dayOfWeek}. This is recorded in the change history.`,
      confirmLabel: 'Remove',
      tone: 'danger',
    });
    if (!ok) return;

    await db.timetableEntries.delete(entry.id);
    await logAuditEvent({
      user: 'STUDENT',
      action: 'DELETE',
      entity: 'TimetableEntry',
      entityId: entry.id,
      oldValue: `${entry.activityName} (${entry.weekType} ${entry.dayOfWeek} ${entry.startTime}-${entry.endTime})`,
    });
    loadEntries();
  };

  return (
    <div className="space-y-6">
      {/* Header Controls */}
      <div className="glass-card p-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Calendar className="w-5 h-5 text-indigo-400" />
            <h2 className="text-xl font-bold text-white">Timetable</h2>
          </div>
          <p className="text-xs text-slate-400">
            Your GCS week, on the Odd/Even rotation. Cadets, art and drums are fixed blocks.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Week Toggle */}
          <button
            onClick={onToggleWeek}
            className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 hover:border-indigo-500/50 text-xs font-semibold text-white transition-all"
          >
            <span>Current: </span>
            <span className="px-2 py-0.5 rounded bg-indigo-600 text-white uppercase text-[10px]">
              {activeWeek} Week
            </span>
          </button>

          <button
            onClick={() => setIsAddModalOpen(true)}
            className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-lg shadow-indigo-950/50 flex items-center gap-1.5 transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>Add lessons</span>
          </button>
        </div>
      </div>

      {/* Day Selector Pills */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {days.map((d) => (
          <button
            key={d.id}
            onClick={() => setSelectedDay(d.id)}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
              selectedDay === d.id
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-950/50 scale-105'
                : 'bg-slate-900/80 text-slate-400 border border-slate-800 hover:bg-slate-800 hover:text-white'
            }`}
          >
            {d.fullLabel}
          </button>
        ))}
      </div>

      {/* Timetable List for Selected Day */}
      <div className="glass-card p-6">
        <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-800">
          <h3 className="font-bold text-sm text-white flex items-center gap-2">
            <span>{days.find((d) => d.id === selectedDay)?.fullLabel} Schedule</span>
            <span className="text-xs text-indigo-400 font-mono">({activeWeek} Week)</span>
          </h3>
          <span className="text-xs text-slate-400">{filteredEntries.length} Scheduled Blocks</span>
        </div>

        {filteredEntries.length === 0 ? (
          <div className="p-8 bg-slate-900/40 rounded-2xl border border-slate-800 text-center">
            <Clock className="w-8 h-8 text-slate-600 mx-auto mb-2" />
            <p className="text-sm font-semibold text-slate-300">Nothing scheduled for this day yet</p>
            <p className="text-xs text-slate-500 mt-1">
              Tap "Add lessons" - you can pick a period and tick several days at once.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredEntries.map((entry) => (
              <div
                key={entry.id}
                className={`p-4 rounded-xl border flex flex-wrap items-center justify-between gap-3 transition-all ${
                  entry.isHardLocked
                    ? 'bg-purple-950/25 border-purple-500/40 text-purple-200'
                    : 'bg-slate-900/80 border-slate-800 hover:border-slate-700 text-slate-200'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="text-center font-mono bg-slate-800/90 px-3 py-1.5 rounded-lg border border-slate-700/80">
                    <span className="block text-xs font-bold text-white">{entry.startTime}</span>
                    <span className="block text-[10px] text-slate-400">{entry.endTime}</span>
                  </div>

                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="font-bold text-sm text-white">{entry.activityName}</h4>
                      {entry.isHardLocked && (
                        <span className="text-[9px] px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30 font-semibold uppercase flex items-center gap-1">
                          <Lock className="w-2.5 h-2.5" />
                          <span>Fixed Commitment</span>
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-400">{entry.slotName}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  {entry.room && (
                    <span className="text-xs text-slate-400 bg-slate-800 px-2.5 py-1 rounded border border-slate-700 flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5 text-slate-500" />
                      <span>{entry.room}</span>
                    </span>
                  )}

                  {!entry.isHardLocked && (
                    <button
                      onClick={() => handleDeleteEntry(entry)}
                      title="Remove schedule block"
                      className="p-1.5 text-slate-500 hover:text-rose-400 rounded-lg hover:bg-slate-800 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <QuickAddSheet
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onSuccess={loadEntries}
        defaultMode="LESSON"
        defaultWeek={activeWeek}
        defaultDay={selectedDay}
      />
    </div>
  );
};

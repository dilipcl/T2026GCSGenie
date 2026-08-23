import React, { useState } from 'react';
import { db } from '../../db';
import { TimetableEntry, WeekType, DayOfWeek, SubjectId } from '../../types';
import { logAuditEvent } from '../../services/auditService';
import { X, CalendarPlus, Sparkles } from 'lucide-react';
import { INITIAL_SUBJECTS } from '../../db/seedData';

interface AddEventModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  defaultWeek: WeekType;
}

export const AddEventModal: React.FC<AddEventModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  defaultWeek,
}) => {
  const [activityName, setActivityName] = useState('');
  const [subjectId, setSubjectId] = useState<SubjectId | ''>('');
  const [dayOfWeek, setDayOfWeek] = useState<DayOfWeek>('MON');
  const [weekType, setWeekType] = useState<WeekType>(defaultWeek);
  const [startTime, setStartTime] = useState('08:30');
  const [endTime, setEndTime] = useState('09:30');
  const [room, setRoom] = useState('');
  const [slotName, setSlotName] = useState('Period 1');

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activityName.trim()) return;

    const newEntry: TimetableEntry = {
      id: `tt_${Date.now()}`,
      weekType,
      dayOfWeek,
      slotName,
      startTime,
      endTime,
      subjectId: subjectId ? (subjectId as SubjectId) : undefined,
      activityName: activityName.trim(),
      room: room.trim() || undefined,
      isHardLocked: false,
    };

    await db.timetableEntries.add(newEntry);
    await logAuditEvent({
      user: 'STUDENT',
      action: 'INSERT',
      entity: 'TimetableEntry',
      entityId: newEntry.id,
      newValue: `${newEntry.activityName} (${weekType} ${dayOfWeek} ${startTime}-${endTime})`,
    });

    onSuccess();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl max-w-md w-full p-6 shadow-2xl relative max-h-[90vh] overflow-y-auto">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center border border-indigo-500/30">
            <CalendarPlus className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">Add Schedule Block / Reminder</h2>
            <p className="text-xs text-slate-400">Add a custom revision session or timetable period</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
              Activity Name / Lesson
            </label>
            <input
              type="text"
              placeholder="e.g. Maths Trigonometry Practice / Art Project"
              value={activityName}
              onChange={(e) => setActivityName(e.target.value)}
              required
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                Subject (Optional)
              </label>
              <select
                value={subjectId}
                onChange={(e) => setSubjectId(e.target.value as any)}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
              >
                <option value="">None / General</option>
                {INITIAL_SUBJECTS.map((sub) => (
                  <option key={sub.id} value={sub.id}>
                    {sub.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                Week Rotation
              </label>
              <select
                value={weekType}
                onChange={(e) => setWeekType(e.target.value as any)}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
              >
                <option value="ODD">Odd Week Only</option>
                <option value="EVEN">Even Week Only</option>
                <option value="BOTH">Every Week (Both)</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                Day of Week
              </label>
              <select
                value={dayOfWeek}
                onChange={(e) => setDayOfWeek(e.target.value as any)}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
              >
                <option value="MON">Monday</option>
                <option value="TUE">Tuesday</option>
                <option value="WED">Wednesday</option>
                <option value="THU">Thursday</option>
                <option value="FRI">Friday</option>
                <option value="SAT">Saturday</option>
                <option value="SUN">Sunday</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                Period Name
              </label>
              <input
                type="text"
                value={slotName}
                onChange={(e) => setSlotName(e.target.value)}
                placeholder="e.g. Period 1, After-School"
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="block text-[11px] font-semibold text-slate-300 uppercase mb-1">
                Start Time
              </label>
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-2 py-1.5 text-xs text-white"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-300 uppercase mb-1">
                End Time
              </label>
              <input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-2 py-1.5 text-xs text-white"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-300 uppercase mb-1">
                Room (Opt)
              </label>
              <input
                type="text"
                placeholder="e.g. M2"
                value={room}
                onChange={(e) => setRoom(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-2 py-1.5 text-xs text-white"
              />
            </div>
          </div>

          <div className="pt-2">
            <button
              type="submit"
              className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs uppercase tracking-wider shadow-lg shadow-indigo-950/50 flex items-center justify-center gap-2"
            >
              <Sparkles className="w-4 h-4" />
              <span>Save Schedule Block</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

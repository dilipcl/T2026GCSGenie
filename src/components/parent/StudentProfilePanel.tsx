import React, { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db';
import { logFieldChanges } from '../../services/auditService';
import { useFeedback } from '../shared/FeedbackProvider';
import { UserCog, Save } from 'lucide-react';

/**
 * Who the app is for.
 *
 * The name, year group, school and headline target grade were literal strings
 * in the header. Nothing about them was wrong - they were simply unreachable,
 * so moving up a year meant editing source, and the app could only ever belong
 * to one child.
 */
export const StudentProfilePanel: React.FC = () => {
  const { toast } = useFeedback();
  const settings = useLiveQuery(() => db.parentSettings.get('active_settings'), []);

  const [name, setName] = useState('');
  const [yearGroup, setYearGroup] = useState('');
  const [school, setSchool] = useState('');
  const [targetGrade, setTargetGrade] = useState(9);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // Load once. Re-syncing on every settings change would overwrite whatever is
  // being typed the moment any other panel writes to the same row.
  useEffect(() => {
    if (!settings || loaded) return;
    setName(settings.studentName || 'Tejas Dilip');
    setYearGroup(settings.studentYearGroup || 'Year 10');
    setSchool(settings.studentSchool || 'GCS');
    setTargetGrade(settings.studentTargetGrade ?? 9);
    setLoaded(true);
  }, [settings, loaded]);

  const handleSave = async () => {
    if (busy || !settings) return;
    setBusy(true);

    try {
      const fields = {
        studentName: name.trim(),
        studentYearGroup: yearGroup.trim(),
        studentSchool: school.trim(),
        studentTargetGrade: Math.min(9, Math.max(1, Math.round(targetGrade))),
      };

      await db.parentSettings.update('active_settings', fields);
      await logFieldChanges({
        user: 'PARENT',
        entity: 'StudentProfile',
        entityId: 'active_settings',
        before: settings as unknown as Record<string, unknown>,
        after: fields as unknown as Record<string, unknown>,
        labels: {
          studentName: 'student name',
          studentYearGroup: 'year group',
          studentSchool: 'school',
          studentTargetGrade: 'target grade',
        },
      });
      toast.success('Profile saved', `${fields.studentName} · ${fields.studentYearGroup}`);
    } catch (err) {
      console.error('Could not save the student profile:', err);
      toast.error('Could not save that', 'Nothing was changed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="glass-card p-6">
      <div className="flex items-center gap-2 mb-4 pb-3 border-b border-slate-800">
        <UserCog className="w-5 h-5 text-indigo-400" />
        <div>
          <h3 className="font-bold text-sm text-white">Student profile</h3>
          <p className="text-[11px] text-slate-400">
            The name, year and target grade shown at the top of every screen.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label
            htmlFor="profile-name"
            className="block text-[11px] font-semibold text-slate-300 mb-1"
          >
            Name
          </label>
          <input
            id="profile-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-2 text-xs text-white"
          />
        </div>

        <div>
          <label
            htmlFor="profile-year"
            className="block text-[11px] font-semibold text-slate-300 mb-1"
          >
            Year group
          </label>
          <input
            id="profile-year"
            type="text"
            placeholder="Year 10"
            value={yearGroup}
            onChange={(e) => setYearGroup(e.target.value)}
            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-2 text-xs text-white placeholder-slate-500"
          />
        </div>

        <div>
          <label
            htmlFor="profile-school"
            className="block text-[11px] font-semibold text-slate-300 mb-1"
          >
            School
          </label>
          <input
            id="profile-school"
            type="text"
            placeholder="GCS"
            value={school}
            onChange={(e) => setSchool(e.target.value)}
            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-2 text-xs text-white placeholder-slate-500"
          />
        </div>

        <div>
          <label
            htmlFor="profile-target"
            className="block text-[11px] font-semibold text-slate-300 mb-1"
          >
            Headline target grade
          </label>
          <input
            id="profile-target"
            type="number"
            min="1"
            max="9"
            value={targetGrade}
            onChange={(e) => setTargetGrade(Number(e.target.value))}
            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-2 text-xs text-white"
          />
          <p className="text-[10px] text-slate-500 mt-1">
            The badge in the header. Each subject keeps its own target.
          </p>
        </div>
      </div>

      <button
        onClick={handleSave}
        disabled={busy || !name.trim()}
        className="mt-4 w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold text-xs flex items-center justify-center gap-1.5"
      >
        <Save className="w-3.5 h-3.5" />
        <span>{busy ? 'Saving...' : 'Save profile'}</span>
      </button>
    </div>
  );
};

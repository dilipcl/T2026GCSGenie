import React, { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db';
import { logFieldChanges } from '../../services/auditService';
import { useFeedback } from '../shared/FeedbackProvider';
import { UserCog, Save, MessageCircle, Plus, Trash2 } from 'lucide-react';
import { formatE164, isValidE164, normaliseE164 } from '../../services/whatsappService';
import { newId } from '../../utils/id';

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
  const [examDate, setExamDate] = useState('');
  const [numbers, setNumbers] = useState<{ id: string; label: string; e164: string }[]>([]);
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
    setExamDate(settings.examSeriesStartDate || '2027-05-10');
    setNumbers(settings.parentWhatsAppNumbers?.length ? settings.parentWhatsAppNumbers : []);
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
        examSeriesStartDate: examDate || undefined,
        // Normalised on the way in, so a number typed as "07700 900123" opens
        // a chat rather than failing silently at WhatsApp's end.
        parentWhatsAppNumbers: numbers
          .map((n) => ({ ...n, label: n.label.trim(), e164: normaliseE164(n.e164) }))
          .filter((n) => n.e164),
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
          examSeriesStartDate: 'exam start date',
          // The numbers themselves are never written to the log - a change
          // history a second person reads should not carry phone numbers.
          parentWhatsAppNumbers: 'family WhatsApp numbers',
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
            The name, year and target grade shown at the top of every screen, the exam
            countdown, and who a shared update goes to.
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

        <div>
          <label
            htmlFor="profile-exam-date"
            className="block text-[11px] font-semibold text-slate-300 mb-1"
          >
            First exam morning
          </label>
          <input
            id="profile-exam-date"
            type="date"
            value={examDate}
            onChange={(e) => setExamDate(e.target.value)}
            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-2 text-xs text-white"
          />
          <p className="text-[10px] text-slate-500 mt-1">
            Drives the countdown at the top of the Home screen.
          </p>
        </div>
      </div>

      {/* WA-1. Nothing in the WhatsApp feature works without a number, and the
          numbers are family PII - held here, never written to the change
          history and never included in a CSV export. */}
      <div className="mt-5 pt-4 border-t border-slate-800">
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-2">
            <MessageCircle className="w-4 h-4 text-emerald-400" />
            <div>
              <h4 className="text-xs font-bold text-white">Family WhatsApp</h4>
              <p className="text-[10px] text-slate-400">
                Who a shared update goes to. Nothing is ever sent automatically.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() =>
              setNumbers((prev) => [...prev, { id: newId('wa'), label: '', e164: '' }])
            }
            className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-[11px] font-semibold flex items-center gap-1"
          >
            <Plus className="w-3 h-3" />
            <span>Add</span>
          </button>
        </div>

        {numbers.length === 0 ? (
          <p className="text-[11px] text-slate-500">
            None saved. WhatsApp will ask who to send to each time.
          </p>
        ) : (
          <div className="space-y-2">
            {numbers.map((entry, i) => {
              const normalised = normaliseE164(entry.e164);
              const valid = isValidE164(normalised);
              return (
                <div key={entry.id} className="flex flex-wrap items-center gap-2">
                  <input
                    type="text"
                    aria-label="Name"
                    placeholder="Mum"
                    value={entry.label}
                    onChange={(e) =>
                      setNumbers((prev) =>
                        prev.map((n, j) => (j === i ? { ...n, label: e.target.value } : n))
                      )
                    }
                    className="w-24 bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-2 text-xs text-white placeholder-slate-600"
                  />
                  <input
                    type="tel"
                    aria-label="Phone number"
                    placeholder="07700 900123"
                    value={entry.e164}
                    onChange={(e) =>
                      setNumbers((prev) =>
                        prev.map((n, j) => (j === i ? { ...n, e164: e.target.value } : n))
                      )
                    }
                    className={`flex-1 min-w-[9rem] bg-slate-900 border rounded-lg px-2.5 py-2 text-xs text-white placeholder-slate-600 ${
                      entry.e164 && !valid ? 'border-rose-500/60' : 'border-slate-700'
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => setNumbers((prev) => prev.filter((_, j) => j !== i))}
                    aria-label={`Remove ${entry.label || 'this number'}`}
                    className="p-2 text-slate-400 hover:text-rose-300 rounded-lg hover:bg-slate-800"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                  <span className="w-full text-[10px] text-slate-500">
                    {entry.e164
                      ? valid
                        ? `Saved as ${formatE164(normalised)}`
                        : 'That does not look like a phone number yet.'
                      : 'Include the country code, or start with 0 for a UK number.'}
                  </span>
                </div>
              );
            })}
          </div>
        )}
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

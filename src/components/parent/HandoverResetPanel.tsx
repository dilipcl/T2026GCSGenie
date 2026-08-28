import React, { useState } from 'react';
import {
  HandoverPreview,
  previewHandoverReset,
  performHandoverReset,
} from '../../services/handoverService';
import { exportDatabaseToJSON } from '../../services/backupService';
import { useFeedback } from '../shared/FeedbackProvider';
import { RotateCcw, AlertTriangle, Download, ArrowRight } from 'lucide-react';

const TABLE_LABELS: Record<string, string> = {
  checkIns: 'Check-ins',
  redemptions: 'Reward requests',
  sanctions: 'Sanctions',
  assessments: 'Marked work',
  attachments: 'Photos and files',
  choreCompletions: 'Chore ticks',
  agentAuditReports: 'AI audit reports',
  auditLogs: 'Change history',
  tasks: 'Homework',
  milestones: 'Key dates',
  remediations: 'Fix-up quests',
  syllabusTopics: 'Syllabus topics',
};

const CONFIRM_WORD = 'RESET';

/**
 * Clearing the testing out before Tejas gets the app.
 *
 * Three gates, in the order they matter: a preview that names every row that
 * will go, a rescue export that downloads before anything is touched, and a
 * typed word - because this is the one destructive action in the app that a
 * parent will reach for deliberately, and muscle memory is exactly what makes
 * a confirmation dialog stop being read.
 */
export const HandoverResetPanel: React.FC = () => {
  const { toast } = useFeedback();
  const [preview, setPreview] = useState<HandoverPreview | null>(null);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);

  const handlePreview = async () => {
    setBusy(true);
    try {
      setPreview(await previewHandoverReset());
      setTyped('');
    } catch (err) {
      console.error('Could not read the database:', err);
      toast.error('Could not read the database', 'Nothing was changed.');
    } finally {
      setBusy(false);
    }
  };

  const handleReset = async () => {
    if (!preview || typed.trim().toUpperCase() !== CONFIRM_WORD || busy) return;
    setBusy(true);
    try {
      // Rescue export first. If the reset turns out to have been a mistake -
      // or the "testing" data included something real - this is the way back.
      const rescue = await exportDatabaseToJSON({ includeAttachments: true });
      const url = URL.createObjectURL(new Blob([rescue], { type: 'application/json' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `GCSE_Genie_RESCUE_before_handover_${new Date()
        .toISOString()
        .replace(/[:.]/g, '-')}.json`;
      a.click();
      URL.revokeObjectURL(url);

      const result = await performHandoverReset();
      toast.success(
        `Reset — balance is ${result.xpAfter} XP`,
        `${result.deleted} rows of testing cleared, ${result.resetRows} reset. A rescue copy downloaded first.`
      );
      setPreview(null);
      setTyped('');
    } catch (err) {
      console.error('Handover reset failed:', err);
      toast.error('Reset failed', 'The database was not fully changed — check the counts and try again.');
    } finally {
      setBusy(false);
    }
  };

  const rows = (record: Record<string, number>) =>
    Object.entries(record)
      .filter(([, n]) => n > 0)
      .sort((a, b) => b[1] - a[1]);

  return (
    <div className="glass-card p-6 border-amber-500/25">
      <div className="flex items-center gap-2 mb-3 pb-3 border-b border-slate-800">
        <RotateCcw className="w-5 h-5 text-amber-400" />
        <h3 className="font-bold text-sm text-white">Reset for handover</h3>
      </div>

      <p className="text-xs text-slate-300 mb-2">
        Clears everything the testing produced and leaves the set-up alone. The balance goes to
        zero, so the first number Tejas sees is his own.
      </p>
      <p className="text-[11px] text-slate-400 mb-4">
        <strong className="text-slate-200">Kept:</strong> timetable, subjects, syllabus, goals,
        chores, reward catalogue, Drive links and the parent passphrase.
      </p>

      {!preview ? (
        <button
          onClick={handlePreview}
          disabled={busy}
          className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-bold text-xs flex items-center gap-2 disabled:opacity-50"
        >
          <span>See what would be cleared</span>
          <ArrowRight className="w-4 h-4 text-slate-400" />
        </button>
      ) : (
        <div className="space-y-3">
          <div className="p-3 bg-slate-900/80 border border-slate-800 rounded-xl">
            <p className="text-xs font-bold text-white mb-2">
              Balance {preview.currentXP} XP{' '}
              <span className="text-slate-500 font-normal">→</span>{' '}
              <span className="text-emerald-300">0 XP</span>
            </p>

            {rows(preview.cleared).length > 0 && (
              <>
                <p className="text-[10px] uppercase tracking-wider font-bold text-rose-300 mb-1">
                  Deleted ({preview.totalToDelete} rows)
                </p>
                <div className="space-y-0.5 mb-2.5">
                  {rows(preview.cleared).map(([name, n]) => (
                    <p key={name} className="text-[11px] text-slate-300 flex justify-between gap-3">
                      <span>{TABLE_LABELS[name] ?? name}</span>
                      <span className="tabular-nums text-slate-400">{n}</span>
                    </p>
                  ))}
                </div>
              </>
            )}

            {rows(preview.reset).length > 0 && (
              <>
                <p className="text-[10px] uppercase tracking-wider font-bold text-amber-300 mb-1">
                  Kept, marked not-done again
                </p>
                <div className="space-y-0.5">
                  {rows(preview.reset).map(([name, n]) => (
                    <p key={name} className="text-[11px] text-slate-300 flex justify-between gap-3">
                      <span>{TABLE_LABELS[name] ?? name}</span>
                      <span className="tabular-nums text-slate-400">{n}</span>
                    </p>
                  ))}
                </div>
              </>
            )}
          </div>

          {preview.extraGoals.length > 0 && (
            <div className="p-3 bg-amber-950/40 border border-amber-500/40 rounded-xl">
              <p className="text-[11px] text-amber-100 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                <span>
                  <strong className="font-bold">Goals are kept, and these are not seeded ones:</strong>{' '}
                  {preview.extraGoals.map((g) => g.title).join(', ')}. If any of those were made for
                  testing, delete them in Subjects &amp; Goals — a leftover goal skews the workload
                  cap from day one.
                </span>
              </p>
            </div>
          )}

          <p className="text-[11px] text-slate-400 flex items-start gap-1.5">
            <Download className="w-3.5 h-3.5 text-slate-500 flex-shrink-0 mt-0.5" />
            <span>A rescue copy of everything downloads before anything is cleared.</span>
          </p>

          <div className="flex flex-wrap items-center gap-2">
            <input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder={`Type ${CONFIRM_WORD} to confirm`}
              aria-label={`Type ${CONFIRM_WORD} to confirm`}
              className="flex-1 min-w-[10rem] bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-rose-500"
            />
            <button
              onClick={() => { setPreview(null); setTyped(''); }}
              className="px-3.5 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-slate-300 text-[11px] font-bold"
            >
              Cancel
            </button>
            <button
              onClick={handleReset}
              disabled={busy || typed.trim().toUpperCase() !== CONFIRM_WORD}
              className="px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs disabled:opacity-40"
            >
              {busy ? 'Resetting...' : 'Reset now'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

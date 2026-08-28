import React, { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db';
import {
  CommitmentExceptionStatus,
  ExceptionReasonCategory,
  UserRole,
} from '../../types';
import {
  CommitmentOccasion,
  exceptionId,
  logException,
  removeException,
  REASON_ICON,
  REASON_LABEL,
  STATUS_LABEL,
} from '../../services/commitmentService';
import { exceptionMessage, messageContext } from '../../services/whatsappService';
import { WhatsAppShare } from '../shared/WhatsAppShare';
import { useFeedback } from '../shared/FeedbackProvider';
import { useEscapeToClose } from '../../hooks/useEscapeToClose';
import { formatFriendlyDate } from '../../utils/date';
import { X, Undo2 } from 'lucide-react';

interface CommitmentExceptionModalProps {
  occasion: CommitmentOccasion | null;
  onClose: () => void;
  currentRole?: UserRole;
}

const REASONS: ExceptionReasonCategory[] = [
  'FAMILY',
  'ILLNESS',
  'MOCK_PREP',
  'SCHOOL_TRIP',
  'STAND_DOWN',
  'OTHER',
];

const STATUSES: CommitmentExceptionStatus[] = [
  'EXCUSED_ABSENT',
  'POSTPONED',
  'CANCELLED_BY_ORGANISER',
  'ATTENDED',
];

/**
 * Saying that an evening did not happen.
 *
 * Built to take about fifteen seconds: a reason chip, then save. Everything
 * else - the status, the note, telling anyone - is optional and pre-filled,
 * because the alternative to a fast path is that nobody logs the absence at
 * all and the burnout gauge keeps charging the week for a parade night that
 * was cancelled.
 */
export const CommitmentExceptionModal: React.FC<CommitmentExceptionModalProps> = ({
  occasion,
  onClose,
  currentRole = 'STUDENT',
}) => {
  const { toast } = useFeedback();
  const settings = useLiveQuery(() => db.parentSettings.get('active_settings'), []);

  /**
   * Read live rather than taken from the prop.
   *
   * The occasion is captured when the modal opens, so after logging an absence
   * the copy still said "Log it" and the undo never appeared until the modal
   * was closed and reopened - which reads as the save not having worked.
   */
  const existing = useLiveQuery(
    () =>
      occasion
        ? db.commitmentExceptions.get(exceptionId(occasion.commitment.id, occasion.date))
        : undefined,
    [occasion?.commitment.id, occasion?.date]
  );

  const [reason, setReason] = useState<ExceptionReasonCategory>('FAMILY');
  const [status, setStatus] = useState<CommitmentExceptionStatus>('EXCUSED_ABSENT');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  useEscapeToClose(!!occasion, onClose);

  // Loads once per occasion, from whatever was already recorded. Deliberately
  // not keyed on `existing`: re-syncing on every write would overwrite a note
  // as it is being typed.
  useEffect(() => {
    if (!occasion) return;
    const recorded = occasion.exception;
    setReason(recorded?.reasonCategory ?? 'FAMILY');
    setStatus(recorded?.status ?? 'EXCUSED_ABSENT');
    setNotes(recorded?.reasonNotes ?? '');
    setSaved(false);
    setBusy(false);
  }, [occasion]);

  if (!occasion) return null;

  const deducts = status !== 'ATTENDED';

  const shareText = exceptionMessage(messageContext(settings), {
    title: occasion.title,
    date: occasion.date,
    statusLabel: STATUS_LABEL[status],
    reasonLabel: REASON_LABEL[reason],
    notes: notes.trim() || undefined,
    hours: occasion.hours,
    deducts,
  });

  const handleSave = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await logException({
        commitment: occasion.commitment,
        date: occasion.date,
        title: occasion.title,
        scheduledHours: occasion.hours,
        status,
        reasonCategory: reason,
        reasonNotes: notes,
        loggedBy: currentRole === 'PARENT' ? 'PARENT' : 'STUDENT',
      });
      setSaved(true);
      toast.success(
        'Logged',
        deducts
          ? `${occasion.hours}h come off this week's load.`
          : 'Recorded, with no change to the week.'
      );
    } catch (err) {
      console.error('Could not log that exception:', err);
      toast.error('Could not log that', 'Nothing was changed.');
    } finally {
      setBusy(false);
    }
  };

  const handleUndo = async () => {
    if (!existing || busy) return;
    setBusy(true);
    try {
      await removeException(existing, currentRole === 'PARENT' ? 'PARENT' : 'STUDENT');
      toast.success('Put back', `${existing.scheduledHours}h are back in the week.`);
      onClose();
    } catch (err) {
      console.error('Could not remove that exception:', err);
      toast.error('Could not undo that', 'Nothing was changed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Log an exception for ${occasion.title}`}
        className="relative w-full sm:max-w-lg bg-slate-900 border-t sm:border border-slate-700 sm:rounded-2xl rounded-t-3xl shadow-2xl max-h-[90vh] overflow-y-auto pb-nav-safe sm:pb-0"
      >
        <div className="sticky top-0 bg-slate-900/95 backdrop-blur border-b border-slate-800 px-5 py-4 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-white">{occasion.title}</h3>
            <p className="text-[11px] text-slate-400">
              {formatFriendlyDate(occasion.date)} · {occasion.hours}h ·{' '}
              {occasion.commitment.label}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="p-2 -mr-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          <div>
            <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">
              What happened?
            </h4>
            <div className="grid grid-cols-2 gap-2">
              {REASONS.map((r) => (
                <button
                  key={r}
                  onClick={() => setReason(r)}
                  className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-left transition-all ${
                    reason === r
                      ? 'bg-indigo-600 border-indigo-400 text-white'
                      : 'bg-slate-800/70 border-slate-700 text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  <span className="text-base leading-none">{REASON_ICON[r]}</span>
                  <span className="text-[11px] font-semibold leading-tight">{REASON_LABEL[r]}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">
              How it counts
            </h4>
            <div className="flex flex-wrap gap-1.5">
              {STATUSES.map((s) => (
                <button
                  key={s}
                  onClick={() => setStatus(s)}
                  className={`px-3 py-1.5 rounded-lg border text-[11px] font-semibold transition-all ${
                    status === s
                      ? 'bg-slate-100 border-slate-100 text-slate-900'
                      : 'bg-slate-800/70 border-slate-700 text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  {STATUS_LABEL[s]}
                </button>
              ))}
            </div>
            <p
              className={`mt-2 text-[11px] ${deducts ? 'text-emerald-300' : 'text-slate-400'}`}
            >
              {deducts
                ? `${occasion.hours}h come off this week's scheduled load.`
                : 'Recorded for the weekly review, with no change to the week.'}
            </p>
          </div>

          <div>
            <label
              htmlFor="exception-notes"
              className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5"
            >
              Anything to add? <span className="font-normal normal-case">(optional)</span>
            </label>
            <input
              id="exception-notes"
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Dad's birthday dinner"
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-white placeholder-slate-600"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleSave}
              disabled={busy}
              className="flex-1 min-w-[10rem] py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold text-xs transition-all"
            >
              {busy ? 'Saving…' : existing ? 'Update' : 'Log it'}
            </button>

            {existing && (
              <button
                onClick={handleUndo}
                disabled={busy}
                className="flex items-center gap-1.5 px-3.5 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-semibold text-xs disabled:opacity-50"
              >
                <Undo2 className="w-3.5 h-3.5" />
                <span>It happened after all</span>
              </button>
            )}
          </div>

          {/* Telling anyone is a separate, deliberate act - never automatic. */}
          {(saved || existing) && (
            <div className="pt-4 border-t border-slate-800">
              <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">
                Let the family know
              </h4>
              <WhatsAppShare text={shareText} compact />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

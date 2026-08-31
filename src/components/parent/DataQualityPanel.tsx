import React, { useCallback, useEffect, useState } from 'react';
import {
  DataIssue,
  IssueSeverity,
  QualityReport,
  SEVERITY_LABEL,
  autoFix,
  inspectData,
} from '../../services/dataQualityService';
import { useFeedback } from '../shared/FeedbackProvider';
import { Stethoscope, Wand2, CheckCircle2 } from 'lucide-react';

/**
 * What is wrong with the data, and what it costs.
 *
 * Written to be actionable rather than alarming. Each row says the problem, the
 * consequence and the remedy, because a quality report that only lists problems
 * gets read once and never again - the question a parent actually has is "does
 * this matter", and the consequence line is the answer.
 *
 * Auto-fix is deliberately narrow: bucket defaults and title formatting, which
 * cannot be wrong. Estimates, goal links and subject attribution need a person,
 * because a plausible guess in those fields is indistinguishable from a real
 * value the moment it is written.
 */

const SEVERITY_STYLE: Record<IssueSeverity, string> = {
  BLOCKS_ANALYSIS: 'bg-rose-500/10 border-rose-500/30 text-rose-300',
  DEGRADES_ANALYSIS: 'bg-amber-500/10 border-amber-500/30 text-amber-300',
  TIDINESS: 'bg-slate-700/30 border-slate-600 text-slate-400',
};

const IssueRow: React.FC<{ issue: DataIssue }> = ({ issue }) => (
  <li className="py-2.5 border-b border-slate-800 last:border-0">
    <div className="flex items-start gap-2">
      <span
        className={`px-1.5 py-0.5 rounded border text-[9px] font-black uppercase whitespace-nowrap ${
          SEVERITY_STYLE[issue.severity]
        }`}
      >
        {SEVERITY_LABEL[issue.severity]}
      </span>
    </div>
    <p className="text-xs text-slate-200 mt-1.5 leading-snug">{issue.problem}</p>
    <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">{issue.consequence}</p>
    <p className="text-[11px] text-indigo-300 mt-1 leading-snug">→ {issue.remedy}</p>
  </li>
);

export const DataQualityPanel: React.FC = () => {
  const { toast } = useFeedback();
  const [report, setReport] = useState<QualityReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const reload = useCallback(async () => {
    setReport(await inspectData());
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  if (!report) return null;

  const fixable = report.issues.filter((i) => i.autoFixable).length;
  const shown = expanded ? report.issues : report.issues.slice(0, 5);

  return (
    <div className="bg-slate-900 border border-slate-700 rounded-2xl p-4 mb-4">
      <div className="flex items-center gap-2 mb-3">
        <Stethoscope className="w-4 h-4 text-teal-400" />
        <h3 className="font-bold text-sm text-white">Data quality</h3>
      </div>

      {report.issues.length === 0 ? (
        <p className="text-xs text-emerald-400 flex items-center gap-1.5">
          <CheckCircle2 className="w-4 h-4" />
          {report.rowsExamined === 0
            ? 'Nothing to check yet.'
            : `All ${report.rowsExamined} records are clean.`}
        </p>
      ) : (
        <>
          <div className="flex flex-wrap gap-1.5 mb-3">
            {(Object.keys(report.countsBySeverity) as IssueSeverity[])
              .filter((s) => report.countsBySeverity[s] > 0)
              .map((severity) => (
                <span
                  key={severity}
                  className={`px-2 py-1 rounded-lg border text-[10px] font-bold ${SEVERITY_STYLE[severity]}`}
                >
                  {report.countsBySeverity[severity]} {SEVERITY_LABEL[severity].toLowerCase()}
                </span>
              ))}
          </div>

          <ul className="mb-3">
            {shown.map((issue) => (
              <IssueRow key={issue.id} issue={issue} />
            ))}
          </ul>

          {report.issues.length > 5 && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="text-[11px] font-bold text-slate-400 underline mb-3"
            >
              {expanded ? 'Show fewer' : `Show all ${report.issues.length}`}
            </button>
          )}

          {fixable > 0 && (
            <button
              type="button"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  const result = await autoFix();
                  await reload();
                  toast.success(
                    `Fixed ${result.fixed} record${result.fixed === 1 ? '' : 's'}`,
                    'Only the corrections that cannot be wrong.'
                  );
                } finally {
                  setBusy(false);
                }
              }}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-teal-600 text-white font-bold text-sm disabled:opacity-40"
            >
              <Wand2 className="w-4 h-4" />
              Fix the {fixable} safe {fixable === 1 ? 'one' : 'ones'} automatically
            </button>
          )}

          <p className="text-[10px] text-slate-500 mt-2 leading-snug">
            Estimates, goal links and subject attribution are left alone on purpose — a guessed
            value is indistinguishable from a real one once it is saved.
          </p>
        </>
      )}
    </div>
  );
};

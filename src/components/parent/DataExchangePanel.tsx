import React, { useState } from 'react';
import {
  ImportKind,
  ImportPreview,
  IMPORT_TEMPLATES,
  previewImport,
  commitImport,
  templateCsv,
  exportReportCsv,
} from '../../services/csvService';
import { useFeedback } from '../shared/FeedbackProvider';
import { FileSpreadsheet, Download, Upload, AlertTriangle, Check } from 'lucide-react';

const KINDS: { id: ImportKind; label: string }[] = [
  { id: 'tasks', label: 'Homework' },
  { id: 'timetable', label: 'Timetable' },
  { id: 'milestones', label: 'Key dates' },
  { id: 'topics', label: 'Syllabus topics' },
];

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Bulk in, readable out.
 *
 * Import always previews first. A CSV is the one input that can quietly wreck a
 * term of data in a single click, so nothing is written until the parent has
 * seen exactly what will land and what was rejected and why.
 */
export const DataExchangePanel: React.FC = () => {
  const { toast } = useFeedback();
  const [kind, setKind] = useState<ImportKind>('timetable');
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [busy, setBusy] = useState(false);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    try {
      const text = await file.text();
      const result = previewImport(kind, text);
      setPreview(result);
      if (result.valid.length === 0 && result.invalid.length === 0) {
        toast.error('Nothing to import', 'The file has a header row but no data.');
      }
    } catch {
      toast.error('Could not read that file', 'It needs to be a plain CSV.');
    }
  };

  const handleCommit = async () => {
    if (!preview || busy) return;
    setBusy(true);
    try {
      const n = await commitImport(preview);
      toast.success(
        `Imported ${n} ${KINDS.find((k) => k.id === preview.kind)?.label.toLowerCase()}`,
        preview.invalid.length ? `${preview.invalid.length} rows were skipped.` : undefined
      );
      setPreview(null);
    } catch (err) {
      console.error('Import failed:', err);
      toast.error('Import failed', 'Nothing was written.');
    } finally {
      setBusy(false);
    }
  };

  const handleExport = async () => {
    setBusy(true);
    try {
      download(`GCSE_Genie_Report_${new Date().toISOString().slice(0, 10)}.csv`, await exportReportCsv());
      toast.success('Report downloaded', 'Opens in Google Sheets or Excel as one sheet.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="glass-card p-6">
      <div className="flex items-center gap-2 mb-3 pb-3 border-b border-slate-800">
        <FileSpreadsheet className="w-5 h-5 text-emerald-400" />
        <h3 className="font-bold text-sm text-white">Spreadsheets</h3>
      </div>

      {/* Export */}
      <div className="mb-5">
        <p className="text-xs text-slate-300 mb-2.5">
          One readable sheet: overview, subjects and health, tasks, key dates, goals, marked work,
          quests, rewards and check-ins.
        </p>
        <button
          onClick={handleExport}
          disabled={busy}
          className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-lg shadow-emerald-950/50 flex items-center gap-2 disabled:opacity-50"
        >
          <Download className="w-4 h-4" />
          <span>Export report (CSV)</span>
        </button>
      </div>

      {/* Import */}
      <div className="pt-4 border-t border-slate-800">
        <p className="text-xs text-slate-300 mb-2.5">
          Bulk import rather than typing a term of homework one row at a time. Download the
          template, fill it in, and check the preview before anything is written.
        </p>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 mb-3">
          {KINDS.map((k) => (
            <button
              key={k.id}
              onClick={() => { setKind(k.id); setPreview(null); }}
              className={`py-2 rounded-xl text-[11px] font-bold border transition-all ${
                kind === k.id
                  ? 'bg-indigo-600 border-indigo-400 text-white'
                  : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
              }`}
            >
              {k.label}
            </button>
          ))}
        </div>

        <p className="text-[10px] text-slate-500 font-mono mb-2.5 break-words">
          {IMPORT_TEMPLATES[kind].headers.join(', ')}
        </p>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => download(`GCSE_Genie_${kind}_template.csv`, templateCsv(kind))}
            className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-bold text-[11px] flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5 text-slate-400" />
            <span>Template</span>
          </button>

          <label className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-bold text-[11px] flex items-center gap-1.5 cursor-pointer">
            <Upload className="w-3.5 h-3.5 text-slate-400" />
            <span>Choose a CSV</span>
            <input type="file" accept=".csv,text/csv" onChange={handleFile} className="hidden" />
          </label>
        </div>

        {preview && (
          <div className="mt-4 p-3 bg-slate-900/80 border border-slate-800 rounded-xl">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <span className="text-xs font-bold text-white">
                {preview.valid.length} row{preview.valid.length === 1 ? '' : 's'} ready
                {preview.invalid.length > 0 && (
                  <span className="text-rose-300 font-normal">
                    {' · '}{preview.invalid.length} rejected
                  </span>
                )}
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPreview(null)}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 text-[11px] font-bold"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCommit}
                  disabled={busy || preview.valid.length === 0}
                  className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-bold flex items-center gap-1 disabled:opacity-40"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Import {preview.valid.length}</span>
                </button>
              </div>
            </div>

            {preview.invalid.length > 0 && (
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {preview.invalid.slice(0, 8).map((r) => (
                  <p key={r.line} className="text-[10px] text-rose-300 flex items-start gap-1.5">
                    <AlertTriangle className="w-3 h-3 flex-shrink-0 mt-0.5" />
                    <span>Line {r.line}: {r.error}</span>
                  </p>
                ))}
                {preview.invalid.length > 8 && (
                  <p className="text-[10px] text-slate-500">
                    ...and {preview.invalid.length - 8} more.
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

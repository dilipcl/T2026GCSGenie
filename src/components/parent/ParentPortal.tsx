import React, { useState, useEffect } from 'react';
import { db } from '../../db';
import {
  ParentSettings,
  AgentAuditReport,
  AuditLogEntry,
  Sanction,
  LLMProvider,
} from '../../types';
import { runAgenticAudit } from '../../services/llmAgentService';
import {
  exportDatabaseToJSON,
  importDatabaseFromJSON,
  generateAgentAuditPackage,
} from '../../services/backupService';
import { logAuditEvent } from '../../services/auditService';
import { triggerCelebration } from '../../utils/confetti';
import {
  ShieldAlert,
  Bot,
  Download,
  Upload,
  Database,
  History,
  Sparkles,
} from 'lucide-react';

export const ParentPortal: React.FC = () => {
  const [settings, setSettings] = useState<ParentSettings>({
    parentPinHash: '',
    googleDriveBackupPath: 'G:/My Drive/Documents/UK/Family/Tejas/GCSE-Genie/Backups',
    llmProvider: 'GEMINI',
    llmModelName: 'gemini-1.5-pro',
    llmApiKey: '',
  });

  const [activeReport, setActiveReport] = useState<AgentAuditReport | null>(null);
  const [isRunningAudit, setIsRunningAudit] = useState(false);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [sanctions, setSanctions] = useState<Sanction[]>([]);

  // Sanction form
  const [sanctionReason, setSanctionReason] = useState('');
  const [sanctionRemediation, setSanctionRemediation] = useState(
    'Complete 45 minutes of focused English revision and submit notes to parents'
  );

  const loadData = async () => {
    const s = await db.parentSettings.get('active_settings');
    if (s) setSettings(s);

    const latestReport = await db.agentAuditReports.orderBy('timestamp').reverse().first();
    if (latestReport) setActiveReport(latestReport);

    const logs = await db.auditLogs.orderBy('timestamp').reverse().limit(50).toArray();
    setAuditLogs(logs);

    const sancList = await db.sanctions.orderBy('date').reverse().toArray();
    setSanctions(sancList);
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    await db.parentSettings.put({ ...settings, id: 'active_settings' });
    alert('Parent AI & Google Drive settings saved successfully.');
  };

  const handleRunAudit = async () => {
    setIsRunningAudit(true);
    try {
      const report = await runAgenticAudit(settings);
      setActiveReport(report);
      triggerCelebration({ particleCount: 60 });
      loadData();
    } catch (err) {
      console.error('Audit failed:', err);
      alert('Audit generation encountered an error. Deterministic rules fallback will be used.');
    } finally {
      setIsRunningAudit(false);
    }
  };

  const handleExportDriveBundle = async () => {
    const bundle = await generateAgentAuditPackage();
    const blob = new Blob([bundle.jsonContent], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = bundle.filename;
    a.click();
    URL.revokeObjectURL(url);
    alert(`Audit bundle downloaded! Save to your Google Drive path: ${settings.googleDriveBackupPath}`);
  };

  const handleExportFullBackup = async () => {
    const jsonStr = await exportDatabaseToJSON();
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `GCSE_Genie_Backup_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportBackup = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const text = evt.target?.result as string;
        await importDatabaseFromJSON(text);
        alert('Database successfully restored from backup JSON!');
        window.location.reload();
      } catch (err) {
        alert('Failed to restore backup: Invalid file format.');
      }
    };
    reader.readAsText(file);
  };

  const handleLogSanction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sanctionReason.trim()) return;

    const newSanction: Sanction = {
      id: `sanc_${Date.now()}`,
      type: 'DETENTION',
      reason: sanctionReason.trim(),
      date: new Date().toISOString().split('T')[0],
      penaltyXP: -500,
      shopFrozen: true,
      remediationTaskIdRequired: sanctionRemediation.trim(),
      loggedBy: 'PARENT',
    };

    await db.sanctions.add(newSanction);
    await logAuditEvent({
      user: 'PARENT',
      action: 'SANCTION_FREEZE',
      entity: 'Sanction',
      entityId: newSanction.id,
      newValue: `Logged School Detention (-500 XP penalty & Rewards Frozen). Reason: ${newSanction.reason}`,
    });

    setSanctionReason('');
    loadData();
    alert('School sanction logged: -500 XP applied and Rewards Shop has been FROZEN until remediation quest is completed.');
  };

  const handleLiftSanction = async (sanction: Sanction) => {
    await db.sanctions.update(sanction.id, {
      shopFrozen: false,
      resolvedAt: Date.now(),
    });

    await logAuditEvent({
      user: 'PARENT',
      action: 'UPDATE',
      entity: 'Sanction',
      entityId: sanction.id,
      fieldChanged: 'shopFrozen',
      oldValue: 'true',
      newValue: 'false (Remediation approved by Parent, Shop Unlocked)',
    });

    loadData();
    alert('Sanction resolved! Rewards shop is now UNLOCKED.');
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="glass-card p-6 bg-gradient-to-r from-slate-900 via-rose-950/30 to-slate-900 border-rose-500/30">
        <div className="flex items-center gap-2 mb-1">
          <span className="p-2 rounded-xl bg-rose-500/20 text-rose-400 border border-rose-500/30">
            🛡️
          </span>
          <h2 className="text-xl font-bold text-white">Parent Portal & Agentic Governance</h2>
        </div>
        <p className="text-xs text-slate-300 max-w-xl">
          Trigger model-agnostic AI agent audits, manage the real-world rewards ledger, log school
          sanctions, and inspect the tamper-evident audit trail.
        </p>
      </div>

      {/* Grid: AI Agent Audit Engine & Configuration */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: AI Agent Controls & Settings */}
        <div className="glass-card p-5 space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-slate-800">
            <Bot className="w-5 h-5 text-indigo-400" />
            <h3 className="font-bold text-sm text-white">Model-Agnostic Agent Engine</h3>
          </div>

          <form onSubmit={handleSaveSettings} className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase mb-1">
                AI Provider
              </label>
              <select
                value={settings.llmProvider}
                onChange={(e) =>
                  setSettings({ ...settings, llmProvider: e.target.value as LLMProvider })
                }
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
              >
                <option value="GEMINI">Google Gemini (Default)</option>
                <option value="CLAUDE">Anthropic Claude (Claude 3.5 Sonnet)</option>
                <option value="OPENAI">OpenAI (GPT-4o)</option>
                <option value="LOCAL">Built-in Offline Rule Agent</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase mb-1">
                Model Name
              </label>
              <input
                type="text"
                value={settings.llmModelName || ''}
                onChange={(e) => setSettings({ ...settings, llmModelName: e.target.value })}
                placeholder="e.g. gemini-1.5-pro or claude-3-5-sonnet-20241022"
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase mb-1">
                API Key (Stored Locally in Browser)
              </label>
              <input
                type="password"
                value={settings.llmApiKey || ''}
                onChange={(e) => setSettings({ ...settings, llmApiKey: e.target.value })}
                placeholder="Optional for live API audits..."
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase mb-1">
                Google Drive Sync Path
              </label>
              <input
                type="text"
                value={settings.googleDriveBackupPath}
                onChange={(e) =>
                  setSettings({ ...settings, googleDriveBackupPath: e.target.value })
                }
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-mono text-[11px]"
              />
            </div>

            <button
              type="submit"
              className="w-full py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition-all border border-slate-700"
            >
              Save Settings
            </button>
          </form>

          {/* Audit Action Buttons */}
          <div className="pt-2 space-y-2 border-t border-slate-800">
            <button
              onClick={handleRunAudit}
              disabled={isRunningAudit}
              className="w-full py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold text-xs shadow-lg shadow-indigo-950/50 flex items-center justify-center gap-2"
            >
              <Bot className="w-4 h-4" />
              <span>{isRunningAudit ? 'Running Agentic Audit...' : 'Trigger AI Agent Audit'}</span>
            </button>

            <button
              onClick={handleExportDriveBundle}
              className="w-full py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs border border-slate-700 flex items-center justify-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export Audit Bundle for Claude/Gemini</span>
            </button>
          </div>
        </div>

        {/* Right: Latest Plan Alignment Report */}
        <div className="lg:col-span-2 glass-card p-5">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-3">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-amber-400" />
              <h3 className="font-bold text-sm text-white">Latest Plan Alignment Report</h3>
            </div>
            {activeReport && (
              <span className="text-[11px] text-slate-400">
                Generated: {new Date(activeReport.timestamp).toLocaleString('en-GB')}
              </span>
            )}
          </div>

          {!activeReport ? (
            <div className="p-8 text-center bg-slate-900/40 rounded-xl border border-slate-800">
              <Bot className="w-10 h-10 text-slate-600 mx-auto mb-2" />
              <p className="text-sm text-slate-300 font-semibold">No audit report generated yet</p>
              <p className="text-xs text-slate-500 mt-1">
                Click "Trigger AI Agent Audit" to evaluate 14-day telemetry and curriculum health.
              </p>
            </div>
          ) : (
            <div className="space-y-4 max-h-[420px] overflow-y-auto pr-2 text-xs">
              <div className="p-3 bg-slate-900 rounded-xl border border-slate-800 flex items-center justify-between">
                <div>
                  <span className="text-slate-400">Generated By:</span>
                  <span className="font-bold text-white ml-1.5">{activeReport.generatedBy}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-slate-400">Burnout Status:</span>
                  <span
                    className={`font-bold px-2 py-0.5 rounded text-[10px] uppercase ${
                      activeReport.burnoutStatus === 'GREEN'
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                        : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                    }`}
                  >
                    {activeReport.burnoutStatus} ({activeReport.burnoutStressIndexScore}%)
                  </span>
                </div>
              </div>

              {/* Subject Alerts */}
              {activeReport.subjectBalanceAlerts.length > 0 && (
                <div className="p-3.5 bg-indigo-950/30 rounded-xl border border-indigo-500/30">
                  <h4 className="font-bold text-indigo-300 mb-1.5">Subject & Activity Balance Alerts:</h4>
                  <ul className="list-disc list-inside space-y-1 text-slate-300">
                    {activeReport.subjectBalanceAlerts.map((alert, idx) => (
                      <li key={idx}>{alert}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Actionable Recommendations */}
              {activeReport.actionableRecommendations.length > 0 && (
                <div className="p-3.5 bg-emerald-950/30 rounded-xl border border-emerald-500/30">
                  <h4 className="font-bold text-emerald-300 mb-1.5">
                    Parent & Student Actionable Recommendations:
                  </h4>
                  <ul className="list-decimal list-inside space-y-1 text-slate-300">
                    {activeReport.actionableRecommendations.map((rec, idx) => (
                      <li key={idx}>{rec}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Raw Markdown */}
              <div className="p-3 bg-slate-900/80 rounded-xl border border-slate-800 text-[11px] font-mono whitespace-pre-wrap text-slate-400">
                {activeReport.rawMarkdown}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Log School Sanction / Detention */}
      <div className="glass-card p-6">
        <div className="flex items-center gap-2 mb-3 pb-3 border-b border-slate-800">
          <ShieldAlert className="w-5 h-5 text-rose-400" />
          <h3 className="font-bold text-sm text-white">Manual School Sanction & Detention Logger</h3>
        </div>

        <form onSubmit={handleLogSanction} className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase mb-1">
              Sanction / Detention Reason
            </label>
            <input
              type="text"
              placeholder="e.g. Missing English homework / Late to period 3"
              value={sanctionReason}
              onChange={(e) => setSanctionReason(e.target.value)}
              required
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase mb-1">
              Remediation Quest Required to Unlock Shop
            </label>
            <input
              type="text"
              value={sanctionRemediation}
              onChange={(e) => setSanctionRemediation(e.target.value)}
              required
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
            />
          </div>

          <div className="flex items-end">
            <button
              type="submit"
              className="w-full py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs uppercase tracking-wider shadow-lg shadow-rose-950/50"
            >
              Log Detention (-500 XP & Freeze Shop)
            </button>
          </div>
        </form>

        {/* Active Sanctions List */}
        {sanctions.length > 0 && (
          <div className="mt-4 space-y-2">
            <h4 className="text-xs font-bold text-slate-400 uppercase">Sanctions History</h4>
            {sanctions.map((s) => (
              <div
                key={s.id}
                className="p-3 bg-slate-900 rounded-xl border border-slate-800 flex items-center justify-between text-xs"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-rose-400">DETENTION ({s.date})</span>
                    <span className="text-slate-300">{s.reason}</span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Unlock Quest: {s.remediationTaskIdRequired}
                  </p>
                </div>

                {s.shopFrozen && !s.resolvedAt ? (
                  <button
                    onClick={() => handleLiftSanction(s)}
                    className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-lg shadow"
                  >
                    Approve Quest & Lift Freeze
                  </button>
                ) : (
                  <span className="text-emerald-400 text-xs font-semibold">Resolved</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Backup & Google Drive Sync (Option A) */}
      <div className="glass-card p-6">
        <div className="flex items-center gap-2 mb-3 pb-3 border-b border-slate-800">
          <Database className="w-5 h-5 text-teal-400" />
          <h3 className="font-bold text-sm text-white">Database Backup & Google Drive Sync (Option A)</h3>
        </div>

        <p className="text-xs text-slate-300 mb-4">
          All your data is stored offline on this device. Use one-click JSON export to backup your
          entire database directly to your Google Drive backup folder.
        </p>

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={handleExportFullBackup}
            className="px-4 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-bold text-xs shadow-lg shadow-teal-950/50 flex items-center gap-2"
          >
            <Download className="w-4 h-4" />
            <span>Export Complete Backup JSON</span>
          </button>

          <label className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs border border-slate-700 flex items-center gap-2 cursor-pointer transition-all">
            <Upload className="w-4 h-4 text-slate-400" />
            <span>Restore from Backup JSON</span>
            <input type="file" accept=".json" onChange={handleImportBackup} className="hidden" />
          </label>
        </div>
      </div>

      {/* Immutable Write-Only Audit Log Viewer */}
      <div className="glass-card p-6">
        <div className="flex items-center justify-between mb-3 pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <History className="w-5 h-5 text-indigo-400" />
            <h3 className="font-bold text-sm text-white">Immutable Write-Only Audit Ledger</h3>
          </div>
          <span className="text-xs text-slate-400">Cryptographically Chained with SHA-256</span>
        </div>

        <div className="overflow-x-auto max-h-64 overflow-y-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-900/90 text-slate-400 uppercase text-[10px]">
              <tr>
                <th className="p-2">Timestamp</th>
                <th className="p-2">User</th>
                <th className="p-2">Action</th>
                <th className="p-2">Entity</th>
                <th className="p-2">Details</th>
                <th className="p-2 font-mono">Hash</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-slate-300">
              {auditLogs.map((log) => (
                <tr key={log.id} className="hover:bg-slate-800/30">
                  <td className="p-2 whitespace-nowrap text-slate-400">
                    {new Date(log.timestamp).toLocaleTimeString('en-GB')}
                  </td>
                  <td className="p-2">
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                        log.user === 'PARENT'
                          ? 'bg-rose-500/20 text-rose-300'
                          : 'bg-indigo-500/20 text-indigo-300'
                      }`}
                    >
                      {log.user}
                    </span>
                  </td>
                  <td className="p-2 font-semibold text-white">{log.action}</td>
                  <td className="p-2 text-slate-400">{log.entity}</td>
                  <td className="p-2 max-w-xs truncate">{log.newValue || log.oldValue || '—'}</td>
                  <td className="p-2 font-mono text-[10px] text-slate-500 truncate max-w-[80px]">
                    {log.hash.substring(0, 8)}...
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

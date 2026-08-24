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
  describeBackup,
  summariseCurrentDatabase,
} from '../../services/backupService';
import { totalAttachmentBytes, formatBytes } from '../../services/attachmentService';
import { WORKING_FOLDER_URL, WORKING_FOLDER_PATH, BACKUPS_FOLDER_URL } from '../../db/driveFolders';
import { logAuditEvent } from '../../services/auditService';
import { triggerCelebration } from '../../utils/confetti';
import { todayISO } from '../../utils/date';
import { setPassphrase, getLockState, LockState } from '../../services/parentLockService';
import { MIN_PASSPHRASE_LENGTH, PBKDF2_ITERATIONS } from '../../utils/credential';
import { verifyAuditChain, ChainVerification } from '../../services/auditService';
import {
  ShieldAlert,
  Bot,
  Download,
  Upload,
  Database,
  History,
  Sparkles,
  KeyRound,
  ShieldCheck,
  FileWarning,
} from 'lucide-react';
import { newId } from '../../utils/id';
import { useFeedback } from '../shared/FeedbackProvider';

export const ParentPortal: React.FC = () => {
  const { toast, confirm } = useFeedback();
  const [settings, setSettings] = useState<ParentSettings>({

    googleDriveBackupPath: `${WORKING_FOLDER_PATH}\\_Genie-Backups`,
    llmProvider: 'GEMINI',
    llmModelName: 'gemini-1.5-pro',
    llmApiKey: '',
  });

  const [activeReport, setActiveReport] = useState<AgentAuditReport | null>(null);
  const [isRunningAudit, setIsRunningAudit] = useState(false);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [sanctions, setSanctions] = useState<Sanction[]>([]);
  const [proofUsage, setProofUsage] = useState({ count: 0, bytes: 0 });
  const [isRestoring, setIsRestoring] = useState(false);

  // Change PIN form
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [pinMessage, setPinMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [lockState, setLockState] = useState<LockState | null>(null);
  const [integrity, setIntegrity] = useState<ChainVerification | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);

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

    setProofUsage(await totalAttachmentBytes());
    setLockState(await getLockState());
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    /**
     * Update only the fields this form owns. A whole-object `put` from React
     * state would erase everything the state does not carry - the passphrase
     * credential, the lockout counters and the audit chain high-water marks -
     * silently unlocking the portal and blinding the tamper check.
     */
    await db.parentSettings.update('active_settings', {
      llmProvider: settings.llmProvider,
      llmModelName: settings.llmModelName,
      llmApiKey: settings.llmApiKey,
      googleDriveBackupPath: settings.googleDriveBackupPath,
      googleDriveFolderUrl: settings.googleDriveFolderUrl,
    });
    toast.success('Settings saved');
  };

  const handleChangePin = async (e: React.FormEvent) => {
    e.preventDefault();
    setPinMessage(null);

    if (newPin !== confirmPin) {
      setPinMessage({ ok: false, text: 'The two new entries do not match.' });
      return;
    }

    const result = await setPassphrase(newPin, currentPin || undefined);
    if (!result.ok) {
      setPinMessage({ ok: false, text: result.message || 'Could not change the passphrase.' });
      return;
    }

    setCurrentPin('');
    setNewPin('');
    setConfirmPin('');
    setPinMessage({ ok: true, text: 'Parent passphrase updated.' });
    loadData();
  };

  const handleVerifyIntegrity = async () => {
    setIsVerifying(true);
    try {
      setIntegrity(await verifyAuditChain());
    } finally {
      setIsVerifying(false);
    }
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
      toast.error('Audit failed', 'The built-in offline engine will be used instead.');
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
    toast.success('Audit bundle downloaded', `Save it to ${settings.googleDriveBackupPath}`);
  };

  const downloadJSON = (jsonStr: string, filename: string) => {
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportFullBackup = async (includeAttachments: boolean) => {
    const jsonStr = await exportDatabaseToJSON({ includeAttachments });
    const suffix = includeAttachments ? '' : '_no_photos';
    downloadJSON(
      jsonStr,
      `GCSE_Genie_Backup_${new Date().toISOString().split('T')[0]}${suffix}.json`
    );
  };

  /**
   * Restore replaces the database. Two things have to happen before anything is
   * cleared: the parent has to see what they are trading away, and the current
   * state has to be written to a rescue file. Previously this ran straight into
   * a destructive overwrite behind a single "Invalid file format" catch.
   */
  const handleImportBackup = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    setIsRestoring(true);
    try {
      const text = await file.text();
      const summary = describeBackup(text);
      const current = await summariseCurrentDatabase();

      const changed = Object.keys(summary.counts)
        .filter((table) => (current[table] || 0) !== summary.counts[table])
        .map((table) => `  ${table}: ${current[table] || 0} → ${summary.counts[table]}`);

      const lines = [
        `Restore the backup taken ${
          summary.exportDateISO ? new Date(summary.exportDateISO).toLocaleString('en-GB') : 'at an unknown time'
        }?`,
        '',
        'This REPLACES what is on this device. Anything logged here since that backup was taken will be lost.',
        '',
        changed.length ? `Row counts that change:\n${changed.join('\n')}` : 'Row counts are unchanged.',
      ];

      if (summary.missingTables.length) {
        lines.push(
          '',
          `This backup predates these tables, so they will be left as they are rather than emptied:\n  ${summary.missingTables.join(', ')}`
        );
      }
      if (summary.attachmentsOmitted) {
        lines.push('', 'This backup was exported without proof photos. Existing photos on this device are kept.');
      }

      lines.push('', 'A rescue copy of the current database will download first.');

      const proceed = await confirm({
        title: 'Restore this backup?',
        body: 'This REPLACES what is on this device. Anything logged here since the backup was taken will be lost. A rescue copy of the current database downloads first.',
        details: lines.join('\n'),
        confirmLabel: 'Replace my data',
        tone: 'danger',
      });
      if (!proceed) {
        setIsRestoring(false);
        return;
      }

      // Rescue export first - if the restore turns out to be the wrong file,
      // this is the only way back.
      const rescue = await exportDatabaseToJSON({ includeAttachments: true });
      downloadJSON(
        rescue,
        `GCSE_Genie_RESCUE_before_restore_${new Date().toISOString().replace(/[:.]/g, '-')}.json`
      );

      const result = await importDatabaseFromJSON(text);

      await logAuditEvent({
        user: 'PARENT',
        action: 'UPDATE',
        entity: 'Database',
        entityId: 'restore',
        newValue: `Restored from backup dated ${summary.exportDateISO || 'unknown'}. Tables replaced: ${
          Object.keys(result.restored).length
        }. Tables preserved: ${result.preserved.join(', ') || 'none'}.`,
      });

      const preservedNote = result.preserved.length
        ? `\n\nLeft untouched (not in the backup): ${result.preserved.join(', ')}`
        : '';
      toast.success('Restore complete', `Reloading now.${preservedNote}`);
      window.setTimeout(() => window.location.reload(), 1200);
    } catch (err) {
      console.error('Restore failed:', err);
      toast.error(
        'Restore failed - nothing was changed',
        err instanceof Error ? err.message : 'The file could not be read.'
      );
    } finally {
      setIsRestoring(false);
    }
  };

  const handleLogSanction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sanctionReason.trim()) return;

    const newSanction: Sanction = {
      id: newId('sanc'),
      type: 'DETENTION',
      reason: sanctionReason.trim(),
      date: todayISO(),
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
    toast.success(
      'Sanction logged',
      '-500 XP applied and the Rewards Shop is frozen until the remediation quest is approved.'
    );
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
    toast.success('Sanction lifted', 'The Rewards Shop is unlocked again.');
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="glass-card p-6 bg-gradient-to-r from-slate-900 via-rose-950/30 to-slate-900 border-rose-500/30">
        <div className="flex items-center gap-2 mb-1">
          <span className="p-2 rounded-xl bg-rose-500/20 text-rose-400 border border-rose-500/30">
            🛡️
          </span>
          <h2 className="text-xl font-bold text-white">Parent Portal</h2>
        </div>
        <p className="text-xs text-slate-300 max-w-xl">
          Run an audit, log a school sanction, back up the data, change the passphrase, and check
          the change history for tampering.
        </p>
      </div>

      {/* Parent passphrase */}
      <div className="glass-card p-6">
        <div className="flex items-center gap-2 mb-3 pb-3 border-b border-slate-800">
          <KeyRound className="w-5 h-5 text-amber-400" />
          <h3 className="font-bold text-sm text-white">Parent passphrase</h3>
        </div>

        {lockState?.status === 'UNCLAIMED' && (
          <div className="mb-4 p-3 bg-amber-950/40 border border-amber-500/40 rounded-xl text-xs text-amber-200 flex items-start gap-2">
            <ShieldAlert className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
            <span>
              No passphrase is set. Anyone opening the app can claim the Parent Portal and approve
              their own reward requests. Set one now.
            </span>
          </div>
        )}

        {lockState?.status === 'LEGACY_PIN' && (
          <div className="mb-4 p-3 bg-amber-950/40 border border-amber-500/40 rounded-xl text-xs text-amber-200 flex items-start gap-2">
            <ShieldAlert className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
            <span>
              A four-digit PIN is still in place. Ten thousand possibilities against a fast hash is
              a few milliseconds of guessing - replace it with a passphrase.
            </span>
          </div>
        )}

        <form onSubmit={handleChangePin} className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase mb-1">
              Current
            </label>
            <input
              type="password"
              autoComplete="current-password"
              value={currentPin}
              onChange={(e) => setCurrentPin(e.target.value)}
              disabled={lockState?.status === 'UNCLAIMED'}
              placeholder={lockState?.status === 'UNCLAIMED' ? 'None set' : ''}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white disabled:opacity-40"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase mb-1">
              New passphrase
            </label>
            <input
              type="password"
              autoComplete="new-password"
              value={newPin}
              onChange={(e) => setNewPin(e.target.value)}
              required
              minLength={MIN_PASSPHRASE_LENGTH}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase mb-1">
              Confirm
            </label>
            <input
              type="password"
              autoComplete="new-password"
              value={confirmPin}
              onChange={(e) => setConfirmPin(e.target.value)}
              required
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
            />
          </div>

          <div className="flex items-end">
            <button
              type="submit"
              className="w-full py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-slate-950 font-bold text-xs uppercase tracking-wider shadow-lg shadow-amber-950/50"
            >
              {lockState?.status === 'UNCLAIMED' ? 'Set passphrase' : 'Update'}
            </button>
          </div>
        </form>

        {pinMessage && (
          <p
            className={`mt-3 text-xs font-semibold ${
              pinMessage.ok ? 'text-emerald-400' : 'text-rose-400'
            }`}
          >
            {pinMessage.text}
          </p>
        )}

        <p className="mt-3 text-[11px] text-slate-400">
          Stored as PBKDF2-SHA256 with a random salt over {PBKDF2_ITERATIONS.toLocaleString()}{' '}
          iterations, so each guess costs real time, and repeated failures lock the portal for an
          escalating period. This protects the passphrase, not the database - see the integrity
          check below.
        </p>
      </div>

      {/* Change-history integrity */}
      <div className="glass-card p-6">
        <div className="flex items-center justify-between gap-2 mb-3 pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-emerald-400" />
            <h3 className="font-bold text-sm text-white">Change history integrity</h3>
          </div>
          <button
            onClick={handleVerifyIntegrity}
            disabled={isVerifying}
            className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-[11px] font-bold text-slate-200 disabled:opacity-50"
          >
            {isVerifying ? 'Checking...' : 'Run check'}
          </button>
        </div>

        <p className="text-xs text-slate-300 mb-3">
          Each entry is hashed together with the one before it, per device. Editing or deleting a
          row breaks the chain from that point on, which this check will find.
        </p>

        {!integrity ? (
          <p className="text-[11px] text-slate-500">Not checked yet this session.</p>
        ) : integrity.ok ? (
          <div className="p-3 bg-emerald-950/30 border border-emerald-500/40 rounded-xl text-xs text-emerald-200 flex items-start gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
            <span>
              Intact. {integrity.totalEntries} entries across {integrity.deviceCount} device
              {integrity.deviceCount === 1 ? '' : 's'} verified.
              {integrity.legacyEntries > 0 &&
                ` ${integrity.legacyEntries} older entries predate chaining and cannot be verified.`}
            </span>
          </div>
        ) : (
          <div className="p-3 bg-rose-950/40 border border-rose-500/50 rounded-xl text-xs text-rose-100">
            <div className="flex items-start gap-2 mb-2">
              <FileWarning className="w-4 h-4 text-rose-400 flex-shrink-0 mt-0.5" />
              <span className="font-bold text-rose-200">
                {integrity.faults.length} problem{integrity.faults.length === 1 ? '' : 's'} found -
                the change history has been altered.
              </span>
            </div>
            <ul className="list-disc list-inside space-y-1 ml-1">
              {integrity.faults.slice(0, 8).map((f, i) => (
                <li key={i}>
                  <span className="font-mono text-[10px] text-rose-300">
                    #{f.sequence} {f.kind}
                  </span>{' '}
                  {f.detail}
                </li>
              ))}
            </ul>
            {integrity.faults.length > 8 && (
              <p className="mt-1.5 text-[11px] text-rose-300">
                ...and {integrity.faults.length - 8} more.
              </p>
            )}
          </div>
        )}
      </div>

      {/* Grid: AI Agent Audit Engine & Configuration */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: AI Agent Controls & Settings */}
        <div className="glass-card p-5 space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-slate-800">
            <Bot className="w-5 h-5 text-indigo-400" />
            <h3 className="font-bold text-sm text-white">AI Audit Settings</h3>
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
                <option value="CLAUDE">Anthropic Claude</option>
                <option value="OPENAI">OpenAI</option>
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
                placeholder={
                  settings.llmProvider === 'CLAUDE'
                    ? 'claude-opus-5'
                    : settings.llmProvider === 'OPENAI'
                    ? 'gpt-4o'
                    : 'gemini-1.5-pro'
                }
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
              />
              <p className="mt-1 text-[10px] text-slate-500">
                Leave blank to use the default for the selected provider.
              </p>
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
                Backups folder (on this computer)
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

        {/* Right: Latest Audit Report */}
        <div className="lg:col-span-2 glass-card p-5">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-3">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-amber-400" />
              <h3 className="font-bold text-sm text-white">Latest Audit Report</h3>
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
              {/* The fallback used to be visible only as a change in the
                  "Generated By" line, which does not explain a bad API key. */}
              {activeReport.fallbackReason && (
                <div className="p-3 bg-amber-950/40 rounded-xl border border-amber-500/50 flex items-start gap-2">
                  <ShieldAlert className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-bold text-amber-300">Ran offline instead of the live model</h4>
                    <p className="text-amber-100 mt-0.5">{activeReport.fallbackReason}</p>
                  </div>
                </div>
              )}

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
          <h3 className="font-bold text-sm text-white">Log a School Sanction</h3>
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
          <h3 className="font-bold text-sm text-white">Backup & Restore</h3>
        </div>

        <p className="text-xs text-slate-300 mb-3">
          All data is stored on this device only. The export covers every table, including key
          dates and the proof log. The API key is deliberately left out of the file.
        </p>

        <div className="mb-4 p-3 bg-amber-950/30 border border-amber-500/40 rounded-xl text-xs text-amber-100 flex items-start gap-2">
          <ShieldAlert className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
          <span>
            Restoring <strong>replaces</strong> this device's data - it does not merge. If Tejas has
            checked in on his phone since this backup was taken, that will be lost. A rescue copy
            downloads automatically before anything is cleared.
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => handleExportFullBackup(true)}
            className="px-4 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-bold text-xs shadow-lg shadow-teal-950/50 flex items-center gap-2"
          >
            <Download className="w-4 h-4" />
            <span>Export everything</span>
          </button>

          <button
            onClick={() => handleExportFullBackup(false)}
            className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs border border-slate-700 flex items-center gap-2 transition-all"
          >
            <Download className="w-4 h-4 text-slate-400" />
            <span>Export without photos</span>
          </button>

          <label
            className={`px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs border border-slate-700 flex items-center gap-2 transition-all ${
              isRestoring ? 'opacity-50 cursor-wait' : 'cursor-pointer'
            }`}
          >
            <Upload className="w-4 h-4 text-slate-400" />
            <span>{isRestoring ? 'Restoring...' : 'Restore from backup'}</span>
            <input
              type="file"
              accept=".json"
              onChange={handleImportBackup}
              disabled={isRestoring}
              className="hidden"
            />
          </label>
        </div>

        <div className="mt-4 pt-4 border-t border-slate-800 flex flex-wrap items-center gap-3">
          <a
            href={settings.googleDriveFolderUrl || WORKING_FOLDER_URL}
            target="_blank"
            rel="noreferrer"
            className="px-3.5 py-2 rounded-xl bg-teal-600/20 border border-teal-500/40 text-teal-300 hover:bg-teal-600/30 font-bold text-[11px] flex items-center gap-1.5 transition-all"
          >
            <Database className="w-3.5 h-3.5" />
            <span>Open working folder</span>
          </a>
          <a
            href={settings.backupsFolderUrl || BACKUPS_FOLDER_URL}
            target="_blank"
            rel="noreferrer"
            className="px-3.5 py-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-200 hover:bg-slate-700 font-bold text-[11px] flex items-center gap-1.5 transition-all"
          >
            <Download className="w-3.5 h-3.5 text-slate-400" />
            <span>Open backups folder</span>
          </a>
          <span className="text-[11px] text-slate-500 font-mono">
            {settings.workingFolderPath || WORKING_FOLDER_PATH}
          </span>
        </div>

        <p className="mt-3 text-[11px] text-slate-400">
          Proof log currently holds <strong className="text-slate-200">{proofUsage.count}</strong>{' '}
          file{proofUsage.count === 1 ? '' : 's'} totalling{' '}
          <strong className="text-slate-200">{formatBytes(proofUsage.bytes)}</strong>. Photos are
          downscaled on upload, but a full export grows by roughly a third of this once encoded.
        </p>
      </div>

      {/* Immutable Write-Only Audit Log Viewer */}
      <div className="glass-card p-6">
        <div className="flex items-center justify-between mb-3 pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <History className="w-5 h-5 text-indigo-400" />
            <h3 className="font-bold text-sm text-white">Change History</h3>
          </div>
          {/* Now genuinely chained per device, so "tamper-evident" is accurate.
              Still not tamper-PROOF: the hashes are unsigned, so someone who
              recomputes the whole chain after editing it would pass the check. */}
          <span className="text-xs text-slate-400">
            Hash-chained per device - edits and deletions are detectable
          </span>
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

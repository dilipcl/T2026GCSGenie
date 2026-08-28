import { ChangeLogEntry, ParentSettings } from '../types';
import { CATEGORY_ICON, CATEGORY_LABEL, groupByCategory } from './changeLogService';

/**
 * Writing a confirmed batch of updates out as a file for Google Drive.
 *
 * What this is not: an upload. The app has no Drive API credentials and holds
 * no OAuth token, deliberately - it is offline-first and stores nothing on a
 * server. So "log it to Drive" means producing a timestamped file and letting
 * the browser save it; the family already runs Drive for Desktop over
 * `WORKING_FOLDER_PATH`, so a file saved into that folder is in Drive within
 * seconds, and the folder link is offered next to the button for anyone who
 * would rather drop it in by hand.
 *
 * Saying this plainly matters more than hiding it. A button labelled "save to
 * Drive" that silently downloaded to the Downloads folder would be the third
 * kind of lie this codebase has already had to fix twice.
 */

/** Two-digit padding for filename and timestamp parts. */
const pad = (n: number) => String(n).padStart(2, '0');

/**
 * `Genie-Updates-2026-09-02-1830.md`.
 *
 * Sorts chronologically as plain text, which is what makes a folder of these
 * readable without opening any of them.
 */
export function driveLogFileName(when: Date = new Date()): string {
  return `Genie-Updates-${when.getFullYear()}-${pad(when.getMonth() + 1)}-${pad(
    when.getDate()
  )}-${pad(when.getHours())}${pad(when.getMinutes())}.md`;
}

export function formatStamp(when: Date): string {
  return `${when.getFullYear()}-${pad(when.getMonth() + 1)}-${pad(when.getDate())} ${pad(
    when.getHours()
  )}:${pad(when.getMinutes())}:${pad(when.getSeconds())}`;
}

export interface DriveLogFile {
  fileName: string;
  content: string;
  /** When the batch was confirmed, for the record and for the UI. */
  confirmedAt: Date;
}

/**
 * Builds the file.
 *
 * Markdown rather than JSON: the point of this log is that a parent can open it
 * on a phone and read it. Each entry keeps the time it actually happened as
 * well as the time it was confirmed, because those are different facts and the
 * gap between them is occasionally the interesting part.
 */
export function buildDriveLog(
  entries: ChangeLogEntry[],
  options: {
    settings?: ParentSettings;
    comment?: string;
    confirmedAt?: Date;
  } = {}
): DriveLogFile {
  const confirmedAt = options.confirmedAt ?? new Date();
  const studentName = options.settings?.studentName?.trim() || 'Student';
  const comment = options.comment?.trim();

  const lines: string[] = [
    `# GCSE Genie — confirmed updates`,
    '',
    `- **Student:** ${studentName}`,
    `- **Confirmed:** ${formatStamp(confirmedAt)}`,
    `- **Updates in this batch:** ${entries.length}`,
  ];

  const days = Array.from(new Set(entries.map((e) => e.date))).sort();
  if (days.length > 0) {
    lines.push(
      `- **Covering:** ${days.length === 1 ? days[0] : `${days[0]} to ${days[days.length - 1]}`}`
    );
  }

  if (comment) lines.push(`- **Note:** ${comment}`);

  lines.push('', '---', '');

  for (const group of groupByCategory(entries)) {
    lines.push(`## ${CATEGORY_ICON[group.category]} ${CATEGORY_LABEL[group.category]}`, '');
    for (const entry of group.entries) {
      const happened = new Date(entry.timestamp);
      lines.push(`- **${formatStamp(happened)}** — ${entry.summary}`);
      if (entry.detail) lines.push(`  - ${entry.detail}`);
      if (entry.actor !== 'STUDENT') lines.push(`  - Logged by: ${entry.actor.toLowerCase()}`);
    }
    lines.push('');
  }

  lines.push(
    '---',
    '',
    '_Written by GCSE Genie when these updates were re-confirmed. Each entry shows the time it_',
    '_happened; the confirmation time is in the header above._'
  );

  return { fileName: driveLogFileName(confirmedAt), content: lines.join('\n'), confirmedAt };
}

/**
 * Hands the file to the browser to save.
 *
 * Returns the filename so the caller can record which file a batch went into -
 * a log entry that names its own file is what makes the folder navigable later.
 */
export function downloadDriveLog(file: DriveLogFile): string {
  const blob = new Blob([file.content], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = file.fileName;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);

  // Revoked on the next tick: revoking synchronously can cancel the download in
  // some browsers before it has read the blob.
  setTimeout(() => URL.revokeObjectURL(url), 1000);

  return file.fileName;
}

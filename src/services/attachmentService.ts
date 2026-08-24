import { db } from '../db';
import { ProofAttachment } from '../types';
import { logAuditEvent } from './auditService';
import { newId } from '../utils/id';

/**
 * A phone photo of a test paper is 3-8 MB. Stored raw, a term of proof would
 * produce a backup JSON too large to open, let alone sync to Drive - so images
 * are downscaled on the way in. 1600px on the long edge keeps handwriting and
 * a marker's red pen legible while landing at roughly 200-400 KB.
 */
const MAX_IMAGE_EDGE = 1600;
const JPEG_QUALITY = 0.72;

/** Anything above this is refused outright rather than silently truncated. */
export const MAX_SOURCE_BYTES = 25 * 1024 * 1024;

/** PDFs and other non-images are stored as-is; only bitmaps can be downscaled. */
function isDownscalableImage(type: string): boolean {
  return /^image\/(jpeg|png|webp|bmp)$/i.test(type);
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Re-encodes an image to fit inside MAX_IMAGE_EDGE. Returns the original file
 * untouched if it is already small enough, if it is not a bitmap, or if the
 * browser cannot decode it - a slightly large attachment is a much better
 * outcome than a lost one.
 */
async function downscaleImage(file: File): Promise<Blob> {
  if (!isDownscalableImage(file.type)) return file;

  try {
    const bitmap = await createImageBitmap(file);
    const longEdge = Math.max(bitmap.width, bitmap.height);

    if (longEdge <= MAX_IMAGE_EDGE && file.size < 600 * 1024) {
      bitmap.close();
      return file;
    }

    const scale = Math.min(1, MAX_IMAGE_EDGE / longEdge);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      bitmap.close();
      return file;
    }

    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY)
    );

    // Keep whichever is smaller - re-encoding a already-compressed screenshot
    // can occasionally come out larger than the source.
    return blob && blob.size < file.size ? blob : file;
  } catch (err) {
    console.warn('Could not downscale image, storing the original:', err);
    return file;
  }
}

export async function addAttachment(
  ownerType: ProofAttachment['ownerType'],
  ownerId: string,
  file: File,
  caption?: string
): Promise<ProofAttachment> {
  if (file.size > MAX_SOURCE_BYTES) {
    throw new Error(
      `"${file.name}" is ${formatBytes(file.size)}. The limit is ${formatBytes(MAX_SOURCE_BYTES)} per file.`
    );
  }

  const blob = await downscaleImage(file);

  const attachment: ProofAttachment = {
    id: newId('att'),
    ownerType,
    ownerId,
    fileName: file.name,
    mimeType: blob.type || file.type || 'application/octet-stream',
    byteSize: blob.size,
    blob,
    caption: caption?.trim() || undefined,
    createdAt: Date.now(),
  };

  await db.attachments.add(attachment);
  await logAuditEvent({
    user: 'STUDENT',
    action: 'INSERT',
    entity: 'ProofAttachment',
    entityId: attachment.id,
    newValue: `${attachment.fileName} (${formatBytes(attachment.byteSize)}) attached to ${ownerType} ${ownerId}`,
  });

  return attachment;
}

export async function getAttachmentsFor(
  ownerType: ProofAttachment['ownerType'],
  ownerId: string
): Promise<ProofAttachment[]> {
  const list = await db.attachments
    .where('[ownerType+ownerId]')
    .equals([ownerType, ownerId])
    .toArray();
  return list.sort((a, b) => a.createdAt - b.createdAt);
}

/**
 * How many files each owner has, in a single query.
 *
 * A per-row count would issue one lookup per topic on every render of the
 * subject checklist, which is a lot of round trips for a badge.
 */
export async function attachmentCountsFor(
  ownerType: ProofAttachment['ownerType'],
  ownerIds: string[]
): Promise<Record<string, number>> {
  if (ownerIds.length === 0) return {};

  const rows = await db.attachments.where('ownerType').equals(ownerType).toArray();
  const wanted = new Set(ownerIds);
  const counts: Record<string, number> = {};
  for (const row of rows) {
    if (wanted.has(row.ownerId)) counts[row.ownerId] = (counts[row.ownerId] || 0) + 1;
  }
  return counts;
}

export async function deleteAttachment(id: string): Promise<void> {
  const existing = await db.attachments.get(id);
  await db.attachments.delete(id);

  await logAuditEvent({
    user: 'STUDENT',
    action: 'DELETE',
    entity: 'ProofAttachment',
    entityId: id,
    oldValue: existing
      ? `${existing.fileName} (${formatBytes(existing.byteSize)}) removed from ${existing.ownerType} ${existing.ownerId}`
      : 'Attachment removed',
  });
}

/** Removes every attachment belonging to a record that is itself being deleted. */
export async function deleteAttachmentsFor(
  ownerType: ProofAttachment['ownerType'],
  ownerId: string
): Promise<number> {
  const owned = await getAttachmentsFor(ownerType, ownerId);
  for (const att of owned) await deleteAttachment(att.id);
  return owned.length;
}

/**
 * Total bytes of stored proof. Surfaced in the Parent Portal so the backup
 * bundle cannot quietly grow past the point of being usable.
 */
export async function totalAttachmentBytes(): Promise<{ count: number; bytes: number }> {
  const all = await db.attachments.toArray();
  return {
    count: all.length,
    bytes: all.reduce((sum, a) => sum + (a.byteSize || 0), 0),
  };
}

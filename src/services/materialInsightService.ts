import { db } from '../db';
import { MaterialInsight, ParentSettings, ProofAttachment } from '../types';
import { askForJson, blobToBase64, liveProvider } from './llmClient';
import { logAuditEvent } from './auditService';
import { sha256 } from '../utils/hash';

/**
 * Reading the handwriting, once per photograph.
 *
 * Everything the app is eventually meant to do with Tejas's material - a
 * revision sheet, a set of mock questions, a summary of what a term actually
 * covered - needs the words on the page, and the page is a JPEG of biro. Genie
 * has never read one. It can show you the photo and tell you it exists, and
 * that is the whole of its relationship with the only content that matters.
 *
 * Two decisions shape this module, and both are about not doing the expensive
 * thing twice:
 *
 * **Read once, keep the text.** A vision call costs real money and takes real
 * seconds. Everything downstream works off `MaterialInsight` rows, which are
 * cheap text - so generating a revision pack ten times does not re-send ten
 * photographs.
 *
 * **Key the row to the file's content, not to its id.** `${attachmentId}__${hash}`
 * means a re-photographed page is a new row rather than an old row quietly
 * describing a picture that no longer exists. It also makes the whole thing
 * idempotent: running the batch twice reads nothing twice.
 */

/**
 * What the model is asked to return. `additionalProperties: false` on every
 * object is required by the structured-output API, and every field is required
 * because an optional field is one the model can quietly decline to fill.
 */
const INSIGHT_SCHEMA = {
  type: 'object',
  properties: {
    suggestedTopicTitle: {
      type: 'string',
      description: 'The GCSE topic this page is about, in exam-syllabus wording. Empty if unclear.',
    },
    specPoints: {
      type: 'array',
      items: { type: 'string' },
      description: 'Specification points named on the page. Empty if none are named.',
    },
    definitions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          term: { type: 'string' },
          meaning: { type: 'string' },
        },
        required: ['term', 'meaning'],
        additionalProperties: false,
      },
    },
    keyFacts: {
      type: 'array',
      items: { type: 'string' },
      description: 'Facts, rules and relationships stated on the page, in its own terms.',
    },
    workedExamples: {
      type: 'array',
      items: { type: 'string' },
      description: 'Worked examples or problems shown, with their working where it is legible.',
    },
    legibility: { type: 'string', enum: ['CLEAR', 'PARTIAL', 'UNREADABLE'] },
    unreadableNote: {
      type: 'string',
      description: 'What could not be read, when legibility is PARTIAL or UNREADABLE. Empty otherwise.',
    },
  },
  required: [
    'suggestedTopicTitle',
    'specPoints',
    'definitions',
    'keyFacts',
    'workedExamples',
    'legibility',
    'unreadableNote',
  ],
  additionalProperties: false,
} as const;

/**
 * The instruction, and the one rule that matters in it.
 *
 * "Do not infer, complete or correct" is not politeness. A model handed a
 * half-legible page of Chemistry will cheerfully supply the rest of the topic
 * from what it knows, and the result is a revision sheet built on facts Tejas
 * never wrote - which is worse than a thin one, because nobody can tell the
 * difference later. The same reason `legibility` is a real answer rather than
 * an error: a page that cannot be read has to be allowed to say so.
 */
function promptFor(attachment: ProofAttachment, subjectName?: string): string {
  return [
    'This is a photograph of a GCSE student\'s own schoolwork - usually handwritten notes,',
    'homework, or a page from an exercise book.',
    subjectName ? `It is filed under ${subjectName}.` : '',
    attachment.caption ? `It has been described as: "${attachment.caption}".` : '',
    '',
    'Transcribe and structure only what is actually on the page.',
    '',
    'Do not infer, complete or correct the content. If a definition is half-written, record',
    'the half that is there. If the page is too faint or blurred to read, say so in',
    'legibility and return empty lists - an empty answer is useful and an invented one is not,',
    'because this will be used to build revision material and mock questions that the student',
    'will be told came from their own notes.',
  ]
    .filter(Boolean)
    .join('\n');
}

export function insightId(attachmentId: string, contentHash: string): string {
  return `${attachmentId}__${contentHash}`;
}

/**
 * A fingerprint of the file itself.
 *
 * Bytes rather than metadata: a photo re-taken of the same worksheet has a new
 * name and a new timestamp and is a different picture, and a photo that has
 * merely been re-captioned is the same picture and must not be paid for twice.
 */
export async function contentHash(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  // Latin-1 round-trips bytes through the string `sha256` takes without the
  // lossy substitutions a UTF-8 decode would make.
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return (await sha256(binary)).slice(0, 16);
}

interface RawInsight {
  suggestedTopicTitle: string;
  specPoints: string[];
  definitions: { term: string; meaning: string }[];
  keyFacts: string[];
  workedExamples: string[];
  legibility: MaterialInsight['legibility'];
  unreadableNote: string;
}

/**
 * Reads one file, and writes what it read.
 *
 * Images only. A PDF would need a different content block on all three
 * providers and there are none in this family's data; refusing is better than
 * sending one and storing whatever came back.
 */
export async function extractInsight(
  attachment: ProofAttachment,
  settings: ParentSettings,
  subjectName?: string
): Promise<MaterialInsight> {
  if (!attachment.mimeType.startsWith('image/')) {
    throw new Error(`${attachment.fileName} is not an image, so there is nothing to read.`);
  }

  const hash = await contentHash(attachment.blob);
  const id = insightId(attachment.id, hash);

  const existing = await db.materialInsights.get(id);
  if (existing) return existing;

  const { data, provider, model } = await askForJson<RawInsight>({
    settings,
    prompt: promptFor(attachment, subjectName),
    image: {
      mimeType: attachment.mimeType,
      base64: await blobToBase64(attachment.blob),
    },
    schema: INSIGHT_SCHEMA as unknown as Record<string, unknown>,
    maxTokens: 4000,
  });

  const insight: MaterialInsight = {
    id,
    attachmentId: attachment.id,
    contentHash: hash,
    subjectId: undefined,
    suggestedTopicTitle: data.suggestedTopicTitle?.trim() || undefined,
    specPoints: data.specPoints ?? [],
    definitions: data.definitions ?? [],
    keyFacts: data.keyFacts ?? [],
    workedExamples: data.workedExamples ?? [],
    legibility: data.legibility ?? 'PARTIAL',
    unreadableNote: data.unreadableNote?.trim() || undefined,
    model,
    provider,
    extractedAt: Date.now(),
  };

  await db.materialInsights.put(insight);
  await logAuditEvent({
    user: 'PARENT',
    action: 'UPDATE',
    entity: 'MaterialInsight',
    entityId: id,
    newValue: `${attachment.fileName} read by ${provider} (${model}) - ${insight.legibility}`,
  });

  return insight;
}

/** Files that have never been read, oldest first so a backlog clears in order. */
export async function pendingExtraction(): Promise<ProofAttachment[]> {
  const [attachments, insights] = await Promise.all([
    db.attachments.toArray(),
    db.materialInsights.toArray(),
  ]);

  const read = new Set(insights.map((i) => i.attachmentId));
  return attachments
    .filter((a) => a.mimeType.startsWith('image/') && !read.has(a.id))
    .sort((a, b) => a.createdAt - b.createdAt);
}

export interface ExtractionOutcome {
  attempted: number;
  read: number;
  unreadable: number;
  failed: number;
  errors: string[];
}

/**
 * Reads everything outstanding, up to a limit.
 *
 * Never throws, and follows `mirrorPendingAttachments` in that deliberately:
 * one unreadable file must not stop the other nine, and a failure belongs on
 * screen rather than in a retry loop nobody can see. The limit exists because
 * every item costs money - a batch that quietly read two hundred photographs
 * because somebody restored a backup is not a feature.
 */
export async function extractPending(
  settings: ParentSettings,
  limit = 20,
  subjectNameFor?: (attachment: ProofAttachment) => string | undefined
): Promise<ExtractionOutcome> {
  const outcome: ExtractionOutcome = {
    attempted: 0,
    read: 0,
    unreadable: 0,
    failed: 0,
    errors: [],
  };

  const { provider, reason } = liveProvider(settings);
  if (!provider) {
    if (reason) outcome.errors.push(reason);
    return outcome;
  }

  const queue = (await pendingExtraction()).slice(0, limit);

  for (const attachment of queue) {
    outcome.attempted += 1;
    try {
      const insight = await extractInsight(attachment, settings, subjectNameFor?.(attachment));
      if (insight.legibility === 'UNREADABLE') outcome.unreadable += 1;
      else outcome.read += 1;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      outcome.failed += 1;
      if (!outcome.errors.includes(message)) outcome.errors.push(message);
    }
  }

  return outcome;
}

export interface InsightStatus {
  images: number;
  read: number;
  unreadable: number;
  pending: number;
}

/** How much of the material has actually been read. Shown before spending anything. */
export async function insightStatus(): Promise<InsightStatus> {
  const [attachments, insights] = await Promise.all([
    db.attachments.toArray(),
    db.materialInsights.toArray(),
  ]);

  const images = attachments.filter((a) => a.mimeType.startsWith('image/'));
  const read = new Set(insights.map((i) => i.attachmentId));

  return {
    images: images.length,
    read: insights.length,
    unreadable: insights.filter((i) => i.legibility === 'UNREADABLE').length,
    pending: images.filter((a) => !read.has(a.id)).length,
  };
}

export async function insightFor(attachmentId: string): Promise<MaterialInsight | undefined> {
  const rows = await db.materialInsights.where('attachmentId').equals(attachmentId).toArray();
  // Newest wins: an older row describes a photo that has since been replaced.
  return rows.sort((a, b) => b.extractedAt - a.extractedAt)[0];
}

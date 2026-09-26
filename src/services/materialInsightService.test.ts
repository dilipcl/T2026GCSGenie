import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { db } from '../db';
import { emptyDatabase } from '../test/harness';
import { ParentSettings, ProofAttachment } from '../types';
import {
  contentHash,
  extractInsight,
  extractPending,
  insightFor,
  insightId,
  insightStatus,
  pendingExtraction,
} from './materialInsightService';

/**
 * Every test here stubs `fetch`. Nothing in this suite may reach a provider:
 * these calls cost money, and a test that silently spends it is a test nobody
 * can run in CI.
 */

const settings = {
  id: 'active_settings',
  studentName: 'Tejas',
  llmProvider: 'CLAUDE',
  llmApiKey: 'sk-test',
} as unknown as ParentSettings;

function photo(overrides: Partial<ProofAttachment> = {}): ProofAttachment {
  return {
    id: 'att_crude',
    ownerType: 'TASK',
    ownerId: 'task_crude',
    fileName: 'crude-oil-notes.jpg',
    mimeType: 'image/jpeg',
    byteSize: 12,
    blob: new Blob(['crude oil notes'], { type: 'image/jpeg' }),
    createdAt: new Date('2026-09-10T20:15:00').getTime(),
    ...overrides,
  };
}

/** A well-formed Anthropic response carrying the JSON the schema asked for. */
function claudeReply(body: Record<string, unknown>) {
  return {
    ok: true,
    json: async () => ({ content: [{ type: 'text', text: JSON.stringify(body) }] }),
  } as Response;
}

const GOOD_ANSWER = {
  suggestedTopicTitle: 'Crude oil and fractional distillation',
  specPoints: ['C9.1 Hydrocarbons'],
  definitions: [{ term: 'Viscosity', meaning: 'Resistance to flow.' }],
  keyFacts: ['Longer chains are more viscous.'],
  workedExamples: [],
  legibility: 'CLEAR',
  unreadableNote: '',
};

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(async () => {
  await emptyDatabase();
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('reading one photograph', () => {
  it('sends the image and a schema, and stores what came back', async () => {
    fetchMock.mockResolvedValue(claudeReply(GOOD_ANSWER));
    const attachment = photo();

    const insight = await extractInsight(attachment, settings, 'Chemistry');

    const [url, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init.body);

    expect(url).toBe('https://api.anthropic.com/v1/messages');
    expect(init.headers['anthropic-dangerous-direct-browser-access']).toBe('true');
    expect(body.model).toBe('claude-opus-5');

    // The image goes first and the instruction second, and the schema
    // constrains generation rather than asking politely for a shape.
    expect(body.messages[0].content[0].type).toBe('image');
    expect(body.messages[0].content[0].source.media_type).toBe('image/jpeg');
    expect(body.output_config.format.type).toBe('json_schema');
    expect(body.output_config.format.schema.additionalProperties).toBe(false);

    expect(insight.keyFacts).toEqual(['Longer chains are more viscous.']);
    expect(insight.legibility).toBe('CLEAR');
    expect(await db.materialInsights.get(insight.id)).toBeTruthy();
  });

  /**
   * The id is built from the file's bytes, so running the batch twice reads
   * nothing twice. A random id would pay for every photograph again after an
   * offline merge, and would look like a sync fault rather than the modelling
   * mistake it is.
   */
  it('never pays to read the same file twice', async () => {
    fetchMock.mockResolvedValue(claudeReply(GOOD_ANSWER));
    const attachment = photo();

    const first = await extractInsight(attachment, settings);
    const second = await extractInsight(attachment, settings);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(second.id).toBe(first.id);
    expect(first.id).toBe(insightId('att_crude', await contentHash(attachment.blob)));
  });

  it('reads a replaced photo again, rather than describing the old one', async () => {
    fetchMock.mockResolvedValue(claudeReply(GOOD_ANSWER));

    await extractInsight(photo(), settings);
    await extractInsight(
      photo({ blob: new Blob(['a different page entirely'], { type: 'image/jpeg' }) }),
      settings
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(await db.materialInsights.count()).toBe(2);
  });

  it('keeps an unreadable page as an answer rather than an error', async () => {
    fetchMock.mockResolvedValue(
      claudeReply({
        ...GOOD_ANSWER,
        keyFacts: [],
        definitions: [],
        legibility: 'UNREADABLE',
        unreadableNote: 'Too blurred to read past the first line.',
      })
    );

    const insight = await extractInsight(photo(), settings);

    // Nothing invented, and the reason on the record. A model that fills in the
    // rest of the topic from general knowledge produces revision material the
    // student is told came from their own notes.
    expect(insight.legibility).toBe('UNREADABLE');
    expect(insight.keyFacts).toEqual([]);
    expect(insight.unreadableNote).toContain('blurred');
  });

  it('refuses a PDF rather than sending it and storing the reply', async () => {
    await expect(
      extractInsight(photo({ mimeType: 'application/pdf' }), settings)
    ).rejects.toThrow(/not an image/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('says which key is wrong rather than throwing a bare status', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: { message: 'invalid x-api-key' } }),
    } as Response);

    await expect(extractInsight(photo(), settings)).rejects.toThrow(/rejected the API key/);
  });
});

describe('reading a backlog', () => {
  it('does nothing, and says why, when no key is saved on this device', async () => {
    await db.attachments.add(photo());

    const outcome = await extractPending({ ...settings, llmApiKey: '' }, 10);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(outcome.attempted).toBe(0);
    expect(outcome.errors[0]).toMatch(/no API key is saved/i);
  });

  it('one unreadable file does not stop the rest', async () => {
    await db.attachments.add(photo({ id: 'att_1', blob: new Blob(['one']) }));
    await db.attachments.add(photo({ id: 'att_2', blob: new Blob(['two']) }));
    await db.attachments.add(photo({ id: 'att_3', blob: new Blob(['three']) }));

    fetchMock
      .mockResolvedValueOnce(claudeReply(GOOD_ANSWER))
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        json: async () => ({ error: { message: 'slow down' } }),
      } as Response)
      .mockResolvedValueOnce(claudeReply(GOOD_ANSWER));

    const outcome = await extractPending(settings, 10);

    expect(outcome.attempted).toBe(3);
    expect(outcome.read).toBe(2);
    expect(outcome.failed).toBe(1);
    expect(outcome.errors[0]).toMatch(/rate limit/i);
  });

  it('stops at the limit, because every item costs money', async () => {
    for (let i = 0; i < 5; i++) {
      await db.attachments.add(photo({ id: `att_${i}`, blob: new Blob([`page ${i}`]) }));
    }
    fetchMock.mockResolvedValue(claudeReply(GOOD_ANSWER));

    const outcome = await extractPending(settings, 2);

    expect(outcome.attempted).toBe(2);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('leaves non-images out of the queue entirely', async () => {
    await db.attachments.add(photo({ id: 'att_pdf', mimeType: 'application/pdf' }));
    await db.attachments.add(photo({ id: 'att_jpg' }));

    expect((await pendingExtraction()).map((a) => a.id)).toEqual(['att_jpg']);
  });

  it('reports how much of the material has been read', async () => {
    await db.attachments.add(photo({ id: 'att_1', blob: new Blob(['one']) }));
    await db.attachments.add(photo({ id: 'att_2', blob: new Blob(['two']) }));
    fetchMock.mockResolvedValue(claudeReply(GOOD_ANSWER));

    await extractPending(settings, 1);

    expect(await insightStatus()).toEqual({
      images: 2,
      read: 1,
      unreadable: 0,
      pending: 1,
    });
  });
});

describe('looking one up', () => {
  it('returns the newest reading, not the one describing the old photo', async () => {
    fetchMock.mockResolvedValue(claudeReply(GOOD_ANSWER));

    await extractInsight(photo(), settings);
    await extractInsight(
      photo({ blob: new Blob(['rephotographed'], { type: 'image/jpeg' }) }),
      settings
    );

    const rows = await db.materialInsights.where('attachmentId').equals('att_crude').toArray();
    const newest = rows.sort((a, b) => b.extractedAt - a.extractedAt)[0];

    expect((await insightFor('att_crude'))?.id).toBe(newest.id);
  });
});

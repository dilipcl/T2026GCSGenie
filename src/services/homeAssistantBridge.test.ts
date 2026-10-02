import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import 'fake-indexeddb/auto';
import { briefToForm, isWebhookUrl, pushWeekBrief, readWeekBrief, WeekBrief } from './homeAssistantBridge';
import { readWeekHealth } from './weekHealth';
import { resetDatabase } from '../test/harness';

const brief: WeekBrief = {
  score: 43,
  status: 'Red',
  headline: 'Effort against your goals and goals at risk both need attention.',
  concerns: 'Effort; Goals at risk',
  goalsNeedAction: 6,
  pendingUpdates: 2,
  streak: 0,
  streakAtRisk: false,
  checkedInToday: false,
  weekLabel: '28 Sep – 4 Oct',
};

const HOOK = 'https://abc.ui.nabu.casa/api/webhook/genie-week-x1';

describe('isWebhookUrl', () => {
  it('accepts an https Home Assistant webhook', () => {
    expect(isWebhookUrl(HOOK)).toBe(true);
  });

  /** http would be refused as mixed content from github.io, silently. */
  it('refuses plain http, other paths and junk', () => {
    expect(isWebhookUrl('http://homeassistant.local/api/webhook/x')).toBe(false);
    expect(isWebhookUrl('https://abc.ui.nabu.casa/lovelace/0')).toBe(false);
    expect(isWebhookUrl('not a url')).toBe(false);
    expect(isWebhookUrl(undefined)).toBe(false);
  });
});

describe('briefToForm', () => {
  /** The automation reads these exact names from trigger.data. */
  it('uses the field names the Home Assistant automation reads', () => {
    const form = briefToForm(brief);
    expect(Object.fromEntries(form)).toEqual({
      score: '43',
      status: 'Red',
      headline: brief.headline,
      concerns: 'Effort; Goals at risk',
      goals_need_action: '6',
      pending_updates: '2',
      streak: '0',
      streak_at_risk: 'no',
      checked_in_today: 'no',
      week_label: '28 Sep – 4 Oct',
    });
  });

  /** input_text in Home Assistant stops at 255 characters and rejects the rest. */
  it('keeps text fields inside an input_text', () => {
    const form = briefToForm({ ...brief, headline: 'x'.repeat(400) });
    expect(form.get('headline')!.length).toBeLessThanOrEqual(255);
  });
});

describe('pushWeekBrief', () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  /** A JSON body would trigger a CORS preflight the webhook never answers. */
  it('posts a form body without a preflight', async () => {
    fetchMock.mockResolvedValue(new Response(null));
    expect(await pushWeekBrief(HOOK, brief)).toBe(true);
    const [, init] = fetchMock.mock.calls[0];
    expect(init.mode).toBe('no-cors');
    expect(init.body).toBeInstanceOf(URLSearchParams);
  });

  it('sends nothing to a URL that is not a webhook', async () => {
    expect(await pushWeekBrief('', brief)).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('never throws when the hub is unreachable', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(await pushWeekBrief(HOOK, brief)).toBe(false);
  });
});

describe('readWeekBrief', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  /** One answer to "how is the week": the card's, not a second calculation. */
  it('reports the same score and colour as the week health card', async () => {
    const [b, health] = await Promise.all([readWeekBrief(), readWeekHealth()]);
    expect(b.score).toBe(health.score);
    expect(b.status.toUpperCase()).toBe(health.status);
  });
});

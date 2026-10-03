import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import 'fake-indexeddb/auto';
import { briefToForm, createBriefSender, isWebhookUrl, pushWeekBrief, readWeekBrief, WeekBrief } from './homeAssistantBridge';
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

describe('createBriefSender', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function harness(pullResult = true) {
    const sender = { current: null as ReturnType<typeof createBriefSender> | null };
    const deps = {
      // A real pull moves the sync state through pushing, pulling and in-sync,
      // and each move re-runs the hook's effect - which calls request again.
      pulled: vi.fn(async () => {
        sender.current!.request(HOOK, brief);
        sender.current!.request(HOOK, brief);
        sender.current!.request(HOOK, brief);
        return pullResult;
      }),
      read: vi.fn(async () => brief),
      push: vi.fn(async (url: string) => url.length > 0),
    };
    sender.current = createBriefSender(deps, 4_000);
    return { sender: sender.current, deps };
  }

  /**
   * The shipped hook cancelled its own send whenever the sync state moved, and
   * its own pull moved it: a full sync every few seconds and nothing ever sent.
   */
  it('sends once, and does not pull again, when its own pull moves the sync state', async () => {
    const { sender, deps } = harness();
    sender.request(HOOK, brief);
    await vi.advanceTimersByTimeAsync(60_000);

    expect(deps.pulled).toHaveBeenCalledTimes(1);
    expect(deps.push).toHaveBeenCalledTimes(1);

    sender.request(HOOK, brief);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(deps.pulled).toHaveBeenCalledTimes(1);
  });

  it('waits for a burst of changes to settle before sending', async () => {
    const { sender, deps } = harness();
    sender.request(HOOK, brief);
    await vi.advanceTimersByTimeAsync(2_000);
    sender.request(HOOK, { ...brief, score: 44 });
    await vi.advanceTimersByTimeAsync(2_000);
    expect(deps.pulled).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(2_000);
    expect(deps.push).toHaveBeenCalledTimes(1);
  });

  /** A pull that does not land must not be retried by the movement of the next one. */
  it('backs off after a pull that does not land', async () => {
    const { sender, deps } = harness(false);
    sender.request(HOOK, brief);
    await vi.advanceTimersByTimeAsync(60_000);
    sender.request(HOOK, brief);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(deps.pulled).toHaveBeenCalledTimes(1);
    expect(deps.push).not.toHaveBeenCalled();

    sender.forgetFailure();
    sender.request(HOOK, brief);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(deps.pulled).toHaveBeenCalledTimes(2);
  });

  it('sends to a new hub link even when the week has not changed', async () => {
    const { sender, deps } = harness();
    sender.request(HOOK, brief);
    await vi.advanceTimersByTimeAsync(5_000);
    sender.request(`${HOOK}-new`, brief);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(deps.push).toHaveBeenCalledTimes(2);
    expect(deps.push.mock.calls[1][0]).toBe(`${HOOK}-new`);
  });

  it('resends the same week on the half-hourly forget', async () => {
    const { sender, deps } = harness();
    sender.request(HOOK, brief);
    await vi.advanceTimersByTimeAsync(5_000);
    sender.forget();
    sender.request(HOOK, brief);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(deps.push).toHaveBeenCalledTimes(2);
  });

  it('sends nothing once a pending send is cancelled', async () => {
    const { sender, deps } = harness();
    sender.request(HOOK, brief);
    sender.cancelPending();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(deps.pulled).not.toHaveBeenCalled();
  });
});

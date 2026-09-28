import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

/**
 * Saving a check-in commits once.
 *
 * It committed about eight times - the check-in, each attendance answer, each
 * piece of work closed, an audit line after every one - and every commit woke
 * every live query on Home, so the dashboard re-read and re-rendered between
 * each write and the next. At an eighth of a laptop's speed the save sat on
 * "Saving..." for ten seconds; the e2e suite met it three times under parallel
 * load before anyone looked at what it was waiting for. One transaction halved
 * that and made a half-finished save impossible.
 *
 * Nothing breaks when a write is moved back out of the transaction - the save
 * still works, just slower on exactly the phone nobody tests on. So the order
 * is checked against the source: every write the save makes has to come after
 * the transaction opens and before it closes.
 */

const PATH = 'src/components/dashboard/DailyCheckInModal.tsx';

function applyCheckInBody(): string {
  const source = readFileSync(PATH, 'utf8');
  const start = source.indexOf('const applyCheckIn = async');
  expect(start, 'applyCheckIn has moved - move this guard with it').toBeGreaterThan(-1);
  const end = source.indexOf('triggerCelebration();', start);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe('saving a check-in', () => {
  it('makes every write inside one transaction', () => {
    const body = applyCheckInBody();
    const opened = body.indexOf('db.transaction(');
    expect(opened, 'the save no longer opens a transaction').toBeGreaterThan(-1);

    const writes = [
      'db.checkIns.add(',
      'confirmAttendance(',
      'setTaskCompleted(',
      'db.tasks.bulkAdd(',
      'logAuditEvent(',
    ];
    for (const write of writes) {
      const at = body.indexOf(write);
      expect(at, `${write} is no longer in the save - update this list`).toBeGreaterThan(-1);
      expect(at, `${write} runs before the transaction opens`).toBeGreaterThan(opened);
    }
  });
});

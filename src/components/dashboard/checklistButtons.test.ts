import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

/**
 * Every button in the day checklist must say it is a button.
 *
 * The checklist renders inside the check-in modal's `<form>`, and a `<button>`
 * with no `type` is a submit button. So the first tap on "Done" did not record
 * that lesson - it submitted and closed the whole check-in, throwing away the
 * rest of the day and the answers that had not been given yet.
 *
 * Nothing in the type system can see this, it is restored by deleting eleven
 * characters, and the symptom looks like a save that worked. Checked against the
 * source, as the layer tests are, because the alternative is finding out from
 * Tejas again.
 */

const source = readFileSync('src/components/dashboard/DayOccurrenceChecklist.tsx', 'utf8');

describe('the day checklist', () => {
  it('declares a type on every button', () => {
    const buttons = source.match(/<button\b[\s\S]*?>/g) ?? [];

    expect(buttons.length).toBeGreaterThan(0);
    for (const button of buttons) {
      expect(button).toMatch(/type="button"/);
    }
  });

  it('never renders a submit button', () => {
    expect(source).not.toMatch(/type="submit"/);
  });
});

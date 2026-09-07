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

/**
 * Both files that render inside that form.
 *
 * The buttons themselves moved into `OccurrenceAnswer` when the home screen
 * started using them too, and this guard follows them - a check still pointed
 * at the file the risk used to live in is worse than no check, because it goes
 * on passing. The checklist stays in the list: it is still inside the form, and
 * a button added back to it would carry the same fault.
 */
const SOURCES = [
  'src/components/dashboard/OccurrenceAnswer.tsx',
  'src/components/dashboard/DayOccurrenceChecklist.tsx',
];

const BUTTON_TAG = /<button\b[\s\S]*?>/g;

describe('the day checklist', () => {
  it('declares a type on every button', () => {
    let seen = 0;

    for (const path of SOURCES) {
      const source = readFileSync(path, 'utf8');
      for (const button of source.match(BUTTON_TAG) ?? []) {
        seen += 1;
        expect(button, `${path}: ${button}`).toMatch(/type="button"/);
      }
    }

    // The buttons have to be somewhere. If this ever reads zero they have moved
    // again, and the guard is watching an empty room.
    expect(seen).toBeGreaterThan(0);
  });

  it('never renders a submit button', () => {
    for (const path of SOURCES) {
      expect(readFileSync(path, 'utf8'), path).not.toMatch(/type="submit"/);
    }
  });
});

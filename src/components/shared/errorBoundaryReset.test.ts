import { describe, it, expect } from 'vitest';
import { sameKeys } from './ErrorBoundary';

/**
 * The reset rule, stated as cases. A boundary holds its error while its reset
 * keys are unchanged and drops it the moment they move - so closing the dialog
 * that failed, or switching to another tab, is a fresh attempt.
 */
describe('when a boundary lets go of an error', () => {
  it('holds while the keys are unchanged', () => {
    expect(sameKeys([true], [true])).toBe(true);
    expect(sameKeys(['DASHBOARD'], ['DASHBOARD'])).toBe(true);
  });

  it('holds across the new array JSX builds on every render', () => {
    // `resetKeys={[activeTab]}` is a different array each time; comparing by
    // identity would clear the error on the very next render and flash the
    // fallback away before anyone could read it.
    expect(sameKeys(['GOALS'], ['GOALS'])).toBe(true);
  });

  it('releases when a key changes', () => {
    expect(sameKeys([true], [false])).toBe(false);
    expect(sameKeys(['DASHBOARD'], ['PLAN'])).toBe(false);
  });

  it('releases on the first render after mounting, when there is nothing to compare', () => {
    expect(sameKeys(undefined, [false])).toBe(false);
  });

  it('treats a different number of keys as a change', () => {
    expect(sameKeys([true], [true, 'PLAN'])).toBe(false);
  });

  it('matches a boundary that was given no keys at all', () => {
    // Nothing to move on, so the only way out is the button.
    expect(sameKeys(undefined, undefined)).toBe(true);
  });

  it('compares NaN as unchanged rather than as a perpetual reset', () => {
    // `===` would call these different on every render and reset forever.
    expect(sameKeys([NaN], [NaN])).toBe(true);
  });
});

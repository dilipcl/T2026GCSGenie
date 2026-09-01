import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

/**
 * A hook called below an early return is a hook that runs only sometimes.
 *
 * `DailyCheckInModal` minted its check-in id with `useMemo` underneath
 * `if (!isOpen) return null`. While the dialog was shut that hook never ran, so
 * opening it changed the hook count and React tore down the entire app instead
 * of showing the check-in. Nothing caught it: it type-checks, it builds, and
 * every service test passes, because the fault only exists once the component
 * is rendered twice with different props.
 *
 * The whole class is cheap to catch by reading the source, so this does that
 * rather than pulling in a DOM and rendering each screen.
 */

const HOOK = /^ {2}(?:const .*?= )?(?:React\.)?use[A-Z]/;
/** A top-level declaration ends the previous component and starts the next. */
const DECL = /^(?:export )?(?:const|function) [A-Za-z]/;
/** `return (` opens the JSX a component ends with; anything else at this indent leaves early. */
const EARLY_RETURN = /^ {2}(?:if \(.*\) )?return\b/;

function tsxFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return tsxFiles(full);
    return full.endsWith('.tsx') ? [full] : [];
  });
}

function hooksAfterEarlyReturn(file: string): string[] {
  const lines = readFileSync(file, 'utf8').split('\n');
  const starts = lines.flatMap((line, i) => (DECL.test(line) ? [i] : []));
  starts.push(lines.length);

  const offences: string[] = [];
  for (let b = 0; b < starts.length - 1; b++) {
    const body = lines.slice(starts[b], starts[b + 1]);
    const exit = body.findIndex(
      (line) => EARLY_RETURN.test(line) && !line.includes('return (')
    );
    if (exit === -1) continue;

    for (let i = exit + 1; i < body.length; i++) {
      if (HOOK.test(body[i])) {
        offences.push(`${file}:${starts[b] + i + 1} — ${body[i].trim()}`);
      }
    }
  }
  return offences;
}

describe('hooks are never called conditionally', () => {
  it('no component calls a hook below an early return', () => {
    const offences = tsxFiles('src').flatMap(hooksAfterEarlyReturn);
    expect(offences).toEqual([]);
  });

  it('recognises the shape it is guarding against', () => {
    // Guards the guard: if the detector silently stopped matching, the test
    // above would pass for the wrong reason.
    const lines = [
      'export const Modal: React.FC = ({ isOpen }) => {',
      '  if (!isOpen) return null;',
      '  const id = React.useMemo(() => 1, []);',
      '  return (<div />);',
      '};',
    ].join('\n');
    const exit = lines.split('\n').findIndex((l) => EARLY_RETURN.test(l) && !l.includes('return ('));
    expect(exit).toBe(1);
    expect(HOOK.test(lines.split('\n')[2])).toBe(true);
  });
});

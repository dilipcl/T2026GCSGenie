import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

/**
 * Stacking bugs are invisible to the type checker and to every test that does
 * not paint pixels, and they regress by a one-character edit. These are the
 * numeric invariants behind the layer table in `styles/index.css`, checked
 * against the source rather than against a rendered page.
 *
 * Both of the faults below shipped:
 *
 *  - The desktop bar carries `backdrop-blur`, which makes it a stacking
 *    context. The More dropdown inside it therefore cannot rise above anything
 *    the bar itself is behind, whatever `z-50` on the menu suggests - so the
 *    cards below it, and the add button, painted over the open menu.
 *  - The mobile More sheet and the bottom bar were both `z-40`. A tie goes to
 *    document order, and the bar is written second, so it covered the sheet.
 */

const nav = readFileSync('src/components/layout/Navigation.tsx', 'utf8');
const header = readFileSync('src/components/layout/Header.tsx', 'utf8');
const app = readFileSync('src/App.tsx', 'utf8');

/** The z-index on the one element whose classes contain every marker. */
function layerOf(source: string, ...markers: string[]): number {
  const line = source
    .split('\n')
    .find((l) => l.includes('className') && markers.every((m) => l.includes(m)));
  if (!line) throw new Error(`no element matching ${markers.join(' + ')}`);

  const match = line.match(/\bz-\[(\d+)\]|\bz-(\d+)\b/);
  if (!match) throw new Error(`no z-index on the element matching ${markers.join(' + ')}`);
  return Number(match[1] ?? match[2]);
}

const desktopNav = () => layerOf(nav, '<nav', 'md:flex', 'backdrop-blur-md');
const mobileSheet = () => layerOf(nav, 'md:hidden fixed inset-0', 'justify-end');
const bottomBar = () => layerOf(nav, 'md:hidden fixed bottom-0');
const stickyHeader = () => layerOf(header, '<header', 'sticky top-0');
const addButton = () => layerOf(app, 'fixed right-4', 'rounded-full');

describe('the nav sits at the depth its menus need', () => {
  it('opens the mobile sheet above the bar it opens from', () => {
    // The tie that shipped. Strictly greater, because equal is what broke it.
    expect(mobileSheet()).toBeGreaterThan(bottomBar());
  });

  it('gives the desktop bar a stacking position of its own', () => {
    // `z-index` is ignored on a static element, so the lift needs `relative`
    // to mean anything at all.
    const line = nav.split('\n').find((l) => l.includes('<nav') && l.includes('md:flex'))!;
    expect(line).toContain('relative');
    expect(desktopNav()).toBeGreaterThan(0);
  });

  it('lifts the desktop bar over the content and the add button', () => {
    // The dropdown can only reach as high as the bar that contains it.
    expect(desktopNav()).toBeGreaterThan(addButton());
  });

  it('keeps the desktop bar under the sticky header', () => {
    // The bar scrolls up beneath the header; the header stays in front.
    expect(desktopNav()).toBeLessThan(stickyHeader());
  });

  it('reads real numbers, not an empty match', () => {
    // Guards the parser: if `layerOf` stopped finding elements it would throw,
    // but a silently-zero result would make every comparison above meaningless.
    for (const layer of [desktopNav, mobileSheet, bottomBar, stickyHeader, addButton]) {
      expect(layer()).toBeGreaterThan(0);
    }
  });
});

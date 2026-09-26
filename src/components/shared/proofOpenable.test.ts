import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

/**
 * A photograph of Tejas's work must be openable from every screen that lists it.
 *
 * This is the fault he reported as not being able to click the proof he had
 * uploaded, and it had shipped three times over - `ActivityView`, `RecordView`
 * and `EvidenceCheck` each grew their own chip, and all three concluded that a
 * file with no `driveViewUrl` should render as grey text you cannot click. The
 * reasoning was sound and the premise was wrong: the file is a blob in this
 * device's database, the uploader had been opening it since the day it was
 * written, and what the reading screens were missing was an id, not a link.
 *
 * Guarded by reading the source because nothing else can see it. The fault type
 * checks, it builds, every service test passes, and the screen looks
 * deliberate - it says "on device only" in a considered grey. The only way to
 * find out is for somebody to try to tap it.
 *
 * If these files stop rendering material, delete the guard rather than leaving
 * it pointed at an empty room - a guard that passes because there is nothing
 * left to check is worse than none.
 */

/** Every screen that lists somebody else's captured material for reading. */
const READERS = [
  'src/components/updates/ActivityView.tsx',
  'src/components/updates/EvidenceCheck.tsx',
  'src/components/record/RecordView.tsx',
];

const CHIP = 'src/components/shared/MaterialLink.tsx';
const VIEWER = 'src/components/shared/MaterialViewer.tsx';

describe('captured material', () => {
  it('is rendered through the shared chip on every reading screen', () => {
    for (const path of READERS) {
      expect(readFileSync(path, 'utf8'), path).toMatch(
        /import \{[^}]*MaterialLink[^}]*\} from '\.\.\/shared\/MaterialLink'/
      );
    }
  });

  /**
   * The icon is the tell. A screen that draws its own paperclip has its own
   * chip, and a local chip is what all three regressions looked like - it is
   * indistinguishable from the shared one until the day somebody taps it.
   */
  it('is never drawn by a screen that rolled its own chip', () => {
    for (const path of READERS) {
      expect(readFileSync(path, 'utf8'), path).not.toMatch(/\bPaperclip\b/);
    }
  });

  it('opens the stored file rather than only a Drive link', () => {
    const chip = readFileSync(CHIP, 'utf8');

    // The blob is read by id and handed to the viewer. Were this to become a
    // check on `driveViewUrl` again, every photo taken on a device without the
    // Drive API would go back to being unopenable.
    expect(chip).toMatch(/getAttachment\(attachmentId\)/);
    expect(chip).toMatch(/MaterialViewer/);
    expect(readFileSync(VIEWER, 'utf8')).toMatch(/openAttachmentInNewTab/);
  });

  /**
   * The chip must never open a window itself.
   *
   * Its click handler awaits the database read before it knows what it has, and
   * a browser only treats `window.open` as user-initiated inside the
   * *synchronous* part of a click. After an await it is a popup and it is
   * blocked silently - so a PDF, or any file whose type the app did not
   * recognise as an image, did nothing at all when tapped. Which is the exact
   * fault this component was written to fix, reintroduced one layer down.
   */
  it('never opens a window from a handler that has already awaited', () => {
    // The call, not the word - the comment above the fix names it too.
    expect(readFileSync(CHIP, 'utf8')).not.toMatch(/window\.open\(/);
  });

  it('prefers the local file even when a Drive link exists', () => {
    const chip = readFileSync(CHIP, 'utf8');

    // `attachmentId` is tested before `url`. The other order works for a
    // mirrored file and silently fails for every other one, which is the
    // ordering the three old chips had.
    //
    // Matched on the branch that *renders* a link, not on the first `if (url)`
    // in the file - the click handler has one too, as the fallback for a row
    // whose blob has not synced to this device yet.
    const byId = chip.indexOf('if (attachmentId) {');
    const byUrl = chip.search(/if \(url\) \{\s*\n\s*return \(/);

    expect(byId).toBeGreaterThan(-1);
    expect(byUrl).toBeGreaterThan(-1);
    expect(byId).toBeLessThan(byUrl);
  });
});

import React from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Headline, HeadlineTone, readHeadlines } from '../../services/headlineMetrics';

const TONE: Record<HeadlineTone, string> = {
  GOOD: 'text-emerald-300',
  NEUTRAL: 'text-slate-300',
  WATCH: 'text-amber-300',
  BAD: 'text-rose-300',
};

/**
 * The week passing by in one line.
 *
 * Everything here already lives on some card, which is the point: the numbers
 * that say how the term is going are spread over four screens and nobody visits
 * four screens. A passing line is the one place a figure can appear without
 * being asked for.
 *
 * The motion is the risk. A permanent animation on the screen someone opens
 * five times a day is a tax on attention, so three things hold it back: it
 * respects `prefers-reduced-motion` and simply stops, it pauses on hover and on
 * focus so anything interesting can actually be read, and the whole strip is
 * marked `aria-live="off"` because a screen reader announcing a marquee on a
 * loop is unusable. The same items are also rendered as a plain list to
 * assistive technology, which is the version that is genuinely readable.
 */
export const HeadlineTicker: React.FC = () => {
  const headlines = useLiveQuery(() => readHeadlines(), [], [] as Headline[]);

  if (headlines.length === 0) return null;

  const Item: React.FC<{ item: Headline }> = ({ item }) => (
    <span className="inline-flex items-center gap-1.5 px-4 flex-shrink-0">
      <span aria-hidden="true">{item.icon}</span>
      <span className={`text-[11px] font-semibold whitespace-nowrap ${TONE[item.tone]}`}>
        {item.text}
      </span>
      <span className="text-slate-700 pl-4" aria-hidden="true">
        •
      </span>
    </span>
  );

  return (
    <div className="relative rounded-2xl border border-slate-800 bg-slate-900/70 overflow-hidden">
      {/* Fades at both ends, so text arrives and leaves rather than being
          chopped off at a hard border. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 left-0 w-8 z-10 bg-gradient-to-r from-slate-900 to-transparent"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 right-0 w-8 z-10 bg-gradient-to-l from-slate-900 to-transparent"
      />

      {/* The whole moving strip is hidden from assistive technology, both
          copies of it. Marking only the duplicate would leave the first copy
          announced as well as the list below, so every headline would be read
          twice - and a marquee announced on a loop is unusable in the first
          place. The list is the accessible version. */}
      <div className="ticker-viewport py-2.5" aria-hidden="true">
        {/* Rendered twice, end to end. The track is translated by exactly half
            its width, so the second copy is under the cursor at the moment the
            first finishes and the loop has no seam. */}
        <div className="ticker-track">
          {[0, 1].map((copy) => (
            <div key={copy} className="flex items-center">
              {headlines.map((item) => (
                <Item key={`${copy}_${item.id}`} item={item} />
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* The readable version. Same facts, no motion, no loop. */}
      <ul className="sr-only">
        {headlines.map((item) => (
          <li key={item.id}>{item.text}</li>
        ))}
      </ul>
    </div>
  );
};

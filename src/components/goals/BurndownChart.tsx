import React from 'react';
import { BurndownPoint } from '../../services/goalBurndown';

interface BurndownChartProps {
  points: BurndownPoint[];
  /** Drawn at the top of the scale, so both lines share one axis. */
  committedHours: number;
  height?: number;
  className?: string;
}

/**
 * Hours still owed, week by week, against the hours promised.
 *
 * Inline SVG for the same reason as `Sparkline`: this is two polylines, and a
 * charting library would cost more to download than the whole feature is worth
 * on a phone.
 *
 * The two lines say different things and are drawn differently on purpose. The
 * planned line is a promise, so it is dashed and runs the full width to the
 * target date. The actual line is a record, so it is solid and **stops at
 * today** - continuing it flat would assert that nothing more will ever be
 * done, which is a prediction the app has no business making.
 *
 * Where the solid line sits above the dashed one, the gap is hours behind. That
 * reading is the entire point, so the gap is shaded rather than left for the
 * eye to estimate.
 */
export const BurndownChart: React.FC<BurndownChartProps> = ({
  points,
  committedHours,
  height = 160,
  className = '',
}) => {
  if (points.length < 2 || committedHours <= 0) return null;

  const width = 640;
  const padX = 8;
  const padTop = 10;
  const padBottom = 18;

  const maxY = Math.max(committedHours, ...points.map((p) => p.actualRemaining ?? 0));
  const stepX = (width - padX * 2) / (points.length - 1);
  const xFor = (i: number) => padX + i * stepX;
  const yFor = (hours: number) =>
    height - padBottom - (hours / maxY) * (height - padTop - padBottom);

  const line = (values: (number | undefined)[]) =>
    values
      .map((v, i) => (v === undefined ? null : `${xFor(i)},${yFor(v)}`))
      .filter(Boolean)
      .join(' ');

  const planned = points.map((p) => p.plannedRemaining);
  const actual = points.map((p) => p.actualRemaining);
  // Annotated: inferred from `actual`, the accumulator widens to
  // `number | undefined` and every index use below becomes an error.
  const lastActualIndex = actual.reduce<number>((last, v, i) => (v === undefined ? last : i), -1);

  /**
   * The shaded gap: out along the actual line to today, then back along the
   * planned line, so the polygon encloses only the region between the two.
   */
  const upToToday = <T,>(values: T[]) => values.slice(0, lastActualIndex + 1);
  const behindArea =
    lastActualIndex >= 1
      ? [
          ...upToToday(actual).map((v, i) => `${xFor(i)},${yFor(v!)}`),
          ...upToToday(planned)
            .map((v, i) => `${xFor(i)},${yFor(v)}`)
            .reverse(),
        ].join(' ')
      : '';

  const behind = lastActualIndex >= 0 && actual[lastActualIndex]! > planned[lastActualIndex];
  const actualColour = behind ? '#fb7185' : '#34d399';

  const first = points[0];
  const last = points.at(-1)!;
  const monthLabel = (iso: string) =>
    new Date(`${iso}T00:00:00`).toLocaleDateString('en-GB', { month: 'short', year: '2-digit' });

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      // Scaled proportionally, not stretched: `preserveAspectRatio="none"`
      // fills the box neatly and shears the month labels while doing it.
      className={`w-full h-auto ${className}`}
      role="img"
      aria-label={
        `Hours remaining from ${first.weekStart} to ${last.weekStart}. ` +
        `Planned ${planned.at(-1)} hours left at the target date; ` +
        `${actual[lastActualIndex] ?? committedHours} hours actually remaining today.`
      }
    >
      {/* Baseline - zero hours left, which is the whole objective. */}
      <line
        x1={padX}
        x2={width - padX}
        y1={yFor(0)}
        y2={yFor(0)}
        stroke="currentColor"
        strokeWidth="1"
        className="text-slate-700"
      />

      {behindArea && (
        <polygon points={behindArea} fill={actualColour} opacity="0.14" />
      )}

      {/* The promise. */}
      <polyline
        points={line(planned)}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeDasharray="5 4"
        className="text-slate-500"
        vectorEffect="non-scaling-stroke"
      />

      {/* The record, stopping at today. */}
      <polyline
        points={line(actual)}
        fill="none"
        stroke={actualColour}
        strokeWidth="2.5"
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />

      {lastActualIndex >= 0 && (
        <circle
          cx={xFor(lastActualIndex)}
          cy={yFor(actual[lastActualIndex]!)}
          r="4"
          fill="#0f172a"
          stroke={actualColour}
          strokeWidth="2.5"
          vectorEffect="non-scaling-stroke"
        />
      )}

      <text x={padX} y={height - 4} className="fill-slate-500" style={{ fontSize: 10 }}>
        {monthLabel(first.weekStart)}
      </text>
      <text
        x={width - padX}
        y={height - 4}
        textAnchor="end"
        className="fill-slate-500"
        style={{ fontSize: 10 }}
      >
        {monthLabel(last.weekStart)}
      </text>
    </svg>
  );
};

import React from 'react';
import { Trend } from '../../services/goalTrend';

interface SparklineProps {
  trend: Trend;
  /** Weekly budget, drawn as a faint reference line when known. */
  targetHours?: number;
  width?: number;
  height?: number;
  className?: string;
}

const STROKE: Record<Trend['direction'], string> = {
  FALLING: '#f43f5e',
  RISING: '#10b981',
  STEADY: '#64748b',
  UNKNOWN: '#475569',
};

/**
 * Four weeks of effort as one small line.
 *
 * Inline SVG rather than a charting library: it is five coordinates, and the
 * app's whole value proposition is that it works offline on a phone. A 40kB
 * dependency to draw four points would be a poor trade.
 *
 * The current week is drawn as a hollow endpoint. It is incomplete by
 * definition, and a solid dot sitting low on a Monday morning reads as a
 * collapse rather than as a week that has not happened yet.
 */
export const Sparkline: React.FC<SparklineProps> = ({
  trend,
  targetHours,
  width = 96,
  height = 28,
  className = '',
}) => {
  const points = trend.points;
  if (points.length < 2) return null;

  const pad = 3;
  const maxHours = Math.max(targetHours || 0, ...points.map((p) => p.hours), 1);
  const stepX = (width - pad * 2) / (points.length - 1);

  const yFor = (hours: number) =>
    height - pad - (hours / maxHours) * (height - pad * 2);

  const coords = points.map((p, i) => ({
    x: pad + i * stepX,
    y: yFor(p.hours),
    point: p,
  }));

  const path = coords.map((c, i) => `${i === 0 ? 'M' : 'L'}${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ');
  const areaPath = `${path} L${coords.at(-1)!.x.toFixed(1)},${height - pad} L${coords[0].x.toFixed(1)},${height - pad} Z`;
  const stroke = STROKE[trend.direction];
  const last = coords.at(-1)!;

  const label = points
    .map((p) => `week of ${p.week.start}: ${p.hours} hours${p.isCurrent ? ' so far' : ''}`)
    .join('; ');

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={`overflow-visible ${className}`}
      role="img"
      aria-label={`Last ${points.length} weeks — ${label}`}
    >
      {targetHours ? (
        <line
          x1={pad}
          x2={width - pad}
          y1={yFor(targetHours)}
          y2={yFor(targetHours)}
          stroke="currentColor"
          strokeWidth="1"
          strokeDasharray="2 3"
          className="text-slate-600"
        />
      ) : null}

      <path d={areaPath} fill={stroke} opacity="0.12" />
      <path d={path} fill="none" stroke={stroke} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />

      {/* Completed weeks: solid. The week in progress: hollow. */}
      {coords.slice(0, -1).map((c) => (
        <circle key={c.point.week.start} cx={c.x} cy={c.y} r="1.6" fill={stroke} opacity="0.75" />
      ))}
      <circle
        cx={last.x}
        cy={last.y}
        r="2.6"
        fill="#0f172a"
        stroke={stroke}
        strokeWidth="1.5"
      />
    </svg>
  );
};

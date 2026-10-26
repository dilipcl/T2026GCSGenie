import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db';
import { WeekDetail } from '../../services/weekDetail';
import { BurndownDay, WeekBurndown, weekBurndown } from '../../services/weekBurndown';
import { formatShortDate, parseISODate, todayISO } from '../../utils/date';

/**
 * The week drawn day by day: the plan's even fall to Sunday, what was actually
 * left at the end of each day, and the work done beside it.
 *
 * Inline SVG for the reason `BurndownChart` gives - a few polylines are not
 * worth a charting library on a phone - and laid out to read the same way:
 * dashed is the promise, solid is the record and stops at today.
 *
 * The days are real buttons under the chart rather than hit areas inside it.
 * A seventh of a phone-width SVG is about 45px wide and no taller than a bar,
 * and drilling into Thursday is the thing a review actually does with this.
 */

const KIND_LABEL = { COMMITTED: 'Planned', ADDED: 'Added', UNPLANNED: 'Unplanned' } as const;
const KIND_TONE = {
  COMMITTED: 'text-emerald-300',
  ADDED: 'text-violet-300',
  UNPLANNED: 'text-sky-300',
} as const;

const hrs = (hours: number) => `${hours}h`;
const weekday = (iso: string) =>
  parseISODate(iso).toLocaleDateString('en-GB', { weekday: 'short' });

export const WeekBurndownCard: React.FC<{ detail: WeekDetail }> = ({ detail }) => {
  const [selected, setSelected] = useState<string | null>(null);
  const subjects = useLiveQuery(() => db.subjects.toArray(), []);
  const burndown = weekBurndown(detail);
  const name = (id?: string) =>
    id ? (subjects?.find((s) => s.id === id)?.shortName ?? id) : 'No subject';

  const day = burndown.days.find((d) => d.date === selected);
  const isLive = detail.week.start <= todayISO() && todayISO() <= detail.week.end;

  return (
    <section aria-label="The week, day by day" className="space-y-2">
      <Totals burndown={burndown} isLive={isLive} />
      <Chart burndown={burndown} selected={selected} />

      <div className="grid grid-cols-7 gap-1" role="group" aria-label="Open a day">
        {burndown.days.map((d) => {
          const count = d.closed.length + d.arrived.length;
          const isSelected = d.date === selected;
          return (
            <button
              key={d.date}
              type="button"
              onClick={() => setSelected(isSelected ? null : d.date)}
              aria-pressed={isSelected}
              disabled={d.isFuture}
              className={`min-h-[44px] rounded-lg border text-[10px] font-bold leading-tight transition-colors disabled:opacity-30 ${
                isSelected
                  ? 'bg-indigo-600 border-indigo-400 text-white'
                  : 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800'
              }`}
            >
              {weekday(d.date)}
              <span className="block font-normal text-slate-400">
                {d.isFuture ? '' : count === 0 ? '–' : count}
              </span>
            </button>
          );
        })}
      </div>

      {day ? (
        <DayList day={day} name={name} />
      ) : (
        <p className="text-[10px] text-slate-500">
          Tap a day to see what was closed and what came in that day.
        </p>
      )}
    </section>
  );
};

/**
 * The totals in one line, in the order the chart is read: what was promised,
 * what came off it, what was taken on, and what is left.
 */
const Totals: React.FC<{ burndown: WeekBurndown; isLive: boolean }> = ({ burndown, isLive }) => {
  if (!burndown.hasPlan) {
    return (
      <p className="text-[11px] text-slate-300">
        No agreed plan this week, so there is nothing to burn down.
        {burndown.unplannedHours > 0
          ? ` ${hrs(burndown.unplannedHours)} of work got finished anyway - shown as bars.`
          : ''}
      </p>
    );
  }
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
      <Tile label="Committed" value={hrs(burndown.committedHours)} tone="text-white" />
      <Tile
        label="Planned work done"
        value={hrs(burndown.deliveredHours)}
        tone="text-emerald-300"
      />
      <Tile
        label="Added · unplanned"
        value={`${hrs(burndown.addedHours)} · ${hrs(burndown.unplannedHours)}`}
        tone="text-sky-300"
      />
      <Tile
        label={isLive ? 'Still to do' : 'Left undone'}
        value={hrs(burndown.remainingHours)}
        tone={burndown.remainingHours > 0 ? 'text-amber-300' : 'text-emerald-300'}
      />
      {burndown.doneBeforeHours > 0 && (
        <p className="col-span-full text-[10px] text-slate-500">
          {hrs(burndown.doneBeforeHours)} of the plan was already done before Monday, so the line
          starts lower than the plan.
        </p>
      )}
    </div>
  );
};

const Tile: React.FC<{ label: string; value: string; tone: string }> = ({ label, value, tone }) => (
  <div className="p-2 bg-slate-900/70 border border-slate-800 rounded-xl">
    <span className="block text-[10px] uppercase font-bold text-slate-500">{label}</span>
    <span className={`block text-base font-bold tabular-nums ${tone}`}>{value}</span>
  </div>
);

const Chart: React.FC<{ burndown: WeekBurndown; selected: string | null }> = ({
  burndown,
  selected,
}) => {
  const width = 640;
  const height = 170;
  const padX = 10;
  const padTop = 10;
  const padBottom = 6;
  const { days } = burndown;

  const maxY = Math.max(
    1,
    burndown.committedHours,
    burndown.startRemaining,
    ...days.map((d) => d.actualRemaining ?? 0),
    ...days.map((d) => d.plannedDoneHours + d.unplannedHours)
  );
  // Eight boundaries: Monday morning, then the end of each day.
  const stepX = (width - padX * 2) / 7;
  const xAt = (boundary: number) => padX + boundary * stepX;
  const yFor = (hours: number) => height - padBottom - (hours / maxY) * (height - padTop - padBottom);
  const barH = (hours: number) => (hours / maxY) * (height - padTop - padBottom);

  const ideal = [burndown.committedHours, ...days.map((d) => d.idealRemaining)];
  const actual = [burndown.startRemaining, ...days.map((d) => d.actualRemaining)];
  const lastIndex = actual.reduce<number>((last, v, i) => (v === undefined ? last : i), 0);
  const line = (values: (number | undefined)[]) =>
    values
      .map((v, i) => (v === undefined ? null : `${xAt(i)},${yFor(v)}`))
      .filter(Boolean)
      .join(' ');

  const behind = actual[lastIndex]! > ideal[lastIndex];
  const actualColour = behind ? '#fb7185' : '#34d399';
  const barWidth = stepX * 0.42;

  const description = burndown.hasPlan
    ? `Committed ${burndown.committedHours} hours. ` +
      days
        .filter((d) => d.actualRemaining !== undefined)
        .map(
          (d) =>
            `${formatShortDate(d.date)}: ${d.actualRemaining} hours left against ${d.idealRemaining} planned` +
            (d.unplannedHours > 0 ? `, ${d.unplannedHours} unplanned done` : '')
        )
        .join('; ')
    : `No plan. Unplanned work by day: ` +
      days.map((d) => `${formatShortDate(d.date)} ${d.unplannedHours} hours`).join(', ');

  return (
    <div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-auto"
        role="img"
        aria-label={description}
      >
        {days.map((d, i) =>
          d.date === selected ? (
            <rect
              key={`band-${d.date}`}
              x={xAt(i)}
              y={padTop}
              width={stepX}
              height={height - padTop - padBottom}
              className="fill-indigo-500/10"
            />
          ) : null
        )}

        <line
          x1={padX}
          x2={width - padX}
          y1={yFor(0)}
          y2={yFor(0)}
          stroke="currentColor"
          strokeWidth="1"
          className="text-slate-700"
        />

        {/* Work done each day, planned and not, stacked. Bars sit in the
            middle of their day; the lines sit on its edges, because a line
            point is "left at the end of the day" and a bar is "done during it". */}
        {days.map((d, i) => {
          const x = xAt(i) + (stepX - barWidth) / 2;
          const planned = barH(d.plannedDoneHours);
          const unplanned = barH(d.unplannedHours);
          return (
            <g key={`bar-${d.date}`}>
              {planned > 0 && (
                <rect
                  x={x}
                  y={yFor(0) - planned}
                  width={barWidth}
                  height={planned}
                  rx="2"
                  fill="#34d399"
                  opacity="0.35"
                />
              )}
              {unplanned > 0 && (
                <rect
                  x={x}
                  y={yFor(0) - planned - unplanned}
                  width={barWidth}
                  height={unplanned}
                  rx="2"
                  fill="#38bdf8"
                  opacity="0.75"
                />
              )}
            </g>
          );
        })}

        {burndown.hasPlan && (
          <>
            <polyline
              points={line(ideal)}
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeDasharray="5 4"
              className="text-slate-500"
              vectorEffect="non-scaling-stroke"
            />
            <polyline
              points={line(actual)}
              fill="none"
              stroke={actualColour}
              strokeWidth="2.5"
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
            {/* A day that took on work is marked where the line rose, so a
                climb reads as "more was agreed" rather than "went backwards". */}
            {days.map((d, i) =>
              d.addedHours > 0 && d.actualRemaining !== undefined ? (
                <circle
                  key={`added-${d.date}`}
                  cx={xAt(i + 1)}
                  cy={yFor(d.actualRemaining)}
                  r="4"
                  fill="#a78bfa"
                />
              ) : null
            )}
            <circle
              cx={xAt(lastIndex)}
              cy={yFor(actual[lastIndex]!)}
              r="4"
              fill="#0f172a"
              stroke={actualColour}
              strokeWidth="2.5"
              vectorEffect="non-scaling-stroke"
            />
          </>
        )}
      </svg>

      <ul className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-slate-400">
        {burndown.hasPlan && (
          <>
            <Key swatch={<span className="w-4 border-t border-dashed border-slate-400" />}>
              plan
            </Key>
            <Key swatch={<span className="w-4 border-t-2" style={{ borderColor: actualColour }} />}>
              still to do
            </Key>
            <Key swatch={<span className="w-2 h-2 rounded-full bg-violet-400" />}>work added</Key>
            <Key swatch={<span className="w-2.5 h-2.5 rounded-sm bg-emerald-400/40" />}>
              planned work done
            </Key>
          </>
        )}
        <Key swatch={<span className="w-2.5 h-2.5 rounded-sm bg-sky-400/75" />}>unplanned work</Key>
      </ul>
    </div>
  );
};

const Key: React.FC<{ swatch: React.ReactNode; children: React.ReactNode }> = ({
  swatch,
  children,
}) => (
  <li className="flex items-center gap-1">
    <span className="flex items-center" aria-hidden="true">
      {swatch}
    </span>
    {children}
  </li>
);

const DayList: React.FC<{ day: BurndownDay; name: (id?: string) => string }> = ({ day, name }) => (
  <div className="p-2.5 bg-slate-900/70 border border-slate-800 rounded-xl">
    <p className="text-[11px] font-bold text-white">
      {weekday(day.date)} {formatShortDate(day.date)}
      {day.actualRemaining !== undefined && (
        <span className="font-normal text-slate-400">
          {' '}
          · {hrs(day.actualRemaining)} of the plan left at the end of the day
        </span>
      )}
    </p>
    {day.closed.length === 0 && day.arrived.length === 0 ? (
      <p className="mt-1 text-[11px] text-slate-500">Nothing closed or added that day.</p>
    ) : (
      <ul className="mt-1.5 space-y-1">
        {day.arrived.map((item) => (
          <li key={`in-${item.id}`} className="text-xs text-slate-200">
            {item.title}
            <span className="block text-[10px] text-violet-300">
              Added to the week · {name(item.subjectId)} · {hrs(item.hours)}
            </span>
          </li>
        ))}
        {day.closed.map(({ item, kind }) => (
          <li key={`done-${item.id}`} className="text-xs text-slate-200">
            {item.title}
            <span className={`block text-[10px] ${KIND_TONE[kind]}`}>
              {KIND_LABEL[kind]}, done · {name(item.subjectId)} · {hrs(item.hours)}
              {item.isFixUp && ' · fix-up'}
            </span>
          </li>
        ))}
      </ul>
    )}
  </div>
);

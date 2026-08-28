import { db } from '../db';
import { DailyCheckIn } from '../types';

/**
 * Reading the energy that every check-in has always collected.
 *
 * `energyLevel` and `focusRating` were captured on every check-in, shown back
 * in the history modal, written to the CSV export - and consumed by nothing.
 * No engine read them. A student could log energy 1 five days running and every
 * screen in the app stayed green.
 *
 * The film spends two scenes on exactly that state: "there will be days when
 * the tank is completely empty", and "asking us for support when it gets too
 * heavy". This is the smallest honest implementation of it - notice, and offer
 * the smallest next step.
 *
 * What it deliberately is not: a wellbeing score, a mood chart, or anything
 * that reads as the app forming an opinion about a fourteen year old. It
 * notices a run of hard days and offers to make the week smaller.
 */

/** Energy at or below this is a hard day. */
const LOW_ENERGY = 2;

/** How many recent check-ins are considered. */
const WINDOW = 5;

/** How many of them have to be low before anything is said. */
const TRIGGER_COUNT = 3;

export interface EnergySignal {
  /** Enough hard days, close enough together, to be worth mentioning. */
  isLow: boolean;
  /** Low-energy check-ins within the window. */
  lowCount: number;
  /** Check-ins actually available - fewer than WINDOW early on. */
  sampleSize: number;
  /** Mean energy across the window, to 1dp. */
  averageEnergy: number;
  /** Consecutive low check-ins ending at the most recent one. */
  currentRun: number;
  /** Distinct dates the window covers, most recent first. */
  dates: string[];
  /** What to say. Undefined when there is nothing to say. */
  message?: string;
}

const EMPTY: EnergySignal = {
  isLow: false,
  lowCount: 0,
  sampleSize: 0,
  averageEnergy: 0,
  currentRun: 0,
  dates: [],
};

/**
 * The most recent check-ins, newest first.
 *
 * Several check-ins can happen in one day - the focus timer writes one too - so
 * this counts check-ins rather than days on purpose. Three low readings inside
 * one exhausted evening is still a signal worth having, and requiring three
 * separate days would wait until Wednesday to notice a Monday.
 */
function recent(checkIns: DailyCheckIn[]): DailyCheckIn[] {
  return [...checkIns].sort((a, b) => b.timestamp - a.timestamp).slice(0, WINDOW);
}

export async function readEnergySignal(): Promise<EnergySignal> {
  const all = await db.checkIns.toArray();
  if (all.length === 0) return EMPTY;

  const window = recent(all);
  const lows = window.filter((c) => (c.energyLevel ?? 3) <= LOW_ENERGY);

  let currentRun = 0;
  for (const entry of window) {
    if ((entry.energyLevel ?? 3) <= LOW_ENERGY) currentRun++;
    else break;
  }

  const averageEnergy =
    Math.round((window.reduce((sum, c) => sum + (c.energyLevel ?? 3), 0) / window.length) * 10) / 10;

  const isLow = lows.length >= TRIGGER_COUNT;

  return {
    isLow,
    lowCount: lows.length,
    sampleSize: window.length,
    averageEnergy,
    currentRun,
    dates: Array.from(new Set(window.map((c) => c.date))),
    message: isLow
      ? currentRun >= TRIGGER_COUNT
        ? `That is ${currentRun} check-ins in a row running on empty. This is the week to make smaller, not the week to push through.`
        : `${lows.length} of your last ${window.length} check-ins have been low on energy. Nothing here needs to stay on the list.`
      : undefined,
  };
}

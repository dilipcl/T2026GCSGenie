import React from "react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  LostReason,
  TimeAccount,
  readTimeAccount,
} from "../../services/progressReport";
import type { NavTab } from "../layout/Navigation";
import { Clock, ArrowRight } from "lucide-react";

/**
 * Study time that counted towards nothing, with why and what fixes it.
 *
 * Home said "6.3h studied" and "1h done of 18h" a scroll apart, and nothing
 * anywhere said where the other 5.3 hours had gone. The rules that lost them
 * were all in `studyLedger` and all working as designed; nobody could see
 * them. This card says them out loud, next to the fix.
 *
 * Read-only by design. Every fix is a decision - agreeing a goal, giving it a
 * subject - and those belong on the screen where the decision is made and
 * recorded, so the buttons take you there rather than doing it from here.
 */

const FIX_TAB: Record<LostReason, NavTab | undefined> = {
  GOAL_NOT_AGREED: "GOALS",
  GOAL_HAS_NO_SUBJECT: "GOALS",
  GOAL_GONE: "GOALS",
  NO_GOAL_FOR_SUBJECT: "GOALS",
  // Nothing to open: the subject is chosen while logging, and old rows are
  // not worth re-filing one by one. The advice is the fix.
  NO_SUBJECT: undefined,
};

const hours = (minutes: number) => Math.round((minutes / 60) * 10) / 10;

export const LostTimeCard: React.FC<{
  account: TimeAccount;
  onOpenTab: (tab: NavTab) => void;
  /** Home shows it only when something was lost; Progress always explains. */
  hideWhenNothingLost?: boolean;
}> = ({ account, onOpenTab, hideWhenNothingLost }) => {
  const lostMinutes = account.loggedMinutes - account.countedMinutes;
  if (hideWhenNothingLost && lostMinutes <= 0) return null;

  return (
    <section className="glass-card p-4" aria-labelledby="lost-time-title">
      <div className="flex items-center gap-2 mb-1">
        <Clock className="w-4 h-4 text-amber-300" aria-hidden="true" />
        <h3 id="lost-time-title" className="text-sm font-bold text-white">
          Where this week's time went
        </h3>
      </div>
      <p className="text-xs text-slate-300">
        <strong className="text-white">{hours(account.loggedMinutes)}h</strong>{" "}
        studied,{" "}
        <strong className="text-white">{hours(account.countedMinutes)}h</strong>{" "}
        towards agreed goals
        {lostMinutes > 0 ? (
          <>
            , <strong className="text-amber-200">{hours(lostMinutes)}h</strong>{" "}
            towards nothing.
          </>
        ) : (
          ". Nothing lost."
        )}
      </p>

      {account.loggedMinutes > 0 && (
        <div
          className="mt-3 h-2 rounded-full bg-slate-800 overflow-hidden flex gap-0.5"
          role="img"
          aria-label={`${hours(account.countedMinutes)} of ${hours(account.loggedMinutes)} hours counted`}
        >
          <span
            className="h-full bg-emerald-400 rounded-l-full"
            style={{
              width: `${(account.countedMinutes / account.loggedMinutes) * 100}%`,
            }}
          />
          {lostMinutes > 0 && (
            <span
              className="h-full bg-amber-400/60 rounded-r-full"
              style={{
                width: `${(lostMinutes / account.loggedMinutes) * 100}%`,
              }}
            />
          )}
        </div>
      )}

      {account.lost.length > 0 && (
        <ul className="mt-3 divide-y divide-slate-800">
          {account.lost.map((lost) => {
            const tab = FIX_TAB[lost.reason];
            return (
              <li
                key={`${lost.reason}-${lost.goal?.id ?? ""}-${lost.subjectId ?? ""}`}
                className="py-2 flex flex-wrap items-center gap-x-3 gap-y-1"
              >
                <span className="text-xs font-bold text-amber-200 tabular-nums w-12">
                  {hours(lost.minutes)}h
                </span>
                <span className="flex-1 min-w-0 text-xs text-slate-200">
                  {lost.explanation}
                  <span className="block text-[10px] text-slate-500">
                    {lost.owner === "PARENT" ? "For a parent" : "For Tejas"}
                  </span>
                </span>
                {tab ? (
                  <button
                    type="button"
                    onClick={() => onOpenTab(tab)}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-[10px] font-bold text-indigo-200"
                  >
                    {lost.fix}
                    <ArrowRight className="w-3 h-3" aria-hidden="true" />
                  </button>
                ) : (
                  <span className="text-[10px] text-slate-400">{lost.fix}</span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
};

/**
 * Home's copy: reads its own week, and says nothing when nothing was lost.
 *
 * Sits beside the week's health on Home, because that is where "1h done of
 * 18h" is shown - the number this card explains.
 */
export const HomeLostTimeCard: React.FC<{
  onOpenTab: (tab: NavTab) => void;
}> = ({ onOpenTab }) => {
  const account = useLiveQuery(() => readTimeAccount(), []);
  if (!account) return null;
  return (
    <LostTimeCard account={account} onOpenTab={onOpenTab} hideWhenNothingLost />
  );
};

import React, { useState } from 'react';
import { TopicSummary } from '../../services/topicTimeline';
import { setTopicResource } from '../../services/studyResources';
import { halfTermLabel, markTopicTaught } from '../../services/schoolPlan';
import { UserRole } from '../../types';
import { formatShortDate } from '../../utils/date';
import { Check } from 'lucide-react';

/**
 * Where a topic has been worked through - notebook, CGP guide, Sparx, a
 * practical write-up - one tap each, and whether it has been taught.
 *
 * The tap is the whole record. A page or exercise reference can be added under
 * a ticked resource but is never asked for; a tick without one is still the
 * answer to "has he done this in the CGP book?". A resource ticked by finished
 * homework naming it says so, and tapping it makes the tick his own.
 */

const PLAN_LINE = {
  TAUGHT: 'taught',
  DUE_NOW: 'planned for this half-term',
  BEHIND: 'planned for an earlier half-term',
  LATER: 'planned for later',
} as const;

export const TopicResourcesPanel: React.FC<{ summary: TopicSummary; role: UserRole }> = ({
  summary,
  role,
}) => {
  const { topic, journey, resources, plan } = summary;
  const [busy, setBusy] = useState(false);

  return (
    <div className="space-y-2">
      {!journey.taught && (
        <div className="flex flex-wrap items-center gap-2 p-2.5 rounded-xl bg-slate-950/50 border border-slate-800">
          <span className="flex-1 min-w-0 text-[11px] text-slate-300">
            Not taught yet
            {topic.plannedTerm && plan && (
              <span className="text-slate-500">
                {' '}
                · {halfTermLabel(topic.plannedTerm)}, {PLAN_LINE[plan]}
              </span>
            )}
            . Tagging the lesson in the check-in marks it taught.
          </span>
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await markTopicTaught(topic.id, undefined, role);
              } finally {
                setBusy(false);
              }
            }}
            className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-[10px] font-bold text-indigo-200 disabled:opacity-50"
          >
            Taught today
          </button>
        </div>
      )}

      {resources.length > 0 && (
        <section aria-label="Worked through in" className="space-y-1.5">
          <p className="text-[10px] text-slate-400">Worked through in</p>
          <div className="flex flex-wrap gap-1.5">
            {resources.map((r) => {
              const own = r.done && !r.auto;
              return (
                <button
                  key={r.resource.id}
                  type="button"
                  aria-pressed={r.done}
                  onClick={() => void setTopicResource(topic.id, r.resource.id, !own, role)}
                  title={
                    r.auto
                      ? 'Ticked by finished homework that names it - tap to make it your own tick'
                      : own
                        ? 'Tap to untick'
                        : 'Tap when done'
                  }
                  className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-[11px] font-semibold transition-colors ${
                    r.done
                      ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-100'
                      : 'bg-slate-900 border-slate-700 text-slate-300 hover:border-slate-500'
                  }`}
                >
                  {r.done && <Check className="w-3 h-3" aria-hidden="true" />}
                  {r.resource.name}
                  {r.done && r.on && (
                    <span className="text-[10px] font-normal text-emerald-300/80">
                      {formatShortDate(r.on)}
                      {r.auto && ', from homework'}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          {resources
            .filter((r) => r.done && !r.auto)
            .map((r) => (
              <label key={r.resource.id} className="flex items-center gap-2 text-[10px] text-slate-400">
                <span className="w-28 flex-shrink-0 truncate">{r.resource.name}: where</span>
                <input
                  defaultValue={r.ref ?? ''}
                  placeholder="page, exercise - optional"
                  onBlur={(e) =>
                    void setTopicResource(topic.id, r.resource.id, true, role, e.target.value)
                  }
                  className="flex-1 min-w-0 bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-[11px] text-white placeholder-slate-600"
                />
              </label>
            ))}
        </section>
      )}
    </div>
  );
};

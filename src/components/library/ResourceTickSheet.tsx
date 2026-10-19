import React from 'react';
import { TopicSummary } from '../../services/topicTimeline';
import { setTopicResource } from '../../services/studyResources';
import { StudyResource, UserRole } from '../../types';
import { Check } from 'lucide-react';

/**
 * Every taught topic against every resource, one tap per cell - for catching
 * up.
 *
 * The topic page ticks one topic at a time, which is right on the night and
 * wrong for the first time: a notebook already covering twenty topics is
 * twenty pages to open. Here it is twenty taps in one table. Topics not taught
 * yet are left off; there is nothing to have worked through.
 *
 * A cell a resource does not apply to (a practical write-up on a topic that is
 * not a practical) is blank rather than a tick box, so it cannot be ticked by
 * mistake and does not read as missing.
 */
export const ResourceTickSheet: React.FC<{ rows: TopicSummary[]; role: UserRole }> = ({
  rows,
  role,
}) => {
  const taught = rows.filter((r) => r.journey.taught);
  const columns: StudyResource[] = [];
  for (const row of taught)
    for (const state of row.resources)
      if (!columns.some((c) => c.id === state.resource.id)) columns.push(state.resource);

  if (taught.length === 0 || columns.length === 0) return null;

  return (
    <details className="rounded-xl bg-slate-950/50 border border-slate-800">
      <summary className="cursor-pointer list-none p-2.5 text-[11px] font-semibold text-slate-100">
        Tick sheet: {columns.map((c) => c.name).join(', ')}
      </summary>
      <div className="overflow-x-auto px-2.5 pb-2.5">
        <table className="w-full text-[11px]">
          <thead>
            <tr>
              <th scope="col" className="text-left font-semibold text-slate-400 py-1 pr-2">
                Topic
              </th>
              {columns.map((c) => (
                <th
                  key={c.id}
                  scope="col"
                  className="font-semibold text-slate-400 py-1 px-1 text-center whitespace-nowrap"
                >
                  {c.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {taught.map((row) => (
              <tr key={row.topic.id} className="border-t border-slate-800">
                <th scope="row" className="text-left font-normal text-slate-200 py-1 pr-2 min-w-[9rem]">
                  {row.topic.title}
                </th>
                {columns.map((c) => {
                  const state = row.resources.find((s) => s.resource.id === c.id);
                  if (!state) return <td key={c.id} />;
                  const own = state.done && !state.auto;
                  return (
                    <td key={c.id} className="text-center py-1 px-1">
                      <button
                        type="button"
                        aria-pressed={state.done}
                        aria-label={`${c.name}: ${row.topic.title}`}
                        onClick={() => void setTopicResource(row.topic.id, c.id, !own, role)}
                        className={`w-7 h-7 rounded-md border inline-flex items-center justify-center ${
                          state.done
                            ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-200'
                            : 'bg-slate-900 border-slate-700 text-transparent hover:border-slate-500'
                        }`}
                      >
                        <Check className="w-3.5 h-3.5" aria-hidden="true" />
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
};

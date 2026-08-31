import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityFilter,
  activeDates,
  buildActivityFeed,
  groupByDay,
  outstanding,
} from '../../services/activityService';
import {
  ActivityItem,
  DeviceRegistration,
  UserRole,
  ChangeCategory,
} from '../../types';
import { CATEGORY_ICON, CATEGORY_LABEL } from '../../services/changeLogService';
import { nameDevice, needsNaming, people, Person } from '../../services/deviceRegistryService';
import { getDeviceId } from '../../utils/device';
import { formatPastDate } from '../../utils/date';
import { INITIAL_SUBJECTS } from '../../db/seedData';
import {
  Search,
  Filter,
  Clock,
  Trash2,
  PlusCircle,
  PencilLine,
  ShieldCheck,
  Paperclip,
  AlertCircle,
  X,
  Laptop,
} from 'lucide-react';

/**
 * Everything that has happened, in one place, for whoever is looking.
 *
 * This replaces a tab that showed five kinds of thing out of the twenty-odd
 * that actually occur. The old Updates tab read `changeLog`, which is only
 * written by the confirmation sheet, so a session could delete four tasks and
 * three syllabus topics and produce a log that mentioned none of it. Everything
 * here comes from `activityService`, which merges that human log with the
 * complete audit trail.
 *
 * Three things the design has to get right, in order:
 *
 *  1. **Who.** Not "Student" - the name of the device it happened on. A family
 *     with two parents cannot use a role.
 *  2. **What is not finished.** A goal sent for approval is a request, not an
 *     achievement, and rendering it identically to a ticked-off homework is how
 *     three goals sat unapproved for two days without anyone noticing.
 *  3. **When, filterable.** "What happened on Saturday" has to be one tap.
 */

const ACTION_STYLE: Record<
  ActivityItem['action'],
  { icon: React.ElementType; className: string; label: string }
> = {
  CREATED: { icon: PlusCircle, className: 'text-emerald-400', label: 'Added' },
  UPDATED: { icon: PencilLine, className: 'text-sky-400', label: 'Changed' },
  DELETED: { icon: Trash2, className: 'text-rose-400', label: 'Deleted' },
  COMPLETED: { icon: ShieldCheck, className: 'text-emerald-400', label: 'Completed' },
  CONFIRMED: { icon: ShieldCheck, className: 'text-indigo-400', label: 'Confirmed' },
  SYSTEM: { icon: Clock, className: 'text-slate-400', label: 'System' },
};

function timeOf(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Chip that toggles one value in a filter array. */
const Chip: React.FC<{
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}> = ({ active, onClick, children }) => (
  <button
    type="button"
    onClick={onClick}
    className={`px-2.5 py-1 rounded-full border text-[11px] font-bold whitespace-nowrap transition-colors ${
      active
        ? 'bg-indigo-600 border-indigo-400 text-white'
        : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
    }`}
  >
    {children}
  </button>
);

const AttachmentLinks: React.FC<{ item: ActivityItem }> = ({ item }) => {
  if (!item.attachments?.length) return null;

  return (
    <div className="flex flex-wrap gap-1.5 mt-1.5">
      {item.attachments.map((file) => {
        const href = file.driveViewUrl;
        const shared = (
          <>
            <Paperclip className="w-3 h-3 flex-shrink-0" />
            <span className="truncate max-w-[10rem]">{file.fileName}</span>
          </>
        );

        /**
         * A file with no Drive copy still exists - it is a blob in this
         * device's database - but it has no address anyone can open, and a dead
         * link is worse than an honest label. Once Drive backup is connected,
         * these become real links.
         */
        if (href) {
          return (
            <a
              key={file.attachmentId}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-slate-800 border border-slate-700 text-[10px] text-indigo-300 hover:bg-slate-700"
            >
              {shared}
            </a>
          );
        }

        /**
         * Three states, not two. A file saved through the desktop folder is
         * safe from a restore but has no URL, and calling that "on device"
         * would understate it just as badly as rendering a dead link would
         * overstate it.
         */
        return (
          <span
            key={file.attachmentId}
            title={
              file.mirroredWithoutLink
                ? 'Saved into your Drive backup folder. Links need the Drive API, which this device is not using.'
                : 'Stored only on the device it was taken on. Connect Drive backup to keep a copy.'
            }
            className={`flex items-center gap-1 px-2 py-0.5 rounded-lg border text-[10px] ${
              file.mirroredWithoutLink
                ? 'bg-emerald-500/5 border-emerald-500/20 text-emerald-400/80'
                : 'bg-slate-800/60 border-slate-800 text-slate-500'
            }`}
          >
            {shared}
            <span className="opacity-70">
              {file.mirroredWithoutLink ? '· in Drive folder' : '· on device only'}
            </span>
          </span>
        );
      })}
    </div>
  );
};

const PendingBadge: React.FC<{ item: ActivityItem }> = ({ item }) => {
  if (!item.pending) return null;

  if (item.pending.resolved) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-[10px] font-bold text-emerald-400">
        <ShieldCheck className="w-3 h-3" />
        {item.pending.label}
        {item.pending.resolvedNote ? ` · ${item.pending.resolvedNote}` : ''}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-[10px] font-bold text-amber-400">
      <AlertCircle className="w-3 h-3" />
      {item.pending.label}
    </span>
  );
};

const ActivityRow: React.FC<{ item: ActivityItem }> = ({ item }) => {
  const style = ACTION_STYLE[item.action];
  const Icon = style.icon;
  const subject = INITIAL_SUBJECTS.find((s) => s.id === item.subjectId);

  return (
    <li className="flex gap-3 py-3 border-b border-slate-800 last:border-0">
      <div className="flex flex-col items-center pt-0.5 flex-shrink-0">
        <Icon className={`w-4 h-4 ${style.className}`} aria-hidden="true" />
      </div>

      <div className="min-w-0 flex-1">
        <p className="text-sm text-slate-100 leading-snug break-words">{item.summary}</p>

        {item.detail && (
          <p className="text-xs text-slate-400 mt-0.5 leading-snug break-words">{item.detail}</p>
        )}

        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1.5 text-[10px] text-slate-500">
          <span className="font-mono">{timeOf(item.timestamp)}</span>
          <span aria-hidden="true">·</span>
          <span
            className="inline-flex items-center gap-1 font-bold text-slate-400"
            title={item.actorPerson ? `on ${item.actorLabel}` : undefined}
          >
            <Laptop className="w-3 h-3" />
            {item.actorPerson ?? item.actorLabel}
            {item.actorPerson && (
              <span className="font-normal text-slate-600">· {item.actorLabel}</span>
            )}
          </span>
          <span aria-hidden="true">·</span>
          <span>{item.entityType}</span>
          {subject && (
            <>
              <span aria-hidden="true">·</span>
              <span>
                {subject.icon} {subject.shortName}
              </span>
            </>
          )}
          {item.visibility === 'PARENT_ONLY' && (
            <span className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-400">
              Parent only
            </span>
          )}
        </div>

        {item.pending && (
          <div className="mt-1.5">
            <PendingBadge item={item} />
          </div>
        )}

        <AttachmentLinks item={item} />
      </div>
    </li>
  );
};

/** Asked once: whose device this is, and what to call it. */
const NameThisDevice: React.FC<{ onNamed: () => void }> = ({ onNamed }) => {
  const [label, setLabel] = useState('');
  const [owner, setOwner] = useState('');
  const [known, setKnown] = useState<Person[]>([]);

  useEffect(() => {
    people().then(setKnown);
  }, []);

  return (
    <div className="bg-indigo-500/10 border border-indigo-500/30 rounded-2xl p-4 mb-4">
      <h3 className="text-sm font-bold text-white mb-1">Whose device is this?</h3>
      <p className="text-xs text-slate-300 mb-3 leading-snug">
        Everything below shows who made a change. Naming this device applies to every entry it has
        ever written, including the ones from before this screen existed — and if you use more than
        one device, giving them the same person groups them together.
      </p>

      {known.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {known.map((p) => (
            <button
              type="button"
              key={p.name}
              onClick={() => setOwner(p.name)}
              className={`px-2.5 py-1 rounded-full border text-[11px] font-bold ${
                owner === p.name
                  ? 'bg-indigo-600 border-indigo-400 text-white'
                  : 'bg-slate-800 border-slate-700 text-slate-300'
              }`}
            >
              {p.name}
            </button>
          ))}
        </div>
      )}

      <div className="space-y-2">
        <input
          value={owner}
          onChange={(e) => setOwner(e.target.value)}
          placeholder="Person — e.g. Tejas"
          className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white placeholder:text-slate-600"
        />
        <div className="flex gap-2">
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="This device — e.g. phone"
            className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white placeholder:text-slate-600"
          />
          <button
            type="button"
            disabled={!label.trim() || !owner.trim()}
            onClick={async () => {
              await nameDevice(getDeviceId(), `${owner.trim()}'s ${label.trim()}`, owner);
              onNamed();
            }}
            className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-bold disabled:opacity-40"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
};

export const ActivityView: React.FC<{ currentRole: UserRole }> = ({ currentRole }) => {
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [devices, setDevices] = useState<DeviceRegistration[]>([]);
  const [everyone, setEveryone] = useState<Person[]>([]);
  const [hidden, setHidden] = useState(0);
  const [filter, setFilter] = useState<ActivityFilter>({});
  const [showFilters, setShowFilters] = useState(false);
  const [askName, setAskName] = useState(false);
  const [loading, setLoading] = useState(true);

  const reload = React.useCallback(async () => {
    setLoading(true);
    const feed = await buildActivityFeed(currentRole, filter);
    setItems(feed.items);
    setDevices(feed.devices);
    setHidden(feed.hiddenByVisibility);
    setLoading(false);
  }, [currentRole, filter]);

  useEffect(() => {
    reload();
  }, [reload]);

  useEffect(() => {
    needsNaming().then(setAskName);
  }, []);

  useEffect(() => {
    people().then(setEveryone);
  }, [askName]);

  // Day chips come from the unfiltered feed, so choosing a day never removes
  // the other days from the picker.
  const [allDays, setAllDays] = useState<string[]>([]);
  useEffect(() => {
    buildActivityFeed(currentRole).then((feed) => setAllDays(activeDates(feed.items).slice(0, 14)));
  }, [currentRole, askName]);

  const days = useMemo(() => groupByDay(items), [items]);
  const waiting = useMemo(() => outstanding(items), [items]);

  const toggle = <K extends keyof ActivityFilter>(key: K, value: string) => {
    setFilter((prev) => {
      const current = (prev[key] as string[] | undefined) ?? [];
      const next = current.includes(value)
        ? current.filter((v) => v !== value)
        : [...current, value];
      return { ...prev, [key]: next.length ? next : undefined } as ActivityFilter;
    });
  };

  const activeFilterCount =
    (filter.people?.length ? 1 : 0) +
    (filter.deviceIds?.length ? 1 : 0) +
    (filter.actions?.length ? 1 : 0) +
    (filter.categories?.length ? 1 : 0) +
    (filter.onDate ? 1 : 0) +
    (filter.pendingOnly ? 1 : 0) +
    (filter.search ? 1 : 0);

  return (
    <div className="pb-8">
      <header className="mb-4">
        <h1 className="text-2xl font-black text-white">Updates</h1>
        <p className="text-sm text-slate-400 mt-0.5">
          Every change anyone has made — added, edited and deleted.
        </p>
      </header>

      {askName && <NameThisDevice onNamed={() => { setAskName(false); reload(); }} />}

      {waiting.length > 0 && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 mb-4">
          <h2 className="text-sm font-bold text-amber-300 mb-2 flex items-center gap-1.5">
            <AlertCircle className="w-4 h-4" />
            {waiting.length} thing{waiting.length === 1 ? '' : 's'} still waiting
          </h2>
          <ul className="space-y-1">
            {waiting.slice(0, 4).map((item) => (
              <li key={item.id} className="text-xs text-slate-300 leading-snug">
                <span className="text-slate-100">{item.summary}</span>
                <span className="text-amber-400 font-bold"> — {item.pending?.label}</span>
              </li>
            ))}
          </ul>
          {waiting.length > 4 && (
            <button
              type="button"
              onClick={() => setFilter((f) => ({ ...f, pendingOnly: true }))}
              className="text-[11px] font-bold text-amber-300 underline mt-2"
            >
              See all {waiting.length}
            </button>
          )}
        </div>
      )}

      {/* Search and the filter toggle */}
      <div className="flex gap-2 mb-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={filter.search ?? ''}
            onChange={(e) => setFilter((f) => ({ ...f, search: e.target.value || undefined }))}
            placeholder="Search updates"
            className="w-full bg-slate-900 border border-slate-700 rounded-xl pl-9 pr-3 py-2 text-sm text-white placeholder:text-slate-600"
          />
        </div>
        <button
          type="button"
          onClick={() => setShowFilters((v) => !v)}
          className={`px-3 rounded-xl border text-sm font-bold flex items-center gap-1.5 ${
            activeFilterCount
              ? 'bg-indigo-600 border-indigo-400 text-white'
              : 'bg-slate-900 border-slate-700 text-slate-300'
          }`}
        >
          <Filter className="w-4 h-4" />
          {activeFilterCount || ''}
        </button>
      </div>

      {/* Day chips are always visible - "what happened Saturday" is the question
          this screen exists to answer. */}
      <div className="flex gap-1.5 overflow-x-auto pb-2 mb-1 -mx-1 px-1">
        <Chip active={!filter.onDate} onClick={() => setFilter((f) => ({ ...f, onDate: undefined }))}>
          All days
        </Chip>
        {allDays.map((day) => (
          <Chip
            key={day}
            active={filter.onDate === day}
            onClick={() =>
              setFilter((f) => ({ ...f, onDate: f.onDate === day ? undefined : day }))
            }
          >
            {formatPastDate(day)}
          </Chip>
        ))}
      </div>

      {showFilters && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3 mb-4 space-y-3">
          {everyone.length > 0 && (
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase mb-1.5">Who</p>
              <div className="flex flex-wrap gap-1.5">
                {everyone.map((person) => (
                  <Chip
                    key={person.name}
                    active={!!filter.people?.includes(person.name)}
                    onClick={() => toggle('people', person.name)}
                  >
                    {person.name}
                    {person.deviceIds.length > 1 && (
                      <span className="ml-1 font-normal opacity-70">
                        · {person.deviceIds.length} devices
                      </span>
                    )}
                  </Chip>
                ))}
              </div>
            </div>
          )}

          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase mb-1.5">
              {everyone.length > 0 ? 'Or one device' : 'Which device'}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {devices.map((device) => (
                <Chip
                  key={device.id}
                  active={!!filter.deviceIds?.includes(device.id)}
                  onClick={() => toggle('deviceIds', device.id)}
                >
                  {device.label}
                </Chip>
              ))}
            </div>
          </div>

          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase mb-1.5">What happened</p>
            <div className="flex flex-wrap gap-1.5">
              {(Object.keys(ACTION_STYLE) as ActivityItem['action'][]).map((action) => (
                <Chip
                  key={action}
                  active={!!filter.actions?.includes(action)}
                  onClick={() => toggle('actions', action)}
                >
                  {ACTION_STYLE[action].label}
                </Chip>
              ))}
            </div>
          </div>

          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase mb-1.5">Area</p>
            <div className="flex flex-wrap gap-1.5">
              {(Object.keys(CATEGORY_LABEL) as ChangeCategory[]).map((category) => (
                <Chip
                  key={category}
                  active={!!filter.categories?.includes(category)}
                  onClick={() => toggle('categories', category)}
                >
                  {CATEGORY_ICON[category]} {CATEGORY_LABEL[category]}
                </Chip>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between pt-1">
            <Chip
              active={!!filter.pendingOnly}
              onClick={() => setFilter((f) => ({ ...f, pendingOnly: !f.pendingOnly || undefined }))}
            >
              Only unfinished
            </Chip>
            {activeFilterCount > 0 && (
              <button
                type="button"
                onClick={() => setFilter({})}
                className="text-[11px] font-bold text-slate-400 flex items-center gap-1"
              >
                <X className="w-3 h-3" /> Clear all
              </button>
            )}
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-slate-500 py-8 text-center">Loading…</p>
      ) : days.length === 0 ? (
        <p className="text-sm text-slate-500 py-8 text-center">
          Nothing matches those filters.
        </p>
      ) : (
        days.map((day) => (
          <section key={day.date} className="mb-5">
            <h2 className="text-xs font-black text-slate-400 uppercase tracking-wide mb-1 sticky top-0 bg-slate-950/90 backdrop-blur py-1.5">
              {formatPastDate(day.date)}
              <span className="text-slate-600 font-bold ml-2">
                {day.items.length} change{day.items.length === 1 ? '' : 's'}
              </span>
            </h2>
            <ul>
              {day.items.map((item) => (
                <ActivityRow key={item.id} item={item} />
              ))}
            </ul>
          </section>
        ))
      )}

      {/* Said plainly rather than hidden: a feed that silently omits rows is the
          problem this screen was built to fix. */}
      {hidden > 0 && currentRole !== 'PARENT' && (
        <p className="text-[11px] text-slate-500 border-t border-slate-800 pt-3 mt-2 leading-snug">
          {hidden} entr{hidden === 1 ? 'y is' : 'ies are'} visible to parents only — passphrase
          changes and sanctions.
        </p>
      )}
    </div>
  );
};

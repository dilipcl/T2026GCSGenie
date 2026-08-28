import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';

interface PortalSectionProps {
  title: string;
  blurb: string;
  icon: React.ReactNode;
  /** Open on first render. The section a parent came for should already be open. */
  defaultOpen?: boolean;
  children: React.ReactNode;
}

/**
 * One group of the Parent Portal.
 *
 * The portal had grown to a single continuous scroll: profile, chores, rewards,
 * guidance links, data exchange, handover, the passphrase, backup and restore,
 * and the audit log, one after another. Everything in it earned its place, and
 * finding any of it meant scrolling past all of the rest.
 *
 * Collapsed by default, because the portal is opened to do one thing. The
 * heading stays visible so the shape of what is in here is still legible at a
 * glance - which a set of collapsed sections does better than a long page.
 */
export const PortalSection: React.FC<PortalSectionProps> = ({
  title,
  blurb,
  icon,
  defaultOpen = false,
  children,
}) => {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/40 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-slate-900/70 transition-colors"
      >
        <span className="flex-shrink-0">{icon}</span>
        <span className="flex-1 min-w-0">
          <span className="block text-sm font-bold text-white">{title}</span>
          <span className="block text-[11px] text-slate-400">{blurb}</span>
        </span>
        <ChevronDown
          className={`w-4 h-4 text-slate-400 flex-shrink-0 transition-transform ${
            open ? 'rotate-180' : ''
          }`}
        />
      </button>

      {open && <div className="px-3 pb-3 space-y-4">{children}</div>}
    </section>
  );
};

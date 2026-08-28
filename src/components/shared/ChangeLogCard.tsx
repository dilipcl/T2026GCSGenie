import React from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { CATEGORY_ICON, pendingConfirmation } from '../../services/changeLogService';
import { ClipboardCheck, ChevronRight } from 'lucide-react';

interface ChangeLogCardProps {
  onReview: () => void;
}

/**
 * A prompt on Home, and nothing more.
 *
 * The sending and signing off happen on the Updates tab, where there is room to
 * read the whole day at once and decide about it. This card exists only so that
 * work waiting to be confirmed is visible from the screen the app opens on -
 * a review step nobody is reminded of is a review step that does not happen.
 *
 * Renders nothing when there is nothing waiting.
 */
export const ChangeLogCard: React.FC<ChangeLogCardProps> = ({ onReview }) => {
  const pending = useLiveQuery(() => pendingConfirmation(), [], []);

  if (pending.length === 0) return null;

  // Newest first, and only a glimpse - the tab is where the list belongs.
  const preview = [...pending].reverse().slice(0, 2);

  return (
    <button
      onClick={onReview}
      className="w-full text-left glass-card p-4 border-emerald-500/40 hover:border-emerald-400/60 transition-all flex items-center gap-3"
    >
      <div className="w-10 h-10 rounded-xl bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 flex items-center justify-center flex-shrink-0">
        <ClipboardCheck className="w-5 h-5" />
      </div>

      <div className="min-w-0 flex-1">
        <h2 className="text-sm font-bold text-white">
          {pending.length} update{pending.length === 1 ? '' : 's'} to confirm
        </h2>
        <p className="text-[11px] text-slate-400 truncate">
          {preview.map((e) => `${CATEGORY_ICON[e.category]} ${e.summary}`).join(' · ')}
          {pending.length > preview.length ? ' · and more' : ''}
        </p>
      </div>

      <span className="flex items-center gap-1 text-[11px] font-bold text-emerald-300 flex-shrink-0">
        <span className="hidden sm:inline">Review</span>
        <ChevronRight className="w-4 h-4" />
      </span>
    </button>
  );
};

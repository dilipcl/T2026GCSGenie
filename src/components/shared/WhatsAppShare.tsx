import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db';
import { buildChatUrl, formatE164, WHATSAPP_ACTION_LABEL } from '../../services/whatsappService';
import { useFeedback } from './FeedbackProvider';
import { Copy, MessageCircle, Check } from 'lucide-react';

interface WhatsAppShareProps {
  /** The finished message. Built by whatsappService, never assembled here. */
  text: string;
  /** Shown above the buttons so nothing is ever sent unseen. */
  previewLabel?: string;
  compact?: boolean;
  className?: string;
  /**
   * Called once the link has been handed to the OS. Deliberately not named
   * `onSent`: opening is all this component can observe, and a callback named
   * for sending would invite callers to record something that did not happen.
   */
  onOpened?: () => void;
}

/**
 * Sharing one message with the family.
 *
 * Three rules, all of them deliberate:
 *
 *  - The message is shown before it can be sent. This is a fourteen year old's
 *    week going to their parents; a share button that fires blind is a share
 *    button that gets avoided.
 *  - Nothing is ever dispatched automatically. Opening the link is a tap.
 *  - The app never claims the message was sent. It cannot know - on desktop
 *    `wa.me` lands on WhatsApp Web and can stop at a login screen - so the
 *    button says "Open in WhatsApp" and the copy fallback is always there.
 */
export const WhatsAppShare: React.FC<WhatsAppShareProps> = ({
  text,
  previewLabel = 'This is what gets sent',
  compact = false,
  className = '',
  onOpened,
}) => {
  const { toast } = useFeedback();
  const [showPreview, setShowPreview] = useState(false);
  const [copied, setCopied] = useState(false);

  const settings = useLiveQuery(() => db.parentSettings.get('active_settings'), []);
  const numbers = settings?.parentWhatsAppNumbers?.filter((n) => n.e164) ?? [];

  const open = (e164?: string) => {
    // A new tab, so an unsaved check-in behind this is never navigated away.
    window.open(buildChatUrl(text, e164), '_blank', 'noopener,noreferrer');
    onOpened?.();
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access is refused in plenty of ordinary situations - an
      // insecure origin, a locked-down browser. Falling back to the preview
      // lets the message still be selected by hand.
      setShowPreview(true);
      toast.error('Could not copy that', 'The message is shown below — select and copy it.');
    }
  };

  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      <div className="flex flex-wrap items-center gap-2">
        {numbers.length <= 1 ? (
          <button
            type="button"
            onClick={() => open(numbers[0]?.e164)}
            className={`flex items-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold transition-all ${
              compact ? 'px-3 py-2 text-[11px]' : 'px-4 py-2.5 text-xs'
            }`}
          >
            <MessageCircle className="w-3.5 h-3.5" />
            <span>{WHATSAPP_ACTION_LABEL}</span>
          </button>
        ) : (
          numbers.map((n) => (
            <button
              key={n.id}
              type="button"
              onClick={() => open(n.e164)}
              title={formatE164(n.e164)}
              className={`flex items-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold transition-all ${
                compact ? 'px-3 py-2 text-[11px]' : 'px-4 py-2.5 text-xs'
              }`}
            >
              <MessageCircle className="w-3.5 h-3.5" />
              <span>{n.label || WHATSAPP_ACTION_LABEL}</span>
            </button>
          ))
        )}

        <button
          type="button"
          onClick={copy}
          className={`flex items-center gap-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-semibold transition-all ${
            compact ? 'px-3 py-2 text-[11px]' : 'px-3.5 py-2.5 text-xs'
          }`}
        >
          {copied ? (
            <Check className="w-3.5 h-3.5 text-emerald-400" />
          ) : (
            <Copy className="w-3.5 h-3.5 text-slate-400" />
          )}
          <span>{copied ? 'Copied' : 'Copy message'}</span>
        </button>

        <button
          type="button"
          onClick={() => setShowPreview((p) => !p)}
          className="text-[11px] text-indigo-400 hover:text-indigo-300 font-medium underline underline-offset-2"
        >
          {showPreview ? 'Hide' : previewLabel}
        </button>
      </div>

      {numbers.length === 0 && (
        <p className="text-[10px] text-slate-500">
          No family number saved yet, so WhatsApp will ask who to send it to. A parent can save one
          in the Parent Portal.
        </p>
      )}

      {showPreview && (
        <pre className="text-[10px] leading-relaxed text-slate-300 bg-slate-950/80 border border-slate-800 rounded-xl p-3 whitespace-pre-wrap font-sans max-h-64 overflow-y-auto">
          {text}
        </pre>
      )}
    </div>
  );
};

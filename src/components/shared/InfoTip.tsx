import React, { useEffect, useRef, useState } from 'react';
import { Info, X } from 'lucide-react';
import { useEscapeToClose } from '../../hooks/useEscapeToClose';

interface InfoTipProps {
  /** What the icon is explaining, for screen readers: "What XP means". */
  label: string;
  children: React.ReactNode;
  className?: string;
}

/**
 * A round "i" beside a number that the app never explains.
 *
 * The app is full of figures a fourteen year old is expected to act on -
 * a health score, a buffer, a committed-versus-capacity pair - and none of them
 * said what they meant. A number nobody understands is a number nobody trusts,
 * and an untrusted number gets ignored rather than questioned.
 *
 * Closes on outside tap and on Escape, through the same hook every dialog uses.
 */
export const InfoTip: React.FC<InfoTipProps> = ({ label, children, className }) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLSpanElement>(null);

  useEscapeToClose(isOpen, () => setIsOpen(false));

  useEffect(() => {
    if (!isOpen) return;
    const onPointerDown = (event: MouseEvent | TouchEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setIsOpen(false);
    };
    // Capture phase: a tip inside a card whose own click handler opens a modal
    // would otherwise navigate away before the tip had a chance to close.
    document.addEventListener('mousedown', onPointerDown, true);
    document.addEventListener('touchstart', onPointerDown, true);
    return () => {
      document.removeEventListener('mousedown', onPointerDown, true);
      document.removeEventListener('touchstart', onPointerDown, true);
    };
  }, [isOpen]);

  return (
    <span ref={containerRef} className={`relative inline-flex align-middle ${className ?? ''}`}>
      <button
        type="button"
        aria-label={label}
        aria-expanded={isOpen}
        onClick={(e) => {
          // The tip often sits inside a clickable card.
          e.stopPropagation();
          setIsOpen((prev) => !prev);
        }}
        className={`w-4 h-4 rounded-full border flex items-center justify-center transition-colors ${
          isOpen
            ? 'bg-indigo-600 border-indigo-400 text-white'
            : 'bg-slate-800 border-slate-600 text-slate-400 hover:text-white hover:border-slate-400'
        }`}
      >
        <Info className="w-2.5 h-2.5" />
      </button>

      {isOpen && (
        <span
          role="tooltip"
          onClick={(e) => e.stopPropagation()}
          className="absolute left-1/2 top-6 -translate-x-1/2 z-50 w-60 max-w-[75vw] p-3 rounded-xl bg-slate-900 border border-slate-600 shadow-2xl text-left"
        >
          <span className="flex items-start justify-between gap-2">
            <span className="block text-[11px] font-bold text-white">{label}</span>
            <button
              type="button"
              aria-label="Close"
              onClick={(e) => {
                e.stopPropagation();
                setIsOpen(false);
              }}
              className="text-slate-500 hover:text-white -mt-0.5"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </span>
          <span className="block mt-1 text-[11px] leading-relaxed text-slate-300 font-normal normal-case tracking-normal">
            {children}
          </span>
        </span>
      )}
    </span>
  );
};

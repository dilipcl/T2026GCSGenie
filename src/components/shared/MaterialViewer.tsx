import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ProofAttachment } from '../../types';
import { formatBytes, openAttachmentInNewTab } from '../../services/attachmentService';
import { useEscapeToClose } from '../../hooks/useEscapeToClose';
import { X, ExternalLink, Maximize2, CloudOff } from 'lucide-react';

/**
 * A photograph of Tejas's work, full size, wherever it is mentioned.
 *
 * The thing being fixed is not cosmetic. Photos of homework were stored
 * faithfully and then shown nowhere: the uploader that took them could open one,
 * and every screen that later said "here is the proof for this" rendered the
 * filename as grey text with no way to see the page. A parent asking "did he
 * actually do it" could reach the answer only by finding the record that owns
 * the file and expanding its editor.
 *
 * A dialog rather than a new tab, because the question is nearly always asked
 * while reading something else - a day in the record, a row in the evidence
 * check - and a tab switch loses the place. Full size in a tab is still one tap
 * away for the cases where a photograph of a worked example has to be read
 * closely.
 *
 * Rendered through a portal, which is the part that is not optional. Every
 * other modal in the app is mounted at the top of the tree by `App`; this one
 * is opened from a chip buried inside whatever card lists the material, and
 * `.glass-card` carries `backdrop-filter: blur(12px)`. A filtered ancestor
 * becomes the containing block for its `position: fixed` descendants, so
 * `fixed inset-0` sized itself to the evidence row rather than the screen - a
 * 1400px page of notes in a 190px letterbox, with the footer squeezed out of
 * existence. Nothing about the markup looks wrong; the cause is three
 * components further up.
 */
export const MaterialViewer: React.FC<{
  attachment: ProofAttachment;
  onClose: () => void;
}> = ({ attachment, onClose }) => {
  const [objectUrl, setObjectUrl] = useState<string | undefined>(undefined);
  /**
   * Set when the browser cannot decode the file it was handed.
   *
   * HEIC is the case that matters: an iPhone screenshot or photo arrives as
   * `image/heic`, which passes every "is this an image" test in the app and
   * which Chrome cannot render. The viewer opened on a blank box and said
   * nothing, which looks exactly like the fault this screen was built to fix.
   */
  const [undecodable, setUndecodable] = useState(false);

  useEscapeToClose(true, onClose);

  /**
   * One URL per open, revoked on close. A term of proof is a few hundred
   * megabytes; holding a URL per photograph for the lifetime of the app is how
   * a phone tab gets killed in the background.
   */
  useEffect(() => {
    const url = URL.createObjectURL(attachment.blob);
    setObjectUrl(url);
    setUndecodable(false);
    return () => URL.revokeObjectURL(url);
  }, [attachment.id, attachment.blob]);

  const isImage = attachment.mimeType.startsWith('image/') && !undecodable;
  const backedUp = !!attachment.driveMirroredAt || !!attachment.driveViewUrl;

  return createPortal(
    <div
      className="fixed inset-0 z-[70] bg-slate-950/90 flex items-center justify-center p-3"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={attachment.caption || attachment.fileName}
    >
      <div
        className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-3xl max-h-full flex flex-col overflow-hidden"
        // A click on the photograph itself must not dismiss the thing the
        // person opened in order to look at it.
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-2 px-3 py-2 border-b border-slate-800">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold text-white truncate">
              {attachment.caption?.trim() || attachment.fileName}
            </p>
            <p className="text-[10px] text-slate-500">
              {formatBytes(attachment.byteSize)}
              {attachment.caption?.trim() ? ` · ${attachment.fileName}` : ''}
              {!backedUp && (
                <span className="text-amber-400/90">
                  {' '}
                  · only on this device
                </span>
              )}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/**
         * Height comes from the photograph, not from `flex-1`.
         *
         * `flex-1` sets `flex-basis: 0`, so inside a column that is sized by its
         * own content the image contributed nothing to the height and the box
         * collapsed to its `min-h` - a 1400px page of notes rendered as a
         * 190px letterbox you had to scroll inside. The dialog is capped
         * instead, and the photo is capped to match.
         */}
        <div className="overflow-auto bg-slate-950 flex items-center justify-center min-h-[12rem] max-h-[72vh]">
          {isImage && objectUrl ? (
            <img
              src={objectUrl}
              alt={attachment.caption || attachment.fileName}
              onError={() => setUndecodable(true)}
              className="max-w-full max-h-[72vh] object-contain"
            />
          ) : (
            /* PDFs and anything else. Embedding a PDF in a dialog on a phone
               produces a scroll trap inside a scroll trap; the tab is better. */
            <div className="m-6 text-center">
              {undecodable && (
                <p className="text-[11px] text-amber-300 mb-2 max-w-sm leading-snug">
                  This browser cannot display a {attachment.mimeType || 'file'} in the page. The
                  file is intact — opening it hands it to whatever does. An iPhone photo saved as
                  HEIC is the usual reason; "Most Compatible" in iOS camera settings saves JPEGs
                  instead.
                </p>
              )}
              <button
                type="button"
                onClick={() => openAttachmentInNewTab(attachment)}
                className="px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold inline-flex items-center gap-1.5"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Open {attachment.fileName}</span>
              </button>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-1.5 px-3 py-2 border-t border-slate-800">
          {isImage && (
            <button
              type="button"
              onClick={() => openAttachmentInNewTab(attachment)}
              className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-[11px] font-semibold text-slate-200 flex items-center gap-1.5"
            >
              <Maximize2 className="w-3 h-3" />
              <span>Full size</span>
            </button>
          )}

          {/* Only offered when a URL actually exists. The folder transport never
              learns the id Drive assigns, so most mirrored files have none. */}
          {attachment.driveViewUrl && (
            <a
              href={attachment.driveViewUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-[11px] font-semibold text-indigo-300 flex items-center gap-1.5"
            >
              <ExternalLink className="w-3 h-3" />
              <span>Open in Drive</span>
            </a>
          )}

          {!backedUp && (
            <span className="px-2 py-1 text-[10px] text-amber-300/90 flex items-center gap-1">
              <CloudOff className="w-3 h-3" />
              <span>Not copied to Drive yet — a backup would not carry it.</span>
            </span>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};

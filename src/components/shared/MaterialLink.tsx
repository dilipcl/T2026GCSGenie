import React, { useState } from 'react';
import { ProofAttachment, ActivityAttachmentLink } from '../../types';
import { EvidenceRef } from '../../services/evidenceService';
import { getAttachment } from '../../services/attachmentService';
import { MaterialViewer } from './MaterialViewer';
import { useFeedback } from './FeedbackProvider';
import { Paperclip, Link as LinkIcon, Loader2 } from 'lucide-react';

/**
 * One chip for one piece of captured material, wherever it is listed.
 *
 * There were three of these, on three screens, each deciding for itself what a
 * file without a Drive URL looks like - and all three decided it looks like
 * grey text you cannot click. The reasoning was sound about links and wrong
 * about files: a photograph with no URL is not a broken link, it is a blob in
 * this device's database, and it opens.
 *
 * So the three styles collapse to one, and the distinction they were encoding
 * moves to where it belongs. Whether something is *openable* is no longer a
 * visual state, because nearly everything is. Whether a file has been copied
 * out of the database - which is what actually decides if it survives a
 * restore - is now the only thing the chip reports, and it reports it quietly,
 * because it is a backup fact and not a reason to distrust the work.
 */

export interface MaterialLinkProps {
  kind: 'FILE' | 'LINK';
  /** What to call it: a caption, a filename, or the label on a link. */
  label: string;
  /** An address that opens anywhere. A Drive URL, or a link held on the record. */
  url?: string;
  /** The row in `attachments`, when the material is a file we hold. */
  attachmentId?: string;
  /** Mirrored into the Drive folder, which yields no URL. Still openable here. */
  savedWithoutLink?: boolean;
  /** `xs` for dense rows (the day record), `sm` elsewhere. */
  size?: 'xs' | 'sm';
}

const SIZES = {
  xs: {
    chip: 'px-1.5 py-0.5 text-[10px]',
    icon: 'w-2.5 h-2.5',
    label: 'max-w-[10rem]',
  },
  sm: {
    chip: 'px-2 py-0.5 text-[10px]',
    icon: 'w-3 h-3',
    label: 'max-w-[12rem]',
  },
} as const;

const OPENABLE =
  'bg-indigo-500/10 border-indigo-500/30 text-indigo-300 hover:bg-indigo-500/20';
const INERT = 'bg-slate-800/60 border-slate-800 text-slate-500';

/** An `EvidenceRef` from `evidenceService`, ready to render. */
export function materialFromEvidence(ref: EvidenceRef): MaterialLinkProps {
  return {
    kind: ref.kind,
    label: ref.label,
    url: ref.url,
    attachmentId: ref.attachmentId,
    savedWithoutLink: ref.savedWithoutLink,
  };
}

/** A row straight from `attachments`, for screens that already loaded them. */
export function materialFromProofAttachment(file: ProofAttachment): MaterialLinkProps {
  return {
    kind: 'FILE',
    label: file.caption?.trim() || file.fileName,
    url: file.driveViewUrl,
    attachmentId: file.id,
    savedWithoutLink: !!file.driveMirroredAt && !file.driveViewUrl,
  };
}

/** The activity feed's own attachment shape, which already carried the id. */
export function materialFromAttachment(file: ActivityAttachmentLink): MaterialLinkProps {
  return {
    kind: 'FILE',
    label: file.fileName,
    url: file.driveViewUrl,
    attachmentId: file.attachmentId,
    savedWithoutLink: file.mirroredWithoutLink,
  };
}

export const MaterialLink: React.FC<MaterialLinkProps> = ({
  kind,
  label,
  url,
  attachmentId,
  savedWithoutLink,
  size = 'sm',
}) => {
  const { toast } = useFeedback();
  const [viewing, setViewing] = useState<ProofAttachment | undefined>(undefined);
  const [loading, setLoading] = useState(false);

  const style = SIZES[size];
  const Icon = kind === 'LINK' ? LinkIcon : Paperclip;

  /**
   * A file that has been copied somewhere outside the database - either
   * transport counts. Reported only when it has not, because "backed up" is the
   * expected case and a badge on every row would be read as decoration.
   */
  const backedUp = !!url || !!savedWithoutLink;

  /**
   * Read on click rather than on mount.
   *
   * A day in the record can list a dozen files. Probing each one's blob to
   * decide how to draw its chip would be a dozen round trips for a badge, which
   * is the mistake `attachmentCountsFor` exists to avoid. The cost of deciding
   * late is that a file whose blob has not reached this device yet looks
   * openable until it is tapped - so the tap says what happened rather than
   * doing nothing.
   */
  const open = async () => {
    if (!attachmentId || loading) return;
    setLoading(true);
    try {
      const attachment = await getAttachment(attachmentId);

      if (!attachment?.blob) {
        toast.error(
          'That file is not on this device yet',
          url
            ? 'It was added somewhere else and has not synced here. Open it in Drive instead.'
            : 'It was added somewhere else and has not synced here. Check the sync badge in the header.'
        );
        return;
      }

      /**
       * Everything opens in the viewer, images and otherwise.
       *
       * A PDF used to go straight to `window.open` from here, and it silently
       * did nothing: this handler awaits the database read first, and a browser
       * only treats `window.open` as user-initiated inside the *synchronous*
       * part of a click. After an await it is a popup, and popups are blocked
       * without a word. The viewer's own "open" button is a real click on a
       * file it already holds, so it works - and a file that would not open was
       * exactly the fault this whole component exists to fix.
       */
      setViewing(attachment);
    } catch (err) {
      console.error('Could not open the attachment:', err);
      toast.error('Could not open that file', 'Nothing was lost - try again.');
    } finally {
      setLoading(false);
    }
  };

  const body = (
    <>
      {loading ? (
        <Loader2 className={`${style.icon} flex-shrink-0 animate-spin`} />
      ) : (
        <Icon className={`${style.icon} flex-shrink-0`} />
      )}
      <span className={`truncate ${style.label}`}>{label}</span>
      {kind === 'FILE' && !backedUp && (
        <span className="opacity-70 whitespace-nowrap">· not backed up</span>
      )}
    </>
  );

  // Files we hold open here. Preferred over the Drive URL even when there is
  // one: the local copy opens offline, opens in place, and is the same file.
  if (attachmentId) {
    return (
      <>
        <button
          type="button"
          onClick={open}
          title={
            backedUp
              ? label
              : `${label} — held in this device's database. A backup would not carry it until Drive is connected.`
          }
          className={`inline-flex items-center gap-1 rounded-lg border transition-colors ${style.chip} ${OPENABLE}`}
        >
          {body}
        </button>

        {viewing && (
          <MaterialViewer attachment={viewing} onClose={() => setViewing(undefined)} />
        )}
      </>
    );
  }

  if (url) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        title={url}
        className={`inline-flex items-center gap-1 rounded-lg border transition-colors ${style.chip} ${OPENABLE}`}
      >
        {body}
      </a>
    );
  }

  /**
   * Neither an id nor an address. Reachable only for a record that names proof
   * the app does not hold, so it stays honest rather than pretending to open.
   */
  return (
    <span
      title={`${label} — nothing the app can open.`}
      className={`inline-flex items-center gap-1 rounded-lg border ${style.chip} ${INERT}`}
    >
      {body}
    </span>
  );
};

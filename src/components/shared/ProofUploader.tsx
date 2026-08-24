import React, { useEffect, useState } from 'react';
import { ProofAttachment } from '../../types';
import {
  addAttachment,
  deleteAttachment,
  getAttachmentsFor,
  formatBytes,
} from '../../services/attachmentService';
import { Camera, FileText, Trash2, Loader2 } from 'lucide-react';

interface ProofUploaderProps {
  ownerType: ProofAttachment['ownerType'];
  ownerId: string;
  /** Called after every add or remove, with the current attachment ids. */
  onChange?: (attachmentIds: string[]) => void;
  label?: string;
  hint?: string;
  readOnly?: boolean;
}

/**
 * Attach photographs of the actual paper to a record.
 *
 * Object URLs are created per render pass and revoked on cleanup - holding them
 * for the lifetime of the component would leak a few megabytes every time a
 * test with a dozen photos is opened and closed.
 */
export const ProofUploader: React.FC<ProofUploaderProps> = ({
  ownerType,
  ownerId,
  onChange,
  label = 'Proof',
  hint = 'Photograph the question paper, your answers, and the mark scheme.',
  readOnly = false,
}) => {
  const [attachments, setAttachments] = useState<ProofAttachment[]>([]);
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = async () => {
    const list = await getAttachmentsFor(ownerType, ownerId);
    setAttachments(list);
    onChange?.(list.map((a) => a.id));
  };

  useEffect(() => {
    reload();
    // ownerId changes when a draft record is saved and gains its real id
  }, [ownerType, ownerId]);

  useEffect(() => {
    const urls: Record<string, string> = {};
    for (const att of attachments) {
      if (att.mimeType.startsWith('image/')) urls[att.id] = URL.createObjectURL(att.blob);
    }
    setPreviews(urls);

    return () => {
      for (const url of Object.values(urls)) URL.revokeObjectURL(url);
    };
  }, [attachments]);

  const handleFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    setIsUploading(true);
    setError(null);
    try {
      for (const file of files) {
        await addAttachment(ownerType, ownerId, file);
      }
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not attach that file.');
    } finally {
      setIsUploading(false);
      // Allow re-selecting the same file after a failure
      e.target.value = '';
    }
  };

  const handleRemove = async (att: ProofAttachment) => {
    if (!confirm(`Remove "${att.fileName}"?`)) return;
    await deleteAttachment(att.id);
    await reload();
  };

  const openInTab = (att: ProofAttachment) => {
    const url = URL.createObjectURL(att.blob);
    window.open(url, '_blank', 'noopener');
    // The new tab holds its own reference; release ours once it has loaded
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
  };

  const totalBytes = attachments.reduce((sum, a) => sum + a.byteSize, 0);

  return (
    <div>
      <div className="flex items-baseline justify-between mb-1.5">
        <label className="block text-xs font-bold text-slate-300 uppercase">{label}</label>
        {attachments.length > 0 && (
          <span className="text-[11px] text-slate-400">
            {attachments.length} file{attachments.length === 1 ? '' : 's'} · {formatBytes(totalBytes)}
          </span>
        )}
      </div>

      {!readOnly && (
        <label className="flex items-center justify-center gap-2 w-full py-3 rounded-xl border border-dashed border-slate-600 bg-slate-800/50 text-slate-300 text-xs font-semibold cursor-pointer hover:bg-slate-800 hover:border-indigo-500/60 transition-all">
          {isUploading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin text-indigo-400" />
              <span>Processing...</span>
            </>
          ) : (
            <>
              <Camera className="w-4 h-4 text-indigo-400" />
              <span>Add photo or PDF</span>
            </>
          )}
          <input
            type="file"
            accept="image/*,application/pdf"
            multiple
            capture="environment"
            onChange={handleFiles}
            disabled={isUploading}
            className="hidden"
          />
        </label>
      )}

      {hint && !readOnly && <p className="text-[10px] text-slate-500 mt-1.5">{hint}</p>}

      {error && (
        <p className="mt-2 text-[11px] text-rose-400 font-semibold" role="alert">
          {error}
        </p>
      )}

      {attachments.length > 0 && (
        <div className="grid grid-cols-3 gap-2 mt-3">
          {attachments.map((att) => (
            <div
              key={att.id}
              className="relative group rounded-xl overflow-hidden border border-slate-700 bg-slate-800"
            >
              <button
                type="button"
                onClick={() => openInTab(att)}
                title={`${att.fileName} (${formatBytes(att.byteSize)})`}
                className="block w-full aspect-square"
              >
                {previews[att.id] ? (
                  <img
                    src={previews[att.id]}
                    alt={att.caption || att.fileName}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span className="w-full h-full flex flex-col items-center justify-center gap-1 text-slate-400 p-2">
                    <FileText className="w-6 h-6" />
                    <span className="text-[9px] truncate w-full text-center">{att.fileName}</span>
                  </span>
                )}
              </button>

              {!readOnly && (
                <button
                  type="button"
                  onClick={() => handleRemove(att)}
                  aria-label={`Remove ${att.fileName}`}
                  className="absolute top-1 right-1 p-1 rounded-lg bg-slate-950/80 text-slate-300 hover:text-rose-400 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

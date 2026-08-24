import React, { useEffect, useState } from 'react';
import { db } from '../../db';
import { SyllabusTopic } from '../../types';
import { logAuditEvent } from '../../services/auditService';
import { SUBJECT_DRIVE_FOLDERS } from '../../db/driveFolders';
import { ProofUploader } from '../shared/ProofUploader';
import { useFeedback } from '../shared/FeedbackProvider';
import { Link as LinkIcon, ExternalLink, Check } from 'lucide-react';

interface TopicMaterialPanelProps {
  topic: SyllabusTopic;
  onChanged: () => void;
}

/**
 * Everything backing one syllabus topic: where its notes live, and photographs
 * of the hard copy.
 *
 * Genie is the index, Drive holds the filed material, and the photos here are
 * the quick captures that would otherwise never be filed at all - a page of
 * worked examples, a handout, a diagram off the board. Kept behind an expander
 * because the checklist is scanned far more often than it is added to.
 */
export const TopicMaterialPanel: React.FC<TopicMaterialPanelProps> = ({ topic, onChanged }) => {
  const { toast } = useFeedback();
  const [notesUrl, setNotesUrl] = useState(topic.driveNotesUrl || '');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setNotesUrl(topic.driveNotesUrl || '');
  }, [topic.id, topic.driveNotesUrl]);

  const trimmed = notesUrl.trim();
  const isDirty = trimmed !== (topic.driveNotesUrl || '').trim();

  const handleSaveLink = async () => {
    if (!isDirty || isSaving) return;
    setIsSaving(true);
    try {
      await db.syllabusTopics.update(topic.id, { driveNotesUrl: trimmed || undefined });
      await logAuditEvent({
        user: 'STUDENT',
        action: 'UPDATE',
        entity: 'SyllabusTopic',
        entityId: topic.id,
        fieldChanged: 'driveNotesUrl',
        oldValue: topic.driveNotesUrl || '(none)',
        newValue: trimmed || '(cleared)',
      });
      toast.success(trimmed ? 'Notes link saved' : 'Notes link removed');
      onChanged();
    } catch (err) {
      console.error('Could not save the notes link:', err);
      toast.error('Could not save that link', 'Nothing was lost - try again.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="mt-2.5 pt-2.5 border-t border-slate-700/60 space-y-3">
      <div>
        <label
          htmlFor={`notes-${topic.id}`}
          className="block text-[10px] font-bold text-slate-300 uppercase mb-1 flex items-center gap-1"
        >
          <LinkIcon className="w-3 h-3 text-teal-400" />
          <span>Notes link</span>
        </label>
        <div className="flex gap-1.5">
          <input
            id={`notes-${topic.id}`}
            type="url"
            placeholder="NotebookLM, a Google Doc, or a file in the subject folder"
            value={notesUrl}
            onChange={(e) => setNotesUrl(e.target.value)}
            onBlur={handleSaveLink}
            onKeyDown={(e) => {
              // Blur alone is not enough on a phone, where the keyboard's
              // "go" often does not move focus anywhere
              if (e.key === 'Enter') {
                e.preventDefault();
                handleSaveLink();
              }
            }}
            className="flex-1 min-w-0 bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-[11px] text-white placeholder-slate-500 focus:outline-none focus:border-teal-500"
          />
          {isDirty && (
            <button
              type="button"
              onClick={handleSaveLink}
              disabled={isSaving}
              className="px-2.5 rounded-lg bg-teal-600 hover:bg-teal-500 text-white text-[11px] font-bold flex items-center gap-1 disabled:opacity-50"
            >
              <Check className="w-3 h-3" />
              <span>Save</span>
            </button>
          )}
        </div>
        {!trimmed && (
          <a
            href={SUBJECT_DRIVE_FOLDERS[topic.subjectId]}
            target="_blank"
            rel="noreferrer"
            className="text-[10px] text-slate-500 hover:text-teal-400 hover:underline flex items-center gap-0.5 mt-1"
          >
            <span>No link yet - open the subject folder in Drive</span>
            <ExternalLink className="w-2.5 h-2.5" />
          </a>
        )}
      </div>

      <ProofUploader
        ownerType="TOPIC"
        ownerId={topic.id}
        onChange={onChanged}
        label="Photos"
        hint="A page of worked examples, a handout, a diagram off the board."
      />
    </div>
  );
};

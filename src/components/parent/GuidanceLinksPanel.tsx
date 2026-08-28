import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db';
import { CareerGuidanceResource, FreeRevisionLink, SubjectId } from '../../types';
import { logAuditEvent, logFieldChanges } from '../../services/auditService';
import { useFeedback } from '../shared/FeedbackProvider';
import { newId } from '../../utils/id';
import { Compass, Plus, PencilLine, Trash2, X, ExternalLink } from 'lucide-react';

type LinkKind = 'REVISION' | 'CAREER';

const REVISION_TYPES: FreeRevisionLink['type'][] = [
  'PAST_PAPERS',
  'VIDEO_TUTORIALS',
  'INTERACTIVE',
  'SUMMARY_NOTES',
];

const CAREER_CATEGORIES: CareerGuidanceResource['category'][] = [
  'A_LEVELS',
  'UNIVERSITY_DEGREE',
  'DEGREE_APPRENTICESHIP',
  'CAREER_INSIGHT',
];

const label = (value: string) => value.replace(/_/g, ' ').toLowerCase();

/**
 * Revision sites and career pathways a family adds themselves.
 *
 * Both lists shipped as a read-only seed. The seed is a reasonable starting
 * point and a poor permanent answer: the sixth form's own site, the link a
 * teacher hands out in class, the apprenticeship scheme this family is actually
 * interested in - none of it could be added without a code change, so the tab
 * slowly stopped matching what anyone was really using.
 */
export const GuidanceLinksPanel: React.FC = () => {
  const { toast, confirm } = useFeedback();
  const revisionLinks = useLiveQuery(() => db.revisionLinks.toArray(), [], []);
  const careers = useLiveQuery(() => db.careerResources.toArray(), [], []);
  const subjects = useLiveQuery(() => db.subjects.toArray(), [], []);

  const [kind, setKind] = useState<LinkKind>('REVISION');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [url, setUrl] = useState('');
  const [icon, setIcon] = useState('🔗');
  const [subjectId, setSubjectId] = useState<SubjectId | ''>('');
  const [revisionType, setRevisionType] = useState<FreeRevisionLink['type']>('SUMMARY_NOTES');
  const [careerCategory, setCareerCategory] =
    useState<CareerGuidanceResource['category']>('CAREER_INSIGHT');
  const [requiredGrade, setRequiredGrade] = useState(7);

  const resetForm = () => {
    setTitle('');
    setDescription('');
    setUrl('');
    setIcon('🔗');
    setSubjectId('');
    setRevisionType('SUMMARY_NOTES');
    setCareerCategory('CAREER_INSIGHT');
    setRequiredGrade(7);
  };

  const openNew = (nextKind: LinkKind) => {
    setKind(nextKind);
    setEditingId(null);
    resetForm();
    setIsFormOpen(true);
  };

  const openRevision = (link: FreeRevisionLink) => {
    setKind('REVISION');
    setEditingId(link.id);
    setTitle(link.title);
    setDescription(link.description);
    setUrl(link.url);
    setSubjectId(link.subjectId);
    setRevisionType(link.type);
    setIsFormOpen(true);
  };

  const openCareer = (resource: CareerGuidanceResource) => {
    setKind('CAREER');
    setEditingId(resource.id);
    setTitle(resource.title);
    setDescription(resource.description);
    setUrl(resource.externalUrl || '');
    setIcon(resource.icon || '🎓');
    setSubjectId(resource.relevantSubjectIds[0] ?? '');
    setCareerCategory(resource.category);
    setRequiredGrade(resource.requiredGCSEGrade);
    setIsFormOpen(true);
  };

  const closeForm = () => {
    setIsFormOpen(false);
    setEditingId(null);
  };

  const canSave =
    title.trim().length > 0 &&
    (kind === 'CAREER' || (!!subjectId && url.trim().length > 0));

  const handleSave = async () => {
    if (!canSave || busy) return;
    setBusy(true);

    try {
      if (kind === 'REVISION') {
        const fields = {
          title: title.trim(),
          description: description.trim(),
          url: url.trim(),
          subjectId: subjectId as SubjectId,
          type: revisionType,
        };

        if (editingId) {
          const before = revisionLinks.find((l) => l.id === editingId);
          await db.revisionLinks.update(editingId, fields);
          if (before) {
            await logFieldChanges({
              user: 'PARENT',
              entity: 'FreeRevisionLink',
              entityId: editingId,
              before: before as unknown as Record<string, unknown>,
              after: fields as unknown as Record<string, unknown>,
            });
          }
          toast.success('Link updated', fields.title);
        } else {
          const created: FreeRevisionLink = { id: newId('link'), ...fields };
          await db.revisionLinks.add(created);
          await logAuditEvent({
            user: 'PARENT',
            action: 'INSERT',
            entity: 'FreeRevisionLink',
            entityId: created.id,
            newValue: `${created.title} (${created.subjectId})`,
          });
          toast.success('Link added', created.title);
        }
      } else {
        const fields = {
          title: title.trim(),
          description: description.trim(),
          externalUrl: url.trim() || undefined,
          icon: icon.trim() || '🎓',
          category: careerCategory,
          requiredGCSEGrade: Math.min(9, Math.max(1, Math.round(requiredGrade))),
          relevantSubjectIds: subjectId ? [subjectId as SubjectId] : [],
        };

        if (editingId) {
          const before = careers.find((c) => c.id === editingId);
          await db.careerResources.update(editingId, fields);
          if (before) {
            await logFieldChanges({
              user: 'PARENT',
              entity: 'CareerGuidanceResource',
              entityId: editingId,
              before: before as unknown as Record<string, unknown>,
              after: fields as unknown as Record<string, unknown>,
            });
          }
          toast.success('Pathway updated', fields.title);
        } else {
          const created: CareerGuidanceResource = { id: newId('career'), ...fields };
          await db.careerResources.add(created);
          await logAuditEvent({
            user: 'PARENT',
            action: 'INSERT',
            entity: 'CareerGuidanceResource',
            entityId: created.id,
            newValue: `${created.title} (${created.category})`,
          });
          toast.success('Pathway added', created.title);
        }
      }

      closeForm();
    } catch (err) {
      console.error('Could not save that link:', err);
      toast.error('Could not save that', 'Nothing was changed.');
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (
    entity: 'FreeRevisionLink' | 'CareerGuidanceResource',
    id: string,
    name: string
  ) => {
    const ok = await confirm({
      title: `Remove "${name}"?`,
      body: 'It disappears from Help & Careers. Removing it is recorded in the change history.',
      confirmLabel: 'Remove',
      tone: 'danger',
    });
    if (!ok) return;

    if (entity === 'FreeRevisionLink') await db.revisionLinks.delete(id);
    else await db.careerResources.delete(id);

    await logAuditEvent({
      user: 'PARENT',
      action: 'DELETE',
      entity,
      entityId: id,
      oldValue: name,
    });
    toast.info(`Removed "${name}"`);
  };

  return (
    <div className="glass-card p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4 pb-3 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <Compass className="w-5 h-5 text-teal-400" />
          <div>
            <h3 className="font-bold text-sm text-white">Revision sites &amp; career pathways</h3>
            <p className="text-[11px] text-slate-400">
              What shows under Help &amp; Careers. Add the ones this family actually uses.
            </p>
          </div>
        </div>

        {!isFormOpen && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => openNew('REVISION')}
              className="px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              <span>Revision site</span>
            </button>
            <button
              onClick={() => openNew('CAREER')}
              className="px-3 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-bold text-xs flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              <span>Pathway</span>
            </button>
          </div>
        )}
      </div>

      {isFormOpen && (
        <div className="mb-4 p-4 bg-slate-800/60 border border-slate-700 rounded-2xl space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold text-indigo-300 uppercase">
              {editingId ? 'Edit' : 'New'} {kind === 'REVISION' ? 'revision site' : 'career pathway'}
            </h4>
            <button onClick={closeForm} aria-label="Cancel" className="p-1 text-slate-400 hover:text-white">
              <X className="w-4 h-4" />
            </button>
          </div>

          <input
            type="text"
            placeholder="Title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-2 text-xs text-white placeholder-slate-500"
          />

          <input
            type="text"
            placeholder="One line on what it is good for"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-2 text-xs text-white placeholder-slate-500"
          />

          <input
            type="url"
            placeholder={kind === 'REVISION' ? 'https://…' : 'https://… (optional)'}
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-2 text-xs text-white placeholder-slate-500"
          />

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[10px] font-bold text-slate-300 uppercase mb-1">
                Subject {kind === 'CAREER' && <span className="normal-case font-normal text-slate-500">(optional)</span>}
              </label>
              <select
                value={subjectId}
                onChange={(e) => setSubjectId(e.target.value as SubjectId | '')}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-2 text-xs text-white"
              >
                <option value="">{kind === 'CAREER' ? 'Not subject-specific' : 'Pick one'}</option>
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>

            {kind === 'REVISION' ? (
              <div>
                <label className="block text-[10px] font-bold text-slate-300 uppercase mb-1">
                  Kind of resource
                </label>
                <select
                  value={revisionType}
                  onChange={(e) => setRevisionType(e.target.value as FreeRevisionLink['type'])}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-2 text-xs text-white capitalize"
                >
                  {REVISION_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {label(t)}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div>
                <label className="block text-[10px] font-bold text-slate-300 uppercase mb-1">
                  Pathway type
                </label>
                <select
                  value={careerCategory}
                  onChange={(e) =>
                    setCareerCategory(e.target.value as CareerGuidanceResource['category'])
                  }
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-2 text-xs text-white capitalize"
                >
                  {CAREER_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {label(c)}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {kind === 'CAREER' && (
            <div className="grid grid-cols-[3rem,1fr] gap-2">
              <div>
                <label className="block text-[10px] font-bold text-slate-300 uppercase mb-1">
                  Icon
                </label>
                <input
                  type="text"
                  maxLength={4}
                  value={icon}
                  onChange={(e) => setIcon(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-2 text-center text-base text-white"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-300 uppercase mb-1">
                  Grade it typically needs
                </label>
                <input
                  type="number"
                  min="1"
                  max="9"
                  value={requiredGrade}
                  onChange={(e) => setRequiredGrade(Number(e.target.value))}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-2 text-xs text-white"
                />
              </div>
            </div>
          )}

          <button
            onClick={handleSave}
            disabled={!canSave || busy}
            className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold text-xs"
          >
            {busy ? 'Saving...' : editingId ? 'Save changes' : 'Add it'}
          </button>
        </div>
      )}

      <div className="space-y-4">
        <div>
          <p className="text-[11px] font-bold text-slate-500 uppercase mb-2">
            Revision sites ({revisionLinks.length})
          </p>
          <div className="space-y-2">
            {revisionLinks.map((link) => (
              <div
                key={link.id}
                className="p-3 bg-slate-900/70 border border-slate-800 rounded-xl flex flex-wrap items-center justify-between gap-2"
              >
                <div className="min-w-0">
                  <p className="text-xs font-bold text-white truncate">{link.title}</p>
                  <p className="text-[11px] text-slate-500 capitalize">
                    {link.subjectId.replace(/_/g, ' ')} · {label(link.type)}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <a
                    href={link.url}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={`Open ${link.title}`}
                    className="p-1.5 text-slate-500 hover:text-teal-300 transition-colors"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>
                  <button
                    onClick={() => openRevision(link)}
                    aria-label={`Edit ${link.title}`}
                    className="p-1.5 text-slate-500 hover:text-indigo-300 transition-colors"
                  >
                    <PencilLine className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDelete('FreeRevisionLink', link.id, link.title)}
                    aria-label={`Remove ${link.title}`}
                    className="p-1.5 text-slate-500 hover:text-rose-400 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <p className="text-[11px] font-bold text-slate-500 uppercase mb-2">
            Career pathways ({careers.length})
          </p>
          <div className="space-y-2">
            {careers.map((c) => (
              <div
                key={c.id}
                className="p-3 bg-slate-900/70 border border-slate-800 rounded-xl flex flex-wrap items-center justify-between gap-2"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="text-lg leading-none">{c.icon}</span>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-white truncate">{c.title}</p>
                    <p className="text-[11px] text-slate-500 capitalize">
                      {label(c.category)} · needs Grade {c.requiredGCSEGrade}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => openCareer(c)}
                    aria-label={`Edit ${c.title}`}
                    className="p-1.5 text-slate-500 hover:text-indigo-300 transition-colors"
                  >
                    <PencilLine className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDelete('CareerGuidanceResource', c.id, c.title)}
                    aria-label={`Remove ${c.title}`}
                    className="p-1.5 text-slate-500 hover:text-rose-400 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

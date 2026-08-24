import React, { useState, useEffect } from 'react';
import { db } from '../../db';
import { SubjectConfig, SyllabusTopic, Task, RAGStatus } from '../../types';
import { calculateSubjectRAG, SubjectRAGResult } from '../../services/ragCalculator';
import { logAuditEvent } from '../../services/auditService';
import { triggerCelebration } from '../../utils/confetti';
import { todayISO, addDaysISO } from '../../utils/date';
import {
  X,
  CheckCircle2,
  Circle,
  Plus,
  BookOpen,
  GraduationCap,
  FlaskConical,
  ExternalLink,
  Edit3,
  Trash2,
  Save,
  Folder,
  Sliders,
} from 'lucide-react';
import { newId } from '../../utils/id';

interface SubjectDetailModalProps {
  subject: SubjectConfig | null;
  isOpen: boolean;
  onClose: () => void;
  onRefresh: () => void;
}

export const SubjectDetailModal: React.FC<SubjectDetailModalProps> = ({
  subject,
  isOpen,
  onClose,
  onRefresh,
}) => {
  const [topics, setTopics] = useState<SyllabusTopic[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [rag, setRag] = useState<SubjectRAGResult | null>(null);

  // Subject Edit Mode
  const [isEditingSubject, setIsEditingSubject] = useState(false);
  const [editedTeacher, setEditedTeacher] = useState('');
  const [editedNotes, setEditedNotes] = useState('');
  const [editedDriveUrl, setEditedDriveUrl] = useState('');
  const [manualRAG, setManualRAG] = useState<RAGStatus | 'AUTO'>('AUTO');
  const [manualScore, setManualScore] = useState<number>(85);

  // Add New Topic State
  const [newTopicUnit, setNewTopicUnit] = useState('Year 10 Unit');
  const [newTopicTitle, setNewTopicTitle] = useState('');
  const [newTopicDriveUrl, setNewTopicDriveUrl] = useState('');
  const [newTopicIsPractical, setNewTopicIsPractical] = useState(false);

  // New task form state
  const [newTaskTitle, setNewTaskTitle] = useState('');

  useEffect(() => {
    if (subject && isOpen) {
      loadSubjectData();
      setEditedTeacher(subject.teacherName || '');
      setEditedNotes(subject.teacherNotes || '');
      setEditedDriveUrl(subject.driveFolderUrl || '');
      setManualRAG(subject.manualRAGOverride || 'AUTO');
      setManualScore(subject.manualHealthScore || 85);
    }
  }, [subject, isOpen]);

  const loadSubjectData = async () => {
    if (!subject) return;
    const t = await db.syllabusTopics.where('subjectId').equals(subject.id).toArray();
    const taskList = await db.tasks.where('subjectId').equals(subject.id).toArray();
    const ragRes = await calculateSubjectRAG(subject.id);

    setTopics(t);
    setTasks(taskList);
    setRag(ragRes);
  };

  if (!isOpen || !subject) return null;

  const handleSaveSubjectSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    await db.subjects.update(subject.id, {
      teacherName: editedTeacher.trim(),
      teacherNotes: editedNotes.trim(),
      driveFolderUrl: editedDriveUrl.trim(),
      manualRAGOverride: manualRAG === 'AUTO' ? null : (manualRAG as RAGStatus),
      manualHealthScore: manualRAG === 'AUTO' ? null : manualScore,
    });

    await logAuditEvent({
      user: 'PARENT',
      action: 'UPDATE',
      entity: 'SubjectConfig',
      entityId: subject.id,
      newValue: `Updated settings (RAG Override: ${manualRAG}, Drive: ${editedDriveUrl})`,
    });

    setIsEditingSubject(false);
    loadSubjectData();
    onRefresh();
  };

  const handleAddTopic = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTopicTitle.trim()) return;

    const newTopic: SyllabusTopic = {
      id: newId('topic'),
      subjectId: subject.id,
      unit: newTopicUnit.trim() || 'Year 10',
      title: newTopicTitle.trim(),
      isCompleted: false,
      confidenceRating: 3,
      isImportantForGrade9: true,
      isRequiredPractical: newTopicIsPractical,
      yearGroup: 'YEAR_10',
      dateTaught: todayISO(),
      driveNotesUrl: newTopicDriveUrl.trim() || undefined,
    };

    await db.syllabusTopics.add(newTopic);
    await logAuditEvent({
      user: 'STUDENT',
      action: 'INSERT',
      entity: 'SyllabusTopic',
      entityId: newTopic.id,
      newValue: `Added Year 10 Topic: ${newTopic.title} [${newTopic.unit}]`,
    });

    setNewTopicTitle('');
    setNewTopicDriveUrl('');
    setNewTopicIsPractical(false);
    loadSubjectData();
    onRefresh();
  };

  const handleDeleteTopic = async (topic: SyllabusTopic) => {
    if (!confirm(`Delete "${topic.title}" from the syllabus checklist? This is recorded in the change history.`)) {
      return;
    }

    await db.syllabusTopics.delete(topic.id);
    await logAuditEvent({
      user: 'STUDENT',
      action: 'DELETE',
      entity: 'SyllabusTopic',
      entityId: topic.id,
      oldValue: `${topic.title} (${topic.subjectId} / ${topic.unit})`,
    });
    loadSubjectData();
    onRefresh();
  };

  const toggleTopicMastery = async (topic: SyllabusTopic) => {
    const newStatus = !topic.isCompleted;
    await db.syllabusTopics.update(topic.id, {
      isCompleted: newStatus,
      confidenceRating: newStatus ? 5 : 3,
    });
    if (newStatus) triggerCelebration({ particleCount: 30 });
    loadSubjectData();
    onRefresh();
  };

  const updateTopicConfidence = async (topic: SyllabusTopic, rating: 1 | 2 | 3 | 4 | 5) => {
    await db.syllabusTopics.update(topic.id, {
      confidenceRating: rating,
      isCompleted: rating >= 4,
    });
    loadSubjectData();
    onRefresh();
  };

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskTitle.trim()) return;

    const newTask: Task = {
      id: newId('task'),
      subjectId: subject.id,
      title: newTaskTitle.trim(),
      dueDate: addDaysISO(2),
      priority: 'HIGH',
      isHomework: true,
      isRemediation: false,
      xpValue: 50,
      completed: false,
      createdAt: Date.now(),
    };

    await db.tasks.add(newTask);
    setNewTaskTitle('');
    loadSubjectData();
    onRefresh();
  };

  const toggleTaskCompleted = async (task: Task) => {
    const newCompleted = !task.completed;
    await db.tasks.update(task.id, {
      completed: newCompleted,
      completedAt: newCompleted ? Date.now() : undefined,
    });
    if (newCompleted) triggerCelebration({ particleCount: 40 });
    loadSubjectData();
    onRefresh();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl max-w-2xl w-full p-6 shadow-2xl relative max-h-[90vh] overflow-y-auto">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4 pb-3 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-indigo-500/20 text-2xl flex items-center justify-center border border-indigo-500/30">
              {subject.icon}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold text-white">{subject.name}</h2>
                <span className="text-xs px-2 py-0.5 rounded-full font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30">
                  Target: Grade 9
                </span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700 font-mono">
                  {subject.examBoard}
                </span>
              </div>
              <p className="text-xs text-slate-400">Teacher: {subject.teacherName}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {subject.driveFolderUrl && (
              <a
                href={subject.driveFolderUrl}
                target="_blank"
                rel="noreferrer"
                className="px-3 py-1.5 rounded-lg bg-teal-600/20 border border-teal-500/40 text-teal-300 hover:bg-teal-600/30 font-semibold text-xs flex items-center gap-1.5 transition-all"
              >
                <Folder className="w-3.5 h-3.5" />
                <span>Google Drive</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            )}

            <button
              onClick={() => setIsEditingSubject(!isEditingSubject)}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs border border-slate-700 flex items-center gap-1 transition-all"
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span>{isEditingSubject ? 'Cancel' : 'Edit Subject'}</span>
            </button>
          </div>
        </div>

        {/* Edit Subject Settings Form */}
        {isEditingSubject && (
          <form onSubmit={handleSaveSubjectSettings} className="p-4 bg-slate-800/80 rounded-2xl border border-slate-700 mb-5 space-y-3">
            <h4 className="text-xs font-bold text-indigo-300 uppercase flex items-center gap-1.5">
              <Sliders className="w-4 h-4" />
              <span>Subject settings</span>
            </h4>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-300 mb-1">Teacher Name</label>
                <input
                  type="text"
                  value={editedTeacher}
                  onChange={(e) => setEditedTeacher(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-300 mb-1">Google Drive Folder Link</label>
                <input
                  type="url"
                  placeholder="https://drive.google.com/..."
                  value={editedDriveUrl}
                  onChange={(e) => setEditedDriveUrl(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-300 mb-1">RAG Status Control</label>
                <select
                  value={manualRAG}
                  onChange={(e) => setManualRAG(e.target.value as any)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white"
                >
                  <option value="AUTO">Automatic (Calculated from HW & Mastery)</option>
                  <option value="GREEN">Force GREEN (On Track)</option>
                  <option value="AMBER">Force AMBER (Needs Focus)</option>
                  <option value="RED">Force RED (Critical Risk)</option>
                </select>
              </div>

              {manualRAG !== 'AUTO' && (
                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 mb-1">Manual Health Score (0-100)</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={manualScore}
                    onChange={(e) => setManualScore(Number(e.target.value))}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white"
                  />
                </div>
              )}
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-300 mb-1">Teacher & Assessment Notes</label>
              <textarea
                rows={2}
                value={editedNotes}
                onChange={(e) => setEditedNotes(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-white"
              />
            </div>

            <button
              type="submit"
              className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 shadow"
            >
              <Save className="w-3.5 h-3.5" />
              <span>Save Subject Configuration</span>
            </button>
          </form>
        )}

        {/* RAG Health Status Bar */}
        {rag && (
          <div className="p-3 bg-slate-800/60 rounded-xl border border-slate-700/70 mb-5 flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="flex items-center gap-2">
                <span
                  className={`text-xs font-bold px-2 py-0.5 rounded uppercase ${
                    rag.ragStatus === 'GREEN'
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                      : rag.ragStatus === 'AMBER'
                      ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
                      : 'bg-rose-500/20 text-rose-400 border border-rose-500/40'
                  }`}
                >
                  {rag.ragStatus} Status
                </span>
                <span className="text-xs font-semibold text-white">
                  Health: {rag.healthScore}/100
                </span>
                {rag.isManualOverride && (
                  <span className="text-[10px] bg-slate-800 text-amber-300 px-1.5 py-0.5 rounded border border-amber-500/30">
                    Manual Override
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-400 mt-1">{rag.details}</p>
            </div>

            <div className="flex items-center gap-3 text-xs text-slate-300">
              <span className="bg-slate-900 px-2.5 py-1 rounded border border-slate-800">
                HW: {rag.homeworkCompletionRate}%
              </span>
              <span className="bg-slate-900 px-2.5 py-1 rounded border border-slate-800">
                Remediations: {rag.remediationCompletionRate}%
              </span>
            </div>
          </div>
        )}

        {/* Guidance Notes */}
        {subject.teacherNotes && !isEditingSubject && (
          <div className="mb-5 p-3 bg-indigo-950/30 rounded-xl border border-indigo-500/30 text-xs text-indigo-200">
            <span className="font-bold text-indigo-400">Teacher & Assessment Guidance: </span>
            {subject.teacherNotes}
          </div>
        )}

        {/* Section Tabs / Content */}
        <div className="space-y-6">
          {/* Syllabus & Dynamic Topic Manager */}
          <div>
            <div className="flex items-center justify-between mb-2.5">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                <GraduationCap className="w-4 h-4 text-indigo-400" />
                <span>Topics covered ({topics.filter((t) => t.isCompleted).length}/{topics.length})</span>
              </h3>
            </div>

            {/* Quick Add Topic as Taught in Year 10 */}
            <form onSubmit={handleAddTopic} className="p-3 bg-slate-800/40 rounded-xl border border-slate-700/60 mb-3 space-y-2">
              <span className="text-[11px] font-bold text-slate-300 block">Add New Topic as Taught:</span>
              <div className="grid grid-cols-3 gap-2">
                <input
                  type="text"
                  placeholder="Unit (e.g. Unit 3 Trigonometry)"
                  value={newTopicUnit}
                  onChange={(e) => setNewTopicUnit(e.target.value)}
                  className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white"
                />
                <input
                  type="text"
                  placeholder="Topic Title (e.g. Sine Rule Proofs)"
                  value={newTopicTitle}
                  onChange={(e) => setNewTopicTitle(e.target.value)}
                  required
                  className="col-span-2 bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white"
                />
              </div>

              <div className="flex items-center justify-between gap-2">
                <input
                  type="url"
                  placeholder="Optional Google Notebook / Notes link..."
                  value={newTopicDriveUrl}
                  onChange={(e) => setNewTopicDriveUrl(e.target.value)}
                  className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-white"
                />

                <label className="flex items-center gap-1 text-[11px] text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newTopicIsPractical}
                    onChange={(e) => setNewTopicIsPractical(e.target.checked)}
                    className="accent-indigo-500"
                  />
                  <span>Required Practical</span>
                </label>

                <button
                  type="submit"
                  className="px-3 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Topic</span>
                </button>
              </div>
            </form>

            <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
              {topics.map((topic) => (
                <div
                  key={topic.id}
                  className={`p-3 rounded-xl border flex flex-wrap items-center justify-between gap-2 transition-all ${
                    topic.isCompleted
                      ? 'bg-emerald-950/30 border-emerald-500/40 text-emerald-200'
                      : 'bg-slate-800/40 border-slate-700/60 text-slate-300'
                  }`}
                >
                  <div className="flex items-center gap-2.5 flex-1 min-w-[200px]">
                    <button
                      type="button"
                      onClick={() => toggleTopicMastery(topic)}
                      className="p-1 hover:scale-110 transition-transform"
                    >
                      {topic.isCompleted ? (
                        <CheckCircle2 className="w-5 h-5 text-emerald-400 fill-emerald-400/20" />
                      ) : (
                        <Circle className="w-5 h-5 text-slate-500" />
                      )}
                    </button>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-white">{topic.title}</span>
                        <span className="text-[10px] text-slate-400 font-mono">[{topic.unit}]</span>
                      </div>
                      {topic.driveNotesUrl && (
                        <a
                          href={topic.driveNotesUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[10px] text-teal-400 hover:underline flex items-center gap-0.5 mt-0.5"
                        >
                          <span>Notebook Link</span>
                          <ExternalLink className="w-2.5 h-2.5" />
                        </a>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    {topic.isRequiredPractical && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-950 text-purple-300 border border-purple-800 flex items-center gap-1">
                        <FlaskConical className="w-3 h-3" />
                        <span>Practical</span>
                      </span>
                    )}

                    {/* Confidence Selector (1-5) */}
                    <div className="flex items-center gap-1 bg-slate-900 px-2 py-0.5 rounded-lg border border-slate-700">
                      <span className="text-[10px] text-slate-400 mr-1">Mastery:</span>
                      {[1, 2, 3, 4, 5].map((star) => (
                        <button
                          key={star}
                          type="button"
                          onClick={() => updateTopicConfidence(topic, star as any)}
                          className={`text-xs ${
                            topic.confidenceRating >= star ? 'text-amber-400' : 'text-slate-600'
                          }`}
                        >
                          ★
                        </button>
                      ))}
                    </div>

                    <button
                      type="button"
                      onClick={() => handleDeleteTopic(topic)}
                      className="p-1 text-slate-500 hover:text-rose-400 rounded transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Active Homework & Tasks */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 mb-2 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <BookOpen className="w-4 h-4 text-emerald-400" />
                <span>Homework for this subject</span>
              </span>
              <span className="text-[11px] text-indigo-400 font-normal">+50 XP per task</span>
            </h3>

            {/* Quick Add Task */}
            <form onSubmit={handleCreateTask} className="flex gap-2 mb-3">
              <input
                type="text"
                placeholder={`Add ${subject.shortName} homework or revision task...`}
                value={newTaskTitle}
                onChange={(e) => setNewTaskTitle(e.target.value)}
                className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
              />
              <button
                type="submit"
                className="px-3 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold flex items-center gap-1"
              >
                <Plus className="w-4 h-4" />
                <span>Add</span>
              </button>
            </form>

            <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
              {tasks.length === 0 ? (
                <p className="text-xs text-slate-500 italic p-2 text-center">
                  No active tasks for this subject.
                </p>
              ) : (
                tasks.map((task) => (
                  <div
                    key={task.id}
                    onClick={() => toggleTaskCompleted(task)}
                    className={`p-2.5 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${
                      task.completed
                        ? 'bg-slate-900/40 border-slate-800 text-slate-500 line-through'
                        : 'bg-slate-800/60 border-slate-700 text-slate-200 hover:bg-slate-800'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <CheckCircle2
                        className={`w-4 h-4 ${
                          task.completed ? 'text-emerald-500' : 'text-slate-500'
                        }`}
                      />
                      <span className="text-xs font-medium">{task.title}</span>
                    </div>
                    <span className="text-[10px] text-amber-400 font-bold">+{task.xpValue} XP</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

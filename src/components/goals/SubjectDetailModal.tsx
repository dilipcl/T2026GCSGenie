import React, { useState, useEffect } from 'react';
import { db } from '../../db';
import { SubjectConfig, SyllabusTopic, Task } from '../../types';
import { calculateSubjectRAG, SubjectRAGResult } from '../../services/ragCalculator';
import { logAuditEvent } from '../../services/auditService';
import { triggerCelebration } from '../../utils/confetti';
import {
  X,
  CheckCircle2,
  Circle,
  Plus,
  BookOpen,
  GraduationCap,
  FlaskConical,
} from 'lucide-react';

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

  // New task form state
  const [newTaskTitle, setNewTaskTitle] = useState('');

  useEffect(() => {
    if (subject && isOpen) {
      loadSubjectData();
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

  const toggleTopicMastery = async (topic: SyllabusTopic) => {
    const newStatus = !topic.isCompleted;
    await db.syllabusTopics.update(topic.id, {
      isCompleted: newStatus,
      confidenceRating: newStatus ? 5 : 3,
    });
    await logAuditEvent({
      user: 'STUDENT',
      action: 'UPDATE',
      entity: 'SyllabusTopic',
      entityId: topic.id,
      fieldChanged: 'isCompleted',
      oldValue: String(topic.isCompleted),
      newValue: String(newStatus),
    });
    if (newStatus) triggerCelebration({ particleCount: 30 });
    loadSubjectData();
    onRefresh();
  };

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskTitle.trim()) return;

    const newTask: Task = {
      id: `task_${Date.now()}`,
      subjectId: subject.id,
      title: newTaskTitle.trim(),
      dueDate: new Date(Date.now() + 86400000 * 2).toISOString().split('T')[0],
      isHomework: true,
      isRemediation: false,
      xpValue: 50,
      completed: false,
      createdAt: Date.now(),
    };

    await db.tasks.add(newTask);
    await logAuditEvent({
      user: 'STUDENT',
      action: 'INSERT',
      entity: 'Task',
      entityId: newTask.id,
      newValue: newTask.title,
    });

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
        <div className="flex items-center gap-3 mb-4">
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

        {/* Teacher Guidance Notes */}
        {subject.teacherNotes && (
          <div className="mb-5 p-3 bg-indigo-950/30 rounded-xl border border-indigo-500/30 text-xs text-indigo-200">
            <span className="font-bold text-indigo-400">Teacher & Assessment Guidance: </span>
            {subject.teacherNotes}
          </div>
        )}

        {/* Section Tabs / Content */}
        <div className="space-y-6">
          {/* Syllabus & Grade 9 Mastery Checklist */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 mb-2.5 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <GraduationCap className="w-4 h-4 text-indigo-400" />
                <span>Grade 9 Syllabus Mastery Checklist</span>
              </span>
              <span className="text-[11px] text-slate-400">
                {topics.filter((t) => t.isCompleted).length}/{topics.length} Mastered
              </span>
            </h3>

            <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
              {topics.map((topic) => (
                <div
                  key={topic.id}
                  onClick={() => toggleTopicMastery(topic)}
                  className={`p-2.5 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${
                    topic.isCompleted
                      ? 'bg-emerald-950/30 border-emerald-500/40 text-emerald-200'
                      : 'bg-slate-800/40 border-slate-700/60 text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    {topic.isCompleted ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 fill-emerald-400/20" />
                    ) : (
                      <Circle className="w-4 h-4 text-slate-500" />
                    )}
                    <div>
                      <span className="text-xs font-medium">{topic.title}</span>
                      <span className="text-[10px] text-slate-400 ml-2 font-mono">
                        [{topic.unit}]
                      </span>
                    </div>
                  </div>

                  {topic.isRequiredPractical && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-950 text-purple-300 border border-purple-800 flex items-center gap-1">
                      <FlaskConical className="w-3 h-3" />
                      <span>Required Practical</span>
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Active Homework & Tasks */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 mb-2 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <BookOpen className="w-4 h-4 text-emerald-400" />
                <span>Active Homework & Action Items</span>
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

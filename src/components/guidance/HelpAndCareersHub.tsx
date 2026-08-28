import React, { useState, useEffect } from 'react';
import { db } from '../../db';
import { SubjectConfig, CareerGuidanceResource, FreeRevisionLink } from '../../types';
import { HowItWorksPanel } from './HowItWorksPanel';
import {
  ExternalLink,
  BookOpen,
  UserCheck,
  Rocket,
  LifeBuoy,
} from 'lucide-react';

export const HelpAndCareersHub: React.FC = () => {
  const [subjects, setSubjects] = useState<SubjectConfig[]>([]);
  const [careers, setCareers] = useState<CareerGuidanceResource[]>([]);
  const [revisionLinks, setRevisionLinks] = useState<FreeRevisionLink[]>([]);
  /**
   * "How it works" leads, and is the default. The section was named for careers
   * and opened on them, which put the only page explaining the app three tabs
   * deep behind advice about degree apprenticeships.
   */
  const [activeTab, setActiveTab] = useState<
    'HOW_IT_WORKS' | 'TEACHERS' | 'REVISION_SITES' | 'CAREERS'
  >('HOW_IT_WORKS');

  useEffect(() => {
    db.subjects.toArray().then(setSubjects);
    db.careerResources.toArray().then(setCareers);
    db.revisionLinks.toArray().then(setRevisionLinks);
  }, []);

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="glass-card p-6 bg-gradient-to-r from-slate-900 via-teal-950/30 to-slate-900 border-teal-500/30">
        <div className="flex items-center gap-2 mb-1">
          <span className="p-2 rounded-xl bg-teal-500/20 text-teal-400 border border-teal-500/30">
            🧭
          </span>
          <h2 className="text-xl font-bold text-white">Help &amp; Careers</h2>
        </div>
        <p className="text-xs text-slate-300 max-w-xl">
          How Genie works, and where these grades actually lead — A-Levels, degree apprenticeships
          and careers — plus free revision sites and who teaches what.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
        {[
          { id: 'HOW_IT_WORKS', label: '🧞 How Genie works', icon: LifeBuoy },
          { id: 'CAREERS', label: '🚀 Where this leads', icon: Rocket },
          { id: 'REVISION_SITES', label: '📚 Free revision sites', icon: BookOpen },
          { id: 'TEACHERS', label: '👨‍🏫 Your teachers', icon: UserCheck },
        ].map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                activeTab === tab.id
                  ? 'bg-teal-600 text-white shadow-lg shadow-teal-950/50'
                  : 'bg-slate-900 text-slate-400 border border-slate-800 hover:text-white'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {activeTab === 'HOW_IT_WORKS' && <HowItWorksPanel />}

      {/* 1. Career Pathways Tab */}
      {activeTab === 'CAREERS' && (
        <div className="space-y-4">
          <div className="p-4 bg-slate-900/60 rounded-2xl border border-slate-800 text-xs text-slate-300">
            <strong className="text-teal-400 font-semibold">Why Grade 9s Matter Post-GCSE: </strong>
            Achieving Grade 8/9 in Edexcel Maths, AQA Sciences, and OCR Computer Science secures
            direct entry into top competitive sixth-form colleges, A-Level Further Maths pathways,
            and prestigious Degree Apprenticeships (e.g. Rolls-Royce, BAE Systems Aerospace, Google).
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {careers.map((c) => (
              <div
                key={c.id}
                className="glass-card p-5 hover:border-teal-500/50 transition-all flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <span className="text-3xl p-2 bg-slate-800/80 rounded-xl border border-slate-700">
                      {c.icon}
                    </span>
                    <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-teal-950 text-teal-300 border border-teal-800">
                      {c.category.replace('_', ' ')}
                    </span>
                  </div>

                  <h3 className="font-bold text-sm text-white mb-1.5">{c.title}</h3>
                  <p className="text-xs text-slate-300 mb-3">{c.description}</p>
                </div>

                <div className="pt-3 border-t border-slate-800 flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    {c.relevantSubjectIds.map((subId) => (
                      <span
                        key={subId}
                        className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400"
                      >
                        {subId.replace('_', ' ')}
                      </span>
                    ))}
                  </div>

                  {c.externalUrl && (
                    <a
                      href={c.externalUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-teal-400 hover:text-teal-300 font-semibold flex items-center gap-1"
                    >
                      <span>Explore Pathway</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 2. Free Revision Links Tab */}
      {activeTab === 'REVISION_SITES' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {revisionLinks.map((link) => (
            <div
              key={link.id}
              className="glass-card p-5 hover:border-indigo-500/50 transition-all flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-indigo-950 text-indigo-300 border border-indigo-800">
                    {link.subjectId.replace('_', ' ')}
                  </span>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-400">
                    {link.type.replace('_', ' ')}
                  </span>
                </div>

                <h4 className="font-bold text-sm text-white mb-1">{link.title}</h4>
                <p className="text-xs text-slate-400 mb-4">{link.description}</p>
              </div>

              <a
                href={link.url}
                target="_blank"
                rel="noreferrer"
                className="w-full py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs flex items-center justify-center gap-1.5 transition-all border border-slate-700"
              >
                <span>Open Free Revision Portal</span>
                <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
              </a>
            </div>
          ))}
        </div>
      )}

      {/* 3. Teacher Directory Tab */}
      {activeTab === 'TEACHERS' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {subjects.map((sub) => (
            <div key={sub.id} className="glass-card p-5">
              <div className="flex items-center gap-3 mb-3">
                <span className="text-2xl p-2 bg-slate-800 rounded-xl border border-slate-700">
                  {sub.icon}
                </span>
                <div>
                  <h4 className="font-bold text-sm text-white">{sub.name}</h4>
                  <p className="text-xs text-slate-400">
                    Lead Teacher: <span className="text-white font-medium">{sub.teacherName}</span>
                  </p>
                </div>
              </div>

              <div className="p-3 bg-slate-900/80 rounded-xl border border-slate-800 text-xs text-slate-300 space-y-1">
                <p>
                  <strong className="text-indigo-400">Exam Board:</strong> {sub.examBoard} (Linear 9-1)
                </p>
                <p>
                  <strong className="text-indigo-400">Structure:</strong> {sub.examStructure}
                </p>
                {sub.teacherNotes && (
                  <p className="pt-1 text-slate-400 italic">
                    Note: {sub.teacherNotes}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

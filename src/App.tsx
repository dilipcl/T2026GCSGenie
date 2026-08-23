import { useState } from 'react';
import { UserRole, WeekType } from './types';
import { Header } from './components/layout/Header';
import { Navigation, ActiveTab } from './components/layout/Navigation';
import { DailyCheckInModal } from './components/dashboard/DailyCheckInModal';
import { ParentPinModal } from './components/parent/ParentPinModal';
import { TodayScheduleCard } from './components/dashboard/TodayScheduleCard';
import { ActiveQuestsCard } from './components/dashboard/ActiveQuestsCard';
import { BurnoutAlertBanner } from './components/dashboard/BurnoutAlertBanner';
import { Grade9GoalsView } from './components/goals/Grade9GoalsView';
import { TimetableManager } from './components/timetable/TimetableManager';
import { RemediationHub } from './components/remediation/RemediationHub';
import { RewardsShop } from './components/rewards/RewardsShop';
import { HelpAndCareersHub } from './components/guidance/HelpAndCareersHub';
import { ParentPortal } from './components/parent/ParentPortal';
import { Sparkles, Target, Zap, ArrowRight } from 'lucide-react';

export function App() {
  const [currentRole, setCurrentRole] = useState<UserRole>('STUDENT');
  const [activeTab, setActiveTab] = useState<ActiveTab>('dashboard');
  const [activeWeek, setActiveWeek] = useState<WeekType>('ODD');
  const [isCheckInOpen, setIsCheckInOpen] = useState(false);
  const [isPinModalOpen, setIsPinModalOpen] = useState(false);
  const [selectedRemediationId, setSelectedRemediationId] = useState<string | undefined>();

  const handleToggleRole = (targetRole: UserRole) => {
    if (targetRole === 'PARENT') {
      setIsPinModalOpen(true);
    } else {
      setCurrentRole('STUDENT');
    }
  };

  const handlePinSuccess = () => {
    setCurrentRole('PARENT');
    setActiveTab('parent');
  };

  const handleToggleWeek = () => {
    setActiveWeek((prev) => (prev === 'ODD' ? 'EVEN' : 'ODD'));
  };

  const handleOpenRemediation = (questId?: string) => {
    setSelectedRemediationId(questId);
    setActiveTab('remediation');
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col selection:bg-indigo-500 selection:text-white">
      {/* Top Header */}
      <Header
        currentRole={currentRole}
        onToggleRole={handleToggleRole}
        activeWeek={activeWeek}
        onToggleWeek={handleToggleWeek}
        onOpenCheckIn={() => setIsCheckInOpen(true)}
      />

      {/* Navigation Tabs */}
      <Navigation
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        currentRole={currentRole}
      />

      {/* Main App Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-6 pb-24 md:pb-8">
        {/* TAB 1: DASHBOARD */}
        {activeTab === 'dashboard' && (
          <div className="space-y-6">
            {/* Quick Hero Banner */}
            <div className="glass-card p-6 bg-gradient-to-r from-indigo-950/40 via-purple-950/20 to-slate-900 border-indigo-500/30 flex flex-wrap items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs uppercase font-extrabold tracking-wider px-2.5 py-1 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 flex items-center gap-1">
                    <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                    <span>Tejas Dilip · GCSE Year 10</span>
                  </span>
                </div>
                <h2 className="text-2xl font-extrabold text-white tracking-tight">
                  Welcome to GCSE Genie
                </h2>
                <p className="text-xs text-slate-300 max-w-xl mt-1">
                  Zero administrative friction organiser. Log daily homework in &lt;2 minutes,
                  remedy Year 9 test errors, track your 45h safe capacity budget, and bank real-world XP.
                </p>
              </div>

              <button
                onClick={() => setIsCheckInOpen(true)}
                className="px-5 py-3 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-sm shadow-xl shadow-emerald-950/60 flex items-center gap-2 transition-all active:scale-95"
              >
                <Zap className="w-5 h-5 text-emerald-200" />
                <span>Start Daily 2-Min Check-in</span>
              </button>
            </div>

            {/* Burnout & Time Capacity Alert */}
            <BurnoutAlertBanner />

            {/* 2-Column Section: Schedule & Diagnostic Quests */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <TodayScheduleCard
                activeWeek={activeWeek}
                onNavigateToTimetable={() => setActiveTab('timetable')}
              />

              <ActiveQuestsCard onOpenRemediation={handleOpenRemediation} />
            </div>

            {/* Quick Preview of Grade 9 Goals */}
            <div className="glass-card p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Target className="w-5 h-5 text-indigo-400" />
                  <h3 className="font-bold text-sm text-white">
                    Grade 9 Academic Curriculum Alignment
                  </h3>
                </div>
                <button
                  onClick={() => setActiveTab('goals')}
                  className="text-xs text-indigo-400 hover:text-indigo-300 font-semibold flex items-center gap-1"
                >
                  <span>View All 6 Subjects</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
              <p className="text-xs text-slate-400">
                Tracking Edexcel Maths, AQA English Lang & Lit, AQA Triple Science, AQA History, OCR
                Computer Science, and AQA Art Portfolio progression.
              </p>
            </div>
          </div>
        )}

        {/* TAB 2: GOALS & RAG STATUS */}
        {activeTab === 'goals' && <Grade9GoalsView />}

        {/* TAB 3: ROTATIONAL TIMETABLE */}
        {activeTab === 'timetable' && (
          <TimetableManager activeWeek={activeWeek} onToggleWeek={handleToggleWeek} />
        )}

        {/* TAB 4: REMEDIATION PORTAL */}
        {activeTab === 'remediation' && (
          <RemediationHub initialQuestId={selectedRemediationId} />
        )}

        {/* TAB 5: REWARDS SHOP */}
        {activeTab === 'rewards' && <RewardsShop currentRole={currentRole} />}

        {/* TAB 6: CAREERS & GUIDANCE HUB */}
        {activeTab === 'guidance' && <HelpAndCareersHub />}

        {/* TAB 7: PARENT PORTAL */}
        {activeTab === 'parent' && <ParentPortal />}
      </main>

      {/* Global Modals */}
      <DailyCheckInModal
        isOpen={isCheckInOpen}
        onClose={() => setIsCheckInOpen(false)}
        onSuccess={() => {}}
      />

      <ParentPinModal
        isOpen={isPinModalOpen}
        onClose={() => setIsPinModalOpen(false)}
        onSuccess={handlePinSuccess}
      />
    </div>
  );
}

export default App;

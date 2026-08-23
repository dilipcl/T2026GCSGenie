import React, { useState } from 'react';
import { UserRole, WeekType } from './types';
import { Header } from './components/layout/Header';
import { Navigation, NavTab } from './components/layout/Navigation';
import { DailyCheckInModal } from './components/dashboard/DailyCheckInModal';
import { CheckInHistoryModal } from './components/dashboard/CheckInHistoryModal';
import { TodayScheduleCard } from './components/dashboard/TodayScheduleCard';
import { ActiveQuestsCard } from './components/dashboard/ActiveQuestsCard';
import { BurnoutAlertBanner } from './components/dashboard/BurnoutAlertBanner';
import { TaskManagerView } from './components/tasks/TaskManagerView';
import { MilestoneCalendarView } from './components/calendar/MilestoneCalendarView';
import { Grade9GoalsView } from './components/goals/Grade9GoalsView';
import { TimetableManager } from './components/timetable/TimetableManager';
import { RemediationHub } from './components/remediation/RemediationHub';
import { RewardsShop } from './components/rewards/RewardsShop';
import { HelpAndCareersHub } from './components/guidance/HelpAndCareersHub';
import { ParentPortal } from './components/parent/ParentPortal';
import { ParentPinModal } from './components/parent/ParentPinModal';
import { Zap, BookmarkCheck } from 'lucide-react';

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<NavTab>('DASHBOARD');
  const [currentRole, setCurrentRole] = useState<UserRole>('STUDENT');
  const [activeWeek, setActiveWeek] = useState<WeekType>('ODD');
  const [isCheckInOpen, setIsCheckInOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isParentPinOpen, setIsParentPinOpen] = useState(false);
  const [selectedQuestId, setSelectedQuestId] = useState<string | undefined>(undefined);

  const handleRoleToggle = (targetRole: UserRole) => {
    if (targetRole === 'PARENT') {
      setIsParentPinOpen(true);
    } else {
      setCurrentRole('STUDENT');
      if (activeTab === 'PARENT') setActiveTab('DASHBOARD');
    }
  };

  const handleParentUnlockSuccess = () => {
    setCurrentRole('PARENT');
    setActiveTab('PARENT');
  };

  const handleSelectQuestFromDashboard = (questId: string) => {
    setSelectedQuestId(questId);
    setActiveTab('REMEDIATIONS');
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans pb-20 md:pb-8">
      {/* Header Bar */}
      <Header
        currentRole={currentRole}
        onToggleRole={handleRoleToggle}
        activeWeek={activeWeek}
        onToggleWeek={() => setActiveWeek((prev) => (prev === 'ODD' ? 'EVEN' : 'ODD'))}
        onOpenCheckIn={() => setIsCheckInOpen(true)}
      />

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-5">
        {/* Navigation Tabs */}
        <Navigation
          activeTab={activeTab}
          onSelectTab={setActiveTab}
          currentRole={currentRole}
        />

        {/* Dynamic Content Views */}
        {activeTab === 'DASHBOARD' && (
          <div className="space-y-6">
            {/* Top Quick Check-in Banner & History Trigger */}
            <div className="glass-card p-5 bg-gradient-to-r from-emerald-950/40 via-slate-900 to-indigo-950/40 border-emerald-500/30 flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-2xl border border-emerald-500/30 shadow-lg shadow-emerald-950/40">
                  ⚡
                </div>
                <div>
                  <h2 className="text-lg font-bold text-white">Daily GCSE Check-in & Learning Log</h2>
                  <p className="text-xs text-slate-300">
                    Multiple daily check-ins supported (Morning, After School, Evening). Earn +10 XP daily base + 50 XP per homework!
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setIsHistoryOpen(true)}
                  className="px-3.5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs border border-slate-700 flex items-center gap-1.5 transition-all"
                >
                  <BookmarkCheck className="w-4 h-4 text-indigo-400" />
                  <span>Learning Timeline</span>
                </button>

                <button
                  onClick={() => setIsCheckInOpen(true)}
                  className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs shadow-lg shadow-emerald-950/50 flex items-center gap-2 transition-all active:scale-95"
                >
                  <Zap className="w-4 h-4" />
                  <span>Start Check-in</span>
                </button>
              </div>
            </div>

            {/* Burnout Capacity Status */}
            <BurnoutAlertBanner />

            {/* Grid: Timetable & Quests */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <TodayScheduleCard
                activeWeek={activeWeek}
                onNavigateToTimetable={() => setActiveTab('TIMETABLE')}
              />

              <ActiveQuestsCard onSelectQuest={handleSelectQuestFromDashboard} />
            </div>
          </div>
        )}

        {activeTab === 'TASKS' && <TaskManagerView />}

        {activeTab === 'CALENDAR' && <MilestoneCalendarView />}

        {activeTab === 'GOALS' && <Grade9GoalsView />}

        {activeTab === 'TIMETABLE' && (
          <TimetableManager
            activeWeek={activeWeek}
            onToggleWeek={() => setActiveWeek((prev) => (prev === 'ODD' ? 'EVEN' : 'ODD'))}
          />
        )}

        {activeTab === 'REMEDIATIONS' && (
          <RemediationHub initialQuestId={selectedQuestId} />
        )}

        {activeTab === 'REWARDS' && <RewardsShop currentRole={currentRole} />}

        {activeTab === 'GUIDANCE' && <HelpAndCareersHub />}

        {activeTab === 'PARENT' && <ParentPortal />}
      </main>

      {/* Global Modals */}
      <DailyCheckInModal
        isOpen={isCheckInOpen}
        onClose={() => setIsCheckInOpen(false)}
        onSuccess={() => {}}
      />

      <CheckInHistoryModal
        isOpen={isHistoryOpen}
        onClose={() => setIsHistoryOpen(false)}
      />

      <ParentPinModal
        isOpen={isParentPinOpen}
        onClose={() => setIsParentPinOpen(false)}
        onSuccess={handleParentUnlockSuccess}
      />
    </div>
  );
};

export default App;

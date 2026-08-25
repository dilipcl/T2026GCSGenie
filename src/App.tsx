import React, { useState } from 'react';
import { UserRole, WeekType } from './types';
import { Header } from './components/layout/Header';
import { Navigation, NavTab } from './components/layout/Navigation';
import { DailyCheckInModal } from './components/dashboard/DailyCheckInModal';
import { CheckInHistoryModal } from './components/dashboard/CheckInHistoryModal';
import { TodayScheduleCard } from './components/dashboard/TodayScheduleCard';
import { ActiveQuestsCard } from './components/dashboard/ActiveQuestsCard';
import { BurnoutAlertBanner } from './components/dashboard/BurnoutAlertBanner';
import { DueSoonCard } from './components/dashboard/DueSoonCard';
import { HabitStreakCard } from './components/dashboard/HabitStreakCard';
import { QuickAddSheet } from './components/shared/QuickAddSheet';
import { FeedbackProvider } from './components/shared/FeedbackProvider';
import { CloudLoginDialog } from './components/layout/CloudLoginDialog';
import { TaskManagerView } from './components/tasks/TaskManagerView';
import { MilestoneCalendarView } from './components/calendar/MilestoneCalendarView';
import { PlanView } from './components/plan/PlanView';
import { WeeklyReviewModal } from './components/plan/WeeklyReviewModal';
import { AssessmentLogView } from './components/assessments/AssessmentLogView';
import { Grade9GoalsView } from './components/goals/Grade9GoalsView';
import { TimetableManager } from './components/timetable/TimetableManager';
import { RemediationHub } from './components/remediation/RemediationHub';
import { RewardsShop } from './components/rewards/RewardsShop';
import { HelpAndCareersHub } from './components/guidance/HelpAndCareersHub';
import { ParentPortal } from './components/parent/ParentPortal';
import { ParentPinModal } from './components/parent/ParentPinModal';
import { Zap, BookmarkCheck, Plus } from 'lucide-react';

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<NavTab>('DASHBOARD');
  const [currentRole, setCurrentRole] = useState<UserRole>('STUDENT');
  const [activeWeek, setActiveWeek] = useState<WeekType>('ODD');
  const [isCheckInOpen, setIsCheckInOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isParentPinOpen, setIsParentPinOpen] = useState(false);
  const [isQuickAddOpen, setIsQuickAddOpen] = useState(false);
  const [isReviewOpen, setIsReviewOpen] = useState(false);
  const [selectedQuestId, setSelectedQuestId] = useState<string | undefined>(undefined);

  // Bumped whenever data changes, so dashboard cards reload without a tab switch
  const [refreshKey, setRefreshKey] = useState(0);
  const refreshData = () => setRefreshKey((prev) => prev + 1);

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
    <FeedbackProvider>
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans pb-24 md:pb-8">
      {/* Header Bar */}
      <Header
        currentRole={currentRole}
        onToggleRole={handleRoleToggle}
        activeWeek={activeWeek}
        onToggleWeek={() => setActiveWeek((prev) => (prev === 'ODD' ? 'EVEN' : 'ODD'))}
        onOpenCheckIn={() => setIsCheckInOpen(true)}
        onOpenRewards={() => setActiveTab('REWARDS')}
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
          <div className="space-y-5">
            {/* 1. What needs doing - the question the app is opened to answer */}
            <DueSoonCard
              refreshKey={refreshKey}
              onAdd={() => setIsQuickAddOpen(true)}
              onSeeAllTasks={() => setActiveTab('TASKS')}
              onSeeCalendar={() => setActiveTab('CALENDAR')}
            />

            {/* 2. Log the day - the other daily action */}
            <div className="glass-card p-5 bg-gradient-to-r from-emerald-950/40 via-slate-900 to-indigo-950/40 border-emerald-500/30 flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-2xl border border-emerald-500/30 shadow-lg shadow-emerald-950/40">
                  ⚡
                </div>
                <div>
                  <h2 className="text-base font-bold text-white">Log today</h2>
                  <p className="text-xs text-slate-300">
                    Two minutes: tick off homework, log study time, note what to ask tomorrow.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setIsHistoryOpen(true)}
                  className="px-3.5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs border border-slate-700 flex items-center gap-1.5 transition-all"
                >
                  <BookmarkCheck className="w-4 h-4 text-indigo-400" />
                  <span>History</span>
                </button>

                <button
                  onClick={() => setIsCheckInOpen(true)}
                  className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs shadow-lg shadow-emerald-950/50 flex items-center gap-2 transition-all"
                >
                  <Zap className="w-4 h-4" />
                  <span>Start check-in</span>
                </button>
              </div>
            </div>

            {/* 3. The chain - visible proof that the habit is holding */}
            <HabitStreakCard
              refreshKey={refreshKey}
              onOpenCheckIn={() => setIsCheckInOpen(true)}
            />

            {/* 4. Today's context */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <TodayScheduleCard
                activeWeek={activeWeek}
                onNavigateToTimetable={() => setActiveTab('TIMETABLE')}
              />

              <ActiveQuestsCard onSelectQuest={handleSelectQuestFromDashboard} />
            </div>

            {/* 5. Weekly status readout, not a daily action */}
            <BurnoutAlertBanner refreshKey={refreshKey} />
          </div>
        )}

        {activeTab === 'TASKS' && <TaskManagerView refreshKey={refreshKey} onAdd={() => setIsQuickAddOpen(true)} />}

        {activeTab === 'PLAN' && (
          <PlanView
            onAdd={() => setIsQuickAddOpen(true)}
            onOpenReview={() => setIsReviewOpen(true)}
          />
        )}

        {/* Reachable from Plan; kept as its own view for the month grid */}
        {activeTab === 'CALENDAR' && (
          <MilestoneCalendarView refreshKey={refreshKey} onAdd={() => setIsQuickAddOpen(true)} />
        )}

        {activeTab === 'PROOF' && (
          <AssessmentLogView
            currentRole={currentRole}
            refreshKey={refreshKey}
            onChanged={refreshData}
          />
        )}

        {activeTab === 'GOALS' && <Grade9GoalsView currentRole={currentRole} />}

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

      {/* Quick Add - reachable from every screen, since adding homework and key
          dates is the most frequent action after checking in */}
      {currentRole === 'STUDENT' && (
        <button
          onClick={() => setIsQuickAddOpen(true)}
          aria-label="Add homework or a key date"
          className="fixed right-4 bottom-24 md:bottom-8 z-30 w-14 h-14 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 text-white shadow-xl shadow-indigo-950/60 flex items-center justify-center hover:from-indigo-400 hover:to-purple-500 transition-all"
        >
          <Plus className="w-7 h-7" />
        </button>
      )}

      {/* Global Modals */}
      <QuickAddSheet
        isOpen={isQuickAddOpen}
        onClose={() => setIsQuickAddOpen(false)}
        onSuccess={refreshData}
        // Match the sheet to the screen it was opened from
        defaultMode={
          activeTab === 'CALENDAR' ? 'REMINDER' : activeTab === 'TIMETABLE' ? 'LESSON' : 'TASK'
        }
        defaultWeek={activeWeek}
      />

      <DailyCheckInModal
        isOpen={isCheckInOpen}
        onClose={() => setIsCheckInOpen(false)}
        onSuccess={refreshData}
      />

      <CheckInHistoryModal
        isOpen={isHistoryOpen}
        onClose={() => setIsHistoryOpen(false)}
      />

      <WeeklyReviewModal
        isOpen={isReviewOpen}
        onClose={() => setIsReviewOpen(false)}
        onAddItem={() => setIsQuickAddOpen(true)}
      />

      <CloudLoginDialog />

      <ParentPinModal
        isOpen={isParentPinOpen}
        onClose={() => setIsParentPinOpen(false)}
        onSuccess={handleParentUnlockSuccess}
      />
    </div>
    </FeedbackProvider>
  );
};

export default App;

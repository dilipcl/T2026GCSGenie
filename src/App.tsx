import React, { useState, useEffect } from 'react';
import { UserRole, WeekType, Task, MilestoneReminder, TimetableEntry } from './types';
import { Header } from './components/layout/Header';
import { Navigation, NavTab } from './components/layout/Navigation';
import { DailyCheckInModal } from './components/dashboard/DailyCheckInModal';
import { CheckInHistoryModal } from './components/dashboard/CheckInHistoryModal';
import { TodayScheduleCard } from './components/dashboard/TodayScheduleCard';
import { ActiveQuestsCard } from './components/dashboard/ActiveQuestsCard';
import { WeeklyCockpitCard } from './components/dashboard/WeeklyCockpitCard';
import { DueSoonCard } from './components/dashboard/DueSoonCard';
import { HabitStreakCard } from './components/dashboard/HabitStreakCard';
import { SessionTimerCard } from './components/dashboard/SessionTimerCard';
import { PlanPulseBanner } from './components/dashboard/PlanPulseBanner';
import { HeadlineTicker } from './components/dashboard/HeadlineTicker';
import { WeekHealthCard } from './components/dashboard/WeekHealthCard';
import { QuickAddSheet, QuickAddEditing } from './components/shared/QuickAddSheet';
import { FeedbackProvider } from './components/shared/FeedbackProvider';
import { ChangeGuardProvider } from './components/shared/ChangeGuardProvider';
import { ErrorBoundary } from './components/shared/ErrorBoundary';
import { ChangeLogCard } from './components/shared/ChangeLogCard';
import { UpdatesSection } from './components/updates/UpdatesSection';
import { touchThisDevice } from './services/deviceRegistryService';
import { backupIfDue } from './services/driveBackupService';
import { ImprovementsView } from './components/improvements/ImprovementsView';
import { CloudLoginDialog } from './components/layout/CloudLoginDialog';
import { DatabaseGate } from './components/layout/DatabaseGate';
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
import {
  WelcomeTourModal,
  hasSeenTour,
  markTourSeen,
} from './components/guidance/WelcomeTourModal';
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
  /**
   * The row the add sheet is editing, if any. Held here rather than in each
   * view because the sheet itself is global - the alternative is three more
   * copies of the same form.
   */
  const [quickAddEditing, setQuickAddEditing] = useState<QuickAddEditing | null>(null);
  const [isReviewOpen, setIsReviewOpen] = useState(false);
  const [selectedQuestId, setSelectedQuestId] = useState<string | undefined>(undefined);
  // Shown once, on the very first launch. Read lazily so storage is touched
  // during the initial render rather than on every one.
  const [isTourOpen, setIsTourOpen] = useState(() => !hasSeenTour());

  // Bumped whenever data changes, so dashboard cards reload without a tab switch
  const [refreshKey, setRefreshKey] = useState(0);
  const refreshData = () => setRefreshKey((prev) => prev + 1);

  /**
   * Startup housekeeping, in the order it has to happen.
   *
   * The device registers itself first so the activity feed can name it. Then the
   * OAuth redirect is redeemed, if we have just come back from Google. Then a
   * backup runs if one is due.
   *
   * Backup runs at open rather than on a timer: a phone tab is suspended in the
   * background, so `setInterval` is a promise the browser does not keep, and the
   * moment the app is definitely alive is the moment it is opened. Every step
   * swallows its own failure - none of this is worth blocking the app for, and
   * `backupIfDue` records its own errors where the Parent Portal can show them.
   */
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        await touchThisDevice(currentRole);
        if (cancelled) return;
        await backupIfDue();
      } catch (err) {
        console.error('Startup housekeeping did not complete:', err);
      }
    })();

    return () => {
      cancelled = true;
    };
    // Deliberately once per mount. Re-running on every role toggle would attempt
    // a backup each time somebody entered parent mode.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const openEditor = (editing: QuickAddEditing) => {
    setQuickAddEditing(editing);
    setIsQuickAddOpen(true);
  };

  const closeQuickAdd = () => {
    setIsQuickAddOpen(false);
    setQuickAddEditing(null);
  };

  const handleSelectQuestFromDashboard = (questId: string) => {
    setSelectedQuestId(questId);
    setActiveTab('REMEDIATIONS');
  };

  return (
    <FeedbackProvider>
    {/* Inside FeedbackProvider: a confirmation that fails needs somewhere to
        say so. */}
    <ChangeGuardProvider>
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

        {/* Dynamic Content Views.

            Wrapped so a view that throws costs the view and nothing else: the
            header and the tabs above it keep working, which is what makes the
            failure recoverable without a reload. Keyed on the tab, so moving
            to another screen and back is a fresh attempt. */}
        <ErrorBoundary label="this screen" resetKeys={[activeTab]}>
        {activeTab === 'DASHBOARD' && (
          <div className="space-y-5">
            {/* The term in one passing line. Above the nudges because it is the
                only thing on this page that reports rather than asks. */}
            <HeadlineTicker />

            {/* The letter, above the nudges. Those each raise one thing; this
                says whether the week as a whole is working, which is the
                question actually being asked on a Wednesday evening. */}
            <WeekHealthCard
              onOpenPlan={() => setActiveTab('PLAN')}
              onOpenGoals={() => setActiveTab('GOALS')}
            />

            {/* 0. Anything at risk, before the scroll starts. The field test
                   found the burnout banner unread at the bottom of the page;
                   a nudge nobody scrolls to is not a nudge. */}
            <PlanPulseBanner
              onOpenCheckIn={() => setIsCheckInOpen(true)}
              onOpenGoals={() => setActiveTab('GOALS')}
              onOpenPlan={() => setActiveTab('PLAN')}
            />

            {/* 0b. What has been confirmed but not yet told to anyone. Renders
                   nothing when there is nothing outstanding. */}
            <ChangeLogCard onReview={() => setActiveTab('UPDATES')} />

            {/* 1. The whole week in one card: goal pacing, capacity, and the
                   three things due today.

                   This absorbs three cards that used to be stacked down the
                   page - today's chores, the schedule, and the workload gauge
                   that sat at the very bottom where the field test found it
                   unread. Each was defensible on its own; together they
                   answered "how is the week going" only for someone prepared
                   to scroll and add up, which is the opposite of what the app
                   promises. */}
            <WeeklyCockpitCard
              activeWeek={activeWeek}
              currentRole={currentRole}
              onOpenGoals={() => setActiveTab('GOALS')}
              onOpenTasks={() => setActiveTab('TASKS')}
              onOpenTimetable={() => setActiveTab('TIMETABLE')}
            />

            {/* 2. What is actually due.

                   The cockpit's Today strip names the single most pressing
                   item, which is the right answer to "what now" and the wrong
                   answer to "what is coming". Overdue work, the rest of the
                   week, and the key dates inside three weeks all need to be
                   visible without opening another tab - a student who has to
                   navigate to find out what is due has already been given a
                   reason to close the app. */}
            <DueSoonCard
              refreshKey={refreshKey}
              onAdd={() => setIsQuickAddOpen(true)}
              onSeeAllTasks={() => setActiveTab('TASKS')}
              onSeeCalendar={() => setActiveTab('CALENDAR')}
            />

            {/* 3. Log the day - the other daily action */}
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

            {/* 4. The chain - visible proof that the habit is holding */}
            <HabitStreakCard
              refreshKey={refreshKey}
              onOpenCheckIn={() => setIsCheckInOpen(true)}
            />

            {/* 5. Do the work, with the break attached */}
            <SessionTimerCard />

            {/* 6. Today's context. The schedule keeps its own card because a
                   full day of periods does not belong in a three-line triad;
                   the cockpit shows the next fixed thing, this shows all of
                   them. */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <TodayScheduleCard
                activeWeek={activeWeek}
                currentRole={currentRole}
                onNavigateToTimetable={() => setActiveTab('TIMETABLE')}
              />

              <ActiveQuestsCard onSelectQuest={handleSelectQuestFromDashboard} />
            </div>
          </div>
        )}

        {activeTab === 'TASKS' && (
          <TaskManagerView
            refreshKey={refreshKey}
            onAdd={() => setIsQuickAddOpen(true)}
            onEdit={(task: Task) => openEditor({ kind: 'TASK', record: task })}
          />
        )}

        {activeTab === 'PLAN' && (
          <PlanView
            onAdd={() => setIsQuickAddOpen(true)}
            onEdit={(task: Task) => openEditor({ kind: 'TASK', record: task })}
            onOpenReview={() => setIsReviewOpen(true)}
            activeWeek={activeWeek}
          />
        )}

        {/* Reachable from Plan; kept as its own view for the month grid */}
        {activeTab === 'CALENDAR' && (
          <MilestoneCalendarView
            refreshKey={refreshKey}
            onAdd={() => setIsQuickAddOpen(true)}
            onEdit={(milestone: MilestoneReminder) =>
              openEditor({ kind: 'REMINDER', record: milestone })
            }
          />
        )}

        {activeTab === 'UPDATES' && (
          <UpdatesSection currentRole={currentRole} onOpenTab={setActiveTab} />
        )}

        {activeTab === 'IMPROVEMENTS' && <ImprovementsView currentRole={currentRole} />}

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
            onEdit={(entry: TimetableEntry) => openEditor({ kind: 'LESSON', record: entry })}
          />
        )}

        {activeTab === 'REMEDIATIONS' && (
          <RemediationHub initialQuestId={selectedQuestId} currentRole={currentRole} />
        )}

        {activeTab === 'REWARDS' && <RewardsShop currentRole={currentRole} />}

        {activeTab === 'GUIDANCE' && <HelpAndCareersHub />}

        {activeTab === 'PARENT' && <ParentPortal />}
        </ErrorBoundary>
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

      {/* Global Modals.

          One boundary each, because a dialog that throws has no working close
          button left - the button is inside the thing that stopped rendering.
          `onReset` is what shuts it, so the way out does not depend on the
          broken component. */}
      <ErrorBoundary
        label="the add sheet"
        variant="overlay"
        resetKeys={[isQuickAddOpen]}
        onReset={closeQuickAdd}
      >
      <QuickAddSheet
        isOpen={isQuickAddOpen}
        editing={quickAddEditing}
        onClose={closeQuickAdd}
        onSuccess={refreshData}
        // Match the sheet to the screen it was opened from
        defaultMode={
          activeTab === 'CALENDAR' ? 'REMINDER' : activeTab === 'TIMETABLE' ? 'LESSON' : 'TASK'
        }
        defaultWeek={activeWeek}
      />
      </ErrorBoundary>

      <ErrorBoundary
        label="the check-in"
        variant="overlay"
        resetKeys={[isCheckInOpen]}
        onReset={() => setIsCheckInOpen(false)}
      >
      <DailyCheckInModal
        isOpen={isCheckInOpen}
        onClose={() => setIsCheckInOpen(false)}
        onSuccess={refreshData}
      />
      </ErrorBoundary>

      <ErrorBoundary
        label="the check-in history"
        variant="overlay"
        resetKeys={[isHistoryOpen]}
        onReset={() => setIsHistoryOpen(false)}
      >
      <CheckInHistoryModal
        isOpen={isHistoryOpen}
        onClose={() => setIsHistoryOpen(false)}
      />
      </ErrorBoundary>

      <ErrorBoundary
        label="the weekly review"
        variant="overlay"
        resetKeys={[isReviewOpen]}
        onReset={() => setIsReviewOpen(false)}
      >
      <WeeklyReviewModal
        isOpen={isReviewOpen}
        onClose={() => setIsReviewOpen(false)}
        onAddItem={() => setIsQuickAddOpen(true)}
      />
      </ErrorBoundary>

      <ErrorBoundary
        label="the welcome tour"
        variant="overlay"
        resetKeys={[isTourOpen]}
        onReset={() => {
          markTourSeen();
          setIsTourOpen(false);
        }}
      >
      <WelcomeTourModal
        isOpen={isTourOpen}
        onClose={() => {
          markTourSeen();
          setIsTourOpen(false);
        }}
      />
      </ErrorBoundary>

      <DatabaseGate />

      <CloudLoginDialog />

      <ErrorBoundary
        label="the parent PIN"
        variant="overlay"
        resetKeys={[isParentPinOpen]}
        onReset={() => setIsParentPinOpen(false)}
      >
      <ParentPinModal
        isOpen={isParentPinOpen}
        onClose={() => setIsParentPinOpen(false)}
        onSuccess={handleParentUnlockSuccess}
      />
      </ErrorBoundary>
    </div>
    </ChangeGuardProvider>
    </FeedbackProvider>
  );
};

export default App;

import React, { useState } from 'react';
import { UserRole } from '../../types';
import { useEscapeToClose } from '../../hooks/useEscapeToClose';
import {
  LayoutDashboard,
  Target,
  Calendar,
  Wrench,
  Gift,
  HelpCircle,
  Lightbulb,
  Shield,
  ListTodo,
  CalendarDays,
  ClipboardCheck,
  FileCheck,
  MoreHorizontal,
  X,
} from 'lucide-react';

export type NavTab =
  | 'DASHBOARD'
  | 'TASKS'
  | 'CALENDAR'
  | 'PLAN'
  | 'UPDATES'
  | 'PROOF'
  | 'GOALS'
  | 'TIMETABLE'
  | 'REMEDIATIONS'
  | 'REWARDS'
  | 'GUIDANCE'
  | 'IMPROVEMENTS'
  | 'PARENT';

interface NavigationProps {
  activeTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  currentRole: UserRole;
}

export const Navigation: React.FC<NavigationProps> = ({
  activeTab,
  onSelectTab,
  currentRole,
}) => {
  const [isMoreOpen, setIsMoreOpen] = useState(false);

  /**
   * Ordered by how often the thing is actually used, not by how important it
   * sounds. `daily` sits in the bottom bar and at the front of the desktop tabs;
   * `weekly` is planning and review work that is opened once or twice a week and
   * lives behind the divider / the "More" sheet.
   */
  const navItems = [
    { id: 'DASHBOARD', label: 'Home', shortLabel: 'Home', icon: LayoutDashboard, tier: 'daily' },
    { id: 'TASKS', label: 'My Work', shortLabel: 'Work', icon: ListTodo, tier: 'daily' },
    // Plan absorbs Key Dates: a deadline only means something next to the work
    // meant to meet it, and a sixth bottom-bar tab would not fit on a phone.
    { id: 'PLAN', label: 'Plan', shortLabel: 'Plan', icon: CalendarDays, tier: 'daily' },
    { id: 'REMEDIATIONS', label: 'Fix My Mistakes', shortLabel: 'Fix Ups', icon: Wrench, tier: 'daily' },
    // Where changes get signed off. Daily, because an update that waits a week
    // to be confirmed is a week the family spent asking.
    { id: 'UPDATES', label: 'Updates', shortLabel: 'Updates', icon: ClipboardCheck, tier: 'daily' },
    // Logged when a marked paper comes back - a weekly rhythm, not a daily one
    { id: 'PROOF', label: 'Proof Log', shortLabel: 'Proof', icon: FileCheck, tier: 'weekly' },
    { id: 'REWARDS', label: 'Rewards', shortLabel: 'Rewards', icon: Gift, tier: 'weekly' },
    { id: 'TIMETABLE', label: 'Timetable', shortLabel: 'Timetable', icon: Calendar, tier: 'weekly' },
    { id: 'GOALS', label: 'Subjects & Goals', shortLabel: 'Subjects', icon: Target, tier: 'weekly' },
    // Named for help first: the tab holds the only explanation of how the app
    // works, and "Careers" gave no reason to open it looking for that.
    { id: 'GUIDANCE', label: 'Help & Careers', shortLabel: 'Help', icon: HelpCircle, tier: 'weekly' },
    /**
     * Weekly, not daily. Filing an idea is not part of the daily loop, but it
     * has to be reachable from anywhere or it only ever gets used when somebody
     * remembers to go looking - which is never.
     */
    { id: 'IMPROVEMENTS', label: 'Report Bugs / Suggest Improvements', shortLabel: 'Report', icon: Lightbulb, tier: 'weekly' },
    ...(currentRole === 'PARENT'
      ? [
          {
            id: 'PARENT',
            label: 'Parent Portal',
            shortLabel: 'Parent',
            icon: Shield,
            tier: 'weekly' as const,
          },
        ]
      : []),
  ] as const;

  const dailyItems = navItems.filter((item) => item.tier === 'daily');
  const weeklyItems = navItems.filter((item) => item.tier === 'weekly');

  /**
   * What the More sheet leads with.
   *
   * The sheet is opened for one of two reasons far more often than the rest:
   * spending XP, and a parent getting into the portal. Both used to sit on the
   * second row, below the fold on a phone. Desktop keeps its own order, which
   * is grouped by rhythm rather than by frequency.
   */
  const overflowPriority = ['REWARDS', 'PARENT', 'PROOF', 'TIMETABLE', 'GOALS', 'GUIDANCE'];
  const sheetItems = [...weeklyItems].sort(
    (a, b) => overflowPriority.indexOf(a.id) - overflowPriority.indexOf(b.id)
  );
  const activeWeeklyItem = weeklyItems.find((item) => item.id === activeTab);
  const isOverflowActive = !!activeWeeklyItem;

  useEscapeToClose(isMoreOpen, () => setIsMoreOpen(false));

  const handleSelect = (tab: NavTab) => {
    onSelectTab(tab);
    setIsMoreOpen(false);
  };

  const desktopTabClass = (isActive: boolean) =>
    `flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all whitespace-nowrap ${
      isActive
        ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-950/50'
        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
    }`;

  return (
    <>
      {/* Desktop navigation.

          Every tab used to render in one row with `overflow-x-auto`, which on a
          1280px page meant roughly 1500px of tabs and a horizontal scrollbar -
          so the weekly sections, including the Parent Portal, were reachable
          only by scrolling a bar that gave no sign it had more in it. The
          phone had solved this already with five daily tabs and a sheet; this
          is the same split, and it shares `isMoreOpen` so there is one menu
          with two presentations rather than two things to keep in step. */}
      <nav className="hidden md:flex items-center gap-1.5 p-1.5 bg-slate-900/90 backdrop-blur-md rounded-2xl border border-slate-800/80 mb-6">
        {dailyItems.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              onClick={() => onSelectTab(item.id as NavTab)}
              className={desktopTabClass(activeTab === item.id)}
            >
              <Icon className="w-4 h-4" />
              <span>{item.label}</span>
            </button>
          );
        })}

        <div className="ml-auto flex items-center gap-1.5">
          {/* Where you are, when where you are is behind the menu. Without this
              the bar highlights nothing at all on the Parent Portal, and the
              only cue that a tab is open is the page content. */}
          {activeWeeklyItem && (
            <>
              <span className="w-px h-6 bg-slate-700" aria-hidden="true" />
              <button
                onClick={() => onSelectTab(activeWeeklyItem.id as NavTab)}
                className={desktopTabClass(true)}
              >
                <activeWeeklyItem.icon className="w-4 h-4" />
                <span>{activeWeeklyItem.shortLabel}</span>
              </button>
            </>
          )}

          <div className="relative">
            <button
              onClick={() => setIsMoreOpen((prev) => !prev)}
              aria-expanded={isMoreOpen}
              aria-haspopup="menu"
              className={desktopTabClass(false)}
            >
              <MoreHorizontal className="w-4 h-4" />
              <span>More</span>
            </button>

            {isMoreOpen && (
              <>
                {/* Catches the next click anywhere. A dropdown that only closes
                    on its own button is one a person leaves open. */}
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setIsMoreOpen(false)}
                  aria-hidden="true"
                />
                <div
                  role="menu"
                  aria-label="Weekly sections"
                  className="absolute right-0 top-full mt-2 z-50 w-64 p-1.5 bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl shadow-black/50"
                >
                  <p className="px-2.5 py-1.5 text-[10px] uppercase tracking-wider text-slate-500 font-bold">
                    About once a week
                  </p>
                  {sheetItems.map((item) => {
                    const Icon = item.icon;
                    const isActive = activeTab === item.id;
                    return (
                      <button
                        key={item.id}
                        role="menuitem"
                        onClick={() => handleSelect(item.id as NavTab)}
                        className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-xs font-semibold text-left transition-colors ${
                          isActive
                            ? 'bg-indigo-600 text-white'
                            : 'text-slate-300 hover:bg-slate-800'
                        }`}
                      >
                        <Icon className="w-4 h-4 flex-shrink-0" />
                        <span className="leading-tight">{item.label}</span>
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </div>
      </nav>

      {/* Mobile "More" sheet - holds every tab that does not fit in the bottom bar */}
      {isMoreOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Rewards, subjects and settings"
          className="md:hidden fixed inset-0 z-40 flex flex-col justify-end"
        >
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => setIsMoreOpen(false)}
          />

          {/* pb-nav-safe, not pb-safe: this sheet opens flush with the bottom of
              the screen and the fixed bottom bar paints on top of it, so the
              second row of tiles - Subjects, Careers, and Parent Portal in
              parent mode - was all but untappable on a phone. */}
          <div className="relative bg-slate-900 border-t border-slate-700 rounded-t-3xl p-4 pb-nav-safe shadow-2xl max-h-[70vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-sm font-bold text-white">Rewards, subjects &amp; settings</h3>
                <p className="text-[11px] text-slate-400">
                  The screens you open about once a week
                </p>
              </div>
              <button
                onClick={() => setIsMoreOpen(false)}
                aria-label="Close menu"
                className="p-2 -mr-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-3 gap-2">
              {sheetItems.map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => handleSelect(item.id as NavTab)}
                    className={`flex flex-col items-center justify-center gap-1.5 min-h-[76px] px-2 py-3 rounded-2xl border text-center transition-all ${
                      isActive
                        ? 'bg-indigo-600 text-white border-indigo-400'
                        : 'bg-slate-800/70 text-slate-300 border-slate-700 hover:bg-slate-800'
                    }`}
                  >
                    <Icon className="w-5 h-5" />
                    <span className="text-[11px] font-semibold leading-tight">
                      {item.shortLabel}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Mobile Bottom Navigation Bar */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-slate-950/95 backdrop-blur-lg border-t border-slate-800 pb-safe px-2 py-1.5">
        <div className="flex items-center justify-around">
          {dailyItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => handleSelect(item.id as NavTab)}
                className={`flex flex-col items-center justify-center gap-1 min-h-[48px] min-w-[60px] px-2 rounded-xl transition-all ${
                  isActive ? 'text-indigo-400' : 'text-slate-400'
                }`}
              >
                <Icon className={`w-5 h-5 ${isActive ? 'scale-110' : ''}`} />
                <span className="text-[11px] font-medium tracking-tight whitespace-nowrap">
                  {item.shortLabel}
                </span>
              </button>
            );
          })}

          <button
            onClick={() => setIsMoreOpen((prev) => !prev)}
            aria-label="More sections"
            aria-expanded={isMoreOpen}
            className={`flex flex-col items-center justify-center gap-1 min-h-[48px] min-w-[60px] px-2 rounded-xl transition-all ${
              isMoreOpen || isOverflowActive ? 'text-indigo-400' : 'text-slate-400'
            }`}
          >
            <MoreHorizontal className="w-5 h-5" />
            <span className="text-[11px] font-medium tracking-tight">More</span>
          </button>
        </div>
      </div>
    </>
  );
};

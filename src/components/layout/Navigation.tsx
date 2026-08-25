import React, { useState } from 'react';
import { UserRole } from '../../types';
import {
  LayoutDashboard,
  Target,
  Calendar,
  Wrench,
  Gift,
  HelpCircle,
  Shield,
  ListTodo,
  CalendarDays,
  ClipboardCheck,
  MoreHorizontal,
  X,
} from 'lucide-react';

export type NavTab =
  | 'DASHBOARD'
  | 'TASKS'
  | 'CALENDAR'
  | 'PROOF'
  | 'GOALS'
  | 'TIMETABLE'
  | 'REMEDIATIONS'
  | 'REWARDS'
  | 'GUIDANCE'
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
    { id: 'CALENDAR', label: 'Key Dates', shortLabel: 'Dates', icon: CalendarDays, tier: 'daily' },
    { id: 'REMEDIATIONS', label: 'Fix My Mistakes', shortLabel: 'Fix Ups', icon: Wrench, tier: 'daily' },
    // Logged when a marked paper comes back - a weekly rhythm, not a daily one
    { id: 'PROOF', label: 'Proof Log', shortLabel: 'Proof', icon: ClipboardCheck, tier: 'weekly' },
    { id: 'REWARDS', label: 'Rewards', shortLabel: 'Rewards', icon: Gift, tier: 'weekly' },
    { id: 'TIMETABLE', label: 'Timetable', shortLabel: 'Timetable', icon: Calendar, tier: 'weekly' },
    { id: 'GOALS', label: 'Subjects & Goals', shortLabel: 'Subjects', icon: Target, tier: 'weekly' },
    { id: 'GUIDANCE', label: 'Careers & Help', shortLabel: 'Careers', icon: HelpCircle, tier: 'weekly' },
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
  const isOverflowActive = weeklyItems.some((item) => item.id === activeTab);

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
      {/* Desktop Navigation Tabs - everyday sections first, then a divider and the
          weekly planning ones */}
      <nav className="hidden md:flex items-center gap-1.5 p-1.5 bg-slate-900/90 backdrop-blur-md rounded-2xl border border-slate-800/80 mb-6 overflow-x-auto">
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

        <div className="flex items-center gap-2 px-2 flex-shrink-0" aria-hidden="true">
          <span className="w-px h-6 bg-slate-700" />
          <span className="text-[10px] uppercase tracking-wider text-slate-600 font-bold">
            Weekly
          </span>
        </div>

        {weeklyItems.map((item) => {
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
      </nav>

      {/* Mobile "More" sheet - holds every tab that does not fit in the bottom bar */}
      {isMoreOpen && (
        <div className="md:hidden fixed inset-0 z-40 flex flex-col justify-end">
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => setIsMoreOpen(false)}
          />

          <div className="relative bg-slate-900 border-t border-slate-700 rounded-t-3xl p-4 pb-safe shadow-2xl max-h-[70vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-sm font-bold text-white">Everything else</h3>
                <p className="text-[11px] text-slate-400">
                  Rewards, goals and timetable - usually once a week
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
              {weeklyItems.map((item) => {
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

import React from 'react';
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
} from 'lucide-react';

export type NavTab =
  | 'DASHBOARD'
  | 'TASKS'
  | 'CALENDAR'
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
  const navItems = [
    { id: 'DASHBOARD', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'TASKS', label: 'Tasks & Planning', icon: ListTodo },
    { id: 'CALENDAR', label: 'Milestones Calendar', icon: CalendarDays },
    { id: 'GOALS', label: 'Grade 9 Syllabi', icon: Target },
    { id: 'TIMETABLE', label: 'Timetable', icon: Calendar },
    { id: 'REMEDIATIONS', label: 'Diagnostic Quests', icon: Wrench },
    { id: 'REWARDS', label: 'XP Rewards', icon: Gift },
    { id: 'GUIDANCE', label: 'Careers & Links', icon: HelpCircle },
    ...(currentRole === 'PARENT'
      ? [{ id: 'PARENT', label: 'Parent Portal', icon: Shield }]
      : []),
  ];

  return (
    <>
      {/* Desktop Navigation Tabs */}
      <nav className="hidden md:flex items-center gap-1.5 p-1.5 bg-slate-900/90 backdrop-blur-md rounded-2xl border border-slate-800/80 mb-6 overflow-x-auto">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onSelectTab(item.id as NavTab)}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all whitespace-nowrap ${
                isActive
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-950/50 scale-102'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Mobile Bottom Navigation Bar */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-slate-950/95 backdrop-blur-lg border-t border-slate-800 pb-safe px-2 py-1.5">
        <div className="flex items-center justify-around overflow-x-auto">
          {navItems.slice(0, 5).map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onSelectTab(item.id as NavTab)}
                className={`flex flex-col items-center gap-1 py-1 px-2.5 rounded-xl min-w-[54px] transition-all ${
                  isActive ? 'text-indigo-400' : 'text-slate-400'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'scale-110' : ''}`} />
                <span className="text-[10px] font-medium tracking-tight whitespace-nowrap">
                  {item.id === 'DASHBOARD'
                    ? 'Home'
                    : item.id === 'TASKS'
                    ? 'Tasks'
                    : item.id === 'CALENDAR'
                    ? 'Calendar'
                    : item.id === 'GOALS'
                    ? 'Grade 9'
                    : item.id === 'REMEDIATIONS'
                    ? 'Quests'
                    : item.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
};

import React from 'react';
import {
  LayoutDashboard,
  Target,
  CalendarDays,
  Wrench,
  Gift,
  Compass,
  ShieldAlert,
} from 'lucide-react';
import { UserRole } from '../../types';

export type ActiveTab =
  | 'dashboard'
  | 'goals'
  | 'timetable'
  | 'remediation'
  | 'rewards'
  | 'guidance'
  | 'parent';

interface NavigationProps {
  activeTab: ActiveTab;
  onSelectTab: (tab: ActiveTab) => void;
  currentRole: UserRole;
}

export const Navigation: React.FC<NavigationProps> = ({
  activeTab,
  onSelectTab,
  currentRole,
}) => {
  const tabs = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'goals', label: 'Grade 9 Goals', icon: Target },
    { id: 'timetable', label: 'Timetable', icon: CalendarDays },
    { id: 'remediation', label: 'Remediations', icon: Wrench },
    { id: 'rewards', label: 'Rewards Shop', icon: Gift },
    { id: 'guidance', label: 'Careers & Help', icon: Compass },
    { id: 'parent', label: 'Parent Portal', icon: ShieldAlert, highlight: currentRole === 'PARENT' },
  ];

  return (
    <>
      {/* Desktop Horizontal Tabs */}
      <nav className="hidden md:block bg-slate-900/60 border-b border-slate-800/80 sticky top-[61px] z-30 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 flex items-center gap-1 py-1.5 overflow-x-auto">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => onSelectTab(tab.id as ActiveTab)}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
                  isActive
                    ? 'bg-indigo-600/20 text-indigo-300 border border-indigo-500/40 shadow-sm shadow-indigo-900/30'
                    : tab.highlight
                    ? 'text-rose-400 hover:bg-rose-950/40'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-indigo-400' : 'text-slate-400'}`} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* Mobile Bottom Navigation Bar (iPhone / Android) */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-slate-950/95 border-t border-slate-800/90 backdrop-blur-lg px-2 py-1.5 pb-safe flex items-center justify-around shadow-2xl">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onSelectTab(tab.id as ActiveTab)}
              className={`flex flex-col items-center justify-center touch-target py-1 px-1.5 rounded-lg transition-all ${
                isActive
                  ? 'text-indigo-400 font-semibold'
                  : tab.highlight
                  ? 'text-rose-400 font-medium'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Icon className={`w-5 h-5 mb-0.5 ${isActive ? 'text-indigo-400 scale-110' : ''}`} />
              <span className="text-[10px] tracking-tight">{tab.label.split(' ')[0]}</span>
            </button>
          );
        })}
      </nav>
    </>
  );
};

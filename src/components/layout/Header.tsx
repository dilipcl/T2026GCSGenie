import React, { useState, useEffect } from 'react';
import { UserRole, WeekType } from '../../types';
import { calculateTotalXP } from '../../services/ragCalculator';
import { calculateStreakStats, StreakStats } from '../../services/habitEngine';
import { Sparkles, Flame, Calendar, Lock, Unlock } from 'lucide-react';

interface HeaderProps {
  currentRole: UserRole;
  onToggleRole: (targetRole: UserRole) => void;
  activeWeek: WeekType;
  onToggleWeek: () => void;
  onOpenCheckIn: () => void;
  onOpenRewards: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentRole,
  onToggleRole,
  activeWeek,
  onToggleWeek,
  onOpenCheckIn,
  onOpenRewards,
}) => {
  const [streak, setStreak] = useState<StreakStats | null>(null);
  const [xp, setXp] = useState({ totalXP: 0, availableXP: 0, isShopFrozen: false });

  const refreshMetrics = async () => {
    const s = await calculateStreakStats();
    const x = await calculateTotalXP();
    setStreak(s);
    setXp(x);
  };

  useEffect(() => {
    refreshMetrics();
    const interval = setInterval(refreshMetrics, 3000);
    return () => clearInterval(interval);
  }, []);

  const todayFormatted = new Intl.DateTimeFormat('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(new Date());

  return (
    <header className="sticky top-0 z-40 bg-slate-950/80 backdrop-blur-md border-b border-slate-800/80 px-4 py-3 pt-safe">
      <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3">
        {/* Logo & Student Identity */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-xl shadow-lg shadow-indigo-500/20">
            🧞‍♂️
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-bold text-lg text-white tracking-tight">GCSE Genie</h1>
              <span className="text-[11px] px-2 py-0.5 rounded-full font-semibold uppercase tracking-wider bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                Grade 9 Accelerator
              </span>
            </div>
            <p className="text-xs text-slate-400">Tejas Dilip · Year 10 (GCS)</p>
          </div>
        </div>

        {/* Status Metrics Bar */}
        <div className="flex items-center flex-wrap gap-2 text-xs">
          {/* Rotational Week Pill */}
          <button
            onClick={onToggleWeek}
            title="Click to toggle between Guildford County School Odd / Even week"
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700/80 text-slate-300 hover:border-slate-500 transition-colors"
          >
            <Calendar className="w-3.5 h-3.5 text-indigo-400" />
            <span>{todayFormatted}</span>
            <span className="font-semibold text-indigo-300 ml-1 px-1.5 py-0.5 bg-indigo-950 rounded text-[10px] uppercase border border-indigo-700/50">
              {activeWeek} Week
            </span>
          </button>

          {/* Streak Badge - amber when exactly one day has been missed, so the
              "don't miss twice" moment is visible from anywhere in the app */}
          <div
            title={
              streak?.atRisk
                ? "You missed yesterday. Check in today and the streak survives."
                : streak?.best
                ? `Best run: ${streak.best} days`
                : undefined
            }
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border font-medium ${
              streak?.atRisk
                ? 'bg-amber-500/20 border-amber-400/60 text-amber-200'
                : 'bg-amber-500/10 border-amber-500/30 text-amber-300'
            }`}
          >
            <Flame className="w-3.5 h-3.5 text-amber-400" />
            <span>
              {streak?.current ?? 0} Day Streak
              {streak?.atRisk && ' · at risk'}
            </span>
          </div>

          {/* XP Badge - doubles as the shortcut into the rewards shop, so spending
              XP is always one tap away without using a nav slot */}
          <button
            onClick={onOpenRewards}
            title="Spend your XP in the rewards shop"
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-indigo-500/10 border border-indigo-500/30 text-indigo-300 font-medium hover:bg-indigo-500/20 hover:border-indigo-400/50 transition-colors"
          >
            <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
            <span>{xp.availableXP.toLocaleString()} XP</span>
            {xp.isShopFrozen && (
              <span className="text-[10px] bg-rose-500/20 text-rose-300 px-1 rounded border border-rose-500/40">
                Shop Locked
              </span>
            )}
          </button>

          {/* Quick Daily Check-in Button */}
          <button
            onClick={onOpenCheckIn}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-semibold shadow-md shadow-emerald-900/30 hover:from-emerald-500 hover:to-teal-500 transition-all text-xs"
          >
            <span>⚡ Check in</span>
          </button>

          {/* Role Switcher (Student / Parent Mode) */}
          <button
            onClick={() => onToggleRole(currentRole === 'STUDENT' ? 'PARENT' : 'STUDENT')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium border transition-all text-xs ${
              currentRole === 'PARENT'
                ? 'bg-rose-500/20 text-rose-300 border-rose-500/40 shadow-sm shadow-rose-900/30'
                : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
            }`}
          >
            {currentRole === 'PARENT' ? (
              <>
                <Unlock className="w-3.5 h-3.5 text-rose-400" />
                <span>Parent Mode</span>
              </>
            ) : (
              <>
                <Lock className="w-3.5 h-3.5 text-slate-400" />
                <span>Student Mode</span>
              </>
            )}
          </button>
        </div>
      </div>
    </header>
  );
};

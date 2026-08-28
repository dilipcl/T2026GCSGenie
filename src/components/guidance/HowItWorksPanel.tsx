import React from 'react';
import { Sparkles, Flame, Target } from 'lucide-react';

interface ScreenCard {
  icon: string;
  name: string;
  what: string;
}

/**
 * What each screen is for, in the student's own language.
 *
 * "Careers & Help" was careers advice, revision links and a teacher directory -
 * useful, and none of it an explanation of the app. Nothing anywhere said what
 * Fix My Mistakes was, how a streak survives a missed day, or why a goal has to
 * be locked before its hours count. A tool nobody has been shown how to use
 * gets used for the two screens that are self-evident and abandoned for the
 * rest.
 */
const SCREENS: ScreenCard[] = [
  {
    icon: '🏠',
    name: 'Home',
    what: 'Your day, sorted. What is due, what is overdue, your streak, and a 25-minute focus timer. Start here every morning.',
  },
  {
    icon: '✅',
    name: 'My Work',
    what: 'Every piece of homework in one list, soonest first. Tick it off to bank XP. Filter by subject when you are in the zone.',
  },
  {
    icon: '🗓️',
    name: 'Plan',
    what: 'Decide what this week actually holds. Pull work into "This week" to commit; anything you do not stops nagging you.',
  },
  {
    icon: '🔧',
    name: 'Fix My Mistakes',
    what: 'The exact marks you dropped in Year 9, turned into short practice quests. Do one, upload your working, claim the XP.',
  },
  {
    icon: '📸',
    name: 'Proof',
    what: 'Snap a photo of a marked test. Genie logs the score per question so you can see which topic to hit next.',
  },
  {
    icon: '🎁',
    name: 'Rewards',
    what: 'Spend XP on real stuff - screen time, film night, pocket money. Request it; a parent says yes.',
  },
  {
    icon: '📅',
    name: 'Timetable',
    what: 'Your Odd/Even week, with cadets, art and drums locked in. Today’s lessons also show on Home.',
  },
  {
    icon: '🎯',
    name: 'Subjects & Goals',
    what: 'How each subject is tracking to Grade 9, and your big goals. Propose a SMART goal and a parent locks it in.',
  },
];

const EXPLAINERS = [
  {
    icon: Sparkles,
    tone: 'text-amber-400',
    title: 'How XP works',
    body: 'Check in daily (+20), finish homework (+50), clear a fix-up quest (big XP). XP is yours to spend in Rewards. Detentions cost XP and freeze the shop until you make it right.',
  },
  {
    icon: Flame,
    tone: 'text-orange-400',
    title: 'Streak & grace days',
    body: 'Check in each day to grow your streak. Miss one? A grace day absorbs it - but miss two in a row and it resets. Come straight back and the chain holds.',
  },
  {
    icon: Target,
    tone: 'text-indigo-400',
    title: 'Goals: propose then lock',
    body: 'You write a goal the SMART way and set the weekly hours. A parent talks it through and locks it - locked goals count towards your weekly time budget, and Genie tracks the hours you actually log against them.',
  },
];

export const HowItWorksPanel: React.FC = () => (
  <div className="space-y-4">
    <div className="p-4 bg-slate-900/60 rounded-2xl border border-slate-800 text-xs text-slate-300">
      <strong className="text-teal-400 font-semibold">The whole idea: </strong>
      Genie holds the plan so you do not have to. Two things every day - check in, and do the work
      in front of you. Everything else on this page is there for when you need it.
    </div>

    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {SCREENS.map((screen) => (
        <div
          key={screen.name}
          className="p-4 bg-slate-900/70 border border-slate-800 rounded-2xl flex items-start gap-3"
        >
          <span className="text-2xl leading-none flex-shrink-0">{screen.icon}</span>
          <div>
            <h4 className="text-sm font-bold text-white mb-0.5">{screen.name}</h4>
            <p className="text-xs text-slate-400 leading-relaxed">{screen.what}</p>
          </div>
        </div>
      ))}
    </div>

    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 pt-2">
      Three things worth knowing
    </h3>

    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
      {EXPLAINERS.map((item) => {
        const Icon = item.icon;
        return (
          <div key={item.title} className="p-4 glass-card">
            <div className="flex items-center gap-2 mb-1.5">
              <Icon className={`w-4 h-4 ${item.tone}`} />
              <h4 className="text-sm font-bold text-white">{item.title}</h4>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">{item.body}</p>
          </div>
        );
      })}
    </div>
  </div>
);

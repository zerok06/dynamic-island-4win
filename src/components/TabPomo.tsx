import React, { useState } from 'react';
import { Play, Pause, RotateCcw, BarChart2 } from 'lucide-react';
import { TabPomoReport } from './TabPomoReport';
import { getTranslation, Language } from '../utils/i18n';

interface TabPomoProps {
  seconds: number;
  setSeconds: React.Dispatch<React.SetStateAction<number>>;
  totalSeconds: number;
  setTotalSeconds: React.Dispatch<React.SetStateAction<number>>;
  isRunning: boolean;
  setIsRunning: React.Dispatch<React.SetStateAction<boolean>>;
  completedCount: number;
  setCompletedCount: React.Dispatch<React.SetStateAction<number>>;
  language: Language;
}

const PRESETS = [
  { label: '15m', seconds: 900 },
  { label: '25m', seconds: 1500 },
  { label: '45m', seconds: 2700 },
  { label: '60m', seconds: 3600 },
];

export const TabPomo: React.FC<TabPomoProps> = ({
  seconds,
  setSeconds,
  totalSeconds,
  setTotalSeconds,
  isRunning,
  setIsRunning,
  completedCount: _completedCount,
  setCompletedCount: _setCompletedCount,
  language,
}) => {
  const [showReport, setShowReport] = useState(false);
  const t = getTranslation(language);

  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  const timeString = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;

  const CIRCUMFERENCE = 2 * Math.PI * 52; // r=52
  const progress = 1 - seconds / totalSeconds;
  const strokeDashoffset = CIRCUMFERENCE * (1 - progress);

  const toggleTimer = () => {
    setIsRunning(!isRunning);
  };

  const resetTimer = () => {
    setIsRunning(false);
    setSeconds(totalSeconds);
  };

  const handlePresetClick = (presetSeconds: number) => {
    if (isRunning) return;
    setTotalSeconds(presetSeconds);
    setSeconds(presetSeconds);
  };

  if (showReport) {
    return <TabPomoReport onBack={() => setShowReport(false)} language={language} />;
  }

  return (
    <div className="flex flex-col items-center gap-3.5 w-full">
      {/* Header with Stats Toggle */}
      <div className="flex items-center justify-between border-b border-island/[0.04] pb-2 w-full">
        <span className="text-[12px] font-black uppercase tracking-widest text-island/40">{t.pomoTitle}</span>
        <button
          onClick={() => setShowReport(true)}
          className="px-2.5 py-1 rounded bg-island/[0.04] hover:bg-island/[0.08] text-island/60 hover:text-island transition-all text-[11px] font-bold uppercase tracking-wider flex items-center gap-1.5 border border-island/5"
        >
          <BarChart2 className="w-3.5 h-3.5 text-warning-color" />
          {t.pomoReport}
        </button>
      </div>

      {/* Preset Selectors */}
      <div className="flex items-center gap-1.5 p-1 bg-island/[0.02] border border-island/[0.05] rounded-xl shadow-inner w-full justify-between">
        {PRESETS.map((p) => {
          const isActive = totalSeconds === p.seconds;
          return (
            <button
              key={p.label}
              disabled={isRunning}
              onClick={() => handlePresetClick(p.seconds)}
              className={`flex-1 py-1.5 text-[12px] font-bold rounded-lg transition-all duration-[400ms] ease-[cubic-bezier(0.32,0.72,0,1)] ${
                isActive
                  ? 'bg-gradient-to-r from-warning-color to-orange-500 text-black shadow-md shadow-orange-500/10 scale-[1.02]'
                  : 'text-island/60 hover:text-island hover:bg-island/5 disabled:opacity-30 disabled:hover:bg-transparent'
              }`}
            >
              {p.label}
            </button>
          );
        })}
      </div>

      {/* Main Timer Dial */}
      <div className="relative w-[136px] h-[136px] flex items-center justify-center my-0.5">
        {/* Glow behind the ring */}
        <div
          className={`absolute inset-4 rounded-full transition-all duration-1000 ${
            isRunning
              ? 'bg-gradient-to-tr from-warning-color/20 to-red-500/20 animate-pulse scale-110 opacity-100 blur-xl'
              : 'bg-warning-color/5 opacity-40 scale-100 blur-lg'
          }`}
        />

        {/* SVG Progress Ring */}
        <svg className="absolute w-full h-full transform -rotate-90">
          <defs>
            <linearGradient id="pomoGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#fbbf24" /> {/* amber-400 */}
              <stop offset="100%" stopColor="#f87171" /> {/* red-400 */}
            </linearGradient>
          </defs>
          <circle
            cx="68"
            cy="68"
            r="52"
            className="stroke-island/5 fill-none"
            strokeWidth="4"
          />
          <circle
            cx="68"
            cy="68"
            r="52"
            stroke="url(#pomoGradient)"
            className="fill-none transition-all duration-[400ms] ease-out"
            strokeWidth="5"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
          />
        </svg>

        <div className="flex flex-col items-center z-10">
          <span className="text-[34px] font-mono font-bold text-island tracking-tight leading-none">
            {timeString}
          </span>
          <span
            className={`text-[9px] uppercase tracking-[0.2em] mt-2 font-black transition-colors ${
              isRunning ? 'text-warning-color animate-pulse' : 'text-island/40'
            }`}
          >
            {isRunning ? t.pomoFocusing : seconds === 0 ? t.pomoDone : t.pomoPaused}
          </span>
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-4 w-full justify-center">
        <button
          onClick={resetTimer}
          className="flex-1 py-2 rounded-lg bg-island/[0.02] border border-island/[0.05] hover:bg-island/[0.06] hover:border-island/[0.1] text-island/80 hover:text-island transition-all duration-[400ms] ease-[cubic-bezier(0.32,0.72,0,1)] hover:scale-102 active:scale-98 flex items-center justify-center gap-1.5"
          title={t.pomoReset}
        >
          <RotateCcw className="w-4 h-4" />
          <span className="text-[12px] font-bold">{t.pomoReset}</span>
        </button>

        <button
          onClick={toggleTimer}
          className="flex-1 py-2 rounded-lg bg-gradient-to-r from-warning-color to-orange-500 text-black shadow-md shadow-orange-500/10 hover:scale-102 active:scale-98 transition-all duration-[400ms] ease-[cubic-bezier(0.32,0.72,0,1)] font-bold flex items-center justify-center gap-1.5"
          title={isRunning ? t.pomoPause : t.pomoStart}
        >
          {isRunning ? (
            <>
              <Pause className="w-4 h-4 fill-black" />
              <span className="text-[12px]">{t.pomoPause}</span>
            </>
          ) : (
            <>
              <Play className="w-4 h-4 fill-black" />
              <span className="text-[12px]">{t.pomoStart}</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
};

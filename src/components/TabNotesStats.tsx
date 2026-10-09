import React, { useEffect, useState } from 'react';
import { ChevronLeft, Flame, TrendingUp, Grid, Award } from 'lucide-react';
import { getTranslation, Language } from '../utils/i18n';

interface TaskStats {
  week_completion_rate: number;
  month_completion_rate: number;
  streak_days: number;
  completion_trend_30d: number[];
  activity_grid: number[];
  avg_per_day: number;
  best_day_count: number;
  active_days_count: number;
  done_30d_count: number;
}

interface TabNotesStatsProps {
  onBack: () => void;
  language: Language;
}

export const TabNotesStats: React.FC<TabNotesStatsProps> = ({ onBack, language }) => {
  const t = getTranslation(language);
  const [todayDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [hoveredCell, setHoveredCell] = useState<{ date: string; count: number } | null>(null);

  const [stats, setStats] = useState<TaskStats>({
    week_completion_rate: 0,
    month_completion_rate: 0,
    streak_days: 0,
    completion_trend_30d: Array(30).fill(0),
    activity_grid: Array(168).fill(0),
    avg_per_day: 0.0,
    best_day_count: 0,
    active_days_count: 0,
    done_30d_count: 0,
  });

  const isTauri = !!(window as any).__TAURI__;

  const getCellDateString = (daysAgo: number) => {
    const parts = todayDate.split('-');
    if (parts.length !== 3) return todayDate;
    const date = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
    date.setDate(date.getDate() - daysAgo);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${months[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
  };

  useEffect(() => {
    const fetchStats = async () => {
      const today = todayDate;
      if (isTauri) {
        try {
          const { invoke } = await import('@tauri-apps/api/core');
          const data = await invoke<TaskStats>('get_local_task_stats', { today });
          setStats(data);
        } catch (err) {
          console.error('Failed to load task stats:', err);
        }
      } else {
        // Mock data for web
        setStats({
          week_completion_rate: 75.0,
          month_completion_rate: 58.3,
          streak_days: 5,
          completion_trend_30d: [0, 1, 0, 2, 1, 0, 1, 2, 0, 1, 3, 1, 0, 2, 1, 0, 2, 1, 0, 3, 1, 2, 0, 1, 2, 3, 0, 1, 2, 3],
          activity_grid: Array.from({ length: 168 }, (_, i) => (i % 3 === 0 ? Math.floor(Math.random() * 4) : 0)),
          avg_per_day: 1.6,
          best_day_count: 3,
          active_days_count: 14,
          done_30d_count: 24,
        });
      }
    };
    fetchStats();
  }, []);

  const r = 20; // Larger radius for more premium rings
  const circ = 2 * Math.PI * r;

  // Render SVG Trend Line Chart with Gradient Fill
  const trendMax = Math.max(...stats.completion_trend_30d, 1);
  const chartWidth = 400;
  const chartHeight = 35;
  
  const trendPoints = stats.completion_trend_30d
    .map((val, idx) => {
      const x = (idx / 29) * chartWidth;
      const y = chartHeight - 3 - (val / trendMax) * (chartHeight - 6);
      return `${x},${y}`;
    })
    .join(' ');

  // Create closed path for the gradient fill under the line
  const fillPoints = `0,${chartHeight} ${trendPoints} ${chartWidth},${chartHeight}`;

  return (
    <div className="flex flex-col gap-3.5 py-0.5 animate-content-reveal">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-island/[0.04] pb-2">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-[13px] font-bold text-island/50 hover:text-island transition-all hover:-translate-x-0.5"
        >
          <ChevronLeft className="w-[18px] h-[18px]" />
          {t.tasksTitle}
        </button>
        <span className="text-[13px] font-black uppercase tracking-[0.2em] text-success-color flex items-center gap-1.5">
          <Award className="w-4 h-4 animate-pulse" />
          {t.statsAnalytics}
        </span>
        <div className="w-10"></div>
      </div>

      {/* Rings & Streak Cards (Row Layout) */}
      <div className="grid grid-cols-3 gap-2.5 mt-0.5">
        {/* Week Completion */}
        <div className="relative overflow-hidden bg-gradient-to-b from-island/[0.03] to-transparent border border-island/[0.05] rounded-2xl p-2.5 flex flex-col items-center justify-center gap-2">
          <div className="relative w-14 h-14 flex items-center justify-center">
            <svg className="absolute w-full h-full transform -rotate-90">
              <defs>
                <linearGradient id="weekGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#10b981" />
                  <stop offset="100%" stopColor="#059669" />
                </linearGradient>
              </defs>
              <circle cx="28" cy="28" r={r} className="stroke-island/5 fill-none" strokeWidth="3" />
              <circle
                cx="28"
                cy="28"
                r={r}
                stroke="url(#weekGrad)"
                className="fill-none transition-all duration-[600ms] ease-out"
                strokeWidth="3.5"
                strokeDasharray={circ}
                strokeDashoffset={circ * (1 - stats.week_completion_rate / 100)}
                strokeLinecap="round"
              />
            </svg>
            <span className="text-[12px] font-mono font-black text-island">{Math.round(stats.week_completion_rate)}%</span>
          </div>
          <span className="text-[9.5px] text-island/40 tracking-wider font-extrabold uppercase text-center">{t.statsThisWeek}</span>
        </div>

        {/* Month Completion */}
        <div className="relative overflow-hidden bg-gradient-to-b from-island/[0.03] to-transparent border border-island/[0.05] rounded-2xl p-2.5 flex flex-col items-center justify-center gap-2">
          <div className="relative w-14 h-14 flex items-center justify-center">
            <svg className="absolute w-full h-full transform -rotate-90">
              <defs>
                <linearGradient id="monthGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#3b82f6" />
                  <stop offset="100%" stopColor="#2563eb" />
                </linearGradient>
              </defs>
              <circle cx="28" cy="28" r={r} className="stroke-island/5 fill-none" strokeWidth="3" />
              <circle
                cx="28"
                cy="28"
                r={r}
                stroke="url(#monthGrad)"
                className="fill-none transition-all duration-[600ms] ease-out"
                strokeWidth="3.5"
                strokeDasharray={circ}
                strokeDashoffset={circ * (1 - stats.month_completion_rate / 100)}
                strokeLinecap="round"
              />
            </svg>
            <span className="text-[12px] font-mono font-black text-island">{Math.round(stats.month_completion_rate)}%</span>
          </div>
          <span className="text-[9.5px] text-island/40 tracking-wider font-extrabold uppercase text-center">{t.statsThisMonth}</span>
        </div>

        {/* Streak Flame */}
        <div className="relative overflow-hidden bg-gradient-to-b from-island/[0.03] to-transparent border border-island/[0.05] rounded-2xl p-2.5 flex flex-col items-center justify-center gap-2">
          {/* Flame Glow */}
          <div className="absolute inset-0 bg-orange-500/5 filter blur-md pointer-events-none" />
          <div className="relative w-14 h-14 flex flex-col items-center justify-center z-10">
            <div className="flex items-center justify-center w-10 h-10 rounded-full bg-orange-500/10 border border-orange-500/20 shadow-inner">
              <Flame className="w-5 h-5 text-orange-500 fill-orange-500 filter drop-shadow-[0_0_8px_rgba(249,115,22,0.6)] animate-pulse" />
            </div>
            <span className="text-[14px] font-mono font-black text-island mt-1 leading-none">{stats.streak_days}</span>
          </div>
          <span className="text-[9.5px] text-island/40 tracking-wider font-extrabold uppercase text-center">{t.statsStreakDays}</span>
        </div>
      </div>

      {/* Completion Trend (Glow & Area Fill) */}
      <div className="bg-island/[0.02] border border-island/[0.04] rounded-2xl p-3 flex flex-col gap-2 relative overflow-hidden">
        <span className="text-[11px] text-island/40 tracking-wider uppercase font-bold flex items-center gap-1.5">
          <TrendingUp className="w-3.5 h-3.5 text-success-color" />
          {t.statsTrend}
        </span>
        <div className="w-full h-10 mt-1">
          <svg className="w-full h-full" viewBox={`0 0 ${chartWidth} ${chartHeight}`} preserveAspectRatio="none">
            <defs>
              <linearGradient id="chartFillGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#10b981" stopOpacity="0.25" />
                <stop offset="100%" stopColor="#10b981" stopOpacity="0.0" />
              </linearGradient>
            </defs>
            {/* Grid Line */}
            <line x1="0" y1={chartHeight} x2={chartWidth} y2={chartHeight} className="stroke-island/5" strokeWidth="1" />
            <line x1="0" y1="0" x2={chartWidth} y2="0" className="stroke-island/[0.02]" strokeWidth="1" />
            
            {/* Area Fill */}
            <polygon points={fillPoints} fill="url(#chartFillGrad)" />
            
            {/* Line Path */}
            <polyline
              fill="none"
              stroke="#10b981"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              points={trendPoints}
            />
          </svg>
        </div>
      </div>

      {/* Heatmap (Centered Grid Layout) */}
      <div className="bg-island/[0.02] border border-island/[0.04] rounded-2xl p-3 flex flex-col gap-2 relative">
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-island/40 tracking-wider uppercase font-bold flex items-center gap-1.5">
            <Grid className="w-3.5 h-3.5 text-success-color" />
            {t.statsHeatmap}
          </span>
          <span className="text-[10px] text-island/50 font-bold transition-all duration-200">
            {hoveredCell 
              ? `${hoveredCell.date} • ${hoveredCell.count} ${hoveredCell.count !== 1 ? t.statsTasks : t.statsTask}` 
              : t.statsHoverCells}
          </span>
        </div>
        <div className="flex gap-[4.5px] justify-center mt-1 px-0.5">
          {Array.from({ length: 24 }).map((_, colIdx) => (
            <div key={colIdx} className="flex flex-col gap-[4.5px]">
              {Array.from({ length: 7 }).map((_, rowIdx) => {
                const index = colIdx * 7 + rowIdx;
                const val = stats.activity_grid[index] || 0;
                
                // Color scaling matching the blue theme
                let bgClass = 'bg-island/[0.03] border border-island/[0.01]';
                if (val === 1) bgClass = 'bg-blue-950/40 border border-blue-900/30';
                if (val === 2) bgClass = 'bg-blue-800/40 border border-blue-700/30';
                if (val === 3) bgClass = 'bg-blue-600/60';
                if (val >= 4) bgClass = 'bg-blue-400 shadow-[0_0_8px_rgba(96,165,250,0.5)]';

                const daysAgo = 167 - index;
                const dateStr = getCellDateString(daysAgo);

                return (
                  <div
                    key={rowIdx}
                    className={`w-[10.5px] h-[10.5px] rounded-[2px] transition-all duration-150 hover:scale-130 hover:z-10 cursor-pointer ${bgClass}`}
                    onMouseEnter={() => setHoveredCell({ date: dateStr, count: val })}
                    onMouseLeave={() => setHoveredCell(null)}
                  />
                );
              })}
            </div>
          ))}
        </div>

        {/* Legend */}
        <div className="flex justify-end items-center gap-1.5 mt-2 text-[9px] text-island/35 font-medium select-none pr-1">
          <span>{t.statsLess}</span>
          <div className="w-2.5 h-2.5 rounded-[1px] bg-island/[0.03] border border-island/[0.01]" />
          <div className="w-2.5 h-2.5 rounded-[1px] bg-blue-950/40 border border-blue-900/30" />
          <div className="w-2.5 h-2.5 rounded-[1px] bg-blue-800/40 border border-blue-700/30" />
          <div className="w-2.5 h-2.5 rounded-[1px] bg-blue-600/60" />
          <div className="w-2.5 h-2.5 rounded-[1px] bg-blue-400 shadow-[0_0_4px_rgba(96,165,250,0.3)]" />
          <span>{t.statsMore}</span>
        </div>
      </div>

      {/* Grid Analytics Insights (Modern Glass Panels) */}
      <div className="grid grid-cols-4 gap-2 mt-0.5">
        {[
          { label: t.statsAvgDay, value: stats.avg_per_day.toFixed(1) },
          { label: t.statsBestDay, value: stats.best_day_count },
          { label: t.statsActive, value: `${stats.active_days_count}d` },
          { label: t.statsDone30d, value: stats.done_30d_count },
        ].map((item, i) => (
          <div key={i} className="bg-island/[0.02] border border-island/[0.04] rounded-xl p-2 flex flex-col items-center justify-center">
            <span className="text-[9px] text-island/35 font-bold uppercase tracking-wider">{item.label}</span>
            <span className="text-[13px] font-black font-mono text-island mt-1 leading-none">{item.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

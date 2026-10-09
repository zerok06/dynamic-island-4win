import React, { useEffect, useState } from 'react';
import { ChevronLeft, BarChart2, Clock, Calendar } from 'lucide-react';
import { getTranslation, Language } from '../utils/i18n';

interface FocusReport {
  today_minutes: number;
  today_sessions: number;
  week_minutes: number;
  week_sessions: number;
  today_counts: Record<number, number>;
}

interface TabPomoReportProps {
  onBack: () => void;
  language: Language;
}

export const TabPomoReport: React.FC<TabPomoReportProps> = ({ onBack, language }) => {
  const t = getTranslation(language);
  const [report, setReport] = useState<FocusReport>({
    today_minutes: 0,
    today_sessions: 0,
    week_minutes: 0,
    week_sessions: 0,
    today_counts: { 15: 0, 25: 0, 45: 0, 60: 0 },
  });

  const isTauri = !!(window as any).__TAURI__;

  useEffect(() => {
    const fetchReport = async () => {
      // Calculate local midnight start in seconds
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayStartS = Math.floor(today.getTime() / 1000);

      // Calculate 7 days ago start in seconds
      const weekStart = new Date();
      weekStart.setDate(weekStart.getDate() - 7);
      weekStart.setHours(0, 0, 0, 0);
      const weekStartS = Math.floor(weekStart.getTime() / 1000);

      if (isTauri) {
        try {
          const { invoke } = await import('@tauri-apps/api/core');
          const data = await invoke<FocusReport>('get_focus_reports', {
            todayStartS,
            weekStartS,
          });
          setReport(data);
        } catch (err) {
          console.error('Failed to load focus report:', err);
        }
      } else {
        // Web mock data
        setReport({
          today_minutes: 50,
          today_sessions: 2,
          week_minutes: 215,
          week_sessions: 9,
          today_counts: { 15: 0, 25: 2, 45: 0, 60: 0 },
        });
      }
    };

    fetchReport();
  }, []);

  return (
    <div className="flex flex-col gap-3.5 py-0.5 animate-content-reveal">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-island/[0.04] pb-2">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-[13px] font-bold text-island/50 hover:text-island transition-all hover:-translate-x-0.5"
        >
          <ChevronLeft className="w-[18px] h-[18px]" />
          {t.pomoTimer}
        </button>
        <span className="text-[13px] font-black uppercase tracking-[0.2em] text-warning-color flex items-center gap-1.5">
          <BarChart2 className="w-4 h-4 animate-pulse" />
          {t.pomoFocusReport}
        </span>
        <div className="w-10"></div>
      </div>

      {/* Grid Stats */}
      <div className="grid grid-cols-2 gap-2.5 mt-0.5">
        <div className="relative overflow-hidden bg-gradient-to-b from-island/[0.03] to-transparent border border-island/[0.05] rounded-2xl p-3.5 flex flex-col gap-1.5">
          <span className="text-[11px] text-island/40 tracking-wider uppercase font-bold flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-warning-color" />
            {t.pomoToday}
          </span>
          <div className="flex items-baseline gap-1 mt-0.5">
            <span className="text-2xl font-bold font-mono text-island leading-none">{report.today_minutes}</span>
            <span className="text-[12px] text-island/40 font-bold">m</span>
          </div>
          <span className="text-[11px] text-island/30 font-medium mt-0.5">
            {report.today_sessions} {report.today_sessions === 1 ? t.pomoSession : t.pomoSessions}
          </span>
        </div>

        <div className="relative overflow-hidden bg-gradient-to-b from-island/[0.03] to-transparent border border-island/[0.05] rounded-2xl p-3.5 flex flex-col gap-1.5">
          <span className="text-[11px] text-island/40 tracking-wider uppercase font-bold flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 text-warning-color" />
            {t.pomo7Days}
          </span>
          <div className="flex items-baseline gap-1 mt-0.5">
            <span className="text-2xl font-bold font-mono text-island leading-none">{report.week_minutes}</span>
            <span className="text-[12px] text-island/40 font-bold">m</span>
          </div>
          <span className="text-[11px] text-island/30 font-medium mt-0.5">
            {report.week_sessions} {report.week_sessions === 1 ? t.pomoSession : t.pomoSessions}
          </span>
        </div>
      </div>

      {/* Distribution */}
      <div className="bg-island/[0.02] border border-island/[0.04] rounded-2xl p-3.5 flex flex-col gap-3 mt-0.5">
        <span className="text-[11px] text-island/40 tracking-wider uppercase font-bold">
          {t.pomoBreakdown}
        </span>
        <div className="flex flex-col gap-2.5">
          {[15, 25, 45, 60].map((dur) => {
            const count = report.today_counts[dur] || 0;
            const maxVal = Math.max(...Object.values(report.today_counts), 4);
            const percentage = (count / maxVal) * 100;

            return (
              <div key={dur} className="flex items-center gap-3">
                <span className="text-[12px] font-mono font-bold text-island/60 w-8">{dur}m</span>
                <div className="flex-1 h-1.5 bg-island/[0.04] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-warning-color to-red-400 rounded-full transition-all duration-500"
                    style={{ width: `${percentage}%` }}
                  />
                </div>
                <span className="text-[12px] font-mono font-bold text-island/80 w-12 text-right">
                  {count}x
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

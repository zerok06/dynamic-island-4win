import React from 'react';
import { Code, Terminal, Bot, Globe, CircleDot } from 'lucide-react';

interface AppItem {
  name: string;
  icon: React.ReactNode;
  status: 'Active' | 'Idle';
  colorClass: string;
}

export const TabApps: React.FC = () => {
  const apps: AppItem[] = [
    {
      name: 'VS Code',
      icon: <Code className="w-5 h-5" />,
      status: 'Active',
      colorClass: 'text-accent-color bg-accent-color/10',
    },
    {
      name: 'Ghostty',
      icon: <Terminal className="w-5 h-5" />,
      status: 'Active',
      colorClass: 'text-success-color bg-success-color/10',
    },
    {
      name: 'Antigravity',
      icon: <Bot className="w-5 h-5" />,
      status: 'Active',
      colorClass: 'text-purple-400 bg-purple-400/10',
    },
    {
      name: 'Chrome',
      icon: <Globe className="w-5 h-5" />,
      status: 'Active',
      colorClass: 'text-cyan-400 bg-cyan-400/10',
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-2.5 w-full">
      {apps.map((app) => (
        <div
          key={app.name}
          className="flex items-center justify-between p-3 rounded-lg bg-island/[0.02] border border-island/[0.03] hover:bg-island/[0.04] transition-colors"
        >
          <div className="flex items-center gap-2.5">
            <div className={`p-2 rounded-md ${app.colorClass}`}>
              {app.icon}
            </div>
            <span className="text-[13px] font-semibold text-island/95">{app.name}</span>
          </div>
          <span className="flex items-center gap-1 text-[11px] text-success-color font-medium bg-success-color/10 px-2 py-0.5 rounded-full">
            <CircleDot className="w-2 h-2" />
            {app.status}
          </span>
        </div>
      ))}
    </div>
  );
};

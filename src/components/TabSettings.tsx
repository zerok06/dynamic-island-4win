import React, { useEffect, useState } from 'react';
import { AppSettings } from '../hooks/useSettings';
import { enable, disable, isEnabled } from '@tauri-apps/plugin-autostart';
import { invoke } from '@tauri-apps/api/core';
import { getTranslation } from '../utils/i18n';

interface MonitorInfo {
  name: string;
  width: number;
  height: number;
  is_primary: boolean;
}

interface TabSettingsProps {
  settings: AppSettings;
  onSettingsChange: (newSettings: Partial<AppSettings>) => void;
}

export const TabSettings: React.FC<TabSettingsProps> = ({ settings, onSettingsChange }) => {
  const [autostartSupported, setAutostartSupported] = useState(false);
  const [monitors, setMonitors] = useState<MonitorInfo[]>([]);
  const t = getTranslation(settings.language);

  useEffect(() => {
    const checkSupport = async () => {
      try {
        const active = await isEnabled();
        setAutostartSupported(true);
        if (active !== settings.startOnBoot) {
          onSettingsChange({ startOnBoot: active });
        }
      } catch (e) {
        console.warn('Autostart plugin not supported', e);
      }
    };
    checkSupport();

    const loadMonitors = async () => {
      const isTauri = !!(window as any).__TAURI__;
      if (!isTauri) {
        setMonitors([
          { name: 'Display 1 (Primary)', width: 1920, height: 1080, is_primary: true },
          { name: 'Display 2 (HDMI)', width: 2560, height: 1440, is_primary: false },
        ]);
        return;
      }
      try {
        const list = await invoke<MonitorInfo[]>('get_available_monitors');
        setMonitors(list);
      } catch (e) {
        console.error('Failed to load monitors:', e);
      }
    };
    loadMonitors();
  }, []);

  const handleAutostartToggle = async () => {
    const nextState = !settings.startOnBoot;
    try {
      if (nextState) {
        await enable();
      } else {
        await disable();
      }
      onSettingsChange({ startOnBoot: nextState });
    } catch (e) {
      console.error('Failed to change autostart status:', e);
    }
  };

  const handleMonitorChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const monitorName = e.target.value;
    onSettingsChange({ selectedMonitor: monitorName });
    const isTauri = !!(window as any).__TAURI__;
    if (isTauri) {
      try {
        await invoke('reposition_to_monitor', { monitorName });
      } catch (e) {
        console.error('Failed to reposition window:', e);
      }
    }
  };

  return (
    <div className="flex flex-col w-full text-[11.5px] text-island/80 animate-content-reveal p-1 divide-y divide-island/[0.04] select-none">
      
      {/* 1. MONITOR SELECTION */}
      <div className="flex items-center justify-between py-2.5">
        <span className="font-medium text-island/50">{t.displayMonitor}</span>
        <select
          value={settings.selectedMonitor}
          onChange={handleMonitorChange}
          className="py-1 px-1.5 bg-island/[0.03] border border-island/[0.06] rounded text-island/80 text-[10.5px] focus:outline-none max-w-[170px]"
        >
          <option value="" className="bg-island-surface">{t.primaryMonitor}</option>
          {monitors.map((mon) => (
            <option key={mon.name} value={mon.name} className="bg-island-surface">
              {mon.name.replace('\\\\.\\', '')} ({mon.width}x{mon.height})
            </option>
          ))}
        </select>
      </div>

      {/* 2. AUTOSTART */}
      <div className="flex items-center justify-between py-2.5">
        <div className="flex flex-col gap-0.5">
          <span className="font-medium text-island/50">{t.startOnBoot}</span>
        </div>
        <button
          onClick={handleAutostartToggle}
          disabled={!autostartSupported}
          className={`w-7 h-4 rounded-full p-[2px] transition-colors duration-300 focus:outline-none ${
            settings.startOnBoot ? 'bg-island/80' : 'bg-island/10'
          } ${!autostartSupported ? 'opacity-40 cursor-not-allowed' : ''}`}
        >
          <div
            className={`w-[12px] h-[12px] rounded-full bg-island-surface shadow transform transition-transform duration-300 ${
              settings.startOnBoot ? 'translate-x-[11px]' : 'translate-x-0'
            }`}
          />
        </button>
      </div>

      {/* 3. ANIMATION SPEED */}
      <div className="flex items-center justify-between py-2.5">
        <span className="font-medium text-island/50">{t.animationSpeed}</span>
        <div className="flex bg-island/[0.02] border border-island/[0.05] rounded p-[1.5px] gap-[1px]">
          {([
            { label: t.animFast, value: 400 },
            { label: t.animSmooth, value: 600 },
            { label: t.animSlow, value: 800 }
          ] as const).map((opt) => (
            <button
              key={opt.value}
              onClick={() => onSettingsChange({ animationSpeed: opt.value })}
              className={`px-2 py-0.5 rounded-[2px] text-[10px] transition-colors ${
                settings.animationSpeed === opt.value 
                  ? 'bg-island/15 text-island font-medium' 
                  : 'text-island/40 hover:text-island/70'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* 4. ISLAND WIDTH */}
      <div className="flex items-center justify-between py-2.5">
        <span className="font-medium text-island/50">{t.islandWidth}</span>
        <div className="flex bg-island/[0.02] border border-island/[0.05] rounded p-[1.5px] gap-[1px]">
          {([
            { label: t.widthNarrow, value: 380 },
            { label: t.widthNormal, value: 420 },
            { label: t.widthWide, value: 460 }
          ] as const).map((opt) => (
            <button
              key={opt.value}
              onClick={() => onSettingsChange({ expandedWidth: opt.value })}
              className={`px-2 py-0.5 rounded-[2px] text-[10px] transition-colors ${
                settings.expandedWidth === opt.value 
                  ? 'bg-island/15 text-island font-medium' 
                  : 'text-island/40 hover:text-island/70'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* 5. HEIGHT MULTIPLIER */}
      <div className="flex items-center justify-between py-2.5">
        <span className="font-medium text-island/50">{t.heightScale}</span>
        <div className="flex bg-island/[0.02] border border-island/[0.05] rounded p-[1.5px] gap-[1px]">
          {([
            { label: t.heightSmall, value: 0.9 },
            { label: t.heightNormal, value: 1.0 },
            { label: t.heightLarge, value: 1.1 }
          ] as const).map((opt) => (
            <button
              key={opt.value}
              onClick={() => onSettingsChange({ heightMultiplier: opt.value })}
              className={`px-2 py-0.5 rounded-[2px] text-[10px] transition-colors ${
                settings.heightMultiplier === opt.value 
                  ? 'bg-island/15 text-island font-medium' 
                  : 'text-island/40 hover:text-island/70'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* 6. LANGUAGE SELECTION */}
      <div className="flex items-center justify-between py-2.5">
        <span className="font-medium text-island/50">{t.language}</span>
        <div className="flex bg-island/[0.02] border border-island/[0.05] rounded p-[1.5px] gap-[1px]">
          {([
            { label: 'English', value: 'en' },
            { label: 'Tiếng Việt', value: 'vi' }
          ] as const).map((opt) => (
            <button
              key={opt.value}
              onClick={() => onSettingsChange({ language: opt.value })}
              className={`px-2 py-0.5 rounded-[2px] text-[10px] transition-colors ${
                settings.language === opt.value 
                  ? 'bg-island/15 text-island font-medium' 
                  : 'text-island/40 hover:text-island/70'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* LIVE ACTIVITY / EFFECT TOGGLES */}
      {([
        { label: t.effectsLabel, key: 'effectsEnabled' as const },
        { label: t.weatherLabel, key: 'weatherEnabled' as const },
        { label: t.volumeHudLabel, key: 'volumeHudEnabled' as const },
        { label: t.calendarLabel, key: 'calendarEnabled' as const },
      ]).map((row) => (
        <div key={row.key} className="flex items-center justify-between py-2.5">
          <span className="font-medium text-island/50">{row.label}</span>
          <button
            onClick={() => onSettingsChange({ [row.key]: !settings[row.key] } as any)}
            className={`w-7 h-4 rounded-full p-[2px] transition-colors duration-300 focus:outline-none ${
              settings[row.key] ? 'bg-island/80' : 'bg-island/10'
            }`}
          >
            <div
              className={`w-[12px] h-[12px] rounded-full bg-island-surface shadow transform transition-transform duration-300 ${
                settings[row.key] ? 'translate-x-[11px]' : 'translate-x-0'
              }`}
            />
          </button>
        </div>
      ))}

      {/* CALENDAR SOURCE */}
      <div className="flex items-center justify-between py-2.5 gap-3">
        <span className="font-medium text-island/50 flex-shrink-0">{t.calendarLabel}</span>
        <input
          type="text"
          value={settings.calendarSource}
          onChange={(e) => onSettingsChange({ calendarSource: e.target.value })}
          placeholder={t.calendarSourcePlaceholder}
          className="flex-1 min-w-0 py-1 px-1.5 bg-island/[0.03] border border-island/[0.06] rounded text-island/80 text-[10.5px] focus:outline-none"
        />
      </div>

      {/* 7. RESET POSITION */}
      <div className="flex items-center justify-between py-2.5">
        <span className="font-medium text-island/50">
          {t.offsetAlignment}
        </span>
        <button
          onClick={async () => {
            const isTauri = !!(window as any).__TAURI__;
            if (isTauri) {
              try {
                await invoke('reposition_to_monitor', { monitorName: settings.selectedMonitor });
              } catch (e) {
                console.error('Failed to reset position:', e);
              }
            }
          }}
          className="px-3 py-1 rounded bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-red-300 border border-red-500/20 hover:border-red-500/30 transition-all text-[10.5px] font-bold uppercase tracking-wider"
        >
          {t.resetPosition}
        </button>
      </div>

    </div>
  );
};

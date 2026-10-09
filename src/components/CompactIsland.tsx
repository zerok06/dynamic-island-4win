import React from 'react';
import { Music, Timer, ListTodo, Inbox, Download, Bell, Sun, CloudSun, Cloud, CloudRain, CloudSnow, CloudLightning, CloudFog, CloudDrizzle, Volume2, VolumeX, CalendarClock } from 'lucide-react';
import { BatteryState } from '../hooks/useBattery';
import { Track } from '../hooks/useMedia';
import { Weather } from '../hooks/useWeather';
import { CalendarEvent } from '../hooks/useCalendar';
import { getAppIcon } from '../utils/appIcons';

interface CompactIslandProps {
  currentSlot: string;
  clicks: number;
  timeString: string;
  battery: BatteryState;
  track: Track;
  localPlaying: boolean;
  dominantColor: string;
  pomoTime: string;
  tasksCount: number;
  filesCount: number;
  isDragOver: boolean;
  isHovered: boolean;
  isNotif?: boolean;
  btDeviceName?: string;
  btStatus?: 'connected' | 'disconnected';
  systemNotif?: { appName: string; title: string; message: string; imagePath?: string } | null;
  unreadNotifsCount?: number;
  weather?: Weather | null;
  calendarEvent?: CalendarEvent | null;
  volume?: { level: number; muted: boolean } | null;
  effectsEnabled?: boolean;
  onNotificationIconClick?: () => void;
}

// Mapa de código meteorológico (Open-Meteo) a icono | Map Open-Meteo weather code to an icon
const weatherIcon = (code: number) => {
  if (code === 0) return <Sun className="w-4 h-4" />;
  if (code <= 2) return <CloudSun className="w-4 h-4" />;
  if (code === 3) return <Cloud className="w-4 h-4" />;
  if (code === 45 || code === 48) return <CloudFog className="w-4 h-4" />;
  if (code >= 51 && code <= 57) return <CloudDrizzle className="w-4 h-4" />;
  if (code >= 61 && code <= 67) return <CloudRain className="w-4 h-4" />;
  if (code >= 71 && code <= 77) return <CloudSnow className="w-4 h-4" />;
  if (code >= 80 && code <= 82) return <CloudRain className="w-4 h-4" />;
  if (code >= 85 && code <= 86) return <CloudSnow className="w-4 h-4" />;
  if (code >= 95) return <CloudLightning className="w-4 h-4" />;
  return <Cloud className="w-4 h-4" />;
};

const MiniEq: React.FC<{ color: string; playing: boolean }> = ({ color, playing }) => (
  <div className={`mini-eq flex-shrink-0 ${playing ? 'is-playing' : ''}`} style={{ color: color || '#22d3ee' }}>
    <span className="meq meq1 h-[4px]" />
    <span className="meq meq2 h-[9px]" />
    <span className="meq meq3 h-[6px]" />
    <span className="meq meq4 h-[11px]" />
    <span className="meq meq5 h-[3px]" />
  </div>
);

export const CompactIsland: React.FC<CompactIslandProps> = ({
  currentSlot,
  clicks: _clicks,
  timeString,
  battery,
  track,
  localPlaying,
  dominantColor,
  pomoTime,
  tasksCount,
  filesCount,
  isDragOver,
  isHovered,
  isNotif = false,
  btDeviceName = '',
  btStatus = 'connected',
  systemNotif = null,
  unreadNotifsCount = 0,
  weather = null,
  calendarEvent = null,
  volume = null,
  effectsEnabled = true,
  onNotificationIconClick,
}) => {
  // Bao bọc bằng hiệu ứng trượt khi hiển thị thông báo tạm thời | Wrap content in slide transition for transient notifications
  const wrap = (content: React.ReactNode) =>
    isNotif
      ? <div key={currentSlot} className="notif-slot-enter">{content}</div>
      : <>{content}</>;

  if (isDragOver) {
    return (
      <div className="flex items-center gap-3 w-full justify-start px-2 py-1 select-none animate-compact-reveal">
        <div className="w-7 h-7 rounded-full bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center flex-shrink-0">
          <Download className="w-4 h-4 text-cyan-400 drag-icon-bounce" />
        </div>
        <div className="flex flex-col text-left justify-center min-w-0">
          <span className="text-[10.5px] font-bold text-cyan-400 tracking-wide animate-pulse">Drag & Drop files...</span>
          <span className="text-[9px] text-island/40 truncate">Stash files in Dynamic Island</span>
        </div>
      </div>
    );
  }

  const renderBody = () => {
    switch (currentSlot) {
    case 'music':
      return wrap(
        <div className="flex items-center justify-between w-full px-0.5 max-w-full">
          {/* Phía bên trái: Đĩa nhạc xoay tròn chứa ảnh bìa album | Left side: Circular rotating album art icon */}
          <div className={`relative w-5 h-5 rounded-full overflow-hidden bg-island/[0.03] border border-island/[0.05] flex-shrink-0 flex items-center justify-center ${localPlaying ? 'animate-disc-spin' : ''}`}>
            {track.cover_url ? (
              <img
                src={track.cover_url}
                className="w-full h-full object-cover"
                alt="mini-cover"
              />
            ) : (
              <Music className="w-2.5 h-2.5 flex-shrink-0" style={{ color: dominantColor || '#22d3ee' }} />
            )}
          </div>

          {/* Phía giữa: Tên bài hát (chỉ hiển thị khi hover) | Middle: Song Title (only visible when hovered) */}
          {isHovered && track.title && track.title !== 'Ready' && (
            <div className="flex flex-col justify-center min-w-0 mx-2 select-none flex-grow text-left animate-content-reveal">
              <span className="text-[10px] font-semibold text-island truncate max-w-[480px]" title={track.title}>
                {track.title}
              </span>
            </div>
          )}

          {/* Phía bên phải: Cột sóng nhạc nhảy đối xứng lên/xuống | Right side: Equalizer bars moving up/down symmetrically */}
          <div className={`flex items-center gap-[2px] h-[14px] flex-shrink-0 ${localPlaying ? 'visualizer-playing' : ''}`}>
            <span className="w-[2.5px] rounded-full bar bar-1 h-[4px]" style={{ backgroundColor: dominantColor || '#22d3ee' }}></span>
            <span className="w-[2.5px] rounded-full bar bar-2 h-[9px]" style={{ backgroundColor: dominantColor || '#22d3ee' }}></span>
            <span className="w-[2.5px] rounded-full bar bar-3 h-[6px]" style={{ backgroundColor: dominantColor || '#22d3ee' }}></span>
            <span className="w-[2.5px] rounded-full bar bar-4 h-[11px]" style={{ backgroundColor: dominantColor || '#22d3ee' }}></span>
            <span className="w-[2.5px] rounded-full bar bar-5 h-[3px]" style={{ backgroundColor: dominantColor || '#22d3ee' }}></span>
          </div>
        </div>
      );

    case 'pomo':
      return (
        <div className="flex items-center gap-2 text-warning-color">
          <Timer className="w-4 h-4" />
          <span key={pomoTime} className="text-[12px] font-mono font-bold whitespace-nowrap animate-tick">{pomoTime}</span>
        </div>
      );

    case 'tasks':
      return (
        <div className="flex items-center gap-2 text-accent-color">
          <ListTodo className="w-4 h-4" />
          <span className="text-[12px] font-medium text-island whitespace-nowrap">
            {tasksCount} task{tasksCount !== 1 ? 's' : ''}
          </span>
        </div>
      );

    case 'files':
      return (
        <div className="flex items-center gap-2 text-cyan-400">
          <Inbox className="w-4 h-4" />
          <span className="text-[12px] font-medium text-island whitespace-nowrap">
            {filesCount} file{filesCount !== 1 ? 's' : ''}
          </span>
        </div>
      );


    case 'bluetooth':
      return wrap(
        <div className="flex items-center gap-2 px-1">
          <div className="relative flex items-center justify-center flex-shrink-0">
            {btStatus === 'connected' && (
              <span className="absolute inset-0 rounded-full bg-emerald-400/40 animate-bt-ping pointer-events-none" />
            )}
            <div className={`p-1 rounded-full flex items-center justify-center ${
              btStatus === 'connected' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-rose-500/15 text-rose-400'
            }`}>
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="m7 7 10 10-5 5V2l5 5L7 17" />
              </svg>
            </div>
          </div>
          <div className="flex flex-col leading-none">
            <span className="text-[11px] font-bold text-island/95 truncate max-w-[200px]">
              {btStatus === 'connected' ? 'Bluetooth Connected' : 'Bluetooth Disconnected'}
            </span>
            <span className="text-[9.5px] text-island/50 truncate max-w-[200px] mt-0.5">
              {btDeviceName}
            </span>
          </div>
        </div>
      );

    case 'system-notification':
      const hasImage = !!(systemNotif && systemNotif.imagePath);
      
      if (hasImage && systemNotif) {
        return wrap(
          <div className="flex items-center justify-between w-full h-full gap-3 px-1">
            <div className="flex flex-col min-w-0 flex-grow justify-center leading-tight">
              <div className="flex items-center gap-1.5">
                <span className="w-3.5 h-3.5 rounded-full bg-island/10 flex items-center justify-center flex-shrink-0">
                  {getAppIcon(systemNotif.appName, 9)}
                </span>
                <span className="text-[9px] font-bold text-island/50 truncate max-w-[120px]">
                  {systemNotif.appName}
                </span>
              </div>
              <span className="text-[10px] font-bold text-island mt-1 truncate" title={systemNotif.title}>
                {systemNotif.title}
              </span>
              <span className="text-[8px] text-island/60 mt-0.5 line-clamp-2" title={systemNotif.message}>
                {systemNotif.message}
              </span>
            </div>
            
            <div className="w-[85px] h-[55px] rounded-md overflow-hidden border border-island/[0.08] bg-island/[0.02] flex-shrink-0 flex items-center justify-center shadow-inner">
              <img
                src={systemNotif.imagePath}
                className="w-full h-full object-cover"
                alt="notification-preview"
                onError={(e) => {
                  (e.target as HTMLElement).style.display = 'none';
                }}
              />
            </div>
          </div>
        );
      }

      return wrap(
        <div className="flex items-center gap-2 px-1.5 min-w-0 max-w-full">
          <div className="w-5 h-5 rounded-full bg-island/10 flex items-center justify-center flex-shrink-0">
            {systemNotif ? getAppIcon(systemNotif.appName, 12) : <Bell className="w-3 h-3 text-island/75" />}
          </div>
          {systemNotif ? (
            <div className="flex flex-col leading-none min-w-0">
              <span className="text-[10px] font-semibold text-island truncate max-w-[170px]" title={systemNotif.title}>
                {systemNotif.title}
              </span>
              <span className="text-[8.5px] text-island/45 truncate max-w-[170px] mt-0.5" title={systemNotif.message}>
                {systemNotif.appName}: {systemNotif.message}
              </span>
            </div>
          ) : (
            <span className="text-[10px] text-island/45">Notification</span>
          )}
        </div>
      );

    case 'weather':
      return (
        <div className="flex items-center gap-2 text-accent-color">
          <span className={weather ? 'animate-weather-bob flex-shrink-0' : 'flex-shrink-0'}>{weatherIcon(weather?.code ?? 0)}</span>
          <span className="text-[12px] font-semibold text-island whitespace-nowrap">
            {weather ? `${weather.tempC}°` : '--'}
          </span>
        </div>
      );

    case 'calendar': {
      const calTime = calendarEvent
        ? calendarEvent.start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        : '';
      return (
        <div className="flex items-center gap-2 text-warning-color min-w-0">
          <CalendarClock className="w-4 h-4 flex-shrink-0" />
          <div className="flex flex-col leading-none min-w-0">
            <span className="text-[10px] font-semibold text-island truncate max-w-[150px]">
              {calendarEvent?.summary}
            </span>
            <span className="text-[9px] text-island/50 mt-0.5">{calTime}</span>
          </div>
        </div>
      );
    }

    case 'volume':
      return (
        <div className="flex items-center gap-2 text-accent-color w-full min-w-0">
          <span key={volume?.muted ? 'muted' : 'unmuted'} className="animate-badge-pop flex-shrink-0">
            {volume?.muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </span>
          <span className="text-[11px] font-semibold text-island whitespace-nowrap">
            {volume?.muted ? 'Muted' : `${volume?.level ?? 0}%`}
          </span>
          <div className="flex-1 h-[4px] rounded-full bg-island/10 overflow-hidden min-w-[36px]">
            <div
              className="h-full rounded-full bg-accent-color transition-[width] duration-150"
              style={{ width: `${volume?.muted ? 0 : (volume?.level ?? 0)}%` }}
            />
          </div>
        </div>
      );

    case 'idle':
    default:
      const showBell = unreadNotifsCount > 0;
      
      const renderBattery = () => {
        const isCharging = battery.charging;
        const isLow = battery.level < 20;
        const isMid = battery.level < 50;

        const strokeColor = isCharging
          ? '#4ade80'
          : isLow ? '#f87171'
          : 'rgb(var(--island-rgb) / 0.3)';

        const fillColor = isCharging
          ? '#4ade80'
          : isLow ? '#f87171'
          : isMid ? '#facc15'
          : 'rgb(var(--island-rgb))';

        const fillOpacity = isCharging ? '0.38' : isLow ? '0.9' : '0.55';

        return (
          <div className="relative flex-shrink-0 w-[25px] h-[13px]">
            <svg
              width="25" height="13" viewBox="0 0 27 14" fill="none"
              className={isCharging ? 'battery-svg-charging' : ''}
            >
              {/* body */}
              <rect x="0.5" y="0.5" width="23" height="12" rx="2.5"
                stroke={strokeColor} strokeWidth="1" fill="none" />
              {/* tip */}
              <rect x="24.5" y="4" width="2" height="5" rx="1" fill={strokeColor} />
              {/* fill level */}
              <rect x="2" y="2"
                width={Math.round((battery.level / 100) * 20)}
                height="9" rx="1.5"
                fill={fillColor}
                opacity={fillOpacity}
                className={isCharging ? 'battery-fill-charging' : ''}
              />
            </svg>

            {/* Battery inner overlay for percentage */}
            <div className="absolute left-0 top-0 w-[23px] h-[13px] flex items-center justify-center select-none">
              {(() => {
                const isDarkText = isCharging || battery.level >= 30;
                const textColorClass = isDarkText ? 'text-island-surface' : 'text-island';
                const textStyle = !isDarkText
                  ? { textShadow: '0.6px 0.6px 0 rgb(var(--island-surface-rgb)), -0.6px 0.6px 0 rgb(var(--island-surface-rgb)), 0.6px -0.6px 0 rgb(var(--island-surface-rgb)), -0.6px -0.6px 0 rgb(var(--island-surface-rgb)), 0 0.8px 0.8px rgb(var(--island-surface-rgb) / 0.8)' }
                  : undefined;
                return (
                  <span
                    className={`text-[7.5px] font-black leading-none tracking-tighter ${textColorClass}`}
                    style={textStyle}
                  >
                    {battery.level}
                  </span>
                );
              })()}
            </div>
          </div>
        );
      };

      if (!showBell) {
        // 1 icon -> Center battery icon + time string together in the middle
        return (
          <div className="flex items-center justify-center gap-2 w-full text-island/60 hover:text-island transition-colors">
            {renderBattery()}
            <span className="text-[12px] font-medium whitespace-nowrap text-island/90">{timeString}</span>
          </div>
        );
      }

      // 3 items -> Symmetrical layout (Battery left, Bell right, Time middle)
      return (
        <div className="flex items-center justify-between w-full text-island/60 hover:text-island transition-colors px-0.5">
          <div className="flex items-center justify-start w-[28px] flex-shrink-0">
            {renderBattery()}
          </div>

          <span className="text-[12px] font-medium whitespace-nowrap text-island/90">{timeString}</span>

          <div className="flex items-center justify-end w-[28px] flex-shrink-0">
            <div 
              onClick={(e) => {
                e.stopPropagation();
                if (onNotificationIconClick) onNotificationIconClick();
              }}
              className="relative flex items-center justify-center cursor-pointer hover:text-island transition-colors"
            >
              <Bell className="w-3.5 h-3.5 text-island/50 animate-bell-ring" />
              <span key={unreadNotifsCount} className="animate-badge-pop absolute -top-1 -right-1.5 min-w-[11px] h-[11px] px-0.5 rounded-full bg-[#ff3b30] text-island text-[7px] font-black flex items-center justify-center border border-island-surface leading-none">
                {unreadNotifsCount}
              </span>
            </div>
          </div>
        </div>
      );
    }
  };

  const showEq = !!effectsEnabled && localPlaying && currentSlot !== 'music' && currentSlot !== 'system-notification';
  return (
    <div className="flex items-center justify-center gap-2 w-full min-w-0">
      <div className="flex items-center justify-center min-w-0 flex-1">{renderBody()}</div>
      {showEq && <MiniEq color={dominantColor} playing={localPlaying} />}
    </div>
  );
};

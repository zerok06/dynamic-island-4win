import React, { useState } from 'react';
import { Trash2, Volume2, VolumeX, Check, Inbox } from 'lucide-react';
import { getTranslation, Language } from '../utils/i18n';

export interface StoredNotification {
  id: string;
  appName: string;
  title: string;
  message: string;
  timestamp: number;
  read: boolean;
  imagePath?: string;
}

interface TabNotificationsProps {
  history: StoredNotification[];
  onDelete: (id: string) => void;
  onClearAll: () => void;
  onMarkAsRead: (id: string) => void;
  onMarkAllAsRead: () => void;
  soundEnabled: boolean;
  onToggleSound: (enabled: boolean) => void;
  language: Language;
  onNotificationClick?: (notif: StoredNotification) => void;
}

export const TabNotifications: React.FC<TabNotificationsProps> = ({
  history,
  onDelete: _onDelete,
  onClearAll,
  onMarkAsRead,
  onMarkAllAsRead,
  soundEnabled,
  onToggleSound,
  language,
  onNotificationClick,
}) => {
  const t = getTranslation(language);
  
  // Manage tab filter between unread and all notifications
  const [filter, setFilter] = useState<'unread' | 'all'>('unread');

  // Filter the notifications list based on active filter
  const unreadList = history.filter((n) => !n.read);
  const displayedList = filter === 'unread' ? unreadList : history;

  // Click card: Mark as read and invoke Rust to focus the target app
  const handleCardClick = async (notif: StoredNotification) => {
    if (onNotificationClick) {
      onNotificationClick(notif);
      return;
    }

    onMarkAsRead(notif.id);
    
    if ((window as any).__TAURI__) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        await invoke('focus_window_by_name', { name: notif.appName });
      } catch (err) {
        console.error('Failed to focus window:', err);
      }
    }
  };

  // Format relative timestamp
  const formatRelativeTime = (timeMs: number): string => {
    const diffS = Math.floor((Date.now() - timeMs) / 1000);
    if (diffS < 60) return language === 'vi' ? 'Vừa xong' : 'Just now';
    const diffM = Math.floor(diffS / 60);
    if (diffM < 60) return `${diffM}m ${language === 'vi' ? 'trước' : 'ago'}`;
    const diffH = Math.floor(diffM / 60);
    if (diffH < 24) return `${diffH}h ${language === 'vi' ? 'trước' : 'ago'}`;
    
    const date = new Date(timeMs);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="flex flex-col gap-3.5 w-full max-h-[300px] select-none animate-content-reveal">
      {/* Header section with segmented filters & action buttons */}
      <div className="flex items-center justify-between border-b border-island/[0.04] pb-2.5">
        <div className="flex items-center gap-1 bg-island/[0.03] p-0.5 rounded-lg border border-island/[0.02]">
          {/* Unread tab filter */}
          <button
            onClick={() => setFilter('unread')}
            className={`px-3 py-1 rounded-md text-[10.5px] font-semibold transition-all duration-150 flex items-center gap-1.5
              ${filter === 'unread'
                ? 'bg-island/[0.08] text-island shadow-sm'
                : 'text-island/40 hover:text-island/70'
              }`}
          >
            {language === 'vi' ? 'Chưa đọc' : 'New'}
            {unreadList.length > 0 && (
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            )}
          </button>

          {/* All tab filter */}
          <button
            onClick={() => setFilter('all')}
            className={`px-3 py-1 rounded-md text-[10.5px] font-semibold transition-all duration-150
              ${filter === 'all'
                ? 'bg-island/[0.08] text-island shadow-sm'
                : 'text-island/40 hover:text-island/70'
              }`}
          >
            {language === 'vi' ? 'Lịch sử' : 'History'}
          </button>
        </div>

        <div className="flex items-center gap-1.5">
          {/* Mark all as read */}
          {unreadList.length > 0 && (
            <button
              onClick={onMarkAllAsRead}
              className="p-1.5 rounded-md hover:bg-island/[0.04] text-island/40 hover:text-island/80 transition-all duration-150"
              title={language === 'vi' ? 'Đọc tất cả' : 'Mark all as read'}
            >
              <Check className="w-4 h-4" />
            </button>
          )}

          {/* Toggle chime sound */}
          <button
            onClick={() => onToggleSound(!soundEnabled)}
            className={`p-1.5 rounded-md hover:bg-island/[0.04] transition-all duration-150
              ${soundEnabled ? 'text-emerald-400/80 hover:text-emerald-400' : 'text-island/30 hover:text-island/60'}`}
            title={t.notifSoundToggle}
          >
            {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </button>

          {/* Clear all history */}
          {history.length > 0 && (
            <button
              onClick={onClearAll}
              className="p-1.5 rounded-md hover:bg-red-500/10 text-island/30 hover:text-red-400 transition-all duration-150"
              title={t.notifClearAll}
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Scrollable list of cards */}
      <div className="flex flex-col gap-1 overflow-y-auto custom-scrollbar flex-grow pr-0.5" style={{ maxHeight: 250 }}>
        {displayedList.length === 0 ? (
          <div className="text-center text-[11px] text-island/20 py-10 flex flex-col items-center gap-2">
            <Inbox className="w-6 h-6 opacity-20" />
            <span>
              {filter === 'unread'
                ? (language === 'vi' ? 'Không có thông báo mới' : 'No new notifications')
                : t.notifNoHistory}
            </span>
          </div>
        ) : (
          <div className="flex flex-col divide-y divide-island/[0.03]">
            {displayedList.map((notif) => (
              <div
                key={notif.id}
                onClick={() => handleCardClick(notif)}
                className={`group relative flex items-center justify-between py-2.5 transition-all duration-150 cursor-pointer px-1.5 hover:bg-island/[0.02] rounded-md
                  ${!notif.read ? 'text-island' : 'text-island/50'}`}
                title={language === 'vi' ? `Nhấp để mở ${notif.appName}` : `Click to open ${notif.appName}`}
              >
                <div className="flex items-start gap-3 min-w-0 flex-grow pr-12">
                  <div className="flex flex-col min-w-0 flex-grow leading-tight mt-0.5">
                    <div className="flex items-center gap-2">
                      <span className={`text-[9.5px] font-semibold truncate max-w-[150px]
                        ${!notif.read ? 'text-island/80' : 'text-island/35'}`}>
                        {notif.appName}
                      </span>
                      <span className="text-[8px] text-island/20 font-mono">
                        {formatRelativeTime(notif.timestamp)}
                      </span>
                      {/* Red/Green Unread dot indicator */}
                      {!notif.read && (
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                      )}
                    </div>
                    
                    <span className={`text-[10px] font-medium truncate mt-1 transition-colors
                      ${!notif.read ? 'text-island' : 'text-island/60'}`} title={notif.title}>
                      {notif.title}
                    </span>
                    
                    <span className={`text-[8.5px] truncate mt-0.5 transition-colors
                      ${!notif.read ? 'text-island/50' : 'text-island/30'}`} title={notif.message}>
                      {notif.message}
                    </span>
                  </div>

                  {notif.imagePath && (
                    <div className="w-[50px] h-[34px] rounded overflow-hidden border border-island/10 bg-island/[0.02] flex-shrink-0 flex items-center justify-center">
                      <img
                        src={notif.imagePath}
                        className="w-full h-full object-cover"
                        alt="thumbnail"
                      />
                    </div>
                  )}
                </div>

                {/* Quick actions on hover */}
                <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                  {!notif.read && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onMarkAsRead(notif.id);
                      }}
                      className="p-1 rounded bg-island/[0.04] hover:bg-emerald-500/20 text-island/50 hover:text-emerald-400 transition-all border border-island/[0.04]"
                      title={language === 'vi' ? 'Đánh dấu đã đọc' : 'Mark as read'}
                    >
                      <Check className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

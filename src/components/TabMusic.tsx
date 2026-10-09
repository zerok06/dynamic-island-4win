import React from 'react';
import { Music, Play, Pause, SkipBack, SkipForward } from 'lucide-react';
import { Track } from '../hooks/useMedia';
import { getTranslation, Language } from '../utils/i18n';

interface TabMusicProps {
  track: Track;
  localPlaying: boolean;
  timeline: { position_s: number; duration_s: number };
  onTogglePlay: () => void;
  onPrev: () => void;
  onNext: () => void;
  language: Language;
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export const TabMusic: React.FC<TabMusicProps> = ({ track, localPlaying, timeline, onTogglePlay, onPrev, onNext, language }) => {
  const t = getTranslation(language);
  const progressPercent = timeline.duration_s > 0 
    ? Math.min(100, (timeline.position_s / timeline.duration_s) * 100)
    : 0;

  const handleProgressClick = async (e: React.MouseEvent<HTMLDivElement>) => {
    if (timeline.duration_s <= 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const percentage = clickX / rect.width;
    const targetSeconds = Math.floor(percentage * timeline.duration_s);
    
    if ((window as any).__TAURI__) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        await invoke('seek_media', { positionMs: targetSeconds * 1000 });
      } catch (err) {
        console.error('Failed to seek:', err);
      }
    }
  };

  return (
    <div className="flex flex-col gap-4 w-full animate-content-reveal p-1 select-none">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          {/* Album Art Container */}
          <div className="relative w-12 h-12 flex-shrink-0 rounded-md overflow-hidden bg-island/[0.03] border border-island/[0.05] flex items-center justify-center">
            {track.cover_url ? (
              <img
                src={track.cover_url}
                className="w-full h-full object-cover"
                alt="album-art"
              />
            ) : (
              <Music className="w-5 h-5 text-island/30 stroke-[1.5]" />
            )}
          </div>

          {/* Track info */}
          <div className="flex flex-col min-w-0">
            <div className="text-[12.5px] font-medium text-island/90 truncate max-w-[200px]" title={track.title}>
              {track.title}
            </div>
            <div className="text-[10.5px] text-island/40 truncate mt-0.5" title={track.artist}>
              {track.artist}
            </div>
          </div>
        </div>

        {/* Minimalist Equalizer Visualizer */}
        <div className={`flex items-end gap-[2px] h-[12px] pr-1 transition-opacity duration-300 ${localPlaying ? 'opacity-80 visualizer-playing' : 'opacity-0'}`}>
          <span className="w-[1.5px] bg-island/70 rounded-t-sm bar bar-1 h-[3px]"></span>
          <span className="w-[1.5px] bg-island/70 rounded-t-sm bar bar-2 h-[7px]"></span>
          <span className="w-[1.5px] bg-island/70 rounded-t-sm bar bar-3 h-[4px]"></span>
          <span className="w-[1.5px] bg-island/70 rounded-t-sm bar bar-4 h-[8px]"></span>
          <span className="w-[1.5px] bg-island/70 rounded-t-sm bar bar-5 h-[2px]"></span>
        </div>
      </div>

      {/* Progress Bar (OS Timeline) */}
      <div className="flex flex-col gap-1">
        <div 
          onClick={handleProgressClick}
          className="w-full py-1.5 cursor-pointer group flex items-center"
        >
          <div className="w-full h-[3px] group-hover:h-[4px] bg-island/[0.08] rounded-full overflow-hidden transition-all duration-150">
            <div 
              className="h-full bg-island/70 group-hover:bg-island/95 rounded-full transition-all duration-300 ease-out" 
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
        <div className="flex justify-between text-[8.5px] text-island/35 font-mono tracking-wider">
          <span>{formatTime(timeline.position_s)}</span>
          <span>{formatTime(timeline.duration_s)}</span>
        </div>
      </div>

      {/* Control buttons */}
      <div className="flex items-center justify-center gap-7 mt-0.5">
        <button
          onClick={onPrev}
          className="p-1 text-island/40 hover:text-island/90 transition-colors duration-300"
          title={t.previous}
        >
          <SkipBack className="w-4.5 h-4.5 stroke-[1.5]" />
        </button>

        <button
          onClick={onTogglePlay}
          className="w-9 h-9 rounded-full bg-island/90 flex items-center justify-center text-island-surface hover:bg-island hover:scale-105 active:scale-95 transition-all duration-300"
          title={localPlaying ? t.pause : t.play}
        >
          {localPlaying ? (
            <Pause className="w-4 h-4 fill-island-surface stroke-none" />
          ) : (
            <Play className="w-4 h-4 fill-island-surface stroke-none ml-0.5" />
          )}
        </button>

        <button
          onClick={onNext}
          className="p-1 text-island/40 hover:text-island/90 transition-colors duration-300"
          title={t.next}
        >
          <SkipForward className="w-4.5 h-4.5 stroke-[1.5]" />
        </button>
      </div>
    </div>
  );
};

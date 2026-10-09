import { useEffect, useState } from 'react';

export interface CalendarEvent {
  summary: string;
  start: Date;
}

// Parse a minimal subset of iCalendar (.ics): VEVENT + DTSTART + SUMMARY
function parseIcsDate(value: string): Date | null {
  const v = value.trim();
  // Date only: YYYYMMDD (all-day)
  const dateOnly = /^(\d{4})(\d{2})(\d{2})$/.exec(v);
  if (dateOnly) {
    return new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]), 0, 0, 0);
  }
  // Date-time: YYYYMMDDTHHMMSS(Z)?
  const dt = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/.exec(v);
  if (dt) {
    const [y, mo, d, h, mi, s] = [dt[1], dt[2], dt[3], dt[4], dt[5], dt[6]].map(Number);
    if (dt[7] === 'Z') return new Date(Date.UTC(y, mo - 1, d, h, mi, s));
    return new Date(y, mo - 1, d, h, mi, s);
  }
  return null;
}

function parseUpcoming(raw: string): CalendarEvent | null {
  // Unfold folded lines (RFC 5545: continuation lines start with a space or tab)
  const unfolded = raw.replace(/\r\n/g, '\n').replace(/\n[ \t]/g, '');
  const lines = unfolded.split('\n');
  const now = Date.now();
  let best: CalendarEvent | null = null;

  let inEvent = false;
  let summary = '';
  let startRaw = '';

  const commit = () => {
    if (!summary || !startRaw) return;
    const start = parseIcsDate(startRaw);
    if (!start) return;
    if (start.getTime() < now) return;
    if (!best || start.getTime() < best.start.getTime()) {
      best = { summary, start };
    }
  };

  for (const line of lines) {
    const upper = line.toUpperCase();
    if (upper.startsWith('BEGIN:VEVENT')) {
      inEvent = true;
      summary = '';
      startRaw = '';
      continue;
    }
    if (upper.startsWith('END:VEVENT')) {
      if (inEvent) commit();
      inEvent = false;
      continue;
    }
    if (!inEvent) continue;
    if (upper.startsWith('SUMMARY')) {
      summary = line.slice(line.indexOf(':') + 1).replace(/\\,/g, ',').replace(/\\;/g, ';').trim();
    } else if (upper.startsWith('DTSTART')) {
      startRaw = line.slice(line.indexOf(':') + 1).trim();
    }
  }

  return best;
}

export function useCalendar(enabled: boolean, source: string) {
  const [event, setEvent] = useState<CalendarEvent | null>(null);

  useEffect(() => {
    if (!enabled || !source.trim()) {
      setEvent(null);
      return;
    }
    let cancelled = false;

    const load = async () => {
      try {
        let text = '';
        if (/^https?:\/\//i.test(source)) {
          text = await fetch(source).then((r) => r.text());
        } else if ((window as any).__TAURI__) {
          const { invoke } = await import('@tauri-apps/api/core');
          text = await invoke<string>('read_text_file', { path: source });
        } else {
          return;
        }
        const next = parseUpcoming(text);
        if (!cancelled) setEvent(next);
      } catch (e) {
        console.error('Failed to load calendar:', e);
      }
    };

    load();
    const interval = setInterval(load, 5 * 60 * 1000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [enabled, source]);

  return event;
}

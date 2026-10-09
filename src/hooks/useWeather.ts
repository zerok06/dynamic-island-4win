import { useEffect, useRef, useState } from 'react';

export interface Weather {
  tempC: number;
  code: number;
  city: string;
}

const CACHE_KEY = 'vibe_weather_cache';
const REFRESH_MS = 20 * 60 * 1000; // 20 minutes

export function useWeather(enabled: boolean) {
  const [weather, setWeather] = useState<Weather | null>(null);
  const [loading, setLoading] = useState(false);
  const firstRun = useRef(true);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    const readCache = (): Weather | null => {
      try {
        const raw = localStorage.getItem(CACHE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (Date.now() - parsed.ts < REFRESH_MS) return parsed.data as Weather;
      } catch {
        /* ignore */
      }
      return null;
    };

    const load = async (showLoading: boolean) => {
      const cached = readCache();
      if (cached) {
        if (!cancelled) setWeather(cached);
        return;
      }
      try {
        if (showLoading && !cancelled) setLoading(true);

        // Location by IP (no permissions required)
        let lat = 0;
        let lon = 0;
        let city = '';
        try {
          const geo = await fetch('https://ipapi.co/json/');
          const j = await geo.json();
          lat = Number(j.latitude);
          lon = Number(j.longitude);
          city = j.city || j.region || j.country_name || '';
        } catch {
          /* offline / blocked */
        }
        if (!lat && !lon) return;

        const res = await fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code`
        );
        const w = await res.json();
        const data: Weather = {
          tempC: Math.round(w?.current?.temperature_2m ?? 0),
          code: Number(w?.current?.weather_code ?? 0),
          city,
        };
        if (!cancelled) {
          setWeather(data);
          localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), data }));
        }
      } catch (e) {
        console.error('Failed to load weather:', e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load(firstRun.current);
    firstRun.current = false;
    const interval = setInterval(() => load(false), REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [enabled]);

  return { weather, loading };
}

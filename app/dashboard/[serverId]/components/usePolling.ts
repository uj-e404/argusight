'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

interface UsePollingResult<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
  lastUpdated: Date | null;
}

export function usePolling<T>(
  url: string,
  intervalMs: number,
  enabled: boolean = true
): UsePollingResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);

  const fetchData = useCallback(async () => {
    if (!enabled) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    let aborted = false;

    try {
      const res = await fetch(url, { signal: controller.signal });
      if (!mountedRef.current) return;

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error || `HTTP ${res.status}`);
        setLoading(false);
        return;
      }

      const json = await res.json();
      if (!mountedRef.current) return;

      setData(json);
      setError(null);
      setLastUpdated(new Date());
    } catch (err) {
      if (!mountedRef.current) return;
      if (err instanceof DOMException && err.name === 'AbortError') {
        aborted = true;
        return;
      }
      setError(err instanceof Error ? err.message : 'Fetch failed');
    } finally {
      if (mountedRef.current && !aborted) setLoading(false);
    }
  }, [url, enabled]);

  useEffect(() => {
    mountedRef.current = true;
    setLoading(true);
    fetchData();

    let timer: ReturnType<typeof setInterval> | null = null;
    if (intervalMs > 0 && enabled) {
      timer = setInterval(fetchData, intervalMs);
    }

    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
      if (timer) clearInterval(timer);
    };
  }, [fetchData, intervalMs, enabled]);

  return { data, loading, error, refresh: fetchData, lastUpdated };
}

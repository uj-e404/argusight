'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useWebSocket } from './WebSocketProvider';
import type { OverviewServerData } from '@/lib/types';

export function useServerOverview() {
  const [servers, setServers] = useState<OverviewServerData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { subscribe, unsubscribe, onReconnect, offReconnect } = useWebSocket();
  const lastWsDataRef = useRef<number>(0);

  const refetch = useCallback(() => {
    fetch('/api/servers')
      .then((res) => {
        if (!res.ok) throw new Error('Failed to load servers');
        return res.json();
      })
      .then((data) => {
        setServers(data.servers || []);
        setError(null);
        setLoading(false);
      })
      .catch((err) => {
        setError((err as Error).message || 'Failed to load servers');
      });
  }, []);

  // Fetch initial data
  useEffect(() => {
    refetch();
  }, [refetch]);

  // Subscribe to overview updates — also clears loading if fetch is slow
  const handleOverview = useCallback((msg: unknown) => {
    const m = msg as { data: OverviewServerData[] };
    if (Array.isArray(m.data)) {
      setServers(m.data);
      setLoading(false);
      lastWsDataRef.current = Date.now();
    }
  }, []);

  useEffect(() => {
    subscribe('overview', handleOverview);
    return () => unsubscribe('overview', handleOverview);
  }, [subscribe, unsubscribe, handleOverview]);

  // Refetch REST data on WS reconnect
  useEffect(() => {
    onReconnect(refetch);
    return () => offReconnect(refetch);
  }, [onReconnect, offReconnect, refetch]);

  // Periodic fallback: if WS data is stale (>15s), fetch REST
  useEffect(() => {
    const interval = setInterval(() => {
      if (lastWsDataRef.current > 0 && Date.now() - lastWsDataRef.current > 15_000) {
        refetch();
      }
    }, 15_000);
    return () => clearInterval(interval);
  }, [refetch]);

  return { servers, loading, error, refetch };
}

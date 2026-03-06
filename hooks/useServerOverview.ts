'use client';

import { useState, useEffect, useCallback } from 'react';
import { useWebSocket } from './WebSocketProvider';
import type { OverviewServerData } from '@/lib/types';

export function useServerOverview() {
  const [servers, setServers] = useState<OverviewServerData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { subscribe, unsubscribe } = useWebSocket();

  // Fetch initial data
  useEffect(() => {
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
        setLoading(false);
      });
  }, []);

  // Subscribe to overview updates — also clears loading if fetch is slow
  const handleOverview = useCallback((msg: unknown) => {
    const m = msg as { data: OverviewServerData[] };
    if (Array.isArray(m.data)) {
      setServers(m.data);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    subscribe('overview', handleOverview);
    return () => unsubscribe('overview', handleOverview);
  }, [subscribe, unsubscribe, handleOverview]);

  const refetch = useCallback(() => {
    fetch('/api/servers')
      .then((res) => res.json())
      .then((data) => setServers(data.servers || []));
  }, []);

  return { servers, loading, error, refetch };
}

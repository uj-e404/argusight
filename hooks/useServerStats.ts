'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useWebSocket } from './WebSocketProvider';
import type { CpuRamData } from '@/lib/types';

const RING_BUFFER_MAX = 150;

export function useServerStats(serverId: string) {
  const [data, setData] = useState<CpuRamData[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const dataRef = useRef<CpuRamData[]>([]);
  const { subscribe, unsubscribe, onReconnect, offReconnect } = useWebSocket();

  const handleStats = useCallback((msg: unknown) => {
    const m = msg as { data: CpuRamData | CpuRamData[]; backfill?: boolean };

    if (m.backfill && Array.isArray(m.data)) {
      dataRef.current = m.data.slice(-RING_BUFFER_MAX);
      setData([...dataRef.current]);
      setLoading(false);
      setLastUpdated(new Date());
    } else if (!Array.isArray(m.data)) {
      dataRef.current = [...dataRef.current, m.data];
      if (dataRef.current.length > RING_BUFFER_MAX) {
        dataRef.current = dataRef.current.slice(-RING_BUFFER_MAX);
      }
      setData([...dataRef.current]);
      setLoading(false);
      setLastUpdated(new Date());
    }
  }, []);

  useEffect(() => {
    const channel = `server:${serverId}:stats`;
    dataRef.current = [];
    setData([]);
    setLoading(true);
    subscribe(channel, handleStats);
    return () => unsubscribe(channel, handleStats);
  }, [serverId, subscribe, unsubscribe, handleStats]);

  // Brief loading indicator on reconnect (server sends backfill on resubscribe)
  useEffect(() => {
    const handleReconnect = () => setLoading(true);
    onReconnect(handleReconnect);
    return () => offReconnect(handleReconnect);
  }, [onReconnect, offReconnect]);

  return { data, loading, lastUpdated };
}

'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useWebSocket } from './WebSocketProvider';
import type { CpuRamData } from '@/lib/types';

const RING_BUFFER_MAX = 150;

export function useServerStats(serverId: string) {
  const [data, setData] = useState<CpuRamData[]>([]);
  const [loading, setLoading] = useState(true);
  const dataRef = useRef<CpuRamData[]>([]);
  const { subscribe, unsubscribe } = useWebSocket();

  const handleStats = useCallback((msg: unknown) => {
    const m = msg as { data: CpuRamData | CpuRamData[]; backfill?: boolean };

    if (m.backfill && Array.isArray(m.data)) {
      // Replace buffer with backfill data
      dataRef.current = m.data.slice(-RING_BUFFER_MAX);
      setData([...dataRef.current]);
      setLoading(false);
    } else if (!Array.isArray(m.data)) {
      // Incremental: append single point
      dataRef.current = [...dataRef.current, m.data];
      if (dataRef.current.length > RING_BUFFER_MAX) {
        dataRef.current = dataRef.current.slice(-RING_BUFFER_MAX);
      }
      setData([...dataRef.current]);
      setLoading(false);
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

  return { data, loading };
}

'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useWebSocket } from './WebSocketProvider';
import type { TrafficPoint } from '@/lib/types';

const TRAFFIC_BUFFER_MAX = 120;

export function useServerTraffic(serverId: string) {
  const [data, setData] = useState<TrafficPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const dataRef = useRef<TrafficPoint[]>([]);
  const { subscribe, unsubscribe, onReconnect, offReconnect } = useWebSocket();

  const handleTraffic = useCallback((msg: unknown) => {
    const m = msg as { data: TrafficPoint | TrafficPoint[]; backfill?: boolean };

    if (m.backfill && Array.isArray(m.data)) {
      dataRef.current = m.data.slice(-TRAFFIC_BUFFER_MAX);
      setData([...dataRef.current]);
      setLoading(false);
      setLastUpdated(new Date());
    } else if (!Array.isArray(m.data)) {
      dataRef.current = [...dataRef.current, m.data];
      if (dataRef.current.length > TRAFFIC_BUFFER_MAX) {
        dataRef.current = dataRef.current.slice(-TRAFFIC_BUFFER_MAX);
      }
      setData([...dataRef.current]);
      setLoading(false);
      setLastUpdated(new Date());
    }
  }, []);

  useEffect(() => {
    const channel = `server:${serverId}:traffic`;
    dataRef.current = [];
    setData([]);
    setLoading(true);
    subscribe(channel, handleTraffic);
    return () => unsubscribe(channel, handleTraffic);
  }, [serverId, subscribe, unsubscribe, handleTraffic]);

  useEffect(() => {
    const handleReconnect = () => setLoading(true);
    onReconnect(handleReconnect);
    return () => offReconnect(handleReconnect);
  }, [onReconnect, offReconnect]);

  const reset = useCallback(() => {
    dataRef.current = [];
    setData([]);
    setLoading(true);
  }, []);

  return { data, loading, reset, lastUpdated };
}

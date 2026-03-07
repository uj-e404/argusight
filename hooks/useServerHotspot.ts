'use client';

import { useState, useEffect, useCallback } from 'react';
import { useWebSocket } from './WebSocketProvider';
import type { MikroTikHotspotUser } from '@/lib/types';

interface HotspotData {
  users: MikroTikHotspotUser[];
  totalBytesIn: number;
  totalBytesOut: number;
  totalRateIn: number;
  totalRateOut: number;
}

export function useServerHotspot(serverId: string) {
  const [users, setUsers] = useState<MikroTikHotspotUser[]>([]);
  const [totalBytesIn, setTotalBytesIn] = useState(0);
  const [totalBytesOut, setTotalBytesOut] = useState(0);
  const [totalRateIn, setTotalRateIn] = useState(0);
  const [totalRateOut, setTotalRateOut] = useState(0);
  const [loading, setLoading] = useState(true);
  const { subscribe, unsubscribe, onReconnect, offReconnect } = useWebSocket();

  const handleHotspot = useCallback((msg: unknown) => {
    const m = msg as { data: HotspotData };
    if (m.data) {
      setUsers(m.data.users || []);
      setTotalBytesIn(m.data.totalBytesIn || 0);
      setTotalBytesOut(m.data.totalBytesOut || 0);
      setTotalRateIn(m.data.totalRateIn || 0);
      setTotalRateOut(m.data.totalRateOut || 0);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const channel = `server:${serverId}:hotspot`;
    setUsers([]);
    setLoading(true);
    subscribe(channel, handleHotspot);
    return () => unsubscribe(channel, handleHotspot);
  }, [serverId, subscribe, unsubscribe, handleHotspot]);

  useEffect(() => {
    const handleReconnect = () => setLoading(true);
    onReconnect(handleReconnect);
    return () => offReconnect(handleReconnect);
  }, [onReconnect, offReconnect]);

  return { users, totalBytesIn, totalBytesOut, totalRateIn, totalRateOut, loading };
}

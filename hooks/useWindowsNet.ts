'use client';

import { useState, useEffect, useCallback } from 'react';
import { useWebSocket } from './WebSocketProvider';
import type { WindowsNetData, WindowsNetProcess, WindowsNetDestination } from '@/lib/types';

export function useWindowsNet(serverId: string) {
  const [processes, setProcesses] = useState<WindowsNetProcess[]>([]);
  const [destinations, setDestinations] = useState<WindowsNetDestination[]>([]);
  const [rxBps, setRxBps] = useState(0);
  const [txBps, setTxBps] = useState(0);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const { subscribe, unsubscribe, onReconnect, offReconnect } = useWebSocket();

  const handleMessage = useCallback((msg: unknown) => {
    const m = msg as { data: WindowsNetData };
    if (m.data) {
      setProcesses(m.data.processes || []);
      setDestinations(m.data.destinations || []);
      setRxBps(m.data.rxBps || 0);
      setTxBps(m.data.txBps || 0);
      setLoading(false);
      setLastUpdated(new Date());
    }
  }, []);

  useEffect(() => {
    const channel = `server:${serverId}:winnet`;
    setProcesses([]);
    setDestinations([]);
    setRxBps(0);
    setTxBps(0);
    setLoading(true);
    subscribe(channel, handleMessage);
    return () => unsubscribe(channel, handleMessage);
  }, [serverId, subscribe, unsubscribe, handleMessage]);

  useEffect(() => {
    const handleReconnect = () => setLoading(true);
    onReconnect(handleReconnect);
    return () => offReconnect(handleReconnect);
  }, [onReconnect, offReconnect]);

  return { processes, destinations, rxBps, txBps, loading, lastUpdated };
}

'use client';

import { useState, useEffect, useCallback } from 'react';
import { useWebSocket } from './WebSocketProvider';
import type { NetworkClient } from '@/lib/types';

interface NetworkData {
  clients: NetworkClient[];
}

export function useServerNetwork(serverId: string) {
  const [clients, setClients] = useState<NetworkClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const { subscribe, unsubscribe, onReconnect, offReconnect } = useWebSocket();

  const handleNetwork = useCallback((msg: unknown) => {
    const m = msg as { data: NetworkData };
    if (m.data?.clients) {
      setClients(m.data.clients);
      setLoading(false);
      setLastUpdated(new Date());
    }
  }, []);

  useEffect(() => {
    const channel = `server:${serverId}:network`;
    setClients([]);
    setLoading(true);
    subscribe(channel, handleNetwork);
    return () => unsubscribe(channel, handleNetwork);
  }, [serverId, subscribe, unsubscribe, handleNetwork]);

  useEffect(() => {
    const handleReconnect = () => setLoading(true);
    onReconnect(handleReconnect);
    return () => offReconnect(handleReconnect);
  }, [onReconnect, offReconnect]);

  return { clients, loading, lastUpdated };
}

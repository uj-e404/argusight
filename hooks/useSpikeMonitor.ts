'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useWebSocket } from './WebSocketProvider';
import type { NetworkClient, TrafficPoint, SpikeEvent, SpikeConfig } from '@/lib/types';

export type { SpikeEvent, SpikeConsumer, SpikeConfig } from '@/lib/types';

const DEFAULT_CONFIG: SpikeConfig = {
  personalThresholdMbps: 5,
  allThresholdMbps: 50,
};

export function useSpikeMonitor(serverId: string) {
  const [config, setConfigState] = useState<SpikeConfig>(DEFAULT_CONFIG);
  const [clients, setClients] = useState<NetworkClient[]>([]);
  const [activePersonalSpikes, setActivePersonalSpikes] = useState<NetworkClient[]>([]);
  const [isAllTrafficSpike, setIsAllTrafficSpike] = useState(false);
  const [allTrafficBreakdown, setAllTrafficBreakdown] = useState<NetworkClient[]>([]);
  const [currentRxBps, setCurrentRxBps] = useState(0);
  const [currentTxBps, setCurrentTxBps] = useState(0);
  const [spikeHistory, setSpikeHistory] = useState<SpikeEvent[]>([]);
  const [loading, setLoading] = useState(true);

  const { subscribe, unsubscribe, onReconnect, offReconnect } = useWebSocket();

  const configRef = useRef(config);
  const clientsRef = useRef<NetworkClient[]>([]);
  configRef.current = config;

  // Fetch config from API on mount / serverId change
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/servers/${serverId}/spikes/config`)
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (!cancelled && data) {
          setConfigState(data);
          configRef.current = data;
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [serverId]);

  // Fetch history from API on mount / serverId change
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/servers/${serverId}/spikes?limit=200`)
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (!cancelled && data?.events) {
          setSpikeHistory(data.events);
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [serverId]);

  // Save config via API
  const setConfig = useCallback((newConfig: SpikeConfig) => {
    setConfigState(newConfig);
    configRef.current = newConfig;
    fetch(`/api/servers/${serverId}/spikes/config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newConfig),
    }).catch(() => {});
  }, [serverId]);

  // Clear history via API
  const clearHistory = useCallback(() => {
    setSpikeHistory([]);
    fetch(`/api/servers/${serverId}/spikes`, { method: 'DELETE' }).catch(() => {});
  }, [serverId]);

  // Handle spike events from server (real-time + backfill)
  const handleSpikes = useCallback((msg: unknown) => {
    const m = msg as { data: SpikeEvent | SpikeEvent[]; backfill?: boolean };
    if (m.backfill && Array.isArray(m.data)) {
      setSpikeHistory(m.data);
    } else if (!Array.isArray(m.data) && m.data?.id) {
      setSpikeHistory((prev) => [m.data as SpikeEvent, ...prev].slice(0, 200));
    }
  }, []);

  // Handle network data — for live display only (active spike indicators)
  const handleNetwork = useCallback((msg: unknown) => {
    const m = msg as { data: { clients: NetworkClient[] } };
    if (!m.data?.clients) return;

    const networkClients = m.data.clients;
    setClients(networkClients);
    clientsRef.current = networkClients;
    setLoading(false);

    const cfg = configRef.current;
    const thresholdBps = cfg.personalThresholdMbps * 1_000_000;

    const spiking = networkClients.filter((c) => {
      const totalBps = (c.rateIn + c.rateOut) * 8;
      return totalBps > thresholdBps;
    });

    setActivePersonalSpikes(spiking);
  }, []);

  // Handle traffic data — for live display only
  const handleTraffic = useCallback((msg: unknown) => {
    const m = msg as { data: TrafficPoint | TrafficPoint[]; backfill?: boolean };

    let point: TrafficPoint;
    if (m.backfill && Array.isArray(m.data)) {
      point = m.data[m.data.length - 1];
      if (!point) return;
    } else if (!Array.isArray(m.data)) {
      point = m.data;
    } else {
      return;
    }

    setCurrentRxBps(point.rxBps);
    setCurrentTxBps(point.txBps);

    const cfg = configRef.current;
    const thresholdBps = cfg.allThresholdMbps * 1_000_000;
    const totalBps = point.rxBps + point.txBps;
    const isSpiking = totalBps > thresholdBps;

    setIsAllTrafficSpike(isSpiking);

    if (isSpiking) {
      const sorted = [...clientsRef.current].sort((a, b) =>
        (b.rateIn + b.rateOut) - (a.rateIn + a.rateOut)
      );
      setAllTrafficBreakdown(sorted);
    } else {
      setAllTrafficBreakdown([]);
    }
  }, []);

  // Subscribe to spikes channel
  useEffect(() => {
    const channel = `server:${serverId}:spikes`;
    subscribe(channel, handleSpikes);
    return () => unsubscribe(channel, handleSpikes);
  }, [serverId, subscribe, unsubscribe, handleSpikes]);

  // Subscribe to network channel
  useEffect(() => {
    const channel = `server:${serverId}:network`;
    setClients([]);
    setLoading(true);
    subscribe(channel, handleNetwork);
    return () => unsubscribe(channel, handleNetwork);
  }, [serverId, subscribe, unsubscribe, handleNetwork]);

  // Subscribe to traffic channel
  useEffect(() => {
    const channel = `server:${serverId}:traffic`;
    subscribe(channel, handleTraffic);
    return () => unsubscribe(channel, handleTraffic);
  }, [serverId, subscribe, unsubscribe, handleTraffic]);

  // Handle WS reconnect — refetch data
  useEffect(() => {
    const handleReconnect = () => {
      setLoading(true);
      // Refetch history after reconnect
      fetch(`/api/servers/${serverId}/spikes?limit=200`)
        .then((r) => r.ok ? r.json() : null)
        .then((data) => {
          if (data?.events) setSpikeHistory(data.events);
        })
        .catch(() => {});
    };
    onReconnect(handleReconnect);
    return () => offReconnect(handleReconnect);
  }, [serverId, onReconnect, offReconnect]);

  return {
    config,
    setConfig,
    activePersonalSpikes,
    isAllTrafficSpike,
    allTrafficBreakdown,
    currentRxBps,
    currentTxBps,
    spikeHistory,
    clearHistory,
    clients,
    loading,
  };
}

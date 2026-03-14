'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useWebSocket } from './WebSocketProvider';
import type { NetworkClient, TrafficPoint } from '@/lib/types';

export interface SpikeConsumer {
  ip: string;
  label: string;
  rateIn: number;
  rateOut: number;
}

export interface SpikeEvent {
  id: string;
  timestamp: string;
  type: 'personal' | 'all';
  ip: string;
  label: string;
  peakRateIn: number;
  peakRateOut: number;
  totalRxBps?: number;
  totalTxBps?: number;
  topConsumers?: SpikeConsumer[];
}

interface SpikeConfig {
  personalThresholdMbps: number;
  allThresholdMbps: number;
}

const DEFAULT_CONFIG: SpikeConfig = {
  personalThresholdMbps: 5,
  allThresholdMbps: 50,
};

const MAX_HISTORY = 50;

function loadConfig(serverId: string): SpikeConfig {
  if (typeof window === 'undefined') return DEFAULT_CONFIG;
  try {
    const raw = localStorage.getItem(`argusight:spike:${serverId}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        personalThresholdMbps: parsed.personalThresholdMbps ?? DEFAULT_CONFIG.personalThresholdMbps,
        allThresholdMbps: parsed.allThresholdMbps ?? DEFAULT_CONFIG.allThresholdMbps,
      };
    }
  } catch { /* ignore */ }
  return DEFAULT_CONFIG;
}

function saveConfig(serverId: string, config: SpikeConfig) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(`argusight:spike:${serverId}`, JSON.stringify(config));
}

function loadHistory(serverId: string): SpikeEvent[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(`argusight:spike-history:${serverId}`);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return [];
}

function saveHistory(serverId: string, history: SpikeEvent[]) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(`argusight:spike-history:${serverId}`, JSON.stringify(history));
}

export function useSpikeMonitor(serverId: string) {
  const [config, setConfigState] = useState<SpikeConfig>(() => loadConfig(serverId));
  const [clients, setClients] = useState<NetworkClient[]>([]);
  const [activePersonalSpikes, setActivePersonalSpikes] = useState<NetworkClient[]>([]);
  const [isAllTrafficSpike, setIsAllTrafficSpike] = useState(false);
  const [allTrafficBreakdown, setAllTrafficBreakdown] = useState<NetworkClient[]>([]);
  const [currentRxBps, setCurrentRxBps] = useState(0);
  const [currentTxBps, setCurrentTxBps] = useState(0);
  const [spikeHistory, setSpikeHistory] = useState<SpikeEvent[]>(() => loadHistory(serverId));
  const [loading, setLoading] = useState(true);

  const { subscribe, unsubscribe, onReconnect, offReconnect } = useWebSocket();

  // Refs for cross-callback access
  const configRef = useRef(config);
  const clientsRef = useRef<NetworkClient[]>([]);
  const prevSpikeIpsRef = useRef<Set<string>>(new Set());
  const prevAllSpikeRef = useRef(false);
  const historyRef = useRef(spikeHistory);
  // Pending all-traffic spike: wait for network data with real rates before logging
  const pendingAllSpikeRef = useRef<{ rxBps: number; txBps: number; iface: string } | null>(null);

  // Keep refs in sync
  configRef.current = config;
  historyRef.current = spikeHistory;

  const setConfig = useCallback((newConfig: SpikeConfig) => {
    setConfigState(newConfig);
    configRef.current = newConfig;
    saveConfig(serverId, newConfig);
  }, [serverId]);

  const addToHistory = useCallback((event: SpikeEvent) => {
    setSpikeHistory(prev => {
      const next = [event, ...prev].slice(0, MAX_HISTORY);
      saveHistory(serverId, next);
      historyRef.current = next;
      return next;
    });
  }, [serverId]);

  const clearHistory = useCallback(() => {
    setSpikeHistory([]);
    historyRef.current = [];
    saveHistory(serverId, []);
  }, [serverId]);

  // Handle network data
  const handleNetwork = useCallback((msg: unknown) => {
    const m = msg as { data: { clients: NetworkClient[] } };
    if (!m.data?.clients) return;

    const networkClients = m.data.clients;
    setClients(networkClients);
    clientsRef.current = networkClients;
    setLoading(false);

    const cfg = configRef.current;
    const thresholdBps = cfg.personalThresholdMbps * 1_000_000;

    // Detect personal spikes
    const spiking = networkClients.filter(c => {
      const totalBps = (c.rateIn + c.rateOut) * 8;
      return totalBps > thresholdBps;
    });

    setActivePersonalSpikes(spiking);

    // Dedup for history: only log new spikes
    const currentSpikeIps = new Set(spiking.map(c => c.ip));
    const prevIps = prevSpikeIpsRef.current;

    for (const client of spiking) {
      if (!prevIps.has(client.ip)) {
        addToHistory({
          id: `${Date.now()}-${client.ip}`,
          timestamp: new Date().toISOString(),
          type: 'personal',
          ip: client.ip,
          label: client.label || client.hostname || client.ip,
          peakRateIn: client.rateIn,
          peakRateOut: client.rateOut,
        });
      }
    }

    prevSpikeIpsRef.current = currentSpikeIps;

    // Flush pending all-traffic spike now that we have real client rates
    const pending = pendingAllSpikeRef.current;
    if (pending) {
      const hasRates = networkClients.some(c => c.rateIn > 0 || c.rateOut > 0);
      if (hasRates) {
        const sorted = [...networkClients].sort((a, b) =>
          (b.rateIn + b.rateOut) - (a.rateIn + a.rateOut)
        );
        const consumers = sorted.slice(0, 10).map(c => ({
          ip: c.ip,
          label: c.label || c.hostname || c.ip,
          rateIn: c.rateIn,
          rateOut: c.rateOut,
        }));
        addToHistory({
          id: `${Date.now()}-all`,
          timestamp: new Date().toISOString(),
          type: 'all',
          ip: '',
          label: `Interface: ${pending.iface}`,
          peakRateIn: 0,
          peakRateOut: 0,
          totalRxBps: pending.rxBps,
          totalTxBps: pending.txBps,
          topConsumers: consumers,
        });
        pendingAllSpikeRef.current = null;
      }
    }
  }, [addToHistory]);

  // Handle traffic data
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
      // Sort clients by total rate desc for breakdown
      const sorted = [...clientsRef.current].sort((a, b) =>
        (b.rateIn + b.rateOut) - (a.rateIn + a.rateOut)
      );
      setAllTrafficBreakdown(sorted);

      // Mark pending if entering spike state — actual logging happens in handleNetwork
      // when we have fresh client rates
      if (!prevAllSpikeRef.current) {
        pendingAllSpikeRef.current = {
          rxBps: point.rxBps,
          txBps: point.txBps,
          iface: point.interface,
        };
      }
    } else {
      setAllTrafficBreakdown([]);
      pendingAllSpikeRef.current = null;
    }

    prevAllSpikeRef.current = isSpiking;
  }, [addToHistory]);

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

  // Handle WS reconnect
  useEffect(() => {
    const handleReconnect = () => {
      setLoading(true);
      prevSpikeIpsRef.current = new Set();
      prevAllSpikeRef.current = false;
    };
    onReconnect(handleReconnect);
    return () => offReconnect(handleReconnect);
  }, [onReconnect, offReconnect]);

  // Reload config/history when serverId changes
  useEffect(() => {
    const cfg = loadConfig(serverId);
    setConfigState(cfg);
    configRef.current = cfg;
    const hist = loadHistory(serverId);
    setSpikeHistory(hist);
    historyRef.current = hist;
  }, [serverId]);

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

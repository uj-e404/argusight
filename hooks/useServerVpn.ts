'use client';

import { useState, useEffect, useRef } from 'react';
import type { MikroTikVpnPeer } from '@/lib/types';

export interface VpnPeerWithRate extends MikroTikVpnPeer {
  rateIn: number;
  rateOut: number;
}

interface VpnResponse {
  peers: MikroTikVpnPeer[];
  totalRx: number;
  totalTx: number;
  onlineCount: number;
}

interface PeerSnapshot {
  rx: number;
  tx: number;
  ts: number;
}

interface UseServerVpnResult {
  peers: VpnPeerWithRate[];
  totalRx: number;
  totalTx: number;
  totalRateIn: number;
  totalRateOut: number;
  onlineCount: number;
  loading: boolean;
  error: string | null;
  lastUpdated: Date | null;
}

export function useServerVpn(serverId: string, intervalMs: number = 5000, enabled: boolean = true): UseServerVpnResult {
  const [peers, setPeers] = useState<VpnPeerWithRate[]>([]);
  const [totalRx, setTotalRx] = useState(0);
  const [totalTx, setTotalTx] = useState(0);
  const [totalRateIn, setTotalRateIn] = useState(0);
  const [totalRateOut, setTotalRateOut] = useState(0);
  const [onlineCount, setOnlineCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const prevSnapshotRef = useRef<Map<string, PeerSnapshot>>(new Map());
  const abortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    if (!enabled) {
      setLoading(false);
      return;
    }

    // Reset snapshot on serverId change so rates don't leak between servers
    prevSnapshotRef.current = new Map();

    const fetchData = async () => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const res = await fetch(`/api/servers/${serverId}/vpn`, { signal: controller.signal });
        if (!mountedRef.current) return;

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          setError(body.error || `HTTP ${res.status}`);
          setLoading(false);
          return;
        }

        const json: VpnResponse = await res.json();
        if (!mountedRef.current) return;

        const now = Date.now();
        const prev = prevSnapshotRef.current;
        const nextSnapshot = new Map<string, PeerSnapshot>();

        let sumRateIn = 0;
        let sumRateOut = 0;

        const peersWithRate: VpnPeerWithRate[] = json.peers.map((p) => {
          const key = p.publicKey || p.id;
          const prevSnap = prev.get(key);
          let rateIn = 0;
          let rateOut = 0;

          if (prevSnap) {
            const dtSec = (now - prevSnap.ts) / 1000;
            if (dtSec > 0) {
              // Counter reset guard: if current < prev, reset
              const dRx = p.rx >= prevSnap.rx ? p.rx - prevSnap.rx : 0;
              const dTx = p.tx >= prevSnap.tx ? p.tx - prevSnap.tx : 0;
              rateIn = dRx / dtSec;
              rateOut = dTx / dtSec;
            }
          }

          nextSnapshot.set(key, { rx: p.rx, tx: p.tx, ts: now });
          sumRateIn += rateIn;
          sumRateOut += rateOut;

          return { ...p, rateIn, rateOut };
        });

        prevSnapshotRef.current = nextSnapshot;

        setPeers(peersWithRate);
        setTotalRx(json.totalRx);
        setTotalTx(json.totalTx);
        setTotalRateIn(sumRateIn);
        setTotalRateOut(sumRateOut);
        setOnlineCount(json.onlineCount);
        setError(null);
        setLastUpdated(new Date());
        setLoading(false);
      } catch (err) {
        if (!mountedRef.current) return;
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setError(err instanceof Error ? err.message : 'Fetch failed');
        setLoading(false);
      }
    };

    fetchData();
    const timer = setInterval(fetchData, intervalMs);

    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
      clearInterval(timer);
    };
  }, [serverId, intervalMs, enabled]);

  return {
    peers,
    totalRx,
    totalTx,
    totalRateIn,
    totalRateOut,
    onlineCount,
    loading,
    error,
    lastUpdated,
  };
}

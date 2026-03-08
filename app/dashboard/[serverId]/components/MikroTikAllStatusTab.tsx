'use client';

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  BarChart3,
  Users,
  Network,
  Globe,
  ArrowDownToLine,
  ArrowUpFromLine,
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { CpuRamChart } from './CpuRamChart';
import { usePolling } from './usePolling';
import { useServerTraffic } from '@/hooks/useServerTraffic';
import { useServerHotspot } from '@/hooks/useServerHotspot';
import { useServerNetwork } from '@/hooks/useServerNetwork';
import { useWebSocket } from '@/hooks/WebSocketProvider';
import { formatBps } from '@/lib/format';
import type { MikroTikInterface, DomainTrafficEntry } from '@/lib/types';

interface MikroTikAllStatusTabProps {
  serverId: string;
  features: string[];
}

function SectionSkeleton({ icon: Icon, title }: { icon: React.ElementType; title: string }) {
  return (
    <div className="bg-bg-surface border border-bg-elevated rounded-lg p-4">
      <div className="flex items-center gap-2 mb-3">
        <Icon className="h-4 w-4 text-text-muted" />
        <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
      </div>
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-4 w-full bg-bg-elevated" />
        ))}
      </div>
    </div>
  );
}

function formatRate(bytesPerSec: number): string {
  const bps = bytesPerSec * 8;
  if (bps >= 1_000_000_000) return `${(bps / 1_000_000_000).toFixed(2)} Gbps`;
  if (bps >= 1_000_000) return `${(bps / 1_000_000).toFixed(1)} Mbps`;
  if (bps >= 1_000) return `${(bps / 1_000).toFixed(1)} Kbps`;
  return `${Math.round(bps)} bps`;
}

function formatBandwidth(bps: number): string {
  if (bps >= 1_000_000_000) return `${(bps / 1_000_000_000).toFixed(2)} Gbps`;
  if (bps >= 1_000_000) return `${(bps / 1_000_000).toFixed(1)} Mbps`;
  if (bps >= 1_000) return `${(bps / 1_000).toFixed(0)} Kbps`;
  return `${bps} bps`;
}

const userTimezone = typeof window !== 'undefined'
  ? Intl.DateTimeFormat().resolvedOptions().timeZone
  : 'UTC';

function formatTime(timestamp: string): string {
  const d = new Date(timestamp);
  return d.toLocaleTimeString('en-US', { hour12: false, timeZone: userTimezone });
}

function buildQueue(features: string[]): string[] {
  const queue: string[] = [];
  if (features.includes('hotspot')) queue.push('hotspot');
  if (features.includes('network')) queue.push('network');
  if (features.includes('domains')) queue.push('domains');
  return queue;
}

function TrafficSection({ serverId }: { serverId: string }) {
  const { data: ifaceData } = usePolling<{ interfaces: MikroTikInterface[] }>(
    `/api/servers/${serverId}/interfaces`,
    0
  );
  const [selectedInterface, setSelectedInterface] = useState('');
  const { send } = useWebSocket();
  const { data, loading } = useServerTraffic(serverId);

  const interfaces = ifaceData?.interfaces?.filter((i) => i.running && !i.disabled) ?? [];

  useEffect(() => {
    if (interfaces.length > 0 && !selectedInterface) {
      const first = interfaces[0].name;
      setSelectedInterface(first);
      send({ type: 'set-interface', serverId, interface: first });
    }
  }, [interfaces.length, selectedInterface, send, serverId]);

  const latest = data.length > 0 ? data[data.length - 1] : null;

  const chartData = data.map((d) => ({
    time: formatTime(d.timestamp),
    rx: d.rxBps,
    tx: d.txBps,
  }));

  return (
    <div className="bg-bg-surface border border-bg-elevated rounded-lg p-6 flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <BarChart3 className="h-4 w-4 text-text-muted" />
        <h3 className="text-sm font-semibold text-text-primary">Traffic</h3>
        {selectedInterface && (
          <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-bg-elevated text-text-muted">
            {selectedInterface}
          </Badge>
        )}
      </div>

      {/* Current values */}
      <div className="flex gap-6 mb-4">
        <div>
          <div className="flex items-center gap-1 text-xs text-text-muted mb-1">
            <ArrowDownToLine className="h-3 w-3 text-status-info" />
            RX
          </div>
          <div className="font-mono text-xl font-bold text-status-info">
            {loading || !latest ? '--' : formatBps(latest.rxBps)}
          </div>
        </div>
        <div>
          <div className="flex items-center gap-1 text-xs text-text-muted mb-1">
            <ArrowUpFromLine className="h-3 w-3 text-status-healthy" />
            TX
          </div>
          <div className="font-mono text-xl font-bold text-status-healthy">
            {loading || !latest ? '--' : formatBps(latest.txBps)}
          </div>
        </div>
      </div>

      {/* Mini chart */}
      <div className="flex-1 min-h-0" style={{ height: '200px' }}>
        {chartData.length === 0 ? (
          <div className="flex items-center justify-center h-full text-text-muted text-xs">
            {loading ? 'Waiting for traffic data...' : selectedInterface ? 'No data yet' : 'Select an interface'}
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2A2A3C" />
              <XAxis
                dataKey="time"
                stroke="#6B6B7B"
                fontSize={9}
                tickLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                stroke="#6B6B7B"
                fontSize={9}
                tickLine={false}
                tickFormatter={(v) => formatBandwidth(v)}
                width={50}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#1E1E2E',
                  border: '1px solid #2A2A3C',
                  borderRadius: '8px',
                  fontSize: '11px',
                }}
                labelStyle={{ color: '#9E9EA8' }}
                formatter={(value: number | undefined, name: string | undefined) => [
                  formatBps(value ?? 0),
                  name === 'rx' ? 'RX' : 'TX',
                ]}
              />
              <Area
                type="monotone"
                dataKey="rx"
                stroke="#60A5FA"
                fill="#60A5FA"
                fillOpacity={0.15}
                strokeWidth={1.5}
                dot={false}
                isAnimationActive={false}
                name="rx"
              />
              <Area
                type="monotone"
                dataKey="tx"
                stroke="#4ADE80"
                fill="#4ADE80"
                fillOpacity={0.15}
                strokeWidth={1.5}
                dot={false}
                isAnimationActive={false}
                name="tx"
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

function HotspotSection({ serverId, onReady }: { serverId: string; onReady: () => void }) {
  const { users, totalRateIn, totalRateOut, loading } = useServerHotspot(serverId);
  const firedRef = useRef(false);

  useEffect(() => {
    if (!loading && !firedRef.current) {
      firedRef.current = true;
      onReady();
    }
  }, [loading, onReady]);

  if (loading && users.length === 0) {
    return <SectionSkeleton icon={Users} title="Hotspot" />;
  }

  return (
    <div className="bg-bg-surface border border-bg-elevated rounded-lg p-4">
      <div className="flex items-center gap-2 mb-3">
        <Users className="h-4 w-4 text-text-muted" />
        <h3 className="text-sm font-semibold text-text-primary">Hotspot</h3>
      </div>
      <div className="flex flex-wrap gap-4 items-center">
        <div>
          <div className="text-[11px] text-text-muted uppercase tracking-wider mb-0.5">Active Users</div>
          <div className="font-mono text-2xl font-bold text-text-primary">{users.length}</div>
        </div>
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-1.5">
            <ArrowDownToLine className="h-3.5 w-3.5 text-status-info" />
            <span className="font-mono text-xs font-bold text-status-info">{formatRate(totalRateIn)}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <ArrowUpFromLine className="h-3.5 w-3.5 text-status-healthy" />
            <span className="font-mono text-xs font-bold text-status-healthy">{formatRate(totalRateOut)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function NetworkSection({ serverId, onReady }: { serverId: string; onReady: () => void }) {
  const { clients, loading } = useServerNetwork(serverId);
  const firedRef = useRef(false);

  useEffect(() => {
    if (!loading && !firedRef.current) {
      firedRef.current = true;
      onReady();
    }
  }, [loading, onReady]);

  const { totalRateIn, totalRateOut, top5 } = useMemo(() => {
    let rIn = 0;
    let rOut = 0;
    for (const c of clients) {
      rIn += c.rateIn;
      rOut += c.rateOut;
    }
    const sorted = [...clients].sort((a, b) => (b.rateIn + b.rateOut) - (a.rateIn + a.rateOut)).slice(0, 5);
    return { totalRateIn: rIn, totalRateOut: rOut, top5: sorted };
  }, [clients]);

  if (loading && clients.length === 0) {
    return <SectionSkeleton icon={Network} title="Network" />;
  }

  return (
    <div className="bg-bg-surface border border-bg-elevated rounded-lg p-4">
      <div className="flex items-center gap-2 mb-3">
        <Network className="h-4 w-4 text-text-muted" />
        <h3 className="text-sm font-semibold text-text-primary">Network</h3>
      </div>

      <div className="flex flex-wrap gap-4 mb-3">
        <div className="flex items-center gap-1.5">
          <Network className="h-3.5 w-3.5 text-text-muted" />
          <span className="text-xs text-text-muted">Clients:</span>
          <span className="font-mono text-sm font-bold text-text-primary">{clients.length}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <ArrowDownToLine className="h-3.5 w-3.5 text-status-info" />
          <span className="font-mono text-xs font-bold text-status-info">{formatRate(totalRateIn)}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <ArrowUpFromLine className="h-3.5 w-3.5 text-status-healthy" />
          <span className="font-mono text-xs font-bold text-status-healthy">{formatRate(totalRateOut)}</span>
        </div>
      </div>

      {top5.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow className="border-bg-elevated hover:bg-transparent">
              <TableHead className="text-text-muted text-xs py-1">Client</TableHead>
              <TableHead className="text-text-muted text-xs py-1 text-right">Rate</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {top5.map((c) => (
              <TableRow key={c.ip} className="border-bg-elevated">
                <TableCell className="py-1.5">
                  <div className="flex flex-col">
                    {(c.hostname || c.label) && (
                      <span className="text-xs text-text-secondary leading-tight">
                        {c.label || c.hostname}
                      </span>
                    )}
                    <span className="font-mono text-[11px] text-text-muted leading-tight">{c.ip}</span>
                  </div>
                </TableCell>
                <TableCell className="font-mono text-xs text-right py-1.5">
                  <span className="text-status-info">{formatRate(c.rateIn)}</span>
                  <span className="text-text-muted mx-1">/</span>
                  <span className="text-status-healthy">{formatRate(c.rateOut)}</span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

function DomainsSection({ serverId, onReady }: { serverId: string; onReady: () => void }) {
  const { data, loading } = usePolling<{ domains: DomainTrafficEntry[] }>(
    `/api/servers/${serverId}/domains`,
    5000
  );
  const firedRef = useRef(false);

  const domains = data?.domains ?? [];
  const top5 = useMemo(
    () => [...domains].sort((a, b) => b.connections - a.connections).slice(0, 5),
    [domains]
  );

  useEffect(() => {
    if (data && !firedRef.current) {
      firedRef.current = true;
      onReady();
    }
  }, [data, onReady]);

  if (!data && loading) {
    return <SectionSkeleton icon={Globe} title="Domains" />;
  }

  return (
    <div className="bg-bg-surface border border-bg-elevated rounded-lg p-4">
      <div className="flex items-center gap-2 mb-3">
        <Globe className="h-4 w-4 text-text-muted" />
        <h3 className="text-sm font-semibold text-text-primary">Domains</h3>
      </div>

      <div className="flex items-center gap-1.5 mb-3">
        <span className="text-xs text-text-muted">Total:</span>
        <span className="font-mono text-sm font-bold text-text-primary">{domains.length}</span>
      </div>

      {top5.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow className="border-bg-elevated hover:bg-transparent">
              <TableHead className="text-text-muted text-xs py-1">Domain</TableHead>
              <TableHead className="text-text-muted text-xs py-1 text-right">Conns</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {top5.map((d) => (
              <TableRow key={`${d.name}-${d.address}`} className="border-bg-elevated">
                <TableCell className="py-1.5 whitespace-normal">
                  <div className="flex flex-col">
                    <span className="text-xs text-text-secondary leading-tight break-all">
                      {d.name}
                    </span>
                    <span className="font-mono text-[11px] text-text-muted leading-tight">{d.address}</span>
                  </div>
                </TableCell>
                <TableCell className="font-mono text-xs text-gold-primary font-bold text-right py-1.5">
                  {d.connections}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

export function MikroTikAllStatusTab({ serverId, features }: MikroTikAllStatusTabProps) {
  const queue = useRef(buildQueue(features)).current;
  const [ready, setReady] = useState<Set<string>>(new Set());

  const markReady = useCallback((section: string) => {
    setReady((prev) => {
      if (prev.has(section)) return prev;
      const next = new Set(prev);
      next.add(section);
      return next;
    });
  }, []);

  const isEnabled = (section: string) => {
    const idx = queue.indexOf(section);
    if (idx <= 0) return true;
    return ready.has(queue[idx - 1]);
  };

  const hasTraffic = features.includes('traffic');

  return (
    <div className="space-y-4">
      {/* Top row: CPU/RAM + Traffic side by side */}
      <div className={`grid grid-cols-1 ${hasTraffic ? 'lg:grid-cols-2' : ''} gap-4`}>
        <CpuRamChart serverId={serverId} />
        {hasTraffic && <TrafficSection serverId={serverId} />}
      </div>

      {/* Bottom grid: remaining sections */}
      {(features.includes('hotspot') || features.includes('network') || features.includes('domains')) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {features.includes('hotspot') && (
            isEnabled('hotspot') ? (
              <HotspotSection serverId={serverId} onReady={() => markReady('hotspot')} />
            ) : (
              <SectionSkeleton icon={Users} title="Hotspot" />
            )
          )}
          {features.includes('network') && (
            isEnabled('network') ? (
              <NetworkSection serverId={serverId} onReady={() => markReady('network')} />
            ) : (
              <SectionSkeleton icon={Network} title="Network" />
            )
          )}
          {features.includes('domains') && (
            isEnabled('domains') ? (
              <DomainsSection serverId={serverId} onReady={() => markReady('domains')} />
            ) : (
              <SectionSkeleton icon={Globe} title="Domains" />
            )
          )}
        </div>
      )}
    </div>
  );
}

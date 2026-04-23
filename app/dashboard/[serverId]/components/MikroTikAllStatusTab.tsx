'use client';

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  BarChart3,
  Users,
  Network,
  Shield,
  ShieldCheck,
  ShieldOff,
  ArrowDownToLine,
  ArrowUpFromLine,
  Zap,
  ChevronRight,
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
import { useServerVpn } from '@/hooks/useServerVpn';
import { useWebSocket } from '@/hooks/WebSocketProvider';
import { useSpikeMonitor } from '@/hooks/useSpikeMonitor';
import type { SpikeEvent } from '@/lib/types';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { formatBps } from '@/lib/format';
import type { MikroTikInterface } from '@/lib/types';

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
  if (features.includes('vpn')) queue.push('vpn');
  return queue;
}

function formatBytes(bytes: number): string {
  if (bytes >= 1_073_741_824) return `${(bytes / 1_073_741_824).toFixed(2)} GB`;
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MB`;
  if (bytes >= 1_024) return `${(bytes / 1_024).toFixed(0)} KB`;
  return `${bytes} B`;
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

  const top5 = useMemo(
    () => [...users].sort((a, b) => (b.rateIn + b.rateOut) - (a.rateIn + a.rateOut)).slice(0, 5),
    [users]
  );

  if (loading && users.length === 0) {
    return <SectionSkeleton icon={Users} title="Hotspot" />;
  }

  return (
    <div className="bg-bg-surface border border-bg-elevated rounded-lg p-4">
      <div className="flex items-center gap-2 mb-3">
        <Users className="h-4 w-4 text-text-muted" />
        <h3 className="text-sm font-semibold text-text-primary">Hotspot</h3>
      </div>

      <div className="flex flex-wrap gap-4 mb-3">
        <div className="flex items-center gap-1.5">
          <Users className="h-3.5 w-3.5 text-text-muted" />
          <span className="text-xs text-text-muted">Active:</span>
          <span className="font-mono text-sm font-bold text-text-primary">{users.length}</span>
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
              <TableHead className="text-text-muted text-xs py-1">User</TableHead>
              <TableHead className="text-text-muted text-xs py-1 text-right">Rate</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {top5.map((u) => (
              <TableRow key={u.address} className="border-bg-elevated">
                <TableCell className="py-1.5">
                  <div className="flex flex-col">
                    <span className="text-xs text-text-secondary leading-tight">{u.user}</span>
                    <span className="font-mono text-[11px] text-text-muted leading-tight">{u.address}</span>
                  </div>
                </TableCell>
                <TableCell className="font-mono text-xs text-right py-1.5">
                  <span className="text-status-info">{formatRate(u.rateIn)}</span>
                  <span className="text-text-muted mx-1">/</span>
                  <span className="text-status-healthy">{formatRate(u.rateOut)}</span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
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

function VpnSection({ serverId, onReady }: { serverId: string; onReady: () => void }) {
  const { peers, totalRx, totalTx, totalRateIn, totalRateOut, onlineCount, loading } = useServerVpn(serverId, 5000);
  const firedRef = useRef(false);

  const top5 = useMemo(() => {
    const ranked = [...peers].sort((a, b) => {
      if (a.online !== b.online) return a.online ? -1 : 1;
      return (b.rateIn + b.rateOut) - (a.rateIn + a.rateOut);
    });
    return ranked.slice(0, 5);
  }, [peers]);

  useEffect(() => {
    if (!loading && !firedRef.current) {
      firedRef.current = true;
      onReady();
    }
  }, [loading, onReady]);

  if (loading && peers.length === 0) {
    return <SectionSkeleton icon={Shield} title="VPN" />;
  }

  return (
    <div className="bg-bg-surface border border-bg-elevated rounded-lg p-4">
      <div className="flex items-center gap-2 mb-3">
        <Shield className="h-4 w-4 text-text-muted" />
        <h3 className="text-sm font-semibold text-text-primary">VPN</h3>
      </div>

      <div className="flex flex-wrap gap-4 mb-3">
        <div className="flex items-center gap-1.5">
          <ShieldCheck className="h-3.5 w-3.5 text-status-healthy" />
          <span className="text-xs text-text-muted">Online:</span>
          <span className="font-mono text-sm font-bold text-text-primary">
            <span className="text-status-healthy">{onlineCount}</span>
            <span className="text-text-muted"> / {peers.length}</span>
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <ArrowDownToLine className="h-3.5 w-3.5 text-status-info" />
          <div className="flex flex-col leading-tight">
            <span className="font-mono text-xs font-bold text-status-info">{formatRate(totalRateIn)}</span>
            <span className="font-mono text-[10px] text-text-muted">{formatBytes(totalRx)}</span>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <ArrowUpFromLine className="h-3.5 w-3.5 text-status-healthy" />
          <div className="flex flex-col leading-tight">
            <span className="font-mono text-xs font-bold text-status-healthy">{formatRate(totalRateOut)}</span>
            <span className="font-mono text-[10px] text-text-muted">{formatBytes(totalTx)}</span>
          </div>
        </div>
      </div>

      {top5.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow className="border-bg-elevated hover:bg-transparent">
              <TableHead className="text-text-muted text-xs py-1">Peer</TableHead>
              <TableHead className="text-text-muted text-xs py-1 text-right">Rate</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {top5.map((p) => {
              const StatusIcon = p.disabled ? ShieldOff : p.online ? ShieldCheck : Shield;
              const statusColor = p.disabled
                ? 'text-text-muted'
                : p.online
                  ? 'text-status-healthy'
                  : 'text-text-muted';
              return (
                <TableRow key={p.publicKey || p.id} className="border-bg-elevated">
                  <TableCell className="py-1.5">
                    <div className="flex items-center gap-2 min-w-0">
                      <StatusIcon className={`h-3 w-3 flex-shrink-0 ${statusColor}`} />
                      <div className="flex flex-col min-w-0">
                        <span className="text-xs text-text-secondary leading-tight truncate">
                          {p.name || p.publicKey.slice(0, 12) + '…'}
                        </span>
                        <span className="font-mono text-[11px] text-text-muted leading-tight">
                          {p.allowedAddress || '-'}
                        </span>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="py-1.5 text-right">
                    <div className="flex flex-col leading-tight items-end">
                      <span className="font-mono text-xs">
                        <span className="text-status-info">{formatRate(p.rateIn)}</span>
                        <span className="text-text-muted mx-1">/</span>
                        <span className="text-status-healthy">{formatRate(p.rateOut)}</span>
                      </span>
                      <span className="font-mono text-[10px] text-text-muted">
                        {formatBytes(p.rx)} / {formatBytes(p.tx)}
                      </span>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

function rateColor(bytesPerSec: number): string {
  const bps = bytesPerSec * 8;
  if (bps >= 10_000_000) return 'text-status-critical';
  if (bps >= 1_000_000) return 'text-status-warning';
  return 'text-status-healthy';
}

function formatSpikeTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString('en-US', { hour12: false }) + ' ' + d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function SpikeSection({ serverId }: { serverId: string }) {
  const {
    config,
    activePersonalSpikes,
    isAllTrafficSpike,
    currentRxBps,
    currentTxBps,
    spikeHistory,
    clients,
    loading,
  } = useSpikeMonitor(serverId);

  const [selectedEvent, setSelectedEvent] = useState<SpikeEvent | null>(null);

  const hasActiveSpike = activePersonalSpikes.length > 0 || isAllTrafficSpike;

  // Total client rates
  const totalClientRateIn = useMemo(() => clients.reduce((s, c) => s + c.rateIn, 0), [clients]);
  const totalClientRateOut = useMemo(() => clients.reduce((s, c) => s + c.rateOut, 0), [clients]);

  return (
    <div className={`bg-bg-surface border rounded-lg p-4 ${hasActiveSpike ? 'border-status-critical/50' : 'border-bg-elevated'}`}>
      <div className="flex items-center gap-2 mb-3">
        <Zap className={`h-4 w-4 ${hasActiveSpike ? 'text-status-critical' : 'text-text-muted'}`} />
        <h3 className="text-sm font-semibold text-text-primary">Spike Monitor</h3>
        {hasActiveSpike && (
          <Badge variant="outline" className="text-[10px] border-status-critical/50 text-status-critical animate-pulse">
            ACTIVE
          </Badge>
        )}
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-4 w-full bg-bg-elevated" />
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {/* Personal section */}
          <div>
            <div className="text-[10px] text-text-muted uppercase tracking-wider mb-1.5">
              Personal ({clients.length} clients)
            </div>
            <div className="flex flex-wrap gap-3 items-center">
              <div className="flex items-center gap-1.5">
                <ArrowDownToLine className="h-3 w-3 text-status-info" />
                <span className="font-mono text-xs font-bold text-status-info">{formatRate(totalClientRateIn)}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <ArrowUpFromLine className="h-3 w-3 text-status-healthy" />
                <span className="font-mono text-xs font-bold text-status-healthy">{formatRate(totalClientRateOut)}</span>
              </div>
              {activePersonalSpikes.length > 0 ? (
                <Badge variant="outline" className="text-[10px] border-status-critical/50 text-status-critical">
                  {activePersonalSpikes.length} spike{activePersonalSpikes.length > 1 ? 's' : ''} &gt;{config.personalThresholdMbps}Mbps
                </Badge>
              ) : (
                <Badge variant="outline" className="text-[10px] border-status-healthy/50 text-status-healthy">
                  OK &lt;{config.personalThresholdMbps}Mbps
                </Badge>
              )}
            </div>
          </div>

          {/* Active personal spikes - top 3 */}
          {activePersonalSpikes.length > 0 && (
            <div className="space-y-1">
              {activePersonalSpikes.slice(0, 3).map((c) => (
                <div key={c.ip} className="flex items-center justify-between py-1 px-2 rounded bg-status-critical/5 border border-status-critical/20">
                  <div className="min-w-0">
                    <span className="text-xs text-text-primary truncate block">{c.label || c.hostname || c.ip}</span>
                    {(c.label || c.hostname) && <span className="font-mono text-[10px] text-text-muted">{c.ip}</span>}
                  </div>
                  <div className="font-mono text-[10px] flex-shrink-0 ml-2">
                    <span className={rateColor(c.rateIn)}>{formatRate(c.rateIn)}</span>
                    <span className="text-text-muted"> / </span>
                    <span className={rateColor(c.rateOut)}>{formatRate(c.rateOut)}</span>
                  </div>
                </div>
              ))}
              {activePersonalSpikes.length > 3 && (
                <div className="text-[10px] text-text-muted text-center">
                  +{activePersonalSpikes.length - 3} more
                </div>
              )}
            </div>
          )}

          {/* All Traffic section */}
          <div className="border-t border-bg-elevated pt-2">
            <div className="text-[10px] text-text-muted uppercase tracking-wider mb-1.5">All Traffic</div>
            <div className="flex flex-wrap gap-3 items-center">
              <div className="flex items-center gap-1.5">
                <ArrowDownToLine className="h-3 w-3 text-status-info" />
                <span className="font-mono text-xs font-bold text-status-info">{formatBps(currentRxBps)}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <ArrowUpFromLine className="h-3 w-3 text-status-healthy" />
                <span className="font-mono text-xs font-bold text-status-healthy">{formatBps(currentTxBps)}</span>
              </div>
              {isAllTrafficSpike ? (
                <Badge variant="outline" className="text-[10px] border-status-critical/50 text-status-critical animate-pulse">
                  SPIKE &gt;{config.allThresholdMbps}Mbps
                </Badge>
              ) : (
                <Badge variant="outline" className="text-[10px] border-status-healthy/50 text-status-healthy">
                  OK &lt;{config.allThresholdMbps}Mbps
                </Badge>
              )}
            </div>
          </div>

          {/* Recent history */}
          {spikeHistory.length > 0 && (
            <div className="border-t border-bg-elevated pt-2 space-y-1">
              <div className="text-[10px] text-text-muted uppercase tracking-wider mb-1">
                Recent ({spikeHistory.length})
              </div>
              {spikeHistory.slice(0, 3).map((event) => (
                <div
                  key={event.id}
                  className="flex items-center gap-2 py-1 px-2 rounded cursor-pointer hover:bg-bg-dark/50 transition-colors"
                  onClick={() => setSelectedEvent(event)}
                >
                  <Badge
                    variant="outline"
                    className={`flex-shrink-0 ${
                      event.type === 'personal'
                        ? 'text-[9px] border-status-warning/50 text-status-warning'
                        : 'text-[9px] border-status-critical/50 text-status-critical'
                    }`}
                  >
                    {event.type === 'personal' ? 'P' : 'A'}
                  </Badge>
                  <span className="text-[11px] text-text-secondary truncate flex-1">{event.label}</span>
                  <span className="font-mono text-[10px] text-text-muted flex-shrink-0">{formatSpikeTime(event.timestamp)}</span>
                  <ChevronRight className="h-3 w-3 text-text-muted flex-shrink-0" />
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Reuse spike detail dialog */}
      <SpikeDetailMiniDialog event={selectedEvent} onClose={() => setSelectedEvent(null)} />
    </div>
  );
}

function SpikeDetailMiniDialog({ event, onClose }: { event: SpikeEvent | null; onClose: () => void }) {
  if (!event) return null;

  const totalBps = event.type === 'personal'
    ? (event.peakRateIn + event.peakRateOut) * 8
    : (event.totalRxBps ?? 0) + (event.totalTxBps ?? 0);

  return (
    <Dialog open={!!event} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="bg-bg-surface border-bg-elevated sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-text-primary flex items-center gap-2">
            <Zap className={`h-4 w-4 ${event.type === 'personal' ? 'text-status-warning' : 'text-status-critical'}`} />
            Spike Detail
            <Badge
              variant="outline"
              className={
                event.type === 'personal'
                  ? 'text-[10px] border-status-warning/50 text-status-warning ml-1'
                  : 'text-[10px] border-status-critical/50 text-status-critical ml-1'
              }
            >
              {event.type === 'personal' ? 'Personal' : 'All Traffic'}
            </Badge>
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="text-xs text-text-muted">
            {new Date(event.timestamp).toLocaleString('en-US', {
              weekday: 'short', year: 'numeric', month: 'short', day: 'numeric',
              hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
            })}
          </div>

          {event.type === 'personal' ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-[10px] text-text-muted uppercase tracking-wider">Client</div>
                  <div className="text-sm text-text-primary font-medium">{event.label}</div>
                  {event.ip && <div className="font-mono text-xs text-text-muted">{event.ip}</div>}
                </div>
                <div>
                  <div className="text-[10px] text-text-muted uppercase tracking-wider">Combined</div>
                  <div className={`font-mono text-sm font-bold ${totalBps >= 10_000_000 ? 'text-status-critical' : totalBps >= 1_000_000 ? 'text-status-warning' : 'text-status-healthy'}`}>
                    {formatBps(totalBps)}
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-bg-dark/50 rounded-md p-3">
                  <div className="text-[10px] text-text-muted flex items-center gap-1 mb-1">
                    <ArrowDownToLine className="h-2.5 w-2.5 text-status-info" /> Download
                  </div>
                  <div className="font-mono text-sm font-bold text-status-info">{formatRate(event.peakRateIn)}</div>
                </div>
                <div className="bg-bg-dark/50 rounded-md p-3">
                  <div className="text-[10px] text-text-muted flex items-center gap-1 mb-1">
                    <ArrowUpFromLine className="h-2.5 w-2.5 text-status-healthy" /> Upload
                  </div>
                  <div className="font-mono text-sm font-bold text-status-healthy">{formatRate(event.peakRateOut)}</div>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-bg-dark/50 rounded-md p-3">
                  <div className="text-[10px] text-text-muted flex items-center gap-1 mb-1">
                    <ArrowDownToLine className="h-2.5 w-2.5 text-status-info" /> RX
                  </div>
                  <div className="font-mono text-sm font-bold text-status-info">{formatBps(event.totalRxBps ?? 0)}</div>
                </div>
                <div className="bg-bg-dark/50 rounded-md p-3">
                  <div className="text-[10px] text-text-muted flex items-center gap-1 mb-1">
                    <ArrowUpFromLine className="h-2.5 w-2.5 text-status-healthy" /> TX
                  </div>
                  <div className="font-mono text-sm font-bold text-status-healthy">{formatBps(event.totalTxBps ?? 0)}</div>
                </div>
              </div>
              {event.topConsumers && event.topConsumers.length > 0 && (
                <div>
                  <div className="text-xs text-text-muted font-medium flex items-center gap-1.5 mb-2">
                    <Network className="h-3.5 w-3.5" />
                    Top Consumers ({event.topConsumers.length})
                  </div>
                  <Table>
                    <TableHeader>
                      <TableRow className="border-bg-elevated hover:bg-transparent">
                        <TableHead className="text-text-muted text-[10px] py-1.5">Client</TableHead>
                        <TableHead className="text-text-muted text-[10px] py-1.5">DL</TableHead>
                        <TableHead className="text-text-muted text-[10px] py-1.5">UL</TableHead>
                        <TableHead className="text-text-muted text-[10px] py-1.5">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {event.topConsumers.map((c) => (
                        <TableRow key={c.ip} className="border-bg-elevated">
                          <TableCell className="py-1.5">
                            <div className="text-xs text-text-secondary">{c.label}</div>
                            <div className="font-mono text-[10px] text-text-muted">{c.ip}</div>
                          </TableCell>
                          <TableCell className={`font-mono text-xs py-1.5 ${rateColor(c.rateIn)}`}>{formatRate(c.rateIn)}</TableCell>
                          <TableCell className={`font-mono text-xs py-1.5 ${rateColor(c.rateOut)}`}>{formatRate(c.rateOut)}</TableCell>
                          <TableCell className={`font-mono text-xs py-1.5 font-bold ${rateColor(c.rateIn + c.rateOut)}`}>{formatRate(c.rateIn + c.rateOut)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
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
      {(features.includes('hotspot') || features.includes('network') || features.includes('vpn') || features.includes('spike')) && (
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
          {features.includes('vpn') && (
            isEnabled('vpn') ? (
              <VpnSection serverId={serverId} onReady={() => markReady('vpn')} />
            ) : (
              <SectionSkeleton icon={Shield} title="VPN" />
            )
          )}
          {features.includes('spike') && (
            <SpikeSection serverId={serverId} />
          )}
        </div>
      )}
    </div>
  );
}

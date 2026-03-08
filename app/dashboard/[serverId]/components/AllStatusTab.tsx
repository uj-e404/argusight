'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  HardDrive,
  Cpu,
  Gpu,
  Network,
  Container,
  ArrowDownToLine,
  ArrowUpFromLine,
  Thermometer,
  Zap,
} from 'lucide-react';
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
import { StatusBar } from './StatusProgress';
import { usePolling } from './usePolling';
import { useWindowsNet } from '@/hooks/useWindowsNet';
import { formatBps } from '@/lib/format';
import type { DiskInfo, ProcessInfo, GpuInfo, GpuProcessInfo, DockerContainer } from '@/lib/types';

interface AllStatusTabProps {
  serverId: string;
  serverType: 'linux' | 'windows' | 'mikrotik';
  features: string[];
}

interface DiskResponse {
  disks: DiskInfo[];
}

interface ProcessResponse {
  processes: ProcessInfo[];
  ramUnit?: 'MB' | '%';
}

interface GpuResponse {
  gpu: GpuInfo | null;
  processes: GpuProcessInfo[];
  available: boolean;
  error?: string;
}

interface DockerResponse {
  containers: DockerContainer[];
  dockerAvailable: boolean;
  error?: string;
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

// Build the sequential loading queue based on enabled features
function buildQueue(features: string[]): string[] {
  const queue: string[] = [];
  if (features.includes('disk')) queue.push('disk');
  if (features.includes('gpu')) queue.push('gpu');
  if (features.includes('docker')) queue.push('docker');
  if (features.includes('processes')) queue.push('processes');
  if (features.includes('network')) queue.push('network');
  return queue;
}

export function AllStatusTab({ serverId, serverType, features }: AllStatusTabProps) {
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

  // A section is enabled if it's the first in queue, or the previous section is ready
  const isEnabled = (section: string) => {
    const idx = queue.indexOf(section);
    if (idx <= 0) return true;
    return ready.has(queue[idx - 1]);
  };

  return (
    <div className="space-y-4">
      {/* CPU/RAM Chart - always shown */}
      <CpuRamChart serverId={serverId} />

      {/* 2-column grid for remaining sections */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {features.includes('disk') && (
          <DiskSection serverId={serverId} enabled={isEnabled('disk')} onReady={() => markReady('disk')} />
        )}
        {features.includes('gpu') && (
          <GpuSection serverId={serverId} enabled={isEnabled('gpu')} onReady={() => markReady('gpu')} />
        )}
        {features.includes('docker') && (
          <DockerSection serverId={serverId} enabled={isEnabled('docker')} onReady={() => markReady('docker')} />
        )}
        {features.includes('processes') && (
          <ProcessSection serverId={serverId} enabled={isEnabled('processes')} onReady={() => markReady('processes')} />
        )}
        {features.includes('network') && (
          isEnabled('network') ? (
            <NetworkSection serverId={serverId} />
          ) : (
            <SectionSkeleton icon={Network} title="Network" />
          )
        )}
      </div>
    </div>
  );
}

function DiskSection({ serverId, enabled, onReady }: { serverId: string; enabled: boolean; onReady: () => void }) {
  const { data, loading } = usePolling<DiskResponse>(
    `/api/servers/${serverId}/disks`,
    0,
    enabled
  );
  const firedRef = useRef(false);

  useEffect(() => {
    if (data && !firedRef.current) {
      firedRef.current = true;
      onReady();
    }
  }, [data, onReady]);

  const disks = data?.disks ?? [];

  return (
    <div className="bg-bg-surface border border-bg-elevated rounded-lg p-4">
      <div className="flex items-center gap-2 mb-3">
        <HardDrive className="h-4 w-4 text-text-muted" />
        <h3 className="text-sm font-semibold text-text-primary">Disk</h3>
      </div>

      {!data && loading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-4 w-full bg-bg-elevated" />
          ))}
        </div>
      ) : disks.length === 0 ? (
        <div className="text-xs text-text-muted py-4 text-center">No disks found</div>
      ) : (
        <>
          {/* Mobile card view */}
          <div className="sm:hidden space-y-2">
            {disks.map((disk, i) => (
              <div key={`${disk.filesystem}-${i}`} className="border border-bg-elevated rounded-md p-2.5 space-y-1.5">
                <div className="font-mono text-xs text-text-secondary truncate">{disk.filesystem}</div>
                <div className="flex items-center gap-2">
                  <StatusBar value={disk.usePercent} warn={70} critical={85} className="flex-1" />
                  <span className={`font-mono text-xs font-bold min-w-[36px] text-right ${disk.usePercent >= 85 ? 'text-status-critical' : disk.usePercent >= 70 ? 'text-gold-primary' : 'text-status-healthy'}`}>
                    {disk.usePercent}%
                  </span>
                </div>
                <div className="font-mono text-[11px] text-text-muted">{disk.mountpoint}</div>
              </div>
            ))}
          </div>
          {/* Desktop table */}
          <div className="hidden sm:block">
            <Table>
              <TableHeader>
                <TableRow className="border-bg-elevated hover:bg-transparent">
                  <TableHead className="text-text-muted text-xs py-1">Filesystem</TableHead>
                  <TableHead className="text-text-muted text-xs py-1 min-w-[120px]">Usage</TableHead>
                  <TableHead className="text-text-muted text-xs py-1">Mount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {disks.map((disk, i) => (
                  <TableRow key={`${disk.filesystem}-${i}`} className="border-bg-elevated">
                    <TableCell className="font-mono text-xs text-text-secondary py-1.5">
                      {disk.filesystem}
                    </TableCell>
                    <TableCell className="py-1.5">
                      <div className="flex items-center gap-2">
                        <StatusBar value={disk.usePercent} warn={70} critical={85} className="flex-1" />
                        <span
                          className={`font-mono text-xs font-bold min-w-[36px] text-right ${
                            disk.usePercent >= 85
                              ? 'text-status-critical'
                              : disk.usePercent >= 70
                                ? 'text-gold-primary'
                                : 'text-status-healthy'
                          }`}
                        >
                          {disk.usePercent}%
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-text-muted py-1.5">
                      {disk.mountpoint}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </div>
  );
}

function GpuSection({ serverId, enabled, onReady }: { serverId: string; enabled: boolean; onReady: () => void }) {
  const { data, loading } = usePolling<GpuResponse>(
    `/api/servers/${serverId}/gpu`,
    5000,
    enabled
  );
  const firedRef = useRef(false);

  useEffect(() => {
    if (data && !firedRef.current) {
      firedRef.current = true;
      onReady();
    }
  }, [data, onReady]);

  if (!data && loading) {
    return (
      <div className="bg-bg-surface border border-bg-elevated rounded-lg p-4">
        <div className="flex items-center gap-2 mb-3">
          <Gpu className="h-4 w-4 text-text-muted" />
          <h3 className="text-sm font-semibold text-text-primary">GPU</h3>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i}>
              <Skeleton className="h-3 w-16 bg-bg-elevated mb-2" />
              <Skeleton className="h-6 w-12 bg-bg-elevated" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!data?.available || !data?.gpu) {
    return (
      <div className="bg-bg-surface border border-bg-elevated rounded-lg p-4">
        <div className="flex items-center gap-2 mb-3">
          <Gpu className="h-4 w-4 text-text-muted" />
          <h3 className="text-sm font-semibold text-text-primary">GPU</h3>
        </div>
        <div className="text-xs text-text-muted py-4 text-center">
          {data?.error || 'nvidia-smi not available'}
        </div>
      </div>
    );
  }

  const { gpu } = data;
  const tempColor =
    gpu.temperature >= 80
      ? 'text-status-critical'
      : gpu.temperature >= 60
        ? 'text-gold-primary'
        : 'text-status-healthy';

  return (
    <div className="bg-bg-surface border border-bg-elevated rounded-lg p-4">
      <div className="flex items-center gap-2 mb-3">
        <Gpu className="h-4 w-4 text-text-muted" />
        <h3 className="text-sm font-semibold text-text-primary">GPU</h3>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {/* Usage */}
        <div>
          <div className="text-[11px] text-text-muted uppercase tracking-wider mb-1">Usage</div>
          <div className="font-mono text-lg font-bold text-status-info mb-1">{gpu.gpuUtil}%</div>
          <StatusBar value={gpu.gpuUtil} warn={70} critical={90} />
        </div>
        {/* VRAM */}
        <div>
          <div className="text-[11px] text-text-muted uppercase tracking-wider mb-1">VRAM</div>
          <div className="font-mono text-lg font-bold text-gold-primary mb-1">{gpu.memUtil}%</div>
          <StatusBar value={gpu.memUtil} warn={70} critical={90} />
        </div>
        {/* Temperature */}
        <div>
          <div className="flex items-center gap-1 text-[11px] text-text-muted uppercase tracking-wider mb-1">
            <Thermometer className="h-3 w-3" />
            Temp
          </div>
          <div className={`font-mono text-lg font-bold ${tempColor}`}>{gpu.temperature}°C</div>
        </div>
        {/* Power */}
        <div>
          <div className="flex items-center gap-1 text-[11px] text-text-muted uppercase tracking-wider mb-1">
            <Zap className="h-3 w-3" />
            Power
          </div>
          <div className="font-mono text-lg font-bold text-text-primary">{gpu.powerDraw}W</div>
        </div>
      </div>
    </div>
  );
}

const DOCKER_STATE_STYLES: Record<string, string> = {
  running: 'bg-status-healthy/20 text-status-healthy border-0',
  exited: 'bg-status-critical/20 text-status-critical border-0',
  paused: 'bg-gold-primary/20 text-gold-primary border-0',
  restarting: 'bg-status-info/20 text-status-info border-0',
  created: 'bg-text-muted/20 text-text-muted border-0',
};

function DockerSection({ serverId, enabled, onReady }: { serverId: string; enabled: boolean; onReady: () => void }) {
  const { data, loading } = usePolling<DockerResponse>(
    `/api/servers/${serverId}/docker`,
    15000,
    enabled
  );
  const firedRef = useRef(false);

  useEffect(() => {
    if (data && !firedRef.current) {
      firedRef.current = true;
      onReady();
    }
  }, [data, onReady]);

  const containers = data?.containers ?? [];

  return (
    <div className="bg-bg-surface border border-bg-elevated rounded-lg p-4">
      <div className="flex items-center gap-2 mb-3">
        <Container className="h-4 w-4 text-text-muted" />
        <h3 className="text-sm font-semibold text-text-primary">Docker</h3>
      </div>

      {!data && loading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-4 w-full bg-bg-elevated" />
          ))}
        </div>
      ) : !data?.dockerAvailable ? (
        <div className="text-xs text-text-muted py-4 text-center">
          {data?.error || 'Docker not available'}
        </div>
      ) : containers.length === 0 ? (
        <div className="text-xs text-text-muted py-4 text-center">No containers found</div>
      ) : (
        <>
          {/* Mobile card view */}
          <div className="sm:hidden space-y-1.5">
            {containers.map((c) => (
              <div key={c.name} className="flex items-center justify-between border border-bg-elevated rounded-md px-2.5 py-1.5">
                <span className="font-mono text-xs text-text-secondary truncate mr-2">{c.name}</span>
                <Badge className={`text-[10px] px-1.5 py-0 flex-shrink-0 ${DOCKER_STATE_STYLES[c.state] ?? 'bg-text-muted/20 text-text-muted border-0'}`}>
                  {c.state}
                </Badge>
              </div>
            ))}
          </div>
          {/* Desktop table */}
          <div className="hidden sm:block">
            <Table>
              <TableHeader>
                <TableRow className="border-bg-elevated hover:bg-transparent">
                  <TableHead className="text-text-muted text-xs py-1">Name</TableHead>
                  <TableHead className="text-text-muted text-xs py-1 text-right">State</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {containers.map((c) => (
                  <TableRow key={c.name} className="border-bg-elevated">
                    <TableCell className="font-mono text-xs text-text-secondary py-1.5 truncate max-w-[200px]">
                      {c.name}
                    </TableCell>
                    <TableCell className="text-right py-1.5">
                      <Badge className={`text-[10px] px-1.5 py-0 ${DOCKER_STATE_STYLES[c.state] ?? 'bg-text-muted/20 text-text-muted border-0'}`}>
                        {c.state}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </div>
  );
}

function ProcessSection({ serverId, enabled, onReady }: { serverId: string; enabled: boolean; onReady: () => void }) {
  const { data, loading } = usePolling<ProcessResponse>(
    `/api/servers/${serverId}/processes`,
    5000,
    enabled
  );
  const firedRef = useRef(false);

  useEffect(() => {
    if (data && !firedRef.current) {
      firedRef.current = true;
      onReady();
    }
  }, [data, onReady]);

  const processes = data?.processes ?? [];
  const ramUnit = data?.ramUnit ?? '%';
  const top5 = [...processes].sort((a, b) => b.cpu - a.cpu).slice(0, 5);

  return (
    <div className="bg-bg-surface border border-bg-elevated rounded-lg p-4">
      <div className="flex items-center gap-2 mb-3">
        <Cpu className="h-4 w-4 text-text-muted" />
        <h3 className="text-sm font-semibold text-text-primary">Top Processes</h3>
      </div>

      {!data && loading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-4 w-full bg-bg-elevated" />
          ))}
        </div>
      ) : top5.length === 0 ? (
        <div className="text-xs text-text-muted py-4 text-center">No process data</div>
      ) : (
        <>
          {/* Mobile card view */}
          <div className="sm:hidden space-y-1.5">
            {top5.map((proc) => (
              <div key={proc.pid} className="flex items-center justify-between border border-bg-elevated rounded-md px-2.5 py-1.5">
                <span className="text-xs text-text-secondary truncate mr-2">{proc.name}</span>
                <div className="flex gap-2 text-xs font-mono font-bold flex-shrink-0">
                  <span className={proc.cpu >= 80 ? 'text-status-critical' : proc.cpu >= 50 ? 'text-gold-primary' : 'text-text-secondary'}>
                    {proc.cpu.toFixed(1)}%
                  </span>
                  <span className={ramUnit === 'MB' ? (proc.ram >= 1024 ? 'text-gold-primary' : 'text-text-secondary') : (proc.ram >= 80 ? 'text-status-critical' : proc.ram >= 50 ? 'text-gold-primary' : 'text-text-secondary')}>
                    {ramUnit === 'MB' ? `${proc.ram.toLocaleString()}M` : `${proc.ram.toFixed(1)}%`}
                  </span>
                </div>
              </div>
            ))}
          </div>
          {/* Desktop table */}
          <div className="hidden sm:block">
            <Table>
              <TableHeader>
                <TableRow className="border-bg-elevated hover:bg-transparent">
                  <TableHead className="text-text-muted text-xs py-1">Name</TableHead>
                  <TableHead className="text-text-muted text-xs py-1 text-right">CPU%</TableHead>
                  <TableHead className="text-text-muted text-xs py-1 text-right">RAM</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {top5.map((proc) => (
                  <TableRow key={proc.pid} className="border-bg-elevated">
                    <TableCell className="text-xs text-text-secondary truncate max-w-[200px] py-1.5">
                      {proc.name}
                    </TableCell>
                    <TableCell
                      className={`font-mono text-xs font-bold text-right py-1.5 ${
                        proc.cpu >= 80
                          ? 'text-status-critical'
                          : proc.cpu >= 50
                            ? 'text-gold-primary'
                            : 'text-text-secondary'
                      }`}
                    >
                      {proc.cpu.toFixed(1)}%
                    </TableCell>
                    <TableCell
                      className={`font-mono text-xs font-bold text-right py-1.5 ${
                        ramUnit === 'MB'
                          ? proc.ram >= 1024
                            ? 'text-gold-primary'
                            : 'text-text-secondary'
                          : proc.ram >= 80
                            ? 'text-status-critical'
                            : proc.ram >= 50
                              ? 'text-gold-primary'
                              : 'text-text-secondary'
                      }`}
                    >
                      {ramUnit === 'MB' ? `${proc.ram.toLocaleString()} MB` : `${proc.ram.toFixed(1)}%`}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </div>
  );
}

function NetworkSection({ serverId }: { serverId: string }) {
  const { destinations, rxBps, txBps, loading, processes } = useWindowsNet(serverId);

  const totalConnections = processes.reduce((sum, p) => sum + p.connections, 0);
  const top5Dests = [...destinations].sort((a, b) => b.connections - a.connections).slice(0, 5);

  return (
    <div className="bg-bg-surface border border-bg-elevated rounded-lg p-4">
      <div className="flex items-center gap-2 mb-3">
        <Network className="h-4 w-4 text-text-muted" />
        <h3 className="text-sm font-semibold text-text-primary">Network</h3>
      </div>

      {loading && processes.length === 0 ? (
        <div className="space-y-2">
          <Skeleton className="h-4 w-full bg-bg-elevated" />
          <Skeleton className="h-4 w-3/4 bg-bg-elevated" />
          <Skeleton className="h-4 w-1/2 bg-bg-elevated" />
        </div>
      ) : (
        <>
          {/* Summary */}
          <div className="flex flex-wrap gap-4 mb-3">
            <div className="flex items-center gap-1.5">
              <Network className="h-3.5 w-3.5 text-text-muted" />
              <span className="text-xs text-text-muted">Conns:</span>
              <span className="font-mono text-sm font-bold text-text-primary">{totalConnections}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <ArrowDownToLine className="h-3.5 w-3.5 text-status-info" />
              <span className="font-mono text-xs font-bold text-status-info">{formatBps(rxBps)}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <ArrowUpFromLine className="h-3.5 w-3.5 text-status-healthy" />
              <span className="font-mono text-xs font-bold text-status-healthy">{formatBps(txBps)}</span>
            </div>
          </div>

          {/* Top 5 destinations */}
          {top5Dests.length > 0 && (
            <>
              {/* Mobile card view */}
              <div className="sm:hidden space-y-1.5">
                {top5Dests.map((dest) => (
                  <div key={dest.address} className="flex items-center justify-between border border-bg-elevated rounded-md px-2.5 py-1.5">
                    <div className="min-w-0 mr-2">
                      {dest.hostname && <div className="text-xs text-text-secondary truncate">{dest.hostname}</div>}
                      <div className="font-mono text-[11px] text-text-muted truncate">{dest.address}</div>
                    </div>
                    <span className="font-mono text-xs text-gold-primary font-bold flex-shrink-0">{dest.connections}</span>
                  </div>
                ))}
              </div>
              {/* Desktop table */}
              <div className="hidden sm:block">
                <Table>
                  <TableHeader>
                    <TableRow className="border-bg-elevated hover:bg-transparent">
                      <TableHead className="text-text-muted text-xs py-1">Destination</TableHead>
                      <TableHead className="text-text-muted text-xs py-1 text-right">Conns</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {top5Dests.map((dest) => (
                      <TableRow key={dest.address} className="border-bg-elevated">
                        <TableCell className="py-1.5">
                          <div className="flex flex-col">
                            {dest.hostname && (
                              <span className="text-xs text-text-secondary leading-tight">
                                {dest.hostname}
                              </span>
                            )}
                            <span className="font-mono text-[11px] text-text-muted leading-tight">
                              {dest.address}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="font-mono text-xs text-gold-primary font-bold text-right py-1.5">
                          {dest.connections}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

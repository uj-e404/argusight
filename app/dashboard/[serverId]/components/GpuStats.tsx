'use client';

import { Gpu, Thermometer, Zap } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { StatusBar } from './StatusProgress';
import { usePolling } from './usePolling';
import { Skeleton } from '@/components/ui/skeleton';
import type { GpuInfo, GpuProcessInfo } from '@/lib/types';

interface GpuResponse {
  gpu: GpuInfo | null;
  processes: GpuProcessInfo[];
  available: boolean;
  error?: string;
}

interface GpuStatsProps {
  serverId: string;
}

export function GpuStats({ serverId }: GpuStatsProps) {
  const { data, loading, error } = usePolling<GpuResponse>(
    `/api/servers/${serverId}/gpu`,
    5000,
    true
  );

  if (!data && !error) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-bg-surface border border-bg-elevated rounded-lg p-4">
            <Skeleton className="h-3 w-20 bg-bg-elevated mb-3" />
            <Skeleton className="h-8 w-16 bg-bg-elevated mb-2" />
            <Skeleton className="h-2 w-full bg-bg-elevated" />
          </div>
        ))}
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="bg-bg-surface border border-bg-elevated rounded-lg p-6">
        <div className="flex items-center justify-center h-40 text-status-critical text-sm">
          {error}
        </div>
      </div>
    );
  }

  if (!data?.available || !data?.gpu) {
    return (
      <div className="bg-bg-surface border border-bg-elevated rounded-lg p-6">
        <div className="flex flex-col items-center justify-center h-40 gap-2">
          <Gpu className="h-8 w-8 text-text-muted" />
          <span className="text-text-muted text-sm">
            {data?.error || 'nvidia-smi not available on this server'}
          </span>
        </div>
      </div>
    );
  }

  const { gpu, processes } = data;
  const tempColor =
    gpu.temperature >= 80
      ? 'text-status-critical'
      : gpu.temperature >= 60
        ? 'text-gold-primary'
        : 'text-status-healthy';

  return (
    <div className="space-y-4">
      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* GPU Utilization */}
        <div className="bg-bg-surface border border-bg-elevated rounded-lg p-4">
          <div className="text-[11px] text-text-muted uppercase tracking-wider mb-2">GPU Usage</div>
          <div className="font-mono text-2xl font-bold text-status-info mb-2">
            {gpu.gpuUtil}%
          </div>
          <StatusBar value={gpu.gpuUtil} warn={70} critical={90} />
        </div>

        {/* VRAM */}
        <div className="bg-bg-surface border border-bg-elevated rounded-lg p-4">
          <div className="text-[11px] text-text-muted uppercase tracking-wider mb-2">VRAM</div>
          <div className="font-mono text-2xl font-bold text-gold-primary mb-1">
            {gpu.memUtil}%
          </div>
          <div className="font-mono text-[11px] text-text-muted mb-2">
            {gpu.memUsed} / {gpu.memTotal} MiB
          </div>
          <StatusBar value={gpu.memUtil} warn={70} critical={90} />
        </div>

        {/* Temperature */}
        <div className="bg-bg-surface border border-bg-elevated rounded-lg p-4">
          <div className="flex items-center gap-1 text-[11px] text-text-muted uppercase tracking-wider mb-2">
            <Thermometer className="h-3 w-3" />
            Temperature
          </div>
          <div className={`font-mono text-2xl font-bold ${tempColor}`}>
            {gpu.temperature}°C
          </div>
        </div>

        {/* Power */}
        <div className="bg-bg-surface border border-bg-elevated rounded-lg p-4">
          <div className="flex items-center gap-1 text-[11px] text-text-muted uppercase tracking-wider mb-2">
            <Zap className="h-3 w-3" />
            Power Draw
          </div>
          <div className="font-mono text-2xl font-bold text-text-primary">
            {gpu.powerDraw}W
          </div>
        </div>
      </div>

      {/* GPU Processes */}
      {processes.length > 0 && (
        <div className="bg-bg-surface border border-bg-elevated rounded-lg p-4">
          <h3 className="text-sm font-semibold text-text-primary mb-3">GPU Processes</h3>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-bg-elevated hover:bg-transparent">
                  <TableHead className="text-text-muted text-xs">PID</TableHead>
                  <TableHead className="text-text-muted text-xs">Process</TableHead>
                  <TableHead className="text-text-muted text-xs text-right">VRAM (MiB)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {processes.map((proc) => (
                  <TableRow key={proc.pid} className="border-bg-elevated">
                    <TableCell className="font-mono text-xs text-text-secondary">
                      {proc.pid}
                    </TableCell>
                    <TableCell className="text-xs text-text-secondary truncate max-w-[300px]">
                      {proc.name}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-text-secondary text-right">
                      {proc.memoryUsed !== null ? proc.memoryUsed : 'N/A'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </div>
  );
}

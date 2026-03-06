'use client';

import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
import type { DiskInfo, DiskSmartStatus } from '@/lib/types';

interface DiskResponse {
  disks: DiskInfo[];
  smart: DiskSmartStatus[];
  cached: boolean;
  cachedAt?: string;
}

interface DiskTableProps {
  serverId: string;
}

export function DiskTable({ serverId }: DiskTableProps) {
  const { data, loading, error, refresh, lastUpdated } = usePolling<DiskResponse>(
    `/api/servers/${serverId}/disks`,
    0, // manual refresh only
    true
  );

  const disks = data?.disks ?? [];
  const smart = data?.smart ?? [];

  const getSmartStatus = (filesystem: string) => {
    return smart.find((s) => filesystem.includes(s.device.replace('/dev/', '')));
  };

  if (!data && !error) {
    return (
      <div className="bg-bg-surface border border-bg-elevated rounded-lg p-6">
        <div className="flex items-center justify-center h-40 text-text-muted text-sm">
          Loading disk information...
        </div>
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

  return (
    <div className="bg-bg-surface border border-bg-elevated rounded-lg p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-text-primary">Disk Partitions</h3>
          {lastUpdated && (
            <span className="text-[11px] text-text-muted font-mono">
              {data?.cached ? 'Cached' : 'Updated'} {lastUpdated.toLocaleTimeString()}
            </span>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => refresh()}
          disabled={loading}
          className="text-text-muted hover:text-text-primary"
        >
          <RefreshCw className={`h-4 w-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {disks.length === 0 ? (
        <div className="text-center text-text-muted text-sm py-8">
          No disk partitions found
        </div>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-bg-elevated hover:bg-transparent">
                <TableHead className="text-text-muted text-xs">Filesystem</TableHead>
                <TableHead className="text-text-muted text-xs">Type</TableHead>
                <TableHead className="text-text-muted text-xs">Size</TableHead>
                <TableHead className="text-text-muted text-xs">Used</TableHead>
                <TableHead className="text-text-muted text-xs">Available</TableHead>
                <TableHead className="text-text-muted text-xs min-w-[180px]">Usage</TableHead>
                <TableHead className="text-text-muted text-xs">Mount</TableHead>
                {smart.length > 0 && (
                  <TableHead className="text-text-muted text-xs">Health</TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {disks.map((disk, i) => {
                const smartStatus = getSmartStatus(disk.filesystem);
                const isWarning = disk.usePercent >= 80;
                return (
                  <TableRow
                    key={`${disk.filesystem}-${i}`}
                    className={`border-bg-elevated ${isWarning ? 'bg-status-critical/5' : ''}`}
                  >
                    <TableCell className="font-mono text-xs text-text-secondary">
                      {disk.filesystem}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-text-muted">
                      {disk.fstype || '-'}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-text-secondary">
                      {disk.size}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-text-secondary">
                      {disk.used}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-text-secondary">
                      {disk.available}
                    </TableCell>
                    <TableCell>
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
                    <TableCell className="font-mono text-xs text-text-muted">
                      {disk.mountpoint}
                    </TableCell>
                    {smart.length > 0 && (
                      <TableCell>
                        {smartStatus ? (
                          <Badge
                            variant={smartStatus.healthy ? 'default' : 'destructive'}
                            className={
                              smartStatus.healthy
                                ? 'bg-status-healthy/20 text-status-healthy border-0 text-[10px]'
                                : 'text-[10px]'
                            }
                          >
                            {smartStatus.status}
                          </Badge>
                        ) : (
                          <span className="text-[10px] text-text-muted">-</span>
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

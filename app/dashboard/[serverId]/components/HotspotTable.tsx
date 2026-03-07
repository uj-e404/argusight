'use client';

import { useState, useMemo } from 'react';
import { UserX, Users, ArrowDownToLine, ArrowUpFromLine, ArrowUpDown } from 'lucide-react';
import { TableSkeleton } from '@/components/ui/table-skeleton';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useServerHotspot } from '@/hooks/useServerHotspot';
import { toast } from 'sonner';

interface HotspotTableProps {
  serverId: string;
}

type SortField = 'user' | 'rateIn' | 'rateOut' | 'uptime';
type SortDir = 'asc' | 'desc';

function formatBytes(bytes: number): string {
  if (bytes >= 1_073_741_824) return `${(bytes / 1_073_741_824).toFixed(2)} GB`;
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MB`;
  if (bytes >= 1_024) return `${(bytes / 1_024).toFixed(0)} KB`;
  return `${bytes} B`;
}

function formatRate(bytesPerSec: number): string {
  const bps = bytesPerSec * 8;
  if (bps >= 1_000_000_000) return `${(bps / 1_000_000_000).toFixed(2)} Gbps`;
  if (bps >= 1_000_000) return `${(bps / 1_000_000).toFixed(1)} Mbps`;
  if (bps >= 1_000) return `${(bps / 1_000).toFixed(1)} Kbps`;
  return `${Math.round(bps)} bps`;
}

function rateColor(bytesPerSec: number): string {
  const bps = bytesPerSec * 8;
  if (bps >= 10_000_000) return 'text-status-critical';   // >= 10 Mbps
  if (bps >= 1_000_000) return 'text-status-warning';     // >= 1 Mbps
  return 'text-status-healthy';
}

function rateBadgeColor(bytesPerSec: number): string {
  const bps = bytesPerSec * 8;
  if (bps >= 10_000_000) return 'bg-status-critical/20 text-status-critical';
  if (bps >= 1_000_000) return 'bg-status-warning/20 text-status-warning';
  return 'bg-status-healthy/20 text-status-healthy';
}

export function HotspotTable({ serverId }: HotspotTableProps) {
  const { users, totalBytesIn, totalBytesOut, totalRateIn, totalRateOut, loading } = useServerHotspot(serverId);
  const [kicking, setKicking] = useState<string | null>(null);
  const [showKickAll, setShowKickAll] = useState(false);
  const [sortField, setSortField] = useState<SortField>('rateIn');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const sortedUsers = useMemo(() => {
    const list = [...users];
    list.sort((a, b) => {
      let aVal: string | number;
      let bVal: string | number;
      if (sortField === 'user') {
        aVal = a.user || '';
        bVal = b.user || '';
      } else if (sortField === 'uptime') {
        aVal = a.uptime || '';
        bVal = b.uptime || '';
      } else {
        aVal = a[sortField];
        bVal = b[sortField];
      }
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      return sortDir === 'asc' ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number);
    });
    return list;
  }, [users, sortField, sortDir]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  };

  const kickUser = async (user: string) => {
    setKicking(user);
    try {
      const res = await fetch(`/api/servers/${serverId}/hotspot`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user }),
      });
      if (res.ok) {
        toast.success(`Kicked ${user}`);
      } else {
        toast.error(`Failed to kick ${user}`);
      }
    } catch {
      toast.error(`Failed to kick ${user}`);
    } finally {
      setKicking(null);
    }
  };

  const kickAll = async () => {
    setShowKickAll(false);
    setKicking('__all__');
    try {
      const res = await fetch(`/api/servers/${serverId}/hotspot`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (res.ok) {
        toast.success('All users kicked');
      } else {
        toast.error('Failed to kick all users');
      }
    } catch {
      toast.error('Failed to kick all users');
    } finally {
      setKicking(null);
    }
  };

  if (loading && users.length === 0) {
    return <TableSkeleton columns={7} />;
  }

  return (
    <div className="space-y-4">
      {/* Summary Bar */}
      <div className="bg-bg-surface border border-bg-elevated rounded-lg p-4">
        <div className="flex items-center justify-between">
          <div className="flex gap-8">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-text-muted" />
              <span className="text-xs text-text-muted">Active Users</span>
              <span className="font-mono text-lg font-bold text-text-primary">{users.length}</span>
            </div>
            <div className="flex items-center gap-2">
              <ArrowDownToLine className="h-4 w-4 text-status-info" />
              <span className="text-xs text-text-muted">Download</span>
              <span className="font-mono text-sm font-bold text-status-info">{formatRate(totalRateIn)}</span>
            </div>
            <div className="flex items-center gap-2">
              <ArrowUpFromLine className="h-4 w-4 text-status-healthy" />
              <span className="text-xs text-text-muted">Upload</span>
              <span className="font-mono text-sm font-bold text-status-healthy">{formatRate(totalRateOut)}</span>
            </div>
          </div>
          <Button
            variant="destructive"
            size="sm"
            className="h-7 text-xs"
            onClick={() => setShowKickAll(true)}
            disabled={users.length === 0 || kicking !== null}
          >
            <UserX className="h-3 w-3 mr-1" />
            Kick All
          </Button>
        </div>
      </div>

      {/* User Pills Grid */}
      {users.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
          {users.map((user) => {
            const totalRate = user.rateIn + user.rateOut;
            return (
              <div
                key={user.user + user.macAddress}
                className="bg-bg-dark border border-bg-elevated rounded-lg px-3 py-2"
              >
                <div className="text-xs font-bold text-text-primary truncate">
                  {user.user || '-'}
                </div>
                <div className="text-[10px] font-mono text-text-muted truncate">
                  {user.address}
                </div>
                <span className={`inline-block mt-1 text-[10px] font-mono px-1.5 py-0.5 rounded ${rateBadgeColor(totalRate)}`}>
                  {formatRate(totalRate)}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Users Table */}
      <div className="bg-bg-surface border border-bg-elevated rounded-lg p-6">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-bg-elevated hover:bg-transparent">
                <SortHead field="user" sortField={sortField} onSort={toggleSort}>User</SortHead>
                <TableHead className="text-text-muted text-xs">IP Address</TableHead>
                <TableHead className="text-text-muted text-xs">MAC Address</TableHead>
                <SortHead field="uptime" sortField={sortField} onSort={toggleSort}>Uptime</SortHead>
                <SortHead field="rateIn" sortField={sortField} onSort={toggleSort}>Download</SortHead>
                <SortHead field="rateOut" sortField={sortField} onSort={toggleSort}>Upload</SortHead>
                <TableHead className="text-text-muted text-xs w-20">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedUsers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-text-muted text-sm py-8">
                    <div className="flex flex-col items-center">
                      <Users className="h-10 w-10 text-text-muted/30 mb-2" />
                      No active hotspot users
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                sortedUsers.map((user) => (
                  <TableRow key={user.user + user.macAddress} className="border-bg-elevated">
                    <TableCell className="text-xs text-text-secondary font-medium">
                      {user.user || '-'}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-text-muted">
                      {user.address}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-text-muted">
                      {user.macAddress}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-text-muted">
                      {user.uptime || '-'}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className={`font-mono text-xs ${rateColor(user.rateIn)}`}>
                          {formatRate(user.rateIn)}
                        </span>
                        <span className="font-mono text-[10px] text-text-muted leading-tight">
                          {formatBytes(user.bytesIn)}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className={`font-mono text-xs ${rateColor(user.rateOut)}`}>
                          {formatRate(user.rateOut)}
                        </span>
                        <span className="font-mono text-[10px] text-text-muted leading-tight">
                          {formatBytes(user.bytesOut)}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-xs text-status-critical hover:text-status-critical hover:bg-status-critical/10"
                        onClick={() => kickUser(user.user)}
                        disabled={kicking !== null}
                      >
                        <UserX className="h-3 w-3" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Kick All Confirmation Dialog */}
      <Dialog open={showKickAll} onOpenChange={setShowKickAll}>
        <DialogContent className="bg-bg-surface border-bg-elevated">
          <DialogHeader>
            <DialogTitle className="text-text-primary">Kick All Users</DialogTitle>
            <DialogDescription className="text-text-muted">
              This will disconnect all {users.length} active hotspot user(s). Are you sure?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowKickAll(false)} className="text-text-secondary">
              Cancel
            </Button>
            <Button variant="destructive" onClick={kickAll}>
              Kick All
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SortHead({
  field,
  sortField,
  onSort,
  children,
}: {
  field: SortField;
  sortField: SortField;
  onSort: (f: SortField) => void;
  children: React.ReactNode;
}) {
  return (
    <TableHead
      className="text-text-muted text-xs cursor-pointer select-none hover:text-text-primary"
      onClick={() => onSort(field)}
    >
      <span className="flex items-center gap-1">
        {children}
        <ArrowUpDown className={`h-3 w-3 ${sortField === field ? 'text-gold-primary' : ''}`} />
      </span>
    </TableHead>
  );
}

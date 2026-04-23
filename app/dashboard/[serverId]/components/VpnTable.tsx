'use client';

import { useState, useMemo } from 'react';
import { Search, ArrowUpDown, Shield, ShieldCheck, ShieldOff, ArrowDownToLine, ArrowUpFromLine, Users } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { TableSkeleton } from '@/components/ui/table-skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useServerVpn, type VpnPeerWithRate } from '@/hooks/useServerVpn';

interface VpnTableProps {
  serverId: string;
}

type SortField = 'name' | 'interface' | 'allowedAddress' | 'rx' | 'tx' | 'rateIn' | 'rateOut' | 'lastHandshakeSeconds' | 'online';
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
  if (bps >= 10_000_000) return 'text-status-critical';
  if (bps >= 1_000_000) return 'text-status-warning';
  return 'text-status-healthy';
}

function formatHandshake(seconds: number, raw: string): string {
  if (seconds < 0 || !raw) return 'never';
  if (seconds < 60) return `${seconds}s ago`;
  return `${raw} ago`;
}

function handshakeColor(peer: VpnPeerWithRate): string {
  if (peer.disabled) return 'text-text-muted';
  if (peer.online) return 'text-status-healthy';
  if (peer.lastHandshakeSeconds < 0) return 'text-text-muted';
  if (peer.lastHandshakeSeconds < 900) return 'text-status-warning';
  return 'text-status-critical';
}

function StatusBadge({ peer }: { peer: VpnPeerWithRate }) {
  if (peer.disabled) {
    return (
      <Badge variant="outline" className="bg-text-muted/10 text-text-muted border-0 gap-1">
        <ShieldOff className="h-3 w-3" /> disabled
      </Badge>
    );
  }
  if (peer.online) {
    return (
      <Badge variant="outline" className="bg-status-healthy/20 text-status-healthy border-0 gap-1">
        <ShieldCheck className="h-3 w-3" /> online
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="bg-text-muted/10 text-text-muted border-0 gap-1">
      <Shield className="h-3 w-3" /> offline
    </Badge>
  );
}

export function VpnTable({ serverId }: VpnTableProps) {
  const { peers, totalRx, totalTx, totalRateIn, totalRateOut, onlineCount, loading, error } = useServerVpn(serverId, 5000);
  const [search, setSearch] = useState('');
  const [sortField, setSortField] = useState<SortField>('rateIn');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    const list = peers.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.interface.toLowerCase().includes(q) ||
        p.allowedAddress.includes(q) ||
        p.endpoint.toLowerCase().includes(q)
    );
    list.sort((a, b) => {
      let aVal: string | number | boolean;
      let bVal: string | number | boolean;
      if (sortField === 'lastHandshakeSeconds') {
        // Put "never" (-1) last when sorting by freshness
        aVal = a.lastHandshakeSeconds < 0 ? Number.MAX_SAFE_INTEGER : a.lastHandshakeSeconds;
        bVal = b.lastHandshakeSeconds < 0 ? Number.MAX_SAFE_INTEGER : b.lastHandshakeSeconds;
      } else if (sortField === 'rateIn' || sortField === 'rateOut') {
        aVal = a[sortField];
        bVal = b[sortField];
      } else if (sortField === 'online') {
        aVal = a.online ? 1 : 0;
        bVal = b.online ? 1 : 0;
      } else {
        aVal = a[sortField];
        bVal = b[sortField];
      }
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      return sortDir === 'asc' ? Number(aVal) - Number(bVal) : Number(bVal) - Number(aVal);
    });
    return list;
  }, [peers, search, sortField, sortDir]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  };

  if (loading && peers.length === 0) {
    return <TableSkeleton columns={6} />;
  }

  if (error && peers.length === 0) {
    return (
      <div className="bg-bg-surface border border-bg-elevated rounded-lg p-6 text-center text-status-critical text-sm">
        {error}
      </div>
    );
  }

  const SortHeader = ({ field, children }: { field: SortField; children: React.ReactNode }) => (
    <TableHead
      className="text-text-muted text-xs cursor-pointer select-none hover:text-text-primary"
      onClick={() => toggleSort(field)}
    >
      <span className="flex items-center gap-1">
        {children}
        <ArrowUpDown className={`h-3 w-3 ${sortField === field ? 'text-gold-primary' : ''}`} />
      </span>
    </TableHead>
  );

  return (
    <div className="space-y-4">
      {/* Summary Bar */}
      <div className="bg-bg-surface border border-bg-elevated rounded-lg p-4">
        <div className="flex flex-wrap gap-3 sm:gap-8">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-text-muted" />
            <span className="text-xs text-text-muted">Peers</span>
            <span className="font-mono text-lg font-bold text-text-primary">
              <span className="text-status-healthy">{onlineCount}</span>
              <span className="text-text-muted"> / {peers.length}</span>
            </span>
          </div>
          <div className="flex items-center gap-2">
            <ArrowDownToLine className="h-4 w-4 text-status-info" />
            <div className="flex flex-col leading-tight">
              <span className="font-mono text-sm font-bold text-status-info">{formatRate(totalRateIn)}</span>
              <span className="font-mono text-[10px] text-text-muted">{formatBytes(totalRx)} total</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <ArrowUpFromLine className="h-4 w-4 text-status-healthy" />
            <div className="flex flex-col leading-tight">
              <span className="font-mono text-sm font-bold text-status-healthy">{formatRate(totalRateOut)}</span>
              <span className="font-mono text-[10px] text-text-muted">{formatBytes(totalTx)} total</span>
            </div>
          </div>
        </div>
      </div>

      {/* Peer Table */}
      <div className="bg-bg-surface border border-bg-elevated rounded-lg p-3 sm:p-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-4">
          <h3 className="text-sm font-semibold text-text-primary">
            WireGuard Peers ({filtered.length})
          </h3>
          <div className="relative w-full sm:w-60">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-text-muted" />
            <Input
              placeholder="Search name, IP, or interface..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-8 text-xs bg-bg-dark border-bg-elevated"
            />
          </div>
        </div>

        {/* Mobile cards */}
        <div className="sm:hidden space-y-2">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center py-8 text-text-muted text-sm">
              <Shield className="h-10 w-10 text-text-muted/30 mb-2" />
              {search ? 'No matching peers' : 'No WireGuard peers configured'}
            </div>
          ) : (
            filtered.map((peer) => (
              <div key={peer.publicKey || peer.id} className="border border-bg-elevated rounded-md p-3 space-y-1.5">
                <div className="flex justify-between items-start gap-2">
                  <div className="min-w-0">
                    <div className="text-xs font-medium text-text-secondary truncate">
                      {peer.name || peer.publicKey.slice(0, 12) + '…'}
                    </div>
                    <div className="font-mono text-[11px] text-text-muted">{peer.allowedAddress || '-'}</div>
                  </div>
                  <StatusBadge peer={peer} />
                </div>
                <div className="font-mono text-[11px] text-text-muted truncate">
                  {peer.interface} → {peer.endpoint || '-'}
                </div>
                <div className="flex gap-4 text-xs font-mono">
                  <div className="flex flex-col leading-tight">
                    <span className={rateColor(peer.rateIn)}>DL: {formatRate(peer.rateIn)}</span>
                    <span className="text-[10px] text-text-muted">{formatBytes(peer.rx)}</span>
                  </div>
                  <div className="flex flex-col leading-tight">
                    <span className={rateColor(peer.rateOut)}>UL: {formatRate(peer.rateOut)}</span>
                    <span className="text-[10px] text-text-muted">{formatBytes(peer.tx)}</span>
                  </div>
                </div>
                <div className={`text-[11px] font-mono ${handshakeColor(peer)}`}>
                  Handshake: {formatHandshake(peer.lastHandshakeSeconds, peer.lastHandshake)}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Desktop table */}
        <div className="hidden sm:block overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-bg-elevated hover:bg-transparent">
                <SortHeader field="online">Status</SortHeader>
                <SortHeader field="name">Peer</SortHeader>
                <SortHeader field="allowedAddress">Allowed IP</SortHeader>
                <TableHead className="text-text-muted text-xs">Endpoint</TableHead>
                <SortHeader field="rateIn">Download</SortHeader>
                <SortHeader field="rateOut">Upload</SortHeader>
                <SortHeader field="lastHandshakeSeconds">Last Handshake</SortHeader>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-text-muted text-sm py-8">
                    <div className="flex flex-col items-center">
                      <Shield className="h-10 w-10 text-text-muted/30 mb-2" />
                      {search ? 'No matching peers' : 'No WireGuard peers configured'}
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((peer) => (
                  <TableRow key={peer.publicKey || peer.id} className="border-bg-elevated">
                    <TableCell><StatusBadge peer={peer} /></TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="text-xs font-medium text-text-secondary leading-tight truncate max-w-[220px]">
                          {peer.name || peer.publicKey.slice(0, 16) + '…'}
                        </span>
                        <span className="font-mono text-[10px] text-text-muted leading-tight">
                          {peer.interface}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-text-secondary">
                      {peer.allowedAddress || '-'}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-text-muted">
                      {peer.endpoint || '-'}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className={`font-mono text-xs ${rateColor(peer.rateIn)}`}>
                          {formatRate(peer.rateIn)}
                        </span>
                        <span className="font-mono text-[10px] text-text-muted leading-tight">
                          {formatBytes(peer.rx)}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className={`font-mono text-xs ${rateColor(peer.rateOut)}`}>
                          {formatRate(peer.rateOut)}
                        </span>
                        <span className="font-mono text-[10px] text-text-muted leading-tight">
                          {formatBytes(peer.tx)}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className={`font-mono text-xs ${handshakeColor(peer)}`}>
                      {formatHandshake(peer.lastHandshakeSeconds, peer.lastHandshake)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}

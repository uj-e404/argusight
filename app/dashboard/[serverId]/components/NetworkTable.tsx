'use client';

import { useState, useMemo } from 'react';
import { Search, ArrowUpDown, ChevronDown, ChevronRight, Network, ArrowDownToLine, ArrowUpFromLine } from 'lucide-react';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useServerNetwork } from '@/hooks/useServerNetwork';
import { TableSkeleton } from '@/components/ui/table-skeleton';
import type { NetworkClient } from '@/lib/types';

interface NetworkTableProps {
  serverId: string;
}

type SortField = 'hostname' | 'ip' | 'rateIn' | 'rateOut' | 'connections';
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

export function NetworkTable({ serverId }: NetworkTableProps) {
  const { clients, loading } = useServerNetwork(serverId);
  const [search, setSearch] = useState('');
  const [sortField, setSortField] = useState<SortField>('rateIn');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    const list = clients.filter(
      (c) =>
        c.label.toLowerCase().includes(q) ||
        c.hostname.toLowerCase().includes(q) ||
        c.ip.includes(q) ||
        c.mac.toLowerCase().includes(q)
    );
    list.sort((a, b) => {
      let aVal: string | number;
      let bVal: string | number;
      if (sortField === 'hostname') {
        aVal = a.label || a.hostname || a.ip;
        bVal = b.label || b.hostname || b.ip;
      } else if (sortField === 'ip') {
        aVal = a.ip.split('.').reduce((acc, oct) => acc * 256 + parseInt(oct), 0);
        bVal = b.ip.split('.').reduce((acc, oct) => acc * 256 + parseInt(oct), 0);
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
  }, [clients, search, sortField, sortDir]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  };

  const toggleExpand = (ip: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(ip)) next.delete(ip);
      else next.add(ip);
      return next;
    });
  };

  // Summary totals (rates)
  const totalRateIn = clients.reduce((sum, c) => sum + c.rateIn, 0);
  const totalRateOut = clients.reduce((sum, c) => sum + c.rateOut, 0);

  if (loading && clients.length === 0) {
    return <TableSkeleton columns={6} />;
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
        <div className="flex gap-8">
          <div className="flex items-center gap-2">
            <Network className="h-4 w-4 text-text-muted" />
            <span className="text-xs text-text-muted">Clients</span>
            <span className="font-mono text-lg font-bold text-text-primary">{clients.length}</span>
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
      </div>

      {/* Client Table */}
      <div className="bg-bg-surface border border-bg-elevated rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-text-primary">
            Network Clients ({filtered.length})
          </h3>
          <div className="relative w-60">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-text-muted" />
            <Input
              placeholder="Search hostname, IP, or MAC..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-8 text-xs bg-bg-dark border-bg-elevated"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-bg-elevated hover:bg-transparent">
                <TableHead className="text-text-muted text-xs w-8" />
                <SortHeader field="hostname">Name / IP</SortHeader>
                <TableHead className="text-text-muted text-xs">MAC</TableHead>
                <SortHeader field="rateIn">Download</SortHeader>
                <SortHeader field="rateOut">Upload</SortHeader>
                <SortHeader field="connections">Destinations</SortHeader>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-text-muted text-sm py-8">
                    <div className="flex flex-col items-center">
                      <Network className="h-10 w-10 text-text-muted/30 mb-2" />
                      {search ? 'No matching clients' : 'No network data available'}
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((client) => (
                  <ClientRow
                    key={client.ip}
                    client={client}
                    isExpanded={expanded.has(client.ip)}
                    onToggle={() => toggleExpand(client.ip)}
                  />
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}

function ClientRow({
  client,
  isExpanded,
  onToggle,
}: {
  client: NetworkClient;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const hasDestinations = client.topDestinations.length > 0;

  return (
    <>
      <TableRow
        className={`border-bg-elevated ${hasDestinations ? 'cursor-pointer' : ''}`}
        onClick={hasDestinations ? onToggle : undefined}
      >
        <TableCell className="w-8 px-2">
          {hasDestinations && (
            isExpanded
              ? <ChevronDown className="h-3.5 w-3.5 text-text-muted" />
              : <ChevronRight className="h-3.5 w-3.5 text-text-muted" />
          )}
        </TableCell>
        <TableCell>
          <div className="flex flex-col">
            {(client.label || client.hostname) && (
              <span className="text-xs font-medium text-text-secondary leading-tight">
                {client.label || client.hostname}
              </span>
            )}
            <span className="font-mono text-[11px] text-text-muted leading-tight">
              {client.ip}
            </span>
          </div>
        </TableCell>
        <TableCell className="font-mono text-xs text-text-muted">
          {client.mac || '-'}
        </TableCell>
        <TableCell>
          <div className="flex flex-col">
            <span className={`font-mono text-xs ${rateColor(client.rateIn)}`}>
              {formatRate(client.rateIn)}
            </span>
            <span className="font-mono text-[10px] text-text-muted leading-tight">
              {formatBytes(client.bytesIn)}
            </span>
          </div>
        </TableCell>
        <TableCell>
          <div className="flex flex-col">
            <span className={`font-mono text-xs ${rateColor(client.rateOut)}`}>
              {formatRate(client.rateOut)}
            </span>
            <span className="font-mono text-[10px] text-text-muted leading-tight">
              {formatBytes(client.bytesOut)}
            </span>
          </div>
        </TableCell>
        <TableCell className="font-mono text-xs text-gold-primary font-bold">
          {client.connections.toLocaleString()}
        </TableCell>
      </TableRow>
      {isExpanded && client.topDestinations.map((dest) => (
        <TableRow key={`${client.ip}-${dest.ip}`} className="border-bg-elevated bg-bg-dark/50">
          <TableCell />
          <TableCell colSpan={2} className="pl-8">
            <div className="flex flex-col">
              {dest.domain && (
                <span className="text-[11px] font-medium text-text-secondary leading-tight truncate max-w-[240px]">
                  {dest.domain}
                </span>
              )}
              <span className="font-mono text-[11px] text-text-muted leading-tight">{dest.ip}</span>
            </div>
          </TableCell>
          <TableCell colSpan={2} />
          <TableCell className="font-mono text-[11px] text-text-muted">
            {formatBytes(dest.connections)}
          </TableCell>
        </TableRow>
      ))}
    </>
  );
}

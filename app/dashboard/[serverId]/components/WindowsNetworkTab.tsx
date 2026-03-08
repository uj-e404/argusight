'use client';

import { useState, useMemo } from 'react';
import { Search, ArrowUpDown, Network, Globe, AppWindow, ArrowDownToLine, ArrowUpFromLine } from 'lucide-react';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useWindowsNet } from '@/hooks/useWindowsNet';
import { TableSkeleton } from '@/components/ui/table-skeleton';
import type { WindowsNetProcess, WindowsNetDestination } from '@/lib/types';

interface WindowsNetworkTabProps {
  serverId: string;
}

type ProcessSortField = 'name' | 'connections' | 'pid';
type DestSortField = 'address' | 'connections' | 'port';
type SortDir = 'asc' | 'desc';

function formatRate(bps: number): string {
  if (bps >= 1_000_000_000) return `${(bps / 1_000_000_000).toFixed(2)} Gbps`;
  if (bps >= 1_000_000) return `${(bps / 1_000_000).toFixed(1)} Mbps`;
  if (bps >= 1_000) return `${(bps / 1_000).toFixed(1)} Kbps`;
  return `${Math.round(bps)} bps`;
}

export function WindowsNetworkTab({ serverId }: WindowsNetworkTabProps) {
  const { processes, destinations, rxBps, txBps, loading } = useWindowsNet(serverId);

  const totalConnections = processes.reduce((sum, p) => sum + p.connections, 0);

  return (
    <div className="space-y-6">
      {/* Summary Bar */}
      <div className="bg-bg-surface border border-bg-elevated rounded-lg p-4">
        <div className="flex gap-8">
          <div className="flex items-center gap-2">
            <Network className="h-4 w-4 text-text-muted" />
            <span className="text-xs text-text-muted">Connections</span>
            <span className="font-mono text-lg font-bold text-text-primary">{totalConnections}</span>
          </div>
          <div className="flex items-center gap-2">
            <ArrowDownToLine className="h-4 w-4 text-status-info" />
            <span className="text-xs text-text-muted">Download</span>
            <span className="font-mono text-sm font-bold text-status-info">{formatRate(rxBps)}</span>
          </div>
          <div className="flex items-center gap-2">
            <ArrowUpFromLine className="h-4 w-4 text-status-healthy" />
            <span className="text-xs text-text-muted">Upload</span>
            <span className="font-mono text-sm font-bold text-status-healthy">{formatRate(txBps)}</span>
          </div>
        </div>
      </div>

      <ProcessSection processes={processes} loading={loading} />
      <DestinationSection destinations={destinations} loading={loading} />
    </div>
  );
}

function ProcessSection({ processes, loading }: { processes: WindowsNetProcess[]; loading: boolean }) {
  const [search, setSearch] = useState('');
  const [sortField, setSortField] = useState<ProcessSortField>('connections');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    const list = processes.filter(
      (p) => p.name.toLowerCase().includes(q) || String(p.pid).includes(q)
    );
    list.sort((a, b) => {
      const aVal = sortField === 'name' ? a.name.toLowerCase() : a[sortField];
      const bVal = sortField === 'name' ? b.name.toLowerCase() : b[sortField];
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      return sortDir === 'asc' ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number);
    });
    return list;
  }, [processes, search, sortField, sortDir]);

  const toggleSort = (field: ProcessSortField) => {
    if (sortField === field) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortField(field); setSortDir('desc'); }
  };

  if (loading && processes.length === 0) {
    return <TableSkeleton columns={4} />;
  }

  const SortHeader = ({ field, children }: { field: ProcessSortField; children: React.ReactNode }) => (
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
    <div className="bg-bg-surface border border-bg-elevated rounded-lg p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <AppWindow className="h-4 w-4 text-text-muted" />
          <h3 className="text-sm font-semibold text-text-primary">
            Top Network Processes ({filtered.length})
          </h3>
        </div>
        <div className="relative w-60">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-text-muted" />
          <Input
            placeholder="Search process or PID..."
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
              <TableHead className="text-text-muted text-xs w-12">#</TableHead>
              <SortHeader field="name">Process</SortHeader>
              <SortHeader field="pid">PID</SortHeader>
              <SortHeader field="connections">Connections</SortHeader>
              <TableHead className="text-text-muted text-xs">Remote Addresses</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-text-muted text-sm py-8">
                  <div className="flex flex-col items-center">
                    <AppWindow className="h-10 w-10 text-text-muted/30 mb-2" />
                    {search ? 'No matching processes' : 'No process data available'}
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((proc, i) => (
                <TableRow key={proc.pid} className="border-bg-elevated">
                  <TableCell className="font-mono text-xs text-text-muted">{i + 1}</TableCell>
                  <TableCell className="text-xs font-medium text-text-primary">{proc.name}</TableCell>
                  <TableCell className="font-mono text-xs text-text-muted">{proc.pid}</TableCell>
                  <TableCell className="font-mono text-xs text-gold-primary font-bold">{proc.connections}</TableCell>
                  <TableCell className="font-mono text-[11px] text-text-muted max-w-[300px] truncate">
                    {proc.remoteAddresses.slice(0, 5).join(', ')}
                    {proc.remoteAddresses.length > 5 && ` +${proc.remoteAddresses.length - 5}`}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function DestinationSection({ destinations, loading }: { destinations: WindowsNetDestination[]; loading: boolean }) {
  const [search, setSearch] = useState('');
  const [sortField, setSortField] = useState<DestSortField>('connections');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    const list = destinations.filter(
      (d) =>
        d.address.includes(q) ||
        (d.hostname?.toLowerCase().includes(q)) ||
        d.processes.some((p) => p.toLowerCase().includes(q))
    );
    list.sort((a, b) => {
      if (sortField === 'address') {
        const aVal = (a.hostname || a.address).toLowerCase();
        const bVal = (b.hostname || b.address).toLowerCase();
        return sortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      const aVal = a[sortField];
      const bVal = b[sortField];
      return sortDir === 'asc' ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number);
    });
    return list;
  }, [destinations, search, sortField, sortDir]);

  const toggleSort = (field: DestSortField) => {
    if (sortField === field) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortField(field); setSortDir('desc'); }
  };

  if (loading && destinations.length === 0) {
    return <TableSkeleton columns={4} />;
  }

  const SortHeader = ({ field, children }: { field: DestSortField; children: React.ReactNode }) => (
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
    <div className="bg-bg-surface border border-bg-elevated rounded-lg p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Globe className="h-4 w-4 text-text-muted" />
          <h3 className="text-sm font-semibold text-text-primary">
            Live Destinations ({filtered.length})
          </h3>
        </div>
        <div className="relative w-60">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-text-muted" />
          <Input
            placeholder="Search IP, hostname, or process..."
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
              <SortHeader field="address">Destination</SortHeader>
              <SortHeader field="port">Port</SortHeader>
              <SortHeader field="connections">Connections</SortHeader>
              <TableHead className="text-text-muted text-xs">Processes</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-text-muted text-sm py-8">
                  <div className="flex flex-col items-center">
                    <Globe className="h-10 w-10 text-text-muted/30 mb-2" />
                    {search ? 'No matching destinations' : 'No destination data available'}
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((dest) => (
                <TableRow key={dest.address} className="border-bg-elevated">
                  <TableCell>
                    <div className="flex flex-col">
                      {dest.hostname && (
                        <span className="text-xs font-medium text-text-secondary leading-tight">
                          {dest.hostname}
                        </span>
                      )}
                      <span className="font-mono text-[11px] text-text-muted leading-tight">
                        {dest.address}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-xs text-text-muted">{dest.port}</TableCell>
                  <TableCell className="font-mono text-xs text-gold-primary font-bold">{dest.connections}</TableCell>
                  <TableCell className="text-xs text-text-muted max-w-[250px] truncate">
                    {dest.processes.join(', ')}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

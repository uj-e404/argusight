'use client';

import { useState, useMemo } from 'react';
import { Search, ArrowUpDown, Globe } from 'lucide-react';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import { usePolling } from './usePolling';
import { TableSkeleton } from '@/components/ui/table-skeleton';
import type { DomainTrafficEntry } from '@/lib/types';

interface DomainTableProps {
  serverId: string;
}

type SortField = 'name' | 'address' | 'connections';
type SortDir = 'asc' | 'desc';

export function DomainTable({ serverId }: DomainTableProps) {
  const { data, loading, error } = usePolling<{ domains: DomainTrafficEntry[] }>(
    `/api/servers/${serverId}/domains`,
    10000
  );

  const [search, setSearch] = useState('');
  const [sortField, setSortField] = useState<SortField>('connections');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const domains = data?.domains ?? [];

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    const list = domains.filter(
      (d) =>
        d.name.toLowerCase().includes(q) ||
        d.address.includes(q)
    );
    list.sort((a, b) => {
      const aVal = a[sortField];
      const bVal = b[sortField];
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      return sortDir === 'asc' ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number);
    });
    return list;
  }, [domains, search, sortField, sortDir]);

  const top20 = useMemo(() => {
    return [...domains]
      .sort((a, b) => b.connections - a.connections)
      .slice(0, 20)
      .map((d) => ({
        name: d.name.length > 25 ? d.name.slice(0, 22) + '...' : d.name,
        connections: d.connections,
      }));
  }, [domains]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  };

  if (!data && !error) {
    return <TableSkeleton columns={3} />;
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
      {/* Top 20 Bar Chart */}
      {top20.length > 0 && (
        <div className="bg-bg-surface border border-bg-elevated rounded-lg p-6">
          <h3 className="text-sm font-semibold text-text-primary mb-4">
            Top Domains by Connections
          </h3>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={top20} layout="vertical" margin={{ left: 120 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2A2A3C" />
                <XAxis type="number" stroke="#6B6B7B" fontSize={10} tickLine={false} />
                <YAxis
                  type="category"
                  dataKey="name"
                  stroke="#6B6B7B"
                  fontSize={10}
                  tickLine={false}
                  width={110}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#1E1E2E',
                    border: '1px solid #2A2A3C',
                    borderRadius: '8px',
                    fontSize: '12px',
                  }}
                  labelStyle={{ color: '#9E9EA8' }}
                />
                <Bar dataKey="connections" fill="#D4A853" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Domain Table */}
      <div className="bg-bg-surface border border-bg-elevated rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-text-primary">
            Domains ({filtered.length})
          </h3>
          <div className="relative w-60">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-text-muted" />
            <Input
              placeholder="Search domain or address..."
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
                <SortHeader field="name">Domain</SortHeader>
                <SortHeader field="address">Address</SortHeader>
                <SortHeader field="connections">Connections</SortHeader>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="text-center text-text-muted text-sm py-8">
                    <div className="flex flex-col items-center">
                      <Globe className="h-10 w-10 text-text-muted/30 mb-2" />
                      {search ? 'No matching domains' : 'No domain data available'}
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((domain, idx) => (
                  <TableRow key={`${domain.address}-${idx}`} className="border-bg-elevated">
                    <TableCell className="text-xs text-text-secondary truncate max-w-[300px]">
                      {domain.name}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-text-muted">
                      {domain.address}
                    </TableCell>
                    <TableCell className="font-mono text-xs font-bold text-gold-primary">
                      {domain.connections.toLocaleString()}
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

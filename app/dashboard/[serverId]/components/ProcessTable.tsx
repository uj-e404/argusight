'use client';

import { useState, useMemo } from 'react';
import { Search, ArrowUpDown, Cpu, X, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { usePolling } from './usePolling';
import { TableSkeleton } from '@/components/ui/table-skeleton';
import { toast } from 'sonner';
import type { ProcessInfo } from '@/lib/types';

interface ProcessResponse {
  processes: ProcessInfo[];
  ramUnit?: 'MB' | '%';
}

interface ProcessTableProps {
  serverId: string;
  serverType: 'linux' | 'windows' | 'mikrotik';
}

type SortField = 'pid' | 'user' | 'name' | 'cpu' | 'ram';
type SortDir = 'asc' | 'desc';

export function ProcessTable({ serverId, serverType }: ProcessTableProps) {
  const { data, loading, error } = usePolling<ProcessResponse>(
    `/api/servers/${serverId}/processes`,
    5000,
    true
  );

  const [search, setSearch] = useState('');
  const [sortField, setSortField] = useState<SortField>('cpu');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [killingPid, setKillingPid] = useState<number | null>(null);
  const [confirmKill, setConfirmKill] = useState<{ pid: number; name: string } | null>(null);
  const processes = data?.processes ?? [];
  const ramUnit = data?.ramUnit ?? '%';

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    let list = processes.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.user.toLowerCase().includes(q) ||
        String(p.pid).includes(q)
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
  }, [processes, search, sortField, sortDir]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  };

  const killProcess = async (pid: number, name: string) => {
    setKillingPid(pid);
    try {
      const res = await fetch(`/api/servers/${serverId}/processes/${pid}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        toast.success(`Killed process ${name} (PID ${pid})`);
      } else {
        const data = await res.json().catch(() => null);
        toast.error(data?.error || `Failed to kill process ${name}`);
      }
    } catch {
      toast.error(`Failed to kill process ${name}`);
    } finally {
      setKillingPid(null);
    }
  };

  if (serverType === 'mikrotik') {
    return (
      <div className="bg-bg-surface border border-bg-elevated rounded-lg p-6">
        <div className="flex items-center justify-center h-40 text-text-muted text-sm">
          Process list is not available for MikroTik devices
        </div>
      </div>
    );
  }

  if (!data && !error) {
    return <TableSkeleton columns={6} />;
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
    <div className="bg-bg-surface border border-bg-elevated rounded-lg p-3 sm:p-6">
      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-4">
        <h3 className="text-sm font-semibold text-text-primary">
          Processes ({filtered.length})
        </h3>
        <div className="relative w-full sm:w-60">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-text-muted" />
          <Input
            placeholder="Search by name, user, PID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-8 text-xs bg-bg-dark border-bg-elevated"
          />
        </div>
      </div>

      {/* Mobile card view */}
      <div className="sm:hidden space-y-2">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center py-8 text-text-muted text-sm">
            <Cpu className="h-10 w-10 text-text-muted/30 mb-2" />
            {search ? 'No matching processes' : 'No processes found'}
          </div>
        ) : (
          filtered.map((proc) => (
            <div key={proc.pid} className="border border-bg-elevated rounded-md p-3 space-y-1.5">
              <div className="flex justify-between items-center">
                <span className="text-xs font-medium text-text-secondary truncate mr-2">{proc.name}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0 flex-shrink-0 text-status-critical hover:text-status-critical hover:bg-status-critical/10"
                  onClick={() => setConfirmKill({ pid: proc.pid, name: proc.name })}
                  disabled={killingPid !== null}
                >
                  {killingPid === proc.pid ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <X className="h-3 w-3" />
                  )}
                </Button>
              </div>
              <div className="flex gap-3 text-[11px] font-mono text-text-muted">
                <span>PID: {proc.pid}</span>
                <span>{proc.user || '-'}</span>
              </div>
              <div className="flex gap-4 text-xs font-mono">
                <span className={`font-bold ${proc.cpu >= 80 ? 'text-status-critical' : proc.cpu >= 50 ? 'text-gold-primary' : 'text-text-secondary'}`}>
                  CPU: {proc.cpu.toFixed(1)}%
                </span>
                <span className={`font-bold ${ramUnit === 'MB' ? (proc.ram >= 1024 ? 'text-gold-primary' : 'text-text-secondary') : (proc.ram >= 80 ? 'text-status-critical' : proc.ram >= 50 ? 'text-gold-primary' : 'text-text-secondary')}`}>
                  RAM: {ramUnit === 'MB' ? `${proc.ram.toLocaleString()} MB` : `${proc.ram.toFixed(1)}%`}
                </span>
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
              <SortHeader field="pid">PID</SortHeader>
              <SortHeader field="user">User</SortHeader>
              <SortHeader field="name">Name</SortHeader>
              <SortHeader field="cpu">CPU%</SortHeader>
              <SortHeader field="ram">{ramUnit === 'MB' ? 'RAM (MB)' : 'RAM%'}</SortHeader>
              <TableHead className="text-text-muted text-xs w-16">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-text-muted text-sm py-8">
                  <div className="flex flex-col items-center">
                    <Cpu className="h-10 w-10 text-text-muted/30 mb-2" />
                    {search ? 'No matching processes' : 'No processes found'}
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((proc) => (
                <TableRow key={proc.pid} className="border-bg-elevated">
                  <TableCell className="font-mono text-xs text-text-muted">
                    {proc.pid}
                  </TableCell>
                  <TableCell className="text-xs text-text-muted">
                    {proc.user || '-'}
                  </TableCell>
                  <TableCell className="text-xs text-text-secondary truncate max-w-[300px]">
                    {proc.name}
                  </TableCell>
                  <TableCell
                    className={`font-mono text-xs font-bold ${
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
                    className={`font-mono text-xs font-bold ${
                      ramUnit === 'MB'
                        ? (proc.ram >= 1024 ? 'text-gold-primary' : 'text-text-secondary')
                        : (proc.ram >= 80
                          ? 'text-status-critical'
                          : proc.ram >= 50
                            ? 'text-gold-primary'
                            : 'text-text-secondary')
                    }`}
                  >
                    {ramUnit === 'MB' ? `${proc.ram.toLocaleString()} MB` : `${proc.ram.toFixed(1)}%`}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0 text-status-critical hover:text-status-critical hover:bg-status-critical/10"
                      onClick={() => setConfirmKill({ pid: proc.pid, name: proc.name })}
                      disabled={killingPid !== null}
                    >
                      {killingPid === proc.pid ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <X className="h-3 w-3" />
                      )}
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Kill Confirmation Dialog */}
      <AlertDialog open={confirmKill !== null} onOpenChange={(open) => !open && setConfirmKill(null)}>
        <AlertDialogContent className="bg-bg-surface border-bg-elevated">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-text-primary">Kill Process</AlertDialogTitle>
            <AlertDialogDescription className="text-text-muted">
              Are you sure you want to kill <span className="font-semibold text-text-secondary">{confirmKill?.name}</span> (PID {confirmKill?.pid})?
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="text-text-secondary">Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (confirmKill) {
                  killProcess(confirmKill.pid, confirmKill.name);
                  setConfirmKill(null);
                }
              }}
            >
              Kill Process
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

'use client';

import { Container } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { usePolling } from './usePolling';
import { TableSkeleton } from '@/components/ui/table-skeleton';
import type { DockerContainer } from '@/lib/types';

interface DockerResponse {
  containers: DockerContainer[];
  dockerAvailable: boolean;
  error?: string;
}

interface DockerTableProps {
  serverId: string;
}

const STATE_STYLES: Record<string, string> = {
  running: 'bg-status-healthy/20 text-status-healthy border-0',
  exited: 'bg-status-critical/20 text-status-critical border-0',
  paused: 'bg-gold-primary/20 text-gold-primary border-0',
  restarting: 'bg-status-info/20 text-status-info border-0',
  created: 'bg-text-muted/20 text-text-muted border-0',
};

export function DockerTable({ serverId }: DockerTableProps) {
  const { data, error } = usePolling<DockerResponse>(
    `/api/servers/${serverId}/docker`,
    15000,
    true
  );

  const containers = data?.containers ?? [];

  if (!data && !error) {
    return <TableSkeleton columns={5} />;
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

  if (data && !data.dockerAvailable) {
    return (
      <div className="bg-bg-surface border border-bg-elevated rounded-lg p-6">
        <div className="flex flex-col items-center justify-center h-40 gap-2">
          <Container className="h-8 w-8 text-text-muted" />
          <span className="text-text-muted text-sm">
            {data.error || 'Docker is not installed or not accessible on this server'}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-bg-surface border border-bg-elevated rounded-lg p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-text-primary">
          Containers ({containers.length})
        </h3>
      </div>

      {containers.length === 0 ? (
        <div className="flex flex-col items-center justify-center text-text-muted text-sm py-8">
          <Container className="h-10 w-10 text-text-muted/30 mb-2" />
          No containers found
        </div>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-bg-elevated hover:bg-transparent">
                <TableHead className="text-text-muted text-xs">Name</TableHead>
                <TableHead className="text-text-muted text-xs">Image</TableHead>
                <TableHead className="text-text-muted text-xs">State</TableHead>
                <TableHead className="text-text-muted text-xs">Status</TableHead>
                <TableHead className="text-text-muted text-xs">Ports</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {containers.map((c) => (
                <TableRow key={c.id} className="border-bg-elevated">
                  <TableCell className="font-mono text-xs text-text-secondary font-semibold">
                    {c.name}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-text-muted truncate max-w-[200px]">
                    {c.image}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="default"
                      className={`text-[10px] ${STATE_STYLES[c.state] || STATE_STYLES.created}`}
                    >
                      {c.state}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-text-muted">
                    {c.status}
                  </TableCell>
                  <TableCell className="font-mono text-[10px] text-text-muted truncate max-w-[180px]">
                    {c.ports || '-'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { OsIcon } from '@/components/icons/OsIcon';
import { Pencil, Trash2 } from 'lucide-react';
import type { OverviewServerData } from '@/lib/types';
import { formatBps } from '@/lib/format';

function getBarColor(value: number): string {
  if (value >= 85) return 'text-status-critical';
  if (value >= 70) return 'text-gold-primary';
  return 'text-status-healthy';
}

function getProgressClass(value: number): string {
  if (value >= 85) return '[&>div]:bg-status-critical';
  if (value >= 70) return '[&>div]:bg-gold-primary';
  return '[&>div]:bg-status-healthy';
}

interface ServerCardProps {
  server: OverviewServerData;
  onEdit?: (server: OverviewServerData) => void;
  onDelete?: (server: OverviewServerData) => void;
}

export function ServerCard({ server, onEdit, onDelete }: ServerCardProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const isOnline = server.status === 'connected';

  return (
    <div
      onClick={() => startTransition(() => router.push(`/dashboard/${server.serverId}`))}
      className={`group bg-bg-surface border border-bg-elevated rounded-md px-3 py-2.5 cursor-pointer transition-all hover:border-gold-primary/30 hover:shadow-lg border-t-2 border-t-gold-primary ${
        !isOnline ? 'opacity-50' : ''
      } ${isPending ? 'opacity-60 pointer-events-none' : ''}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-1.5 min-w-0">
          <div
            className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
              isOnline ? 'bg-status-healthy status-dot-online' : 'bg-status-critical'
            }`}
          />
          <span className="text-[13px] font-bold text-text-primary truncate">
            {server.name}
          </span>
        </div>
        <div className="flex items-center gap-0.5 flex-shrink-0">
          {onEdit && (
            <Button
              variant="ghost"
              size="icon-xs"
              className="text-text-muted hover:text-text-primary opacity-0 group-hover:opacity-100 transition-opacity h-5 w-5"
              onClick={(e) => { e.stopPropagation(); onEdit(server); }}
            >
              <Pencil className="h-2.5 w-2.5" />
            </Button>
          )}
          {onDelete && (
            <Button
              variant="ghost"
              size="icon-xs"
              className="text-text-muted hover:text-status-critical opacity-0 group-hover:opacity-100 transition-opacity h-5 w-5"
              onClick={(e) => { e.stopPropagation(); onDelete(server); }}
            >
              <Trash2 className="h-2.5 w-2.5" />
            </Button>
          )}
          <OsIcon type={server.type} size={13} className="text-text-muted" />
        </div>
      </div>

      {/* IP + OS */}
      <div className="mb-2.5">
        <p className="font-mono text-[10px] text-text-muted leading-tight">{server.host}</p>
        {server.os && (
          <p className="font-mono text-[10px] text-text-muted leading-tight">{server.os}</p>
        )}
      </div>

      {/* Metrics */}
      <div className="space-y-1.5">
        <MetricBar label="CPU" value={isOnline ? server.cpu : null} />
        <MetricBar label="RAM" value={isOnline ? server.ram : null} />
        <MetricBar label="Disk" value={isOnline ? server.disk : null} />
      </div>

      {/* Bandwidth */}
      {isOnline && (server.rxBps !== undefined || server.txBps !== undefined) && (
        <div className="mt-2 text-[10px] font-mono text-text-muted flex items-center gap-2">
          <span className="text-status-info">↓ {formatBps(server.rxBps ?? 0)}</span>
          <span className="text-status-healthy">↑ {formatBps(server.txBps ?? 0)}</span>
        </div>
      )}

      {/* Uptime */}
      <div className={`${isOnline && (server.rxBps !== undefined || server.txBps !== undefined) ? 'mt-0.5' : 'mt-2'} text-[10px] text-text-muted font-mono`}>
        {isOnline && server.uptime ? `Up since ${server.uptime}` : isOnline ? '' : 'Offline'}
      </div>
    </div>
  );
}

function MetricBar({ label, value }: { label: string; value: number | null }) {
  const display = value !== null ? `${value}%` : '--';
  const colorClass = value !== null ? getBarColor(value) : 'text-text-muted';
  const progressClass = value !== null ? getProgressClass(value) : '';

  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] text-text-muted w-7">{label}</span>
      <Progress
        value={value ?? 0}
        className={`h-1.5 flex-1 bg-bg-elevated ${progressClass}`}
      />
      <span className={`font-mono text-[10px] font-bold w-8 text-right ${colorClass}`}>
        {display}
      </span>
    </div>
  );
}

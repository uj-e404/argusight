'use client';

import { useState, useTransition } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { OsIcon } from '@/components/icons/OsIcon';
import { Loader2 } from 'lucide-react';
import type { OverviewServerData } from '@/lib/types';

interface SidebarProps {
  servers: OverviewServerData[];
  onNavigate?: () => void;
}

const FILTERS = [
  { label: 'All', value: 'all' },
  { label: 'Linux', value: 'linux' },
  { label: 'Windows', value: 'windows' },
  { label: 'MikroTik', value: 'mikrotik' },
] as const;

export function Sidebar({ servers, onNavigate }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [pendingId, setPendingId] = useState<string | null>(null);

  // Extract active filter from search params isn't easy in a non-page component,
  // so sidebar shows all servers always. Filtering is on the overview page.
  const typeCounts = {
    all: servers.length,
    linux: servers.filter((s) => s.type === 'linux').length,
    windows: servers.filter((s) => s.type === 'windows').length,
    mikrotik: servers.filter((s) => s.type === 'mikrotik').length,
  };

  // Sort: online first, then alphabetical
  const sorted = [...servers].sort((a, b) => {
    const aOnline = a.status === 'connected' ? 0 : 1;
    const bOnline = b.status === 'connected' ? 0 : 1;
    if (aOnline !== bOnline) return aOnline - bOnline;
    return a.name.localeCompare(b.name);
  });

  const activeServerId = pathname.match(/\/dashboard\/(.+)/)?.[1];

  return (
    <div className="flex flex-col h-full bg-bg-dark border-r border-bg-elevated">
      <div className="p-4 space-y-1">
        {FILTERS.map((f) => {
          const count = typeCounts[f.value];
          if (f.value !== 'all' && count === 0) return null;
          return (
            <button
              key={f.value}
              onClick={() => {
                startTransition(() => router.push('/dashboard'));
                onNavigate?.();
              }}
              className="w-full flex items-center justify-between px-3 py-1.5 rounded text-sm text-text-secondary hover:text-text-primary hover:bg-bg-elevated transition-colors"
            >
              <span>{f.label}</span>
              <span className="text-xs font-mono text-text-muted">{count}</span>
            </button>
          );
        })}
      </div>

      <Separator className="bg-bg-elevated" />

      <ScrollArea className="flex-1 p-2">
        <div className="space-y-0.5">
          {sorted.map((server) => {
            const isActive = activeServerId === server.serverId;
            const isOnline = server.status === 'connected';
            return (
              <button
                key={server.serverId}
                onClick={() => {
                  setPendingId(server.serverId);
                  startTransition(() => router.push(`/dashboard/${server.serverId}`));
                  onNavigate?.();
                }}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded text-sm transition-colors ${
                  isActive
                    ? 'text-gold-primary bg-bg-elevated border-l-2 border-gold-primary'
                    : 'text-text-secondary hover:text-text-primary hover:bg-bg-surface'
                } ${isPending && pendingId === server.serverId ? 'opacity-70' : ''}`}
              >
                {isPending && pendingId === server.serverId ? (
                  <Loader2 className="w-2 h-2 animate-spin flex-shrink-0 text-gold-primary" />
                ) : (
                  <div
                    className={`w-2 h-2 rounded-full flex-shrink-0 ${
                      isOnline
                        ? 'bg-status-healthy status-dot-online'
                        : 'bg-status-critical'
                    }`}
                  />
                )}
                <OsIcon type={server.type} size={14} className="flex-shrink-0 text-text-muted" />
                <span className="truncate">{server.name}</span>
              </button>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}

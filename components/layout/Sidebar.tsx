'use client';

import { useState, useTransition } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { ScrollArea } from '@/components/ui/scroll-area';
import { OsIcon } from '@/components/icons/OsIcon';
import { Loader2 } from 'lucide-react';
import type { OverviewServerData } from '@/lib/types';

interface SidebarProps {
  servers: OverviewServerData[];
  onNavigate?: () => void;
}

const GROUP_ORDER: { type: 'windows' | 'linux' | 'mikrotik'; label: string }[] = [
  { type: 'windows', label: 'Windows' },
  { type: 'linux', label: 'Linux' },
  { type: 'mikrotik', label: 'MikroTik' },
];

export function Sidebar({ servers, onNavigate }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [pendingId, setPendingId] = useState<string | null>(null);

  const activeServerId = pathname.match(/\/dashboard\/(.+)/)?.[1];

  // Sort: online first, then alphabetical
  const sorted = [...servers].sort((a, b) => {
    const aOnline = a.status === 'connected' ? 0 : 1;
    const bOnline = b.status === 'connected' ? 0 : 1;
    if (aOnline !== bOnline) return aOnline - bOnline;
    return a.name.localeCompare(b.name);
  });

  return (
    <div className="flex flex-col h-full bg-bg-dark border-r border-bg-elevated">
      {/* Dashboard link */}
      <div className="p-4 pb-2">
        <button
          onClick={() => {
            startTransition(() => router.push('/dashboard'));
            onNavigate?.();
          }}
          className={`w-full flex items-center justify-between px-3 py-1.5 rounded text-sm transition-colors ${
            pathname === '/dashboard'
              ? 'text-gold-primary bg-bg-elevated'
              : 'text-text-secondary hover:text-text-primary hover:bg-bg-elevated'
          }`}
        >
          <span>All Servers</span>
          <span className="text-xs font-mono text-text-muted">{servers.length}</span>
        </button>
      </div>

      <ScrollArea className="flex-1 px-2 pb-2">
        {GROUP_ORDER.map((group) => {
          const groupServers = sorted.filter((s) => s.type === group.type);
          if (groupServers.length === 0) return null;
          return (
            <div key={group.type} className="mb-3">
              <div className="flex items-center gap-1.5 px-3 py-1.5">
                <OsIcon type={group.type} size={12} className="text-text-muted/50" />
                <span className="text-[10px] font-semibold text-text-muted/50 uppercase tracking-wider">
                  {group.label}
                </span>
                <span className="text-[10px] font-mono text-text-muted/30">
                  {groupServers.length}
                </span>
              </div>
              <div className="space-y-0.5">
                {groupServers.map((server) => {
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
                      <span className="truncate">{server.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </ScrollArea>
    </div>
  );
}

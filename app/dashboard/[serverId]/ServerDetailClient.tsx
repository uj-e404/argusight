'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { OsIcon } from '@/components/icons/OsIcon';
import { CpuRamChart } from './components/CpuRamChart';
import { PlaceholderTab } from './components/PlaceholderTab';
import { useWebSocket } from '@/hooks/WebSocketProvider';
import type { OverviewServerData } from '@/lib/types';

interface ServerInfo {
  id: string;
  name: string;
  host: string;
  type: 'linux' | 'windows' | 'mikrotik';
  os?: string;
  specs?: Record<string, string>;
  features?: string[];
  tags?: string[];
  status: string;
}

interface ServerDetailClientProps {
  serverId: string;
  initialServer: ServerInfo | null;
}

const LINUX_TABS = ['CPU/RAM', 'Disk', 'Processes', 'Docker', 'GPU'];
const MIKROTIK_TABS = ['Stats', 'Traffic', 'Domains', 'Hotspot'];

export function ServerDetailClient({ serverId, initialServer }: ServerDetailClientProps) {
  const router = useRouter();
  const [server, setServer] = useState<ServerInfo | null>(initialServer);
  const { subscribe, unsubscribe } = useWebSocket();

  useEffect(() => {
    if (!initialServer) {
      fetch(`/api/servers/${serverId}`)
        .then((r) => r.json())
        .then((d) => setServer(d.server))
        .catch(() => {});
    }
  }, [serverId, initialServer]);

  // Update status from WS overview broadcasts
  const handleOverview = useCallback((msg: unknown) => {
    const m = msg as { data: OverviewServerData[] };
    if (Array.isArray(m.data)) {
      const match = m.data.find((s) => s.serverId === serverId);
      if (match) {
        setServer((prev) => prev ? { ...prev, status: match.status } : prev);
      }
    }
  }, [serverId]);

  useEffect(() => {
    subscribe('overview', handleOverview);
    return () => unsubscribe('overview', handleOverview);
  }, [subscribe, unsubscribe, handleOverview]);

  if (!server) {
    return (
      <div className="flex items-center justify-center h-64 text-text-muted">
        Loading server...
      </div>
    );
  }

  const tabs = server.type === 'mikrotik' ? MIKROTIK_TABS : LINUX_TABS;
  const isOnline = server.status === 'connected';

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.push('/dashboard')}
          className="text-text-secondary hover:text-text-primary"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex items-center gap-3">
          <OsIcon type={server.type} size={20} className="text-text-muted" />
          <h1 className="text-xl font-bold text-text-primary">{server.name}</h1>
          <Badge
            variant={isOnline ? 'default' : 'destructive'}
            className={isOnline ? 'bg-status-healthy/20 text-status-healthy border-0' : ''}
          >
            {server.status}
          </Badge>
        </div>
      </div>

      {/* Server info */}
      <div className="flex flex-wrap gap-4 mb-6 font-mono text-xs text-text-muted">
        <span>{server.host}</span>
        {server.os && <span>{server.os}</span>}
        {server.specs &&
          Object.entries(server.specs).map(([k, v]) => (
            <span key={k}>
              {k}: {v}
            </span>
          ))}
      </div>

      {/* Tabs */}
      <Tabs defaultValue={tabs[0]} className="w-full">
        <TabsList className="bg-bg-surface border border-bg-elevated mb-4">
          {tabs.map((tab) => (
            <TabsTrigger
              key={tab}
              value={tab}
              className="data-[state=active]:text-gold-primary data-[state=active]:border-b-2 data-[state=active]:border-gold-primary data-[state=active]:shadow-none rounded-none"
            >
              {tab}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value={tabs[0]}>
          <CpuRamChart serverId={serverId} />
        </TabsContent>

        {tabs.slice(1).map((tab) => (
          <TabsContent key={tab} value={tab}>
            <PlaceholderTab name={tab} />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

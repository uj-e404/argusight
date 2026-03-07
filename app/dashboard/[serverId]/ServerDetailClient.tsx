'use client';

import { useEffect, useState, useCallback, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { OsIcon } from '@/components/icons/OsIcon';
import { CpuRamChart } from './components/CpuRamChart';
import { DiskTable } from './components/DiskTable';
import { ProcessTable } from './components/ProcessTable';
import { DockerTable } from './components/DockerTable';
import { GpuStats } from './components/GpuStats';
import { TrafficChart } from './components/TrafficChart';
import { DomainTable } from './components/DomainTable';
import { HotspotTable } from './components/HotspotTable';
import { NetworkTable } from './components/NetworkTable';
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

function buildTabs(server: ServerInfo): string[] {
  const tabs = ['CPU/RAM'];
  if (server.type === 'mikrotik') {
    if (server.features?.includes('traffic')) tabs.push('Traffic');
    if (server.features?.includes('domains')) tabs.push('Domains');
    if (server.features?.includes('hotspot')) tabs.push('Hotspot');
    if (server.features?.includes('network')) tabs.push('Network');
    return tabs;
  }
  if (server.features?.includes('disk')) tabs.push('Disk');
  if (server.features?.includes('processes')) tabs.push('Processes');
  if (server.features?.includes('docker')) tabs.push('Docker');
  if (server.features?.includes('gpu')) tabs.push('GPU');
  return tabs;
}

export function ServerDetailClient({ serverId, initialServer }: ServerDetailClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [server, setServer] = useState<ServerInfo | null>(initialServer);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const { subscribe, unsubscribe } = useWebSocket();

  useEffect(() => {
    if (!initialServer) {
      fetch(`/api/servers/${serverId}`)
        .then((r) => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return r.json();
        })
        .then((d) => setServer(d.server))
        .catch(() => setFetchError('Failed to load server details'));
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

  if (fetchError) {
    return (
      <div className="flex items-center justify-center h-64 text-status-critical text-sm">
        {fetchError}
      </div>
    );
  }

  if (!server) {
    return (
      <div className="flex items-center justify-center h-64 text-text-muted">
        Loading server...
      </div>
    );
  }

  const tabs = buildTabs(server);
  const isOnline = server.status === 'connected';

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => startTransition(() => router.push('/dashboard'))}
          className={`text-text-secondary hover:text-text-primary ${isPending ? 'opacity-60' : ''}`}
          disabled={isPending}
        >
          {isPending ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <ArrowLeft className="h-5 w-5" />
          )}
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

        <TabsContent value="CPU/RAM">
          <CpuRamChart serverId={serverId} />
        </TabsContent>

        {tabs.includes('Disk') && (
          <TabsContent value="Disk">
            <DiskTable serverId={serverId} />
          </TabsContent>
        )}
        {tabs.includes('Processes') && (
          <TabsContent value="Processes">
            <ProcessTable serverId={serverId} serverType={server.type} />
          </TabsContent>
        )}
        {tabs.includes('Docker') && (
          <TabsContent value="Docker">
            <DockerTable serverId={serverId} />
          </TabsContent>
        )}
        {tabs.includes('GPU') && (
          <TabsContent value="GPU">
            <GpuStats serverId={serverId} />
          </TabsContent>
        )}
        {tabs.includes('Traffic') && (
          <TabsContent value="Traffic">
            <TrafficChart serverId={serverId} />
          </TabsContent>
        )}
        {tabs.includes('Domains') && (
          <TabsContent value="Domains">
            <DomainTable serverId={serverId} />
          </TabsContent>
        )}
        {tabs.includes('Hotspot') && (
          <TabsContent value="Hotspot">
            <HotspotTable serverId={serverId} />
          </TabsContent>
        )}
        {tabs.includes('Network') && (
          <TabsContent value="Network">
            <NetworkTable serverId={serverId} />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}

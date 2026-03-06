'use client';

import { useState, useMemo } from 'react';
import { useServerOverview } from '@/hooks/useServerOverview';
import { ServerCard } from './components/ServerCard';
import { ServerFormDialog } from './components/ServerFormDialog';
import { DeleteServerDialog } from './components/DeleteServerDialog';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { ArrowUpDown, Plus, ServerCog } from 'lucide-react';
import type { OverviewServerData } from '@/lib/types';

type FilterType = 'all' | 'linux' | 'windows' | 'mikrotik';
type SortKey = 'name' | 'cpu' | 'ram' | 'status';

export default function DashboardPage() {
  const { servers, loading, refetch } = useServerOverview();
  const [filter, setFilter] = useState<FilterType>('all');
  const [sort, setSort] = useState<SortKey>('name');

  // CRUD state
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<'add' | 'edit'>('add');
  const [editingServer, setEditingServer] = useState<{
    id: string;
    name: string;
    host: string;
    port: number;
    username: string;
    authType: 'password' | 'key';
    privateKeyPath?: string;
    type: 'linux' | 'windows' | 'mikrotik';
    os?: string;
    features?: string[];
    tags?: string[];
  } | undefined>();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ serverId: string; name: string; host: string } | null>(null);

  function handleAdd() {
    setFormMode('add');
    setEditingServer(undefined);
    setFormOpen(true);
  }

  async function handleEdit(server: OverviewServerData) {
    try {
      const res = await fetch(`/api/servers/${server.serverId}`);
      const data = await res.json();
      const s = data.server;
      setFormMode('edit');
      setEditingServer({
        id: s.id ?? server.serverId,
        name: s.name ?? server.name,
        host: s.host ?? server.host,
        port: s.port ?? 22,
        username: s.username ?? '',
        authType: s.authType ?? 'password',
        privateKeyPath: s.privateKeyPath,
        type: s.type ?? server.type,
        os: s.os,
        features: s.features,
        tags: s.tags,
      });
      setFormOpen(true);
    } catch {
      setFormMode('edit');
      setEditingServer({
        id: server.serverId,
        name: server.name,
        host: server.host,
        port: 22,
        username: '',
        authType: 'password',
        type: server.type,
        os: server.os,
        features: server.features,
        tags: server.tags,
      });
      setFormOpen(true);
    }
  }

  function handleDelete(server: OverviewServerData) {
    setDeleteTarget({ serverId: server.serverId, name: server.name, host: server.host });
    setDeleteOpen(true);
  }

  function handleSuccess() {
    refetch();
  }

  const filtered = useMemo(() => {
    let list = filter === 'all' ? servers : servers.filter((s) => s.type === filter);

    list = [...list].sort((a, b) => {
      switch (sort) {
        case 'cpu':
          return b.cpu - a.cpu;
        case 'ram':
          return b.ram - a.ram;
        case 'status': {
          const order: Record<string, number> = { connected: 0, connecting: 1, error: 2, disconnected: 3 };
          return (order[a.status] ?? 9) - (order[b.status] ?? 9);
        }
        default:
          return a.name.localeCompare(b.name);
      }
    });

    return list;
  }, [servers, filter, sort]);

  const filters: { label: string; value: FilterType }[] = [
    { label: 'All', value: 'all' },
    { label: 'Linux', value: 'linux' },
    { label: 'Windows', value: 'windows' },
    { label: 'MikroTik', value: 'mikrotik' },
  ];

  if (loading) {
    return (
      <div>
        <div className="flex items-center gap-2 mb-6">
          <Skeleton className="h-7 w-16" />
          <Skeleton className="h-7 w-16" />
          <Skeleton className="h-7 w-20" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-48 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2 flex-wrap">
          {filters.map((f) => (
            <Badge
              key={f.value}
              variant={filter === f.value ? 'default' : 'secondary'}
              className={`cursor-pointer transition-colors ${
                filter === f.value
                  ? 'bg-gold-primary text-bg-darkest hover:bg-gold-dark'
                  : 'hover:bg-bg-elevated'
              }`}
              onClick={() => setFilter(f.value)}
            >
              {f.label}
            </Badge>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="text-text-secondary">
                <ArrowUpDown className="h-4 w-4 mr-1" />
                Sort
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setSort('name')}>Name</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSort('cpu')}>CPU</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSort('ram')}>RAM</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSort('status')}>Status</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            size="sm"
            className="bg-gold-primary text-bg-darkest hover:bg-gold-dark gap-1"
            onClick={handleAdd}
          >
            <Plus className="h-4 w-4" />
            Add Server
          </Button>
        </div>
      </div>

      {servers.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <ServerCog className="h-16 w-16 text-text-muted/30 mb-4" />
          <p className="text-text-muted text-lg mb-1">No servers yet</p>
          <p className="text-text-muted/60 text-sm mb-6">Add your first server to start monitoring</p>
          <Button
            className="bg-gold-primary text-bg-darkest hover:bg-gold-dark gap-1.5"
            onClick={handleAdd}
          >
            <Plus className="h-4 w-4" />
            Add Server
          </Button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 text-text-muted">
          No servers match the current filter
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {filtered.map((server) => (
            <ServerCard
              key={server.serverId}
              server={server}
              onEdit={handleEdit}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      <ServerFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        mode={formMode}
        initialData={editingServer}
        onSuccess={handleSuccess}
      />

      <DeleteServerDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        server={deleteTarget}
        onSuccess={handleSuccess}
      />
    </div>
  );
}

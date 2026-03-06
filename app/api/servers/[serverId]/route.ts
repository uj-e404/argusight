import { NextResponse } from 'next/server';
import path from 'path';
import { sshPool } from '@/lib/ssh-pool';
import { getRingBuffer, updateServerInCollector, removeServerFromCollector } from '@/lib/metric-collector';
import { readServersConfig, writeServersConfig } from '@/lib/config-writer';
import type { ServerConfig } from '@/lib/types';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ serverId: string }> }
) {
  const { serverId } = await params;

  let serversConfig;
  try {
    serversConfig = readServersConfig();
  } catch {
    return NextResponse.json({ error: 'Failed to read servers config' }, { status: 500 });
  }

  const config = serversConfig.servers.find((s) => s.id === serverId);
  if (!config) {
    return NextResponse.json({ error: 'Server not found' }, { status: 404 });
  }

  const state = sshPool.getStatus(serverId);
  const ringBuffer = getRingBuffer(serverId);

  const { password: _, privateKeyPath: __, ...safeConfig } = config;
  return NextResponse.json({
    server: {
      ...safeConfig,
      port: config.port,
      username: config.username,
      authType: config.authType,
      status: state?.status ?? 'disconnected',
      ringBuffer,
    },
  });
}

const VALID_TYPES = ['linux', 'windows', 'mikrotik'];
const VALID_AUTH_TYPES = ['password', 'key'];
const VALID_HOST = /^[a-zA-Z0-9][a-zA-Z0-9.\-:]{0,253}[a-zA-Z0-9]$/;

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ serverId: string }> }
) {
  const { serverId } = await params;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { name, host, port, username, authType, password, privateKeyPath, type, os, features, tags } = body as Record<string, string | number | string[]>;

  if (!name || typeof name !== 'string') return NextResponse.json({ error: 'name is required' }, { status: 400 });
  if (!host || typeof host !== 'string') return NextResponse.json({ error: 'host is required' }, { status: 400 });
  if (!VALID_HOST.test(host as string)) return NextResponse.json({ error: 'Invalid host format' }, { status: 400 });
  if (!username || typeof username !== 'string') return NextResponse.json({ error: 'username is required' }, { status: 400 });
  if (!type || !VALID_TYPES.includes(type as string)) return NextResponse.json({ error: 'type must be linux, windows, or mikrotik' }, { status: 400 });
  if (!authType || !VALID_AUTH_TYPES.includes(authType as string)) return NextResponse.json({ error: 'authType must be password or key' }, { status: 400 });

  const portNum = port ? Number(port) : 22;
  if (isNaN(portNum) || portNum < 1 || portNum > 65535) return NextResponse.json({ error: 'port must be 1-65535' }, { status: 400 });

  try {
    const config = readServersConfig();
    const idx = config.servers.findIndex((s) => s.id === serverId);
    if (idx === -1) return NextResponse.json({ error: 'Server not found' }, { status: 404 });

    const existing = config.servers[idx];
    const updated: ServerConfig = {
      id: serverId,
      name: name as string,
      host: host as string,
      port: portNum,
      username: username as string,
      authType: authType as 'password' | 'key',
      type: type as 'linux' | 'windows' | 'mikrotik',
    };

    if (authType === 'password') {
      updated.password = password ? (password as string) : existing.password;
    }
    if (authType === 'key' && privateKeyPath) {
      const normalized = path.normalize(privateKeyPath as string);
      if (normalized.includes('..')) {
        return NextResponse.json({ error: 'privateKeyPath must not contain path traversal (..)' }, { status: 400 });
      }
      updated.privateKeyPath = privateKeyPath as string;
    }
    if (os) updated.os = os as string;
    if (Array.isArray(features)) updated.features = features as string[];
    if (Array.isArray(tags)) updated.tags = tags as string[];

    config.servers[idx] = updated;
    await writeServersConfig(config);

    sshPool.removeConfig(serverId);
    sshPool.connect(updated).catch(() => {});
    updateServerInCollector(updated);

    const { password: _, ...safeConfig } = updated;
    return NextResponse.json({ server: safeConfig });
  } catch {
    return NextResponse.json({ error: 'Failed to update server config' }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ serverId: string }> }
) {
  const { serverId } = await params;

  try {
    const config = readServersConfig();
    const idx = config.servers.findIndex((s) => s.id === serverId);
    if (idx === -1) return NextResponse.json({ error: 'Server not found' }, { status: 404 });

    config.servers.splice(idx, 1);
    await writeServersConfig(config);

    sshPool.removeConfig(serverId);
    removeServerFromCollector(serverId);

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Failed to delete server' }, { status: 500 });
  }
}

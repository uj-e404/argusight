import { NextResponse } from 'next/server';
import path from 'path';
import { nanoid } from 'nanoid';
import { sshPool } from '@/lib/ssh-pool';
import { getLatestOverview, addServerToCollector } from '@/lib/metric-collector';
import { readServersConfig, writeServersConfig } from '@/lib/config-writer';
import type { OverviewServerData, ServerConfig } from '@/lib/types';

export async function GET() {
  let serversConfig;
  try {
    serversConfig = readServersConfig();
  } catch {
    return NextResponse.json({ error: 'Failed to read servers config' }, { status: 500 });
  }

  const latestOverview = getLatestOverview();
  const overviewMap = new Map(latestOverview.map((o) => [o.serverId, o]));

  const servers: OverviewServerData[] = serversConfig.servers.map((config) => {
    const overview = overviewMap.get(config.id);
    const state = sshPool.getStatus(config.id);

    if (overview) {
      return { ...overview, status: state?.status ?? overview.status };
    }

    return {
      serverId: config.id,
      name: config.name,
      host: config.host,
      type: config.type,
      os: config.os,
      specs: config.specs,
      features: config.features,
      tags: config.tags,
      status: state?.status ?? 'disconnected',
      cpu: 0,
      ram: 0,
      disk: 0,
      uptime: '',
    };
  });

  return NextResponse.json({ servers });
}

const VALID_TYPES = ['linux', 'windows', 'mikrotik'];
const VALID_AUTH_TYPES = ['password', 'key'];
const VALID_HOST = /^[a-zA-Z0-9][a-zA-Z0-9.\-:]{0,253}[a-zA-Z0-9]$/;

export async function POST(request: Request) {
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

  const newConfig: ServerConfig = {
    id: nanoid(12),
    name: name as string,
    host: host as string,
    port: portNum,
    username: username as string,
    authType: authType as 'password' | 'key',
    type: type as 'linux' | 'windows' | 'mikrotik',
  };

  if (authType === 'password' && password) newConfig.password = password as string;
  if (authType === 'key' && privateKeyPath) {
    const normalized = path.normalize(privateKeyPath as string);
    if (normalized.includes('..')) {
      return NextResponse.json({ error: 'privateKeyPath must not contain path traversal (..)' }, { status: 400 });
    }
    newConfig.privateKeyPath = privateKeyPath as string;
  }
  if (os) newConfig.os = os as string;
  if (Array.isArray(features)) newConfig.features = features as string[];
  if (Array.isArray(tags)) newConfig.tags = tags as string[];

  try {
    const config = readServersConfig();
    config.servers.push(newConfig);
    await writeServersConfig(config);

    sshPool.connect(newConfig).catch(() => {});
    addServerToCollector(newConfig);

    const { password: _, ...safeConfig } = newConfig;
    return NextResponse.json({ server: safeConfig }, { status: 201 });
  } catch (err) {
    console.error('[api] Failed to save server config:', err);
    return NextResponse.json({ error: 'Failed to save server config' }, { status: 500 });
  }
}

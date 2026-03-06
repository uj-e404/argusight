import { NextResponse } from 'next/server';
import path from 'path';
import { SSHPool } from '@/lib/ssh-pool';
import type { ServerConfig } from '@/lib/types';

const VALID_HOST = /^[a-zA-Z0-9][a-zA-Z0-9.\-:]{0,253}[a-zA-Z0-9]$/;
const VALID_TYPES = ['linux', 'windows', 'mikrotik'];
const VALID_AUTH_TYPES = ['password', 'key'];

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { host, port, username, authType, password, privateKeyPath, type } = body;

  if (!host || typeof host !== 'string') {
    return NextResponse.json({ error: 'host is required' }, { status: 400 });
  }
  if (!VALID_HOST.test(host)) {
    return NextResponse.json({ error: 'Invalid host format' }, { status: 400 });
  }
  if (!username || typeof username !== 'string') {
    return NextResponse.json({ error: 'username is required' }, { status: 400 });
  }
  if (!type || !VALID_TYPES.includes(type as string)) {
    return NextResponse.json({ error: 'type must be linux, windows, or mikrotik' }, { status: 400 });
  }
  if (authType && !VALID_AUTH_TYPES.includes(authType as string)) {
    return NextResponse.json({ error: 'authType must be password or key' }, { status: 400 });
  }

  const portNum = port ? Number(port) : 22;
  if (isNaN(portNum) || portNum < 1 || portNum > 65535) {
    return NextResponse.json({ error: 'port must be 1-65535' }, { status: 400 });
  }

  // Validate password if provided
  if (password !== undefined && (typeof password !== 'string' || password.length > 1000)) {
    return NextResponse.json({ error: 'Invalid password' }, { status: 400 });
  }

  // Validate privateKeyPath — reject path traversal
  if (privateKeyPath !== undefined) {
    if (typeof privateKeyPath !== 'string') {
      return NextResponse.json({ error: 'Invalid privateKeyPath' }, { status: 400 });
    }
    const normalized = path.normalize(privateKeyPath);
    if (normalized.includes('..')) {
      return NextResponse.json({ error: 'privateKeyPath must not contain path traversal (..)' }, { status: 400 });
    }
  }

  const tempConfig: ServerConfig = {
    id: '__test__',
    name: 'Test',
    host: host,
    port: portNum,
    username: username,
    authType: (authType as 'password' | 'key') || 'password',
    type: (type as 'linux' | 'windows' | 'mikrotik'),
  };

  if (password) tempConfig.password = password as string;
  if (privateKeyPath) tempConfig.privateKeyPath = privateKeyPath as string;

  const result = await SSHPool.testConnection(tempConfig);
  return NextResponse.json(result);
}

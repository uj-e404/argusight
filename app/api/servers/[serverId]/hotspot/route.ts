import { NextResponse } from 'next/server';
import { sshPool } from '@/lib/ssh-pool';
import { readServersConfig } from '@/lib/config-writer';
import { parseMikroTikHotspotDetail } from '@/lib/parsers/mikrotik';

const VALID_USERNAME = /^[a-zA-Z0-9@._-]{1,64}$/;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ serverId: string }> }
) {
  const { serverId } = await params;

  let config;
  try {
    const serversConfig = readServersConfig();
    config = serversConfig.servers.find((s) => s.id === serverId);
  } catch {
    return NextResponse.json({ error: 'Failed to read config' }, { status: 500 });
  }

  if (!config) return NextResponse.json({ error: 'Server not found' }, { status: 404 });
  if (config.type !== 'mikrotik') return NextResponse.json({ error: 'Not a MikroTik server' }, { status: 400 });

  const state = sshPool.getStatus(serverId);
  if (state?.status !== 'connected') {
    return NextResponse.json({ error: 'Server not connected' }, { status: 503 });
  }

  try {
    const raw = await sshPool.exec(serverId, '/ip hotspot active print detail');
    const users = parseMikroTikHotspotDetail(raw);

    const totalBytesIn = users.reduce((sum, u) => sum + u.bytesIn, 0);
    const totalBytesOut = users.reduce((sum, u) => sum + u.bytesOut, 0);

    return NextResponse.json({ users, totalBytesIn, totalBytesOut });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ serverId: string }> }
) {
  const { serverId } = await params;

  let body: { user?: string } = {};
  try {
    body = await request.json();
  } catch {
    // No body = kick all
  }

  let config;
  try {
    const serversConfig = readServersConfig();
    config = serversConfig.servers.find((s) => s.id === serverId);
  } catch {
    return NextResponse.json({ error: 'Failed to read config' }, { status: 500 });
  }

  if (!config) return NextResponse.json({ error: 'Server not found' }, { status: 404 });
  if (config.type !== 'mikrotik') return NextResponse.json({ error: 'Not a MikroTik server' }, { status: 400 });

  const state = sshPool.getStatus(serverId);
  if (state?.status !== 'connected') {
    return NextResponse.json({ error: 'Server not connected' }, { status: 503 });
  }

  try {
    if (body.user) {
      // Sanitize username to prevent command injection
      if (!VALID_USERNAME.test(body.user)) {
        return NextResponse.json({ error: 'Invalid username format' }, { status: 400 });
      }
      const safeUser = body.user.replace(/"/g, '\\"');
      await sshPool.exec(serverId, `/ip hotspot active remove [find where user="${safeUser}"]`);
    } else {
      // Kick all
      await sshPool.exec(serverId, '/ip hotspot active remove [find]');
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

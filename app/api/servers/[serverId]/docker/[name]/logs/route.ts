import { NextResponse } from 'next/server';
import { sshPool } from '@/lib/ssh-pool';
import { readServersConfig } from '@/lib/config-writer';

const CONTAINER_NAME_REGEX = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ serverId: string; name: string }> }
) {
  const { serverId, name } = await params;

  // Validate container name
  if (!CONTAINER_NAME_REGEX.test(name)) {
    return NextResponse.json({ error: 'Invalid container name format' }, { status: 400 });
  }

  const url = new URL(request.url);
  const tail = parseInt(url.searchParams.get('tail') || '100', 10);
  const safeTail = Math.min(Math.max(tail, 1), 500); // clamp 1-500

  const config = readServersConfig();
  const server = config.servers.find((s) => s.id === serverId);
  if (!server) {
    return NextResponse.json({ error: 'Server not found' }, { status: 404 });
  }

  const state = sshPool.getStatus(serverId);
  if (!state || state.status !== 'connected') {
    return NextResponse.json({ error: 'Server not connected' }, { status: 503 });
  }

  try {
    const raw = await sshPool.exec(serverId, `docker logs --tail ${safeTail} --timestamps ${name} 2>&1`, 15000);
    return NextResponse.json({ logs: raw, name });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch logs' },
      { status: 500 }
    );
  }
}

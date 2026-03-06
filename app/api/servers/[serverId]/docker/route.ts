import { NextResponse } from 'next/server';
import { sshPool } from '@/lib/ssh-pool';
import { readServersConfig } from '@/lib/config-writer';
import { parseDockerPs } from '@/lib/parsers/linux';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ serverId: string }> }
) {
  const { serverId } = await params;

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
    const raw = await sshPool.exec(serverId, "docker ps -a --format '{{json .}}' 2>/dev/null");
    const containers = parseDockerPs(raw);
    return NextResponse.json({ containers, dockerAvailable: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : '';
    if (msg.includes('not found') || msg.includes('command not found') || msg.includes('not recognized')) {
      return NextResponse.json({ containers: [], dockerAvailable: false });
    }
    // Could be permission issue
    if (msg.includes('permission denied') || msg.includes('Permission denied')) {
      return NextResponse.json({
        containers: [],
        dockerAvailable: true,
        error: 'Permission denied. SSH user may need to be in the docker group.',
      });
    }
    return NextResponse.json(
      { error: msg || 'Failed to fetch Docker containers' },
      { status: 500 }
    );
  }
}

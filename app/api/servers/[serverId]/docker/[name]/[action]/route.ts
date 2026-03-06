import { NextResponse } from 'next/server';
import { sshPool } from '@/lib/ssh-pool';
import { readServersConfig } from '@/lib/config-writer';

const VALID_ACTIONS = ['start', 'stop', 'restart'];
const CONTAINER_NAME_REGEX = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ serverId: string; name: string; action: string }> }
) {
  const { serverId, name, action } = await params;

  // Validate action
  if (!VALID_ACTIONS.includes(action)) {
    return NextResponse.json({ error: `Invalid action. Must be one of: ${VALID_ACTIONS.join(', ')}` }, { status: 400 });
  }

  // Validate container name to prevent command injection
  if (!CONTAINER_NAME_REGEX.test(name)) {
    return NextResponse.json({ error: 'Invalid container name format' }, { status: 400 });
  }

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
    // Use longer timeout for stop/restart (containers may take time to stop)
    const timeout = action === 'start' ? 10000 : 30000;
    await sshPool.exec(serverId, `docker ${action} ${name}`, timeout);
    return NextResponse.json({ success: true, container: name, action });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : `Failed to ${action} container` },
      { status: 500 }
    );
  }
}

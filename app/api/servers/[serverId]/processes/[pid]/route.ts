import { NextResponse } from 'next/server';
import { sshPool } from '@/lib/ssh-pool';
import { readServersConfig } from '@/lib/config-writer';

const PID_REGEX = /^\d+$/;

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ serverId: string; pid: string }> }
) {
  const { serverId, pid } = await params;

  // Validate PID is numeric to prevent command injection
  if (!PID_REGEX.test(pid)) {
    return NextResponse.json({ error: 'Invalid PID format' }, { status: 400 });
  }

  const config = readServersConfig();
  const server = config.servers.find((s) => s.id === serverId);
  if (!server) {
    return NextResponse.json({ error: 'Server not found' }, { status: 404 });
  }

  if (server.type === 'mikrotik') {
    return NextResponse.json({ error: 'Kill process not available for MikroTik' }, { status: 400 });
  }

  const state = sshPool.getStatus(serverId);
  if (!state || state.status !== 'connected') {
    return NextResponse.json({ error: 'Server not connected' }, { status: 503 });
  }

  try {
    const command = server.type === 'linux'
      ? `kill -9 ${pid}`
      : `powershell -Command "Stop-Process -Id ${pid} -Force"`;

    await sshPool.exec(serverId, command);
    return NextResponse.json({ success: true, pid: parseInt(pid, 10) });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to kill process' },
      { status: 500 }
    );
  }
}

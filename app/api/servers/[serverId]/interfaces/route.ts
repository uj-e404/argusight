import { NextResponse } from 'next/server';
import { sshPool } from '@/lib/ssh-pool';
import { readServersConfig } from '@/lib/config-writer';
import { parseMikroTikInterfaces } from '@/lib/parsers/mikrotik';
import { parseWindowsNetAdapters } from '@/lib/parsers/windows';

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

  const state = sshPool.getStatus(serverId);
  if (state?.status !== 'connected') {
    return NextResponse.json({ error: 'Server not connected' }, { status: 503 });
  }

  try {
    if (config.type === 'mikrotik') {
      const raw = await sshPool.exec(serverId, '/interface print');
      const interfaces = parseMikroTikInterfaces(raw);
      return NextResponse.json({ interfaces });
    } else if (config.type === 'windows') {
      const raw = await sshPool.exec(serverId, 'powershell -Command "Get-NetAdapter | Where-Object { $_.Status -eq \'Up\' } | Select-Object Name,InterfaceDescription,LinkSpeed | ConvertTo-Json"');
      const interfaces = parseWindowsNetAdapters(raw);
      return NextResponse.json({ interfaces });
    } else {
      return NextResponse.json({ error: 'Interfaces not supported for this server type' }, { status: 400 });
    }
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

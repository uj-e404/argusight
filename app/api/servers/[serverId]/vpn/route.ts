import { NextResponse } from 'next/server';
import { sshPool } from '@/lib/ssh-pool';
import { readServersConfig } from '@/lib/config-writer';
import { parseMikroTikVpnPeers } from '@/lib/parsers/mikrotik';

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
  if (config.type !== 'mikrotik') {
    return NextResponse.json({ error: 'Not a MikroTik server' }, { status: 400 });
  }

  const state = sshPool.getStatus(serverId);
  if (state?.status !== 'connected') {
    return NextResponse.json({ error: 'Server not connected' }, { status: 503 });
  }

  try {
    const raw = await sshPool.exec(serverId, '/interface/wireguard/peers/print detail');
    const peers = parseMikroTikVpnPeers(raw);

    const totalRx = peers.reduce((sum, p) => sum + p.rx, 0);
    const totalTx = peers.reduce((sum, p) => sum + p.tx, 0);
    const onlineCount = peers.filter((p) => p.online).length;

    return NextResponse.json({ peers, totalRx, totalTx, onlineCount });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

import { NextResponse } from 'next/server';
import { readServersConfig } from '@/lib/config-writer';
import { getSpikeEvents, clearSpikeEvents } from '@/lib/db';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ serverId: string }> }
) {
  const { serverId } = await params;

  try {
    const config = readServersConfig();
    if (!config.servers.find((s) => s.id === serverId)) {
      return NextResponse.json({ error: 'Server not found' }, { status: 404 });
    }
  } catch {
    return NextResponse.json({ error: 'Failed to read config' }, { status: 500 });
  }

  const url = new URL(request.url);
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '50', 10) || 50, 200);
  const offset = parseInt(url.searchParams.get('offset') || '0', 10) || 0;

  const result = getSpikeEvents(serverId, limit, offset);
  return NextResponse.json(result);
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ serverId: string }> }
) {
  const { serverId } = await params;

  try {
    const config = readServersConfig();
    if (!config.servers.find((s) => s.id === serverId)) {
      return NextResponse.json({ error: 'Server not found' }, { status: 404 });
    }
  } catch {
    return NextResponse.json({ error: 'Failed to read config' }, { status: 500 });
  }

  clearSpikeEvents(serverId);
  return NextResponse.json({ ok: true });
}

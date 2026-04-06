import { NextResponse } from 'next/server';
import { readServersConfig } from '@/lib/config-writer';
import { getSpikeConfig, setSpikeConfig } from '@/lib/db';
import { invalidateSpikeConfigCache } from '@/lib/metric-collector';

export async function GET(
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

  const spikeConfig = getSpikeConfig(serverId);
  return NextResponse.json(spikeConfig);
}

export async function PUT(
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

  let body: { personalThresholdMbps?: number; allThresholdMbps?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const personalThresholdMbps = body.personalThresholdMbps;
  const allThresholdMbps = body.allThresholdMbps;

  if (typeof personalThresholdMbps !== 'number' || personalThresholdMbps <= 0 ||
      typeof allThresholdMbps !== 'number' || allThresholdMbps <= 0) {
    return NextResponse.json({ error: 'Thresholds must be positive numbers' }, { status: 400 });
  }

  const spikeConfig = { personalThresholdMbps, allThresholdMbps };
  setSpikeConfig(serverId, spikeConfig);
  invalidateSpikeConfigCache(serverId);

  return NextResponse.json(spikeConfig);
}

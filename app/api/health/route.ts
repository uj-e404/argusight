import { NextResponse } from 'next/server';
import { sshPool } from '@/lib/ssh-pool';

export const dynamic = 'force-dynamic';

export async function GET() {
  const statuses = sshPool.getAllStatuses();
  const total = statuses.length;
  const online = statuses.filter((s) => s.status === 'connected').length;

  return NextResponse.json({
    status: 'ok',
    uptime: process.uptime(),
    servers: {
      total,
      online,
      offline: total - online,
    },
    websocket: true,
  });
}

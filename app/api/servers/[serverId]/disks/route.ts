import { NextResponse } from 'next/server';
import { sshPool } from '@/lib/ssh-pool';
import { readServersConfig } from '@/lib/config-writer';
import { parseDiskUsage, parseSmartHealth } from '@/lib/parsers/linux';
import { parseDiskWindows } from '@/lib/parsers/windows';
import type { DiskInfo, DiskSmartStatus } from '@/lib/types';

const cache = new Map<string, { disks: DiskInfo[]; smart: DiskSmartStatus[]; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export async function GET(
  request: Request,
  { params }: { params: Promise<{ serverId: string }> }
) {
  const { serverId } = await params;
  const url = new URL(request.url);
  const forceRefresh = url.searchParams.get('refresh') === 'true';

  const config = readServersConfig();
  const server = config.servers.find((s) => s.id === serverId);
  if (!server) {
    return NextResponse.json({ error: 'Server not found' }, { status: 404 });
  }

  if (server.type === 'mikrotik') {
    return NextResponse.json({ error: 'Disk info not available for MikroTik' }, { status: 400 });
  }

  // Check cache
  const cached = cache.get(serverId);
  if (!forceRefresh && cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return NextResponse.json({
      disks: cached.disks,
      smart: cached.smart,
      cached: true,
      cachedAt: new Date(cached.timestamp).toISOString(),
    });
  }

  const state = sshPool.getStatus(serverId);
  if (!state || state.status !== 'connected') {
    return NextResponse.json({ error: 'Server not connected' }, { status: 503 });
  }

  try {
    let disks: DiskInfo[] = [];
    let smart: DiskSmartStatus[] = [];

    if (server.type === 'linux') {
      const raw = await sshPool.exec(serverId, 'df -h --output=source,fstype,size,used,avail,pcent,target 2>/dev/null');
      disks = parseDiskUsage(raw);

      // Try SMART health (best-effort, may fail without sudo/smartctl)
      try {
        const devRaw = await sshPool.exec(serverId, "lsblk -d -n -o NAME,TYPE 2>/dev/null | awk '$2==\"disk\"{print $1}'");
        const devices = devRaw.trim().split('\n').filter((d) => d.trim());
        for (const dev of devices.slice(0, 4)) { // limit to 4 devices
          // Validate device name to prevent command injection
          if (!/^[a-zA-Z0-9]+$/.test(dev)) continue;
          try {
            const smartRaw = await sshPool.exec(serverId, `sudo smartctl -H /dev/${dev} 2>/dev/null`, 5000);
            const result = parseSmartHealth(smartRaw);
            if (result) smart.push(result);
          } catch {
            // smartctl not available or no sudo — skip
          }
        }
      } catch {
        // lsblk not available — skip SMART
      }
    } else if (server.type === 'windows') {
      const raw = await sshPool.exec(serverId, 'powershell -Command "Get-Volume | Where-Object {$_.DriveLetter} | Select-Object DriveLetter,FileSystem,Size,SizeRemaining | ConvertTo-Json"');
      disks = parseDiskWindows(raw);
    }

    // Update cache
    cache.set(serverId, { disks, smart, timestamp: Date.now() });

    return NextResponse.json({
      disks,
      smart,
      cached: false,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch disk info' },
      { status: 500 }
    );
  }
}

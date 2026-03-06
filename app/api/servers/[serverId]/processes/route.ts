import { NextResponse } from 'next/server';
import { sshPool } from '@/lib/ssh-pool';
import { readServersConfig } from '@/lib/config-writer';
import { parseProcessList } from '@/lib/parsers/linux';
import { parseProcessWindows } from '@/lib/parsers/windows';

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

  if (server.type === 'mikrotik') {
    return NextResponse.json({ error: 'Process list not available for MikroTik' }, { status: 400 });
  }

  const state = sshPool.getStatus(serverId);
  if (!state || state.status !== 'connected') {
    return NextResponse.json({ error: 'Server not connected' }, { status: 503 });
  }

  try {
    if (server.type === 'linux') {
      const [raw, cpuCountRaw] = await Promise.all([
        sshPool.exec(serverId, 'ps aux --sort=-%cpu | head -50'),
        sshPool.exec(serverId, 'nproc'),
      ]);
      const logicalProcessors = parseInt(cpuCountRaw.trim(), 10) || 1;
      const processes = parseProcessList(raw, logicalProcessors);
      return NextResponse.json({ processes, ramUnit: 'MB' });
    } else {
      const [raw, cpuCountRaw] = await Promise.all([
        sshPool.exec(serverId, 'powershell -Command "Get-CimInstance Win32_PerfFormattedData_PerfProc_Process | Where-Object {$_.Name -ne \'_Total\' -and $_.Name -ne \'Idle\'} | Sort-Object PercentProcessorTime -Descending | Select-Object -First 50 IDProcess,Name,PercentProcessorTime,WorkingSetPrivate | ConvertTo-Json"'),
        sshPool.exec(serverId, 'powershell -Command "(Get-CimInstance Win32_ComputerSystem).NumberOfLogicalProcessors"'),
      ]);
      const logicalProcessors = parseInt(cpuCountRaw.trim(), 10) || 1;
      const processes = parseProcessWindows(raw, logicalProcessors);
      return NextResponse.json({ processes, ramUnit: 'MB' });
    }
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch processes' },
      { status: 500 }
    );
  }
}

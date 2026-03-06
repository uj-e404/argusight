import { NextResponse } from 'next/server';
import { sshPool } from '@/lib/ssh-pool';
import { readServersConfig } from '@/lib/config-writer';
import { parseGpuInfo, parseGpuProcesses } from '@/lib/parsers/linux';
import { parseGpuWindows, parseGpuProcessesWindows } from '@/lib/parsers/windows';

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

  if (!server.features?.includes('gpu')) {
    return NextResponse.json({ error: 'GPU monitoring not enabled for this server' }, { status: 404 });
  }

  const state = sshPool.getStatus(serverId);
  if (!state || state.status !== 'connected') {
    return NextResponse.json({ error: 'Server not connected' }, { status: 503 });
  }

  try {
    const suppress = server.type === 'windows' ? '' : '2>/dev/null';

    const gpuCmd = `nvidia-smi --query-gpu=utilization.gpu,utilization.memory,temperature.gpu,power.draw,memory.total,memory.used --format=csv,noheader,nounits ${suppress}`;
    const procCmd = `nvidia-smi --query-compute-apps=pid,used_gpu_memory,name --format=csv,noheader,nounits ${suppress}`;

    let gpu = null;
    let processes: { pid: number; memoryUsed: number | null; name: string }[] = [];

    try {
      const gpuRaw = await sshPool.exec(serverId, gpuCmd);
      gpu = server.type === 'windows' ? parseGpuWindows(gpuRaw) : parseGpuInfo(gpuRaw);
    } catch {
      return NextResponse.json({
        gpu: null,
        processes: [],
        available: false,
        error: 'nvidia-smi not available',
      });
    }

    try {
      const procRaw = await sshPool.exec(serverId, procCmd);
      processes = server.type === 'windows' ? parseGpuProcessesWindows(procRaw) : parseGpuProcesses(procRaw);
    } catch {
      // No GPU processes or command failed — not critical
    }

    return NextResponse.json({ gpu, processes, available: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch GPU info' },
      { status: 500 }
    );
  }
}

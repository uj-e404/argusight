import type { DiskInfo, ProcessInfo, DockerContainer, GpuInfo, GpuProcessInfo, DiskSmartStatus } from '../types';

// Store previous CPU stat per server for delta calculation
const prevCpuStats = new Map<string, { idle: number; total: number }>();

export function parseCpuStatDelta(raw: string, serverId: string): number {
  // Input: "cpu  user nice system idle iowait irq softirq steal"
  const line = raw.split('\n').find((l) => l.startsWith('cpu '));
  if (!line) return 0;

  const parts = line.trim().split(/\s+/).slice(1).map(Number);
  const idle = parts[3] + (parts[4] || 0); // idle + iowait
  const total = parts.reduce((a, b) => a + b, 0);

  const prev = prevCpuStats.get(serverId);
  if (!prev) {
    prevCpuStats.set(serverId, { idle, total });
    return 0;
  }

  const deltaIdle = idle - prev.idle;
  const deltaTotal = total - prev.total;
  prevCpuStats.set(serverId, { idle, total });

  if (deltaTotal === 0) return 0;
  return Math.round(((deltaTotal - deltaIdle) / deltaTotal) * 100);
}

export function parseMemory(raw: string): { total: number; used: number; percent: number } {
  // Input from: free -b | grep Mem
  const parts = raw.trim().split(/\s+/);
  const total = parseInt(parts[1], 10);
  const used = parseInt(parts[2], 10);
  return {
    total,
    used,
    percent: total > 0 ? Math.round((used / total) * 100) : 0,
  };
}

export function parseDiskUsage(raw: string): DiskInfo[] {
  // Input from: df -h --output=source,fstype,size,used,avail,pcent,target | grep -v tmpfs
  const lines = raw.trim().split('\n').slice(1); // skip header
  return lines
    .filter((l) => l.trim())
    .filter((l) => !/squashfs|loop|efivarfs/.test(l))
    .map((line) => {
      const parts = line.trim().split(/\s+/);
      return {
        filesystem: parts[0],
        fstype: parts[1],
        size: parts[2],
        used: parts[3],
        available: parts[4],
        usePercent: parseInt(parts[5], 10) || 0,
        mountpoint: parts[6],
      };
    });
}

export function parseProcessList(raw: string, logicalProcessors?: number): ProcessInfo[] {
  // Input from: ps aux --sort=-%cpu | head -50
  // Columns: USER PID %CPU %MEM VSZ RSS TTY STAT START TIME COMMAND
  const lines = raw.trim().split('\n').slice(1); // skip header
  const cores = logicalProcessors && logicalProcessors > 0 ? logicalProcessors : 1;
  return lines
    .filter((l) => l.trim())
    .map((line) => {
      const parts = line.trim().split(/\s+/);
      const rssKb = parseInt(parts[5], 10) || 0;
      const rawCpu = parseFloat(parts[2]);
      return {
        user: parts[0],
        pid: parseInt(parts[1], 10),
        cpu: Math.round((rawCpu / cores) * 10) / 10,
        ram: Math.round(rssKb / 1024), // MB
        name: parts.slice(10).join(' '),
      };
    });
}

export function parseDockerPs(raw: string): DockerContainer[] {
  // Input from: docker ps -a --format '{{json .}}'
  const lines = raw.trim().split('\n').filter((l) => l.trim());
  return lines.map((line) => {
    try {
      const obj = JSON.parse(line);
      return {
        id: obj.ID || '',
        name: obj.Names || '',
        image: obj.Image || '',
        status: obj.Status || '',
        state: obj.State || '',
        ports: obj.Ports || '',
        created: obj.CreatedAt || '',
      };
    } catch {
      return { id: '', name: '', image: '', status: '', state: '', ports: '', created: '' };
    }
  });
}

export function parseUptime(raw: string): string {
  // Input from: uptime -s → "2024-01-15 10:30:00"
  return raw.trim();
}

export function parseGpuInfo(raw: string): GpuInfo | null {
  // Input from: nvidia-smi --query-gpu=... --format=csv,noheader,nounits
  const line = raw.trim();
  if (!line) return null;
  const parts = line.split(',').map((s) => parseFloat(s.trim()));
  if (parts.length < 6) return null;
  return {
    gpuUtil: parts[0],
    memUtil: parts[1],
    temperature: parts[2],
    powerDraw: parts[3],
    memTotal: parts[4],
    memUsed: parts[5],
  };
}

export function parseGpuProcesses(raw: string): GpuProcessInfo[] {
  // Input from: nvidia-smi --query-compute-apps=pid,used_gpu_memory,name --format=csv,noheader,nounits
  const lines = raw.trim().split('\n').filter((l) => l.trim());
  return lines.map((line) => {
    const parts = line.split(',').map((s) => s.trim());
    return {
      pid: parseInt(parts[0], 10) || 0,
      memoryUsed: parts[1]?.includes('N/A') ? null : (parseFloat(parts[1]) || 0),
      name: parts[2] || '',
    };
  });
}

export function parseSmartHealth(raw: string): DiskSmartStatus | null {
  // Input from: sudo smartctl -H /dev/sdX
  if (!raw.trim()) return null;
  const deviceMatch = raw.match(/\/dev\/\w+/);
  const device = deviceMatch ? deviceMatch[0] : 'unknown';
  const passed = /PASSED|OK/.test(raw);
  const failed = /FAILED/.test(raw);
  if (!passed && !failed) return null;
  return {
    device,
    healthy: passed && !failed,
    status: passed ? 'PASSED' : 'FAILED',
  };
}

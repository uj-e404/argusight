import type { DiskInfo, ProcessInfo, DockerContainer, GpuInfo } from '../types';

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

export function parseProcessList(raw: string): ProcessInfo[] {
  // Input from: ps aux --sort=-%cpu | head -30
  const lines = raw.trim().split('\n').slice(1); // skip header
  return lines
    .filter((l) => l.trim())
    .map((line) => {
      const parts = line.trim().split(/\s+/);
      return {
        user: parts[0],
        pid: parseInt(parts[1], 10),
        cpu: parseFloat(parts[2]),
        ram: parseFloat(parts[3]),
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

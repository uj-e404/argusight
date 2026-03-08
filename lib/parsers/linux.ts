import type { DiskInfo, ProcessInfo, DockerContainer, GpuInfo, GpuProcessInfo, DiskSmartStatus, WindowsNetData, WindowsNetProcess, WindowsNetDestination } from '../types';

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

const LOOPBACK_SET = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1', '0.0.0.0', '::', '']);

function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split('.').map(Number);
  if (parts[0] === 10) return true;
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
  if (parts[0] === 192 && parts[1] === 168) return true;
  if (parts[0] === 127) return true;
  return false;
}

function isPrivateIP(ip: string): boolean {
  // Pure IPv4
  if (!ip.includes(':')) return isPrivateIPv4(ip);

  // IPv6-mapped IPv4 (::ffff:10.0.0.1) — extract the IPv4 portion
  const v4Mapped = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
  if (v4Mapped) return isPrivateIPv4(v4Mapped[1]);

  // Common private/loopback IPv6
  if (ip === '::1' || ip === '::') return true;
  if (ip.startsWith('fe80')) return true;  // link-local
  if (ip.startsWith('fc') || ip.startsWith('fd')) return true;  // ULA (unique local)

  return false;
}

export function parseLinuxNetConnections(ssOutput: string): WindowsNetData {
  // Input from: ss -tnpH
  // Format: State Recv-Q Send-Q Local:Port Peer:Port Process
  // Example: ESTAB 0 0 10.0.0.5:443 8.8.8.8:54321 users:(("nginx",pid=1234,fd=5))
  try {
    const lines = ssOutput.trim().split('\n').filter((l) => l.trim());

    const parsed: { remoteAddr: string; remotePort: number; processName: string; pid: number }[] = [];

    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      // Minimum: State RecvQ SendQ Local Peer [Process]
      if (parts.length < 5) continue;

      const peerField = parts[4]; // remote_ip:port or [ipv6]:port
      let remoteAddr: string;
      let remotePort: number;

      // Handle bracketed IPv6: [addr]:port
      const bracketMatch = peerField.match(/^\[(.+)\]:(\d+)$/);
      if (bracketMatch) {
        remoteAddr = bracketMatch[1];
        remotePort = parseInt(bracketMatch[2], 10);
      } else {
        const lastColon = peerField.lastIndexOf(':');
        if (lastColon === -1) continue;
        remoteAddr = peerField.substring(0, lastColon);
        remotePort = parseInt(peerField.substring(lastColon + 1), 10);
      }

      if (LOOPBACK_SET.has(remoteAddr)) continue;

      // Normalize IPv6-mapped IPv4 to plain IPv4
      const v4Match = remoteAddr.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
      if (v4Match) remoteAddr = v4Match[1];

      // Skip pure IPv6 — only show IPv4 destinations
      if (remoteAddr.includes(':')) continue;

      // Extract process name and PID from users:(("name",pid=123,fd=4))
      let processName = 'unknown';
      let pid = 0;
      const rest = parts.slice(5).join(' ');
      const procMatch = rest.match(/\(\("([^"]+)",pid=(\d+)/);
      if (procMatch) {
        processName = procMatch[1];
        pid = parseInt(procMatch[2], 10);
      }

      parsed.push({ remoteAddr, remotePort, processName, pid });
    }

    // Group by process (pid)
    const procMap = new Map<number, { name: string; connections: number; remoteAddresses: Set<string> }>();
    for (const c of parsed) {
      let entry = procMap.get(c.pid);
      if (!entry) {
        entry = { name: c.processName, connections: 0, remoteAddresses: new Set() };
        procMap.set(c.pid, entry);
      }
      entry.connections++;
      entry.remoteAddresses.add(c.remoteAddr);
    }

    const processes: WindowsNetProcess[] = [...procMap.entries()]
      .map(([pid, e]) => ({ pid, name: e.name, connections: e.connections, remoteAddresses: [...e.remoteAddresses] }))
      .sort((a, b) => b.connections - a.connections)
      .slice(0, 15);

    // Group by remote address (skip private/loopback for destinations)
    const destMap = new Map<string, { port: number; portCounts: Map<number, number>; connections: number; processes: Set<string> }>();
    for (const c of parsed) {
      if (isPrivateIP(c.remoteAddr)) continue;
      let entry = destMap.get(c.remoteAddr);
      if (!entry) {
        entry = { port: c.remotePort, portCounts: new Map(), connections: 0, processes: new Set() };
        destMap.set(c.remoteAddr, entry);
      }
      entry.connections++;
      entry.portCounts.set(c.remotePort, (entry.portCounts.get(c.remotePort) || 0) + 1);
      entry.processes.add(c.processName);
    }

    const destinations: WindowsNetDestination[] = [...destMap.entries()]
      .map(([address, e]) => {
        let topPort = e.port;
        let topCount = 0;
        for (const [port, count] of e.portCounts) {
          if (count > topCount) { topPort = port; topCount = count; }
        }
        return { address, port: topPort, connections: e.connections, processes: [...e.processes] };
      })
      .sort((a, b) => b.connections - a.connections)
      .slice(0, 20);

    return { processes, destinations, rxBps: 0, txBps: 0 };
  } catch {
    return { processes: [], destinations: [], rxBps: 0, txBps: 0 };
  }
}

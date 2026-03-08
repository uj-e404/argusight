import type { DiskInfo, ProcessInfo, GpuInfo, GpuProcessInfo, WindowsNetData, WindowsNetProcess, WindowsNetDestination } from '../types';
import type { MikroTikInterface } from './mikrotik';

export function parseCpuWindows(raw: string): number {
  // Input from: Get-CimInstance Win32_Processor | Select-Object -ExpandProperty LoadPercentage
  const val = parseInt(raw.trim(), 10);
  return isNaN(val) ? 0 : val;
}

export function parseMemoryWindows(raw: string): { total: number; used: number; percent: number } {
  // Input from: Get-CimInstance Win32_OperatingSystem | Select-Object TotalVisibleMemorySize,FreePhysicalMemory | ConvertTo-Json
  try {
    const obj = JSON.parse(raw);
    const totalKb = obj.TotalVisibleMemorySize || 0;
    const freeKb = obj.FreePhysicalMemory || 0;
    const total = totalKb * 1024;
    const used = (totalKb - freeKb) * 1024;
    return {
      total,
      used,
      percent: totalKb > 0 ? Math.round(((totalKb - freeKb) / totalKb) * 100) : 0,
    };
  } catch {
    return { total: 0, used: 0, percent: 0 };
  }
}

export function parseDiskWindows(raw: string): DiskInfo[] {
  // Input from: Get-Volume | Select-Object DriveLetter,FileSystem,Size,SizeRemaining | ConvertTo-Json
  try {
    const data = JSON.parse(raw);
    const volumes = Array.isArray(data) ? data : [data];
    return volumes
      .filter((v: Record<string, unknown>) => v.DriveLetter && v.Size)
      .map((v: Record<string, unknown>) => {
        const size = v.Size as number;
        const remaining = (v.SizeRemaining as number) || 0;
        const used = size - remaining;
        const formatBytes = (b: number) => {
          if (b >= 1e12) return `${(b / 1e12).toFixed(1)}T`;
          if (b >= 1e9) return `${(b / 1e9).toFixed(1)}G`;
          if (b >= 1e6) return `${(b / 1e6).toFixed(1)}M`;
          return `${b}B`;
        };
        return {
          filesystem: `${v.DriveLetter}:`,
          fstype: (v.FileSystem as string) || '',
          size: formatBytes(size),
          used: formatBytes(used),
          available: formatBytes(remaining),
          usePercent: size > 0 ? Math.round((used / size) * 100) : 0,
          mountpoint: `${v.DriveLetter}:\\`,
        };
      });
  } catch {
    return [];
  }
}

export function parseProcessWindows(raw: string, logicalProcessors?: number): ProcessInfo[] {
  // Input from: Get-CimInstance Win32_PerfFormattedData_PerfProc_Process | ConvertTo-Json
  try {
    const data = JSON.parse(raw);
    const procs = Array.isArray(data) ? data : [data];
    const cores = logicalProcessors && logicalProcessors > 0 ? logicalProcessors : 1;
    return procs.map((p: Record<string, unknown>) => {
      const memBytes = (p.WorkingSetPrivate as number) || (p.WorkingSet64 as number) || 0;
      // Strip #N suffix from duplicate process names (e.g., "chrome#3" → "chrome")
      const rawName = (p.Name as string) || (p.ProcessName as string) || '';
      const name = rawName.replace(/#\d+$/, '');
      const rawCpu = (p.PercentProcessorTime as number) ?? 0;
      return {
        pid: (p.IDProcess as number) || (p.Id as number) || 0,
        user: '',
        name,
        // Normalize CPU% like Task Manager: divide by logical processor count
        cpu: Math.round((rawCpu / cores) * 10) / 10,
        // RAM in MB (converted from bytes)
        ram: Math.round(memBytes / 1024 / 1024),
        memoryBytes: memBytes,
      };
    });
  } catch {
    return [];
  }
}

export function parseWindowsNetAdapters(raw: string): MikroTikInterface[] {
  // Input from: Get-NetAdapter | Where-Object { $_.Status -eq 'Up' } | Select-Object Name,InterfaceDescription,LinkSpeed | ConvertTo-Json
  try {
    const data = JSON.parse(raw);
    const adapters = Array.isArray(data) ? data : [data];
    return adapters.map((a: Record<string, unknown>) => ({
      name: (a.Name as string) || '',
      type: (a.InterfaceDescription as string) || '',
      running: true,
      disabled: false,
    }));
  } catch {
    return [];
  }
}

export function parseWindowsNetStats(raw: string): { receivedBytes: number; sentBytes: number } {
  // Input from: Get-NetAdapterStatistics -Name '...' | Select-Object ReceivedBytes,SentBytes | ConvertTo-Json
  try {
    const obj = JSON.parse(raw);
    return {
      receivedBytes: (obj.ReceivedBytes as number) || 0,
      sentBytes: (obj.SentBytes as number) || 0,
    };
  } catch {
    return { receivedBytes: 0, sentBytes: 0 };
  }
}

const LOOPBACK_SET = new Set(['127.0.0.1', '::1', '0.0.0.0', '::', '']);
const SYSTEM_PIDS = new Set([0, 4]);

function isPrivateIP(ip: string): boolean {
  if (ip.includes(':')) return ip.startsWith('fe80') || ip === '::1' || ip === '::';
  const parts = ip.split('.').map(Number);
  if (parts[0] === 10) return true;
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
  if (parts[0] === 192 && parts[1] === 168) return true;
  if (parts[0] === 127) return true;
  return false;
}

export function parseWindowsNetConnections(connectionsRaw: string, processesRaw: string): WindowsNetData {
  try {
    const connData = JSON.parse(connectionsRaw);
    const connections: { OwningProcess: number; RemoteAddress: string; RemotePort: number }[] =
      Array.isArray(connData) ? connData : [connData];

    const procData = JSON.parse(processesRaw);
    const procList: { Id: number; ProcessName: string }[] = Array.isArray(procData) ? procData : [procData];
    const pidToName = new Map<number, string>();
    for (const p of procList) {
      pidToName.set(p.Id, p.ProcessName || 'Unknown');
    }

    // Filter out loopback and system PIDs
    const valid = connections.filter(
      (c) => !LOOPBACK_SET.has(c.RemoteAddress) && !SYSTEM_PIDS.has(c.OwningProcess)
    );

    // Group by process
    const procMap = new Map<number, { name: string; connections: number; remoteAddresses: Set<string> }>();
    for (const c of valid) {
      let entry = procMap.get(c.OwningProcess);
      if (!entry) {
        entry = { name: pidToName.get(c.OwningProcess) || `PID ${c.OwningProcess}`, connections: 0, remoteAddresses: new Set() };
        procMap.set(c.OwningProcess, entry);
      }
      entry.connections++;
      entry.remoteAddresses.add(c.RemoteAddress);
    }

    const processes: WindowsNetProcess[] = [...procMap.entries()]
      .map(([pid, e]) => ({ pid, name: e.name, connections: e.connections, remoteAddresses: [...e.remoteAddresses] }))
      .sort((a, b) => b.connections - a.connections)
      .slice(0, 15);

    // Group by remote address (skip private/loopback for destinations)
    const destMap = new Map<string, { port: number; portCounts: Map<number, number>; connections: number; processes: Set<string> }>();
    for (const c of valid) {
      if (isPrivateIP(c.RemoteAddress)) continue;
      let entry = destMap.get(c.RemoteAddress);
      if (!entry) {
        entry = { port: c.RemotePort, portCounts: new Map(), connections: 0, processes: new Set() };
        destMap.set(c.RemoteAddress, entry);
      }
      entry.connections++;
      entry.portCounts.set(c.RemotePort, (entry.portCounts.get(c.RemotePort) || 0) + 1);
      const pname = pidToName.get(c.OwningProcess);
      if (pname) entry.processes.add(pname);
    }

    const destinations: WindowsNetDestination[] = [...destMap.entries()]
      .map(([address, e]) => {
        // Find most common port
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

export function parseGpuWindows(raw: string): GpuInfo | null {
  // Same nvidia-smi format as Linux
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

export function parseGpuProcessesWindows(raw: string): GpuProcessInfo[] {
  // Same nvidia-smi format as Linux
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

import type { DiskInfo, ProcessInfo, GpuInfo } from '../types';

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

export function parseProcessWindows(raw: string): ProcessInfo[] {
  // Input from: Get-Process | Sort-Object CPU -Descending | Select-Object -First 20 ... | ConvertTo-Json
  try {
    const data = JSON.parse(raw);
    const procs = Array.isArray(data) ? data : [data];
    return procs.map((p: Record<string, unknown>) => ({
      pid: (p.Id as number) || 0,
      user: '',
      name: (p.ProcessName as string) || '',
      cpu: Math.round(((p.CPU as number) || 0) * 100) / 100,
      ram: 0,
      memoryBytes: (p.WorkingSet64 as number) || 0,
    }));
  } catch {
    return [];
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

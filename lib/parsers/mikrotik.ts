export interface MikroTikResource {
  cpuLoad: number;
  freeMemory: number;
  totalMemory: number;
  memPercent: number;
  uptime: string;
  boardName: string;
  version: string;
}

export interface MikroTikTraffic {
  interface: string;
  rxBps: number;
  txBps: number;
}

export interface MikroTikInterface {
  name: string;
  type: string;
  running: boolean;
  disabled: boolean;
}

export interface MikroTikHotspotUser {
  user: string;
  address: string;
  macAddress: string;
  uptime: string;
  bytesIn: number;
  bytesOut: number;
}

export interface MikroTikDnsEntry {
  name: string;
  address: string;
  ttl: string;
}

function parseKeyValue(raw: string): Record<string, string> {
  const result: Record<string, string> = {};
  const lines = raw.trim().split('\n');
  for (const line of lines) {
    const match = line.match(/^\s*([^:]+):\s*(.*)/);
    if (match) {
      result[match[1].trim()] = match[2].trim();
    }
  }
  return result;
}

export function parseMikroTikResource(raw: string): MikroTikResource {
  const kv = parseKeyValue(raw);
  const totalMem = parseInt(kv['total-memory'] || '0', 10);
  const freeMem = parseInt(kv['free-memory'] || '0', 10);
  return {
    cpuLoad: parseInt(kv['cpu-load'] || '0', 10),
    freeMemory: freeMem,
    totalMemory: totalMem,
    memPercent: totalMem > 0 ? Math.round(((totalMem - freeMem) / totalMem) * 100) : 0,
    uptime: kv['uptime'] || '',
    boardName: kv['board-name'] || '',
    version: kv['version'] || '',
  };
}

export function parseMikroTikTraffic(raw: string): MikroTikTraffic {
  const kv = parseKeyValue(raw);
  const parseBps = (val: string): number => {
    if (!val) return 0;
    const num = parseInt(val, 10);
    return isNaN(num) ? 0 : num;
  };
  return {
    interface: kv['name'] || '',
    rxBps: parseBps(kv['rx-bits-per-second']),
    txBps: parseBps(kv['tx-bits-per-second']),
  };
}

export function parseMikroTikInterfaces(raw: string): MikroTikInterface[] {
  // RouterOS table format — parse flags and columns
  const lines = raw.trim().split('\n');
  const results: MikroTikInterface[] = [];

  for (const line of lines) {
    // Skip header/separator lines
    if (line.startsWith('#') || line.startsWith('Flags') || !line.trim()) continue;

    const parts = line.trim().split(/\s+/);
    if (parts.length < 2) continue;

    // Flags column, then name, type
    const flags = parts[0];
    results.push({
      name: parts[1] || '',
      type: parts[2] || '',
      running: flags.includes('R'),
      disabled: flags.includes('X'),
    });
  }
  return results;
}

export function parseMikroTikHotspot(raw: string): MikroTikHotspotUser[] {
  const lines = raw.trim().split('\n');
  const results: MikroTikHotspotUser[] = [];

  for (const line of lines) {
    if (line.startsWith('#') || line.startsWith('Flags') || !line.trim()) continue;

    const kv = parseKeyValue(line);
    if (Object.keys(kv).length === 0) {
      // Try space-delimited table format
      const parts = line.trim().split(/\s+/);
      if (parts.length >= 4) {
        results.push({
          user: parts[1] || '',
          address: parts[2] || '',
          macAddress: parts[3] || '',
          uptime: parts[4] || '',
          bytesIn: parseInt(parts[5] || '0', 10) || 0,
          bytesOut: parseInt(parts[6] || '0', 10) || 0,
        });
      }
    }
  }
  return results;
}

export function parseMikroTikDns(raw: string): MikroTikDnsEntry[] {
  const lines = raw.trim().split('\n');
  const results: MikroTikDnsEntry[] = [];

  for (const line of lines) {
    if (line.startsWith('#') || line.startsWith('Flags') || !line.trim()) continue;

    const parts = line.trim().split(/\s+/);
    if (parts.length >= 3) {
      results.push({
        name: parts[0],
        address: parts[1],
        ttl: parts[2],
      });
    }
  }
  return results;
}

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
  rateIn: number;
  rateOut: number;
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
    // Handle RouterOS bandwidth format: "12.8kbps", "1.5Mbps", "2.3Gbps", "952bps"
    const match = val.match(/^([\d.]+)\s*(bps|kbps|Mbps|Gbps)/i);
    if (!match) return parseInt(val, 10) || 0;
    const num = parseFloat(match[1]);
    const unit = match[2].toLowerCase();
    if (unit === 'gbps') return Math.round(num * 1_000_000_000);
    if (unit === 'mbps') return Math.round(num * 1_000_000);
    if (unit === 'kbps') return Math.round(num * 1_000);
    return Math.round(num);
  };
  return {
    interface: kv['name'] || '',
    rxBps: parseBps(kv['rx-bits-per-second']),
    txBps: parseBps(kv['tx-bits-per-second']),
  };
}

export function parseMikroTikInterfaces(raw: string): MikroTikInterface[] {
  // RouterOS fixed-width table. Find column positions from header line.
  // Header example:  #    NAME          TYPE    ACTUAL-MTU ...
  // Data example:    0    ASTINET E10   ether         1500 ...
  //                  1 R  WAN           ether         1500 ...
  //                  2 RS ether2        ether         1500 ...
  const lines = raw.trim().split('\n');
  const results: MikroTikInterface[] = [];

  // Find header line with column positions
  const headerLine = lines.find((l) => /^\s*#/.test(l) && /NAME/.test(l));
  if (!headerLine) {
    // Fallback: parse from "Columns:" header
    // Try simple regex approach for each data line
    for (const line of lines) {
      if (!line.trim() || /^(Flags|Columns|#|;;;)/i.test(line.trim())) continue;
      const match = line.match(/^\s*\d+\s+([DRXS ]{0,3})\s+(\S+)\s+(\S+)/);
      if (!match) continue;
      const flags = match[1].trim();
      results.push({
        name: match[2],
        type: match[3],
        running: flags.includes('R'),
        disabled: flags.includes('X'),
      });
    }
    return results;
  }

  // Determine column start positions from header
  const nameCol = headerLine.indexOf('NAME');
  const typeCol = headerLine.indexOf('TYPE');
  // Find next column after TYPE by looking for the next uppercase word start
  const afterType = headerLine.substring(typeCol + 4).match(/\s([A-Z])/);
  const typeEnd = afterType ? typeCol + 4 + (afterType.index ?? 0) + 1 : headerLine.length;

  for (const line of lines) {
    if (!line.trim() || /^(Flags|Columns|#|;;;)/i.test(line.trim())) continue;
    if (line.length < typeCol) continue;

    // Extract flags: between number and NAME column
    const prefix = line.substring(0, nameCol);
    const flagMatch = prefix.match(/\d+\s+([A-Z]*)/);
    if (!flagMatch) continue;
    const flags = flagMatch[1];

    // Extract name and type by column positions
    const name = line.substring(nameCol, typeCol).trim();
    const type = line.substring(typeCol, typeEnd).trim();

    if (!name || name === 'NAME' || name === 'NAME,') continue;

    results.push({
      name,
      type,
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
          rateIn: 0,
          rateOut: 0,
        });
      }
    }
  }
  return results;
}

export function parseMikroTikConnections(raw: string): Map<string, number> {
  const counts = new Map<string, number>();
  const lines = raw.trim().split('\n');

  for (const line of lines) {
    // Skip header/flag/empty lines
    if (!line.trim() || /^(Flags|Columns|#)/i.test(line.trim())) continue;

    // Table format: ... SRC-ADDRESS DST-ADDRESS ...
    // Match dst-address (IP:port or just IP) — the 3rd IP-like column
    // Format: <num> <flags> <proto> <src-addr:port> <dst-addr:port> ...
    const match = line.match(/\d+\.\d+\.\d+\.\d+:\d+\s+(\d+\.\d+\.\d+\.\d+)/);
    if (match) {
      const addr = match[1];
      counts.set(addr, (counts.get(addr) || 0) + 1);
    }
  }
  return counts;
}

export interface ConnectionParseResult {
  connPerSource: Map<string, Map<string, number>>;
  bytesPerIp: Map<string, { bytesIn: number; bytesOut: number }>;
}

export function parseMikroTikConnectionsDetail(raw: string): ConnectionParseResult {
  // Parse `/ip firewall connection print detail` output
  // Each entry: protocol=tcp src-address=192.168.1.2:51234 dst-address=8.8.8.8:443 orig-bytes=1234 repl-bytes=5678
  const connPerSource = new Map<string, Map<string, number>>();
  const bytesPerIp = new Map<string, { bytesIn: number; bytesOut: number }>();

  // Split into entries — each entry starts with a number index or flags
  const entries = raw.split(/(?=^\s*\d+\s)/m).filter(Boolean);

  for (const entry of entries) {
    const flat = entry.replace(/\r?\n\s+/g, ' ').trim();
    if (/^(Flags|Columns)/i.test(flat)) continue;

    const srcMatch = flat.match(/src-address=(\d+\.\d+\.\d+\.\d+):\d+/);
    const dstMatch = flat.match(/dst-address=(\d+\.\d+\.\d+\.\d+)/);
    if (!srcMatch || !dstMatch) continue;

    const srcIp = srcMatch[1];
    const dstIp = dstMatch[1];

    // Connection count
    let dstMap = connPerSource.get(srcIp);
    if (!dstMap) {
      dstMap = new Map<string, number>();
      connPerSource.set(srcIp, dstMap);
    }
    dstMap.set(dstIp, (dstMap.get(dstIp) || 0) + 1);

    // Bytes: orig-bytes = bytes sent by src, repl-bytes = bytes received by src
    const origMatch = flat.match(/orig-bytes=(\d+)/);
    const replMatch = flat.match(/repl-bytes=(\d+)/);
    const origBytes = origMatch ? parseInt(origMatch[1], 10) : 0;
    const replBytes = replMatch ? parseInt(replMatch[1], 10) : 0;

    const srcTraffic = bytesPerIp.get(srcIp) || { bytesIn: 0, bytesOut: 0 };
    srcTraffic.bytesOut += origBytes;
    srcTraffic.bytesIn += replBytes;
    bytesPerIp.set(srcIp, srcTraffic);
  }

  return { connPerSource, bytesPerIp };
}

export function parseMikroTikArp(raw: string): Map<string, string> {
  // Returns Map<ip, mac>
  const result = new Map<string, string>();
  const lines = raw.trim().split('\n');

  for (const line of lines) {
    if (!line.trim() || /^(Flags|Columns|#)/i.test(line.trim())) continue;

    // RouterOS ARP table format: num flags ADDRESS MAC-ADDRESS INTERFACE
    const match = line.match(/(\d+\.\d+\.\d+\.\d+)\s+([0-9A-Fa-f:]{17})/);
    if (match) {
      result.set(match[1], match[2].toUpperCase());
    }
  }
  return result;
}

export interface DhcpLeaseInfo {
  hostname: string;
  comment: string;
}

export function parseMikroTikDhcpLeases(raw: string): Map<string, string> {
  // Returns Map<ip, hostname> (backward compat)
  const detailed = parseMikroTikDhcpLeasesDetailed(raw);
  const result = new Map<string, string>();
  for (const [ip, info] of detailed) {
    result.set(ip, info.hostname);
  }
  return result;
}

export function parseMikroTikDhcpLeasesDetailed(raw: string): Map<string, DhcpLeaseInfo> {
  // Returns Map<ip, { hostname, comment }>
  // Comments appear as `;;; Some Label` lines before the lease entry
  const result = new Map<string, DhcpLeaseInfo>();
  const lines = raw.trim().split('\n');

  let pendingComment = '';
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || /^(Flags|Columns|#\s)/i.test(trimmed)) continue;

    // Capture ;;; comment lines
    if (trimmed.startsWith(';;;')) {
      pendingComment = trimmed.replace(/^;;;\s*/, '').trim();
      continue;
    }

    const ipMatch = line.match(/(\d+\.\d+\.\d+\.\d+)/);
    if (!ipMatch) { pendingComment = ''; continue; }

    const ip = ipMatch[1];
    const parts = trimmed.split(/\s+/);
    const macIdx = parts.findIndex((p) => /^[0-9A-Fa-f:]{17}$/.test(p));
    let hostname = '';
    if (macIdx !== -1 && macIdx + 1 < parts.length) {
      const h = parts[macIdx + 1];
      if (h && !/^\d+\.\d+\.\d+\.\d+$/.test(h) && h !== 'bound' && h !== 'waiting') {
        hostname = h.replace(/"/g, '');
      }
    }

    result.set(ip, { hostname, comment: pendingComment });
    pendingComment = '';
  }
  return result;
}

export interface MikroTikAccountingEntry {
  srcAddr: string;
  dstAddr: string;
  bytes: number;
  packets: number;
}

export function parseMikroTikAccounting(raw: string): MikroTikAccountingEntry[] {
  // RouterOS accounting snapshot format varies:
  // Without index: SRC-ADDRESS  DST-ADDRESS  PACKETS  BYTES
  // With index:    #  SRC-ADDRESS  DST-ADDRESS  PACKETS  BYTES  SRC-USER  DST-USER
  const results: MikroTikAccountingEntry[] = [];
  const lines = raw.trim().split('\n');

  for (const line of lines) {
    if (!line.trim() || /^(SRC|Flags|Columns|#)/i.test(line.trim())) continue;

    const parts = line.trim().split(/\s+/);
    // Find the two consecutive IP addresses (skip leading index if present)
    let ipStart = -1;
    for (let i = 0; i < parts.length - 1; i++) {
      if (/^\d+\.\d+\.\d+\.\d+$/.test(parts[i]) && /^\d+\.\d+\.\d+\.\d+$/.test(parts[i + 1])) {
        ipStart = i;
        break;
      }
    }
    if (ipStart < 0) continue;

    const srcAddr = parts[ipStart];
    const dstAddr = parts[ipStart + 1];
    // After the two IPs: PACKETS then BYTES
    const num1 = parseInt(parts[ipStart + 2], 10) || 0;
    const num2 = parseInt(parts[ipStart + 3], 10) || 0;
    results.push({
      srcAddr,
      dstAddr,
      bytes: num2,
      packets: num1,
    });
  }
  return results;
}

// Lightweight parser for /ip firewall connection print (no detail)
// Extracts src-ip → dst-ip pairs for destination tracking
export function parseMikroTikConnectionPairs(raw: string): Map<string, Set<string>> {
  const result = new Map<string, Set<string>>();
  const lines = raw.trim().split('\n');
  const ipPortRe = /^(\d+\.\d+\.\d+\.\d+):\d+$/;

  for (const line of lines) {
    if (!line.trim() || /^(Flags|Columns|#|$)/i.test(line.trim())) continue;
    const parts = line.trim().split(/\s+/);
    // Find two consecutive ip:port patterns
    for (let i = 0; i < parts.length - 1; i++) {
      const srcMatch = ipPortRe.exec(parts[i]);
      const dstMatch = ipPortRe.exec(parts[i + 1]);
      if (srcMatch && dstMatch) {
        const srcIp = srcMatch[1];
        const dstIp = dstMatch[1];
        let dsts = result.get(srcIp);
        if (!dsts) { dsts = new Set(); result.set(srcIp, dsts); }
        dsts.add(dstIp);
        break;
      }
    }
  }
  return result;
}

export interface MikroTikQueueStats {
  name: string;
  target: string; // IP like "192.168.30.29/32"
  bytesUp: number;
  bytesDown: number;
  rate: string; // e.g. "168bps/168bps"
}

export function parseMikroTikQueueStats(raw: string): MikroTikQueueStats[] {
  // Parse `/queue simple print stats` output
  // Each entry is multi-line, separated by entry index
  const results: MikroTikQueueStats[] = [];
  const entries = raw.split(/(?=^\s*\d+\s)/m).filter(Boolean);

  for (const entry of entries) {
    if (/^Flags/i.test(entry.trim())) continue;

    const flat = entry.replace(/\r?\n\s+/g, ' ').trim();

    const getValue = (key: string): string => {
      // (?:^|\s) prevents matching sub-keys (e.g. "queued-bytes" when searching "bytes")
      const re = new RegExp(`(?:^|\\s)${key}=(?:"([^"]*)"|([^\\s]+))`);
      const m = flat.match(re);
      return m ? (m[1] ?? m[2] ?? '') : '';
    };

    const name = getValue('name');
    const target = getValue('target');
    const bytesStr = getValue('bytes');
    const rate = getValue('rate');

    if (!target) continue;

    // bytes format: "upload/download" e.g. "77289755/1100658837"
    let bytesUp = 0;
    let bytesDown = 0;
    if (bytesStr) {
      const parts = bytesStr.split('/');
      bytesUp = parseInt(parts[0], 10) || 0;
      bytesDown = parseInt(parts[1], 10) || 0;
    }

    results.push({ name, target, bytesUp, bytesDown, rate });
  }
  return results;
}

export function parseMikroTikHotspotStats(raw: string): Map<number, { bytesIn: number; bytesOut: number }> {
  // Parse `/ip hotspot active print stats` table output
  // Columns: USER, UPTIME, BYTES-IN, BYTES-OUT, PACKETS-IN, PACKETS-OUT
  //  0 guru  13h4m3s   5359604   60298000       49799        58388
  // Key by index (not username, since multiple users can share a username)
  const result = new Map<number, { bytesIn: number; bytesOut: number }>();
  const lines = raw.trim().split('\n');

  for (const line of lines) {
    if (!line.trim() || /^(Flags|Columns|#)/i.test(line.trim())) continue;
    const parts = line.trim().split(/\s+/);
    // parts: [index, user, uptime, bytes-in, bytes-out, packets-in, packets-out]
    if (parts.length >= 5) {
      const idx = parseInt(parts[0], 10);
      const bytesIn = parseInt(parts[3], 10) || 0;
      const bytesOut = parseInt(parts[4], 10) || 0;
      if (!isNaN(idx)) {
        result.set(idx, { bytesIn, bytesOut });
      }
    }
  }
  return result;
}

export function parseMikroTikHotspotDetail(raw: string): MikroTikHotspotUser[] {
  const results: MikroTikHotspotUser[] = [];

  // Split entries by line starting with a number (entry index)
  // Format:  0    server=hotspot1 user="guru" address=192.168.88.126
  //          mac-address=08:D4:0C:51:B9:27 login-by="http-chap" uptime=10h7m28s
  const entries = raw.split(/(?=^\s*\d+\s)/m).filter(Boolean);

  for (const entry of entries) {
    // Skip flags/header lines
    if (/^Flags/i.test(entry.trim())) continue;

    // Merge multi-line into single string
    const flat = entry.replace(/\r?\n\s+/g, ' ').trim();

    // Extract key=value or key="value" pairs
    const getValue = (key: string): string => {
      // (?:^|\s) prevents matching sub-keys (e.g. "queued-bytes" when searching "bytes")
      const re = new RegExp(`(?:^|\\s)${key}=(?:"([^"]*)"|([^\\s]+))`);
      const m = flat.match(re);
      return m ? (m[1] ?? m[2] ?? '') : '';
    };

    const user = getValue('user');
    const address = getValue('address');
    if (!user && !address) continue;

    const parseBytesValue = (val: string): number => {
      if (!val) return 0;
      // Handle RouterOS byte format: "1.5MiB", "234KiB", "5GiB", or raw number
      const m = val.match(/^([\d.]+)\s*(GiB|MiB|KiB)?/i);
      if (!m) return parseInt(val, 10) || 0;
      const num = parseFloat(m[1]);
      const unit = (m[2] || '').toLowerCase();
      if (unit === 'gib') return Math.round(num * 1073741824);
      if (unit === 'mib') return Math.round(num * 1048576);
      if (unit === 'kib') return Math.round(num * 1024);
      return Math.round(num);
    };

    results.push({
      user,
      address,
      macAddress: getValue('mac-address'),
      uptime: getValue('uptime'),
      bytesIn: parseBytesValue(getValue('bytes-in')),
      bytesOut: parseBytesValue(getValue('bytes-out')),
      rateIn: 0,
      rateOut: 0,
    });
  }
  return results;
}

export function parseMikroTikDns(raw: string): MikroTikDnsEntry[] {
  // RouterOS DNS cache format:
  // Columns: NAME, TYPE, DATA, TTL
  //    # NAME                TYPE  DATA            TTL
  //   14 forcesafesearch...  A     216.239.38.120  20h43m21s
  const lines = raw.trim().split('\n');
  const results: MikroTikDnsEntry[] = [];

  for (const line of lines) {
    if (!line.trim() || /^(Flags|Columns|#)/i.test(line.trim())) continue;

    // Match: number, name, type, data (IP), ttl
    const match = line.match(/^\s*\d+\s+(\S+)\s+(A|AAAA)\s+(\S+)\s+(\S+)/);
    if (!match) continue;

    // Only include A records (IPv4) for connection matching
    if (match[2] !== 'A') continue;

    results.push({
      name: match[1],
      address: match[3],
      ttl: match[4],
    });
  }
  return results;
}

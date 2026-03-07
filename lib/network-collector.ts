import { sshPool } from './ssh-pool';
import { logger } from './logger';
import {
  parseMikroTikArp,
  parseMikroTikDhcpLeasesDetailed,
  parseMikroTikAccounting,
  parseMikroTikDns,
  parseMikroTikQueueStats,
  parseMikroTikConnectionPairs,
} from './parsers/mikrotik';
import { resolveMany } from './dns-cache';
import type { NetworkClient } from './types';

// Accumulate destination data across multiple polls (accounting snapshots are short-lived)
// Key: serverId → srcIp → dstIp → { bytes, lastSeen }
const destAccumulator = new Map<string, Map<string, Map<string, { bytes: number; lastSeen: number }>>>();
const DEST_MAX_AGE = 60_000; // Keep destinations seen in last 60s
const accountingWarnedServers = new Set<string>();

export function clearDestAccumulator(serverId: string) {
  destAccumulator.delete(serverId);
}

function isPrivateIp(ip: string): boolean {
  const parts = ip.split('.').map(Number);
  if (parts[0] === 10) return true;
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
  if (parts[0] === 192 && parts[1] === 168) return true;
  return false;
}

export async function collectNetworkData(serverId: string): Promise<NetworkClient[]> {
  // Standardized approach: accounting snapshot + queue stats + ARP/DHCP
  // Avoids heavy `/ip firewall connection print detail` which times out on older/slower routers
  await sshPool.exec(serverId, '/ip accounting snapshot take').catch((err) => {
    if (!accountingWarnedServers.has(serverId)) {
      logger.warn('network', `Accounting snapshot failed for ${serverId}`, { error: (err as Error).message });
      accountingWarnedServers.add(serverId);
    }
    return '';
  });

  const [arpRaw, dhcpRaw, accountingRaw, dnsRaw, queueRaw, connRaw] = await Promise.all([
    sshPool.exec(serverId, '/ip arp print').catch(() => ''),
    sshPool.exec(serverId, '/ip dhcp-server lease print').catch(() => ''),
    sshPool.exec(serverId, '/ip accounting snapshot print').catch(() => ''),
    sshPool.exec(serverId, '/ip dns cache print').catch(() => ''),
    sshPool.exec(serverId, '/queue simple print stats').catch(() => ''),
    sshPool.exec(serverId, '/ip firewall connection print where src-address~"192.168"').catch(() => ''),
  ]);

  const arpMap = parseMikroTikArp(arpRaw);
  const dhcpDetailed = parseMikroTikDhcpLeasesDetailed(dhcpRaw);
  const accounting = parseMikroTikAccounting(accountingRaw);
  const dnsEntries = parseMikroTikDns(dnsRaw);
  const queueStats = parseMikroTikQueueStats(queueRaw);
  const connPairs = parseMikroTikConnectionPairs(connRaw);

  // DNS cache → IP-to-domain map
  const ipToDomain = new Map<string, string>();
  for (const entry of dnsEntries) {
    if (!ipToDomain.has(entry.address)) {
      ipToDomain.set(entry.address, entry.name);
    }
  }

  // Build bytes map — prefer queue stats (cumulative, delta-friendly),
  // then accounting snapshot as fallback
  const clientMap = new Map<string, { bytesIn: number; bytesOut: number }>();

  // 1. Queue stats: cumulative bytes, works reliably with delta rate calculation
  const queueIps = new Set<string>();
  for (const q of queueStats) {
    const ipMatch = q.target.match(/^(\d+\.\d+\.\d+\.\d+)/);
    if (!ipMatch) continue;
    const ip = ipMatch[1];
    queueIps.add(ip);
    clientMap.set(ip, { bytesIn: q.bytesDown, bytesOut: q.bytesUp });
  }

  // 2. Accounting snapshot: per-interval bytes (snapshot take clears the table)
  // Only use for bytes on IPs NOT already covered by queue stats
  for (const entry of accounting) {
    if (!queueIps.has(entry.srcAddr)) {
      const existing = clientMap.get(entry.srcAddr) || { bytesIn: 0, bytesOut: 0 };
      existing.bytesOut += entry.bytes;
      clientMap.set(entry.srcAddr, existing);
    }
    if (!queueIps.has(entry.dstAddr)) {
      const dst = clientMap.get(entry.dstAddr) || { bytesIn: 0, bytesOut: 0 };
      dst.bytesIn += entry.bytes;
      clientMap.set(entry.dstAddr, dst);
    }
  }

  // Accumulate destinations from accounting across multiple polls
  const now = Date.now();
  let serverDests = destAccumulator.get(serverId);
  if (!serverDests) {
    serverDests = new Map();
    destAccumulator.set(serverId, serverDests);
  }

  // Add current accounting entries (has bytes info)
  for (const entry of accounting) {
    const srcIp = entry.srcAddr;
    const dstIp = entry.dstAddr;
    if (!isPrivateIp(srcIp)) continue;

    let srcDests = serverDests.get(srcIp);
    if (!srcDests) {
      srcDests = new Map();
      serverDests.set(srcIp, srcDests);
    }
    const existing = srcDests.get(dstIp);
    srcDests.set(dstIp, {
      bytes: (existing?.bytes || 0) + entry.bytes,
      lastSeen: now,
    });
  }

  // Add connection tracking pairs as fallback (no bytes, just presence)
  for (const [srcIp, dstSet] of connPairs) {
    if (!isPrivateIp(srcIp)) continue;
    let srcDests = serverDests.get(srcIp);
    if (!srcDests) {
      srcDests = new Map();
      serverDests.set(srcIp, srcDests);
    }
    for (const dstIp of dstSet) {
      if (isPrivateIp(dstIp)) continue; // skip private-to-private (local traffic)
      if (!srcDests.has(dstIp)) {
        srcDests.set(dstIp, { bytes: 0, lastSeen: now });
      } else {
        // Refresh lastSeen for existing entries
        const existing = srcDests.get(dstIp)!;
        existing.lastSeen = now;
      }
    }
  }

  // Prune stale entries
  for (const [srcIp, srcDests] of serverDests) {
    for (const [dstIp, info] of srcDests) {
      if (now - info.lastSeen > DEST_MAX_AGE) srcDests.delete(dstIp);
    }
    if (srcDests.size === 0) serverDests.delete(srcIp);
  }

  // Build connPerSource from accumulated data
  const connPerSource = new Map<string, Map<string, number>>();
  for (const [srcIp, srcDests] of serverDests) {
    const dstMap = new Map<string, number>();
    for (const [dstIp, info] of srcDests) {
      dstMap.set(dstIp, info.bytes);
    }
    connPerSource.set(srcIp, dstMap);
  }

  // Queue name map (for label fallback)
  const queueNameMap = new Map<string, string>();
  for (const q of queueStats) {
    const ipMatch = q.target.match(/^(\d+\.\d+\.\d+\.\d+)/);
    if (ipMatch) queueNameMap.set(ipMatch[1], q.name);
  }

  const allIps = new Set<string>([
    ...arpMap.keys(),
    ...[...dhcpDetailed.keys()],
    ...clientMap.keys(),
    ...connPerSource.keys(),
  ]);

  const clients: NetworkClient[] = [];
  for (const ip of allIps) {
    if (!isPrivateIp(ip)) continue;

    const traffic = clientMap.get(ip) || { bytesIn: 0, bytesOut: 0 };
    const dstMap = connPerSource.get(ip);
    const connectionCount = dstMap ? dstMap.size : 0;

    const topDestinations: { ip: string; domain?: string; connections: number }[] = [];
    if (dstMap) {
      const sorted = [...dstMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
      for (const [dstIp, bytes] of sorted) {
        topDestinations.push({ ip: dstIp, domain: ipToDomain.get(dstIp), connections: bytes });
      }
    }

    const dhcpInfo = dhcpDetailed.get(ip);
    const hostname = dhcpInfo?.hostname || '';
    const label = dhcpInfo?.comment || queueNameMap.get(ip) || hostname || '';

    clients.push({
      ip,
      mac: arpMap.get(ip) || '',
      hostname,
      label,
      bytesIn: traffic.bytesIn,
      bytesOut: traffic.bytesOut,
      rateIn: 0,
      rateOut: 0,
      connections: connectionCount,
      topDestinations,
      _bytesCumulative: queueIps.has(ip),
    });
  }

  // Reverse DNS for all destination IPs without domain (works even when DNS cache is empty)
  const missingIps = new Set<string>();
  for (const client of clients) {
    for (const dest of client.topDestinations) {
      if (!dest.domain) missingIps.add(dest.ip);
    }
  }
  if (missingIps.size > 0) {
    const resolved = await resolveMany([...missingIps]);
    for (const client of clients) {
      for (const dest of client.topDestinations) {
        if (!dest.domain) {
          const domain = resolved.get(dest.ip);
          if (domain) dest.domain = domain;
        }
      }
    }
  }

  clients.sort((a, b) => (b.bytesIn + b.bytesOut) - (a.bytesIn + a.bytesOut));
  return clients.slice(0, 100);
}

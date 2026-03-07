import { NextResponse } from 'next/server';
import { sshPool } from '@/lib/ssh-pool';
import { readServersConfig } from '@/lib/config-writer';
import { parseMikroTikDns, parseMikroTikConnections } from '@/lib/parsers/mikrotik';
import type { DomainTrafficEntry } from '@/lib/types';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ serverId: string }> }
) {
  const { serverId } = await params;

  let config;
  try {
    const serversConfig = readServersConfig();
    config = serversConfig.servers.find((s) => s.id === serverId);
  } catch {
    return NextResponse.json({ error: 'Failed to read config' }, { status: 500 });
  }

  if (!config) return NextResponse.json({ error: 'Server not found' }, { status: 404 });
  if (config.type !== 'mikrotik') return NextResponse.json({ error: 'Not a MikroTik server' }, { status: 400 });

  const state = sshPool.getStatus(serverId);
  if (state?.status !== 'connected') {
    return NextResponse.json({ error: 'Server not connected' }, { status: 503 });
  }

  try {
    const [dnsRaw, connRaw] = await Promise.all([
      sshPool.exec(serverId, '/ip dns cache print'),
      sshPool.exec(serverId, '/ip firewall connection print without-paging where src-address~"192.168"'),
    ]);

    const dnsEntries = parseMikroTikDns(dnsRaw);
    const connCounts = parseMikroTikConnections(connRaw);

    // Build address → domain lookup
    const addrToDomain = new Map<string, string>();
    for (const entry of dnsEntries) {
      if (entry.address) {
        addrToDomain.set(entry.address, entry.name);
      }
    }

    // Merge: for each address with connections, find domain name
    const domains: DomainTrafficEntry[] = [];
    for (const [addr, count] of connCounts) {
      const domainName = addrToDomain.get(addr);
      if (domainName) {
        domains.push({ name: domainName, address: addr, connections: count });
      }
    }

    // Sort by connections desc, limit to 100
    domains.sort((a, b) => b.connections - a.connections);
    return NextResponse.json({ domains: domains.slice(0, 100) });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

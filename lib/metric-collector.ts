import { WebSocket } from 'ws';
import { sshPool } from './ssh-pool';
import { logger } from './logger';
import { broadcast } from './broadcast';
import { readServersConfig } from './config-writer';
import { parseCpuStatDelta, parseMemory, parseDiskUsage, parseUptime } from './parsers/linux';
import { parseCpuWindows, parseMemoryWindows, parseDiskWindows } from './parsers/windows';
import { parseMikroTikResource, parseMikroTikTraffic, parseMikroTikHotspotDetail, parseMikroTikHotspotStats } from './parsers/mikrotik';
import { collectNetworkData, clearDestAccumulator } from './network-collector';
import type { ServerConfig, OverviewServerData, CpuRamData, TrafficPoint, MikroTikHotspotUser, NetworkClient } from './types';

const OVERVIEW_INTERVAL = 5000;
const DETAIL_INTERVAL = 2000;
const TRAFFIC_INTERVAL = 1000;
const HOTSPOT_INTERVAL = 2000;
const NETWORK_INTERVAL = 5000;
const RING_BUFFER_MAX = 150;
const TRAFFIC_BUFFER_MAX = 120;

let overviewTimer: ReturnType<typeof setInterval> | null = null;
let detailTimer: ReturnType<typeof setInterval> | null = null;
let trafficTimer: ReturnType<typeof setInterval> | null = null;
let hotspotTimer: ReturnType<typeof setInterval> | null = null;
let networkTimer: ReturnType<typeof setInterval> | null = null;

const latestOverview = new Map<string, OverviewServerData>();
const ringBuffers = new Map<string, CpuRamData[]>();
const trafficBuffers = new Map<string, TrafficPoint[]>();
const hotspotCache = new Map<string, { users: MikroTikHotspotUser[]; totalBytesIn: number; totalBytesOut: number; totalRateIn: number; totalRateOut: number }>();
const networkCache = new Map<string, NetworkClient[]>();
const previousNetworkSnapshot = new Map<string, Map<string, { bytesIn: number; bytesOut: number; timestamp: number }>>();
const previousHotspotSnapshot = new Map<string, Map<string, { bytesIn: number; bytesOut: number; timestamp: number }>>();

let getSubscribersFn: (() => Map<WebSocket, Set<string>>) | null = null;
let getInterfaceSelectionFn: ((serverId: string) => string | undefined) | null = null;
let serverConfigs: ServerConfig[] = [];

function syncConfigFromDisk() {
  try {
    const diskConfig = readServersConfig();
    const diskIds = new Set(diskConfig.servers.map((s) => s.id));
    const memoryIds = new Set(serverConfigs.map((s) => s.id));

    // Add new servers
    for (const s of diskConfig.servers) {
      if (!memoryIds.has(s.id)) {
        serverConfigs.push(s);
        sshPool.connect(s);
      }
    }

    // Remove deleted servers
    for (let i = serverConfigs.length - 1; i >= 0; i--) {
      if (!diskIds.has(serverConfigs[i].id)) {
        const removed = serverConfigs[i];
        serverConfigs.splice(i, 1);
        sshPool.removeConfig(removed.id);
        latestOverview.delete(removed.id);
        ringBuffers.delete(removed.id);
      }
    }

    // Update changed servers
    for (const s of diskConfig.servers) {
      const existing = serverConfigs.find((c) => c.id === s.id);
      if (existing && (existing.host !== s.host || existing.port !== s.port || existing.username !== s.username || existing.type !== s.type)) {
        Object.assign(existing, s);
        sshPool.removeConfig(s.id);
        sshPool.connect(s);
        ringBuffers.delete(s.id);
      }
    }
  } catch {
    // Config read failed, skip sync
  }
}

async function pollOneServer(config: ServerConfig): Promise<void> {
  const state = sshPool.getStatus(config.id);
  const status = state?.status ?? 'disconnected';

  const data: OverviewServerData = {
    serverId: config.id,
    name: config.name,
    host: config.host,
    type: config.type,
    os: config.os,
    specs: config.specs,
    features: config.features,
    tags: config.tags,
    status,
    cpu: 0,
    ram: 0,
    disk: 0,
    uptime: '',
  };

  if (status !== 'connected') {
    const existing = latestOverview.get(config.id);
    if (existing) {
      existing.status = status;
      latestOverview.set(config.id, existing);
    } else {
      latestOverview.set(config.id, data);
    }
    return;
  }

  try {
    if (config.type === 'linux') {
      const [cpuRaw, memRaw, diskRaw, uptimeRaw] = await Promise.all([
        sshPool.exec(config.id, 'cat /proc/stat'),
        sshPool.exec(config.id, 'free -b | grep Mem'),
        sshPool.exec(config.id, "df -h --output=source,fstype,size,used,avail,pcent,target | grep -v tmpfs | grep -v devtmpfs"),
        sshPool.exec(config.id, 'uptime -s'),
      ]);
      data.cpu = parseCpuStatDelta(cpuRaw, config.id);
      const mem = parseMemory(memRaw);
      data.ram = mem.percent;
      const disks = parseDiskUsage(diskRaw);
      data.disk = disks.length > 0 ? Math.max(...disks.map((d) => d.usePercent)) : 0;
      data.uptime = parseUptime(uptimeRaw);
    } else if (config.type === 'windows') {
      const [cpuRaw, memRaw, diskRaw] = await Promise.all([
        sshPool.exec(config.id, 'powershell -Command "Get-CimInstance Win32_Processor | Select-Object -ExpandProperty LoadPercentage"'),
        sshPool.exec(config.id, 'powershell -Command "Get-CimInstance Win32_OperatingSystem | Select-Object TotalVisibleMemorySize,FreePhysicalMemory | ConvertTo-Json"'),
        sshPool.exec(config.id, 'powershell -Command "Get-Volume | Select-Object DriveLetter,FileSystem,Size,SizeRemaining | ConvertTo-Json"'),
      ]);
      data.cpu = parseCpuWindows(cpuRaw);
      const mem = parseMemoryWindows(memRaw);
      data.ram = mem.percent;
      const disks = parseDiskWindows(diskRaw);
      data.disk = disks.length > 0 ? Math.max(...disks.map((d) => d.usePercent)) : 0;
      data.uptime = '';
    } else if (config.type === 'mikrotik') {
      const resourceRaw = await sshPool.exec(config.id, '/system resource print');
      const res = parseMikroTikResource(resourceRaw);
      data.cpu = res.cpuLoad;
      data.ram = res.memPercent;
      data.disk = 0;
      data.uptime = res.uptime;
    }
  } catch (err) {
    logger.warn('metrics', `Overview poll failed for ${config.name}`, { error: (err as Error).message });
  }

  latestOverview.set(config.id, data);
}

async function pollOverview() {
  syncConfigFromDisk();
  await Promise.all(serverConfigs.map((config) => pollOneServer(config)));
  broadcast('overview', [...latestOverview.values()]);
}

function getActiveDetailServers(): string[] {
  if (!getSubscribersFn) return [];
  const subs = getSubscribersFn();
  const activeIds = new Set<string>();
  for (const [, channels] of subs) {
    for (const ch of channels) {
      const match = ch.match(/^server:([^:]+):stats$/);
      if (match) activeIds.add(match[1]);
    }
  }
  return [...activeIds];
}

async function pollDetail() {
  const activeIds = getActiveDetailServers();
  if (activeIds.length === 0) return;

  await Promise.all(activeIds.map(async (serverId) => {
    const config = serverConfigs.find((s) => s.id === serverId);
    if (!config) return;

    const state = sshPool.getStatus(serverId);
    if (state?.status !== 'connected') return;

    try {
      let cpu = 0;
      let ram = 0;

      if (config.type === 'linux') {
        const [cpuRaw, memRaw] = await Promise.all([
          sshPool.exec(serverId, 'cat /proc/stat'),
          sshPool.exec(serverId, 'free -b | grep Mem'),
        ]);
        cpu = parseCpuStatDelta(cpuRaw, serverId);
        ram = parseMemory(memRaw).percent;
      } else if (config.type === 'windows') {
        const [cpuRaw, memRaw] = await Promise.all([
          sshPool.exec(serverId, 'powershell -Command "Get-CimInstance Win32_Processor | Select-Object -ExpandProperty LoadPercentage"'),
          sshPool.exec(serverId, 'powershell -Command "Get-CimInstance Win32_OperatingSystem | Select-Object TotalVisibleMemorySize,FreePhysicalMemory | ConvertTo-Json"'),
        ]);
        cpu = parseCpuWindows(cpuRaw);
        ram = parseMemoryWindows(memRaw).percent;
      } else if (config.type === 'mikrotik') {
        const resourceRaw = await sshPool.exec(serverId, '/system resource print');
        const res = parseMikroTikResource(resourceRaw);
        cpu = res.cpuLoad;
        ram = res.memPercent;
      }

      const point: CpuRamData = {
        timestamp: new Date().toISOString(),
        cpu,
        ram,
      };

      let buffer = ringBuffers.get(serverId);
      if (!buffer) {
        buffer = [];
        ringBuffers.set(serverId, buffer);
      }
      buffer.push(point);
      if (buffer.length > RING_BUFFER_MAX) {
        buffer.splice(0, buffer.length - RING_BUFFER_MAX);
      }

      broadcast(`server:${serverId}:stats`, point);
    } catch (err) {
      logger.warn('metrics', `Detail poll failed for ${serverId}`, { error: (err as Error).message });
    }
  }));
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getActiveChannelServers(suffix: string): string[] {
  if (!getSubscribersFn) return [];
  const subs = getSubscribersFn();
  const activeIds = new Set<string>();
  const pattern = new RegExp(`^server:([^:]+):${escapeRegex(suffix)}$`);
  for (const [, channels] of subs) {
    for (const ch of channels) {
      const match = ch.match(pattern);
      if (match) activeIds.add(match[1]);
    }
  }
  return [...activeIds];
}

async function pollTraffic() {
  const activeIds = getActiveChannelServers('traffic');
  if (activeIds.length === 0) return;

  await Promise.all(activeIds.map(async (serverId) => {
    const config = serverConfigs.find((s) => s.id === serverId);
    if (!config || config.type !== 'mikrotik') return;

    const state = sshPool.getStatus(serverId);
    if (state?.status !== 'connected') return;

    const iface = getInterfaceSelectionFn?.(serverId);
    if (!iface) return;

    try {
      const raw = await sshPool.exec(serverId, `/interface monitor-traffic ${iface} once`);
      const parsed = parseMikroTikTraffic(raw);

      const point: TrafficPoint = {
        timestamp: new Date().toISOString(),
        interface: iface,
        rxBps: parsed.rxBps,
        txBps: parsed.txBps,
      };

      let buffer = trafficBuffers.get(serverId);
      if (!buffer) {
        buffer = [];
        trafficBuffers.set(serverId, buffer);
      }
      buffer.push(point);
      if (buffer.length > TRAFFIC_BUFFER_MAX) {
        buffer.splice(0, buffer.length - TRAFFIC_BUFFER_MAX);
      }

      broadcast(`server:${serverId}:traffic`, point);
    } catch (err) {
      logger.warn('metrics', `Traffic poll failed for ${serverId}`, { error: (err as Error).message });
    }
  }));
}

async function pollHotspot() {
  const activeIds = getActiveChannelServers('hotspot');
  if (activeIds.length === 0) return;

  await Promise.all(activeIds.map(async (serverId) => {
    const config = serverConfigs.find((s) => s.id === serverId);
    if (!config || config.type !== 'mikrotik') return;

    const state = sshPool.getStatus(serverId);
    if (state?.status !== 'connected') return;

    try {
      // Single atomic command: detail + stats separated by marker
      const combined = await sshPool.exec(
        serverId,
        '/ip hotspot active print detail without-paging; :put "===HOTSPOT_STATS==="; /ip hotspot active print stats without-paging'
      );
      const sepIdx = combined.indexOf('===HOTSPOT_STATS===');
      const detailRaw = sepIdx >= 0 ? combined.substring(0, sepIdx) : combined;
      const statsRaw = sepIdx >= 0 ? combined.substring(sepIdx + '===HOTSPOT_STATS==='.length) : '';

      const users = parseMikroTikHotspotDetail(detailRaw);
      const statsMap = parseMikroTikHotspotStats(statsRaw);

      // Merge bytes from stats into detail by index (atomic snapshot, indexes match)
      for (let i = 0; i < users.length; i++) {
        if (users[i].bytesIn === 0 && users[i].bytesOut === 0) {
          const stats = statsMap.get(i);
          if (stats) {
            users[i].bytesIn = stats.bytesIn;
            users[i].bytesOut = stats.bytesOut;
          }
        }
      }

      const now = Date.now();
      const prevSnapshot = previousHotspotSnapshot.get(serverId);
      const newSnapshot = new Map<string, { bytesIn: number; bytesOut: number; timestamp: number }>();

      for (const user of users) {
        const key = user.user + user.macAddress;
        const prev = prevSnapshot?.get(key);
        if (prev) {
          const deltaSec = (now - prev.timestamp) / 1000;
          if (deltaSec > 0) {
            const deltaIn = user.bytesIn - prev.bytesIn;
            const deltaOut = user.bytesOut - prev.bytesOut;
            user.rateIn = deltaIn >= 0 ? deltaIn / deltaSec : 0;
            user.rateOut = deltaOut >= 0 ? deltaOut / deltaSec : 0;
          }
        }
        newSnapshot.set(key, { bytesIn: user.bytesIn, bytesOut: user.bytesOut, timestamp: now });
      }

      previousHotspotSnapshot.set(serverId, newSnapshot);

      const totalBytesIn = users.reduce((sum, u) => sum + u.bytesIn, 0);
      const totalBytesOut = users.reduce((sum, u) => sum + u.bytesOut, 0);
      const totalRateIn = users.reduce((sum, u) => sum + u.rateIn, 0);
      const totalRateOut = users.reduce((sum, u) => sum + u.rateOut, 0);

      const data = { users, totalBytesIn, totalBytesOut, totalRateIn, totalRateOut };
      hotspotCache.set(serverId, data);
      broadcast(`server:${serverId}:hotspot`, data);
    } catch (err) {
      logger.warn('metrics', `Hotspot poll failed for ${serverId}`, { error: (err as Error).message });
    }
  }));
}

async function pollNetwork() {
  const activeIds = getActiveChannelServers('network');
  if (activeIds.length === 0) return;

  await Promise.all(activeIds.map(async (serverId) => {
    const config = serverConfigs.find((s) => s.id === serverId);
    if (!config || config.type !== 'mikrotik') return;

    const state = sshPool.getStatus(serverId);
    if (state?.status !== 'connected') return;

    try {
      const clients = await collectNetworkData(serverId);
      const now = Date.now();
      const prevSnapshot = previousNetworkSnapshot.get(serverId);
      const newSnapshot = new Map<string, { bytesIn: number; bytesOut: number; timestamp: number }>();

      for (const client of clients) {
        if (client._bytesCumulative) {
          // Queue stats: cumulative bytes — use delta between polls
          const prev = prevSnapshot?.get(client.ip);
          if (prev) {
            const deltaSec = (now - prev.timestamp) / 1000;
            if (deltaSec > 0) {
              const deltaIn = client.bytesIn - prev.bytesIn;
              const deltaOut = client.bytesOut - prev.bytesOut;
              // Handle counter resets (router reboot / wrap)
              client.rateIn = deltaIn >= 0 ? deltaIn / deltaSec : 0;
              client.rateOut = deltaOut >= 0 ? deltaOut / deltaSec : 0;
            }
          }
          newSnapshot.set(client.ip, { bytesIn: client.bytesIn, bytesOut: client.bytesOut, timestamp: now });
        } else if (client.bytesIn > 0 || client.bytesOut > 0) {
          // Accounting/connection tracking: per-interval bytes — divide by poll interval
          const prev = prevSnapshot?.get(client.ip);
          const deltaSec = prev ? (now - prev.timestamp) / 1000 : NETWORK_INTERVAL / 1000;
          if (deltaSec > 0) {
            client.rateIn = client.bytesIn / deltaSec;
            client.rateOut = client.bytesOut / deltaSec;
          }
          newSnapshot.set(client.ip, { bytesIn: 0, bytesOut: 0, timestamp: now });
        }
      }

      previousNetworkSnapshot.set(serverId, newSnapshot);
      networkCache.set(serverId, clients);
      broadcast(`server:${serverId}:network`, { clients });
    } catch (err) {
      logger.warn('metrics', `Network poll failed for ${serverId}`, { error: (err as Error).message });
    }
  }));
}

export function getNetworkCache(serverId: string): NetworkClient[] | null {
  return networkCache.get(serverId) || null;
}

export function getTrafficBuffer(serverId: string): TrafficPoint[] {
  return trafficBuffers.get(serverId) || [];
}

export function getHotspotCache(serverId: string) {
  return hotspotCache.get(serverId) || null;
}

export function clearTrafficBuffer(serverId: string) {
  trafficBuffers.delete(serverId);
}

export function startMetricCollector(
  getSubscribers: () => Map<WebSocket, Set<string>>,
  servers: ServerConfig[],
  getInterfaceSelection?: (serverId: string) => string | undefined
) {
  getSubscribersFn = getSubscribers;
  serverConfigs = servers;
  if (getInterfaceSelection) getInterfaceSelectionFn = getInterfaceSelection;

  logger.info('metrics', `Starting collector for ${servers.length} server(s)`);

  // Initial poll after short delay to allow SSH connections to establish
  setTimeout(() => pollOverview(), 2000);

  overviewTimer = setInterval(pollOverview, OVERVIEW_INTERVAL);
  detailTimer = setInterval(pollDetail, DETAIL_INTERVAL);
  trafficTimer = setInterval(pollTraffic, TRAFFIC_INTERVAL);
  hotspotTimer = setInterval(pollHotspot, HOTSPOT_INTERVAL);
  networkTimer = setInterval(pollNetwork, NETWORK_INTERVAL);
}

export function stopMetricCollector() {
  if (overviewTimer) { clearInterval(overviewTimer); overviewTimer = null; }
  if (detailTimer) { clearInterval(detailTimer); detailTimer = null; }
  if (trafficTimer) { clearInterval(trafficTimer); trafficTimer = null; }
  if (hotspotTimer) { clearInterval(hotspotTimer); hotspotTimer = null; }
  if (networkTimer) { clearInterval(networkTimer); networkTimer = null; }
  logger.info('metrics', 'Collector stopped');
}

export function getRingBuffer(serverId: string): CpuRamData[] {
  return ringBuffers.get(serverId) || [];
}

export function getLatestOverview(): OverviewServerData[] {
  return [...latestOverview.values()];
}

export function addServerToCollector(config: ServerConfig) {
  if (!serverConfigs.find((s) => s.id === config.id)) {
    serverConfigs.push(config);
  }
}

export function removeServerFromCollector(serverId: string) {
  const idx = serverConfigs.findIndex((s) => s.id === serverId);
  if (idx !== -1) serverConfigs.splice(idx, 1);
  latestOverview.delete(serverId);
  ringBuffers.delete(serverId);
  trafficBuffers.delete(serverId);
  hotspotCache.delete(serverId);
  networkCache.delete(serverId);
  previousNetworkSnapshot.delete(serverId);
  previousHotspotSnapshot.delete(serverId);
  clearDestAccumulator(serverId);
}

export function updateServerInCollector(config: ServerConfig) {
  const idx = serverConfigs.findIndex((s) => s.id === config.id);
  if (idx !== -1) {
    serverConfigs[idx] = config;
  } else {
    serverConfigs.push(config);
  }
  ringBuffers.delete(config.id);
}

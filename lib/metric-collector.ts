import { WebSocket } from 'ws';
import { sshPool } from './ssh-pool';
import { broadcast } from './broadcast';
import { readServersConfig } from './config-writer';
import { parseCpuStatDelta, parseMemory, parseDiskUsage, parseUptime } from './parsers/linux';
import { parseCpuWindows, parseMemoryWindows, parseDiskWindows } from './parsers/windows';
import { parseMikroTikResource } from './parsers/mikrotik';
import type { ServerConfig, OverviewServerData, CpuRamData } from './types';

const OVERVIEW_INTERVAL = 5000;
const DETAIL_INTERVAL = 2000;
const RING_BUFFER_MAX = 150;

let overviewTimer: ReturnType<typeof setInterval> | null = null;
let detailTimer: ReturnType<typeof setInterval> | null = null;

const latestOverview = new Map<string, OverviewServerData>();
const ringBuffers = new Map<string, CpuRamData[]>();

let getSubscribersFn: (() => Map<WebSocket, Set<string>>) | null = null;
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
        console.debug(`[metrics] Auto-added server: ${s.name}`);
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
        console.debug(`[metrics] Auto-removed server: ${removed.name}`);
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
        console.debug(`[metrics] Auto-updated server: ${s.name}`);
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
    console.warn(`[metrics] Overview poll failed for ${config.name}:`, (err as Error).message);
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
      console.warn(`[metrics] Detail poll failed for ${serverId}:`, (err as Error).message);
    }
  }));
}

export function startMetricCollector(
  getSubscribers: () => Map<WebSocket, Set<string>>,
  servers: ServerConfig[]
) {
  getSubscribersFn = getSubscribers;
  serverConfigs = servers;

  console.log(`[metrics] Starting collector for ${servers.length} server(s)`);

  // Initial poll after short delay to allow SSH connections to establish
  setTimeout(() => pollOverview(), 2000);

  overviewTimer = setInterval(pollOverview, OVERVIEW_INTERVAL);
  detailTimer = setInterval(pollDetail, DETAIL_INTERVAL);
}

export function stopMetricCollector() {
  if (overviewTimer) {
    clearInterval(overviewTimer);
    overviewTimer = null;
  }
  if (detailTimer) {
    clearInterval(detailTimer);
    detailTimer = null;
  }
  console.log('[metrics] Collector stopped');
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

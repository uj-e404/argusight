import { readFileSync, writeFileSync, renameSync, existsSync } from 'fs';
import { join } from 'path';
import type { ServersConfig } from './types';

const configPath = process.env.CONFIG_PATH || join(process.cwd(), 'config');
const serversPath = join(configPath, 'servers.json');

let writeLock: Promise<void> = Promise.resolve();

export function readServersConfig(): ServersConfig {
  if (!existsSync(serversPath)) {
    return { servers: [] };
  }
  try {
    return JSON.parse(readFileSync(serversPath, 'utf-8'));
  } catch (err) {
    console.error('[config] Failed to parse servers.json (file may be corrupt):', err);
    return { servers: [] };
  }
}

export async function writeServersConfig(config: ServersConfig): Promise<void> {
  // Simple promise-based mutex
  const prev = writeLock;
  let release: () => void;
  writeLock = new Promise((r) => { release = r; });

  await prev;
  try {
    const tmpPath = serversPath + '.tmp';
    writeFileSync(tmpPath, JSON.stringify(config, null, 2), 'utf-8');
    renameSync(tmpPath, serversPath);
  } finally {
    release!();
  }
}

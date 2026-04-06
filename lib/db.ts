import Database from 'better-sqlite3';
import { mkdirSync } from 'fs';
import { join } from 'path';
import { logger } from './logger';
import type { SpikeEvent, SpikeConsumer, SpikeConfig } from './types';

const CONFIG_PATH = process.env.CONFIG_PATH || join(process.cwd(), 'config');
const DB_PATH = join(CONFIG_PATH, 'data', 'argusight.db');
const MAX_EVENTS_PER_SERVER = 200;

let db: Database.Database | null = null;

function getDb(): Database.Database {
  if (db) return db;

  mkdirSync(join(CONFIG_PATH, 'data'), { recursive: true });

  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 5000');

  migrate(db);

  logger.info('db', `SQLite opened at ${DB_PATH}`);
  return db;
}

function migrate(database: Database.Database): void {
  const version = database.pragma('user_version', { simple: true }) as number;

  if (version < 1) {
    database.exec(`
      CREATE TABLE IF NOT EXISTS spike_events (
        id TEXT PRIMARY KEY,
        server_id TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        type TEXT NOT NULL CHECK(type IN ('personal', 'all')),
        ip TEXT NOT NULL DEFAULT '',
        label TEXT NOT NULL DEFAULT '',
        peak_rate_in REAL NOT NULL DEFAULT 0,
        peak_rate_out REAL NOT NULL DEFAULT 0,
        total_rx_bps REAL,
        total_tx_bps REAL,
        top_consumers TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_spike_events_server
        ON spike_events(server_id, timestamp DESC);

      CREATE TABLE IF NOT EXISTS spike_config (
        server_id TEXT PRIMARY KEY,
        personal_threshold_mbps REAL NOT NULL DEFAULT 5,
        all_threshold_mbps REAL NOT NULL DEFAULT 50
      );
    `);
    database.pragma('user_version = 1');
    logger.info('db', 'Schema migrated to version 1');
  }
}

// ── Spike Events ──

const stmtCache: Record<string, Database.Statement> = {};

function stmt(key: string, sql: string): Database.Statement {
  if (!stmtCache[key]) {
    stmtCache[key] = getDb().prepare(sql);
  }
  return stmtCache[key];
}

export function insertSpikeEvent(serverId: string, event: SpikeEvent): void {
  const insert = stmt('insertSpike', `
    INSERT OR REPLACE INTO spike_events
      (id, server_id, timestamp, type, ip, label, peak_rate_in, peak_rate_out, total_rx_bps, total_tx_bps, top_consumers)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  insert.run(
    event.id,
    serverId,
    event.timestamp,
    event.type,
    event.ip,
    event.label,
    event.peakRateIn,
    event.peakRateOut,
    event.totalRxBps ?? null,
    event.totalTxBps ?? null,
    event.topConsumers ? JSON.stringify(event.topConsumers) : null,
  );

  // Enforce max events per server
  const cleanup = stmt('cleanupSpikes', `
    DELETE FROM spike_events
    WHERE server_id = ? AND id NOT IN (
      SELECT id FROM spike_events WHERE server_id = ? ORDER BY timestamp DESC LIMIT ?
    )
  `);
  cleanup.run(serverId, serverId, MAX_EVENTS_PER_SERVER);
}

export function getSpikeEvents(serverId: string, limit = 50, offset = 0): { events: SpikeEvent[]; total: number } {
  const rows = stmt('getSpikes', `
    SELECT * FROM spike_events WHERE server_id = ? ORDER BY timestamp DESC LIMIT ? OFFSET ?
  `).all(serverId, limit, offset) as Record<string, unknown>[];

  const countRow = stmt('countSpikes', `
    SELECT COUNT(*) as count FROM spike_events WHERE server_id = ?
  `).get(serverId) as { count: number };

  return {
    events: rows.map(rowToSpikeEvent),
    total: countRow.count,
  };
}

export function getRecentSpikeEvents(serverId: string, limit = 50): SpikeEvent[] {
  const rows = stmt('getRecentSpikes', `
    SELECT * FROM spike_events WHERE server_id = ? ORDER BY timestamp DESC LIMIT ?
  `).all(serverId, limit) as Record<string, unknown>[];

  return rows.map(rowToSpikeEvent);
}

export function clearSpikeEvents(serverId: string): void {
  stmt('clearSpikes', `DELETE FROM spike_events WHERE server_id = ?`).run(serverId);
}

function rowToSpikeEvent(row: Record<string, unknown>): SpikeEvent {
  return {
    id: row.id as string,
    timestamp: row.timestamp as string,
    type: row.type as 'personal' | 'all',
    ip: row.ip as string,
    label: row.label as string,
    peakRateIn: row.peak_rate_in as number,
    peakRateOut: row.peak_rate_out as number,
    totalRxBps: row.total_rx_bps as number | undefined,
    totalTxBps: row.total_tx_bps as number | undefined,
    topConsumers: row.top_consumers ? JSON.parse(row.top_consumers as string) as SpikeConsumer[] : undefined,
  };
}

// ── Spike Config ──

const DEFAULT_CONFIG: SpikeConfig = {
  personalThresholdMbps: 5,
  allThresholdMbps: 50,
};

export function getSpikeConfig(serverId: string): SpikeConfig {
  const row = stmt('getConfig', `
    SELECT personal_threshold_mbps, all_threshold_mbps FROM spike_config WHERE server_id = ?
  `).get(serverId) as { personal_threshold_mbps: number; all_threshold_mbps: number } | undefined;

  if (!row) return { ...DEFAULT_CONFIG };

  return {
    personalThresholdMbps: row.personal_threshold_mbps,
    allThresholdMbps: row.all_threshold_mbps,
  };
}

export function setSpikeConfig(serverId: string, config: SpikeConfig): void {
  stmt('setConfig', `
    INSERT INTO spike_config (server_id, personal_threshold_mbps, all_threshold_mbps)
    VALUES (?, ?, ?)
    ON CONFLICT(server_id) DO UPDATE SET
      personal_threshold_mbps = excluded.personal_threshold_mbps,
      all_threshold_mbps = excluded.all_threshold_mbps
  `).run(serverId, config.personalThresholdMbps, config.allThresholdMbps);
}

// ── Lifecycle ──

export function closeDb(): void {
  if (db) {
    // Clear prepared statement cache
    for (const key of Object.keys(stmtCache)) {
      delete stmtCache[key];
    }
    db.close();
    db = null;
    logger.info('db', 'SQLite closed');
  }
}

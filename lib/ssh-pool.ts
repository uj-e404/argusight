import { Client } from 'ssh2';
import { readFileSync } from 'fs';
import type { ServerConfig, SSHConnectionState } from './types';

const BACKOFF_SCHEDULE = [5000, 10000, 30000, 60000]; // ms
const ENV_PREFIX = '$ENV:';

/**
 * Resolve password value — if it starts with "$ENV:", read from environment variable.
 * Example: "$ENV:SSH_PASS_WEBSERVER" → process.env.SSH_PASS_WEBSERVER
 */
function resolvePassword(password: string): string | undefined {
  if (password.startsWith(ENV_PREFIX)) {
    const envVar = password.slice(ENV_PREFIX.length);
    const value = process.env[envVar];
    if (!value) {
      console.warn(`[ssh] Environment variable "${envVar}" is not set (referenced in password field)`);
    }
    return value;
  }
  return password;
}

class SSHPool {
  private static instance: SSHPool;
  private connections = new Map<string, Client>();
  private states = new Map<string, SSHConnectionState>();
  private configs = new Map<string, ServerConfig>();
  private reconnectTimers = new Map<string, ReturnType<typeof setTimeout>>();

  private constructor() {}

  static getInstance(): SSHPool {
    if (!SSHPool.instance) {
      SSHPool.instance = new SSHPool();
    }
    return SSHPool.instance;
  }

  async connect(config: ServerConfig): Promise<void> {
    if (this.connections.has(config.id)) {
      this.disconnect(config.id);
    }

    this.configs.set(config.id, config);
    this.setState(config.id, { status: 'connecting', reconnectAttempts: 0 });

    return new Promise<void>((resolve) => {
      const client = new Client();

      client.on('ready', () => {
        console.log(`[ssh] Connected: ${config.name} (${config.host})`);
        this.connections.set(config.id, client);
        this.setState(config.id, {
          status: 'connected',
          lastConnected: new Date(),
          reconnectAttempts: 0,
        });
        this.clearReconnectTimer(config.id);
        resolve();
      });

      client.on('error', (err) => {
        console.error(`[ssh] Error on ${config.name}: ${err.message}`);
        this.setState(config.id, {
          status: 'error',
          lastError: err.message,
        });
        resolve(); // Don't reject — allow other connections to proceed
      });

      client.on('close', () => {
        console.log(`[ssh] Disconnected: ${config.name}`);
        this.connections.delete(config.id);
        const state = this.states.get(config.id);
        if (state && state.status !== 'disconnected') {
          this.setState(config.id, { status: 'disconnected' });
          this.scheduleReconnect(config.id);
        }
      });

      const connectConfig: Record<string, unknown> = {
        host: config.host,
        port: config.port,
        username: config.username,
        readyTimeout: 10000,
        keepaliveInterval: 10000,
        keepaliveCountMax: 3,
      };

      if (config.authType === 'key' && config.privateKeyPath) {
        try {
          connectConfig.privateKey = readFileSync(config.privateKeyPath);
        } catch (err) {
          console.error(`[ssh] Failed to read key for ${config.name}: ${err}`);
          this.setState(config.id, {
            status: 'error',
            lastError: `Key file not found: ${config.privateKeyPath}`,
          });
          resolve();
          return;
        }
      } else if (config.authType === 'password' && config.password) {
        const resolved = resolvePassword(config.password);
        if (!resolved) {
          this.setState(config.id, {
            status: 'error',
            lastError: `Password not available (env var may be unset)`,
          });
          resolve();
          return;
        }
        connectConfig.password = resolved;
      }

      client.connect(connectConfig as Parameters<Client['connect']>[0]);
    });
  }

  async connectAll(servers: ServerConfig[]): Promise<void> {
    console.log(`[ssh] Connecting to ${servers.length} server(s)...`);
    await Promise.all(servers.map((s) => this.connect(s)));
    const connected = [...this.states.values()].filter((s) => s.status === 'connected').length;
    console.log(`[ssh] ${connected}/${servers.length} connected`);
  }

  exec(serverId: string, command: string, timeout = 10000): Promise<string> {
    return new Promise((resolve, reject) => {
      const client = this.connections.get(serverId);
      if (!client) {
        reject(new Error(`No connection for server: ${serverId}`));
        return;
      }

      const timer = setTimeout(() => {
        reject(new Error(`Command timed out after ${timeout}ms`));
      }, timeout);

      client.exec(command, (err, stream) => {
        if (err) {
          clearTimeout(timer);
          reject(err);
          return;
        }

        let stdout = '';
        let stderr = '';

        stream.on('data', (data: Buffer) => {
          stdout += data.toString();
        });

        stream.stderr.on('data', (data: Buffer) => {
          stderr += data.toString();
        });

        stream.on('close', () => {
          clearTimeout(timer);
          if (stderr && !stdout) {
            reject(new Error(stderr.trim()));
          } else {
            resolve(stdout);
          }
        });
      });
    });
  }

  disconnect(serverId: string) {
    this.clearReconnectTimer(serverId);
    const client = this.connections.get(serverId);
    if (client) {
      this.setState(serverId, { status: 'disconnected', reconnectAttempts: 0 });
      client.end();
      this.connections.delete(serverId);
    }
  }

  disconnectAll() {
    for (const id of this.connections.keys()) {
      this.disconnect(id);
    }
  }

  private scheduleReconnect(serverId: string) {
    const state = this.states.get(serverId);
    const config = this.configs.get(serverId);
    if (!state || !config) return;

    const attempt = state.reconnectAttempts;
    const delay = BACKOFF_SCHEDULE[Math.min(attempt, BACKOFF_SCHEDULE.length - 1)];

    console.log(`[ssh] Reconnecting ${config.name} in ${delay / 1000}s (attempt ${attempt + 1})`);

    this.setState(serverId, { reconnectAttempts: attempt + 1 });

    const timer = setTimeout(async () => {
      await this.connect(config);
    }, delay);

    this.reconnectTimers.set(serverId, timer);
  }

  private clearReconnectTimer(serverId: string) {
    const timer = this.reconnectTimers.get(serverId);
    if (timer) {
      clearTimeout(timer);
      this.reconnectTimers.delete(serverId);
    }
  }

  private setState(serverId: string, partial: Partial<SSHConnectionState>) {
    const current = this.states.get(serverId) || {
      serverId,
      status: 'disconnected' as const,
      reconnectAttempts: 0,
    };
    this.states.set(serverId, { ...current, ...partial });
  }

  getStatus(serverId: string): SSHConnectionState | undefined {
    return this.states.get(serverId);
  }

  getAllStatuses(): SSHConnectionState[] {
    return [...this.states.values()];
  }
}

export const sshPool = SSHPool.getInstance();

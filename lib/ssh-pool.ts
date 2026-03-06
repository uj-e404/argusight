import { Client } from 'ssh2';
import { readFileSync } from 'fs';
import type { ServerConfig, SSHConnectionState } from './types';

const BACKOFF_SCHEDULE = [5000, 10000, 30000, 60000]; // ms
const MAX_RECONNECT_ATTEMPTS = 20;
const ENV_PREFIX = '$ENV:';

// MikroTik RouterOS often requires legacy algorithms
const MIKROTIK_ALGORITHMS = {
  kex: [
    'curve25519-sha256',
    'curve25519-sha256@libssh.org',
    'ecdh-sha2-nistp256',
    'ecdh-sha2-nistp384',
    'ecdh-sha2-nistp521',
    'diffie-hellman-group-exchange-sha256',
    'diffie-hellman-group14-sha256',
    'diffie-hellman-group14-sha1',
    'diffie-hellman-group1-sha1',
  ],
  cipher: [
    'aes128-ctr',
    'aes192-ctr',
    'aes256-ctr',
    'aes128-gcm',
    'aes128-gcm@openssh.com',
    'aes256-gcm',
    'aes256-gcm@openssh.com',
    'aes256-cbc',
    'aes192-cbc',
    'aes128-cbc',
    '3des-cbc',
  ],
  hmac: [
    'hmac-sha2-256',
    'hmac-sha2-512',
    'hmac-sha1',
  ],
  serverHostKey: [
    'ssh-ed25519',
    'ecdsa-sha2-nistp256',
    'ecdsa-sha2-nistp384',
    'ecdsa-sha2-nistp521',
    'rsa-sha2-512',
    'rsa-sha2-256',
    'ssh-rsa',
    'ssh-dss',
  ],
};

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
    const currentAttempts = this.states.get(config.id)?.reconnectAttempts ?? 0;
    this.setState(config.id, { status: 'connecting', reconnectAttempts: currentAttempts });

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

      if (config.type === 'mikrotik') {
        connectConfig.algorithms = MIKROTIK_ALGORITHMS;
      }

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

  removeConfig(serverId: string) {
    this.disconnect(serverId);
    this.configs.delete(serverId);
    this.states.delete(serverId);
  }

  static async testConnection(config: ServerConfig): Promise<{ success: boolean; error?: string; latencyMs: number }> {
    const start = Date.now();
    return new Promise((resolve) => {
      const client = new Client();
      const timeout = setTimeout(() => {
        client.end();
        resolve({ success: false, error: 'Connection timed out (5s)', latencyMs: Date.now() - start });
      }, 5000);

      client.on('ready', () => {
        const testCmd = config.type === 'mikrotik' ? '/system identity print' : 'echo ok';
        client.exec(testCmd, (err, stream) => {
          clearTimeout(timeout);
          if (err) {
            client.end();
            resolve({ success: false, error: err.message, latencyMs: Date.now() - start });
            return;
          }
          stream.on('close', () => {
            client.end();
            resolve({ success: true, latencyMs: Date.now() - start });
          });
          stream.on('data', () => {});
          stream.stderr.on('data', () => {});
        });
      });

      client.on('error', (err) => {
        clearTimeout(timeout);
        client.end();
        resolve({ success: false, error: err.message, latencyMs: Date.now() - start });
      });

      const connectConfig: Record<string, unknown> = {
        host: config.host,
        port: config.port,
        username: config.username,
        readyTimeout: 5000,
      };

      if (config.type === 'mikrotik') {
        connectConfig.algorithms = MIKROTIK_ALGORITHMS;
      }

      if (config.authType === 'key' && config.privateKeyPath) {
        try {
          connectConfig.privateKey = readFileSync(config.privateKeyPath);
        } catch {
          clearTimeout(timeout);
          resolve({ success: false, error: `Key file not found: ${config.privateKeyPath}`, latencyMs: Date.now() - start });
          return;
        }
      } else if (config.authType === 'password' && config.password) {
        const resolved = config.password.startsWith('$ENV:')
          ? process.env[config.password.slice(5)]
          : config.password;
        if (!resolved) {
          clearTimeout(timeout);
          resolve({ success: false, error: 'Password not available', latencyMs: Date.now() - start });
          return;
        }
        connectConfig.password = resolved;
      }

      client.connect(connectConfig as Parameters<Client['connect']>[0]);
    });
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

    if (attempt >= MAX_RECONNECT_ATTEMPTS) {
      console.warn(`[ssh] Max reconnect attempts (${MAX_RECONNECT_ATTEMPTS}) reached for ${config.name}. Giving up.`);
      this.setState(serverId, {
        status: 'error',
        lastError: `Max reconnect attempts (${MAX_RECONNECT_ATTEMPTS}) reached`,
      });
      return;
    }

    const delay = BACKOFF_SCHEDULE[Math.min(attempt, BACKOFF_SCHEDULE.length - 1)];

    console.log(`[ssh] Reconnecting ${config.name} in ${delay / 1000}s (attempt ${attempt + 1}/${MAX_RECONNECT_ATTEMPTS})`);

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

export { SSHPool };
export const sshPool = SSHPool.getInstance();

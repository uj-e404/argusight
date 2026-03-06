export interface ServerConfig {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  authType: 'key' | 'password';
  privateKeyPath?: string;
  password?: string;
  type: 'linux' | 'windows' | 'mikrotik';
  os?: string;
  specs?: Record<string, string>;
  features?: string[];
  tags?: string[];
}

export interface ServersConfig {
  servers: ServerConfig[];
}

export interface AuthUser {
  username: string;
  passwordHash: string;
}

export interface AuthConfig {
  users: AuthUser[];
  jwt: {
    secret: string;
    expiresIn: string;
  };
}

export interface SSHConnectionState {
  serverId: string;
  status: 'connected' | 'disconnected' | 'connecting' | 'error';
  lastError?: string;
  lastConnected?: Date;
  reconnectAttempts: number;
}

export interface ClientMessage {
  type: 'subscribe' | 'unsubscribe';
  channel: string;
  serverId?: string;
}

export interface ServerMessage {
  type: 'overview' | 'stats' | 'traffic' | 'hotspot' | 'error';
  serverId?: string;
  data: unknown;
  timestamp: string;
}

export interface CpuRamData {
  timestamp: string;
  cpu: number;
  ram: number;
}

export interface DiskInfo {
  filesystem: string;
  fstype?: string;
  size: string;
  used: string;
  available: string;
  usePercent: number;
  mountpoint: string;
}

export interface ProcessInfo {
  pid: number;
  user: string;
  name: string;
  cpu: number;
  ram: number;
  memoryBytes?: number;
}

export interface DockerContainer {
  id: string;
  name: string;
  image: string;
  status: string;
  state: string;
  ports: string;
  created: string;
}

export interface GpuInfo {
  gpuUtil: number;
  memUtil: number;
  temperature: number;
  powerDraw: number;
  memTotal: number;
  memUsed: number;
}

export interface GpuProcessInfo {
  pid: number;
  memoryUsed: number | null; // MiB, null when N/A (Windows WDDM)
  name: string;
}

export interface DiskSmartStatus {
  device: string;
  healthy: boolean;
  status: string;
}

export interface OverviewServerData {
  serverId: string;
  name: string;
  host: string;
  type: 'linux' | 'windows' | 'mikrotik';
  os?: string;
  specs?: Record<string, string>;
  features?: string[];
  tags?: string[];
  status: 'connected' | 'disconnected' | 'connecting' | 'error';
  cpu: number;
  ram: number;
  disk: number;
  uptime: string;
}

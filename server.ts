import { createServer } from 'http';
import next from 'next';
import { WebSocketServer, WebSocket } from 'ws';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { jwtVerify } from 'jose';
import { sshPool } from './lib/ssh-pool';
import { setBroadcast } from './lib/broadcast';
import { startMetricCollector, stopMetricCollector, getRingBuffer, getTrafficBuffer, getHotspotCache, getNetworkCache, clearTrafficBuffer } from './lib/metric-collector';
import type { ServersConfig, AuthConfig, ClientMessage } from './lib/types';

const dev = process.env.NODE_ENV !== 'production';
const port = parseInt(process.env.PORT || '3000', 10);
const configPath = process.env.CONFIG_PATH || join(process.cwd(), 'config');

// Load auth config and set JWT_SECRET before Next.js starts
const authConfigPath = join(configPath, 'auth.json');
if (existsSync(authConfigPath)) {
  try {
    const authConfig: AuthConfig = JSON.parse(readFileSync(authConfigPath, 'utf-8'));
    process.env.JWT_SECRET = authConfig.jwt.secret;
    console.log('[auth] Loaded auth config, JWT secret set');
  } catch (err) {
    console.error('[auth] Failed to load auth.json:', err);
  }
} else {
  console.warn('[auth] No auth.json found. Run: pnpm init-auth');
}

// Load servers config
let serversConfig: ServersConfig = { servers: [] };
const serversConfigPath = join(configPath, 'servers.json');
if (existsSync(serversConfigPath)) {
  try {
    serversConfig = JSON.parse(readFileSync(serversConfigPath, 'utf-8'));
    console.log(`[ssh] Loaded ${serversConfig.servers.length} server(s) from config`);
  } catch (err) {
    console.error('[ssh] Failed to load servers.json:', err);
  }
} else {
  console.warn('[ssh] No servers.json found. Copy servers.example.json → servers.json');
}

const app = next({ dev });
const handle = app.getRequestHandler();

app.prepare().then(async () => {
  const server = createServer((req, res) => {
    handle(req, res);
  });

  // WebSocket server
  const wss = new WebSocketServer({ noServer: true });

  // Track subscriptions: ws → Set<channel>
  const subscriptions = new Map<WebSocket, Set<string>>();
  // Track interface selection per server for traffic monitoring
  const interfaceSelection = new Map<string, string>();

  // Ping/pong heartbeat: detect and terminate stale connections
  const alive = new Map<WebSocket, boolean>();
  const heartbeatInterval = setInterval(() => {
    for (const [ws] of subscriptions) {
      if (alive.get(ws) === false) {
        // No pong received since last ping — connection is stale
        console.log('[ws] Terminating stale connection');
        alive.delete(ws);
        subscriptions.delete(ws);
        wsRateLimit.delete(ws);
        ws.terminate();
        continue;
      }
      alive.set(ws, false);
      ws.ping();
    }
  }, 30_000);

  server.on('upgrade', async (req, socket, head) => {
    const { pathname } = new URL(req.url || '/', `http://${req.headers.host}`);

    // Only handle /ws path — let Next.js HMR and other upgrades pass through
    if (pathname !== '/ws') return;

    // Verify JWT from cookie
    const cookies = req.headers.cookie || '';
    const tokenMatch = cookies.match(/argusight-token=([^;]+)/);
    const token = tokenMatch?.[1];

    if (!token || !process.env.JWT_SECRET) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    try {
      const secret = new TextEncoder().encode(process.env.JWT_SECRET);
      await jwtVerify(token, secret);
    } catch {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req);
    });
  });

  // Rate limiting state per connection
  const wsRateLimit = new Map<WebSocket, { count: number; resetTime: number }>();
  const WS_MAX_MESSAGES_PER_SEC = 10;
  const WS_MAX_SUBSCRIPTIONS = 50;
  const WS_MAX_CHANNEL_LENGTH = 100;
  const WS_CHANNEL_REGEX = /^[a-zA-Z0-9:_\-]+$/;

  wss.on('connection', (ws) => {
    subscriptions.set(ws, new Set());
    wsRateLimit.set(ws, { count: 0, resetTime: Date.now() + 1000 });
    alive.set(ws, true);

    ws.on('pong', () => {
      alive.set(ws, true);
    });

    ws.on('message', (raw) => {
      try {
        // Rate limiting
        const rateState = wsRateLimit.get(ws)!;
        const now = Date.now();
        if (now > rateState.resetTime) {
          rateState.count = 0;
          rateState.resetTime = now + 1000;
        }
        rateState.count++;
        if (rateState.count > WS_MAX_MESSAGES_PER_SEC) {
          return; // Drop message silently
        }

        const msg: ClientMessage = JSON.parse(raw.toString());
        const subs = subscriptions.get(ws)!;

        // Handle set-interface before channel validation (no channel needed)
        if (msg.type === 'set-interface') {
          if (msg.serverId && msg.interface && /^[a-zA-Z0-9._-]+$/.test(msg.interface)) {
            interfaceSelection.set(msg.serverId, msg.interface);
            clearTrafficBuffer(msg.serverId);
          }
          return;
        }

        // Validate channel name
        if (!msg.channel || msg.channel.length > WS_MAX_CHANNEL_LENGTH || !WS_CHANNEL_REGEX.test(msg.channel)) {
          return;
        }

        if (msg.type === 'subscribe') {
          if (subs.size >= WS_MAX_SUBSCRIPTIONS) {
            return; // Max subscriptions reached
          }
          subs.add(msg.channel);

          // Send ring buffer backfill for stats channels
          if (msg.channel.endsWith(':stats')) {
            const serverId = msg.channel.split(':')[1];
            const buffer = getRingBuffer(serverId);
            if (buffer.length > 0) {
              ws.send(JSON.stringify({
                type: 'stats',
                serverId,
                data: buffer,
                timestamp: new Date().toISOString(),
                backfill: true,
              }));
            }
          }

          // Send backfill for traffic channels
          if (msg.channel.endsWith(':traffic')) {
            const serverId = msg.channel.split(':')[1];
            const buffer = getTrafficBuffer(serverId);
            if (buffer.length > 0) {
              ws.send(JSON.stringify({
                type: 'traffic',
                serverId,
                data: buffer,
                timestamp: new Date().toISOString(),
                backfill: true,
              }));
            }
          }

          // Send cache for hotspot channels
          if (msg.channel.endsWith(':hotspot')) {
            const serverId = msg.channel.split(':')[1];
            const cached = getHotspotCache(serverId);
            if (cached) {
              ws.send(JSON.stringify({
                type: 'hotspot',
                serverId,
                data: cached,
                timestamp: new Date().toISOString(),
                backfill: true,
              }));
            }
          }

          // Send cache for network channels
          if (msg.channel.endsWith(':network')) {
            const serverId = msg.channel.split(':')[1];
            const cached = getNetworkCache(serverId);
            if (cached) {
              ws.send(JSON.stringify({
                type: 'network',
                serverId,
                data: { clients: cached },
                timestamp: new Date().toISOString(),
                backfill: true,
              }));
            }
          }
        } else if (msg.type === 'unsubscribe') {
          subs.delete(msg.channel);
        }
      } catch {
        // Ignore malformed messages
      }
    });

    ws.on('close', () => {
      subscriptions.delete(ws);
      wsRateLimit.delete(ws);
      alive.delete(ws);
    });
  });

  // Broadcast helper
  function broadcast(channel: string, data: unknown) {
    const parts = channel.split(':');
    // For "overview" → type=overview, serverId=undefined
    // For "server:abc123:stats" → type=stats, serverId=abc123
    const type = parts.length >= 3 ? parts[2] : parts[0];
    const serverId = parts.length >= 3 ? parts[1] : undefined;

    const message = JSON.stringify({
      type,
      serverId,
      data,
      timestamp: new Date().toISOString(),
    });

    for (const [ws, subs] of subscriptions) {
      if (subs.has(channel) && ws.readyState === WebSocket.OPEN) {
        ws.send(message);
      }
    }
  }

  // Make broadcast available for metric collector via singleton module
  setBroadcast(broadcast);

  // Always start metric collector (supports dynamic add/remove)
  startMetricCollector(
    () => subscriptions,
    serversConfig.servers,
    (serverId: string) => interfaceSelection.get(serverId)
  );

  // Connect to SSH servers
  if (serversConfig.servers.length > 0) {
    await sshPool.connectAll(serversConfig.servers);
  }

  server.listen(port, () => {
    console.log(`[server] ArguSight running on http://localhost:${port} (${dev ? 'development' : 'production'})`);
  });

  // Graceful shutdown
  const shutdown = () => {
    console.log('[server] Shutting down...');
    clearInterval(heartbeatInterval);
    stopMetricCollector();
    sshPool.disconnectAll();
    wss.clients.forEach((ws) => ws.close());
    wss.close();
    server.close(() => {
      console.log('[server] Shutdown complete');
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 5000);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
});

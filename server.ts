import { createServer } from 'http';
import next from 'next';
import { WebSocketServer, WebSocket } from 'ws';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { jwtVerify } from 'jose';
import { sshPool } from './lib/ssh-pool';
import { setBroadcast } from './lib/broadcast';
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

  server.on('upgrade', async (req, socket, head) => {
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
  const WS_CHANNEL_REGEX = /^[a-zA-Z0-9:]+$/;

  wss.on('connection', (ws) => {
    subscriptions.set(ws, new Set());
    wsRateLimit.set(ws, { count: 0, resetTime: Date.now() + 1000 });

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

        // Validate channel name
        if (!msg.channel || msg.channel.length > WS_MAX_CHANNEL_LENGTH || !WS_CHANNEL_REGEX.test(msg.channel)) {
          return;
        }

        if (msg.type === 'subscribe') {
          if (subs.size >= WS_MAX_SUBSCRIPTIONS) {
            return; // Max subscriptions reached
          }
          subs.add(msg.channel);
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
    });
  });

  // Broadcast helper
  function broadcast(channel: string, data: unknown) {
    const message = JSON.stringify({
      type: channel.split(':')[0],
      serverId: channel.split(':')[1],
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

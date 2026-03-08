import { NextRequest, NextResponse } from 'next/server';
import { hashSync } from 'bcrypt';
import { randomBytes } from 'crypto';
import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import type { AuthConfig, ServersConfig, ServerConfig } from '@/lib/types';

const CONFIG_PATH = process.env.CONFIG_PATH || join(process.cwd(), 'config');

interface SetupServerInput {
  name: string;
  host: string;
  port: number;
  username: string;
  authType: 'password' | 'key';
  password?: string;
  privateKeyPath?: string;
  type: 'linux' | 'windows' | 'mikrotik';
  os?: string;
  features?: string[];
  tags?: string[];
}

export async function GET() {
  const needsSetup = process.env.NEEDS_SETUP === 'true';
  return NextResponse.json({ needsSetup });
}

export async function POST(request: NextRequest) {
  // Only allow setup when NEEDS_SETUP is true
  if (process.env.NEEDS_SETUP !== 'true') {
    return NextResponse.json({ error: 'Setup already completed' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { username, password, servers } = body as {
      username: string;
      password: string;
      servers: SetupServerInput[];
    };

    // Validate credentials
    if (!username?.trim()) {
      return NextResponse.json({ error: 'Username is required' }, { status: 400 });
    }
    if (!password || password.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 });
    }

    // Ensure config directory exists
    if (!existsSync(CONFIG_PATH)) {
      mkdirSync(CONFIG_PATH, { recursive: true });
    }

    // Create auth.json
    const passwordHash = hashSync(password, 10);
    const jwtSecret = randomBytes(64).toString('hex');

    const authConfig: AuthConfig = {
      users: [{ username: username.trim(), passwordHash }],
      jwt: { secret: jwtSecret, expiresIn: '24h' },
    };

    const authPath = join(CONFIG_PATH, 'auth.json');
    writeFileSync(authPath, JSON.stringify(authConfig, null, 2), 'utf-8');

    // Set JWT_SECRET for immediate use
    process.env.JWT_SECRET = jwtSecret;
    process.env.NEEDS_SETUP = 'false';

    // Create servers.json if servers provided
    if (servers && servers.length > 0) {
      const validTypes = ['linux', 'windows', 'mikrotik'];
      const serverConfigs: ServerConfig[] = servers.map((s, i) => {
        if (!s.host || !s.username || !s.type) {
          throw new Error(`Server ${i + 1}: host, username, and type are required`);
        }
        if (!validTypes.includes(s.type)) {
          throw new Error(`Server ${i + 1}: invalid type "${s.type}"`);
        }

        const id = s.name
          ? s.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
          : `server-${i + 1}`;

        return {
          id,
          name: s.name || `Server ${i + 1}`,
          host: s.host,
          port: s.port || 22,
          username: s.username,
          authType: s.authType || 'password',
          ...(s.authType === 'password' && s.password ? { password: s.password } : {}),
          ...(s.authType === 'key' && s.privateKeyPath ? { privateKeyPath: s.privateKeyPath } : {}),
          type: s.type,
          ...(s.os ? { os: s.os } : {}),
          features: s.features || getDefaultFeatures(s.type),
          ...(s.tags?.length ? { tags: s.tags } : {}),
        };
      });

      const serversConfig: ServersConfig = { servers: serverConfigs };
      const serversPath = join(CONFIG_PATH, 'servers.json');
      writeFileSync(serversPath, JSON.stringify(serversConfig, null, 2), 'utf-8');
    }

    return NextResponse.json({
      success: true,
      message: 'Setup complete. Please log in with your new credentials.',
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Setup failed' },
      { status: 500 }
    );
  }
}

function getDefaultFeatures(type: string): string[] {
  switch (type) {
    case 'linux':
      return ['cpu', 'ram', 'disk', 'processes'];
    case 'windows':
      return ['cpu', 'ram', 'disk', 'processes'];
    case 'mikrotik':
      return ['cpu', 'ram', 'traffic'];
    default:
      return ['cpu', 'ram'];
  }
}

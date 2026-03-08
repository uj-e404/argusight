import { NextRequest, NextResponse } from 'next/server';
import { Client } from 'ssh2';
import { readFileSync } from 'fs';

const MIKROTIK_ALGORITHMS = {
  kex: [
    'curve25519-sha256', 'curve25519-sha256@libssh.org',
    'ecdh-sha2-nistp256', 'ecdh-sha2-nistp384', 'ecdh-sha2-nistp521',
    'diffie-hellman-group-exchange-sha256', 'diffie-hellman-group14-sha256',
    'diffie-hellman-group14-sha1', 'diffie-hellman-group1-sha1',
  ],
  cipher: [
    'aes128-ctr', 'aes192-ctr', 'aes256-ctr',
    'aes128-gcm', 'aes128-gcm@openssh.com', 'aes256-gcm', 'aes256-gcm@openssh.com',
    'aes256-cbc', 'aes192-cbc', 'aes128-cbc', '3des-cbc',
  ],
  hmac: ['hmac-sha2-256', 'hmac-sha2-512', 'hmac-sha1'],
  serverHostKey: [
    'ssh-ed25519', 'ecdsa-sha2-nistp256', 'ecdsa-sha2-nistp384',
    'ecdsa-sha2-nistp521', 'rsa-sha2-512', 'rsa-sha2-256', 'ssh-rsa', 'ssh-dss',
  ],
};

export async function POST(request: NextRequest) {
  // Only allow during setup mode
  if (process.env.NEEDS_SETUP !== 'true') {
    return NextResponse.json({ error: 'Setup already completed' }, { status: 403 });
  }

  try {
    const { host, port, username, authType, password, privateKeyPath, type } = await request.json();

    if (!host || !username) {
      return NextResponse.json({ error: 'Host and username are required' }, { status: 400 });
    }

    const result = await testSSHConnection({
      host,
      port: port || 22,
      username,
      authType: authType || 'password',
      password,
      privateKeyPath,
      type: type || 'linux',
    });

    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Connection test failed' },
      { status: 500 }
    );
  }
}

interface TestParams {
  host: string;
  port: number;
  username: string;
  authType: 'password' | 'key';
  password?: string;
  privateKeyPath?: string;
  type: string;
}

function testSSHConnection(params: TestParams): Promise<{ success: boolean; error?: string; info?: string }> {
  return new Promise((resolve) => {
    const conn = new Client();
    const timeout = setTimeout(() => {
      conn.end();
      resolve({ success: false, error: 'Connection timed out (10s)' });
    }, 10000);

    conn.on('ready', () => {
      clearTimeout(timeout);
      // Run a simple command to verify
      const testCmd = params.type === 'mikrotik' ? '/system/identity/print' :
        params.type === 'windows' ? 'hostname' : 'uname -n';

      conn.exec(testCmd, (err, stream) => {
        if (err) {
          conn.end();
          resolve({ success: true, info: 'Connected (command exec failed, but SSH works)' });
          return;
        }

        let output = '';
        stream.on('data', (data: Buffer) => { output += data.toString(); });
        stream.on('close', () => {
          conn.end();
          resolve({ success: true, info: output.trim() || 'Connected successfully' });
        });
      });
    });

    conn.on('error', (err) => {
      clearTimeout(timeout);
      resolve({ success: false, error: err.message });
    });

    // Build connection config
    const connectConfig: Record<string, unknown> = {
      host: params.host,
      port: params.port,
      username: params.username,
      readyTimeout: 10000,
    };

    if (params.authType === 'key' && params.privateKeyPath) {
      try {
        connectConfig.privateKey = readFileSync(params.privateKeyPath);
      } catch {
        resolve({ success: false, error: `Cannot read key file: ${params.privateKeyPath}` });
        return;
      }
    } else if (params.password) {
      connectConfig.password = params.password;
    }

    if (params.type === 'mikrotik') {
      connectConfig.algorithms = MIKROTIK_ALGORITHMS;
    }

    conn.connect(connectConfig);
  });
}

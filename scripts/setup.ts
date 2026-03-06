import { createInterface } from 'readline';
import { hashSync } from 'bcrypt';
import { randomBytes } from 'crypto';
import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

const rl = createInterface({ input: process.stdin, output: process.stdout });

function ask(question: string): Promise<string> {
  return new Promise((resolve) => rl.question(question, resolve));
}

async function main() {
  console.log('\nArguSight Setup');
  console.log('===============\n');

  const configDir = join(process.cwd(), 'config');
  const authPath = join(configDir, 'auth.json');

  if (existsSync(authPath)) {
    const overwrite = await ask('auth.json already exists. Overwrite? (y/N): ');
    if (overwrite.toLowerCase() !== 'y') {
      console.log('Aborted.');
      rl.close();
      return;
    }
  }

  const username = await ask('Enter admin username: ');
  if (!username.trim()) {
    console.error('Username cannot be empty.');
    rl.close();
    return;
  }

  const password = await ask('Enter admin password: ');
  if (!password || password.length < 8) {
    console.error('Password must be at least 8 characters.');
    rl.close();
    return;
  }

  const confirm = await ask('Confirm password: ');
  if (password !== confirm) {
    console.error('Passwords do not match.');
    rl.close();
    return;
  }

  const passwordHash = hashSync(password, 10);
  const jwtSecret = randomBytes(64).toString('hex');

  const authConfig = {
    users: [{ username: username.trim(), passwordHash }],
    jwt: { secret: jwtSecret, expiresIn: '24h' },
  };

  if (!existsSync(configDir)) {
    mkdirSync(configDir, { recursive: true });
  }

  writeFileSync(authPath, JSON.stringify(authConfig, null, 2));
  console.log(`\nWritten to ${authPath}`);
  console.log('JWT secret generated automatically.\n');
  rl.close();
}

main().catch((err) => {
  console.error(err);
  rl.close();
  process.exit(1);
});

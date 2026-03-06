import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import type { AuthConfig } from './types';

const COOKIE_NAME = 'argusight-token';
const CONFIG_PATH = process.env.CONFIG_PATH || join(process.cwd(), 'config');

export { COOKIE_NAME };

export function readAuthConfig(): AuthConfig | null {
  const authPath = join(CONFIG_PATH, 'auth.json');
  if (!existsSync(authPath)) return null;
  try {
    return JSON.parse(readFileSync(authPath, 'utf-8'));
  } catch {
    return null;
  }
}

export async function verifyPassword(plaintext: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plaintext, hash);
}

export function signToken(payload: Record<string, unknown>): string {
  const config = readAuthConfig();
  if (!config) throw new Error('Auth config not found');
  return jwt.sign(payload, config.jwt.secret, {
    expiresIn: config.jwt.expiresIn,
  } as jwt.SignOptions);
}

export function verifyToken(token: string): Record<string, unknown> | null {
  const secret = process.env.JWT_SECRET;
  if (!secret) return null;
  try {
    return jwt.verify(token, secret) as Record<string, unknown>;
  } catch {
    return null;
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { hash } from 'bcrypt';
import { readAuthConfig, writeAuthConfig, verifyToken, COOKIE_NAME } from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    // Verify authentication
    const token = request.cookies.get(COOKIE_NAME)?.value;
    if (!token) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const payload = verifyToken(token);
    if (!payload) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    // Only allow when forceChange is active
    const config = readAuthConfig();
    if (!config) {
      return NextResponse.json({ error: 'Auth config not found' }, { status: 500 });
    }

    if (!config.forceChange) {
      return NextResponse.json({ error: 'Credential change not required' }, { status: 403 });
    }

    const { username, password } = await request.json();

    if (!username || !username.trim()) {
      return NextResponse.json({ error: 'Username is required' }, { status: 400 });
    }

    if (!password || password.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 });
    }

    // Update the user credentials
    const currentUsername = payload.username as string;
    const userIndex = config.users.findIndex((u) => u.username === currentUsername);
    if (userIndex === -1) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    config.users[userIndex] = {
      username: username.trim(),
      passwordHash: await hash(password, 10),
    };
    config.forceChange = false;

    writeAuthConfig(config);

    // Sync process.env.JWT_SECRET so verifyToken stays consistent with the new auth.json
    process.env.JWT_SECRET = config.jwt.secret;

    // Clear cookie to force re-login
    const response = NextResponse.json({ success: true });
    const isSecure = process.env.COOKIE_SECURE === 'false' ? false : (process.env.NODE_ENV === 'production' || request.headers.get('x-forwarded-proto') === 'https');
    response.cookies.set(COOKIE_NAME, '', {
      httpOnly: true,
      secure: isSecure,
      sameSite: 'lax',
      maxAge: 0,
      path: '/',
    });

    return response;
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

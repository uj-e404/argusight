import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';

const COOKIE_NAME = 'argusight-token';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const secret = process.env.JWT_SECRET;

  // --- No JWT_SECRET means auth.json doesn't exist (setup needed) ---
  if (!secret) {
    // Allow setup pages and setup API (needed for initial setup)
    if (pathname.startsWith('/setup') || pathname.startsWith('/api/setup')) {
      return NextResponse.next();
    }
    // Protected API calls fail with 503
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Setup required' }, { status: 503 });
    }
    // All other pages: let them load (login/root pages will detect setup needed via API)
    return NextResponse.next();
  }

  // --- JWT_SECRET exists: normal auth mode ---

  // Setup API: block after setup is complete (check via env flag set by API)
  if (pathname.startsWith('/api/setup')) {
    // Allow GET (status check) but block POST
    if (request.method !== 'GET') {
      return NextResponse.json({ error: 'Setup already completed' }, { status: 403 });
    }
    return NextResponse.next();
  }

  // Public pages (login, root) — no auth needed
  const isProtected = pathname.startsWith('/dashboard') ||
    pathname.startsWith('/api/servers') ||
    pathname.startsWith('/setup');

  if (!isProtected) return NextResponse.next();

  const token = request.cookies.get(COOKIE_NAME)?.value;

  if (!token) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const loginUrl = new URL('/login', request.url);
    loginUrl.search = '';
    return NextResponse.redirect(loginUrl);
  }

  try {
    const key = new TextEncoder().encode(secret);
    const { payload } = await jwtVerify(token, key);
    const forceChange = payload.forceChange === true;

    if (forceChange) {
      // forceChange users can ONLY access /setup/credentials
      if (pathname.startsWith('/setup')) {
        return NextResponse.next();
      }
      if (pathname.startsWith('/api/')) {
        return NextResponse.json({ error: 'Credential change required' }, { status: 403 });
      }
      return NextResponse.redirect(new URL('/setup/credentials', request.url));
    }

    // Normal users cannot access /setup
    if (pathname.startsWith('/setup')) {
      return NextResponse.redirect(new URL('/dashboard', request.url));
    }

    return NextResponse.next();
  } catch {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const loginUrl = new URL('/login', request.url);
    loginUrl.search = '';
    return NextResponse.redirect(loginUrl);
  }
}

export const config = {
  matcher: [
    '/dashboard/:path*',
    '/api/servers/:path*',
    '/api/setup/:path*',
    '/setup/:path*',
    '/login',
    '/',
  ],
};

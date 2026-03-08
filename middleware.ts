import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';

const COOKIE_NAME = 'argusight-token';

const protectedPaths = ['/dashboard', '/api/servers', '/setup'];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isProtected = protectedPaths.some((p) => pathname.startsWith(p));
  if (!isProtected) return NextResponse.next();

  const token = request.cookies.get(COOKIE_NAME)?.value;
  const secret = process.env.JWT_SECRET;

  if (!token || !secret) {
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
      // Block dashboard and API access
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
  matcher: ['/dashboard/:path*', '/api/servers/:path*', '/setup/:path*'],
};

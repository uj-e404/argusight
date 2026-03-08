import { NextResponse } from 'next/server';
import packageJson from '@/package.json';

const GITHUB_REPO = 'uj-e404/argusight';
const CACHE_TTL = 3600_000; // 1 hour

let cachedLatest: { version: string; url: string; publishedAt: string } | null = null;
let cachedAt = 0;

function compareSemver(a: string, b: string): number {
  const pa = a.replace(/^v/, '').split('.').map(Number);
  const pb = b.replace(/^v/, '').split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const diff = (pa[i] || 0) - (pb[i] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

async function fetchLatestRelease() {
  const now = Date.now();
  if (cachedLatest && now - cachedAt < CACHE_TTL) {
    return cachedLatest;
  }

  try {
    const res = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`,
      {
        headers: { Accept: 'application/vnd.github.v3+json' },
        signal: AbortSignal.timeout(5000),
      }
    );
    if (!res.ok) return null;

    const data = await res.json();
    cachedLatest = {
      version: (data.tag_name as string).replace(/^v/, ''),
      url: data.html_url as string,
      publishedAt: data.published_at as string,
    };
    cachedAt = now;
    return cachedLatest;
  } catch {
    return cachedLatest; // return stale cache on error
  }
}

export async function GET() {
  const current = packageJson.version;
  const latest = await fetchLatestRelease();

  return NextResponse.json({
    current,
    latest: latest?.version ?? null,
    updateAvailable: latest ? compareSemver(latest.version, current) > 0 : false,
    releaseUrl: latest?.url ?? null,
    publishedAt: latest?.publishedAt ?? null,
  });
}

import dns from 'dns/promises';

interface CacheEntry {
  domain: string; // empty string = no PTR found
  expires: number;
}

const TTL = 300_000; // 5 minutes
const MAX_CACHE = 2000;
const LOOKUP_TIMEOUT = 2000; // 2s per lookup
const CONCURRENCY = 10;

const cache = new Map<string, CacheEntry>();

function extractRootDomain(hostname: string): string {
  // e.g. server-13-227-81-46.ams54.r.cloudfront.net → cloudfront.net
  const parts = hostname.replace(/\.$/, '').split('.');
  if (parts.length <= 2) return parts.join('.');
  return parts.slice(-2).join('.');
}

function evictExpired() {
  const now = Date.now();
  for (const [ip, entry] of cache) {
    if (entry.expires <= now) cache.delete(ip);
  }
}

function evictOldest() {
  if (cache.size <= MAX_CACHE) return;
  const excess = cache.size - MAX_CACHE;
  let count = 0;
  for (const key of cache.keys()) {
    if (count >= excess) break;
    cache.delete(key);
    count++;
  }
}

async function resolveSingle(ip: string): Promise<string> {
  const now = Date.now();
  const cached = cache.get(ip);
  if (cached && cached.expires > now) return cached.domain;

  let domain = '';
  let timeoutId: ReturnType<typeof setTimeout>;
  try {
    const result = await Promise.race([
      dns.reverse(ip),
      new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error('timeout')), LOOKUP_TIMEOUT);
      }),
    ]);
    clearTimeout(timeoutId!);
    if (result.length > 0) {
      domain = extractRootDomain(result[0]);
    }
  } catch {
    clearTimeout(timeoutId!);
    // No PTR record or timeout — cache empty result
  }

  cache.set(ip, { domain, expires: now + TTL });
  return domain;
}

export async function resolveMany(ips: string[]): Promise<Map<string, string>> {
  evictExpired();

  const results = new Map<string, string>();
  const toResolve: string[] = [];
  const now = Date.now();

  for (const ip of ips) {
    const cached = cache.get(ip);
    if (cached && cached.expires > now) {
      if (cached.domain) results.set(ip, cached.domain);
    } else {
      toResolve.push(ip);
    }
  }

  // Resolve in batches of CONCURRENCY
  for (let i = 0; i < toResolve.length; i += CONCURRENCY) {
    const batch = toResolve.slice(i, i + CONCURRENCY);
    const resolved = await Promise.all(
      batch.map(async (ip) => {
        const domain = await resolveSingle(ip);
        return { ip, domain };
      })
    );
    for (const { ip, domain } of resolved) {
      if (domain) results.set(ip, domain);
    }
  }

  evictOldest();
  return results;
}

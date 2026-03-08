'use client';

import { useState, useEffect } from 'react';

interface VersionInfo {
  current: string;
  latest: string | null;
  updateAvailable: boolean;
  releaseUrl: string | null;
}

export function useVersionCheck() {
  const [info, setInfo] = useState<VersionInfo>({
    current: '',
    latest: null,
    updateAvailable: false,
    releaseUrl: null,
  });

  useEffect(() => {
    let mounted = true;

    async function check() {
      try {
        const res = await fetch('/api/version');
        if (!res.ok) return;
        const data = await res.json();
        if (mounted) setInfo(data);
      } catch {
        // silently fail
      }
    }

    check();

    // Re-check every hour
    const interval = setInterval(check, 3600_000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  return info;
}

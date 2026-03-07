'use client';

import { useState, useEffect } from 'react';
import { timeAgo } from '@/lib/time-ago';

interface LastUpdatedProps {
  date: Date | null;
  prefix?: string;
}

export function LastUpdated({ date, prefix = 'Updated' }: LastUpdatedProps) {
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!date) return;
    let interval: ReturnType<typeof setInterval>;
    const start = () => { interval = setInterval(() => setTick((t) => t + 1), 10_000); };
    const stop = () => clearInterval(interval);
    const onChange = () => document.hidden ? stop() : start();
    start();
    document.addEventListener('visibilitychange', onChange);
    return () => { stop(); document.removeEventListener('visibilitychange', onChange); };
  }, [date]);

  if (!date) return null;

  return (
    <span className="font-mono text-[11px] text-text-muted">
      {prefix} {timeAgo(date)}
    </span>
  );
}

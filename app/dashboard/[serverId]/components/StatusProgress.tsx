'use client';

interface StatusBarProps {
  value: number;
  warn?: number;
  critical?: number;
  className?: string;
}

export function StatusBar({
  value,
  warn = 70,
  critical = 85,
  className,
}: StatusBarProps) {
  const color =
    value >= critical
      ? 'bg-status-critical'
      : value >= warn
        ? 'bg-gold-primary'
        : 'bg-status-healthy';

  return (
    <div className={`relative h-2 w-full overflow-hidden rounded-full bg-bg-elevated ${className ?? ''}`}>
      <div
        className={`h-full rounded-full transition-all ${color}`}
        style={{ width: `${Math.min(value, 100)}%` }}
      />
    </div>
  );
}

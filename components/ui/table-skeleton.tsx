'use client';

import { Skeleton } from '@/components/ui/skeleton';

interface TableSkeletonProps {
  columns: number;
  rows?: number;
}

export function TableSkeleton({ columns, rows = 5 }: TableSkeletonProps) {
  return (
    <div className="bg-bg-surface border border-bg-elevated rounded-lg p-6">
      {/* Header skeleton */}
      <div className="flex items-center justify-between mb-4">
        <Skeleton className="h-5 w-40 bg-bg-elevated" />
        <Skeleton className="h-8 w-24 bg-bg-elevated" />
      </div>
      {/* Table header */}
      <div className="flex gap-4 mb-3 px-2">
        {Array.from({ length: columns }).map((_, i) => (
          <Skeleton key={`h-${i}`} className="h-3 flex-1 bg-bg-elevated" />
        ))}
      </div>
      {/* Table rows */}
      <div className="space-y-2">
        {Array.from({ length: rows }).map((_, r) => (
          <div key={r} className="flex gap-4 px-2 py-2">
            {Array.from({ length: columns }).map((_, c) => (
              <Skeleton
                key={`${r}-${c}`}
                className="h-4 flex-1 bg-bg-elevated"
                style={{ opacity: 1 - r * 0.12 }}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

import { Skeleton } from '@/components/ui/skeleton';

export default function ServerDetailLoading() {
  return (
    <div>
      {/* Header: back button + name + badge */}
      <div className="flex items-center gap-3 mb-6">
        <Skeleton className="h-9 w-9 rounded-md bg-bg-elevated" />
        <div className="flex items-center gap-3">
          <Skeleton className="h-5 w-5 bg-bg-elevated" />
          <Skeleton className="h-6 w-40 bg-bg-elevated" />
          <Skeleton className="h-5 w-20 rounded-full bg-bg-elevated" />
        </div>
      </div>

      {/* Server info row */}
      <div className="flex gap-4 mb-6">
        <Skeleton className="h-3 w-32 bg-bg-elevated" />
        <Skeleton className="h-3 w-48 bg-bg-elevated" />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 bg-bg-surface border border-bg-elevated rounded-md p-1">
        {['CPU/RAM', 'Disk', 'Processes', 'Docker', 'GPU'].map((tab) => (
          <Skeleton key={tab} className="h-8 w-20 rounded bg-bg-elevated" />
        ))}
      </div>

      {/* Chart area */}
      <div className="bg-bg-surface border border-bg-elevated rounded-lg p-6">
        <Skeleton className="h-5 w-32 mb-4 bg-bg-elevated" />
        <Skeleton className="h-[300px] w-full bg-bg-elevated" />
      </div>
    </div>
  );
}

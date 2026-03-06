import { Skeleton } from '@/components/ui/skeleton';

export default function DashboardLoading() {
  return (
    <div>
      {/* Filter badges */}
      <div className="flex items-center gap-2 mb-6">
        <Skeleton className="h-7 w-16 bg-bg-elevated" />
        <Skeleton className="h-7 w-16 bg-bg-elevated" />
        <Skeleton className="h-7 w-20 bg-bg-elevated" />
      </div>

      {/* Server cards grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="bg-bg-surface border border-bg-elevated rounded-lg p-4 border-t-2 border-t-bg-elevated"
          >
            {/* Card header */}
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Skeleton className="w-2 h-2 rounded-full bg-bg-elevated" />
                <Skeleton className="h-4 w-28 bg-bg-elevated" />
              </div>
              <Skeleton className="h-4 w-4 bg-bg-elevated" />
            </div>

            {/* IP + OS */}
            <div className="mb-4 space-y-1">
              <Skeleton className="h-3 w-32 bg-bg-elevated" />
              <Skeleton className="h-3 w-24 bg-bg-elevated" />
            </div>

            {/* Metric bars */}
            <div className="space-y-2.5">
              {['CPU', 'RAM', 'Disk'].map((label) => (
                <div key={label} className="flex items-center gap-3">
                  <span className="text-[11px] text-text-muted w-8">{label}</span>
                  <Skeleton className="h-2 flex-1 bg-bg-elevated" />
                  <Skeleton className="h-3 w-10 bg-bg-elevated" />
                </div>
              ))}
            </div>

            {/* Uptime */}
            <Skeleton className="mt-3 h-3 w-24 bg-bg-elevated" />
          </div>
        ))}
      </div>
    </div>
  );
}

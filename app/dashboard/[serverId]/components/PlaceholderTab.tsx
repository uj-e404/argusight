'use client';

import { Construction } from 'lucide-react';

interface PlaceholderTabProps {
  name: string;
}

export function PlaceholderTab({ name }: PlaceholderTabProps) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-text-muted">
      <Construction className="h-12 w-12 mb-4 text-text-muted/50" />
      <p className="text-lg font-medium">{name}</p>
      <p className="text-sm mt-1">Coming soon</p>
    </div>
  );
}

'use client';

import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="bg-bg-surface border border-bg-elevated rounded-lg p-8 max-w-md text-center">
        <AlertTriangle className="h-12 w-12 text-status-critical mx-auto mb-4" />
        <h2 className="text-lg font-semibold text-text-primary mb-2">
          Something went wrong
        </h2>
        <p className="text-sm text-text-muted mb-6">
          {error.message || 'An unexpected error occurred in the dashboard.'}
        </p>
        <div className="flex items-center justify-center gap-3">
          <Button
            onClick={reset}
            className="bg-gold-primary text-bg-darkest hover:bg-gold-dark"
          >
            Try Again
          </Button>
          <Button variant="ghost" asChild className="text-text-secondary">
            <Link href="/dashboard">Back to Dashboard</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

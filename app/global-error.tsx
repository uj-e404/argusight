'use client';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en" className="dark">
      <body className="bg-bg-darkest text-text-primary font-sans antialiased">
        <div className="flex items-center justify-center min-h-screen">
          <div className="bg-bg-surface border border-bg-elevated rounded-lg p-8 max-w-md text-center">
            <div className="text-4xl mb-4">!</div>
            <h2 className="text-lg font-semibold mb-2">
              Critical Error
            </h2>
            <p className="text-sm text-text-muted mb-6">
              {error.message || 'An unexpected error occurred.'}
            </p>
            <button
              onClick={reset}
              className="px-4 py-2 bg-gold-primary text-bg-darkest rounded-md font-medium hover:bg-gold-dark transition-colors"
            >
              Try Again
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}

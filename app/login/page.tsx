'use client';

import { useState } from 'react';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [signingIn, setSigningIn] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        const msg = data.error || 'Login failed';
        setError(msg);
        toast.error(msg);
        setLoading(false);
        return;
      }

      setSigningIn(true);
      window.location.href = '/dashboard';
    } catch {
      setError('Network error. Please try again.');
      toast.error('Network error');
      setLoading(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-bg-darkest overflow-hidden">
      {/* Signing in overlay */}
      {signingIn && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-bg-darkest/95 backdrop-blur-sm">
          <Loader2 size={40} className="animate-spin text-gold-primary mb-4" />
          <p className="text-lg font-medium text-text-primary">Signing you in...</p>
          <p className="text-sm text-text-muted mt-1">Preparing your dashboard</p>
        </div>
      )}

      {/* Radial gold gradient background */}
      <div
        className="absolute inset-0"
        style={{
          background: 'radial-gradient(ellipse at center, rgba(212, 168, 83, 0.04) 0%, transparent 70%)',
        }}
      />

      {/* Grid overlay */}
      <div className="absolute inset-0 grid-pattern" />

      {/* Login content */}
      <div className="relative z-10 flex flex-col items-center gap-8 px-4">
        {/* Eye logo */}
        <div className="animate-float">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/argusight-logo.svg"
            alt="ArguSight"
            width={160}
            height={160}
          />
        </div>

        {/* Wordmark */}
        <div className="text-center">
          <h1 className="text-[56px] font-extrabold tracking-[6px] leading-none">
            <span className="text-text-primary">ARGU</span>
            <span className="text-gold-primary">SIGHT</span>
          </h1>

          {/* Gold divider */}
          <div className="mx-auto mt-4 h-[2px] w-20 bg-gold-primary" />

          {/* Tagline */}
          <p className="mt-3 text-xs font-normal tracking-[4px] text-text-muted">
            ALL SEEING INFRASTRUCTURE MONITORING
          </p>
        </div>

        {/* Login form */}
        <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-4">
          <div>
            <input
              type="text"
              placeholder="Username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full rounded-lg border border-bg-elevated bg-bg-surface px-4 py-3 text-sm text-text-primary placeholder:text-text-muted outline-none transition-colors focus:border-gold-primary"
              autoComplete="username"
            />
          </div>

          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-bg-elevated bg-bg-surface px-4 py-3 pr-12 text-sm text-text-primary placeholder:text-text-muted outline-none transition-colors focus:border-gold-primary"
              autoComplete="current-password"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary transition-colors"
              tabIndex={-1}
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>

          {error && (
            <p className="text-sm text-status-critical">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-gold-primary py-3 text-sm font-semibold text-bg-darkest transition-colors hover:bg-gold-light disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading && <Loader2 size={16} className="animate-spin" />}
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}

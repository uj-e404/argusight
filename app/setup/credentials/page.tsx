'use client';

import { useState } from 'react';
import { Eye, EyeOff, Loader2, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';

export default function SetupCredentialsPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (!username.trim()) {
      setError('Username is required');
      return;
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);

    try {
      const res = await fetch('/api/auth/change-credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password }),
      });

      const data = await res.json();

      if (!res.ok) {
        const msg = data.error || 'Failed to update credentials';
        setError(msg);
        toast.error(msg);
        setLoading(false);
        return;
      }

      toast.success('Credentials updated! Please sign in with your new credentials.');
      window.location.href = '/login';
    } catch {
      setError('Network error. Please try again.');
      toast.error('Network error');
      setLoading(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-bg-darkest overflow-hidden">
      {/* Radial gold gradient background */}
      <div
        className="absolute inset-0"
        style={{
          background: 'radial-gradient(ellipse at center, rgba(212, 168, 83, 0.04) 0%, transparent 70%)',
        }}
      />

      {/* Grid overlay */}
      <div className="absolute inset-0 grid-pattern" />

      {/* Content */}
      <div className="relative z-10 flex flex-col items-center gap-6 px-4 w-full max-w-sm">
        {/* Icon */}
        <div className="flex items-center justify-center w-16 h-16 rounded-full bg-gold-primary/10 border border-gold-primary/20">
          <ShieldCheck size={32} className="text-gold-primary" />
        </div>

        {/* Title */}
        <div className="text-center">
          <h1 className="text-2xl font-bold text-text-primary">Set Up Your Credentials</h1>
          <p className="mt-2 text-sm text-text-muted leading-relaxed">
            Choose a new username and password for your account.
            <br />
            This is required before you can access the dashboard.
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="w-full space-y-4">
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1.5">New Username</label>
            <input
              type="text"
              placeholder="Enter new username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full rounded-lg border border-bg-elevated bg-bg-surface px-4 py-3 text-sm text-text-primary placeholder:text-text-muted outline-none transition-colors focus:border-gold-primary"
              autoComplete="username"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1.5">New Password</label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder="At least 8 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg border border-bg-elevated bg-bg-surface px-4 py-3 pr-12 text-sm text-text-primary placeholder:text-text-muted outline-none transition-colors focus:border-gold-primary"
                autoComplete="new-password"
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
          </div>

          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1.5">Confirm Password</label>
            <div className="relative">
              <input
                type={showConfirm ? 'text' : 'password'}
                placeholder="Re-enter your password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full rounded-lg border border-bg-elevated bg-bg-surface px-4 py-3 pr-12 text-sm text-text-primary placeholder:text-text-muted outline-none transition-colors focus:border-gold-primary"
                autoComplete="new-password"
              />
              <button
                type="button"
                onClick={() => setShowConfirm(!showConfirm)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary transition-colors"
                tabIndex={-1}
              >
                {showConfirm ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
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
            {loading ? 'Saving...' : 'Save & Continue'}
          </button>
        </form>
      </div>
    </div>
  );
}

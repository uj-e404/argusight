'use client';

import { useState } from 'react';
import {
  Eye, EyeOff, Loader2, Plus, Trash2, CheckCircle2,
  Server, ShieldCheck, ChevronRight, ChevronLeft, Wifi, WifiOff,
} from 'lucide-react';
import { toast } from 'sonner';

type ServerType = 'linux' | 'windows' | 'mikrotik';
type AuthType = 'password' | 'key';

interface ServerEntry {
  name: string;
  host: string;
  port: number;
  username: string;
  authType: AuthType;
  password: string;
  privateKeyPath: string;
  type: ServerType;
  os: string;
  features: string[];
  testStatus: 'idle' | 'testing' | 'success' | 'error';
  testMessage: string;
}

const FEATURE_OPTIONS: Record<ServerType, { value: string; label: string }[]> = {
  linux: [
    { value: 'cpu', label: 'CPU' },
    { value: 'ram', label: 'RAM' },
    { value: 'disk', label: 'Disk' },
    { value: 'processes', label: 'Processes' },
    { value: 'docker', label: 'Docker' },
    { value: 'gpu', label: 'GPU' },
    { value: 'network', label: 'Network' },
  ],
  windows: [
    { value: 'cpu', label: 'CPU' },
    { value: 'ram', label: 'RAM' },
    { value: 'disk', label: 'Disk' },
    { value: 'processes', label: 'Processes' },
    { value: 'gpu', label: 'GPU' },
    { value: 'network', label: 'Network' },
  ],
  mikrotik: [
    { value: 'cpu', label: 'CPU' },
    { value: 'ram', label: 'RAM' },
    { value: 'traffic', label: 'Traffic' },
    { value: 'domains', label: 'Domains' },
    { value: 'hotspot', label: 'Hotspot' },
    { value: 'network', label: 'Network' },
  ],
};

const DEFAULT_FEATURES: Record<ServerType, string[]> = {
  linux: ['cpu', 'ram', 'disk', 'processes'],
  windows: ['cpu', 'ram', 'disk', 'processes'],
  mikrotik: ['cpu', 'ram', 'traffic'],
};

function createEmptyServer(): ServerEntry {
  return {
    name: '',
    host: '',
    port: 22,
    username: '',
    authType: 'password',
    password: '',
    privateKeyPath: '',
    type: 'linux',
    os: '',
    features: [...DEFAULT_FEATURES.linux],
    testStatus: 'idle',
    testMessage: '',
  };
}

export default function SetupWizardPage() {
  const [step, setStep] = useState(1);

  // Step 1: Credentials
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  // Step 2: Servers
  const [servers, setServers] = useState<ServerEntry[]>([createEmptyServer()]);
  const [expandedServer, setExpandedServer] = useState(0);

  // General
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // --- Step 1 validation ---
  function validateStep1(): boolean {
    if (!username.trim()) {
      setError('Username is required');
      return false;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return false;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return false;
    }
    setError('');
    return true;
  }

  // --- Step 2: Server management ---
  function updateServer(index: number, updates: Partial<ServerEntry>) {
    setServers((prev) => {
      const next = [...prev];
      const updated = { ...next[index], ...updates };

      // Reset features when type changes
      if (updates.type && updates.type !== next[index].type) {
        updated.features = [...DEFAULT_FEATURES[updates.type]];
      }

      next[index] = updated;
      return next;
    });
  }

  function addServer() {
    setServers((prev) => [...prev, createEmptyServer()]);
    setExpandedServer(servers.length);
  }

  function removeServer(index: number) {
    if (servers.length <= 1) return;
    setServers((prev) => prev.filter((_, i) => i !== index));
    if (expandedServer >= servers.length - 1) {
      setExpandedServer(Math.max(0, servers.length - 2));
    }
  }

  function toggleFeature(serverIndex: number, feature: string) {
    setServers((prev) => {
      const next = [...prev];
      const s = { ...next[serverIndex] };
      if (s.features.includes(feature)) {
        s.features = s.features.filter((f) => f !== feature);
      } else {
        s.features = [...s.features, feature];
      }
      next[serverIndex] = s;
      return next;
    });
  }

  async function testConnection(index: number) {
    const s = servers[index];
    if (!s.host || !s.username) {
      updateServer(index, { testStatus: 'error', testMessage: 'Host and username are required' });
      return;
    }

    updateServer(index, { testStatus: 'testing', testMessage: '' });

    try {
      const res = await fetch('/api/setup/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          host: s.host,
          port: s.port,
          username: s.username,
          authType: s.authType,
          password: s.authType === 'password' ? s.password : undefined,
          privateKeyPath: s.authType === 'key' ? s.privateKeyPath : undefined,
          type: s.type,
        }),
      });

      const data = await res.json();
      if (data.success) {
        updateServer(index, { testStatus: 'success', testMessage: data.info || 'Connected!' });
        toast.success(`${s.name || s.host}: Connected!`);
      } else {
        updateServer(index, { testStatus: 'error', testMessage: data.error || 'Connection failed' });
        toast.error(`${s.name || s.host}: ${data.error}`);
      }
    } catch {
      updateServer(index, { testStatus: 'error', testMessage: 'Network error' });
      toast.error('Network error while testing connection');
    }
  }

  function validateStep2(): boolean {
    for (let i = 0; i < servers.length; i++) {
      const s = servers[i];
      if (!s.host.trim()) {
        setError(`Server ${i + 1}: Host is required`);
        setExpandedServer(i);
        return false;
      }
      if (!s.username.trim()) {
        setError(`Server ${i + 1}: Username is required`);
        setExpandedServer(i);
        return false;
      }
      if (s.authType === 'password' && !s.password) {
        setError(`Server ${i + 1}: Password is required`);
        setExpandedServer(i);
        return false;
      }
      if (s.authType === 'key' && !s.privateKeyPath) {
        setError(`Server ${i + 1}: Private key path is required`);
        setExpandedServer(i);
        return false;
      }
    }
    setError('');
    return true;
  }

  // --- Submit ---
  async function handleSubmit() {
    if (!validateStep2()) return;

    setSubmitting(true);
    setError('');

    try {
      const res = await fetch('/api/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: username.trim(),
          password,
          servers: servers.map((s) => ({
            name: s.name || s.host,
            host: s.host,
            port: s.port,
            username: s.username,
            authType: s.authType,
            password: s.authType === 'password' ? s.password : undefined,
            privateKeyPath: s.authType === 'key' ? s.privateKeyPath : undefined,
            type: s.type,
            os: s.os || undefined,
            features: s.features,
          })),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Setup failed');
        toast.error(data.error || 'Setup failed');
        setSubmitting(false);
        return;
      }

      setStep(3);
      toast.success('Setup complete!');

      // Redirect to login after a brief moment
      setTimeout(() => {
        window.location.href = '/login';
      }, 2000);
    } catch {
      setError('Network error. Please try again.');
      toast.error('Network error');
      setSubmitting(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-bg-darkest overflow-hidden">
      {/* Background */}
      <div
        className="absolute inset-0"
        style={{
          background: 'radial-gradient(ellipse at center, rgba(212, 168, 83, 0.04) 0%, transparent 70%)',
        }}
      />
      <div className="absolute inset-0 grid-pattern" />

      {/* Content */}
      <div className="relative z-10 flex flex-col items-center gap-6 px-4 w-full max-w-2xl py-12">
        {/* Logo */}
        <div className="animate-float">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/argusight-logo.svg" alt="ArguSight" width={100} height={100} />
        </div>

        {/* Title */}
        <div className="text-center">
          <h1 className="text-3xl font-bold text-text-primary">Welcome to ArguSight</h1>
          <p className="mt-2 text-sm text-text-muted">
            Let&apos;s get your monitoring dashboard set up.
          </p>
        </div>

        {/* Step indicators */}
        <div className="flex items-center gap-3">
          {[1, 2, 3].map((s) => (
            <div key={s} className="flex items-center gap-2">
              <div
                className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-semibold transition-colors ${
                  step === s
                    ? 'bg-gold-primary text-bg-darkest'
                    : step > s
                      ? 'bg-gold-primary/20 text-gold-primary'
                      : 'bg-bg-elevated text-text-muted'
                }`}
              >
                {step > s ? <CheckCircle2 size={16} /> : s}
              </div>
              {s < 3 && (
                <div className={`w-12 h-0.5 ${step > s ? 'bg-gold-primary/40' : 'bg-bg-elevated'}`} />
              )}
            </div>
          ))}
        </div>

        <div className="text-xs text-text-muted">
          {step === 1 && 'Step 1: Create Admin Account'}
          {step === 2 && 'Step 2: Add Servers'}
          {step === 3 && 'Setup Complete!'}
        </div>

        {/* Step 1: Credentials */}
        {step === 1 && (
          <div className="w-full max-w-md space-y-4">
            <div className="flex items-center gap-3 mb-6">
              <div className="flex items-center justify-center w-10 h-10 rounded-full bg-gold-primary/10 border border-gold-primary/20">
                <ShieldCheck size={20} className="text-gold-primary" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-text-primary">Admin Account</h2>
                <p className="text-xs text-text-muted">Create your login credentials</p>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1.5">Username</label>
              <input
                type="text"
                placeholder="Enter admin username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full rounded-lg border border-bg-elevated bg-bg-surface px-4 py-3 text-sm text-text-primary placeholder:text-text-muted outline-none transition-colors focus:border-gold-primary"
                autoComplete="username"
                autoFocus
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1.5">Password</label>
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

            {error && <p className="text-sm text-status-critical">{error}</p>}

            <button
              onClick={() => {
                if (validateStep1()) setStep(2);
              }}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-gold-primary py-3 text-sm font-semibold text-bg-darkest transition-colors hover:bg-gold-light"
            >
              Continue <ChevronRight size={16} />
            </button>
          </div>
        )}

        {/* Step 2: Servers */}
        {step === 2 && (
          <div className="w-full space-y-4">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center w-10 h-10 rounded-full bg-gold-primary/10 border border-gold-primary/20">
                  <Server size={20} className="text-gold-primary" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-text-primary">Add Servers</h2>
                  <p className="text-xs text-text-muted">Configure SSH connections to your servers</p>
                </div>
              </div>
              <button
                onClick={addServer}
                className="flex items-center gap-1.5 rounded-lg border border-bg-elevated bg-bg-surface px-3 py-2 text-xs font-medium text-text-secondary hover:border-gold-primary/40 hover:text-gold-primary transition-colors"
              >
                <Plus size={14} /> Add Server
              </button>
            </div>

            {/* Server cards */}
            <div className="space-y-3">
              {servers.map((server, i) => (
                <div
                  key={i}
                  className="rounded-lg border border-bg-elevated bg-bg-surface overflow-hidden"
                >
                  {/* Header (click to expand/collapse) */}
                  <button
                    onClick={() => setExpandedServer(expandedServer === i ? -1 : i)}
                    className="flex items-center justify-between w-full px-4 py-3 text-left hover:bg-bg-elevated/50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-medium text-text-primary">
                        {server.name || server.host || `Server ${i + 1}`}
                      </span>
                      <span className="text-xs text-text-muted px-2 py-0.5 rounded bg-bg-elevated">
                        {server.type}
                      </span>
                      {server.testStatus === 'success' && (
                        <Wifi size={14} className="text-status-healthy" />
                      )}
                      {server.testStatus === 'error' && (
                        <WifiOff size={14} className="text-status-critical" />
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {servers.length > 1 && (
                        <span
                          onClick={(e) => { e.stopPropagation(); removeServer(i); }}
                          className="text-text-muted hover:text-status-critical transition-colors p-1"
                        >
                          <Trash2 size={14} />
                        </span>
                      )}
                      <ChevronRight
                        size={16}
                        className={`text-text-muted transition-transform ${expandedServer === i ? 'rotate-90' : ''}`}
                      />
                    </div>
                  </button>

                  {/* Expanded form */}
                  {expandedServer === i && (
                    <div className="px-4 pb-4 space-y-3 border-t border-bg-elevated">
                      <div className="grid grid-cols-2 gap-3 pt-3">
                        <div>
                          <label className="block text-xs font-medium text-text-secondary mb-1">Display Name</label>
                          <input
                            type="text"
                            placeholder="My Server"
                            value={server.name}
                            onChange={(e) => updateServer(i, { name: e.target.value })}
                            className="w-full rounded-md border border-bg-elevated bg-bg-darkest px-3 py-2 text-sm text-text-primary placeholder:text-text-muted outline-none focus:border-gold-primary"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-text-secondary mb-1">Type</label>
                          <select
                            value={server.type}
                            onChange={(e) => updateServer(i, { type: e.target.value as ServerType })}
                            className="w-full rounded-md border border-bg-elevated bg-bg-darkest px-3 py-2 text-sm text-text-primary outline-none focus:border-gold-primary"
                          >
                            <option value="linux">Linux</option>
                            <option value="windows">Windows</option>
                            <option value="mikrotik">MikroTik</option>
                          </select>
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-3">
                        <div className="col-span-2">
                          <label className="block text-xs font-medium text-text-secondary mb-1">Host / IP</label>
                          <input
                            type="text"
                            placeholder="192.168.1.1"
                            value={server.host}
                            onChange={(e) => updateServer(i, { host: e.target.value })}
                            className="w-full rounded-md border border-bg-elevated bg-bg-darkest px-3 py-2 text-sm text-text-primary placeholder:text-text-muted outline-none focus:border-gold-primary"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-text-secondary mb-1">Port</label>
                          <input
                            type="number"
                            value={server.port}
                            onChange={(e) => updateServer(i, { port: parseInt(e.target.value) || 22 })}
                            className="w-full rounded-md border border-bg-elevated bg-bg-darkest px-3 py-2 text-sm text-text-primary outline-none focus:border-gold-primary"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-text-secondary mb-1">SSH Username</label>
                        <input
                          type="text"
                          placeholder="root"
                          value={server.username}
                          onChange={(e) => updateServer(i, { username: e.target.value })}
                          className="w-full rounded-md border border-bg-elevated bg-bg-darkest px-3 py-2 text-sm text-text-primary placeholder:text-text-muted outline-none focus:border-gold-primary"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-text-secondary mb-1">Auth Method</label>
                        <div className="flex gap-2">
                          <button
                            onClick={() => updateServer(i, { authType: 'password' })}
                            className={`flex-1 rounded-md border px-3 py-2 text-xs font-medium transition-colors ${
                              server.authType === 'password'
                                ? 'border-gold-primary bg-gold-primary/10 text-gold-primary'
                                : 'border-bg-elevated bg-bg-darkest text-text-muted hover:border-gold-primary/30'
                            }`}
                          >
                            Password
                          </button>
                          <button
                            onClick={() => updateServer(i, { authType: 'key' })}
                            className={`flex-1 rounded-md border px-3 py-2 text-xs font-medium transition-colors ${
                              server.authType === 'key'
                                ? 'border-gold-primary bg-gold-primary/10 text-gold-primary'
                                : 'border-bg-elevated bg-bg-darkest text-text-muted hover:border-gold-primary/30'
                            }`}
                          >
                            SSH Key
                          </button>
                        </div>
                      </div>

                      {server.authType === 'password' ? (
                        <div>
                          <label className="block text-xs font-medium text-text-secondary mb-1">SSH Password</label>
                          <input
                            type="password"
                            placeholder="Enter SSH password"
                            value={server.password}
                            onChange={(e) => updateServer(i, { password: e.target.value })}
                            className="w-full rounded-md border border-bg-elevated bg-bg-darkest px-3 py-2 text-sm text-text-primary placeholder:text-text-muted outline-none focus:border-gold-primary"
                          />
                        </div>
                      ) : (
                        <div>
                          <label className="block text-xs font-medium text-text-secondary mb-1">
                            Private Key Path
                            <span className="text-text-muted font-normal ml-1">(inside container)</span>
                          </label>
                          <input
                            type="text"
                            placeholder="/app/config/keys/id_ed25519"
                            value={server.privateKeyPath}
                            onChange={(e) => updateServer(i, { privateKeyPath: e.target.value })}
                            className="w-full rounded-md border border-bg-elevated bg-bg-darkest px-3 py-2 text-sm text-text-primary placeholder:text-text-muted outline-none focus:border-gold-primary"
                          />
                          <p className="text-xs text-text-muted mt-1">
                            Keys from ~/.ssh are mounted at /app/config/keys/
                          </p>
                        </div>
                      )}

                      <div>
                        <label className="block text-xs font-medium text-text-secondary mb-1">OS (optional)</label>
                        <input
                          type="text"
                          placeholder={server.type === 'linux' ? 'Ubuntu 24.04' : server.type === 'windows' ? 'Windows 11' : 'RouterOS 7.x'}
                          value={server.os}
                          onChange={(e) => updateServer(i, { os: e.target.value })}
                          className="w-full rounded-md border border-bg-elevated bg-bg-darkest px-3 py-2 text-sm text-text-primary placeholder:text-text-muted outline-none focus:border-gold-primary"
                        />
                      </div>

                      {/* Features */}
                      <div>
                        <label className="block text-xs font-medium text-text-secondary mb-2">Monitoring Features</label>
                        <div className="flex flex-wrap gap-2">
                          {FEATURE_OPTIONS[server.type].map((feat) => (
                            <button
                              key={feat.value}
                              onClick={() => toggleFeature(i, feat.value)}
                              className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
                                server.features.includes(feat.value)
                                  ? 'border-gold-primary bg-gold-primary/10 text-gold-primary'
                                  : 'border-bg-elevated bg-bg-darkest text-text-muted hover:border-gold-primary/30'
                              }`}
                            >
                              {feat.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Test connection */}
                      <div className="flex items-center gap-3 pt-2">
                        <button
                          onClick={() => testConnection(i)}
                          disabled={server.testStatus === 'testing'}
                          className="flex items-center gap-2 rounded-md border border-bg-elevated bg-bg-darkest px-4 py-2 text-xs font-medium text-text-secondary hover:border-gold-primary/40 hover:text-gold-primary transition-colors disabled:opacity-50"
                        >
                          {server.testStatus === 'testing' ? (
                            <Loader2 size={14} className="animate-spin" />
                          ) : (
                            <Wifi size={14} />
                          )}
                          Test Connection
                        </button>
                        {server.testMessage && (
                          <span className={`text-xs ${server.testStatus === 'success' ? 'text-status-healthy' : 'text-status-critical'}`}>
                            {server.testMessage}
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {error && <p className="text-sm text-status-critical">{error}</p>}

            {/* Navigation */}
            <div className="flex items-center justify-between pt-4">
              <button
                onClick={() => { setError(''); setStep(1); }}
                className="flex items-center gap-2 rounded-lg border border-bg-elevated bg-bg-surface px-4 py-3 text-sm font-medium text-text-secondary hover:border-gold-primary/40 transition-colors"
              >
                <ChevronLeft size={16} /> Back
              </button>
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="flex items-center justify-center gap-2 rounded-lg bg-gold-primary px-8 py-3 text-sm font-semibold text-bg-darkest transition-colors hover:bg-gold-light disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting && <Loader2 size={16} className="animate-spin" />}
                {submitting ? 'Setting up...' : 'Complete Setup'}
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Done */}
        {step === 3 && (
          <div className="w-full max-w-md text-center space-y-6">
            <div className="flex items-center justify-center w-20 h-20 rounded-full bg-status-healthy/10 border border-status-healthy/20 mx-auto">
              <CheckCircle2 size={40} className="text-status-healthy" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-text-primary">All Set!</h2>
              <p className="mt-2 text-sm text-text-muted">
                Your ArguSight instance is configured. Redirecting to login...
              </p>
            </div>
            <div className="flex justify-center">
              <Loader2 size={20} className="animate-spin text-gold-primary" />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

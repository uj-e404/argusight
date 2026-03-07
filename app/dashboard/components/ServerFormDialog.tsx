'use client';

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, CheckCircle2, XCircle, Wifi, ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';

type ServerType = 'linux' | 'windows' | 'mikrotik';
type AuthType = 'password' | 'key';

interface ServerFormData {
  id?: string;
  name: string;
  host: string;
  port: number;
  username: string;
  authType: AuthType;
  password?: string;
  privateKeyPath?: string;
  type: ServerType;
  os?: string;
  features: string[];
  tags: string;
}

const FEATURES_BY_TYPE: Record<ServerType, string[]> = {
  linux: ['cpu', 'ram', 'disk', 'processes', 'docker', 'gpu'],
  windows: ['cpu', 'ram', 'disk', 'processes', 'gpu'],
  mikrotik: ['cpu', 'ram', 'traffic', 'domains', 'hotspot'],
};

const DEFAULT_FORM: ServerFormData = {
  name: '',
  host: '',
  port: 22,
  username: '',
  authType: 'password',
  password: '',
  privateKeyPath: '',
  type: 'linux',
  os: '',
  features: [],
  tags: '',
};

interface ServerFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: 'add' | 'edit';
  initialData?: {
    id: string;
    name: string;
    host: string;
    port: number;
    username: string;
    authType: AuthType;
    privateKeyPath?: string;
    type: ServerType;
    os?: string;
    features?: string[];
    tags?: string[];
  };
  onSuccess: () => void;
}

export function ServerFormDialog({ open, onOpenChange, mode, initialData, onSuccess }: ServerFormDialogProps) {
  const [form, setForm] = useState<ServerFormData>(DEFAULT_FORM);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; error?: string; latencyMs: number } | null>(null);
  const isInsecure = typeof window !== 'undefined' && window.location.protocol === 'http:';

  useEffect(() => {
    if (open) {
      setTestResult(null);
      setErrors({});
      if (mode === 'edit' && initialData) {
        setForm({
          id: initialData.id,
          name: initialData.name,
          host: initialData.host,
          port: initialData.port,
          username: initialData.username,
          authType: initialData.authType,
          password: '',
          privateKeyPath: initialData.privateKeyPath || '',
          type: initialData.type,
          os: initialData.os || '',
          features: initialData.features || [],
          tags: (initialData.tags || []).join(', '),
        });
      } else {
        setForm(DEFAULT_FORM);
      }
    }
  }, [open, mode, initialData]);

  function validate(): boolean {
    const e: Record<string, string> = {};
    if (!form.name.trim()) e.name = 'Required';
    if (!form.host.trim()) e.host = 'Required';
    if (!form.username.trim()) e.username = 'Required';
    if (form.port < 1 || form.port > 65535) e.port = '1-65535';
    if (form.authType === 'password' && mode === 'add' && !form.password) e.password = 'Required';
    if (form.authType === 'key' && !form.privateKeyPath) e.privateKeyPath = 'Required';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleTestConnection() {
    setIsTesting(true);
    setTestResult(null);
    try {
      const res = await fetch('/api/servers/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          host: form.host,
          port: form.port,
          username: form.username,
          authType: form.authType,
          password: form.password || undefined,
          privateKeyPath: form.privateKeyPath || undefined,
          type: form.type,
        }),
      });
      const data = await res.json();
      setTestResult(data);
      if (data.success) {
        toast.success(`Connected in ${data.latencyMs}ms`);
      } else {
        toast.error(data.error || 'Connection failed');
      }
    } catch {
      setTestResult({ success: false, error: 'Request failed', latencyMs: 0 });
      toast.error('Connection test failed');
    } finally {
      setIsTesting(false);
    }
  }

  async function handleSubmit() {
    if (!validate()) return;
    setIsSubmitting(true);

    const tags = form.tags
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);

    const payload = {
      name: form.name,
      host: form.host,
      port: form.port,
      username: form.username,
      authType: form.authType,
      password: form.password || undefined,
      privateKeyPath: form.privateKeyPath || undefined,
      type: form.type,
      os: form.os || undefined,
      features: form.features.length > 0 ? form.features : undefined,
      tags: tags.length > 0 ? tags : undefined,
    };

    try {
      const url = mode === 'add' ? '/api/servers' : `/api/servers/${form.id}`;
      const method = mode === 'add' ? 'POST' : 'PUT';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json();
        setErrors({ submit: data.error || 'Failed to save' });
        toast.error(data.error || 'Failed to save server');
        return;
      }

      onOpenChange(false);
      onSuccess();
      toast.success(mode === 'add' ? 'Server added' : 'Server updated');
    } catch {
      setErrors({ submit: 'Network error' });
      toast.error('Network error');
    } finally {
      setIsSubmitting(false);
    }
  }

  const availableFeatures = FEATURES_BY_TYPE[form.type];

  function toggleFeature(feature: string) {
    setForm((prev) => ({
      ...prev,
      features: prev.features.includes(feature)
        ? prev.features.filter((f) => f !== feature)
        : [...prev.features, feature],
    }));
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-bg-surface border-bg-elevated sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-text-primary">
            {mode === 'add' ? 'Add Server' : 'Edit Server'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {isInsecure && (
            <div className="flex items-start gap-2 rounded-md border border-gold-primary/40 bg-gold-primary/5 px-3 py-2">
              <ShieldAlert className="h-4 w-4 text-gold-primary mt-0.5 flex-shrink-0" />
              <p className="text-xs text-gold-primary">
                You are using an insecure HTTP connection. Credentials may be exposed in transit. Use HTTPS in production.
              </p>
            </div>
          )}

          {/* Name */}
          <div className="space-y-1.5">
            <Label className="text-text-secondary text-xs">Name *</Label>
            <Input
              value={form.name}
              onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
              placeholder="My Server"
              className="bg-bg-darkest border-bg-elevated text-text-primary"
            />
            {errors.name && <p className="text-xs text-status-critical">{errors.name}</p>}
          </div>

          {/* Host + Port */}
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2 space-y-1.5">
              <Label className="text-text-secondary text-xs">Host *</Label>
              <Input
                value={form.host}
                onChange={(e) => setForm((p) => ({ ...p, host: e.target.value }))}
                placeholder="192.168.1.1"
                className="bg-bg-darkest border-bg-elevated text-text-primary font-mono"
              />
              {errors.host && <p className="text-xs text-status-critical">{errors.host}</p>}
            </div>
            <div className="space-y-1.5">
              <Label className="text-text-secondary text-xs">Port</Label>
              <Input
                type="number"
                value={form.port}
                onChange={(e) => setForm((p) => ({ ...p, port: parseInt(e.target.value) || 22 }))}
                className="bg-bg-darkest border-bg-elevated text-text-primary font-mono"
              />
              {errors.port && <p className="text-xs text-status-critical">{errors.port}</p>}
            </div>
          </div>

          {/* Username */}
          <div className="space-y-1.5">
            <Label className="text-text-secondary text-xs">Username *</Label>
            <Input
              value={form.username}
              onChange={(e) => setForm((p) => ({ ...p, username: e.target.value }))}
              placeholder="root"
              className="bg-bg-darkest border-bg-elevated text-text-primary font-mono"
            />
            {errors.username && <p className="text-xs text-status-critical">{errors.username}</p>}
          </div>

          {/* Auth Type */}
          <div className="space-y-1.5">
            <Label className="text-text-secondary text-xs">Auth Type</Label>
            <Select
              value={form.authType}
              onValueChange={(v) => setForm((p) => ({ ...p, authType: v as AuthType }))}
            >
              <SelectTrigger className="bg-bg-darkest border-bg-elevated text-text-primary">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-bg-surface border-bg-elevated">
                <SelectItem value="password">Password</SelectItem>
                <SelectItem value="key">SSH Key</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Password or Key Path */}
          {form.authType === 'password' ? (
            <div className="space-y-1.5">
              <Label className="text-text-secondary text-xs">
                Password {mode === 'add' ? '*' : '(leave blank to keep)'}
              </Label>
              <Input
                type="password"
                value={form.password}
                onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
                placeholder="Supports $ENV:VAR_NAME"
                className="bg-bg-darkest border-bg-elevated text-text-primary font-mono"
              />
              {errors.password && <p className="text-xs text-status-critical">{errors.password}</p>}
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label className="text-text-secondary text-xs">Private Key Path *</Label>
              <Input
                value={form.privateKeyPath}
                onChange={(e) => setForm((p) => ({ ...p, privateKeyPath: e.target.value }))}
                placeholder="/home/user/.ssh/id_rsa"
                className="bg-bg-darkest border-bg-elevated text-text-primary font-mono"
              />
              {errors.privateKeyPath && <p className="text-xs text-status-critical">{errors.privateKeyPath}</p>}
            </div>
          )}

          {/* Type */}
          <div className="space-y-1.5">
            <Label className="text-text-secondary text-xs">Server Type</Label>
            <Select
              value={form.type}
              onValueChange={(v) => setForm((p) => ({ ...p, type: v as ServerType, features: [] }))}
            >
              <SelectTrigger className="bg-bg-darkest border-bg-elevated text-text-primary">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-bg-surface border-bg-elevated">
                <SelectItem value="linux">Linux</SelectItem>
                <SelectItem value="windows">Windows</SelectItem>
                <SelectItem value="mikrotik">MikroTik</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* OS */}
          <div className="space-y-1.5">
            <Label className="text-text-secondary text-xs">OS (optional)</Label>
            <Input
              value={form.os}
              onChange={(e) => setForm((p) => ({ ...p, os: e.target.value }))}
              placeholder="Ubuntu 24.04"
              className="bg-bg-darkest border-bg-elevated text-text-primary"
            />
          </div>

          {/* Features */}
          <div className="space-y-1.5">
            <Label className="text-text-secondary text-xs">Features</Label>
            <div className="flex flex-wrap gap-3">
              {availableFeatures.map((feature) => (
                <label key={feature} className="flex items-center gap-1.5 text-xs text-text-secondary cursor-pointer">
                  <Checkbox
                    checked={form.features.includes(feature)}
                    onCheckedChange={() => toggleFeature(feature)}
                  />
                  {feature}
                </label>
              ))}
            </div>
          </div>

          {/* Tags */}
          <div className="space-y-1.5">
            <Label className="text-text-secondary text-xs">Tags (comma-separated)</Label>
            <Input
              value={form.tags}
              onChange={(e) => setForm((p) => ({ ...p, tags: e.target.value }))}
              placeholder="production, web, us-east"
              className="bg-bg-darkest border-bg-elevated text-text-primary"
            />
          </div>

          {/* Test Connection */}
          <div className="flex items-center gap-3">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={handleTestConnection}
              disabled={isTesting || !form.host || !form.username}
              className="gap-1.5"
            >
              {isTesting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wifi className="h-3.5 w-3.5" />}
              Test Connection
            </Button>
            {testResult && (
              <span className={`flex items-center gap-1 text-xs ${testResult.success ? 'text-status-healthy' : 'text-status-critical'}`}>
                {testResult.success ? (
                  <>
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Connected ({testResult.latencyMs}ms)
                  </>
                ) : (
                  <>
                    <XCircle className="h-3.5 w-3.5" />
                    {testResult.error}
                  </>
                )}
              </span>
            )}
          </div>

          {errors.submit && (
            <p className="text-xs text-status-critical">{errors.submit}</p>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            className="text-text-secondary"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="bg-gold-primary text-bg-darkest hover:bg-gold-dark gap-1.5"
          >
            {isSubmitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {mode === 'add' ? 'Add Server' : 'Save Changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

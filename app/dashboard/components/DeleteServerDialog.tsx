'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface DeleteServerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  server: { serverId: string; name: string; host: string } | null;
  onSuccess: () => void;
}

export function DeleteServerDialog({ open, onOpenChange, server, onSuccess }: DeleteServerDialogProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleOpenChange(value: boolean) {
    if (value) setError(null);
    onOpenChange(value);
  }

  async function handleDelete() {
    if (!server) return;
    setIsDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/servers/${server.serverId}`, { method: 'DELETE' });
      if (res.ok) {
        onOpenChange(false);
        onSuccess();
        toast.success(`${server.name} deleted`);
      } else {
        const data = await res.json().catch(() => ({}));
        const msg = data.error || 'Failed to delete server';
        setError(msg);
        toast.error(msg);
      }
    } catch {
      setError('Network error — could not reach server');
      toast.error('Network error');
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="bg-bg-surface border-bg-elevated sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-text-primary">Delete Server</DialogTitle>
          <DialogDescription className="text-text-muted">
            Remove <strong className="text-text-primary">{server?.name}</strong> ({server?.host}) from monitoring? This cannot be undone.
          </DialogDescription>
        </DialogHeader>
        {error && (
          <p className="text-xs text-status-critical px-1">{error}</p>
        )}
        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            className="text-text-secondary"
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={isDeleting}
            className="gap-1.5"
          >
            {isDeleting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Menu, LogOut, RefreshCw, ArrowUpCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { useWebSocket } from '@/hooks/WebSocketProvider';
import { useVersionCheck } from '@/hooks/useVersionCheck';
import { toast } from 'sonner';

interface NavbarProps {
  onMenuToggle: () => void;
}

export function Navbar({ onMenuToggle }: NavbarProps) {
  const router = useRouter();
  const { isConnected, reconnect } = useWebSocket();
  const { current, updateAvailable, latest, releaseUrl } = useVersionCheck();
  const [reconnecting, setReconnecting] = useState(false);

  const handleReconnect = () => {
    reconnect();
    toast.info('Reconnecting...');
    setReconnecting(true);
    setTimeout(() => setReconnecting(false), 3000);
  };

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
  };

  return (
    <header className="fixed top-0 left-0 right-0 z-50 h-14 bg-bg-dark border-b border-bg-elevated flex items-center px-4">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          className="xl:hidden text-text-secondary hover:text-text-primary"
          onClick={onMenuToggle}
        >
          <Menu className="h-5 w-5" />
        </Button>
        <div className="flex items-center tracking-[2px]">
          <span className="text-sm font-bold text-text-primary">ARGU</span>
          <span className="text-sm font-bold text-gold-primary">SIGHT</span>
        </div>
        {current && (
          <span className="text-[10px] font-mono text-text-muted ml-1 hidden sm:inline">
            v{current}
          </span>
        )}
        {updateAvailable && (
          <a
            href={releaseUrl ?? '#'}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-gold-primary/10 hover:bg-gold-primary/20 transition-colors"
          >
            <ArrowUpCircle className="h-3.5 w-3.5 text-gold-primary" />
            <span className="text-[11px] font-mono font-bold text-gold-primary">
              v{latest}
            </span>
          </a>
        )}
      </div>

      <div className="ml-auto flex items-center gap-3">
        <div className="flex items-center gap-2">
          <div
            className={`w-2 h-2 rounded-full ${
              isConnected
                ? 'bg-status-healthy status-dot-online'
                : 'bg-status-critical'
            }`}
          />
          <span className="text-xs font-mono text-text-muted hidden sm:inline">
            {isConnected ? 'Live' : 'Offline'}
          </span>
          {!isConnected && (
            <Button
              variant="ghost"
              size="icon"
              onClick={handleReconnect}
              disabled={reconnecting}
              className="h-7 w-7 text-text-muted hover:text-text-primary"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${reconnecting ? 'animate-spin' : ''}`} />
            </Button>
          )}
        </div>

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="text-text-secondary hover:text-text-primary"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent className="bg-bg-surface border-bg-elevated">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-text-primary">Sign Out</AlertDialogTitle>
              <AlertDialogDescription className="text-text-muted">
                Are you sure you want to sign out? You will need to log in again to access the dashboard.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="bg-bg-elevated border-bg-elevated text-text-secondary hover:bg-bg-dark hover:text-text-primary">
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={handleLogout}
                className="bg-status-critical text-white hover:bg-status-critical/80"
              >
                Sign Out
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </header>
  );
}

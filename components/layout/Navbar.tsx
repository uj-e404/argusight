'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Menu, LogOut, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useWebSocket } from '@/hooks/WebSocketProvider';
import { toast } from 'sonner';

interface NavbarProps {
  onMenuToggle: () => void;
}

export function Navbar({ onMenuToggle }: NavbarProps) {
  const router = useRouter();
  const { isConnected, reconnect } = useWebSocket();
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
        <Button
          variant="ghost"
          size="icon"
          onClick={handleLogout}
          className="text-text-secondary hover:text-text-primary"
        >
          <LogOut className="h-4 w-4" />
        </Button>
      </div>
    </header>
  );
}

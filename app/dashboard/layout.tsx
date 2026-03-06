import { WebSocketProvider } from '@/hooks/WebSocketProvider';
import { DashboardShell } from './components/DashboardShell';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <WebSocketProvider>
      <DashboardShell>{children}</DashboardShell>
    </WebSocketProvider>
  );
}

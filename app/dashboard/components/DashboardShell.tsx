'use client';

import { useState } from 'react';
import { Navbar } from '@/components/layout/Navbar';
import { Sidebar } from '@/components/layout/Sidebar';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { useServerOverview } from '@/hooks/useServerOverview';

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { servers } = useServerOverview();

  return (
    <div className="min-h-screen bg-bg-darkest">
      <Navbar onMenuToggle={() => setSidebarOpen(true)} />

      {/* Desktop sidebar */}
      <aside className="hidden xl:block fixed top-14 left-0 bottom-0 w-[220px]">
        <Sidebar servers={servers} />
      </aside>

      {/* Mobile sidebar */}
      <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
        <SheetContent side="left" className="w-[220px] p-0 bg-bg-dark border-bg-elevated">
          <Sidebar servers={servers} onNavigate={() => setSidebarOpen(false)} />
        </SheetContent>
      </Sheet>

      {/* Main content */}
      <main className="pt-14 xl:pl-[220px]">
        <div className="p-4 md:p-6">{children}</div>
      </main>
    </div>
  );
}

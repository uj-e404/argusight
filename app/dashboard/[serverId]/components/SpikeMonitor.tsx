'use client';

import { useState, useEffect } from 'react';
import { Zap, ArrowDownToLine, ArrowUpFromLine, Trash2, Network, Clock, Wifi, ChevronLeft, ChevronRight } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useSpikeMonitor } from '@/hooks/useSpikeMonitor';
import { useWebSocket } from '@/hooks/WebSocketProvider';
import { usePolling } from './usePolling';
import { formatBps } from '@/lib/format';
import type { NetworkClient, MikroTikInterface } from '@/lib/types';
import type { SpikeEvent } from '@/hooks/useSpikeMonitor';

interface SpikeMonitorProps {
  serverId: string;
}

function formatRate(bytesPerSec: number): string {
  const bps = bytesPerSec * 8;
  if (bps >= 1_000_000_000) return `${(bps / 1_000_000_000).toFixed(2)} Gbps`;
  if (bps >= 1_000_000) return `${(bps / 1_000_000).toFixed(1)} Mbps`;
  if (bps >= 1_000) return `${(bps / 1_000).toFixed(1)} Kbps`;
  return `${Math.round(bps)} bps`;
}

function rateColor(bytesPerSec: number): string {
  const bps = bytesPerSec * 8;
  if (bps >= 10_000_000) return 'text-status-critical';
  if (bps >= 1_000_000) return 'text-status-warning';
  return 'text-status-healthy';
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString('en-US', { hour12: false }) + ' ' + d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function SpikeMonitor({ serverId }: SpikeMonitorProps) {
  const {
    config,
    setConfig,
    activePersonalSpikes,
    isAllTrafficSpike,
    allTrafficBreakdown,
    currentRxBps,
    currentTxBps,
    spikeHistory,
    clearHistory,
    loading,
  } = useSpikeMonitor(serverId);

  // Interface selector for traffic channel
  const { data: ifaceData } = usePolling<{ interfaces: MikroTikInterface[] }>(
    `/api/servers/${serverId}/interfaces`,
    0
  );
  const [selectedInterface, setSelectedInterface] = useState('');
  const { send } = useWebSocket();

  const interfaces = ifaceData?.interfaces?.filter((i) => i.running && !i.disabled) ?? [];

  useEffect(() => {
    if (interfaces.length > 0 && !selectedInterface) {
      const first = interfaces[0].name;
      setSelectedInterface(first);
      send({ type: 'set-interface', serverId, interface: first });
    }
  }, [interfaces.length, selectedInterface, send, serverId]);

  const handleInterfaceChange = (value: string) => {
    setSelectedInterface(value);
    send({ type: 'set-interface', serverId, interface: value });
  };

  // Detail dialog
  const [selectedEvent, setSelectedEvent] = useState<SpikeEvent | null>(null);

  // Pagination
  const PAGE_SIZE = 5;
  const [historyPage, setHistoryPage] = useState(0);
  const totalPages = Math.max(1, Math.ceil(spikeHistory.length / PAGE_SIZE));
  const pagedHistory = spikeHistory.slice(historyPage * PAGE_SIZE, (historyPage + 1) * PAGE_SIZE);

  // Reset page when history changes significantly
  useEffect(() => {
    if (historyPage >= totalPages) setHistoryPage(Math.max(0, totalPages - 1));
  }, [totalPages, historyPage]);

  // Local threshold input state
  const [personalInput, setPersonalInput] = useState(String(config.personalThresholdMbps));
  const [allInput, setAllInput] = useState(String(config.allThresholdMbps));

  useEffect(() => {
    setPersonalInput(String(config.personalThresholdMbps));
    setAllInput(String(config.allThresholdMbps));
  }, [config.personalThresholdMbps, config.allThresholdMbps]);

  const applyPersonalThreshold = (val: string) => {
    const num = parseFloat(val);
    if (!isNaN(num) && num > 0) {
      setConfig({ ...config, personalThresholdMbps: num });
    }
  };

  const applyAllThreshold = (val: string) => {
    const num = parseFloat(val);
    if (!isNaN(num) && num > 0) {
      setConfig({ ...config, allThresholdMbps: num });
    }
  };

  return (
    <div className="space-y-4">
      {/* Config Bar */}
      <div className="bg-bg-surface border border-bg-elevated rounded-lg p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:flex-wrap">
          <div className="space-y-1">
            <label className="text-xs text-text-muted">Personal Threshold</label>
            <div className="flex items-center gap-1.5">
              <Input
                type="number"
                value={personalInput}
                onChange={(e) => setPersonalInput(e.target.value)}
                onBlur={(e) => applyPersonalThreshold(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && applyPersonalThreshold(personalInput)}
                className="w-24 h-8 text-xs bg-bg-dark border-bg-elevated font-mono"
                min={0.001}
                step={0.1}
              />
              <span className="text-xs text-text-muted">Mbps</span>
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-text-muted">All Traffic Threshold</label>
            <div className="flex items-center gap-1.5">
              <Input
                type="number"
                value={allInput}
                onChange={(e) => setAllInput(e.target.value)}
                onBlur={(e) => applyAllThreshold(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && applyAllThreshold(allInput)}
                className="w-24 h-8 text-xs bg-bg-dark border-bg-elevated font-mono"
                min={0.001}
                step={1}
              />
              <span className="text-xs text-text-muted">Mbps</span>
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-text-muted">Interface</label>
            <Select value={selectedInterface} onValueChange={handleInterfaceChange}>
              <SelectTrigger className="h-8 text-xs bg-bg-dark border-bg-elevated w-full sm:w-44">
                <SelectValue placeholder="Select interface" />
              </SelectTrigger>
              <SelectContent className="bg-bg-surface border-bg-elevated">
                {interfaces.map((iface) => (
                  <SelectItem key={iface.name} value={iface.name} className="text-xs">
                    {iface.name} ({iface.type})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Section 1: Personal Spikes */}
      <div className="bg-bg-surface border border-bg-elevated rounded-lg p-3 sm:p-6">
        <h3 className="text-sm font-semibold text-text-primary mb-3 flex items-center gap-2">
          <Zap className="h-4 w-4 text-gold-primary" />
          Personal Spikes
          <span className="text-xs text-text-muted font-normal">
            (&gt;{config.personalThresholdMbps} Mbps per client)
          </span>
        </h3>

        {loading ? (
          <div className="text-center py-6 text-text-muted text-sm">Waiting for network data...</div>
        ) : activePersonalSpikes.length === 0 ? (
          <div className="rounded-md border border-status-healthy/30 bg-status-healthy/5 px-4 py-3 text-sm text-status-healthy">
            No personal spikes — all clients below {config.personalThresholdMbps} Mbps
          </div>
        ) : (
          <div className="space-y-2">
            {activePersonalSpikes.map((client) => (
              <SpikeClientCard key={client.ip} client={client} />
            ))}
          </div>
        )}
      </div>

      {/* Section 2: All Traffic */}
      <div className="bg-bg-surface border border-bg-elevated rounded-lg p-3 sm:p-6">
        <h3 className="text-sm font-semibold text-text-primary mb-3 flex items-center gap-2">
          <Network className="h-4 w-4 text-status-info" />
          All Traffic
          <span className="text-xs text-text-muted font-normal">
            (threshold: {config.allThresholdMbps} Mbps)
          </span>
        </h3>

        {!selectedInterface ? (
          <div className="text-center py-6 text-text-muted text-sm">
            Select an interface above to monitor aggregate traffic
          </div>
        ) : (
          <>
            <div className="flex gap-6 mb-3">
              <div className="flex items-center gap-2">
                <ArrowDownToLine className="h-4 w-4 text-status-info" />
                <span className="text-xs text-text-muted">RX</span>
                <span className="font-mono text-sm font-bold text-status-info">
                  {formatBps(currentRxBps)}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <ArrowUpFromLine className="h-4 w-4 text-status-healthy" />
                <span className="text-xs text-text-muted">TX</span>
                <span className="font-mono text-sm font-bold text-status-healthy">
                  {formatBps(currentTxBps)}
                </span>
              </div>
            </div>

            {!isAllTrafficSpike ? (
              <div className="rounded-md border border-status-healthy/30 bg-status-healthy/5 px-4 py-3 text-sm text-status-healthy">
                Below threshold — {formatBps(currentRxBps + currentTxBps)} / {config.allThresholdMbps} Mbps
              </div>
            ) : (
              <div className="space-y-3">
                <div className="rounded-md border border-status-critical/50 bg-status-critical/10 px-4 py-3 text-sm text-status-critical font-semibold animate-pulse">
                  SPIKE! Total: {formatBps(currentRxBps + currentTxBps)} exceeds {config.allThresholdMbps} Mbps
                </div>

                {/* Top consumers breakdown */}
                <div className="hidden sm:block overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-bg-elevated hover:bg-transparent">
                        <TableHead className="text-text-muted text-xs">Client</TableHead>
                        <TableHead className="text-text-muted text-xs">Download</TableHead>
                        <TableHead className="text-text-muted text-xs">Upload</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {allTrafficBreakdown.slice(0, 10).map((client) => (
                        <TableRow key={client.ip} className="border-bg-elevated">
                          <TableCell>
                            <div className="flex flex-col">
                              {(client.label || client.hostname) && (
                                <span className="text-xs text-text-secondary">{client.label || client.hostname}</span>
                              )}
                              <span className="font-mono text-[11px] text-text-muted">{client.ip}</span>
                            </div>
                          </TableCell>
                          <TableCell className={`font-mono text-xs ${rateColor(client.rateIn)}`}>
                            {formatRate(client.rateIn)}
                          </TableCell>
                          <TableCell className={`font-mono text-xs ${rateColor(client.rateOut)}`}>
                            {formatRate(client.rateOut)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                {/* Mobile breakdown */}
                <div className="sm:hidden space-y-2">
                  {allTrafficBreakdown.slice(0, 10).map((client) => (
                    <div key={client.ip} className="border border-bg-elevated rounded-md p-2.5 space-y-1">
                      <div className="flex justify-between">
                        <span className="text-xs text-text-secondary truncate">{client.label || client.hostname || client.ip}</span>
                      </div>
                      <div className="font-mono text-[11px] text-text-muted">{client.ip}</div>
                      <div className="flex gap-4 text-xs font-mono">
                        <span className={rateColor(client.rateIn)}>DL: {formatRate(client.rateIn)}</span>
                        <span className={rateColor(client.rateOut)}>UL: {formatRate(client.rateOut)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Section 3: Spike History */}
      <div className="bg-bg-surface border border-bg-elevated rounded-lg p-3 sm:p-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-text-primary flex items-center gap-2">
            <Zap className="h-4 w-4 text-text-muted" />
            Spike History
            {spikeHistory.length > 0 && (
              <span className="text-xs text-text-muted font-normal">({spikeHistory.length})</span>
            )}
          </h3>
          {spikeHistory.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { clearHistory(); setHistoryPage(0); }}
              className="text-text-muted hover:text-status-critical h-7 text-xs gap-1"
            >
              <Trash2 className="h-3 w-3" />
              Clear
            </Button>
          )}
        </div>

        {spikeHistory.length === 0 ? (
          <div className="text-center py-6 text-text-muted text-sm">
            No spike events recorded yet
          </div>
        ) : (
          <>
            <div className="space-y-1">
              {pagedHistory.map((event) => (
                <div
                  key={event.id}
                  className="flex items-center gap-3 px-3 py-2 rounded-md cursor-pointer hover:bg-bg-dark/50 transition-colors border border-transparent hover:border-bg-elevated"
                  onClick={() => setSelectedEvent(event)}
                >
                  <Badge
                    variant="outline"
                    className={`flex-shrink-0 ${
                      event.type === 'personal'
                        ? 'text-[10px] border-status-warning/50 text-status-warning'
                        : 'text-[10px] border-status-critical/50 text-status-critical'
                    }`}
                  >
                    {event.type === 'personal' ? 'Personal' : 'All'}
                  </Badge>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-text-primary font-medium truncate">{event.label}</span>
                      {event.ip && <span className="font-mono text-[10px] text-text-muted flex-shrink-0">{event.ip}</span>}
                    </div>
                    <div className="flex items-center gap-3 mt-0.5">
                      <span className="font-mono text-[10px] text-text-muted">{formatTime(event.timestamp)}</span>
                      {event.type === 'personal' ? (
                        <span className="font-mono text-[10px]">
                          <span className={rateColor(event.peakRateIn)}>{formatRate(event.peakRateIn)}</span>
                          <span className="text-text-muted"> / </span>
                          <span className={rateColor(event.peakRateOut)}>{formatRate(event.peakRateOut)}</span>
                        </span>
                      ) : (
                        <span className="font-mono text-[10px]">
                          <span className="text-status-info">{formatBps(event.totalRxBps ?? 0)}</span>
                          <span className="text-text-muted"> / </span>
                          <span className="text-status-healthy">{formatBps(event.totalTxBps ?? 0)}</span>
                        </span>
                      )}
                    </div>
                  </div>
                  <ChevronRight className="h-3.5 w-3.5 text-text-muted flex-shrink-0" />
                </div>
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-3 pt-3 border-t border-bg-elevated">
                <span className="text-[11px] text-text-muted">
                  Page {historyPage + 1} of {totalPages}
                </span>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-text-muted hover:text-text-primary"
                    disabled={historyPage === 0}
                    onClick={() => setHistoryPage(p => p - 1)}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-text-muted hover:text-text-primary"
                    disabled={historyPage >= totalPages - 1}
                    onClick={() => setHistoryPage(p => p + 1)}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Spike Detail Dialog */}
      <SpikeDetailDialog event={selectedEvent} onClose={() => setSelectedEvent(null)} />
    </div>
  );
}

/* ── Spike Client Card (active spikes) ── */

function SpikeClientCard({ client }: { client: NetworkClient }) {
  return (
    <div className="border border-status-critical/50 bg-status-critical/5 rounded-md p-3 animate-pulse">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div className="min-w-0">
          {(client.label || client.hostname) && (
            <div className="text-sm font-medium text-text-primary truncate">
              {client.label || client.hostname}
            </div>
          )}
          <div className="font-mono text-xs text-text-muted">{client.ip}</div>
          {client.mac && <div className="font-mono text-[11px] text-text-muted">{client.mac}</div>}
        </div>
        <div className="flex gap-4 font-mono text-xs flex-shrink-0">
          <span className="flex items-center gap-1">
            <ArrowDownToLine className="h-3 w-3 text-status-info" />
            <span className={rateColor(client.rateIn)}>{formatRate(client.rateIn)}</span>
          </span>
          <span className="flex items-center gap-1">
            <ArrowUpFromLine className="h-3 w-3 text-status-healthy" />
            <span className={rateColor(client.rateOut)}>{formatRate(client.rateOut)}</span>
          </span>
        </div>
      </div>
      {client.topDestinations.length > 0 && (
        <div className="mt-2 pt-2 border-t border-bg-elevated">
          <div className="text-[11px] text-text-muted mb-1">Top destinations:</div>
          <div className="flex flex-wrap gap-1.5">
            {client.topDestinations.slice(0, 5).map((dest) => (
              <Badge
                key={dest.ip}
                variant="outline"
                className="text-[10px] font-mono border-bg-elevated text-text-muted"
              >
                {dest.domain || dest.ip}
              </Badge>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Spike Detail Dialog ── */

function SpikeDetailDialog({ event, onClose }: { event: SpikeEvent | null; onClose: () => void }) {
  if (!event) return null;

  const totalBps = event.type === 'personal'
    ? (event.peakRateIn + event.peakRateOut) * 8
    : (event.totalRxBps ?? 0) + (event.totalTxBps ?? 0);

  return (
    <Dialog open={!!event} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="bg-bg-surface border-bg-elevated sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-text-primary flex items-center gap-2">
            <Zap className={`h-4 w-4 ${event.type === 'personal' ? 'text-status-warning' : 'text-status-critical'}`} />
            Spike Detail
            <Badge
              variant="outline"
              className={
                event.type === 'personal'
                  ? 'text-[10px] border-status-warning/50 text-status-warning ml-1'
                  : 'text-[10px] border-status-critical/50 text-status-critical ml-1'
              }
            >
              {event.type === 'personal' ? 'Personal' : 'All Traffic'}
            </Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Timestamp */}
          <div className="flex items-center gap-2 text-xs text-text-muted">
            <Clock className="h-3.5 w-3.5" />
            {new Date(event.timestamp).toLocaleString('en-US', {
              weekday: 'short', year: 'numeric', month: 'short', day: 'numeric',
              hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
            })}
          </div>

          {event.type === 'personal' ? (
            /* ── Personal spike detail ── */
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <div className="text-[10px] text-text-muted uppercase tracking-wider">Client</div>
                  <div className="text-sm text-text-primary font-medium">{event.label}</div>
                  {event.ip && <div className="font-mono text-xs text-text-muted">{event.ip}</div>}
                </div>
                <div className="space-y-1">
                  <div className="text-[10px] text-text-muted uppercase tracking-wider">Combined Rate</div>
                  <div className={`font-mono text-sm font-bold ${totalBps >= 10_000_000 ? 'text-status-critical' : totalBps >= 1_000_000 ? 'text-status-warning' : 'text-status-healthy'}`}>
                    {formatBps(totalBps)}
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-bg-dark/50 rounded-md p-3 space-y-1">
                  <div className="text-[10px] text-text-muted uppercase tracking-wider flex items-center gap-1">
                    <ArrowDownToLine className="h-2.5 w-2.5 text-status-info" />
                    Download (Peak)
                  </div>
                  <div className="font-mono text-sm font-bold text-status-info">{formatRate(event.peakRateIn)}</div>
                </div>
                <div className="bg-bg-dark/50 rounded-md p-3 space-y-1">
                  <div className="text-[10px] text-text-muted uppercase tracking-wider flex items-center gap-1">
                    <ArrowUpFromLine className="h-2.5 w-2.5 text-status-healthy" />
                    Upload (Peak)
                  </div>
                  <div className="font-mono text-sm font-bold text-status-healthy">{formatRate(event.peakRateOut)}</div>
                </div>
              </div>
            </div>
          ) : (
            /* ── All traffic spike detail ── */
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <div className="text-[10px] text-text-muted uppercase tracking-wider flex items-center gap-1">
                    <Wifi className="h-2.5 w-2.5" />
                    Interface
                  </div>
                  <div className="text-sm text-text-primary font-medium">{event.label.replace('Interface: ', '')}</div>
                </div>
                <div className="space-y-1">
                  <div className="text-[10px] text-text-muted uppercase tracking-wider">Total Bandwidth</div>
                  <div className={`font-mono text-sm font-bold ${totalBps >= 100_000_000 ? 'text-status-critical' : totalBps >= 10_000_000 ? 'text-status-warning' : 'text-status-healthy'}`}>
                    {formatBps(totalBps)}
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-bg-dark/50 rounded-md p-3 space-y-1">
                  <div className="text-[10px] text-text-muted uppercase tracking-wider flex items-center gap-1">
                    <ArrowDownToLine className="h-2.5 w-2.5 text-status-info" />
                    RX (Peak)
                  </div>
                  <div className="font-mono text-sm font-bold text-status-info">{formatBps(event.totalRxBps ?? 0)}</div>
                </div>
                <div className="bg-bg-dark/50 rounded-md p-3 space-y-1">
                  <div className="text-[10px] text-text-muted uppercase tracking-wider flex items-center gap-1">
                    <ArrowUpFromLine className="h-2.5 w-2.5 text-status-healthy" />
                    TX (Peak)
                  </div>
                  <div className="font-mono text-sm font-bold text-status-healthy">{formatBps(event.totalTxBps ?? 0)}</div>
                </div>
              </div>

              {/* Top consumers at time of spike */}
              {event.topConsumers && event.topConsumers.length > 0 && (
                <div className="space-y-2">
                  <div className="text-xs text-text-muted font-medium flex items-center gap-1.5">
                    <Network className="h-3.5 w-3.5" />
                    Top Consumers at Spike ({event.topConsumers.length})
                  </div>
                  <div className="border border-bg-elevated rounded-md overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow className="border-bg-elevated hover:bg-transparent">
                          <TableHead className="text-text-muted text-[10px] py-1.5">Client</TableHead>
                          <TableHead className="text-text-muted text-[10px] py-1.5">Download</TableHead>
                          <TableHead className="text-text-muted text-[10px] py-1.5">Upload</TableHead>
                          <TableHead className="text-text-muted text-[10px] py-1.5">Total</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {event.topConsumers.map((c) => (
                          <TableRow key={c.ip} className="border-bg-elevated">
                            <TableCell className="py-1.5">
                              <div className="flex flex-col">
                                <span className="text-xs text-text-secondary">{c.label}</span>
                                <span className="font-mono text-[10px] text-text-muted">{c.ip}</span>
                              </div>
                            </TableCell>
                            <TableCell className={`font-mono text-xs py-1.5 ${rateColor(c.rateIn)}`}>
                              {formatRate(c.rateIn)}
                            </TableCell>
                            <TableCell className={`font-mono text-xs py-1.5 ${rateColor(c.rateOut)}`}>
                              {formatRate(c.rateOut)}
                            </TableCell>
                            <TableCell className={`font-mono text-xs py-1.5 font-bold ${rateColor(c.rateIn + c.rateOut)}`}>
                              {formatRate(c.rateIn + c.rateOut)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

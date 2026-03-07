'use client';

import { useState, useEffect, useMemo } from 'react';
import { useServerTraffic } from '@/hooks/useServerTraffic';
import { useWebSocket } from '@/hooks/WebSocketProvider';
import { usePolling } from './usePolling';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { MikroTikInterface } from '@/lib/types';

interface TrafficChartProps {
  serverId: string;
}

function formatBandwidth(bps: number): string {
  if (bps >= 1_000_000_000) return `${(bps / 1_000_000_000).toFixed(2)} Gbps`;
  if (bps >= 1_000_000) return `${(bps / 1_000_000).toFixed(2)} Mbps`;
  if (bps >= 1_000) return `${(bps / 1_000).toFixed(1)} Kbps`;
  return `${bps} bps`;
}

const userTimezone = typeof window !== 'undefined'
  ? Intl.DateTimeFormat().resolvedOptions().timeZone
  : 'UTC';

function formatTime(timestamp: string): string {
  const d = new Date(timestamp);
  return d.toLocaleTimeString('en-US', { hour12: false, timeZone: userTimezone });
}

export function TrafficChart({ serverId }: TrafficChartProps) {
  const { data: ifaceData } = usePolling<{ interfaces: MikroTikInterface[] }>(
    `/api/servers/${serverId}/interfaces`,
    0 // one-shot
  );

  const [selectedInterface, setSelectedInterface] = useState<string>('');
  const { send } = useWebSocket();
  const { data, loading, reset } = useServerTraffic(serverId);

  const interfaces = ifaceData?.interfaces?.filter((i) => i.running && !i.disabled) ?? [];

  // Auto-select first interface
  useEffect(() => {
    if (interfaces.length > 0 && !selectedInterface) {
      const first = interfaces[0].name;
      setSelectedInterface(first);
      send({ type: 'set-interface', serverId, interface: first });
    }
  }, [interfaces.length, selectedInterface, send, serverId]);

  const handleInterfaceChange = (value: string) => {
    setSelectedInterface(value);
    reset();
    send({ type: 'set-interface', serverId, interface: value });
  };

  const latest = data.length > 0 ? data[data.length - 1] : null;

  const chartData = data.map((d) => ({
    time: formatTime(d.timestamp),
    download: d.rxBps,
    upload: d.txBps,
  }));

  return (
    <div className="bg-bg-surface border border-bg-elevated rounded-lg p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex gap-8">
          <div>
            <div className="text-xs text-text-muted mb-1">Download (RX)</div>
            <div className="font-mono text-2xl font-bold text-status-info">
              {loading || !latest ? '--' : formatBandwidth(latest.rxBps)}
            </div>
          </div>
          <div>
            <div className="text-xs text-text-muted mb-1">Upload (TX)</div>
            <div className="font-mono text-2xl font-bold text-status-healthy">
              {loading || !latest ? '--' : formatBandwidth(latest.txBps)}
            </div>
          </div>
        </div>
        <div className="w-48">
          <Select value={selectedInterface} onValueChange={handleInterfaceChange}>
            <SelectTrigger className="h-8 text-xs bg-bg-dark border-bg-elevated">
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

      {/* Chart */}
      <div className="h-[300px]">
        {chartData.length === 0 ? (
          <div className="flex items-center justify-center h-full text-text-muted text-sm">
            {loading ? 'Waiting for traffic data...' : selectedInterface ? 'No data yet' : 'Select an interface'}
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2A2A3C" />
              <XAxis
                dataKey="time"
                stroke="#6B6B7B"
                fontSize={10}
                tickLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                stroke="#6B6B7B"
                fontSize={10}
                tickLine={false}
                tickFormatter={(v) => formatBandwidth(v)}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#1E1E2E',
                  border: '1px solid #2A2A3C',
                  borderRadius: '8px',
                  fontSize: '12px',
                }}
                labelStyle={{ color: '#9E9EA8' }}
                formatter={(value: number | undefined, name: string | undefined) => [formatBandwidth(value ?? 0), name === 'download' ? 'Download (RX)' : 'Upload (TX)']}
              />
              <Area
                type="monotone"
                dataKey="download"
                stroke="#60A5FA"
                fill="#60A5FA"
                fillOpacity={0.15}
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
                name="download"
              />
              <Area
                type="monotone"
                dataKey="upload"
                stroke="#4ADE80"
                fill="#4ADE80"
                fillOpacity={0.15}
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
                name="upload"
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

'use client';

import { useMemo } from 'react';
import { Activity } from 'lucide-react';
import { useServerStats } from '@/hooks/useServerStats';
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';

interface CpuRamChartProps {
  serverId: string;
}

const userTimezone = typeof window !== 'undefined'
  ? Intl.DateTimeFormat().resolvedOptions().timeZone
  : 'UTC';

function getTimezoneAbbr(): string {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZoneName: 'short',
      timeZone: userTimezone,
    }).formatToParts(new Date());
    return parts.find((p) => p.type === 'timeZoneName')?.value || userTimezone;
  } catch {
    return 'UTC';
  }
}

function formatTime(timestamp: string): string {
  const d = new Date(timestamp);
  return d.toLocaleTimeString('en-US', { hour12: false, timeZone: userTimezone });
}

export function CpuRamChart({ serverId }: CpuRamChartProps) {
  const { data, loading } = useServerStats(serverId);
  const tzAbbr = useMemo(() => getTimezoneAbbr(), []);

  const latest = data.length > 0 ? data[data.length - 1] : null;

  const chartData = data.map((d) => ({
    time: formatTime(d.timestamp),
    cpu: d.cpu,
    ram: d.ram,
  }));

  return (
    <div className="bg-bg-surface border border-bg-elevated rounded-lg p-6">
      {/* Current values + timezone label */}
      <div className="flex items-end justify-between mb-6">
        <div className="flex gap-8">
          <div>
            <div className="text-xs text-text-muted mb-1">CPU</div>
            <div className="font-mono text-[32px] font-bold text-status-info">
              {loading ? '--' : latest ? `${latest.cpu}%` : '--'}
            </div>
          </div>
          <div>
            <div className="text-xs text-text-muted mb-1">RAM</div>
            <div className="font-mono text-[32px] font-bold text-gold-primary">
              {loading ? '--' : latest ? `${latest.ram}%` : '--'}
            </div>
          </div>
        </div>
        <span className="font-mono text-[11px] text-text-muted">
          Time: {tzAbbr}
        </span>
      </div>

      {/* Chart */}
      <div className="h-[300px]">
        {chartData.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-text-muted text-sm">
            <Activity className="h-10 w-10 text-text-muted/30 mb-2" />
            {loading ? 'Waiting for data...' : 'No data available'}
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2A2A3C" />
              <XAxis
                dataKey="time"
                stroke="#6B6B7B"
                fontSize={10}
                tickLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                domain={[0, 100]}
                stroke="#6B6B7B"
                fontSize={10}
                tickLine={false}
                tickFormatter={(v) => `${v}%`}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#1E1E2E',
                  border: '1px solid #2A2A3C',
                  borderRadius: '8px',
                  fontSize: '12px',
                }}
                labelStyle={{ color: '#9E9EA8' }}
              />
              <Line
                type="monotone"
                dataKey="cpu"
                stroke="#60A5FA"
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
                name="CPU"
              />
              <Line
                type="monotone"
                dataKey="ram"
                stroke="#D4A853"
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
                name="RAM"
              />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

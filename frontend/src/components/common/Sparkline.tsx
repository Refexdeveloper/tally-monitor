import { useId } from 'react';
import { Area, AreaChart, ResponsiveContainer, Tooltip } from 'recharts';

export function Sparkline({ data, color, height = 56, width = 110 }: { data: { date: string; value: number }[]; color: string; height?: number; width?: number }) {
  const id = useId().replace(/:/g, '');
  return (
    <div style={{ width, height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 4, right: 2, bottom: 2, left: 2 }}>
          <defs>
            <linearGradient id={`spark-${id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.35} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Tooltip
            cursor={false}
            contentStyle={{ borderRadius: 10, border: 'none', fontSize: 12, padding: '4px 8px' }}
            labelFormatter={(_, p) => (p?.[0]?.payload as { date?: string } | undefined)?.date ?? ''}
            formatter={(v) => [String(v), 'Count']}
          />
          <Area type="monotone" dataKey="value" stroke={color} strokeWidth={2.4} fill={`url(#spark-${id})`} dot={false} isAnimationActive />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

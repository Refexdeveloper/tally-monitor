import { Box, Typography } from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { ReportChart as ChartSpec } from '@/api/reportTypes';
import { chartColors } from '@/theme/theme';
import { formatCompact, formatNumber } from '@/utils/format';

export function ReportChartPanel({ chart }: { chart: ChartSpec }) {
  const theme = useTheme();
  const tick = { fill: theme.palette.text.secondary, fontSize: 11 };
  const grid = alpha(theme.palette.text.secondary, 0.14);
  const seriesKey = chart.series[0]?.key ?? 'value';

  return (
    <Box sx={{ p: 2.5, borderRadius: 4, bgcolor: alpha(theme.palette.text.primary, 0.02), border: `1px solid ${alpha(theme.palette.divider, 0.8)}` }}>
      <Typography variant="subtitle2" sx={{ mb: 1.5 }}>
        {chart.title}
      </Typography>
      <Box sx={{ height: 260 }}>
        <ResponsiveContainer width="100%" height="100%">
          {chart.type === 'line' ? (
            <LineChart data={chart.points} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="4 4" stroke={grid} vertical={false} />
              <XAxis dataKey={chart.xKey} tick={tick} axisLine={false} tickLine={false} minTickGap={20} />
              <YAxis tick={tick} axisLine={false} tickLine={false} tickFormatter={(v: number) => formatCompact(v)} width={48} />
              <Tooltip formatter={(v) => formatNumber(Number(v))} />
              <Line type="monotone" dataKey={seriesKey} stroke={chartColors[0]} strokeWidth={2.5} dot={false} />
            </LineChart>
          ) : chart.type === 'pie' ? (
            <PieChart>
              <Pie data={chart.points} dataKey={seriesKey} nameKey={chart.xKey} innerRadius={55} outerRadius={95} paddingAngle={2}>
                {chart.points.map((_, i) => (
                  <Cell key={i} fill={chartColors[i % chartColors.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(v) => formatNumber(Number(v))} />
            </PieChart>
          ) : (
            <BarChart data={chart.points} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="4 4" stroke={grid} vertical={false} />
              <XAxis dataKey={chart.xKey} tick={tick} axisLine={false} tickLine={false} interval={0} angle={chart.points.length > 6 ? -25 : 0} textAnchor={chart.points.length > 6 ? 'end' : 'middle'} height={chart.points.length > 6 ? 60 : 30} />
              <YAxis tick={tick} axisLine={false} tickLine={false} tickFormatter={(v: number) => formatCompact(v)} width={48} />
              <Tooltip formatter={(v) => formatNumber(Number(v))} />
              <Bar dataKey={seriesKey} radius={[6, 6, 0, 0]}>
                {chart.points.map((_, i) => (
                  <Cell key={i} fill={chartColors[i % chartColors.length]} />
                ))}
              </Bar>
            </BarChart>
          )}
        </ResponsiveContainer>
      </Box>
    </Box>
  );
}

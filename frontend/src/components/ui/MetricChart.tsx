import { LineChart, AreaChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { theme } from '@/lib/theme'

interface MetricChartProps {
  title: string
  data: Array<{ timestamp: number; value: number }>
  color: string
  formatValue: (v: number) => string
  height?: number
  variant?: 'line' | 'area'
  yDomain?: [number, number]
}

export function MetricChart({ title, data, color, formatValue, height = 220, variant = 'line', yDomain }: MetricChartProps) {
  const ChartComponent = variant === 'area' ? AreaChart : LineChart

  return (
    <div className="card" style={{ padding: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: theme.text.heading, marginBottom: 12 }}>{title}</div>
      {data.length === 0 ? (
        <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center', color: theme.text.secondary, fontSize: 13 }}>
          No data available
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={height}>
          <ChartComponent data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke={theme.main.cardBorder} />
            <XAxis
              dataKey="timestamp"
              tickFormatter={(ts) => new Date(ts * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              tick={{ fontSize: 10, fill: theme.text.secondary }}
              stroke={theme.main.cardBorder}
            />
            <YAxis
              tickFormatter={(v) => formatValue(v)}
              tick={{ fontSize: 10, fill: theme.text.secondary }}
              stroke={theme.main.cardBorder}
              width={50}
              domain={yDomain}
            />
            <Tooltip
              contentStyle={{ background: theme.main.card, border: `1px solid ${theme.main.cardBorder}`, boxShadow: theme.shadow.card, borderRadius: 6, fontSize: 12 }}
              labelFormatter={(ts) => new Date(Number(ts) * 1000).toLocaleString()}
              formatter={(value: number) => [formatValue(value), '']}
            />
            {variant === 'area' ? (
              <Area type="monotone" dataKey="value" stroke={color} strokeWidth={1.5} fill={color} fillOpacity={0.15} dot={false} />
            ) : (
              <Line type="monotone" dataKey="value" stroke={color} strokeWidth={1.5} dot={false} />
            )}
          </ChartComponent>
        </ResponsiveContainer>
      )}
    </div>
  )
}

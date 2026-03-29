import { useState } from 'react'
import { TopBar } from '@/components/layout/TopBar'
import { useClusterMetrics } from '@/hooks/useMetrics'
import { useDashboard } from '@/hooks/useVMs'
import { MetricChart } from '@/components/ui/MetricChart'
import { TimeRangeSelector } from '@/components/ui/TimeRangeSelector'
import { theme } from '@/lib/theme'
import { CardSkeleton } from '@/components/ui/Skeleton'
import { Cpu, MemoryStick, Network, HardDrive, Monitor } from 'lucide-react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'

function StatCard({ label, value, icon, color }: { label: string; value: string; icon: React.ReactNode; color: string }) {
  return (
    <div style={{
      background: theme.main.card,
      border: `1px solid ${theme.main.cardBorder}`,
      boxShadow: theme.shadow.card,
      borderRadius: theme.radius.lg,
      padding: 16,
      flex: 1,
      minWidth: 0,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <div style={{ color, opacity: 0.7 }}>{icon}</div>
        <span style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', color: theme.text.secondary, fontWeight: 500 }}>{label}</span>
      </div>
      <div style={{ fontSize: 24, fontWeight: 700, color: theme.text.heading, fontFamily: theme.typography.heading.fontFamily }}>{value}</div>
    </div>
  )
}

const latest = (series: Array<{ timestamp: number; value: number }> | undefined) =>
  series && series.length > 0 ? series[series.length - 1].value : 0


export function ClusterMetricsPage() {
  const [range, setRange] = useState('1h')
  const { data, isLoading } = useClusterMetrics(range)
  const { data: dashData } = useDashboard()
  const reservedCpu = dashData?.reserved_cpu_cores ?? 0
  const reservedMemGb = (dashData?.reserved_memory_mb ?? 0) / 1024

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <TopBar title="Cluster Metrics" hideNamespace />
      <div className="page-content">
        <div className="page-container">
          {/* Time Range Selector */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
            <TimeRangeSelector value={range} onChange={setRange} />
          </div>

          {isLoading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'flex', gap: 16 }}>
                <CardSkeleton /><CardSkeleton /><CardSkeleton /><CardSkeleton />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}>
                <CardSkeleton /><CardSkeleton /><CardSkeleton /><CardSkeleton />
              </div>
            </div>
          ) : (
            <>
              {/* Stat Cards */}
              <div style={{ display: 'flex', gap: 16, marginBottom: 24 }}>
                <StatCard
                  label="VMs"
                  value={String(Math.round(latest(data?.vm_count)))}
                  icon={<Monitor size={18} />}
                  color={theme.accent}
                />
                <StatCard
                  label="CPU (used / reserved)"
                  value={`${latest(data?.total_cpu).toFixed(1)} / ${reservedCpu} cores`}
                  icon={<Cpu size={18} />}
                  color={theme.status.running}
                />
                <StatCard
                  label="Memory (used / reserved)"
                  value={`${(latest(data?.total_memory) / 1024 / 1024 / 1024).toFixed(1)} / ${reservedMemGb.toFixed(1)} GB`}
                  icon={<MemoryStick size={18} />}
                  color="#f59e0b"
                />
                <StatCard
                  label="Storage"
                  value={`${(latest(data?.storage_usage_avg) * 100).toFixed(1)}%`}
                  icon={<HardDrive size={18} />}
                  color="#8b5cf6"
                />
              </div>

              {/* Charts Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}>
                {/* VM CPU: Usage with Reserved reference line */}
                <div className="card" style={{ padding: 16 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: theme.text.heading, marginBottom: 4 }}>VM CPU (cores)</div>
                  <div style={{ fontSize: 11, color: theme.text.dim, marginBottom: 12 }}>
                    Dashed line = reserved ({reservedCpu} cores from VM specs)
                  </div>
                  {(data?.total_cpu ?? []).length === 0 ? (
                    <div style={{ height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', color: theme.text.secondary, fontSize: 13 }}>No data available</div>
                  ) : (
                    <ResponsiveContainer width="100%" height={220}>
                      <LineChart data={data?.total_cpu ?? []}>
                        <CartesianGrid strokeDasharray="3 3" stroke={theme.main.cardBorder} />
                        <XAxis dataKey="timestamp" tickFormatter={(ts) => new Date(ts * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} tick={{ fontSize: 10, fill: theme.text.secondary }} stroke={theme.main.cardBorder} />
                        <YAxis tickFormatter={(v) => `${v.toFixed(1)}`} tick={{ fontSize: 10, fill: theme.text.secondary }} stroke={theme.main.cardBorder} width={50} />
                        <Tooltip contentStyle={{ background: theme.main.card, border: `1px solid ${theme.main.cardBorder}`, borderRadius: 6, fontSize: 12 }} labelFormatter={(ts) => new Date(Number(ts) * 1000).toLocaleString()} formatter={(value: number) => [`${value.toFixed(2)} cores`, 'Used']} />
                        <Line type="monotone" dataKey="value" stroke={theme.accent} strokeWidth={2} dot={false} name="Used" />
                        {reservedCpu > 0 && <ReferenceLine y={reservedCpu} stroke={theme.status.migrating} strokeDasharray="6 3" strokeWidth={1.5} label={{ value: `Reserved: ${reservedCpu}`, position: 'right', fontSize: 10, fill: theme.status.migrating }} />}
                      </LineChart>
                    </ResponsiveContainer>
                  )}
                </div>

                {/* VM Memory: Usage with Reserved reference line */}
                <div className="card" style={{ padding: 16 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: theme.text.heading, marginBottom: 4 }}>VM Memory</div>
                  <div style={{ fontSize: 11, color: theme.text.dim, marginBottom: 12 }}>
                    Dashed line = reserved ({reservedMemGb.toFixed(1)} GB from VM specs)
                  </div>
                  {(data?.total_memory ?? []).length === 0 ? (
                    <div style={{ height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', color: theme.text.secondary, fontSize: 13 }}>No data available</div>
                  ) : (
                    <ResponsiveContainer width="100%" height={220}>
                      <LineChart data={(data?.total_memory ?? []).map((d: any) => ({ ...d, value: d.value / 1024 / 1024 / 1024 }))}>
                        <CartesianGrid strokeDasharray="3 3" stroke={theme.main.cardBorder} />
                        <XAxis dataKey="timestamp" tickFormatter={(ts) => new Date(ts * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} tick={{ fontSize: 10, fill: theme.text.secondary }} stroke={theme.main.cardBorder} />
                        <YAxis tickFormatter={(v) => `${v.toFixed(1)} GB`} tick={{ fontSize: 10, fill: theme.text.secondary }} stroke={theme.main.cardBorder} width={60} />
                        <Tooltip contentStyle={{ background: theme.main.card, border: `1px solid ${theme.main.cardBorder}`, borderRadius: 6, fontSize: 12 }} labelFormatter={(ts) => new Date(Number(ts) * 1000).toLocaleString()} formatter={(value: number) => [`${value.toFixed(1)} GB`, 'Used']} />
                        <Line type="monotone" dataKey="value" stroke={theme.status.running} strokeWidth={2} dot={false} name="Used" />
                        {reservedMemGb > 0 && <ReferenceLine y={reservedMemGb} stroke={theme.status.migrating} strokeDasharray="6 3" strokeWidth={1.5} label={{ value: `Reserved: ${reservedMemGb.toFixed(1)} GB`, position: 'right', fontSize: 10, fill: theme.status.migrating }} />}
                      </LineChart>
                    </ResponsiveContainer>
                  )}
                </div>

                {/* Network Throughput - RX and TX side by side */}
                <div style={{
                  gridColumn: 'span 2',
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: 16,
                }}>
                  <MetricChart
                    title="Network Receive"
                    data={data?.total_network_rx}
                    color="#3b82f6"
                    formatValue={(v) => `${(v / 1024).toFixed(1)} KB/s`}
                  />
                  <MetricChart
                    title="Network Transmit"
                    data={data?.total_network_tx}
                    color="#f97316"
                    formatValue={(v) => `${(v / 1024).toFixed(1)} KB/s`}
                  />
                </div>

                {/* Node CPU Average */}
                <MetricChart
                  title="Node CPU Average (%)"
                  data={data?.node_cpu_avg}
                  color={theme.accent}
                  formatValue={(v) => `${(v * 100).toFixed(1)}%`}
                  yDomain={[0, 1]}
                />

                {/* Node Memory Average */}
                <MetricChart
                  title="Node Memory Average (%)"
                  data={data?.node_memory_avg}
                  color={theme.status.running}
                  formatValue={(v) => `${(v * 100).toFixed(1)}%`}
                  yDomain={[0, 1]}
                />

                {/* Storage Utilization */}
                <MetricChart
                  title="Storage Utilization (%)"
                  data={data?.storage_usage_avg}
                  color="#8b5cf6"
                  formatValue={(v) => `${(v * 100).toFixed(1)}%`}
                  yDomain={[0, 1]}
                />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

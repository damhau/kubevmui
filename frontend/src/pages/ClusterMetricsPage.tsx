import { useState } from 'react'
import { TopBar } from '@/components/layout/TopBar'
import { useClusterMetrics } from '@/hooks/useMetrics'
import { MetricChart } from '@/components/ui/MetricChart'
import { TimeRangeSelector } from '@/components/ui/TimeRangeSelector'
import { theme } from '@/lib/theme'
import { CardSkeleton } from '@/components/ui/Skeleton'
import { Cpu, MemoryStick, Network, HardDrive, Monitor, Server } from 'lucide-react'

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
                  label="CPU Usage"
                  value={`${latest(data?.total_cpu).toFixed(2)} cores`}
                  icon={<Cpu size={18} />}
                  color={theme.status.running}
                />
                <StatCard
                  label="Memory Usage"
                  value={`${(latest(data?.total_memory) / 1024 / 1024 / 1024).toFixed(1)} GB`}
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
                {/* VM CPU Usage */}
                <MetricChart
                  title="VM CPU Usage (cores)"
                  data={data?.total_cpu}
                  color={theme.accent}
                  formatValue={(v) => `${v.toFixed(2)} cores`}
                />

                {/* VM Memory Usage */}
                <MetricChart
                  title="VM Memory Usage"
                  data={data?.total_memory}
                  color={theme.status.running}
                  formatValue={(v) => `${(v / 1024 / 1024 / 1024).toFixed(1)} GB`}
                />

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

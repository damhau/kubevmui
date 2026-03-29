import { useState } from 'react'
import { TopBar } from '@/components/layout/TopBar'
import { TimeRangeSelector } from '@/components/ui/TimeRangeSelector'
import { MetricChart } from '@/components/ui/MetricChart'
import { CardSkeleton } from '@/components/ui/Skeleton'
import { theme } from '@/lib/theme'
import { useTopConsumers, useTrends, useMigrationStats } from '@/hooks/useAnalytics'

type MetricType = 'cpu' | 'memory' | 'network'

function formatValue(value: number, metric: MetricType): string {
  switch (metric) {
    case 'cpu':
      return `${value.toFixed(2)} cores`
    case 'memory':
      return `${(value / 1024 / 1024 / 1024).toFixed(1)} GB`
    case 'network':
      return `${(value / 1024).toFixed(1)} KB/s`
  }
}

function getBarColor(metric: MetricType): string {
  switch (metric) {
    case 'cpu':
      return theme.accent
    case 'memory':
      return theme.status.running
    case 'network':
      return theme.status.provisioning
  }
}

function getPhaseBadgeStyle(phase: string): React.CSSProperties {
  switch (phase) {
    case 'Succeeded':
      return { background: theme.status.runningBg, color: theme.status.running, border: `1px solid ${theme.status.running}30` }
    case 'Failed':
      return { background: theme.status.errorBg, color: theme.status.error, border: `1px solid ${theme.status.error}30` }
    default:
      return { background: theme.status.stoppedBg, color: theme.status.stopped, border: `1px solid ${theme.status.stopped}30` }
  }
}

export function AnalyticsPage() {
  const [range, setRange] = useState('24h')
  const [metric, setMetric] = useState<MetricType>('cpu')

  const { data: consumersData, isLoading: consumersLoading } = useTopConsumers(metric, range, 10)
  const { data: trendsData, isLoading: trendsLoading } = useTrends(range)
  const { data: migrationsData, isLoading: migrationsLoading } = useMigrationStats(range)

  const consumers = consumersData?.items ?? []
  const barColor = getBarColor(metric)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <TopBar title="Analytics" hideNamespace />
      <div className="page-content">
        <div className="page-container">
          {/* Header with time range */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
            <div style={{ fontSize: 13, color: theme.text.secondary }}>
              Resource usage analytics across your virtual machines
            </div>
            <TimeRangeSelector value={range} onChange={setRange} />
          </div>

          {/* Section 1: Top Consumers */}
          <div className="card" style={{ padding: 20, marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div style={{ fontSize: 16, fontWeight: 600, color: theme.text.heading, fontFamily: theme.typography.heading.fontFamily }}>
                Top Consumers
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                {(['cpu', 'memory', 'network'] as MetricType[]).map((m) => (
                  <button
                    key={m}
                    onClick={() => setMetric(m)}
                    style={{
                      padding: '5px 14px',
                      fontSize: 12,
                      fontFamily: 'inherit',
                      borderRadius: theme.radius.md,
                      cursor: 'pointer',
                      background: metric === m ? getBarColor(m) : theme.main.card,
                      color: metric === m ? '#fff' : theme.text.primary,
                      border: metric === m ? `1px solid ${getBarColor(m)}` : `1px solid ${theme.main.inputBorder}`,
                      fontWeight: metric === m ? 600 : 400,
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em',
                    }}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>

            {consumersLoading ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {Array.from({ length: 5 }).map((_, i) => (
                  <CardSkeleton key={i} height={28} />
                ))}
              </div>
            ) : consumers.length === 0 ? (
              <div style={{ padding: '32px 0', textAlign: 'center', color: theme.text.secondary, fontSize: 13 }}>
                No data available for the selected time range
              </div>
            ) : (
              <div>
                {consumers.map((c: any, i: number) => {
                  const maxVal = Math.max(...consumers.map((x: any) => x.value), 1)
                  const pct = (c.value / maxVal) * 100
                  return (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                      <span style={{ width: 150, fontSize: 13, color: theme.text.primary, fontWeight: 500, fontFamily: theme.typography.mono.fontFamily, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.vm_name}</span>
                      <div style={{ flex: 1, height: 20, background: theme.main.inputBg, borderRadius: theme.radius.sm, overflow: 'hidden' }}>
                        <div style={{ width: `${pct}%`, height: '100%', background: barColor, borderRadius: theme.radius.sm, transition: 'width 0.3s' }} />
                      </div>
                      <span style={{ width: 80, textAlign: 'right', fontSize: 12, color: theme.text.secondary, fontFamily: theme.typography.mono.fontFamily }}>{formatValue(c.value, metric)}</span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Section 2: Trends */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 16, fontWeight: 600, color: theme.text.heading, fontFamily: theme.typography.heading.fontFamily, marginBottom: 12 }}>
              Trends
            </div>
            {trendsLoading ? (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                {Array.from({ length: 3 }).map((_, i) => (
                  <CardSkeleton key={i} height={260} />
                ))}
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <MetricChart
                  title="VM Count"
                  data={trendsData?.vm_count ?? []}
                  color={theme.accent}
                  formatValue={(v) => String(Math.round(v))}
                  variant="area"
                />
                <MetricChart
                  title="Total CPU Usage"
                  data={trendsData?.total_cpu ?? []}
                  color={theme.status.provisioning}
                  formatValue={(v) => `${v.toFixed(2)} cores`}
                  variant="area"
                />
                <MetricChart
                  title="Total Memory Usage"
                  data={trendsData?.total_memory ?? []}
                  color={theme.status.running}
                  formatValue={(v) => `${(v / 1024 / 1024 / 1024).toFixed(1)} GB`}
                  variant="area"
                />
              </div>
            )}
          </div>

          {/* Section 3: Migrations */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 16, fontWeight: 600, color: theme.text.heading, fontFamily: theme.typography.heading.fontFamily, marginBottom: 12 }}>
              Migrations
            </div>

            {migrationsLoading ? (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 16 }}>
                {Array.from({ length: 3 }).map((_, i) => (
                  <CardSkeleton key={i} height={80} />
                ))}
              </div>
            ) : (
              <>
                {/* Stat cards */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 16 }}>
                  <div className="card" style={{ padding: 16 }}>
                    <div style={{ ...theme.typography.label, color: theme.text.secondary, marginBottom: 4 }}>Total</div>
                    <div style={{ fontSize: 28, fontWeight: 700, color: theme.text.heading, fontFamily: theme.typography.heading.fontFamily }}>
                      {migrationsData?.total ?? 0}
                    </div>
                  </div>
                  <div className="card" style={{ padding: 16 }}>
                    <div style={{ ...theme.typography.label, color: theme.text.secondary, marginBottom: 4 }}>Succeeded</div>
                    <div style={{ fontSize: 28, fontWeight: 700, color: theme.status.running, fontFamily: theme.typography.heading.fontFamily }}>
                      {migrationsData?.succeeded ?? 0}
                    </div>
                  </div>
                  <div className="card" style={{ padding: 16 }}>
                    <div style={{ ...theme.typography.label, color: theme.text.secondary, marginBottom: 4 }}>Failed</div>
                    <div style={{ fontSize: 28, fontWeight: 700, color: theme.status.error, fontFamily: theme.typography.heading.fontFamily }}>
                      {migrationsData?.failed ?? 0}
                    </div>
                  </div>
                </div>

                {/* Migrations table */}
                <div className="card" style={{ overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ background: theme.main.tableHeaderBg }}>
                        <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: theme.text.secondary, textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: `1px solid ${theme.main.tableRowBorder}` }}>Timestamp</th>
                        <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: theme.text.secondary, textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: `1px solid ${theme.main.tableRowBorder}` }}>VM Name</th>
                        <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: theme.text.secondary, textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: `1px solid ${theme.main.tableRowBorder}` }}>Namespace</th>
                        <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: theme.text.secondary, textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: `1px solid ${theme.main.tableRowBorder}` }}>Phase</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(migrationsData?.migrations ?? []).length === 0 ? (
                        <tr>
                          <td colSpan={4} style={{ padding: '32px 16px', textAlign: 'center', color: theme.text.secondary, fontSize: 13 }}>
                            No migrations in the selected time range
                          </td>
                        </tr>
                      ) : (
                        (migrationsData?.migrations ?? []).map((m: any, i: number) => (
                          <tr key={i} style={{ borderBottom: `1px solid ${theme.main.tableRowBorder}` }}>
                            <td style={{ padding: '10px 16px', fontSize: 13, color: theme.text.primary, fontFamily: theme.typography.mono.fontFamily }}>
                              {new Date(m.timestamp).toLocaleString()}
                            </td>
                            <td style={{ padding: '10px 16px', fontSize: 13, color: theme.text.primary, fontWeight: 500 }}>
                              {m.vm_name}
                            </td>
                            <td style={{ padding: '10px 16px', fontSize: 13, color: theme.text.secondary, fontFamily: theme.typography.mono.fontFamily }}>
                              {m.namespace}
                            </td>
                            <td style={{ padding: '10px 16px' }}>
                              <span style={{
                                display: 'inline-block',
                                padding: '2px 10px',
                                fontSize: 11,
                                fontWeight: 600,
                                borderRadius: 99,
                                ...getPhaseBadgeStyle(m.phase),
                              }}>
                                {m.phase}
                              </span>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

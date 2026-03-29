import { useDiagnostics } from '@/hooks/useDiagnostics'
import { HealthBadge } from '@/components/vm/HealthBadge'
import { InfoRow } from '@/components/ui/InfoRow'
import { CardSkeleton } from '@/components/ui/Skeleton'
import { theme } from '@/lib/theme'
import { formatDate } from '@/lib/format'

interface DiagnosticsTabProps {
  namespace: string
  vmName: string
}

function formatBytes(bytes: number): string {
  if (!bytes) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`
}

const importantConditions = new Set(['Ready', 'AgentConnected', 'LiveMigratable'])

export function DiagnosticsTab({ namespace, vmName }: DiagnosticsTabProps) {
  const { data, isLoading, error } = useDiagnostics(namespace, vmName)

  if (isLoading) {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {Array.from({ length: 4 }).map((_, i) => (
          <CardSkeleton key={i} height={120} />
        ))}
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="card-padded" style={{ color: theme.text.secondary, textAlign: 'center', padding: 32 }}>
        Failed to load diagnostics.
      </div>
    )
  }

  const usageColor = (pct: number) => {
    if (pct >= 90) return '#dc2626'
    if (pct >= 80) return '#d97706'
    return '#16a34a'
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }} className="animate-fade-in-up">
      {/* Top 2-column grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {/* Health Summary */}
        <div className="card-padded stagger-1">
          <div className="section-title" style={{ marginBottom: 12 }}>Health Summary</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <HealthBadge health={data.health_status} />
          </div>
          {data.health_reasons && data.health_reasons.length > 0 ? (
            <ul style={{ margin: 0, padding: '0 0 0 16px' }}>
              {data.health_reasons.map((reason: string, i: number) => (
                <li key={i} style={{ color: '#dc2626', fontSize: 13, marginBottom: 4 }}>
                  {reason}
                </li>
              ))}
            </ul>
          ) : (
            <div style={{ color: '#16a34a', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#16a34a', display: 'inline-block' }} />
              All checks passing
            </div>
          )}
        </div>

        {/* Guest Agent */}
        <div className="card-padded stagger-2">
          <div className="section-title" style={{ marginBottom: 12 }}>Guest Agent</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <span
              style={{
                width: 10,
                height: 10,
                borderRadius: '50%',
                background: data.guest_agent_connected ? '#16a34a' : '#dc2626',
                display: 'inline-block',
                flexShrink: 0,
              }}
            />
            <span style={{ fontSize: 14, fontWeight: 500, color: theme.text.primary }}>
              {data.guest_agent_connected ? 'Connected' : 'Disconnected'}
            </span>
          </div>
          {data.guest_agent_version && (
            <InfoRow label="Version" value={data.guest_agent_version} mono />
          )}
          {!data.guest_agent_connected && (
            <div style={{ fontSize: 12, color: theme.text.secondary, marginTop: 4 }}>
              Guest agent not available. Some diagnostics may be incomplete.
            </div>
          )}
        </div>
      </div>

      {/* VMI Conditions — full width */}
      {data.conditions && data.conditions.length > 0 && (
        <div className="card stagger-3">
          <div style={{ padding: '12px 16px', borderBottom: `1px solid ${theme.main.tableRowBorder}` }}>
            <span className="section-title">VMI Conditions</span>
          </div>
          <table className="table" style={{ width: '100%' }}>
            <thead>
              <tr className="table-header">
                <th className="table-header-cell">Condition</th>
                <th className="table-header-cell">Status</th>
                <th className="table-header-cell">Reason</th>
                <th className="table-header-cell">Last Transition</th>
              </tr>
            </thead>
            <tbody>
              {data.conditions.map((cond: { type: string; status: string; reason: string; message: string; last_transition_time: string }, i: number) => {
                const isImportant = importantConditions.has(cond.type)
                const statusColor =
                  !isImportant
                    ? theme.text.secondary
                    : cond.status === 'True'
                    ? '#16a34a'
                    : '#dc2626'
                return (
                  <tr key={i} className="table-row">
                    <td className="table-cell" style={{ fontWeight: 500 }}>{cond.type}</td>
                    <td className="table-cell">
                      <span style={{ color: statusColor, fontWeight: isImportant ? 600 : 400 }}>
                        {cond.status}
                      </span>
                    </td>
                    <td className="table-cell" style={{ color: theme.text.secondary }}>
                      {cond.reason || '—'}
                    </td>
                    <td className="table-cell" style={{ color: theme.text.dim, fontSize: 12 }}>
                      {cond.last_transition_time ? formatDate(cond.last_transition_time) : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {data.conditions.some((c: { message: string }) => c.message) && (
            <div style={{ padding: '8px 16px 12px' }}>
              {data.conditions
                .filter((c: { message: string }) => c.message)
                .map((c: { type: string; message: string }, i: number) => (
                  <div key={i} style={{ fontSize: 12, color: theme.text.secondary, marginBottom: 2 }}>
                    <strong>{c.type}:</strong> {c.message}
                  </div>
                ))}
            </div>
          )}
        </div>
      )}


      {/* Filesystem Usage — full width */}
      {data.filesystems && data.filesystems.length > 0 && (
        <div className="card stagger-5">
          <div style={{ padding: '12px 16px', borderBottom: `1px solid ${theme.main.tableRowBorder}` }}>
            <span className="section-title">Filesystem Usage</span>
          </div>
          <table className="table" style={{ width: '100%' }}>
            <thead>
              <tr className="table-header">
                <th className="table-header-cell">Disk</th>
                <th className="table-header-cell">Mount Point</th>
                <th className="table-header-cell">Type</th>
                <th className="table-header-cell">Used</th>
                <th className="table-header-cell">Total</th>
                <th className="table-header-cell" style={{ minWidth: 120 }}>Usage</th>
              </tr>
            </thead>
            <tbody>
              {data.filesystems.map((fs: { disk_name: string; mount_point: string; fs_type: string; used_bytes: number; total_bytes: number }, i: number) => {
                const pct = fs.total_bytes > 0 ? Math.round((fs.used_bytes / fs.total_bytes) * 100) : 0
                const color = usageColor(pct)
                return (
                  <tr key={i} className="table-row">
                    <td className="table-cell" style={{ fontFamily: theme.typography.mono.fontFamily, fontSize: 13 }}>
                      {fs.disk_name || '—'}
                    </td>
                    <td className="table-cell" style={{ fontFamily: theme.typography.mono.fontFamily, fontSize: 13 }}>
                      {fs.mount_point || '—'}
                    </td>
                    <td className="table-cell" style={{ color: theme.text.secondary }}>
                      {fs.fs_type || '—'}
                    </td>
                    <td className="table-cell">{formatBytes(fs.used_bytes)}</td>
                    <td className="table-cell">{formatBytes(fs.total_bytes)}</td>
                    <td className="table-cell">
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div
                          style={{
                            flex: 1,
                            height: theme.gauge.height,
                            borderRadius: theme.gauge.borderRadius,
                            background: theme.main.tableHeaderBg,
                            overflow: 'hidden',
                          }}
                        >
                          <div
                            style={{
                              width: `${pct}%`,
                              height: '100%',
                              background: color,
                              borderRadius: theme.gauge.borderRadius,
                              transition: 'width 0.3s ease',
                            }}
                          />
                        </div>
                        <span style={{ fontSize: 12, color, fontWeight: 600, minWidth: 32 }}>
                          {pct}%
                        </span>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Guest Network — full width */}
      {data.guest_networks && data.guest_networks.length > 0 && (
        <div className="card stagger-6">
          <div style={{ padding: '12px 16px', borderBottom: `1px solid ${theme.main.tableRowBorder}` }}>
            <span className="section-title">Guest Network Interfaces</span>
          </div>
          <table className="table" style={{ width: '100%' }}>
            <thead>
              <tr className="table-header">
                <th className="table-header-cell">Interface</th>
                <th className="table-header-cell">IP Addresses</th>
                <th className="table-header-cell">MAC</th>
              </tr>
            </thead>
            <tbody>
              {data.guest_networks.map((iface: { name: string; ip_addresses: string[]; mac: string }, i: number) => (
                <tr key={i} className="table-row">
                  <td className="table-cell" style={{ fontFamily: theme.typography.mono.fontFamily, fontSize: 13, fontWeight: 500 }}>
                    {iface.name || '—'}
                  </td>
                  <td className="table-cell">
                    {iface.ip_addresses && iface.ip_addresses.length > 0 ? (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {iface.ip_addresses.map((ip: string, j: number) => (
                          <span
                            key={j}
                            style={{
                              fontFamily: theme.typography.mono.fontFamily,
                              fontSize: 12,
                              background: theme.accentLight,
                              color: theme.accent,
                              padding: '2px 6px',
                              borderRadius: 4,
                            }}
                          >
                            {ip}
                          </span>
                        ))}
                      </div>
                    ) : '—'}
                  </td>
                  <td className="table-cell" style={{ fontFamily: theme.typography.mono.fontFamily, fontSize: 12, color: theme.text.secondary }}>
                    {iface.mac || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Empty state when agent is not connected */}
      {!data.guest_agent_connected && (!data.filesystems || data.filesystems.length === 0) && (!data.guest_networks || data.guest_networks.length === 0) && (
        <div className="card-padded" style={{ textAlign: 'center', padding: 24 }}>
          <div className="empty-text">
            Guest agent not connected — filesystem and network details unavailable.
          </div>
        </div>
      )}
    </div>
  )
}

import { TopBar } from '@/components/layout/TopBar'
import { useDashboard } from '@/hooks/useVMs'
import { useNavigate } from 'react-router-dom'

const statusColor: Record<string, string> = {
  Running: '#22c55e',
  Stopped: '#71717a',
  Error: '#ef4444',
  Migrating: '#f59e0b',
  Provisioning: '#3b82f6',
}

function StatCard({ label, value, accent }: { label: string; value: number | string; accent?: string }) {
  return (
    <div
      style={{
        background: '#ffffff',
        border: '1px solid #e0e0e5',
        borderRadius: 8,
        padding: 16,
        flex: 1,
        minWidth: 0,
      }}
    >
      <div
        style={{
          fontSize: 11,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          color: '#6b6b73',
          fontWeight: 600,
          marginBottom: 8,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 28,
          fontWeight: 700,
          color: accent ?? '#111113',
          lineHeight: 1,
        }}
      >
        {value ?? 0}
      </div>
    </div>
  )
}

export function DashboardPage() {
  const { data, isLoading } = useDashboard()
  const navigate = useNavigate()

  const stats = {
    total: data?.total_vms ?? 0,
    running: data?.running_vms ?? 0,
    stopped: data?.stopped_vms ?? 0,
    nodes: data?.nodes ?? 0,
  }

  const recentVMs: Array<{ name: string; namespace: string; status: string; cpu: number; memory: string; node: string }> =
    data?.recent_vms ?? []

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <TopBar
        title="Dashboard"
        subtitle="Overview of your virtual infrastructure"
      />

      <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
        {isLoading ? (
          <div style={{ color: '#6b6b73', fontSize: 13 }}>Loading dashboard data...</div>
        ) : (
          <>
            {/* Stat cards */}
            <div style={{ display: 'flex', gap: 16, marginBottom: 28 }}>
              <StatCard label="Total VMs" value={stats.total} />
              <StatCard label="Running VMs" value={stats.running} accent="#22c55e" />
              <StatCard label="Stopped VMs" value={stats.stopped} accent="#6b6b73" />
              <StatCard label="Nodes" value={stats.nodes} accent="#6366f1" />
            </div>

            {/* Recent VMs */}
            <div
              style={{
                background: '#ffffff',
                border: '1px solid #e0e0e5',
                borderRadius: 8,
              }}
            >
              <div
                style={{
                  padding: '14px 16px',
                  borderBottom: '1px solid #e0e0e5',
                  fontSize: 13,
                  fontWeight: 600,
                  color: '#111113',
                }}
              >
                Recent Virtual Machines
              </div>

              {recentVMs.length === 0 ? (
                <div
                  style={{
                    padding: 40,
                    textAlign: 'center',
                    color: '#6b6b73',
                    fontSize: 13,
                  }}
                >
                  No VMs found
                </div>
              ) : (
                <table
                  style={{
                    width: '100%',
                    borderCollapse: 'collapse',
                    fontSize: 13,
                  }}
                >
                  <thead>
                    <tr style={{ background: '#f7f7f9', borderBottom: '1px solid #e8e8ec' }}>
                      {['Name', 'Namespace', 'Status', 'CPU', 'Memory', 'Node'].map((col) => (
                        <th
                          key={col}
                          style={{
                            padding: '10px 16px',
                            textAlign: 'left',
                            color: '#6b6b73',
                            fontWeight: 500,
                            fontSize: 11,
                            textTransform: 'uppercase',
                            letterSpacing: '0.06em',
                          }}
                        >
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {recentVMs.map((vm) => (
                      <tr
                        key={`${vm.namespace}/${vm.name}`}
                        onClick={() => navigate(`/vms/${vm.namespace}/${vm.name}`)}
                        style={{
                          borderBottom: '1px solid #e8e8ec',
                          cursor: 'pointer',
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = '#f7f7f9')}
                        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                      >
                        <td style={{ padding: '10px 16px', color: '#1c1c1e', fontWeight: 500 }}>{vm.name}</td>
                        <td style={{ padding: '10px 16px', color: '#6b6b73' }}>{vm.namespace}</td>
                        <td style={{ padding: '10px 16px' }}>
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 6,
                              fontSize: 12,
                              color: statusColor[vm.status] ?? '#6b6b73',
                            }}
                          >
                            <span
                              style={{
                                width: 8,
                                height: 8,
                                borderRadius: '50%',
                                background: statusColor[vm.status] ?? '#6b6b73',
                                flexShrink: 0,
                              }}
                            />
                            {vm.status}
                          </span>
                        </td>
                        <td style={{ padding: '10px 16px', color: '#6b6b73' }}>{vm.cpu}</td>
                        <td style={{ padding: '10px 16px', color: '#6b6b73' }}>{vm.memory}</td>
                        <td style={{ padding: '10px 16px', color: '#6b6b73' }}>{vm.node ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

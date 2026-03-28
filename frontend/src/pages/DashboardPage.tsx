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
        background: '#2a2a2e',
        border: '1px solid #3a3a3f',
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
          color: '#71717a',
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
          color: accent ?? '#f0f0f0',
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
          <div style={{ color: '#71717a', fontSize: 13 }}>Loading dashboard data...</div>
        ) : (
          <>
            {/* Stat cards */}
            <div style={{ display: 'flex', gap: 16, marginBottom: 28 }}>
              <StatCard label="Total VMs" value={stats.total} />
              <StatCard label="Running VMs" value={stats.running} accent="#22c55e" />
              <StatCard label="Stopped VMs" value={stats.stopped} accent="#71717a" />
              <StatCard label="Nodes" value={stats.nodes} accent="#6366f1" />
            </div>

            {/* Recent VMs */}
            <div
              style={{
                background: '#2a2a2e',
                border: '1px solid #3a3a3f',
                borderRadius: 8,
              }}
            >
              <div
                style={{
                  padding: '14px 16px',
                  borderBottom: '1px solid #3a3a3f',
                  fontSize: 13,
                  fontWeight: 600,
                  color: '#f0f0f0',
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
                    <tr style={{ borderBottom: '1px solid #3a3a3f' }}>
                      {['Name', 'Namespace', 'Status', 'CPU', 'Memory', 'Node'].map((col) => (
                        <th
                          key={col}
                          style={{
                            padding: '10px 16px',
                            textAlign: 'left',
                            color: '#71717a',
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
                          borderBottom: '1px solid #353539',
                          cursor: 'pointer',
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = '#2e2e33')}
                        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                      >
                        <td style={{ padding: '10px 16px', color: '#e4e4e7', fontWeight: 500 }}>{vm.name}</td>
                        <td style={{ padding: '10px 16px', color: '#a1a1aa' }}>{vm.namespace}</td>
                        <td style={{ padding: '10px 16px' }}>
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 6,
                              fontSize: 12,
                              color: statusColor[vm.status] ?? '#a1a1aa',
                            }}
                          >
                            <span
                              style={{
                                width: 8,
                                height: 8,
                                borderRadius: '50%',
                                background: statusColor[vm.status] ?? '#a1a1aa',
                                flexShrink: 0,
                              }}
                            />
                            {vm.status}
                          </span>
                        </td>
                        <td style={{ padding: '10px 16px', color: '#a1a1aa' }}>{vm.cpu}</td>
                        <td style={{ padding: '10px 16px', color: '#a1a1aa' }}>{vm.memory}</td>
                        <td style={{ padding: '10px 16px', color: '#a1a1aa' }}>{vm.node ?? '—'}</td>
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

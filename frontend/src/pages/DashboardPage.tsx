import { TopBar } from '@/components/layout/TopBar'
import { useDashboard } from '@/hooks/useVMs'
import { useNavigate } from 'react-router-dom'
import { theme } from '@/lib/theme'
import { EmptyState } from '@/components/ui/EmptyState'
import { Monitor } from 'lucide-react'

const statusBadge: Record<string, { bg: string; color: string; border: string }> = {
  Running:      { bg: theme.status.runningBg, color: theme.status.running, border: `1px solid ${theme.status.running}40` },
  Stopped:      { bg: theme.status.stoppedBg, color: theme.status.stopped, border: `1px solid ${theme.status.stopped}40` },
  Error:        { bg: theme.status.errorBg, color: theme.status.error, border: `1px solid ${theme.status.error}40` },
  Migrating:    { bg: theme.status.migratingBg, color: theme.status.migrating, border: `1px solid ${theme.status.migrating}40` },
  Provisioning: { bg: theme.status.provisioningBg, color: theme.status.provisioning, border: `1px solid ${theme.status.provisioning}40` },
}

function StatusBadge({ status }: { status: string }) {
  const s = statusBadge[status]
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '3px 10px',
        borderRadius: 12,
        fontSize: 12,
        fontWeight: 500,
        background: s?.bg ?? theme.main.bg,
        color: s?.color ?? theme.text.secondary,
        border: s?.border ?? `1px solid ${theme.main.cardBorder}`,
        whiteSpace: 'nowrap',
      }}
    >
      {status}
    </span>
  )
}

function StatCard({ label, value, accent, borderColor }: { label: string; value: number | string; accent?: string; borderColor?: string }) {
  return (
    <div
      style={{
        background: theme.main.card,
        border: `1px solid ${theme.main.cardBorder}`,
        borderRadius: theme.radius.lg,
        borderLeft: `3px solid ${borderColor ?? theme.main.cardBorder}`,
        padding: 16,
        flex: 1,
        minWidth: 0,
      }}
    >
      <div
        style={{
          fontSize: 11,
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          color: theme.text.secondary,
          fontWeight: 500,
          marginBottom: 8,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 32,
          fontWeight: 700,
          color: accent ?? theme.text.heading,
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
    nodes: data?.node_count ?? 0,
  }

  const recentVMs: Array<{ name: string; namespace: string; status: string; cpu: number; memory: string; node: string }> =
    data?.recent_vms ?? []

  const nodes: Array<{ name: string; status: string; roles: string[]; cpu_capacity: string; memory_capacity: string; vm_count: number }> =
    data?.nodes ?? []

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <TopBar
        title="Dashboard"
        subtitle="Overview of your virtual infrastructure"
      />

      <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
        {isLoading ? (
          <div style={{ color: theme.text.secondary, fontSize: 13 }}>Loading dashboard data...</div>
        ) : (
          <>
            {/* Stat cards */}
            <div style={{ display: 'flex', gap: 16, marginBottom: 28 }}>
              <StatCard label="Total VMs" value={stats.total} borderColor={theme.accent} />
              <StatCard label="Running VMs" value={stats.running} accent={theme.status.running} borderColor={theme.status.running} />
              <StatCard label="Stopped VMs" value={stats.stopped} accent={theme.text.secondary} borderColor={theme.status.stopped} />
              <StatCard label="Nodes" value={stats.nodes} accent={theme.accent} borderColor={theme.status.provisioning} />
            </div>

            {/* Recent VMs */}
            <div
              style={{
                background: theme.main.card,
                border: `1px solid ${theme.main.cardBorder}`,
                borderRadius: theme.radius.lg,
              }}
            >
              <div
                style={{
                  padding: '14px 16px',
                  borderBottom: `1px solid ${theme.main.cardBorder}`,
                  fontSize: 16,
                  fontWeight: 600,
                  color: theme.text.heading,
                }}
              >
                Recent Virtual Machines
              </div>

              {recentVMs.length === 0 ? (
                <EmptyState
                  icon={<Monitor size={24} />}
                  title="No Recent VMs"
                  description="Create a VM to see it here."
                  action={{ label: 'Create VM', onClick: () => navigate('/vms/create') }}
                />
              ) : (
                <table
                  style={{
                    width: '100%',
                    borderCollapse: 'collapse',
                    fontSize: 13,
                  }}
                >
                  <thead>
                    <tr style={{ background: theme.main.tableHeaderBg, borderBottom: `1px solid ${theme.main.tableRowBorder}` }}>
                      {['Name', 'Namespace', 'Status', 'CPU', 'Memory', 'Node'].map((col) => (
                        <th
                          key={col}
                          style={{
                            padding: '10px 16px',
                            textAlign: 'left',
                            color: theme.text.secondary,
                            fontWeight: 600,
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
                          borderBottom: `1px solid ${theme.main.tableRowBorder}`,
                          cursor: 'pointer',
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = theme.main.hoverBg)}
                        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                      >
                        <td style={{ padding: '10px 16px', color: theme.text.primary, fontWeight: 500, fontSize: 14 }}>{vm.name}</td>
                        <td style={{ padding: '10px 16px', color: theme.text.secondary }}>{vm.namespace}</td>
                        <td style={{ padding: '10px 16px' }}>
                          <StatusBadge status={vm.status} />
                        </td>
                        <td style={{ padding: '10px 16px', color: theme.text.secondary }}>{vm.cpu}</td>
                        <td style={{ padding: '10px 16px', color: theme.text.secondary }}>{vm.memory}</td>
                        <td style={{ padding: '10px 16px', color: theme.text.secondary }}>{vm.node ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Nodes */}
            <div
              style={{
                background: theme.main.card,
                border: `1px solid ${theme.main.cardBorder}`,
                borderRadius: theme.radius.lg,
                marginTop: 20,
              }}
            >
              <div
                style={{
                  padding: '14px 16px',
                  borderBottom: `1px solid ${theme.main.cardBorder}`,
                  fontSize: 16,
                  fontWeight: 600,
                  color: theme.text.heading,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                Nodes
                <span
                  onClick={() => navigate('/nodes')}
                  style={{
                    fontSize: 12,
                    color: theme.accent,
                    cursor: 'pointer',
                    fontWeight: 500,
                  }}
                >
                  View all
                </span>
              </div>

              {nodes.length === 0 ? (
                <div
                  style={{
                    padding: 40,
                    textAlign: 'center',
                    color: theme.text.secondary,
                    fontSize: 13,
                  }}
                >
                  No nodes found
                </div>
              ) : (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, padding: 16 }}>
                  {nodes.map((node) => (
                    <div
                      key={node.name}
                      onClick={() => navigate('/nodes')}
                      style={{
                        flex: '1 1 220px',
                        maxWidth: 320,
                        background: theme.main.bg,
                        border: `1px solid ${theme.main.cardBorder}`,
                        borderRadius: theme.radius.md,
                        padding: 14,
                        cursor: 'pointer',
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.borderColor = theme.accent)}
                      onMouseLeave={(e) => (e.currentTarget.style.borderColor = theme.main.cardBorder)}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                        <span style={{ fontSize: 14, fontWeight: 600, color: theme.text.primary }}>{node.name}</span>
                        <span
                          style={{
                            fontSize: 11,
                            fontWeight: 600,
                            padding: '2px 7px',
                            borderRadius: 9999,
                            background: node.status === 'Ready' ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)',
                            color: node.status === 'Ready' ? theme.status.running : theme.status.error,
                          }}
                        >
                          {node.status}
                        </span>
                      </div>
                      <div style={{ display: 'flex', gap: 16, fontSize: 12, color: theme.text.secondary }}>
                        {node.roles.length > 0 && (
                          <span>{node.roles.join(', ')}</span>
                        )}
                        <span>CPU: {node.cpu_capacity}</span>
                        <span>VMs: {node.vm_count}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

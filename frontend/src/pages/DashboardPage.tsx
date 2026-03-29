import { TopBar } from '@/components/layout/TopBar'
import { useDashboard } from '@/hooks/useVMs'
import { useImages } from '@/hooks/useImages'
import { useClusterEvents } from '@/hooks/useEvents'
import { useNavigate } from 'react-router-dom'
import { theme } from '@/lib/theme'
import { formatTimeAgo } from '@/lib/format'
import { EmptyState } from '@/components/ui/EmptyState'
import { CardSkeleton, TableSkeleton } from '@/components/ui/Skeleton'
import { Monitor, AlertTriangle, Loader2, Play, Square, Server, HardDrive, Activity } from 'lucide-react'

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

function StatCard({ label, value, accent, borderColor, icon, animationDelay }: { label: string; value: number | string; accent?: string; borderColor?: string; icon?: React.ReactNode; animationDelay?: string }) {
  return (
    <div
      style={{
        background: theme.main.card,
        border: `1px solid ${theme.main.cardBorder}`, boxShadow: theme.shadow.card,
        borderRadius: theme.radius.lg,
        borderBottom: `3px solid ${borderColor ?? theme.main.cardBorder}`,
        padding: 20,
        flex: 1,
        minWidth: 0,
        transition: 'box-shadow 0.2s ease, border-color 0.2s ease',
        animation: 'fadeInUp 0.35s ease-out both',
        animationDelay: animationDelay ?? '0s',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.06)' }}
      onMouseLeave={(e) => { e.currentTarget.style.boxShadow = 'none' }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8 }}>
        <div
          style={{
            fontSize: 11,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            color: theme.text.secondary,
            fontWeight: 500,
          }}
        >
          {label}
        </div>
        {icon && (
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              background: `${borderColor ?? theme.main.cardBorder}1F`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: borderColor ?? theme.text.secondary,
              flexShrink: 0,
            }}
          >
            {icon}
          </div>
        )}
      </div>
      <div
        style={{
          fontSize: 32,
          fontWeight: 700,
          color: accent ?? theme.text.heading,
          lineHeight: 1,
          fontFamily: theme.typography.heading.fontFamily,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {value ?? 0}
      </div>
    </div>
  )
}

function ResourceGauge({ label, used, total, unit, color, animationDelay }: { label: string; used: number; total: number; unit: string; color: string; animationDelay?: string }) {
  const pct = total > 0 ? (used / total) * 100 : 0
  return (
    <div style={{
      background: theme.main.card,
      border: `1px solid ${theme.main.cardBorder}`, boxShadow: theme.shadow.card,
      borderRadius: theme.radius.lg,
      padding: 16,
      animation: 'fadeInUp 0.35s ease-out both',
      animationDelay: animationDelay ?? '0s',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 500, color: theme.text.secondary, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</span>
        <span style={{ fontSize: 12, color: theme.text.primary, fontWeight: 500, fontFamily: theme.typography.mono.fontFamily }}>
          {used.toFixed(1)} / {total.toFixed(1)} {unit}
        </span>
      </div>
      <div style={{
        height: theme.gauge.height,
        background: theme.main.inputBg,
        borderRadius: theme.gauge.borderRadius,
        overflow: 'hidden',
      }}>
        <div style={{
          height: '100%',
          width: `${Math.min(pct, 100)}%`,
          background: pct > 80 ? theme.status.error : pct > 60 ? theme.status.migrating : color,
          borderRadius: theme.gauge.borderRadius,
          transition: 'width 0.5s ease',
        }} />
      </div>
      <div style={{ fontSize: 12, fontWeight: 600, color: theme.text.dim, marginTop: 4, textAlign: 'right' }}>
        {pct.toFixed(0)}% used
      </div>
    </div>
  )
}

export function DashboardPage() {
  const { data, isLoading } = useDashboard()
  const { data: imagesData } = useImages()
  const { data: eventsData } = useClusterEvents(10)
  const navigate = useNavigate()
  const recentEvents: Array<{ timestamp: string; type: string; reason: string; message: string; namespace: string; involved_object_name: string; involved_object_kind: string }> =
    Array.isArray(eventsData) ? eventsData : []
  const storageTotalGb: number = data?.storage_total_gb ?? 0
  const storageTotalDisks: number = data?.storage_total_disks ?? 0
  const storageAttachedDisks: number = data?.storage_attached_disks ?? 0
  const storageByTier: Array<{ tier: string; total_gb: number; count: number }> = data?.storage_by_tier ?? []

  const stats = {
    total: data?.total_vms ?? 0,
    running: data?.running_vms ?? 0,
    stopped: data?.stopped_vms ?? 0,
    error: data?.error_vms ?? 0,
    nodes: data?.node_count ?? 0,
  }

  const recentVMs: Array<{ name: string; namespace: string; status: string; cpu: number; memory: string; node: string }> =
    data?.recent_vms ?? []

  const nodes: Array<{ name: string; status: string; roles: string[]; cpu_capacity: string; memory_capacity: string; vm_count: number }> =
    data?.nodes ?? []

  // Image health data
  const images: Array<{ name: string; dv_phase?: string }> = Array.isArray(imagesData) ? imagesData : []
  const errorImages = images.filter((img) => img.dv_phase === 'Failed')
  const importingImages = images.filter((img) => img.dv_phase === 'ImportInProgress' || img.dv_phase === 'CloneInProgress')

  // Resource utilization from nodes and VMs
  const totalCpuCapacity = nodes.reduce((sum, n) => sum + parseInt(n.cpu_capacity || '0', 10), 0)
  const totalMemCapacity = nodes.reduce((sum, n) => {
    const raw = n.memory_capacity || '0'
    const ki = parseInt(raw.replace(/Ki$/i, ''), 10)
    return sum + (isNaN(ki) ? 0 : ki / (1024 * 1024))
  }, 0)
  const runningVMs = recentVMs.filter((vm) => vm.status?.toLowerCase() === 'running')
  const totalCpuAllocated = runningVMs.reduce((sum, vm) => sum + (vm.cpu || 0), 0)
  const totalMemAllocated = runningVMs.reduce((sum, vm) => {
    const raw = vm.memory || '0'
    const match = raw.match(/^(\d+(?:\.\d+)?)\s*(Gi|Mi|G|M)?$/i)
    if (!match) return sum
    const val = parseFloat(match[1])
    const unit = (match[2] || 'Gi').toLowerCase()
    if (unit === 'mi' || unit === 'm') return sum + val / 1024
    return sum + val
  }, 0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <TopBar
        title="Dashboard"
        subtitle="Overview of your virtual infrastructure"
        hideNamespace
      />

      <div className="page-content">
        <div style={{ maxWidth: theme.layout.contentMaxWidth, margin: '0 auto', width: '100%' }}>
        {isLoading ? (
          <>
            <div style={{ display: 'flex', gap: 16, marginBottom: 20 }}>
              <CardSkeleton />
              <CardSkeleton />
              <CardSkeleton />
              <CardSkeleton />
            </div>
            <TableSkeleton rows={5} cols={6} />
          </>
        ) : (
          <>
            {/* Stat cards */}
            <div style={{ display: 'flex', gap: 16, marginBottom: 20 }}>
              <StatCard label="Total VMs" value={stats.total} borderColor={theme.accent} icon={<Monitor size={16} />} animationDelay="0s" />
              <StatCard label="Running VMs" value={stats.running} accent={theme.status.running} borderColor={theme.status.running} icon={<Play size={16} />} animationDelay="0.06s" />
              <StatCard label="Stopped VMs" value={stats.stopped} accent={theme.text.secondary} borderColor={theme.status.stopped} icon={<Square size={16} />} animationDelay="0.12s" />
              {stats.error > 0 && (
                <StatCard label="Error VMs" value={stats.error} accent={theme.status.error} borderColor={theme.status.error} icon={<AlertTriangle size={16} />} animationDelay="0.18s" />
              )}
              <StatCard label="Nodes" value={stats.nodes} accent={theme.accent} borderColor={theme.status.provisioning} icon={<Server size={16} />} animationDelay={stats.error > 0 ? '0.24s' : '0.18s'} />
            </div>

            {/* Resource Utilization */}
            {nodes.length > 0 && (
              <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 16,
                marginBottom: 20,
              }}>
                <ResourceGauge
                  label="Cluster CPU"
                  used={totalCpuAllocated}
                  total={totalCpuCapacity}
                  unit="cores"
                  color={theme.accent}
                  animationDelay="0.24s"
                />
                <ResourceGauge
                  label="Cluster Memory"
                  used={totalMemAllocated}
                  total={totalMemCapacity}
                  unit="Gi"
                  color={theme.status.running}
                  animationDelay="0.30s"
                />
              </div>
            )}

            {/* Storage Overview */}
            {storageTotalDisks > 0 && (
              <div style={{
                background: theme.main.card,
                border: `1px solid ${theme.main.cardBorder}`,
                boxShadow: theme.shadow.card,
                borderRadius: theme.radius.lg,
                padding: 16,
                marginBottom: 20,
                animation: 'fadeInUp 0.35s ease-out both',
                animationDelay: '0.36s',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <HardDrive size={14} style={{ color: theme.text.secondary }} />
                    <span style={{ fontSize: 12, fontWeight: 500, color: theme.text.secondary, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Storage</span>
                  </div>
                  <span
                    onClick={() => navigate('/storage')}
                    style={{ fontSize: 12, color: theme.accent, cursor: 'pointer', fontWeight: 500 }}
                  >
                    View all
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 24, marginBottom: storageByTier.length > 0 ? 12 : 0 }}>
                  <div>
                    <div style={{ fontSize: 24, fontWeight: 700, color: theme.text.heading, fontFamily: theme.typography.heading.fontFamily }}>{storageTotalGb}</div>
                    <div style={{ fontSize: 11, color: theme.text.dim }}>Total GB</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 24, fontWeight: 700, color: theme.text.heading, fontFamily: theme.typography.heading.fontFamily }}>{storageTotalDisks}</div>
                    <div style={{ fontSize: 11, color: theme.text.dim }}>Disks</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 24, fontWeight: 700, color: theme.status.running, fontFamily: theme.typography.heading.fontFamily }}>{storageAttachedDisks}</div>
                    <div style={{ fontSize: 11, color: theme.text.dim }}>Attached</div>
                  </div>
                </div>
                {storageByTier.length > 0 && (
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {storageByTier.map((tier) => (
                      <span
                        key={tier.tier}
                        style={{
                          fontSize: 11,
                          padding: '3px 8px',
                          borderRadius: theme.radius.sm,
                          background: `${theme.accent}12`,
                          color: theme.text.secondary,
                          border: `1px solid ${theme.main.cardBorder}`,
                        }}
                      >
                        {tier.tier}: {tier.total_gb} GB ({tier.count})
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Health Alerts */}
            {(stats.error > 0 || errorImages.length > 0) && (
              <div style={{
                background: theme.status.errorBg,
                border: `1px solid ${theme.status.error}30`,
                borderRadius: theme.radius.lg,
                padding: '14px 20px',
                marginBottom: 20,
                display: 'flex',
                alignItems: 'center',
                gap: 12,
              }}>
                <AlertTriangle size={18} style={{ color: theme.status.error, flexShrink: 0 }} />
                <div style={{ fontSize: 13, color: theme.status.error }}>
                  {stats.error > 0 && <span style={{ fontWeight: 500 }}>{stats.error} VM{stats.error > 1 ? 's' : ''} in error state. </span>}
                  {errorImages.length > 0 && <span style={{ fontWeight: 500 }}>{errorImages.length} image import{errorImages.length > 1 ? 's' : ''} failed.</span>}
                </div>
              </div>
            )}

            {importingImages.length > 0 && (
              <div style={{
                background: theme.status.provisioningBg,
                border: `1px solid ${theme.status.provisioning}30`,
                borderRadius: theme.radius.lg,
                padding: '14px 20px',
                marginBottom: 20,
                display: 'flex',
                alignItems: 'center',
                gap: 12,
              }}>
                <Loader2 size={18} style={{ color: theme.status.provisioning, flexShrink: 0 }} />
                <div style={{ fontSize: 13, color: theme.status.provisioning }}>
                  <span style={{ fontWeight: 500 }}>{importingImages.length} image import{importingImages.length > 1 ? 's' : ''} in progress</span>
                </div>
              </div>
            )}

            {/* Recent VMs */}
            <div className="card">
              <div
                style={{
                  padding: '14px 16px',
                  borderBottom: `1px solid ${theme.main.cardBorder}`,
                  fontSize: 16,
                  fontWeight: 600,
                  color: theme.text.heading,
                  fontFamily: theme.typography.heading.fontFamily,
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
                <table className="table">
                  <thead>
                    <tr className="table-header">
                      {['Name', 'Namespace', 'Status', 'CPU', 'Memory', 'Node'].map((col) => (
                        <th key={col} className="table-header-cell">{col}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {recentVMs.map((vm, i) => (
                      <tr
                        key={`${vm.namespace}/${vm.name}`}
                        className="table-row-clickable"
                        onClick={() => navigate(`/vms/${vm.namespace}/${vm.name}`)}
                        style={{
                          animation: i < 8 ? 'fadeInRow 0.3s ease-out both' : undefined,
                          animationDelay: i < 8 ? `${0.1 + i * 0.04}s` : undefined,
                        }}
                      >
                        <td className="table-cell" style={{ color: theme.text.primary, fontWeight: 500, fontSize: 14 }}>{vm.name}</td>
                        <td className="table-cell" style={{ color: theme.text.secondary }}>{vm.namespace}</td>
                        <td className="table-cell">
                          <StatusBadge status={vm.status} />
                        </td>
                        <td className="table-cell" style={{ color: theme.text.secondary, fontFamily: theme.typography.mono.fontFamily }}>{vm.cpu}</td>
                        <td className="table-cell" style={{ color: theme.text.secondary, fontFamily: theme.typography.mono.fontFamily }}>{vm.memory}</td>
                        <td className="table-cell" style={{ color: theme.text.secondary, fontFamily: theme.typography.mono.fontFamily }}>{vm.node ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Activity Feed */}
            {recentEvents.length > 0 && (
              <div className="card" style={{ marginTop: 20 }}>
                <div
                  style={{
                    padding: '14px 16px',
                    borderBottom: `1px solid ${theme.main.cardBorder}`,
                    fontSize: 16,
                    fontWeight: 600,
                    color: theme.text.heading,
                    fontFamily: theme.typography.heading.fontFamily,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Activity size={16} style={{ color: theme.text.secondary }} />
                    Recent Activity
                  </div>
                  <span
                    onClick={() => navigate('/events')}
                    style={{ fontSize: 12, color: theme.accent, cursor: 'pointer', fontWeight: 500 }}
                  >
                    View all
                  </span>
                </div>
                <div style={{ maxHeight: 320, overflowY: 'auto' }}>
                  {recentEvents.map((event, i) => (
                    <div
                      key={`${event.timestamp}-${event.involved_object_name}-${i}`}
                      style={{
                        padding: '10px 16px',
                        borderBottom: `1px solid ${theme.main.tableRowBorder}`,
                        display: 'flex',
                        gap: 12,
                        alignItems: 'flex-start',
                        animation: i < 8 ? 'fadeInRow 0.3s ease-out both' : undefined,
                        animationDelay: i < 8 ? `${0.1 + i * 0.04}s` : undefined,
                      }}
                    >
                      <span
                        style={{
                          width: 6,
                          height: 6,
                          borderRadius: '50%',
                          marginTop: 6,
                          flexShrink: 0,
                          background: event.type === 'Warning' ? theme.status.migrating : theme.status.running,
                        }}
                      />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontSize: 12, fontWeight: 600, color: theme.text.primary }}>{event.reason}</span>
                            <span style={{
                              fontSize: 10,
                              padding: '1px 6px',
                              borderRadius: 3,
                              background: `${theme.accent}12`,
                              color: theme.accent,
                              fontWeight: 500,
                              border: `1px solid ${theme.accent}30`,
                            }}>
                              {event.involved_object_kind}
                            </span>
                          </div>
                          <span style={{ fontSize: 11, color: theme.text.dim, whiteSpace: 'nowrap' }}>
                            {formatTimeAgo(event.timestamp)}
                          </span>
                        </div>
                        <div style={{ fontSize: 12, color: theme.text.secondary, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          <span style={{ fontWeight: 500 }}>{event.involved_object_name}</span>
                          {event.message && <span> — {event.message}</span>}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Nodes */}
            <div className="card" style={{ marginTop: 20 }}>
              <div
                style={{
                  padding: '14px 16px',
                  borderBottom: `1px solid ${theme.main.cardBorder}`,
                  fontSize: 16,
                  fontWeight: 600,
                  color: theme.text.heading,
                  fontFamily: theme.typography.heading.fontFamily,
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
                  {nodes.map((node, i) => (
                    <div
                      key={node.name}
                      onClick={() => navigate('/nodes')}
                      style={{
                        flex: '1 1 220px',
                        maxWidth: 320,
                        background: theme.main.bg,
                        border: `1px solid ${theme.main.cardBorder}`, boxShadow: theme.shadow.card,
                        borderRadius: theme.radius.md,
                        padding: 14,
                        cursor: 'pointer',
                        animation: 'fadeInUp 0.35s ease-out both',
                        animationDelay: `${0.1 + i * 0.06}s`,
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
    </div>
  )
}

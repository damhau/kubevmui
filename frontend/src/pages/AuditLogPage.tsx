import { useState } from 'react'
import { TopBar } from '@/components/layout/TopBar'
import { useAuditLog } from '@/hooks/useAudit'
import { useClusterEvents } from '@/hooks/useEvents'
import { theme } from '@/lib/theme'
import { formatTimeAgo } from '@/lib/format'
import { TableSkeleton } from '@/components/ui/Skeleton'
import { EmptyState } from '@/components/ui/EmptyState'
import { FileText } from 'lucide-react'
import { useSortable } from '@/hooks/useSortable'

const actionColor: Record<string, string> = {
  create_vm: theme.status.running,
  delete_vm: theme.status.error,
  start_vm: theme.status.running,
  stop_vm: theme.status.stopped,
  restart_vm: theme.status.migrating,
  force_stop_vm: theme.status.error,
  clone_vm: theme.status.provisioning,
  create_snapshot: theme.accent,
  delete_snapshot: theme.status.error,
  restore_snapshot: theme.status.migrating,
}

type Tab = 'ui-actions' | 'cluster-events'

export function AuditLogPage() {
  const [activeTab, setActiveTab] = useState<Tab>('ui-actions')
  const [resourceFilter, setResourceFilter] = useState('')
  const { data: auditData, isLoading: auditLoading } = useAuditLog(100)
  const { data: eventsData, isLoading: eventsLoading } = useClusterEvents(50)

  const auditEntries = auditData?.items ?? []
  const filteredAudit = resourceFilter
    ? auditEntries.filter((e: any) => e.resource_type === resourceFilter)
    : auditEntries
  const { sorted: sortedAudit, sortConfig: auditSortConfig, requestSort: requestAuditSort } = useSortable(filteredAudit, { column: 'timestamp', direction: 'desc' })

  const clusterEvents = Array.isArray(eventsData) ? eventsData : []
  // Filter to KubeVirt-relevant events
  const kubevirtEvents = clusterEvents.filter((e: any) =>
    ['VirtualMachine', 'VirtualMachineInstance', 'VirtualMachineSnapshot', 'VirtualMachineInstanceMigration', 'DataVolume', 'VirtualMachineRestore'].includes(e.involved_object_kind)
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <TopBar title="Audit Log" hideNamespace />
      <div className="page-content" style={{ animation: 'fadeInUp 0.35s ease-out' }}>
        <div className="page-container">
          {/* Tabs */}
          <div className="tab-bar">
            {(['ui-actions', 'cluster-events'] as Tab[]).map((tab) => (
              <button
                key={tab}
                className={`tab-button${activeTab === tab ? ' active' : ''}`}
                onClick={() => setActiveTab(tab)}
              >
                {tab === 'ui-actions' ? 'UI Actions' : 'Cluster Events'}
              </button>
            ))}
          </div>

          {activeTab === 'ui-actions' && (
            <>
              {/* Filter */}
              <div style={{ marginBottom: 16, display: 'flex', gap: 8 }}>
                {['', 'VirtualMachine', 'Snapshot', 'Disk'].map((rt) => (
                  <button
                    key={rt}
                    onClick={() => setResourceFilter(rt)}
                    style={{
                      padding: '5px 12px',
                      fontSize: 12,
                      fontWeight: 500,
                      border: `1px solid ${resourceFilter === rt ? theme.accent : theme.main.inputBorder}`,
                      background: resourceFilter === rt ? theme.accentLight : theme.main.card,
                      color: resourceFilter === rt ? theme.accent : theme.text.secondary,
                      borderRadius: theme.radius.md,
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                    }}
                  >
                    {rt || 'All'}
                  </button>
                ))}
              </div>

              <div className="card">
                {auditLoading ? (
                  <TableSkeleton rows={5} cols={6} />
                ) : sortedAudit.length === 0 ? (
                  <EmptyState
                    icon={<FileText size={24} />}
                    title="No Audit Entries"
                    description="UI actions will appear here as you manage VMs, snapshots, and other resources. Data is cleared on server restart."
                  />
                ) : (
                  <table className="table">
                    <thead>
                      <tr className="table-header">
                        <th className={`table-header-cell-sortable${auditSortConfig.column === 'timestamp' ? ' active' : ''}`} onClick={() => requestAuditSort('timestamp')}>
                          Time {auditSortConfig.column === 'timestamp' ? (auditSortConfig.direction === 'asc' ? ' ↑' : ' ↓') : ''}
                        </th>
                        <th className={`table-header-cell-sortable${auditSortConfig.column === 'username' ? ' active' : ''}`} onClick={() => requestAuditSort('username')}>
                          User {auditSortConfig.column === 'username' ? (auditSortConfig.direction === 'asc' ? ' ↑' : ' ↓') : ''}
                        </th>
                        <th className={`table-header-cell-sortable${auditSortConfig.column === 'action' ? ' active' : ''}`} onClick={() => requestAuditSort('action')}>
                          Action {auditSortConfig.column === 'action' ? (auditSortConfig.direction === 'asc' ? ' ↑' : ' ↓') : ''}
                        </th>
                        <th className="table-header-cell">Resource</th>
                        <th className={`table-header-cell-sortable${auditSortConfig.column === 'namespace' ? ' active' : ''}`} onClick={() => requestAuditSort('namespace')}>
                          Namespace {auditSortConfig.column === 'namespace' ? (auditSortConfig.direction === 'asc' ? ' ↑' : ' ↓') : ''}
                        </th>
                        <th className="table-header-cell">Details</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedAudit.map((entry: any, i: number) => (
                        <tr key={i} className="table-row" style={i < 8 ? { animation: `fadeInRow 0.3s ease-out both`, animationDelay: `${0.05 + i * 0.04}s` } : undefined}>
                          <td className="table-cell" style={{ color: theme.text.secondary, fontSize: 12 }} title={entry.timestamp}>
                            {formatTimeAgo(entry.timestamp)}
                          </td>
                          <td className="table-cell" style={{ color: theme.text.primary, fontSize: 13, fontWeight: 500 }}>{entry.username}</td>
                          <td className="table-cell">
                            <span style={{
                              display: 'inline-block',
                              padding: '2px 8px',
                              borderRadius: theme.radius.sm,
                              fontSize: 11,
                              fontWeight: 600,
                              color: actionColor[entry.action] ?? theme.text.secondary,
                              background: `${actionColor[entry.action] ?? theme.text.secondary}1a`,
                              border: `1px solid ${actionColor[entry.action] ?? theme.text.secondary}40`,
                            }}>
                              {entry.action}
                            </span>
                          </td>
                          <td className="table-cell" style={{ color: theme.text.primary, fontSize: 13, fontFamily: theme.typography.mono.fontFamily }}>
                            {entry.resource_name}
                          </td>
                          <td className="table-cell" style={{ color: theme.text.secondary, fontSize: 12 }}>{entry.namespace}</td>
                          <td className="table-cell" style={{ color: theme.text.dim, fontSize: 12, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{entry.details || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </>
          )}

          {activeTab === 'cluster-events' && (
            <div className="card">
              {eventsLoading ? (
                <TableSkeleton rows={5} cols={5} />
              ) : kubevirtEvents.length === 0 ? (
                <EmptyState
                  icon={<FileText size={24} />}
                  title="No KubeVirt Events"
                  description="Recent KubeVirt cluster events will appear here."
                />
              ) : (
                <table className="table">
                  <thead>
                    <tr className="table-header">
                      <th className="table-header-cell">Time</th>
                      <th className="table-header-cell">Type</th>
                      <th className="table-header-cell">Kind</th>
                      <th className="table-header-cell">Object</th>
                      <th className="table-header-cell">Reason</th>
                      <th className="table-header-cell">Message</th>
                    </tr>
                  </thead>
                  <tbody>
                    {kubevirtEvents.map((event: any, i: number) => (
                      <tr key={i} className="table-row" style={i < 8 ? { animation: `fadeInRow 0.3s ease-out both`, animationDelay: `${0.05 + i * 0.04}s` } : undefined}>
                        <td className="table-cell" style={{ color: theme.text.secondary, fontSize: 12, whiteSpace: 'nowrap' }} title={event.timestamp}>{formatTimeAgo(event.timestamp)}</td>
                        <td className="table-cell">
                          <span style={{ fontSize: 11, fontWeight: 600, color: event.type === 'Warning' ? theme.status.migrating : theme.status.running }}>
                            {event.type}
                          </span>
                        </td>
                        <td className="table-cell">
                          <span style={{ fontSize: 11, padding: '1px 6px', borderRadius: 3, background: `${theme.accent}12`, color: theme.accent, fontWeight: 500 }}>{event.involved_object_kind}</span>
                        </td>
                        <td className="table-cell" style={{ color: theme.text.primary, fontSize: 13, fontFamily: theme.typography.mono.fontFamily }}>{event.involved_object_name}</td>
                        <td className="table-cell" style={{ color: theme.text.primary, fontSize: 13 }}>{event.reason}</td>
                        <td className="table-cell" style={{ color: theme.text.secondary, fontSize: 12, maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={event.message}>{event.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

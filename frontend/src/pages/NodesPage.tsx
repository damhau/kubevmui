import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { TopBar } from '@/components/layout/TopBar'
import { useNodes } from '@/hooks/useNodes'
import { theme } from '@/lib/theme'
import { Server, Monitor } from 'lucide-react'
import { EmptyState } from '@/components/ui/EmptyState'
import { TableSkeleton } from '@/components/ui/Skeleton'

interface NodeItem {
  name: string
  status: string
  roles: string[]
  cpu_capacity: string
  memory_capacity: string
  cpu_allocatable: string
  memory_allocatable: string
  vm_count: number
}


function formatMemory(mem: string): string {
  if (!mem) return '—'
  const match = mem.match(/^(\d+)(Ki|Mi|Gi|Ti)?$/)
  if (!match) return mem
  const value = parseInt(match[1], 10)
  const unit = match[2] || ''
  if (unit === 'Ki') {
    if (value >= 1048576) return `${(value / 1048576).toFixed(1)} Gi`
    if (value >= 1024) return `${(value / 1024).toFixed(0)} Mi`
    return `${value} Ki`
  }
  if (unit === 'Mi') {
    if (value >= 1024) return `${(value / 1024).toFixed(1)} Gi`
    return `${value} Mi`
  }
  if (unit === 'Gi') return `${value} Gi`
  if (unit === 'Ti') return `${value} Ti`
  // Plain bytes
  if (value >= 1073741824) return `${(value / 1073741824).toFixed(1)} Gi`
  if (value >= 1048576) return `${(value / 1048576).toFixed(0)} Mi`
  return mem
}

function StatusBadge({ status }: { status: string }) {
  const isReady = status === 'Ready'
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '3px 10px',
        borderRadius: 12,
        fontSize: 12,
        fontWeight: 500,
        background: isReady ? '#ecfdf5' : '#fef2f2',
        color: isReady ? '#16a34a' : '#dc2626',
        border: isReady ? '1px solid #bbf7d0' : '1px solid #fecaca',
        whiteSpace: 'nowrap',
      }}
    >
      {status}
    </span>
  )
}

export function NodesPage() {
  const [search, setSearch] = useState('')
  const navigate = useNavigate()
  const { data, isLoading } = useNodes()

  const nodes: NodeItem[] = Array.isArray(data?.items) ? data.items : []
  const filtered = nodes.filter(
    (n) =>
      n.name.toLowerCase().includes(search.toLowerCase()) ||
      n.roles?.some((r: string) => r.toLowerCase().includes(search.toLowerCase())),
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <TopBar
        title="Nodes"
        subtitle={nodes.length > 0 ? `${nodes.length} node${nodes.length !== 1 ? 's' : ''}` : undefined}
      />

      <div className="page-content" style={{ animation: 'fadeInUp 0.35s ease-out' }}>
        <div className="page-container">
        {/* Search */}
        <div style={{ marginBottom: 16 }}>
          <input
            type="text"
            placeholder="Search nodes..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input"
            style={{ width: 280 }}
          />
        </div>

        {/* Table */}
        <div className="card">
          {isLoading ? (
            <TableSkeleton rows={2} cols={7} />
          ) : filtered.length === 0 ? (
            search ? (
              <div style={{ padding: 40, textAlign: 'center', color: theme.text.secondary, fontSize: 13 }}>
                No nodes match your search.
              </div>
            ) : (
              <EmptyState
                icon={<Server size={24} />}
                title="No Nodes Found"
                description="Unable to retrieve cluster nodes."
              />
            )
          ) : (
            <table className="table">
              <thead>
                <tr className="table-header">
                  {['Name', 'Status', 'Roles', 'CPU', 'Memory', 'VMs'].map((col, i) => (
                    <th
                      key={i}
                      className="table-header-cell"
                    >
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((node, i) => (
                      <tr
                        key={node.name}
                        className="table-row-clickable"
                        onClick={() => navigate(`/nodes/${node.name}`)}
                        style={i < 8 ? {
                          animation: `fadeInRow 0.3s ease-out both`,
                          animationDelay: `${0.05 + i * 0.04}s`,
                        } : undefined}
                      >
                        <td className="table-cell">
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <Server size={14} style={{ color: theme.accent, flexShrink: 0 }} />
                            <span style={{ color: theme.text.primary, fontWeight: 500, fontSize: 14, fontFamily: theme.typography.mono.fontFamily }}>
                              {node.name}
                            </span>
                          </div>
                        </td>
                        <td className="table-cell">
                          <StatusBadge status={node.status} />
                        </td>
                        <td className="table-cell" style={{ color: theme.text.secondary, fontSize: 13 }}>
                          {node.roles?.join(', ') || '—'}
                        </td>
                        <td className="table-cell" style={{ color: theme.text.secondary, fontSize: 13, fontFamily: theme.typography.mono.fontFamily }}>
                          {node.cpu_capacity ?? '—'} vCPU
                        </td>
                        <td className="table-cell" style={{ color: theme.text.secondary, fontSize: 13, fontFamily: theme.typography.mono.fontFamily }}>
                          {formatMemory(node.memory_capacity ?? '')}
                        </td>
                        <td className="table-cell">
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                              fontSize: 13,
                              color: node.vm_count > 0 ? theme.accent : theme.text.dim,
                              fontWeight: node.vm_count > 0 ? 500 : 400,
                            }}
                          >
                            <Monitor size={13} />
                            {node.vm_count}
                          </span>
                        </td>
                      </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        </div>
      </div>
    </div>
  )
}

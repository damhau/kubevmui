import React, { useState } from 'react'
import { TopBar } from '@/components/layout/TopBar'
import { useNodes, useNode } from '@/hooks/useNodes'
import { useNodeMetrics } from '@/hooks/useMetrics'
import { theme } from '@/lib/theme'
import { ChevronDown, ChevronRight, Server, Cpu, MemoryStick, Monitor } from 'lucide-react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

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

interface NodeVM {
  name: string
  namespace: string
  status: string
  cpu_cores: number
  memory_mb: number
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

function VMStatusBadge({ status }: { status: string }) {
  const styles: Record<string, { bg: string; color: string; border: string }> = {
    Running:      { bg: '#ecfdf5', color: '#16a34a', border: '1px solid #bbf7d0' },
    Stopped:      { bg: '#f4f4f5', color: '#52525b', border: '1px solid #d4d4d8' },
    Error:        { bg: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca' },
    Migrating:    { bg: '#fffbeb', color: '#d97706', border: '1px solid #fde68a' },
    Provisioning: { bg: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe' },
  }
  const s = styles[status]
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '2px 8px',
        borderRadius: 10,
        fontSize: 11,
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

function NodeMetricChart({ title, data: chartData, color }: { title: string; data: Array<{ timestamp: number; value: number }>; color: string }) {
  if (chartData.length === 0) {
    return (
      <div style={{ background: theme.main.card, border: `1px solid ${theme.main.cardBorder}`, borderRadius: theme.radius.md, padding: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: theme.text.heading, marginBottom: 8 }}>{title}</div>
        <div style={{ height: 140, display: 'flex', alignItems: 'center', justifyContent: 'center', color: theme.text.dim, fontSize: 12 }}>No data</div>
      </div>
    )
  }
  return (
    <div style={{ background: theme.main.card, border: `1px solid ${theme.main.cardBorder}`, borderRadius: theme.radius.md, padding: 16 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: theme.text.heading, marginBottom: 8 }}>{title}</div>
      <ResponsiveContainer width="100%" height={140}>
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke={theme.main.cardBorder} />
          <XAxis
            dataKey="timestamp"
            tickFormatter={(ts: number) => new Date(ts * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            tick={{ fontSize: 9, fill: theme.text.dim }}
            stroke={theme.main.cardBorder}
          />
          <YAxis
            tickFormatter={(v: number) => `${(v * 100).toFixed(0)}%`}
            domain={[0, 1]}
            tick={{ fontSize: 9, fill: theme.text.dim }}
            stroke={theme.main.cardBorder}
            width={40}
          />
          <Tooltip
            contentStyle={{ background: theme.main.card, border: `1px solid ${theme.main.cardBorder}`, borderRadius: 6, fontSize: 11 }}
            labelFormatter={(ts: number) => new Date(Number(ts) * 1000).toLocaleTimeString()}
            formatter={(value: number) => [`${(value * 100).toFixed(1)}%`, '']}
          />
          <Line type="monotone" dataKey="value" stroke={color} strokeWidth={1.5} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

function NodeDetail({ name }: { name: string }) {
  const { data, isLoading } = useNode(name)
  const { data: metricsData } = useNodeMetrics(name, '1h')

  if (isLoading) {
    return (
      <div style={{ padding: '16px 48px', color: theme.text.secondary, fontSize: 13 }}>
        Loading node details...
      </div>
    )
  }

  if (!data) return null

  const vms: NodeVM[] = data.vms ?? []

  return (
    <div
      style={{
        padding: '16px 48px 20px',
        background: theme.main.tableHeaderBg,
        borderBottom: `1px solid ${theme.main.tableRowBorder}`,
      }}
    >
      {/* Resource summary */}
      <div style={{ display: 'flex', gap: 32, marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Cpu size={14} style={{ color: theme.accent }} />
          <span style={{ fontSize: 12, color: theme.text.secondary, fontWeight: 500 }}>CPU:</span>
          <span style={{ fontSize: 13, color: theme.text.primary, fontWeight: 500 }}>
            {data.cpu_allocatable ?? '—'} / {data.cpu_capacity ?? '—'}
          </span>
          <span style={{ fontSize: 11, color: theme.text.dim }}>(allocatable / capacity)</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <MemoryStick size={14} style={{ color: theme.accent }} />
          <span style={{ fontSize: 12, color: theme.text.secondary, fontWeight: 500 }}>Memory:</span>
          <span style={{ fontSize: 13, color: theme.text.primary, fontWeight: 500 }}>
            {formatMemory(data.memory_allocatable ?? '')} / {formatMemory(data.memory_capacity ?? '')}
          </span>
          <span style={{ fontSize: 11, color: theme.text.dim }}>(allocatable / capacity)</span>
        </div>
      </div>

      {/* Node Metrics */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
        <NodeMetricChart
          title="CPU Usage (%)"
          data={metricsData?.cpu_usage_pct ?? []}
          color={theme.accent}
        />
        <NodeMetricChart
          title="Memory Usage (%)"
          data={metricsData?.memory_usage_pct ?? []}
          color={theme.status.running}
        />
      </div>

      {/* VM list */}
      <div style={{ fontSize: 12, fontWeight: 600, color: theme.text.secondary, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
        Running VMs ({vms.length})
      </div>
      {vms.length === 0 ? (
        <div style={{ fontSize: 13, color: theme.text.dim, padding: '8px 0' }}>
          No VMs running on this node.
        </div>
      ) : (
        <div
          style={{
            background: theme.main.card,
            border: `1px solid ${theme.main.cardBorder}`,
            borderRadius: theme.radius.md,
            overflow: 'hidden',
          }}
        >
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: theme.main.tableHeaderBg, borderBottom: `1px solid ${theme.main.tableRowBorder}` }}>
                {['Name', 'Namespace', 'Status', 'CPU', 'Memory'].map((col) => (
                  <th
                    key={col}
                    style={{
                      padding: '8px 14px',
                      textAlign: 'left',
                      color: theme.text.secondary,
                      fontWeight: 600,
                      fontSize: 10,
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
              {vms.map((vm) => (
                <tr
                  key={`${vm.namespace}/${vm.name}`}
                  style={{ borderBottom: `1px solid ${theme.main.tableRowBorder}` }}
                >
                  <td style={{ padding: '8px 14px', fontSize: 13, fontWeight: 500, color: theme.text.primary }}>
                    {vm.name}
                  </td>
                  <td style={{ padding: '8px 14px', fontSize: 12, color: theme.text.secondary }}>
                    {vm.namespace}
                  </td>
                  <td style={{ padding: '8px 14px' }}>
                    <VMStatusBadge status={vm.status} />
                  </td>
                  <td style={{ padding: '8px 14px', fontSize: 13, color: theme.text.secondary }}>
                    {vm.cpu_cores} vCPU
                  </td>
                  <td style={{ padding: '8px 14px', fontSize: 13, color: theme.text.secondary }}>
                    {vm.memory_mb} Mi
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export function NodesPage() {
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)
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

      <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
        {/* Search */}
        <div style={{ marginBottom: 16 }}>
          <input
            type="text"
            placeholder="Search nodes..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              width: 280,
              background: theme.main.inputBg,
              border: `1px solid ${theme.main.inputBorder}`,
              borderRadius: theme.radius.md,
              color: theme.text.primary,
              fontSize: 13,
              padding: '8px 12px',
              outline: 'none',
              fontFamily: 'inherit',
            }}
          />
        </div>

        {/* Table */}
        <div
          style={{
            background: theme.main.card,
            border: `1px solid ${theme.main.cardBorder}`,
            borderRadius: theme.radius.lg,
          }}
        >
          {isLoading ? (
            <div style={{ padding: 40, textAlign: 'center', color: theme.text.secondary, fontSize: 13 }}>
              Loading nodes...
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: theme.text.secondary, fontSize: 13 }}>
              {search ? 'No nodes match your search.' : 'No nodes found.'}
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: theme.main.tableHeaderBg, borderBottom: `1px solid ${theme.main.tableRowBorder}` }}>
                  {['', 'Name', 'Status', 'Roles', 'CPU', 'Memory', 'VMs'].map((col, i) => (
                    <th
                      key={i}
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
                {filtered.map((node) => {
                  const isExpanded = expanded === node.name
                  return (
                    <React.Fragment key={node.name}>
                      <tr
                        onClick={() => setExpanded(isExpanded ? null : node.name)}
                        style={{
                          cursor: 'pointer',
                          borderBottom: isExpanded ? 'none' : `1px solid ${theme.main.tableRowBorder}`,
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = theme.main.hoverBg)}
                        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                      >
                        <td style={{ padding: '10px 8px 10px 16px', color: theme.text.dim, width: 36 }}>
                          {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        </td>
                        <td style={{ padding: '10px 16px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <Server size={14} style={{ color: theme.accent, flexShrink: 0 }} />
                            <span style={{ color: theme.text.primary, fontWeight: 500, fontSize: 14 }}>
                              {node.name}
                            </span>
                          </div>
                        </td>
                        <td style={{ padding: '10px 16px' }}>
                          <StatusBadge status={node.status} />
                        </td>
                        <td style={{ padding: '10px 16px', color: theme.text.secondary, fontSize: 13 }}>
                          {node.roles?.join(', ') || '—'}
                        </td>
                        <td style={{ padding: '10px 16px', color: theme.text.secondary, fontSize: 13 }}>
                          {node.cpu_capacity ?? '—'} vCPU
                        </td>
                        <td style={{ padding: '10px 16px', color: theme.text.secondary, fontSize: 13 }}>
                          {formatMemory(node.memory_capacity ?? '')}
                        </td>
                        <td style={{ padding: '10px 16px' }}>
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
                      {isExpanded && (
                        <tr>
                          <td colSpan={7} style={{ padding: 0 }}>
                            <NodeDetail name={node.name} />
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}

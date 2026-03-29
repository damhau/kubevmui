import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useNode } from '@/hooks/useNodes'
import { useNodeMetrics } from '@/hooks/useMetrics'
import { theme } from '@/lib/theme'
import { TopBar } from '@/components/layout/TopBar'
import { CardSkeleton } from '@/components/ui/Skeleton'
import { InfoRow } from '@/components/ui/InfoRow'
import { YamlViewer } from '@/components/ui/YamlViewer'
import { MetricChart } from '@/components/ui/MetricChart'
import { TimeRangeSelector } from '@/components/ui/TimeRangeSelector'

function formatMemory(s: string): string {
  if (!s) return '—'
  if (s.endsWith('Ki')) return `${(parseInt(s) / (1024 * 1024)).toFixed(1)} Gi`
  if (s.endsWith('Mi')) return `${(parseInt(s) / 1024).toFixed(1)} Gi`
  if (s.endsWith('Gi')) return s
  const bytes = parseInt(s)
  if (!isNaN(bytes)) return `${(bytes / (1024 ** 3)).toFixed(1)} Gi`
  return s
}

type Tab = 'overview' | 'vms' | 'metrics' | 'yaml'

const vmStatusStyles: Record<string, { bg: string; color: string }> = {
  Running:  { bg: '#ecfdf5', color: '#22c55e' },
  Stopped:  { bg: '#f4f4f5', color: '#52525b' },
  Error:    { bg: '#fef2f2', color: '#dc2626' },
}

export function NodeDetailPage() {
  const { name } = useParams<{ name: string }>()
  const { data: node, isLoading } = useNode(name!)
  const [activeTab, setActiveTab] = useState<Tab>('overview')
  const [metricsRange, setMetricsRange] = useState('1h')
  const { data: metricsData } = useNodeMetrics(name!, metricsRange)

  const tabs: { id: Tab; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'vms', label: 'Virtual Machines' },
    { id: 'metrics', label: 'Metrics' },
    { id: 'yaml', label: 'YAML' },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <div
        style={{
          padding: '16px 24px',
          background: theme.main.card,
          borderBottom: `1px solid ${theme.main.cardBorder}`,
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          flexShrink: 0,
        }}
      >
        <Link to="/nodes" className="back-link" style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0, marginBottom: 0 }}>
          ← Nodes
        </Link>
        <h1
          style={{
            margin: 0,
            fontSize: 20,
            fontWeight: 700,
            fontFamily: theme.typography.heading.fontFamily,
            color: theme.text.heading,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {name}
        </h1>
        {node?.status && (
          <span
            className="badge"
            style={{
              background: node.status === 'Ready' ? '#ecfdf5' : '#fef2f2',
              color: node.status === 'Ready' ? '#16a34a' : '#dc2626',
              border: node.status === 'Ready' ? '1px solid #bbf7d0' : '1px solid #fecaca',
            }}
          >
            {node.status}
          </span>
        )}
      </div>

      {/* Tabs */}
      <div
        className="tab-bar"
        style={{
          background: theme.main.card,
          padding: '0 24px',
          flexShrink: 0,
          marginBottom: 0,
        }}
      >
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`tab-button ${activeTab === tab.id ? 'active' : ''}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="page-content">
        <div className="page-container">
          {isLoading ? (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <CardSkeleton height={160} />
              <CardSkeleton height={160} />
              <CardSkeleton height={160} />
            </div>
          ) : !node ? (
            <div style={{ color: theme.text.secondary, fontSize: 13 }}>Node not found.</div>
          ) : (
            <>
              {/* Overview Tab */}
              {activeTab === 'overview' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, animation: 'fadeInUp 0.35s ease-out both' }}>
                  {/* Basic Info card */}
                  <div className="card-padded">
                    <div className="section-title">
                      Basic Info
                    </div>
                    <InfoRow label="Name" value={node.name} mono />
                    <InfoRow
                      label="Status"
                      value={
                        <span
                          className="badge"
                          style={{
                            background: node.status === 'Ready' ? '#ecfdf5' : '#fef2f2',
                            color: node.status === 'Ready' ? '#16a34a' : '#dc2626',
                            border: node.status === 'Ready' ? '1px solid #bbf7d0' : '1px solid #fecaca',
                          }}
                        >
                          {node.status}
                        </span>
                      }
                    />
                    <InfoRow label="Roles" value={node.roles?.join(', ') || '—'} />
                  </div>

                  {/* Resources card */}
                  <div className="card-padded">
                    <div className="section-title">
                      Resources
                    </div>
                    <InfoRow label="CPU Capacity" value={node.cpu_capacity} mono />
                    <InfoRow label="CPU Allocatable" value={node.cpu_allocatable} mono />
                    <InfoRow label="Memory Capacity" value={formatMemory(node.memory_capacity ?? '')} mono />
                    <InfoRow label="Memory Allocatable" value={formatMemory(node.memory_allocatable ?? '')} mono />
                  </div>

                  {/* Conditions card */}
                  {node.conditions && node.conditions.length > 0 && (
                    <div className="card-padded" style={{ gridColumn: '1 / -1' }}>
                      <div className="section-title">
                        Conditions
                      </div>
                      <div style={{ borderRadius: theme.radius.md, overflow: 'hidden' }}>
                        <table className="table">
                          <thead>
                            <tr className="table-header">
                              {['Type', 'Status', 'Message'].map((col) => (
                                <th key={col} className="table-header-cell">
                                  {col}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {node.conditions.map((cond: any, i: number) => (
                              <tr key={i} className="table-row">
                                <td className="table-cell" style={{ fontSize: 13, fontWeight: 500, color: theme.text.primary }}>{cond.type}</td>
                                <td className="table-cell">
                                  <span
                                    style={{
                                      display: 'inline-block',
                                      padding: '2px 8px',
                                      borderRadius: 10,
                                      fontSize: 11,
                                      fontWeight: 500,
                                      background: cond.status === 'True' ? '#ecfdf5' : '#fef2f2',
                                      color: cond.status === 'True' ? '#16a34a' : '#dc2626',
                                      border: cond.status === 'True' ? '1px solid #bbf7d0' : '1px solid #fecaca',
                                    }}
                                  >
                                    {cond.status}
                                  </span>
                                </td>
                                <td className="table-cell" style={{ fontSize: 12, color: theme.text.secondary }}>{cond.message || '—'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* VMs Tab */}
              {activeTab === 'vms' && (
                <div style={{ animation: 'fadeInUp 0.35s ease-out both' }}>
                  {!node.vms || node.vms.length === 0 ? (
                    <div style={{ color: theme.text.secondary, fontSize: 13, padding: '24px 0' }}>
                      No virtual machines running on this node.
                    </div>
                  ) : (
                    <div className="card" style={{ overflow: 'hidden' }}>
                      <table className="table">
                        <thead>
                          <tr className="table-header">
                            {['Name', 'Namespace', 'Status', 'CPU', 'Memory'].map((col) => (
                              <th key={col} className="table-header-cell">
                                {col}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {node.vms.map((vm: any, i: number) => {
                            const statusStyle = vmStatusStyles[vm.status] ?? { bg: theme.main.bg, color: theme.text.secondary }
                            return (
                              <tr
                                key={`${vm.namespace}/${vm.name}`}
                                className="table-row"
                                style={{
                                  animation: i < 20 ? `fadeInRow 0.3s ease-out both` : undefined,
                                  animationDelay: i < 20 ? `${0.05 + i * 0.04}s` : undefined,
                                }}
                              >
                                <td className="table-cell">
                                  <Link
                                    to={`/vms/${vm.namespace}/${vm.name}`}
                                    style={{
                                      color: theme.accent,
                                      textDecoration: 'none',
                                      fontSize: 13,
                                      fontWeight: 500,
                                    }}
                                  >
                                    {vm.name}
                                  </Link>
                                </td>
                                <td className="table-cell" style={{ fontSize: 12, color: theme.text.secondary }}>{vm.namespace}</td>
                                <td className="table-cell">
                                  <span
                                    style={{
                                      display: 'inline-block',
                                      padding: '2px 8px',
                                      borderRadius: 10,
                                      fontSize: 11,
                                      fontWeight: 500,
                                      background: statusStyle.bg,
                                      color: statusStyle.color,
                                    }}
                                  >
                                    {vm.status}
                                  </span>
                                </td>
                                <td className="table-cell" style={{ fontSize: 13, color: theme.text.secondary, fontFamily: theme.typography.mono.fontFamily }}>
                                  {vm.cpu_cores != null ? `${vm.cpu_cores} vCPU` : '—'}
                                </td>
                                <td className="table-cell" style={{ fontSize: 13, color: theme.text.secondary, fontFamily: theme.typography.mono.fontFamily }}>
                                  {vm.memory_mb != null ? `${vm.memory_mb} Mi` : '—'}
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* Metrics Tab */}
              {activeTab === 'metrics' && (
                <div style={{ animation: 'fadeInUp 0.35s ease-out both' }}>
                  {/* Range selector */}
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
                    <TimeRangeSelector value={metricsRange} onChange={setMetricsRange} ranges={['1h', '6h', '24h']} />
                  </div>

                  {/* Charts */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                    <MetricChart
                      title="CPU Usage (%)"
                      data={metricsData?.cpu_usage_pct ?? []}
                      color="#3b82f6"
                      formatValue={(v) => `${(v * 100).toFixed(1)}%`}
                      yDomain={[0, 1]}
                    />
                    <MetricChart
                      title="Memory Usage (%)"
                      data={metricsData?.memory_usage_pct ?? []}
                      color="#8b5cf6"
                      formatValue={(v) => `${(v * 100).toFixed(1)}%`}
                      yDomain={[0, 1]}
                    />
                  </div>
                </div>
              )}

              {/* YAML Tab */}
              {activeTab === 'yaml' && (
                <YamlViewer resources={[
                  { label: node.name, kind: 'Node', data: node.raw_manifest ?? node }
                ]} />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

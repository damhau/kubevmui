import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useDatastore, useDatastorePVs, useDatastoreMetrics, type PersistentVolumeInfo } from '@/hooks/useDatastores'
import { theme } from '@/lib/theme'
import { CardSkeleton, TableSkeleton } from '@/components/ui/Skeleton'
import { InfoRow } from '@/components/ui/InfoRow'
import { YamlViewer } from '@/components/ui/YamlViewer'
import { MetricChart } from '@/components/ui/MetricChart'
import { TimeRangeSelector } from '@/components/ui/TimeRangeSelector'

type Tab = 'overview' | 'metrics' | 'pvs' | 'yaml'

const pvPhaseColor: Record<string, string> = {
  Bound: theme.status.running,
  Available: theme.status.provisioning,
  Released: theme.status.migrating,
  Failed: theme.status.error,
}

const providerColor: Record<string, string> = {
  topolvm: theme.accent,
  'ceph-rbd': theme.status.running,
  cephfs: theme.status.running,
  nfs: theme.status.provisioning,
  'local-path': theme.status.migrating,
  longhorn: theme.status.running,
  'aws-ebs': theme.status.provisioning,
  'gcp-pd': theme.status.provisioning,
  'azure-disk': theme.status.provisioning,
  csi: theme.text.secondary,
  unknown: theme.text.dim,
}

function Badge({ label, color }: { label: string; color: string }) {
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '2px 8px',
        borderRadius: theme.radius.sm,
        fontSize: 11,
        fontWeight: 600,
        color,
        background: `${color}1a`,
        border: `1px solid ${color}40`,
      }}
    >
      {label}
    </span>
  )
}

type MetricPoint = { timestamp: number; value: number }
type PerNodeData = Record<string, MetricPoint[]>

function flattenPerNode(perNode: PerNodeData | undefined): MetricPoint[] {
  if (!perNode) return []
  const nodes = Object.values(perNode)
  if (nodes.length === 0) return []
  // If single node, return directly; if multi, sum values at each timestamp
  if (nodes.length === 1) return nodes[0]
  const byTs = new Map<number, number>()
  for (const series of nodes) {
    for (const pt of series) {
      byTs.set(pt.timestamp, (byTs.get(pt.timestamp) ?? 0) + pt.value)
    }
  }
  return Array.from(byTs.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([timestamp, value]) => ({ timestamp, value }))
}

function avgPerNode(perNode: PerNodeData | undefined): MetricPoint[] {
  if (!perNode) return []
  const nodes = Object.values(perNode)
  if (nodes.length === 0) return []
  if (nodes.length === 1) return nodes[0]
  const byTs = new Map<number, { sum: number; count: number }>()
  for (const series of nodes) {
    for (const pt of series) {
      const entry = byTs.get(pt.timestamp) ?? { sum: 0, count: 0 }
      entry.sum += pt.value
      entry.count += 1
      byTs.set(pt.timestamp, entry)
    }
  }
  return Array.from(byTs.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([timestamp, { sum, count }]) => ({ timestamp, value: sum / count }))
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function TopolvmMetrics({ data }: { data: Record<string, any> }) {
  const formatBytes = (v: number) => {
    if (v >= 1024 ** 4) return `${(v / 1024 ** 4).toFixed(1)} TB`
    if (v >= 1024 ** 3) return `${(v / 1024 ** 3).toFixed(1)} GB`
    if (v >= 1024 ** 2) return `${(v / 1024 ** 2).toFixed(0)} MB`
    return `${(v / 1024).toFixed(0)} KB`
  }
  const formatPct = (v: number) => `${v.toFixed(1)}%`

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
      <MetricChart
        title="Volume Group Total Size"
        data={data.vg_size_total ?? []}
        color={theme.accent}
        formatValue={formatBytes}
        variant="area"
      />
      <MetricChart
        title="Volume Group Available"
        data={data.vg_available_total ?? []}
        color={theme.status.running}
        formatValue={formatBytes}
        variant="area"
      />
      <MetricChart
        title="Thin Pool Data Usage (%)"
        data={avgPerNode(data.thinpool_data_percent)}
        color="#f97316"
        formatValue={formatPct}
        yDomain={[0, 100]}
      />
      <MetricChart
        title="Thin Pool Metadata Usage (%)"
        data={avgPerNode(data.thinpool_metadata_percent)}
        color="#8b5cf6"
        formatValue={formatPct}
        yDomain={[0, 100]}
      />
      <MetricChart
        title="Thin Pool Size"
        data={flattenPerNode(data.thinpool_size)}
        color={theme.accent}
        formatValue={formatBytes}
        variant="area"
      />
      <MetricChart
        title="Thin Pool Overprovisioned Available"
        data={flattenPerNode(data.thinpool_overprovisioned_available)}
        color={theme.status.provisioning}
        formatValue={formatBytes}
        variant="area"
      />
    </div>
  )
}

export function DatastoreDetailPage() {
  const { name } = useParams<{ name: string }>()
  const { data, isLoading } = useDatastore(name!)
  const { data: pvsData, isLoading: pvsLoading } = useDatastorePVs(name!)
  const pvs: PersistentVolumeInfo[] = Array.isArray(pvsData?.items) ? pvsData.items : []
  const [activeTab, setActiveTab] = useState<Tab>('overview')
  const [metricsRange, setMetricsRange] = useState('1h')
  const { data: metricsData, isLoading: metricsLoading } = useDatastoreMetrics(name!, metricsRange)

  const tabs: { id: Tab; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'metrics', label: 'Metrics' },
    { id: 'pvs', label: `Persistent Volumes${pvs.length ? ` (${pvs.length})` : ''}` },
    { id: 'yaml', label: 'YAML' },
  ]

  const providerDetails = data?.provider_details ?? {}
  const hasProviderDetails = Object.keys(providerDetails).length > 0
  const parameters = data?.parameters ?? {}
  const hasParameters = Object.keys(parameters).length > 0

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
          justifyContent: 'space-between',
          gap: 16,
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0 }}>
          <Link to="/storage?tab=datastores" className="back-link" style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0, marginBottom: 0 }}>
            &larr; Storage
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
          {data?.is_default && (
            <Badge label="Default" color={theme.status.running} />
          )}
        </div>
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
              <CardSkeleton height={200} />
              <CardSkeleton height={200} />
            </div>
          ) : !data ? (
            <div style={{ color: theme.text.secondary, fontSize: 13 }}>Datastore not found.</div>
          ) : (
            <>
              {activeTab === 'overview' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, animation: 'fadeInUp 0.35s ease-out both' }}>
                  {/* Basic Info */}
                  <div className="card-padded">
                    <div className="section-title">Basic Info</div>
                    <InfoRow label="Name" value={data.name} mono />
                    <InfoRow label="Provisioner" value={data.provisioner} mono />
                    <InfoRow
                      label="Provider Type"
                      value={
                        <Badge label={data.provider_type} color={providerColor[data.provider_type] ?? theme.text.dim} />
                      }
                    />
                    <InfoRow
                      label="Default"
                      value={
                        <span style={{ color: data.is_default ? theme.status.running : theme.text.secondary }}>
                          {data.is_default ? 'Yes' : 'No'}
                        </span>
                      }
                    />
                    <InfoRow label="Reclaim Policy" value={data.reclaim_policy} />
                    <InfoRow label="Volume Binding Mode" value={data.volume_binding_mode} />
                    <InfoRow
                      label="Allow Expansion"
                      value={
                        <span style={{ color: data.allow_expansion ? theme.status.running : theme.text.secondary }}>
                          {data.allow_expansion ? 'Yes' : 'No'}
                        </span>
                      }
                    />
                  </div>

                  {/* Capacity */}
                  <div className="card-padded">
                    <div className="section-title">Capacity</div>
                    <InfoRow label="Persistent Volumes" value={String(data.pv_count)} mono />
                    <InfoRow
                      label="Total Capacity"
                      value={data.total_capacity_gb > 0 ? `${data.total_capacity_gb} GB` : '—'}
                      mono
                    />
                    <InfoRow
                      label="Available Capacity"
                      value={data.available_capacity_gb != null ? `${data.available_capacity_gb} GB` : 'Unknown'}
                      mono
                    />
                  </div>

                  {/* Parameters */}
                  {hasParameters && (
                    <div className="card-padded">
                      <div className="section-title">Parameters</div>
                      {Object.entries(parameters).map(([key, value]) => (
                        <InfoRow key={key} label={key} value={value} mono />
                      ))}
                    </div>
                  )}

                  {/* Provider Details */}
                  {hasProviderDetails && (
                    <div className="card-padded">
                      <div className="section-title">Provider Details</div>
                      {data.provider_type === 'topolvm' ? (
                        <>
                          {providerDetails.device_class && (
                            <InfoRow label="Device Class" value={String(providerDetails.device_class)} mono />
                          )}
                          {providerDetails.lv_count != null && (
                            <InfoRow label="Logical Volumes" value={String(providerDetails.lv_count)} mono />
                          )}
                          {Array.isArray(providerDetails.nodes) && providerDetails.nodes.length > 0 && (
                            <>
                              <div style={{ fontSize: 12, color: theme.text.secondary, marginTop: 12, marginBottom: 8, fontWeight: 500 }}>
                                Per-Node Available Capacity
                              </div>
                              <table className="table" style={{ fontSize: 12 }}>
                                <thead>
                                  <tr className="table-header">
                                    <th className="table-header-cell">Node</th>
                                    <th className="table-header-cell">Available</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {(providerDetails.nodes as Array<{ name: string; available_gb: number }>).map((node) => (
                                    <tr key={node.name} className="table-row">
                                      <td className="table-cell" style={{ fontFamily: theme.typography.mono.fontFamily }}>{node.name}</td>
                                      <td className="table-cell" style={{ fontFamily: theme.typography.mono.fontFamily }}>{node.available_gb} GB</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </>
                          )}
                        </>
                      ) : (
                        Object.entries(providerDetails).map(([key, value]) => (
                          <InfoRow key={key} label={key} value={String(value)} mono />
                        ))
                      )}
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'metrics' && (
                <div style={{ animation: 'fadeInUp 0.35s ease-out both' }}>
                  <div style={{ marginBottom: 16 }}>
                    <TimeRangeSelector value={metricsRange} onChange={setMetricsRange} />
                  </div>
                  {metricsLoading ? (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                      <CardSkeleton height={260} />
                      <CardSkeleton height={260} />
                    </div>
                  ) : !metricsData || !metricsData.provider_type ? (
                    <div className="card" style={{ padding: 24 }}>
                      <div className="empty-text">
                        No metrics available for this storage provider. Metrics are currently supported for TopoLVM datastores.
                      </div>
                    </div>
                  ) : metricsData.provider_type === 'topolvm' ? (
                    <TopolvmMetrics data={metricsData} />
                  ) : (
                    <div className="card" style={{ padding: 24 }}>
                      <div className="empty-text">
                        Metrics for {data.provider_type} datastores are not yet supported.
                      </div>
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'pvs' && (
                <div className="card" style={{ animation: 'fadeInUp 0.35s ease-out both' }}>
                  {pvsLoading ? (
                    <TableSkeleton rows={3} cols={5} />
                  ) : pvs.length === 0 ? (
                    <div className="empty-text">
                      No persistent volumes found for this datastore.
                    </div>
                  ) : (
                    <table className="table">
                      <thead>
                        <tr className="table-header">
                          <th className="table-header-cell">Name</th>
                          <th className="table-header-cell">Capacity</th>
                          <th className="table-header-cell">Status</th>
                          <th className="table-header-cell">Access Modes</th>
                          <th className="table-header-cell">Claim</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pvs.map((pv) => (
                          <tr key={pv.name} className="table-row">
                            <td className="table-cell" style={{ fontWeight: 500, color: theme.text.primary, fontFamily: theme.typography.mono.fontFamily }}>
                              {pv.name}
                            </td>
                            <td className="table-cell" style={{ color: theme.text.secondary, fontFamily: theme.typography.mono.fontFamily }}>
                              {pv.capacity_gb > 0 ? `${pv.capacity_gb} GB` : '—'}
                            </td>
                            <td className="table-cell">
                              <Badge
                                label={pv.phase}
                                color={pvPhaseColor[pv.phase] ?? theme.text.dim}
                              />
                            </td>
                            <td className="table-cell" style={{ color: theme.text.secondary, fontSize: 12 }}>
                              {pv.access_modes.join(', ') || '—'}
                            </td>
                            <td className="table-cell" style={{ color: theme.text.secondary, fontSize: 12, fontFamily: theme.typography.mono.fontFamily }}>
                              {pv.claim_name ? `${pv.claim_namespace}/${pv.claim_name}` : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}

              {activeTab === 'yaml' && (
                <YamlViewer resources={[
                  { label: data.name, kind: 'StorageClass', data: data.raw_manifest ?? {} }
                ]} />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

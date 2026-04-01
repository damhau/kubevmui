import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useDisk } from '@/hooks/useDisks'
import { useResourceEvents } from '@/hooks/useEvents'
import { theme } from '@/lib/theme'
import { TopBar } from '@/components/layout/TopBar'
import { CardSkeleton } from '@/components/ui/Skeleton'
import { InfoRow } from '@/components/ui/InfoRow'
import { YamlViewer } from '@/components/ui/YamlViewer'

type Tab = 'overview' | 'events' | 'yaml'

const tierColor: Record<string, string> = {
  premium: '#6366f1',
  standard: '#22c55e',
  economy: '#f59e0b',
}

function StatusDot({ status }: { status: string }) {
  const color = status === 'Available' || status === 'Bound' ? '#22c55e' : status === 'Pending' ? '#f59e0b' : theme.text.secondary
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 14, fontWeight: 500, color: theme.text.primary }}>
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: color,
          flexShrink: 0,
        }}
      />
      {status}
    </span>
  )
}

export function StorageDetailPage() {
  const { namespace, name } = useParams<{ namespace: string; name: string }>()
  const { data, isLoading } = useDisk(namespace!, name!)
  const { data: events = [] } = useResourceEvents(namespace!, name!)
  const [activeTab, setActiveTab] = useState<Tab>('overview')

  const tabs: { id: Tab; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'events', label: 'Events' },
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
          justifyContent: 'space-between',
          gap: 16,
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0 }}>
          <Link to="/storage" className="back-link" style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0, marginBottom: 0 }}>
            ← Storage
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
              <CardSkeleton height={120} />
            </div>
          ) : !data ? (
            <div style={{ color: theme.text.secondary, fontSize: 13 }}>Disk not found.</div>
          ) : (
            <>
              {activeTab === 'overview' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, animation: 'fadeInUp 0.35s ease-out both' }}>
                  {/* Basic Info */}
                  <div className="card-padded">
                    <div className="section-title">
                      Basic Info
                    </div>
                    <InfoRow label="Name" value={data.name} mono />
                    <InfoRow label="Namespace" value={data.namespace} mono />
                    <InfoRow label="Created At" value={data.created_at ? new Date(data.created_at).toLocaleString() : undefined} />
                    <InfoRow
                      label="Status"
                      value={data.status ? <StatusDot status={data.status} /> : undefined}
                    />
                    {data.dv_phase && data.dv_phase !== 'Succeeded' && (
                      <InfoRow
                        label="Provisioning"
                        value={
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 120 }}>
                            <span style={{ fontSize: 12, color: theme.status.migrating, fontWeight: 500 }}>
                              {data.dv_phase === 'CloneInProgress' ? 'Cloning' : data.dv_phase} {data.dv_progress || ''}
                            </span>
                            {data.dv_progress && (
                              <div style={{
                                height: 4,
                                borderRadius: 2,
                                background: `${theme.status.migrating}25`,
                                overflow: 'hidden',
                              }}>
                                <div style={{
                                  height: '100%',
                                  width: `${Math.min(parseFloat(data.dv_progress) || 0, 100)}%`,
                                  background: theme.status.migrating,
                                  borderRadius: 2,
                                  transition: 'width 0.5s ease',
                                }} />
                              </div>
                            )}
                          </div>
                        }
                      />
                    )}
                    {data.is_image && (
                      <InfoRow
                        label="Type"
                        value={
                          <Link to={`/images/${data.namespace}/${data.name}`} style={{ color: theme.status.provisioning, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontSize: 11, fontWeight: 600, padding: '1px 6px', borderRadius: 3, background: `${theme.status.provisioning}18`, border: `1px solid ${theme.status.provisioning}40` }}>
                              Image
                            </span>
                            View image details
                          </Link>
                        }
                      />
                    )}
                  </div>

                  {/* Storage Configuration */}
                  <div className="card-padded">
                    <div className="section-title">
                      Storage Configuration
                    </div>
                    <InfoRow label="Size" value={data.size_gb != null ? `${data.size_gb} Gi` : undefined} />
                    <InfoRow
                      label="Performance Tier"
                      value={
                        data.performance_tier ? (
                          <span
                            style={{
                              display: 'inline-block',
                              padding: '2px 8px',
                              borderRadius: theme.radius.sm,
                              fontSize: 11,
                              fontWeight: 600,
                              color: tierColor[data.performance_tier.toLowerCase()] ?? theme.text.dim,
                              background: `${tierColor[data.performance_tier.toLowerCase()] ?? theme.text.dim}1a`,
                              border: `1px solid ${tierColor[data.performance_tier.toLowerCase()] ?? theme.text.dim}40`,
                            }}
                          >
                            {data.performance_tier}
                          </span>
                        ) : undefined
                      }
                    />
                    <InfoRow label="Storage Class" value={data.storage_class} mono />
                    <InfoRow label="Access Mode" value={data.access_mode} />
                    <InfoRow label="Volume Mode" value={data.volume_mode} />
                  </div>

                  {/* Attachment */}
                  <div className="card-padded">
                    <div className="section-title">
                      Attachment
                    </div>
                    <InfoRow
                      label="Attached VM"
                      value={
                        data.attached_vm ? (
                          <Link
                            to={`/vms/${data.namespace}/${data.attached_vm}`}
                            style={{
                              color: theme.accent,
                              textDecoration: 'none',
                              fontWeight: 500,
                            }}
                          >
                            {data.attached_vm}
                          </Link>
                        ) : (
                          <span style={{ color: theme.text.secondary }}>Not attached to any VM</span>
                        )
                      }
                    />
                  </div>

                  {/* Labels */}
                  {data.labels && Object.keys(data.labels).length > 0 && (
                    <div className="card-padded">
                      <div className="section-title">
                        Labels
                      </div>
                      {Object.entries(data.labels).map(([key, val]) => (
                        <InfoRow key={key} label={key} value={val as string} mono />
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Events */}
              {activeTab === 'events' && (
                <div className="card">
                  {events.length > 0 ? (
                    <table className="table">
                      <thead>
                        <tr className="table-header">
                          {['Time', 'Type', 'Source', 'Reason', 'Message'].map((col) => (
                            <th key={col} className="table-header-cell">
                              {col}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {events.map((evt: any, i: number) => (
                          <tr key={i} className="table-row">
                            <td className="table-cell" style={{ color: theme.text.secondary, fontSize: 12, whiteSpace: 'nowrap' }}>
                              {evt.timestamp}
                            </td>
                            <td className="table-cell">
                              <span
                                style={{
                                  color: evt.type === 'Warning' ? theme.status.migrating : theme.status.running,
                                  fontSize: 12,
                                  fontWeight: 500,
                                }}
                              >
                                {evt.type}
                              </span>
                            </td>
                            <td className="table-cell" style={{ color: theme.text.secondary, fontSize: 12, whiteSpace: 'nowrap' }}>
                              {evt.source && (
                                <span style={{
                                  display: 'inline-block',
                                  padding: '2px 6px',
                                  borderRadius: 4,
                                  fontSize: 11,
                                  fontWeight: 500,
                                  background: `${theme.accent}1a`,
                                  color: theme.accent,
                                  border: `1px solid ${theme.accent}40`,
                                }}>
                                  {evt.source}
                                </span>
                              )}
                            </td>
                            <td className="table-cell" style={{ color: theme.text.secondary }}>{evt.reason}</td>
                            <td className="table-cell" style={{ color: theme.text.primary }}>{evt.message}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <div className="empty-text">
                      No events found.
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'yaml' && (
                <YamlViewer resources={[
                  { label: data.name, kind: 'PersistentVolumeClaim', data: data.raw_manifest ?? data }
                ]} />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

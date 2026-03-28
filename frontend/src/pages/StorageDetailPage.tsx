import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useDisk } from '@/hooks/useDisks'
import { theme } from '@/lib/theme'
import { TopBar } from '@/components/layout/TopBar'
import { CardSkeleton } from '@/components/ui/Skeleton'
import { InfoRow } from '@/components/ui/InfoRow'

type Tab = 'overview' | 'yaml'

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
  const [activeTab, setActiveTab] = useState<Tab>('overview')

  const tabs: { id: Tab; label: string }[] = [
    { id: 'overview', label: 'Overview' },
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

              {activeTab === 'yaml' && (
                <div className="card-padded" style={{ animation: 'fadeInUp 0.35s ease-out both' }}>
                  <pre className="code-block" style={{ border: 'none', boxShadow: 'none', padding: 0, borderRadius: 0, background: 'transparent', fontSize: 13, lineHeight: 1.6, wordBreak: 'break-all' }}>
                    {JSON.stringify(data, null, 2)}
                  </pre>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

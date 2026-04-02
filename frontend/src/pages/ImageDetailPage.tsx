import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useImage } from '@/hooks/useImages'
import { useResourceEvents } from '@/hooks/useEvents'
import { theme } from '@/lib/theme'
import { TopBar } from '@/components/layout/TopBar'
import { CardSkeleton } from '@/components/ui/Skeleton'
import { InfoRow } from '@/components/ui/InfoRow'
import { YamlViewer } from '@/components/ui/YamlViewer'

type Tab = 'overview' | 'events' | 'yaml'

const sourceColor: Record<string, string> = { http: '#3b82f6', registry: '#8b5cf6', pvc: '#f59e0b', upload: '#22c55e' }
const osColor: Record<string, string> = { linux: '#22c55e', windows: '#3b82f6' }

const phaseBadge: Record<string, { bg: string; color: string; border: string }> = {
  Succeeded:        { bg: '#ecfdf5', color: '#16a34a', border: '1px solid #bbf7d0' },
  ImportInProgress: { bg: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe' },
  Failed:           { bg: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca' },
}

export function ImageDetailPage() {
  const { name } = useParams<{ name: string }>()
  const { data, isLoading } = useImage(name!)
  const storageNs = data?.storage_namespace || 'default'
  const { data: events = [] } = useResourceEvents(storageNs, name!)
  const [activeTab, setActiveTab] = useState<Tab>('overview')

  const tabs: { id: Tab; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'events', label: 'Events' },
    { id: 'yaml', label: 'YAML' },
  ]

  const progressPercent = data?.dv_progress ? parseFloat(data.dv_progress) : 0

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
          <Link to="/images" className="back-link" style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0, marginBottom: 0 }}>
            ← Images
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
            {data?.display_name || name}
          </h1>
          {data?.dv_phase && (() => {
            const s = phaseBadge[data.dv_phase]
            return (
              <span
                className="badge"
                style={{
                  background: s?.bg ?? theme.main.bg,
                  color: s?.color ?? theme.text.secondary,
                  border: s?.border ?? `1px solid ${theme.main.cardBorder}`,
                }}
              >
                {data.dv_phase}
              </span>
            )
          })()}
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
              <CardSkeleton height={160} />
            </div>
          ) : !data ? (
            <div style={{ color: theme.text.secondary, fontSize: 13 }}>Image not found.</div>
          ) : (
            <>
              {/* Overview */}
              {activeTab === 'overview' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  {/* Basic Info card */}
                  <div className="card-padded animate-fade-in-up">
                    <div className="section-title">
                      Basic Info
                    </div>
                    <InfoRow label="Name" value={data.name} mono />
                    <InfoRow label="Storage Namespace" value={data.storage_namespace || 'default'} mono />
                    <InfoRow label="Display Name" value={data.display_name} />
                    <InfoRow label="Description" value={data.description} />
                    <InfoRow
                      label="OS Type"
                      value={
                        data.os_type ? (
                          <span
                            style={{
                              display: 'inline-block',
                              padding: '2px 10px',
                              borderRadius: 10,
                              fontSize: 12,
                              fontWeight: 500,
                              background: (osColor[data.os_type.toLowerCase()] ?? theme.text.secondary) + '18',
                              color: osColor[data.os_type.toLowerCase()] ?? theme.text.secondary,
                            }}
                          >
                            {data.os_type}
                          </span>
                        ) : null
                      }
                    />
                    <InfoRow label="Created At" value={data.created_at} />
                  </div>

                  {/* Source card */}
                  <div className="card-padded animate-fade-in-up stagger-1">
                    <div className="section-title">
                      Source
                    </div>
                    <InfoRow
                      label="Source Type"
                      value={
                        data.source_type ? (
                          <span
                            style={{
                              display: 'inline-block',
                              padding: '2px 10px',
                              borderRadius: 10,
                              fontSize: 12,
                              fontWeight: 500,
                              background: (sourceColor[data.source_type.toLowerCase()] ?? theme.text.secondary) + '18',
                              color: sourceColor[data.source_type.toLowerCase()] ?? theme.text.secondary,
                            }}
                          >
                            {data.source_type}
                          </span>
                        ) : null
                      }
                    />
                    <InfoRow
                      label="Source URL"
                      value={
                        data.source_url ? (
                          <span style={{ fontFamily: theme.typography.mono.fontFamily, fontSize: 13, wordBreak: 'break-all' as const }}>
                            {data.source_url}
                          </span>
                        ) : null
                      }
                    />
                    <InfoRow label="Size" value={data.size_gb != null ? `${data.size_gb} GB` : null} />
                    <InfoRow label="Storage Class" value={data.storage_class} mono />
                    <InfoRow label="Access Modes" value={data.access_modes?.join(', ')} />
                    <InfoRow label="Volume Mode" value={data.volume_mode} />
                  </div>

                  {/* Status card */}
                  <div className="card-padded animate-fade-in-up stagger-2">
                    <div className="section-title">
                      Status
                    </div>
                    <InfoRow
                      label="DV Phase"
                      value={
                        data.dv_phase ? (() => {
                          const s = phaseBadge[data.dv_phase]
                          return (
                            <span
                              className="badge"
                              style={{
                                background: s?.bg ?? theme.main.bg,
                                color: s?.color ?? theme.text.secondary,
                                border: s?.border ?? `1px solid ${theme.main.cardBorder}`,
                              }}
                            >
                              {data.dv_phase}
                            </span>
                          )
                        })() : null
                      }
                    />
                    {data.dv_progress && data.dv_phase !== 'Succeeded' && (
                      <>
                        <InfoRow label="Progress" value={data.dv_progress} />
                        <div style={{ padding: '10px 0' }}>
                          <div style={{ height: 8, background: theme.main.tableHeaderBg, borderRadius: 4, overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: progressPercent + '%', background: theme.accent, borderRadius: 4, transition: 'width 0.3s' }} />
                          </div>
                        </div>
                      </>
                    )}
                  </div>
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

              {/* YAML */}
              {activeTab === 'yaml' && (
                <YamlViewer resources={[
                  ...(data.raw_manifest ? [{ label: data.name, kind: 'Image', data: data.raw_manifest }] : []),
                  ...(data.raw_dv_manifest ? [{ label: `${data.name} (volume)`, kind: 'DataVolume', data: data.raw_dv_manifest }] : []),
                  ...(!data.raw_manifest && !data.raw_dv_manifest ? [{ label: data.name, kind: 'Image', data }] : []),
                ]} />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useNetwork } from '@/hooks/useNetworks'
import { useResourceEvents } from '@/hooks/useEvents'
import { theme } from '@/lib/theme'
import { CardSkeleton } from '@/components/ui/Skeleton'
import { InfoRow } from '@/components/ui/InfoRow'
import { YamlViewer } from '@/components/ui/YamlViewer'

type Tab = 'overview' | 'events' | 'yaml'

const typeColor: Record<string, string> = {
  Bridge: theme.status.running,
  bridge: theme.status.running,
  Masquerade: theme.status.provisioning,
  masquerade: theme.status.provisioning,
  'SR-IOV': theme.status.migrating,
  'sr-iov': theme.status.migrating,
  OVS: theme.accent,
  ovs: theme.accent,
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

export function NetworkDetailPage() {
  const { namespace, name } = useParams<{ namespace: string; name: string }>()
  const { data, isLoading } = useNetwork(namespace!, name!)
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
          <Link to="/networks?tab=networks" className="back-link" style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0, marginBottom: 0 }}>
            ← Networks
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
            <div style={{ color: theme.text.secondary, fontSize: 13 }}>Network profile not found.</div>
          ) : (
            <>
              {/* Overview */}
              {activeTab === 'overview' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, animation: 'fadeInUp 0.35s ease-out both' }}>
                  {/* Basic Info */}
                  <div className="card-padded">
                    <div className="section-title">Basic Info</div>
                    <InfoRow label="Display Name" value={data.display_name} />
                    <InfoRow label="Name" value={data.name} mono />
                    <InfoRow label="Namespace" value={data.namespace} mono />
                    <InfoRow label="Created At" value={data.created_at ? new Date(data.created_at).toLocaleString() : undefined} />
                    <InfoRow label="Description" value={data.description || undefined} />
                  </div>

                  {/* Configuration */}
                  <div className="card-padded">
                    <div className="section-title">Configuration</div>
                    <InfoRow
                      label="Type"
                      value={
                        data.network_type ? (
                          <Badge label={data.network_type} color={typeColor[data.network_type] ?? theme.text.dim} />
                        ) : undefined
                      }
                    />
                    {data.vlan_id != null && (
                      <InfoRow label="VLAN ID" value={String(data.vlan_id)} mono />
                    )}
                    <InfoRow
                      label="DHCP"
                      value={
                        <span style={{ color: data.dhcp_enabled ? theme.status.running : theme.text.secondary }}>
                          {data.dhcp_enabled ? 'Yes' : 'No'}
                        </span>
                      }
                    />
                    {data.subnet && (
                      <InfoRow label="Subnet" value={data.subnet} mono />
                    )}
                    {data.gateway && (
                      <InfoRow label="Gateway" value={data.gateway} mono />
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
                        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
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
                  { label: data.name, kind: 'NetworkAttachmentDefinition', data: data.raw_manifest ?? data }
                ]} />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

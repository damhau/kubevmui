import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { theme } from '@/lib/theme'
import { CardSkeleton } from '@/components/ui/Skeleton'
import { InfoRow } from '@/components/ui/InfoRow'
import { YamlViewer } from '@/components/ui/YamlViewer'
import { useNNCPs } from '@/hooks/useNMState'

type Tab = 'overview' | 'status' | 'enactments' | 'yaml'

const statusColor: Record<string, string> = {
  Available: theme.status.running,
  Progressing: theme.status.migrating,
  Degraded: theme.status.error,
  Unknown: theme.text.dim,
}

const typeColor: Record<string, string> = {
  'linux-bridge': theme.status.running,
  'vlan': theme.status.provisioning,
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

export function InterfaceDetailPage() {
  const { name } = useParams<{ name: string }>()
  const { data: nncpData, isLoading } = useNNCPs()
  const nncps = Array.isArray(nncpData?.items) ? nncpData.items : []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const nncp = nncps.find((n: any) => n.name === name)
  const [activeTab, setActiveTab] = useState<Tab>('overview')

  const tabs: { id: Tab; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'status', label: 'Status' },
    { id: 'enactments', label: 'Enactments' },
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
          <Link to="/networks" className="back-link" style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0, marginBottom: 0 }}>
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
            {name}
          </h1>
          {nncp?.status && (
            <Badge label={nncp.status} color={statusColor[nncp.status] ?? theme.text.dim} />
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
          ) : !nncp ? (
            <div style={{ color: theme.text.secondary, fontSize: 13 }}>Interface policy not found.</div>
          ) : (
            <>
              {/* Overview */}
              {activeTab === 'overview' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, animation: 'fadeInUp 0.35s ease-out both' }}>
                  {/* Configuration */}
                  <div className="card-padded">
                    <div className="section-title">Configuration</div>
                    <InfoRow label="Name" value={nncp.name} mono />
                    <InfoRow label="Interface Name" value={nncp.interface_name} mono />
                    <InfoRow
                      label="Type"
                      value={
                        nncp.interface_type ? (
                          <Badge label={nncp.interface_type} color={typeColor[nncp.interface_type] ?? theme.text.dim} />
                        ) : undefined
                      }
                    />
                    <InfoRow label="State" value={nncp.state} />
                    <InfoRow
                      label="Status"
                      value={
                        nncp.status ? (
                          <Badge label={nncp.status} color={statusColor[nncp.status] ?? theme.text.dim} />
                        ) : undefined
                      }
                    />
                    <InfoRow label="Description" value={nncp.description || undefined} />
                  </div>

                  {/* Details */}
                  <div className="card-padded">
                    <div className="section-title">Details</div>
                    {nncp.interface_type === 'linux-bridge' && (
                      <InfoRow label="Port" value={nncp.port || undefined} mono />
                    )}
                    {nncp.interface_type === 'vlan' && (
                      <>
                        <InfoRow label="VLAN ID" value={nncp.vlan_id != null ? String(nncp.vlan_id) : undefined} mono />
                        <InfoRow label="Base Interface" value={nncp.vlan_base_iface || undefined} mono />
                      </>
                    )}
                    <InfoRow label="IPv4 Enabled" value={nncp.ipv4_enabled ? 'Yes' : 'No'} />
                    {nncp.ipv4_enabled && nncp.ipv4_address && (
                      <InfoRow label="IPv4 Address" value={nncp.ipv4_address} mono />
                    )}
                  </div>
                </div>
              )}

              {/* Status Conditions */}
              {activeTab === 'status' && (
                <div className="card">
                  {(() => {
                    const conditions = nncp.raw_manifest?.status?.conditions ?? []
                    if (conditions.length === 0) {
                      return <div className="empty-text">No status conditions available.</div>
                    }
                    const sorted = [...conditions].sort((a: any, b: any) =>
                      (b.lastTransitionTime ?? '').localeCompare(a.lastTransitionTime ?? '')
                    )
                    return (
                      <table className="table">
                        <thead>
                          <tr className="table-header">
                            <th className="table-header-cell">Condition</th>
                            <th className="table-header-cell">Status</th>
                            <th className="table-header-cell">Reason</th>
                            <th className="table-header-cell">Message</th>
                            <th className="table-header-cell">Last Transition</th>
                          </tr>
                        </thead>
                        <tbody>
                          {sorted.map((c: any, i: number) => (
                            <tr key={i} className="table-row" style={i < 8 ? { animation: `fadeInRow 0.3s ease-out both`, animationDelay: `${0.05 + i * 0.04}s` } : undefined}>
                              <td className="table-cell" style={{ fontWeight: 600, color: theme.text.primary, fontSize: 13 }}>
                                {c.type}
                              </td>
                              <td className="table-cell">
                                <span style={{
                                  display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13,
                                  color: c.status === 'True'
                                    ? (c.type === 'Degraded' ? theme.status.error : c.type === 'Progressing' ? theme.status.migrating : theme.status.running)
                                    : theme.text.dim,
                                }}>
                                  <span style={{
                                    width: 7, height: 7, borderRadius: '50%',
                                    background: c.status === 'True'
                                      ? (c.type === 'Degraded' ? theme.status.error : c.type === 'Progressing' ? theme.status.migrating : theme.status.running)
                                      : theme.text.dim,
                                  }} />
                                  {c.status}
                                </span>
                              </td>
                              <td className="table-cell" style={{ color: theme.text.secondary, fontSize: 13 }}>
                                {c.reason || '—'}
                              </td>
                              <td className="table-cell" style={{ color: theme.text.secondary, fontSize: 12, maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={c.message}>
                                {c.message || '—'}
                              </td>
                              <td className="table-cell" style={{ color: theme.text.dim, fontSize: 12, whiteSpace: 'nowrap' }}>
                                {c.lastTransitionTime ? new Date(c.lastTransitionTime).toLocaleString() : '—'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )
                  })()}
                </div>
              )}

              {/* Enactments */}
              {activeTab === 'enactments' && (
                <div className="card">
                  {nncp.enactments && nncp.enactments.length > 0 ? (
                    <table className="table">
                      <thead>
                        <tr className="table-header">
                          <th className="table-header-cell">Node</th>
                          <th className="table-header-cell">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                        {nncp.enactments.map((enactment: any, i: number) => (
                          <tr key={i} className="table-row">
                            <td className="table-cell" style={{ fontWeight: 500, color: theme.text.primary }}>
                              {enactment.node}
                            </td>
                            <td className="table-cell">
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: statusColor[enactment.status] ?? theme.text.dim }}>
                                <span style={{ width: 7, height: 7, borderRadius: '50%', background: statusColor[enactment.status] ?? theme.text.dim }} />
                                {enactment.status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <div className="empty-text">
                      No enactment data available.
                    </div>
                  )}
                </div>
              )}

              {/* YAML */}
              {activeTab === 'yaml' && (
                <YamlViewer resources={[
                  { label: nncp.name, kind: 'NodeNetworkConfigurationPolicy', data: nncp.raw_manifest ?? nncp }
                ]} />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useTemplate } from '@/hooks/useTemplates'
import { theme } from '@/lib/theme'
import { formatMemoryMb } from '@/lib/format'
import { TopBar } from '@/components/layout/TopBar'
import { CardSkeleton } from '@/components/ui/Skeleton'
import { InfoRow } from '@/components/ui/InfoRow'
import { YamlViewer } from '@/components/ui/YamlViewer'

const categoryColor: Record<string, string> = {
  OS: theme.status.provisioning,
  Application: theme.accent,
  Custom: theme.status.migrating,
  Base: theme.status.running,
}

type Tab = 'overview' | 'yaml'

export function TemplateDetailPage() {
  const { namespace, name } = useParams<{ namespace: string; name: string }>()
  const { data, isLoading } = useTemplate(name!, namespace!)
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
          gap: 14,
          flexShrink: 0,
        }}
      >
        <Link to="/templates" className="back-link" style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0, marginBottom: 0 }}>
          &larr; Templates
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
          {data?.display_name || data?.name || name}
        </h1>
        {data?.status && data.status !== 'Ready' && (() => {
          const statusStyles: Record<string, { bg: string; color: string; border: string }> = {
            Importing: { bg: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe' },
            Pending:   { bg: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe' },
            Failed:    { bg: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca' },
          }
          const s = statusStyles[data.status] ?? { bg: theme.main.bg, color: theme.text.secondary, border: `1px solid ${theme.main.cardBorder}` }
          return (
            <span
              className="badge"
              title={data.status_message}
              style={{ background: s.bg, color: s.color, border: s.border }}
            >
              {data.status}
            </span>
          )
        })()}
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
        {isLoading ? (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <CardSkeleton height={200} />
            <CardSkeleton height={200} />
            <CardSkeleton height={150} />
            <CardSkeleton height={150} />
          </div>
        ) : !data ? (
          <div style={{ color: theme.text.secondary, fontSize: 13 }}>Template not found.</div>
        ) : (
          <>
            {/* Overview Tab */}
            {activeTab === 'overview' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {/* Basic Info */}
                <div className="card-padded">
                  <div style={{ fontSize: 14, fontWeight: 600, color: theme.text.heading, marginBottom: 12 }}>Basic Info</div>
                  <InfoRow label="Display Name" value={data.display_name} />
                  <InfoRow label="Name" value={data.name} mono />
                  <InfoRow label="Namespace" value={data.namespace} mono />
                  <InfoRow
                    label="Category"
                    value={
                      data.category ? (
                        <span
                          style={{
                            display: 'inline-block',
                            padding: '2px 10px',
                            borderRadius: 12,
                            fontSize: 12,
                            fontWeight: 500,
                            background: `${categoryColor[data.category] ?? theme.text.secondary}18`,
                            color: categoryColor[data.category] ?? theme.text.secondary,
                            border: `1px solid ${categoryColor[data.category] ?? theme.text.secondary}40`,
                          }}
                        >
                          {data.category}
                        </span>
                      ) : undefined
                    }
                  />
                  <InfoRow label="OS Type" value={data.os_type} />
                  <InfoRow label="Description" value={data.description} />
                  <InfoRow label="Created At" value={data.created_at} />
                </div>

                {/* Compute */}
                <div className="card-padded">
                  <div style={{ fontSize: 14, fontWeight: 600, color: theme.text.heading, marginBottom: 12 }}>Compute</div>
                  <InfoRow label="CPU Cores" value={data.compute?.cpu_cores} />
                  <InfoRow label="Memory" value={data.compute?.memory_mb != null ? formatMemoryMb(data.compute.memory_mb) : undefined} />
                  <InfoRow label="CPU Model" value={data.compute?.cpu_model} />
                  <InfoRow label="Sockets" value={data.compute?.sockets} />
                  <InfoRow label="Threads Per Core" value={data.compute?.threads_per_core} />
                </div>

                {/* Disks */}
                <div className="card-padded">
                  <div style={{ fontSize: 14, fontWeight: 600, color: theme.text.heading, marginBottom: 12 }}>Disks</div>
                  {data.disks && data.disks.length > 0 ? (
                    <table className="table">
                      <thead>
                        <tr className="table-header">
                          <th className="table-header-cell">Name</th>
                          <th className="table-header-cell">Source Type</th>
                          <th className="table-header-cell">Bus</th>
                          <th className="table-header-cell">Size (GB)</th>
                          <th className="table-header-cell">Clone Source</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.disks.map((disk: any, i: number) => (
                          <tr key={i} className="table-row">
                            <td className="table-cell">{disk.name}</td>
                            <td className="table-cell">{disk.source_type ?? '\u2014'}</td>
                            <td className="table-cell">{disk.bus ?? '\u2014'}</td>
                            <td className="table-cell">{disk.size_gb ?? '\u2014'}</td>
                            <td className="table-cell" style={{ fontFamily: theme.typography.mono.fontFamily, fontSize: 12 }}>
                              {disk.clone_source ? (
                                <Link to={`/images/${data.namespace}/${disk.clone_source}`} style={{ color: theme.accent, textDecoration: 'none' }}>{disk.clone_source}</Link>
                              ) : disk.image || '\u2014'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <div style={{ color: theme.text.secondary, fontSize: 13 }}>No disks configured.</div>
                  )}
                </div>

                {/* Networks */}
                <div className="card-padded">
                  <div style={{ fontSize: 14, fontWeight: 600, color: theme.text.heading, marginBottom: 12 }}>Networks</div>
                  {data.networks && data.networks.length > 0 ? (
                    <table className="table">
                      <thead>
                        <tr className="table-header">
                          <th className="table-header-cell">Name</th>
                          <th className="table-header-cell">Network</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.networks.map((net: any, i: number) => (
                          <tr key={i} className="table-row">
                            <td className="table-cell">{net.name}</td>
                            <td className="table-cell" style={{ fontFamily: theme.typography.mono.fontFamily, fontSize: 12 }}>{net.network ?? '\u2014'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <div style={{ color: theme.text.secondary, fontSize: 13 }}>No networks configured.</div>
                  )}
                </div>

                {/* Cloud-Init */}
                {(data.cloud_init_user_data || data.cloud_init_network_data) && (
                  <div className="card-padded">
                    <div style={{ fontSize: 14, fontWeight: 600, color: theme.text.heading, marginBottom: 12 }}>Cloud-Init</div>
                    {data.cloud_init_user_data && (
                      <div style={{ marginBottom: data.cloud_init_network_data ? 16 : 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 500, color: theme.text.secondary, marginBottom: 8 }}>User Data</div>
                        <pre className="code-block">
                          {data.cloud_init_user_data}
                        </pre>
                      </div>
                    )}
                    {data.cloud_init_network_data && (
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 500, color: theme.text.secondary, marginBottom: 8 }}>Network Data</div>
                        <pre className="code-block">
                          {data.cloud_init_network_data}
                        </pre>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* YAML Tab */}
            {activeTab === 'yaml' && (
              <YamlViewer resources={[
                { label: data.name, kind: 'Template', data: data.raw_manifest ?? data }
              ]} />
            )}
          </>
        )}
      </div>
    </div>
  )
}

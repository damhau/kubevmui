import { useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import apiClient from '@/lib/api-client'
import { useUIStore } from '@/stores/ui-store'
import { useVMAction } from '@/hooks/useVMs'
import { theme } from '@/lib/theme'

const statusBadge: Record<string, { bg: string; color: string; border: string }> = {
  Running:      { bg: '#ecfdf5', color: '#16a34a', border: '1px solid #bbf7d0' },
  Stopped:      { bg: '#f4f4f5', color: '#52525b', border: '1px solid #d4d4d8' },
  Error:        { bg: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca' },
  Migrating:    { bg: '#fffbeb', color: '#d97706', border: '1px solid #fde68a' },
  Provisioning: { bg: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe' },
}

function StatusBadge({ status }: { status: string }) {
  const s = statusBadge[status]
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '3px 10px',
        borderRadius: 12,
        fontSize: 12,
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

type Tab = 'overview' | 'events' | 'yaml'

function InfoRow({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        padding: '10px 0',
        borderBottom: `1px solid ${theme.main.tableRowBorder}`,
        gap: 16,
      }}
    >
      <span style={{ minWidth: 160, fontSize: 12, color: theme.text.secondary, fontWeight: 500, flexShrink: 0 }}>{label}</span>
      <span
        style={{
          fontSize: 14,
          fontWeight: 500,
          color: theme.text.primary,
          fontFamily: mono ? "'JetBrains Mono', 'Fira Code', 'Consolas', monospace" : 'inherit',
        }}
      >
        {value ?? '—'}
      </span>
    </div>
  )
}

export function VMDetailPage() {
  const { namespace, name } = useParams<{ namespace: string; name: string }>()
  const navigate = useNavigate()
  const { activeCluster } = useUIStore()
  const vmAction = useVMAction()
  const [activeTab, setActiveTab] = useState<Tab>('overview')

  const { data: vm, isLoading } = useQuery({
    queryKey: ['vm', activeCluster, namespace, name],
    queryFn: async () => {
      const { data } = await apiClient.get(
        `/clusters/${activeCluster}/namespaces/${namespace}/vms/${name}`,
      )
      return data
    },
    enabled: !!(namespace && name),
  })

  const handleAction = (action: string) => {
    if (!namespace || !name) return
    if (action === 'delete') {
      if (!window.confirm(`Delete VM "${name}"?`)) return
      vmAction.mutate(
        { namespace, name, action },
        { onSuccess: () => navigate('/vms') },
      )
      return
    }
    if (action === 'console') {
      navigate(`/vms/${namespace}/${name}/console`)
      return
    }
    vmAction.mutate({ namespace, name, action })
  }

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
          <Link
            to="/vms"
            style={{
              color: theme.text.secondary,
              textDecoration: 'none',
              fontSize: 13,
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              flexShrink: 0,
            }}
          >
            ← VMs
          </Link>
          <h1
            style={{
              margin: 0,
              fontSize: 20,
              fontWeight: 700,
              color: theme.text.heading,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {name}
          </h1>
          {vm?.status && (
            <StatusBadge status={vm.status} />
          )}
        </div>

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
          {[
            { label: vm?.status === 'Running' ? 'Stop' : 'Start', action: vm?.status === 'Running' ? 'stop' : 'start' },
            { label: 'Restart', action: 'restart' },
            { label: 'Console', action: 'console' },
            { label: 'Delete', action: 'delete', danger: true },
          ].map((btn) => (
            <button
              key={btn.action}
              onClick={() => handleAction(btn.action)}
              style={{
                background: btn.danger ? 'rgba(239,68,68,0.08)' : theme.main.card,
                color: btn.danger ? theme.status.error : theme.text.primary,
                border: `1px solid ${btn.danger ? 'rgba(239,68,68,0.3)' : theme.main.inputBorder}`,
                borderRadius: theme.radius.md,
                padding: '6px 12px',
                fontSize: 12,
                cursor: 'pointer',
                fontFamily: 'inherit',
                fontWeight: 500,
              }}
            >
              {btn.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div
        style={{
          display: 'flex',
          gap: 0,
          background: theme.main.card,
          borderBottom: `1px solid ${theme.main.cardBorder}`,
          padding: '0 24px',
          flexShrink: 0,
        }}
      >
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              background: 'transparent',
              border: 'none',
              borderBottom: activeTab === tab.id ? `2px solid ${theme.accent}` : '2px solid transparent',
              color: activeTab === tab.id ? theme.text.primary : theme.text.secondary,
              cursor: 'pointer',
              padding: '10px 16px',
              fontSize: 13,
              fontWeight: activeTab === tab.id ? 600 : 400,
              fontFamily: 'inherit',
              marginBottom: -1,
              transition: 'color 0.12s',
              textTransform: activeTab === tab.id ? 'uppercase' : 'none',
              letterSpacing: activeTab === tab.id ? '0.05em' : 'normal',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
        {isLoading ? (
          <div style={{ color: theme.text.secondary, fontSize: 13 }}>Loading VM details...</div>
        ) : !vm ? (
          <div style={{ color: theme.text.secondary, fontSize: 13 }}>VM not found.</div>
        ) : (
          <>
            {/* Overview */}
            {activeTab === 'overview' && (
              <div
                style={{
                  background: theme.main.card,
                  border: `1px solid ${theme.main.cardBorder}`,
                  borderRadius: theme.radius.lg,
                  padding: '4px 20px',
                }}
              >
                <InfoRow label="Namespace" value={namespace} />
                <InfoRow label="Status" value={<StatusBadge status={vm.status} />} />
                <InfoRow label="CPU Cores" value={`${vm.cpu ?? '—'} vCPU`} />
                <InfoRow label="Memory" value={vm.memory} />
                <InfoRow label="Node" value={vm.node} mono />
                <InfoRow label="IP Addresses" value={
                  vm.ip_addresses?.length
                    ? vm.ip_addresses.join(', ')
                    : vm.ip ?? '—'
                } mono />
                <InfoRow label="OS Type" value={vm.os_type ?? vm.os} />
                <InfoRow label="Run Strategy" value={vm.run_strategy} />
                <InfoRow label="Creation Time" value={vm.created_at ?? vm.creation_timestamp} />
                {vm.labels && Object.keys(vm.labels).length > 0 && (
                  <InfoRow
                    label="Labels"
                    value={
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {Object.entries(vm.labels).map(([k, v]) => (
                          <span
                            key={k}
                            style={{
                              background: theme.main.bg,
                              border: `1px solid ${theme.main.inputBorder}`,
                              borderRadius: theme.radius.sm,
                              padding: '2px 7px',
                              fontSize: 11,
                              color: theme.text.secondary,
                              fontFamily: 'monospace',
                            }}
                          >
                            {k}={String(v)}
                          </span>
                        ))}
                      </div>
                    }
                  />
                )}
              </div>
            )}

            {/* Events */}
            {activeTab === 'events' && (
              <div
                style={{
                  background: theme.main.card,
                  border: `1px solid ${theme.main.cardBorder}`,
                  borderRadius: theme.radius.lg,
                }}
              >
                {vm.events?.length ? (
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ background: theme.main.tableHeaderBg, borderBottom: `1px solid ${theme.main.tableRowBorder}` }}>
                        {['Time', 'Type', 'Reason', 'Message'].map((col) => (
                          <th
                            key={col}
                            style={{
                              padding: '10px 16px',
                              textAlign: 'left',
                              color: theme.text.secondary,
                              fontWeight: 500,
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
                      {vm.events.map((evt: { timestamp: string; type: string; reason: string; message: string }, i: number) => (
                        <tr key={i} style={{ borderBottom: `1px solid ${theme.main.tableRowBorder}` }}>
                          <td style={{ padding: '10px 16px', color: theme.text.secondary, fontSize: 12, whiteSpace: 'nowrap' }}>
                            {evt.timestamp}
                          </td>
                          <td style={{ padding: '10px 16px' }}>
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
                          <td style={{ padding: '10px 16px', color: theme.text.secondary }}>{evt.reason}</td>
                          <td style={{ padding: '10px 16px', color: theme.text.primary }}>{evt.message}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div style={{ padding: 40, textAlign: 'center', color: theme.text.secondary, fontSize: 13 }}>
                    No events found for this VM.
                  </div>
                )}
              </div>
            )}

            {/* YAML */}
            {activeTab === 'yaml' && (
              <pre
                style={{
                  background: theme.main.card,
                  border: `1px solid ${theme.main.cardBorder}`,
                  borderRadius: theme.radius.lg,
                  padding: 20,
                  fontSize: 12,
                  fontFamily: 'monospace',
                  color: theme.text.primary,
                  overflow: 'auto',
                  margin: 0,
                  lineHeight: 1.6,
                }}
              >
                {JSON.stringify(vm, null, 2)}
              </pre>
            )}
          </>
        )}
      </div>
    </div>
  )
}

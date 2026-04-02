import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNetworkCR } from '@/hooks/useNetworkCRs'
import { useUIStore } from '@/stores/ui-store'
import apiClient, { extractErrorMessage } from '@/lib/api-client'
import { theme } from '@/lib/theme'
import { CardSkeleton } from '@/components/ui/Skeleton'
import { InfoRow } from '@/components/ui/InfoRow'
import { YamlViewer } from '@/components/ui/YamlViewer'
import { DropdownMenu } from '@/components/ui/DropdownMenu'
import { ConfirmModal } from '@/components/ui/ConfirmModal'
import { Modal } from '@/components/ui/Modal'
import { toast } from '@/components/ui/Toast'

type Tab = 'overview' | 'nads' | 'yaml'

interface NadEntry {
  name: string
  namespace: string
  created_at: string | null
  raw_manifest: Record<string, unknown> | null
}

const typeColor: Record<string, string> = {
  bridge: theme.status.running,
  masquerade: theme.status.provisioning,
  pod: theme.accent,
  multus: theme.status.running,
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

function useNetworkCRNads(name: string) {
  const { activeCluster } = useUIStore()
  return useQuery({
    queryKey: ['network-cr-nads', activeCluster, name],
    queryFn: async () => {
      const { data } = await apiClient.get(
        `/clusters/${activeCluster}/network-crs/${name}/nads`
      )
      return data as NadEntry[]
    },
    enabled: !!name,
  })
}

function useDeleteNad(networkCRName: string) {
  const queryClient = useQueryClient()
  const { activeCluster } = useUIStore()
  return useMutation({
    mutationFn: async ({ namespace, nadName }: { namespace: string; nadName: string }) => {
      await apiClient.delete(
        `/clusters/${activeCluster}/network-crs/${networkCRName}/nads/${namespace}/${nadName}`
      )
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['network-cr-nads'] })
    },
  })
}

export function NetworkCRDetailPage() {
  const { name } = useParams<{ name: string }>()
  const { data, isLoading } = useNetworkCR(name!)
  const { data: nads, isLoading: nadsLoading } = useNetworkCRNads(name!)
  const deleteNad = useDeleteNad(name!)
  const [activeTab, setActiveTab] = useState<Tab>('overview')
  const [viewingNad, setViewingNad] = useState<NadEntry | null>(null)
  const [confirmAction, setConfirmAction] = useState<{
    title: string; message: string; danger?: boolean; confirmLabel?: string; onConfirm: () => void
  } | null>(null)

  const tabs: { id: Tab; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'nads', label: `NADs${nads ? ` (${nads.length})` : ''}` },
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
            &larr; Networks
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
            <div style={{ color: theme.text.secondary, fontSize: 13 }}>Network CR not found.</div>
          ) : (
            <>
              {activeTab === 'overview' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, animation: 'fadeInUp 0.35s ease-out both' }}>
                  {/* Basic Info */}
                  <div className="card-padded">
                    <div className="section-title">Basic Info</div>
                    <InfoRow label="Display Name" value={data.display_name} />
                    <InfoRow label="Name" value={data.name} mono />
                    <InfoRow label="Created At" value={data.created_at ? new Date(data.created_at).toLocaleString() : undefined} />
                    <InfoRow label="Description" value={data.description || undefined} />
                  </div>

                  {/* Configuration */}
                  <div className="card-padded">
                    <div className="section-title">Configuration</div>
                    <InfoRow
                      label="Network Type"
                      value={
                        <Badge label={data.network_type} color={typeColor[data.network_type] ?? theme.text.dim} />
                      }
                    />
                    <InfoRow
                      label="Interface Type"
                      value={
                        <Badge label={data.interface_type} color={typeColor[data.interface_type] ?? theme.text.dim} />
                      }
                    />
                    {data.bridge_name && (
                      <InfoRow label="Bridge Name" value={data.bridge_name} mono />
                    )}
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
                    <InfoRow
                      label="MAC Spoof Check"
                      value={
                        <span style={{ color: data.mac_spoof_check ? theme.status.running : theme.text.secondary }}>
                          {data.mac_spoof_check ? 'Enabled' : 'Disabled'}
                        </span>
                      }
                    />
                  </div>
                </div>
              )}

              {activeTab === 'nads' && (
                <div className="card">
                  {nadsLoading ? (
                    <div style={{ padding: 20 }}>
                      <CardSkeleton height={100} />
                    </div>
                  ) : nads && nads.length > 0 ? (
                    <table className="table">
                      <thead>
                        <tr className="table-header">
                          {['Name', 'Namespace', 'Created', 'Actions'].map((col) => (
                            <th key={col} className="table-header-cell">{col}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {nads.map((nad) => (
                          <tr key={`${nad.namespace}/${nad.name}`} className="table-row">
                            <td className="table-cell" style={{ fontWeight: 500, color: theme.text.primary }}>
                              {nad.name}
                            </td>
                            <td className="table-cell">
                              <span style={{
                                display: 'inline-block',
                                padding: '2px 8px',
                                borderRadius: theme.radius.sm,
                                fontSize: 11,
                                fontWeight: 500,
                                background: `${theme.accent}14`,
                                color: theme.accent,
                                border: `1px solid ${theme.accent}40`,
                              }}>
                                {nad.namespace}
                              </span>
                            </td>
                            <td className="table-cell" style={{ color: theme.text.secondary, fontSize: 12 }}>
                              {nad.created_at ? new Date(nad.created_at).toLocaleString() : '—'}
                            </td>
                            <td className="table-cell" style={{ position: 'relative', zIndex: 10 }} onClick={(e) => e.stopPropagation()}>
                              <DropdownMenu
                                actions={[
                                  { label: 'View YAML', action: 'view' },
                                  { label: 'Delete', action: 'delete', danger: true },
                                ]}
                                onAction={(action) => {
                                  if (action === 'view') {
                                    setViewingNad(nad)
                                  } else if (action === 'delete') {
                                    setConfirmAction({
                                      title: 'Delete NAD',
                                      message: `Delete NAD "${nad.name}" from namespace "${nad.namespace}"?`,
                                      danger: true,
                                      confirmLabel: 'Delete',
                                      onConfirm: () => {
                                        deleteNad.mutate(
                                          { namespace: nad.namespace, nadName: nad.name },
                                          {
                                            onSuccess: () => toast.success(`NAD "${nad.name}" deleted from ${nad.namespace}`),
                                            onError: (err) => toast.error(extractErrorMessage(err, 'Failed to delete NAD')),
                                          },
                                        )
                                        setConfirmAction(null)
                                      },
                                    })
                                  }
                                }}
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <div className="empty-text">
                      No NADs have been generated yet. NADs are created automatically when a VM using this network is deployed to a namespace.
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'yaml' && (
                <YamlViewer resources={[
                  { label: data.name, kind: 'Network', data: data.raw_manifest ?? data }
                ]} />
              )}
            </>
          )}
        </div>
      </div>

      {/* NAD YAML viewer modal */}
      <Modal
        open={!!viewingNad}
        onClose={() => setViewingNad(null)}
        title={viewingNad ? `${viewingNad.name} (${viewingNad.namespace})` : ''}
        maxWidth={700}
      >
        {viewingNad?.raw_manifest && (
          <YamlViewer resources={[
            { label: viewingNad.name, kind: 'NetworkAttachmentDefinition', data: viewingNad.raw_manifest }
          ]} />
        )}
      </Modal>

      {/* Confirm modal */}
      <ConfirmModal
        open={!!confirmAction}
        title={confirmAction?.title ?? ''}
        message={confirmAction?.message ?? ''}
        danger={confirmAction?.danger}
        confirmLabel={confirmAction?.confirmLabel}
        onConfirm={() => confirmAction?.onConfirm()}
        onCancel={() => setConfirmAction(null)}
      />
    </div>
  )
}

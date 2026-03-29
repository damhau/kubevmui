import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { TopBar } from '@/components/layout/TopBar'
import { useNetworks, useCreateNetwork, useDeleteNetwork } from '@/hooks/useNetworks'
import { useNNCPs, useCreateNNCP, useDeleteNNCP, useAvailableBridges, useNodeInterfaces } from '@/hooks/useNMState'
import { useUIStore } from '@/stores/ui-store'
import { theme } from '@/lib/theme'
import { Modal } from '@/components/ui/Modal'
import { ConfirmModal } from '@/components/ui/ConfirmModal'
import { toast } from '@/components/ui/Toast'
import { YamlPreview } from '@/components/ui/YamlPreview'
import { EmptyState } from '@/components/ui/EmptyState'
import { TableSkeleton } from '@/components/ui/Skeleton'
import { Network } from 'lucide-react'
import { DropdownMenu } from '@/components/ui/DropdownMenu'
import { useSortable } from '@/hooks/useSortable'

const nncpStatusColor: Record<string, string> = {
  Available: theme.status.running,
  Progressing: theme.status.migrating,
  Degraded: theme.status.error,
  Unknown: theme.text.dim,
}

const nncpTypeColor: Record<string, string> = {
  'linux-bridge': theme.status.running,
  'vlan': theme.status.provisioning,
}

const typeColor: Record<string, string> = {
  bridge: theme.status.running,
  masquerade: theme.status.provisioning,
  'sr-iov': theme.status.migrating,
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
interface NNCP { name: string; interface_name?: string; type?: string; port?: string; vlan_id?: number | null; status?: string; status_conditions?: any[] }
interface NetworkProfile {
  name: string
  namespace?: string
  display_name?: string
  network_type?: string
  vlan_id?: number | null
  dhcp_enabled?: boolean
  subnet?: string
}

interface NNCPForm {
  interface_name: string
  name: string
  type: 'linux-bridge' | 'vlan'
  port: string
  vlan_id: string
  ipv4_enabled: boolean
  ipv4_address: string
  description: string
}

interface NetworkForm {
  display_name: string
  name: string
  type: string
  bridge_name: string
  vlan_id: string
  dhcp: boolean
  subnet: string
  gateway: string
}

export function NetworksPage() {
  const navigate = useNavigate()
  const { activeCluster, activeNamespace } = useUIStore()

  // Tab state
  const [activeTab, setActiveTab] = useState<'interfaces' | 'networks'>('interfaces')

  // --- Interfaces ---
  const { data: nncpData, isLoading: nncpLoading } = useNNCPs()
  const createNNCP = useCreateNNCP()
  const deleteNNCP = useDeleteNNCP()
  const { data: nodeInterfacesData } = useNodeInterfaces()
  const nncps: NNCP[] = Array.isArray(nncpData?.items) ? nncpData.items : Array.isArray(nncpData) ? nncpData : []
  const { sorted: sortedNNCPs, sortConfig: nncpSortConfig, requestSort: requestNNCPSort } = useSortable(nncps, { column: 'name', direction: 'asc' })

  const [showCreateNNCP, setShowCreateNNCP] = useState(false)
  const [nncpForm, setNncpForm] = useState<NNCPForm>({
    interface_name: '',
    name: '',
    type: 'linux-bridge',
    port: '',
    vlan_id: '',
    ipv4_enabled: false,
    ipv4_address: '',
    description: '',
  })
  const [deleteNNCPTarget, setDeleteNNCPTarget] = useState<string | null>(null)

  // --- Networks ---
  const { data: netData, isLoading: netLoading } = useNetworks()
  const createNetwork = useCreateNetwork()
  const deleteNetwork = useDeleteNetwork()
  const { data: bridgesData } = useAvailableBridges()
  const networks: NetworkProfile[] = Array.isArray(netData?.items) ? netData.items : Array.isArray(netData) ? netData : []
  const { sorted: sortedNetworks, sortConfig: netSortConfig, requestSort: requestNetSort } = useSortable(networks, { column: 'name', direction: 'asc' })

  const [showCreateNetwork, setShowCreateNetwork] = useState(false)
  const [netForm, setNetForm] = useState<NetworkForm>({
    display_name: '',
    name: '',
    type: 'bridge',
    bridge_name: '',
    vlan_id: '',
    dhcp: true,
    subnet: '',
    gateway: '',
  })
  const [netError, setNetError] = useState<string | null>(null)

  // Available ethernet interfaces from nodes
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const nodeInterfaces: any[] = Array.isArray(nodeInterfacesData?.items) ? nodeInterfacesData.items : []
  const usedPorts = new Set(nncps.filter((n: any) => n.port).map((n: any) => n.port))
  const ethernetInterfaces = nodeInterfaces.filter((iface: { type?: string; name?: string }) => iface.type === 'ethernet' && !usedPorts.has(iface.name))

  // Available bridges
  const bridges: Array<{ name: string; nodes: string[] }> = Array.isArray(bridgesData?.items) ? bridgesData.items : []

  const inputStyle: React.CSSProperties = {
    width: '100%',
    background: theme.main.inputBg,
    border: `1px solid ${theme.main.inputBorder}`,
    borderRadius: theme.radius.md,
    color: theme.text.primary,
    fontSize: 13,
    padding: '8px 12px',
    outline: 'none',
    fontFamily: 'inherit',
    boxSizing: 'border-box',
  }

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: 12,
    color: theme.text.secondary,
    marginBottom: 6,
    fontWeight: 500,
  }

  // --- NNCP handlers ---
  const handleNNCPInterfaceNameChange = (val: string) => {
    setNncpForm((f) => ({
      ...f,
      interface_name: val,
      name: val.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, ''),
    }))
  }

  const handleNNCPSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    createNNCP.mutate(
      {
        ...nncpForm,
        vlan_id: nncpForm.vlan_id === '' ? null : Number(nncpForm.vlan_id),
      },
      {
        onSuccess: () => {
          setShowCreateNNCP(false)
          setNncpForm({ interface_name: '', name: '', type: 'linux-bridge', port: '', vlan_id: '', ipv4_enabled: false, ipv4_address: '', description: '' })
          toast.success('Interface created successfully')
        },
        onError: (err: unknown) => {
          const e = err as { message?: string }
          toast.error(e.message ?? 'Failed to create interface')
        },
      },
    )
  }

  const handleDeleteNNCP = () => {
    if (!deleteNNCPTarget) return
    deleteNNCP.mutate(deleteNNCPTarget, {
      onSuccess: () => {
        toast.success(`Interface "${deleteNNCPTarget}" deleted`)
        setDeleteNNCPTarget(null)
      },
      onError: (err: unknown) => {
        const e = err as { message?: string }
        toast.error(e.message ?? 'Failed to delete interface')
        setDeleteNNCPTarget(null)
      },
    })
  }

  // --- Network handlers ---
  const handleDisplayNameChange = (val: string) => {
    setNetForm((f) => ({
      ...f,
      display_name: val,
      name: val.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, ''),
    }))
  }

  const handleNetworkSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setNetError(null)
    const payload = {
      display_name: netForm.display_name,
      name: netForm.name,
      network_type: netForm.type,
      bridge_name: netForm.bridge_name,
      vlan_id: netForm.vlan_id === '' ? null : Number(netForm.vlan_id),
      dhcp_enabled: netForm.dhcp,
      subnet: netForm.subnet || null,
      gateway: netForm.gateway || null,
    }
    createNetwork.mutate(payload, {
      onSuccess: () => {
        setShowCreateNetwork(false)
        setNetForm({ display_name: '', name: '', type: 'bridge', bridge_name: '', vlan_id: '', dhcp: true, subnet: '', gateway: '' })
        toast.success('Network profile created successfully')
      },
      onError: (err: unknown) => {
        const e = err as { message?: string }
        setNetError(e.message ?? 'Failed to create network profile')
      },
    })
  }

  const handleDeleteNetwork = (name: string) => {
    if (!confirm(`Delete network profile "${name}"?`)) return
    deleteNetwork.mutate(name, {
      onSuccess: () => toast.success(`Network "${name}" deleted`),
      onError: (err: unknown) => {
        const e = err as { message?: string }
        toast.error(e.message ?? 'Failed to delete network')
      },
    })
  }

  const showNamespaceCol = activeNamespace === '_all'

  const getNNCPStatus = (nncp: NNCP) => {
    const s = nncp.status ?? 'Unknown'
    return { label: s, color: nncpStatusColor[s] ?? nncpStatusColor['Unknown'] }
  }

  const tabStyle = (active: boolean): React.CSSProperties => ({
    padding: '8px 16px',
    fontSize: 13,
    fontWeight: 600,
    color: active ? theme.accent : theme.text.secondary,
    background: 'transparent',
    border: 'none',
    borderBottom: active ? `2px solid ${theme.accent}` : '2px solid transparent',
    cursor: 'pointer',
    fontFamily: 'inherit',
    transition: 'color 0.15s, border-color 0.15s',
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <TopBar
        title="Networks"
        action={
          activeTab === 'interfaces' ? (
            <button
              onClick={() => { setShowCreateNNCP(true) }}
              style={{
                background: theme.button.primary,
                color: theme.button.primaryText,
                border: 'none',
                borderRadius: theme.radius.md,
                padding: '7px 14px',
                fontSize: 13,
                fontWeight: 500,
                cursor: 'pointer',
                fontFamily: 'inherit',
                whiteSpace: 'nowrap',
              }}
            >
              + New Interface
            </button>
          ) : (
            <button
              onClick={() => { setShowCreateNetwork(true); setNetError(null) }}
              style={{
                background: theme.button.primary,
                color: theme.button.primaryText,
                border: 'none',
                borderRadius: theme.radius.md,
                padding: '7px 14px',
                fontSize: 13,
                fontWeight: 500,
                cursor: 'pointer',
                fontFamily: 'inherit',
                whiteSpace: 'nowrap',
              }}
            >
              + New Network Profile
            </button>
          )
        }
      />

      {/* Tab bar */}
      <div
        style={{
          display: 'flex',
          gap: 0,
          padding: '0 24px',
          background: theme.topBar.bg,
          borderBottom: `1px solid ${theme.topBar.border}`,
        }}
      >
        <button style={tabStyle(activeTab === 'interfaces')} onClick={() => setActiveTab('interfaces')}>
          Interfaces
        </button>
        <button style={tabStyle(activeTab === 'networks')} onClick={() => setActiveTab('networks')}>
          Networks
        </button>
      </div>

      <div className="page-content" style={{ animation: 'fadeInUp 0.35s ease-out' }}>
        <div className="page-container">
          {/* ======================== INTERFACES TAB ======================== */}
          {activeTab === 'interfaces' && (
            <div className="card">
              {nncpLoading ? (
                <TableSkeleton rows={3} cols={6} />
              ) : nncps.length === 0 ? (
                <EmptyState
                  icon={<Network size={24} />}
                  title="No Interfaces"
                  description="Create NMState node network configuration policies to manage host interfaces."
                />
              ) : (
                <table className="table">
                  <thead>
                    <tr className="table-header">
                      <th className={`table-header-cell-sortable${nncpSortConfig.column === 'name' ? ' active' : ''}`} onClick={() => requestNNCPSort('name')}>
                        Name{nncpSortConfig.column === 'name' ? (nncpSortConfig.direction === 'asc' ? ' ↑' : ' ↓') : ''}
                      </th>
                      <th className={`table-header-cell-sortable${nncpSortConfig.column === 'interface_name' ? ' active' : ''}`} onClick={() => requestNNCPSort('interface_name')}>
                        Interface{nncpSortConfig.column === 'interface_name' ? (nncpSortConfig.direction === 'asc' ? ' ↑' : ' ↓') : ''}
                      </th>
                      <th className={`table-header-cell-sortable${nncpSortConfig.column === 'type' ? ' active' : ''}`} onClick={() => requestNNCPSort('type')}>
                        Type{nncpSortConfig.column === 'type' ? (nncpSortConfig.direction === 'asc' ? ' ↑' : ' ↓') : ''}
                      </th>
                      <th className={`table-header-cell-sortable${nncpSortConfig.column === 'port' ? ' active' : ''}`} onClick={() => requestNNCPSort('port')}>
                        Port / VLAN{nncpSortConfig.column === 'port' ? (nncpSortConfig.direction === 'asc' ? ' ↑' : ' ↓') : ''}
                      </th>
                      <th className={`table-header-cell-sortable${nncpSortConfig.column === 'status' ? ' active' : ''}`} onClick={() => requestNNCPSort('status')}>
                        Status{nncpSortConfig.column === 'status' ? (nncpSortConfig.direction === 'asc' ? ' ↑' : ' ↓') : ''}
                      </th>
                      <th className="table-header-cell">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedNNCPs.map((nncp, i) => {
                      const st = getNNCPStatus(nncp)
                      return (
                        <tr
                          key={nncp.name}
                          className="table-row-clickable"
                          onClick={() => navigate(`/networks/interfaces/${nncp.name}`)}
                          style={i < 8 ? {
                            animation: `fadeInRow 0.3s ease-out both`,
                            animationDelay: `${0.05 + i * 0.04}s`,
                          } : undefined}
                        >
                          <td className="table-cell">
                            <div style={{ color: theme.text.primary, fontWeight: 500, fontSize: 14 }}>{nncp.name}</div>
                          </td>
                          <td className="table-cell" style={{ color: theme.text.secondary, fontFamily: theme.typography.mono.fontFamily, fontSize: 13 }}>
                            {nncp.interface_name ?? '—'}
                          </td>
                          <td className="table-cell">
                            {nncp.interface_type ? (
                              <Badge label={nncp.interface_type} color={nncpTypeColor[nncp.interface_type] ?? theme.text.dim} />
                            ) : (
                              <span style={{ color: theme.text.dim }}>—</span>
                            )}
                          </td>
                          <td className="table-cell" style={{ color: theme.text.secondary, fontFamily: theme.typography.mono.fontFamily, fontSize: 13 }}>
                            {nncp.port ?? '—'}
                            {nncp.vlan_id != null && ` / VLAN ${nncp.vlan_id}`}
                          </td>
                          <td className="table-cell">
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: st.color }}>
                              <span style={{ width: 7, height: 7, borderRadius: '50%', background: st.color, flexShrink: 0 }} />
                              {st.label}
                              {nncp.enactments?.length > 0 && (
                                <span style={{ fontSize: 11, color: theme.text.secondary }}>
                                  ({nncp.enactments.filter((e: any) => e.status === 'Available').length}/{nncp.enactments.length})
                                </span>
                              )}
                            </span>
                          </td>
                          <td className="table-cell" style={{ position: 'relative', zIndex: 10 }}>
                            <DropdownMenu
                              actions={[{ label: 'Delete', action: 'delete', danger: true }]}
                              onAction={(action) => {
                                if (action === 'delete') setDeleteNNCPTarget(nncp.name)
                              }}
                            />
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* ======================== NETWORKS TAB ======================== */}
          {activeTab === 'networks' && (
            <>
              {/* Pod Network info bar */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '10px 16px',
                  background: theme.main.card,
                  border: `1px solid ${theme.main.cardBorder}`,
                  borderRadius: theme.radius.md,
                  marginBottom: 16,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Network size={14} style={{ color: theme.text.dim }} />
                  <span style={{ color: theme.text.primary, fontSize: 13, fontWeight: 500 }}>Pod Network</span>
                  <span style={{ color: theme.text.dim, fontSize: 12 }}>Default Kubernetes pod network (masquerade)</span>
                </div>
                <Badge label="Always Available" color={theme.status.running} />
              </div>

              <div className="card">
                {netLoading ? (
                  <TableSkeleton rows={3} cols={showNamespaceCol ? 7 : 6} />
                ) : networks.length === 0 ? (
                  <EmptyState
                    icon={<Network size={24} />}
                    title="No Network Profiles"
                    description="Create network profiles to configure VM networking."
                  />
                ) : (
                  <table className="table">
                    <thead>
                      <tr className="table-header">
                        <th className={`table-header-cell-sortable${netSortConfig.column === 'name' ? ' active' : ''}`} onClick={() => requestNetSort('name')}>
                          Name{netSortConfig.column === 'name' ? (netSortConfig.direction === 'asc' ? ' ↑' : ' ↓') : ''}
                        </th>
                        {showNamespaceCol && (
                          <th className={`table-header-cell-sortable${netSortConfig.column === 'namespace' ? ' active' : ''}`} onClick={() => requestNetSort('namespace')}>
                            Namespace{netSortConfig.column === 'namespace' ? (netSortConfig.direction === 'asc' ? ' ↑' : ' ↓') : ''}
                          </th>
                        )}
                        <th className={`table-header-cell-sortable${netSortConfig.column === 'network_type' ? ' active' : ''}`} onClick={() => requestNetSort('network_type')}>
                          Type{netSortConfig.column === 'network_type' ? (netSortConfig.direction === 'asc' ? ' ↑' : ' ↓') : ''}
                        </th>
                        <th className={`table-header-cell-sortable${netSortConfig.column === 'vlan_id' ? ' active' : ''}`} onClick={() => requestNetSort('vlan_id')}>
                          VLAN ID{netSortConfig.column === 'vlan_id' ? (netSortConfig.direction === 'asc' ? ' ↑' : ' ↓') : ''}
                        </th>
                        <th className={`table-header-cell-sortable${netSortConfig.column === 'dhcp_enabled' ? ' active' : ''}`} onClick={() => requestNetSort('dhcp_enabled')}>
                          DHCP{netSortConfig.column === 'dhcp_enabled' ? (netSortConfig.direction === 'asc' ? ' ↑' : ' ↓') : ''}
                        </th>
                        <th className={`table-header-cell-sortable${netSortConfig.column === 'subnet' ? ' active' : ''}`} onClick={() => requestNetSort('subnet')}>
                          Subnet{netSortConfig.column === 'subnet' ? (netSortConfig.direction === 'asc' ? ' ↑' : ' ↓') : ''}
                        </th>
                        <th className="table-header-cell">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedNetworks.map((net, i) => (
                        <tr
                          key={`${net.namespace ?? activeNamespace}-${net.name}`}
                          className="table-row-clickable"
                          onClick={() => navigate(`/networks/${net.namespace ?? activeNamespace}/${net.name}`)}
                          style={i < 8 ? {
                            animation: `fadeInRow 0.3s ease-out both`,
                            animationDelay: `${0.05 + i * 0.04}s`,
                          } : undefined}
                        >
                          <td className="table-cell">
                            <div style={{ color: theme.text.primary, fontWeight: 500, fontSize: 14 }}>{net.display_name ?? net.name}</div>
                            {net.display_name && (
                              <div style={{ color: theme.text.dim, fontSize: 11, marginTop: 2, fontFamily: theme.typography.mono.fontFamily }}>{net.name}</div>
                            )}
                          </td>
                          {showNamespaceCol && (
                            <td className="table-cell">
                              <Badge label={net.namespace ?? '—'} color={theme.accent} />
                            </td>
                          )}
                          <td className="table-cell">
                            {net.network_type ? (
                              <Badge label={net.network_type} color={typeColor[net.network_type] ?? theme.text.dim} />
                            ) : (
                              <span style={{ color: theme.text.dim }}>—</span>
                            )}
                          </td>
                          <td className="table-cell" style={{ color: theme.text.secondary, fontSize: 13, fontFamily: theme.typography.mono.fontFamily }}>
                            {net.vlan_id ?? '—'}
                          </td>
                          <td className="table-cell">
                            <span style={{ color: net.dhcp_enabled ? theme.status.running : theme.text.secondary, fontSize: 13 }}>
                              {net.dhcp_enabled === undefined ? '—' : net.dhcp_enabled ? 'Yes' : 'No'}
                            </span>
                          </td>
                          <td className="table-cell" style={{ color: theme.text.secondary, fontFamily: theme.typography.mono.fontFamily, fontSize: 13 }}>
                            {net.subnet ?? '—'}
                          </td>
                          <td className="table-cell" style={{ position: 'relative', zIndex: 10 }}>
                            <DropdownMenu
                              actions={[{ label: 'Delete', action: 'delete', danger: true }]}
                              onAction={(action) => {
                                if (action === 'delete') handleDeleteNetwork(net.name)
                              }}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ======================== CREATE NNCP MODAL ======================== */}
      <Modal open={showCreateNNCP} onClose={() => setShowCreateNNCP(false)} title="New Interface">
        <form onSubmit={handleNNCPSubmit}>
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Interface Name</label>
            <input
              type="text"
              value={nncpForm.interface_name}
              onChange={(e) => handleNNCPInterfaceNameChange(e.target.value)}
              placeholder="e.g. br-lan"
              style={inputStyle}
            />
            {nncpForm.name && (
              <div style={{ color: theme.text.dim, fontSize: 11, marginTop: 4, fontFamily: theme.typography.mono.fontFamily }}>
                NNCP name: {nncpForm.name}
              </div>
            )}
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Type</label>
            <div style={{ display: 'flex', gap: 0, borderRadius: theme.radius.md, overflow: 'hidden', border: `1px solid ${theme.main.inputBorder}` }}>
              {(['linux-bridge', 'vlan'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setNncpForm((f) => ({ ...f, type: t }))}
                  style={{
                    flex: 1,
                    padding: '8px 12px',
                    fontSize: 13,
                    fontWeight: 500,
                    background: nncpForm.type === t ? theme.accent : theme.main.inputBg,
                    color: nncpForm.type === t ? '#fff' : theme.text.secondary,
                    border: 'none',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    transition: 'background 0.15s, color 0.15s',
                  }}
                >
                  {t === 'linux-bridge' ? 'Bridge' : 'VLAN'}
                </button>
              ))}
            </div>
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Port</label>
            <select
              value={nncpForm.port}
              onChange={(e) => setNncpForm((f) => ({ ...f, port: e.target.value }))}
              style={inputStyle}
            >
              <option value="">Select a port...</option>
              {ethernetInterfaces.map((iface: any) => (
                <option key={iface.name} value={iface.name}>
                  {iface.name} ({iface.state ?? 'unknown'}, {iface.nodes?.length ?? 0} node{(iface.nodes?.length ?? 0) !== 1 ? 's' : ''})
                </option>
              ))}
            </select>
          </div>

          {nncpForm.type === 'vlan' && (
            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>VLAN ID</label>
              <input
                type="number"
                value={nncpForm.vlan_id}
                onChange={(e) => setNncpForm((f) => ({ ...f, vlan_id: e.target.value }))}
                placeholder="e.g. 100"
                style={inputStyle}
              />
            </div>
          )}

          <div style={{ marginBottom: 14, display: 'flex', alignItems: 'center', gap: 10 }}>
            <input
              type="checkbox"
              id="nncp-ipv4"
              checked={nncpForm.ipv4_enabled}
              onChange={(e) => setNncpForm((f) => ({ ...f, ipv4_enabled: e.target.checked }))}
              style={{ cursor: 'pointer' }}
            />
            <label htmlFor="nncp-ipv4" style={{ ...labelStyle, marginBottom: 0, cursor: 'pointer' }}>
              Enable IPv4
            </label>
          </div>

          {nncpForm.ipv4_enabled && (
            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>IPv4 Address (CIDR)</label>
              <input
                type="text"
                value={nncpForm.ipv4_address}
                onChange={(e) => setNncpForm((f) => ({ ...f, ipv4_address: e.target.value }))}
                placeholder="e.g. 192.168.1.10/24"
                style={inputStyle}
              />
            </div>
          )}

          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Description (optional)</label>
            <input
              type="text"
              value={nncpForm.description}
              onChange={(e) => setNncpForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="Brief description"
              style={inputStyle}
            />
          </div>

          <div
            style={{
              padding: '10px 12px',
              background: `${theme.status.migrating}10`,
              border: `1px solid ${theme.status.migrating}30`,
              borderRadius: theme.radius.md,
              marginBottom: 16,
              fontSize: 12,
              color: theme.text.secondary,
              lineHeight: 1.5,
            }}
          >
            If your nodes have a firewall enabled, make sure the bridge interface is allowed in the firewall rules (e.g. firewalld trusted zone).
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
            <button
              type="button"
              onClick={() => setShowCreateNNCP(false)}
              style={{
                background: theme.button.secondary,
                border: `1px solid ${theme.button.secondaryBorder}`,
                color: theme.button.secondaryText,
                borderRadius: theme.radius.md,
                padding: '7px 16px',
                fontSize: 13,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={createNNCP.isPending}
              style={{
                background: theme.button.primary,
                border: 'none',
                color: theme.button.primaryText,
                borderRadius: theme.radius.md,
                padding: '7px 16px',
                fontSize: 13,
                fontWeight: 500,
                cursor: createNNCP.isPending ? 'not-allowed' : 'pointer',
                fontFamily: 'inherit',
                opacity: createNNCP.isPending ? 0.7 : 1,
              }}
            >
              {createNNCP.isPending ? 'Creating...' : 'Create Interface'}
            </button>
          </div>
        </form>
      </Modal>

      {/* ======================== DELETE NNCP CONFIRM ======================== */}
      <ConfirmModal
        open={deleteNNCPTarget !== null}
        title="Delete Interface"
        message={`Are you sure you want to delete the interface "${deleteNNCPTarget}"? This will remove the NMState policy from the cluster.`}
        confirmLabel="Delete"
        danger
        onConfirm={handleDeleteNNCP}
        onCancel={() => setDeleteNNCPTarget(null)}
      />

      {/* ======================== CREATE NETWORK MODAL ======================== */}
      <Modal open={showCreateNetwork} onClose={() => setShowCreateNetwork(false)} title="New Network Profile">
        <form onSubmit={handleNetworkSubmit}>
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Display Name</label>
            <input
              type="text"
              value={netForm.display_name}
              onChange={(e) => handleDisplayNameChange(e.target.value)}
              placeholder="My Network"
              style={inputStyle}
            />
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Name (auto-generated)</label>
            <input
              type="text"
              value={netForm.name}
              onChange={(e) => setNetForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="my-network"
              style={inputStyle}
            />
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Type</label>
            <select
              value={netForm.type}
              onChange={(e) => setNetForm((f) => ({ ...f, type: e.target.value }))}
              style={inputStyle}
            >
              <option value="bridge">Bridge</option>
              <option value="masquerade">Masquerade</option>
              <option value="sr-iov">SR-IOV</option>
            </select>
          </div>

          {netForm.type === 'bridge' && (
            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>Bridge</label>
              {bridges.length === 0 ? (
                <div style={{
                  padding: '10px 12px',
                  background: `${theme.status.migrating}10`,
                  border: `1px solid ${theme.status.migrating}30`,
                  borderRadius: theme.radius.md,
                  fontSize: 12,
                  color: theme.text.secondary,
                  lineHeight: 1.5,
                }}>
                  No bridges available. Create an interface (linux-bridge) in the Interfaces tab first.
                </div>
              ) : (
                <select
                  value={netForm.bridge_name}
                  onChange={(e) => setNetForm((f) => ({ ...f, bridge_name: e.target.value }))}
                  style={inputStyle}
                >
                  <option value="">Select a bridge...</option>
                  {bridges.map((b) => (
                    <option key={b.name} value={b.name}>{b.name} ({b.nodes.length} node{b.nodes.length !== 1 ? 's' : ''})</option>
                  ))}
                </select>
              )}
            </div>
          )}

          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>VLAN ID (optional)</label>
            <input
              type="number"
              value={netForm.vlan_id}
              onChange={(e) => setNetForm((f) => ({ ...f, vlan_id: e.target.value }))}
              placeholder="e.g. 100"
              style={inputStyle}
            />
          </div>
          <div style={{ marginBottom: 14, display: 'flex', alignItems: 'center', gap: 10 }}>
            <input
              type="checkbox"
              id="net-dhcp"
              checked={netForm.dhcp}
              onChange={(e) => setNetForm((f) => ({ ...f, dhcp: e.target.checked }))}
              style={{ cursor: 'pointer' }}
            />
            <label htmlFor="net-dhcp" style={{ ...labelStyle, marginBottom: 0, cursor: 'pointer' }}>
              Enable DHCP
            </label>
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Subnet</label>
            <input
              type="text"
              value={netForm.subnet}
              onChange={(e) => setNetForm((f) => ({ ...f, subnet: e.target.value }))}
              placeholder="e.g. 192.168.1.0/24"
              style={inputStyle}
            />
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Gateway</label>
            <input
              type="text"
              value={netForm.gateway}
              onChange={(e) => setNetForm((f) => ({ ...f, gateway: e.target.value }))}
              placeholder="e.g. 192.168.1.1"
              style={inputStyle}
            />
          </div>
          <YamlPreview
            endpoint={`/clusters/${activeCluster}/namespaces/${activeNamespace}/networks/preview`}
            payload={{
              display_name: netForm.display_name,
              name: netForm.name,
              network_type: netForm.type,
              bridge_name: netForm.bridge_name || undefined,
              vlan_id: netForm.vlan_id === '' ? null : Number(netForm.vlan_id),
              dhcp_enabled: netForm.dhcp,
              subnet: netForm.subnet || null,
              gateway: netForm.gateway || null,
            }}
          />

          {netError && (
            <div style={{ color: theme.status.error, fontSize: 13, marginBottom: 8 }}>{netError}</div>
          )}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
            <button
              type="button"
              onClick={() => setShowCreateNetwork(false)}
              style={{
                background: theme.button.secondary,
                border: `1px solid ${theme.button.secondaryBorder}`,
                color: theme.button.secondaryText,
                borderRadius: theme.radius.md,
                padding: '7px 16px',
                fontSize: 13,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={createNetwork.isPending}
              style={{
                background: theme.button.primary,
                border: 'none',
                color: theme.button.primaryText,
                borderRadius: theme.radius.md,
                padding: '7px 16px',
                fontSize: 13,
                fontWeight: 500,
                cursor: createNetwork.isPending ? 'not-allowed' : 'pointer',
                fontFamily: 'inherit',
                opacity: createNetwork.isPending ? 0.7 : 1,
              }}
            >
              {createNetwork.isPending ? 'Creating...' : 'Create Network Profile'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}

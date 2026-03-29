import { useState } from 'react'
import { TopBar } from '@/components/layout/TopBar'
import { useNetworks, useCreateNetwork, useDeleteNetwork, useAllNetworks } from '@/hooks/useNetworks'
import { useUIStore } from '@/stores/ui-store'
import { theme } from '@/lib/theme'
import { Modal } from '@/components/ui/Modal'
import { EmptyState } from '@/components/ui/EmptyState'
import { TableSkeleton } from '@/components/ui/Skeleton'
import { Network } from 'lucide-react'
import { DropdownMenu } from '@/components/ui/DropdownMenu'
import { useSortable } from '@/hooks/useSortable'

const typeColor: Record<string, string> = {
  Bridge: theme.status.running,
  Masquerade: theme.status.provisioning,
  'SR-IOV': theme.status.migrating,
  OVS: theme.accent,
}

interface NetworkProfile {
  name: string
  display_name?: string
  type?: string
  vlan_id?: number | null
  dhcp?: boolean
  subnet?: string
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

interface NetworkForm {
  display_name: string
  name: string
  type: string
  vlan_id: string
  dhcp: boolean
  subnet: string
  gateway: string
}

export function NetworksPage() {
  const { data, isLoading } = useNetworks()
  const { data: allNADsData, isLoading: allNADsLoading } = useAllNetworks()
  const { activeNamespace } = useUIStore()
  const createNetwork = useCreateNetwork()
  const deleteNetwork = useDeleteNetwork()
  const networks: NetworkProfile[] = Array.isArray(data?.items) ? data.items : Array.isArray(data) ? data : []
  const allNADs: Array<{ name: string; namespace: string; full_name: string; display_name: string }> =
    Array.isArray(allNADsData?.items) ? allNADsData.items : []
  const clusterNADs = allNADs.filter((nad) => nad.namespace !== activeNamespace)
  const { sorted: sortedNetworks, sortConfig, requestSort } = useSortable(networks, { column: 'display_name', direction: 'asc' })
  const { sorted: sortedClusterNADs, sortConfig: nadSortConfig, requestSort: requestNADSort } = useSortable(clusterNADs, { column: 'display_name', direction: 'asc' })
  const [showCreate, setShowCreate] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState<NetworkForm>({
    display_name: '',
    name: '',
    type: 'bridge',
    vlan_id: '',
    dhcp: true,
    subnet: '',
    gateway: '',
  })

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

  const handleDelete = (name: string) => {
    if (!confirm(`Delete network profile "${name}"?`)) return
    deleteNetwork.mutate(name)
  }

  const handleDisplayNameChange = (val: string) => {
    setForm((f) => ({
      ...f,
      display_name: val,
      name: val.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, ''),
    }))
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    createNetwork.mutate(form, {
      onSuccess: () => {
        setShowCreate(false)
        setForm({ display_name: '', name: '', type: 'bridge', vlan_id: '', dhcp: true, subnet: '', gateway: '' })
      },
      onError: (err: unknown) => {
        const e = err as { message?: string }
        setError(e.message ?? 'Failed to create network profile')
      },
    })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <TopBar
        title="Network Profiles"
        action={
          <button
            onClick={() => { setShowCreate(true); setError(null) }}
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
        }
      />

      <div className="page-content" style={{ animation: 'fadeInUp 0.35s ease-out' }}>
        <div className="page-container">
        {/* Built-in Pod Network */}
        <div className="card" style={{ marginBottom: 20 }}>
          <div
            style={{
              padding: '12px 16px',
              borderBottom: `1px solid ${theme.main.tableRowBorder}`,
              display: 'flex',
              alignItems: 'center',
              gap: 10,
            }}
          >
            <span
              style={{
                fontSize: 12,
                fontWeight: 700,
                color: theme.text.secondary,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
              }}
            >
              Built-in
            </span>
          </div>
          <div
            style={{
              padding: '12px 16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div>
              <div style={{ color: theme.text.primary, fontWeight: 500, fontSize: 14 }}>Pod Network</div>
              <div style={{ color: theme.text.dim, fontSize: 11, marginTop: 2 }}>
                Default Kubernetes pod network (masquerade interface)
              </div>
            </div>
            <Badge label="Always Available" color={theme.status.running} />
          </div>
        </div>

        {/* Current Namespace Profiles */}
        <div className="card" style={{ marginBottom: 20 }}>
          <div
            style={{
              padding: '12px 16px',
              borderBottom: `1px solid ${theme.main.tableRowBorder}`,
            }}
          >
            <span
              style={{
                fontSize: 12,
                fontWeight: 700,
                color: theme.text.secondary,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
              }}
            >
              Current Namespace
            </span>
          </div>
          {isLoading ? (
            <TableSkeleton rows={2} cols={5} />
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
                  <th className={`table-header-cell-sortable${sortConfig.column === 'display_name' ? ' active' : ''}`} onClick={() => requestSort('display_name')}>
                    Display Name{sortConfig.column === 'display_name' ? (sortConfig.direction === 'asc' ? ' ↑' : ' ↓') : ''}
                  </th>
                  <th className={`table-header-cell-sortable${sortConfig.column === 'type' ? ' active' : ''}`} onClick={() => requestSort('type')}>
                    Type{sortConfig.column === 'type' ? (sortConfig.direction === 'asc' ? ' ↑' : ' ↓') : ''}
                  </th>
                  <th className={`table-header-cell-sortable${sortConfig.column === 'vlan_id' ? ' active' : ''}`} onClick={() => requestSort('vlan_id')}>
                    VLAN ID{sortConfig.column === 'vlan_id' ? (sortConfig.direction === 'asc' ? ' ↑' : ' ↓') : ''}
                  </th>
                  <th className={`table-header-cell-sortable${sortConfig.column === 'dhcp' ? ' active' : ''}`} onClick={() => requestSort('dhcp')}>
                    DHCP{sortConfig.column === 'dhcp' ? (sortConfig.direction === 'asc' ? ' ↑' : ' ↓') : ''}
                  </th>
                  <th className={`table-header-cell-sortable${sortConfig.column === 'subnet' ? ' active' : ''}`} onClick={() => requestSort('subnet')}>
                    Subnet{sortConfig.column === 'subnet' ? (sortConfig.direction === 'asc' ? ' ↑' : ' ↓') : ''}
                  </th>
                  <th className="table-header-cell">Actions</th>
                </tr>
              </thead>
              <tbody>
                {sortedNetworks.map((net, i) => (
                  <tr
                    key={net.name}
                    className="table-row"
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
                    <td className="table-cell">
                      {net.type ? (
                        <Badge label={net.type} color={typeColor[net.type] ?? theme.text.dim} />
                      ) : (
                        <span style={{ color: theme.text.dim }}>—</span>
                      )}
                    </td>
                    <td className="table-cell" style={{ color: theme.text.secondary, fontSize: 13, fontFamily: theme.typography.mono.fontFamily }}>
                      {net.vlan_id ?? '—'}
                    </td>
                    <td className="table-cell">
                      <span
                        style={{
                          color: net.dhcp ? theme.status.running : theme.text.secondary,
                          fontSize: 13,
                        }}
                      >
                        {net.dhcp === undefined ? '—' : net.dhcp ? 'Yes' : 'No'}
                      </span>
                    </td>
                    <td className="table-cell" style={{ color: theme.text.secondary, fontFamily: theme.typography.mono.fontFamily, fontSize: 13 }}>
                      {net.subnet ?? '—'}
                    </td>
                    <td className="table-cell" style={{ position: 'relative', zIndex: 10 }}>
                      <DropdownMenu
                        actions={[{ label: 'Delete', action: 'delete', danger: true }]}
                        onAction={(action) => {
                          if (action === 'delete') handleDelete(net.name)
                        }}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Cluster NADs (other namespaces) */}
        <div className="card">
          <div
            style={{
              padding: '12px 16px',
              borderBottom: `1px solid ${theme.main.tableRowBorder}`,
            }}
          >
            <span
              style={{
                fontSize: 12,
                fontWeight: 700,
                color: theme.text.secondary,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
              }}
            >
              Cluster NADs (Other Namespaces)
            </span>
          </div>
          {allNADsLoading ? (
            <TableSkeleton rows={2} cols={5} />
          ) : clusterNADs.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: theme.text.dim, fontSize: 13 }}>
              No NADs found in other namespaces.
            </div>
          ) : (
            <table className="table">
              <thead>
                <tr className="table-header">
                  <th className={`table-header-cell-sortable${nadSortConfig.column === 'display_name' ? ' active' : ''}`} onClick={() => requestNADSort('display_name')}>
                    Name{nadSortConfig.column === 'display_name' ? (nadSortConfig.direction === 'asc' ? ' ↑' : ' ↓') : ''}
                  </th>
                  <th className={`table-header-cell-sortable${nadSortConfig.column === 'namespace' ? ' active' : ''}`} onClick={() => requestNADSort('namespace')}>
                    Namespace{nadSortConfig.column === 'namespace' ? (nadSortConfig.direction === 'asc' ? ' ↑' : ' ↓') : ''}
                  </th>
                  <th className={`table-header-cell-sortable${nadSortConfig.column === 'full_name' ? ' active' : ''}`} onClick={() => requestNADSort('full_name')}>
                    Full Reference{nadSortConfig.column === 'full_name' ? (nadSortConfig.direction === 'asc' ? ' ↑' : ' ↓') : ''}
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedClusterNADs.map((nad, i) => (
                  <tr
                    key={nad.full_name}
                    className="table-row"
                    style={i < 8 ? {
                      animation: `fadeInRow 0.3s ease-out both`,
                      animationDelay: `${0.05 + i * 0.04}s`,
                    } : undefined}
                  >
                    <td className="table-cell">
                      <div style={{ color: theme.text.primary, fontWeight: 500, fontSize: 14 }}>{nad.display_name}</div>
                      {nad.display_name !== nad.name && (
                        <div style={{ color: theme.text.dim, fontSize: 11, marginTop: 2, fontFamily: theme.typography.mono.fontFamily }}>{nad.name}</div>
                      )}
                    </td>
                    <td className="table-cell">
                      <Badge label={nad.namespace} color={theme.accent} />
                    </td>
                    <td className="table-cell" style={{ color: theme.text.secondary, fontFamily: theme.typography.mono.fontFamily, fontSize: 13 }}>
                      {nad.full_name}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        </div>
      </div>

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="New Network Profile">
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Display Name</label>
            <input
              type="text"
              value={form.display_name}
              onChange={(e) => handleDisplayNameChange(e.target.value)}
              placeholder="My Network"
              style={inputStyle}
            />
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Name (auto-generated)</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="my-network"
              style={inputStyle}
            />
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Type</label>
            <select
              value={form.type}
              onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
              style={inputStyle}
            >
              <option value="bridge">Bridge</option>
              <option value="masquerade">Masquerade</option>
              <option value="sr-iov">SR-IOV</option>
            </select>
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>VLAN ID (optional)</label>
            <input
              type="number"
              value={form.vlan_id}
              onChange={(e) => setForm((f) => ({ ...f, vlan_id: e.target.value }))}
              placeholder="e.g. 100"
              style={inputStyle}
            />
          </div>
          <div style={{ marginBottom: 14, display: 'flex', alignItems: 'center', gap: 10 }}>
            <input
              type="checkbox"
              id="dhcp"
              checked={form.dhcp}
              onChange={(e) => setForm((f) => ({ ...f, dhcp: e.target.checked }))}
              style={{ cursor: 'pointer' }}
            />
            <label htmlFor="dhcp" style={{ ...labelStyle, marginBottom: 0, cursor: 'pointer' }}>
              Enable DHCP
            </label>
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Subnet</label>
            <input
              type="text"
              value={form.subnet}
              onChange={(e) => setForm((f) => ({ ...f, subnet: e.target.value }))}
              placeholder="e.g. 192.168.1.0/24"
              style={inputStyle}
            />
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Gateway</label>
            <input
              type="text"
              value={form.gateway}
              onChange={(e) => setForm((f) => ({ ...f, gateway: e.target.value }))}
              placeholder="e.g. 192.168.1.1"
              style={inputStyle}
            />
          </div>
          {error && (
            <div style={{ color: theme.status.error, fontSize: 13, marginBottom: 8 }}>{error}</div>
          )}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
            <button
              type="button"
              onClick={() => setShowCreate(false)}
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

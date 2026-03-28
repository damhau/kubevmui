import { useState, useRef, useEffect } from 'react'
import { TopBar } from '@/components/layout/TopBar'
import { useNetworks, useCreateNetwork, useDeleteNetwork, useAllNetworks } from '@/hooks/useNetworks'
import { useUIStore } from '@/stores/ui-store'
import { theme } from '@/lib/theme'
import { Modal } from '@/components/ui/Modal'
import { EmptyState } from '@/components/ui/EmptyState'
import { Network } from 'lucide-react'

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

function ActionsMenu({ actions, onAction }: { actions: { label: string; action: string; danger?: boolean }[]; onAction: (action: string) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }} onClick={(e) => e.stopPropagation()}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          background: theme.main.card,
          border: `1px solid ${theme.main.inputBorder}`,
          borderRadius: 5,
          color: theme.text.secondary,
          cursor: 'pointer',
          padding: '3px 8px',
          fontSize: 16,
          lineHeight: 1,
          fontFamily: 'inherit',
        }}
      >
        ⋯
      </button>
      {open && (
        <div
          style={{
            position: 'absolute',
            right: 0,
            top: '100%',
            marginTop: 4,
            background: theme.main.card,
            border: `1px solid ${theme.main.cardBorder}`,
            borderRadius: 7,
            minWidth: 140,
            zIndex: 100,
            overflow: 'hidden',
            boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
          }}
        >
          {actions.map((a) => (
            <button
              key={a.action}
              onClick={() => { setOpen(false); onAction(a.action) }}
              style={{
                width: '100%',
                display: 'block',
                padding: '8px 14px',
                background: 'transparent',
                border: 'none',
                textAlign: 'left',
                fontSize: 13,
                color: a.danger ? theme.status.error : theme.text.primary,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = theme.main.hoverBg)}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              {a.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
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

      <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
        {/* Built-in Pod Network */}
        <div
          style={{
            background: theme.main.card,
            border: `1px solid ${theme.main.cardBorder}`,
            borderRadius: theme.radius.lg,
            marginBottom: 20,
          }}
        >
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
        <div
          style={{
            background: theme.main.card,
            border: `1px solid ${theme.main.cardBorder}`,
            borderRadius: theme.radius.lg,
            marginBottom: 20,
          }}
        >
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
            <div style={{ padding: 40, textAlign: 'center', color: theme.text.dim, fontSize: 13 }}>
              Loading network profiles...
            </div>
          ) : networks.length === 0 ? (
            <EmptyState
              icon={<Network size={24} />}
              title="No Network Profiles"
              description="Create network profiles to configure VM networking."
            />
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: theme.main.tableHeaderBg, borderBottom: `1px solid ${theme.main.tableRowBorder}` }}>
                  {['Display Name', 'Type', 'VLAN ID', 'DHCP', 'Subnet', 'Actions'].map((col) => (
                    <th
                      key={col}
                      style={{
                        padding: '10px 16px',
                        textAlign: 'left',
                        color: theme.text.secondary,
                        fontWeight: 600,
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
                {networks.map((net) => (
                  <tr
                    key={net.name}
                    style={{ borderBottom: `1px solid ${theme.main.tableRowBorder}` }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = theme.main.hoverBg)}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    <td style={{ padding: '10px 16px' }}>
                      <div style={{ color: theme.text.primary, fontWeight: 500, fontSize: 14 }}>{net.display_name ?? net.name}</div>
                      {net.display_name && (
                        <div style={{ color: theme.text.dim, fontSize: 11, marginTop: 2 }}>{net.name}</div>
                      )}
                    </td>
                    <td style={{ padding: '10px 16px' }}>
                      {net.type ? (
                        <Badge label={net.type} color={typeColor[net.type] ?? theme.text.dim} />
                      ) : (
                        <span style={{ color: theme.text.dim }}>—</span>
                      )}
                    </td>
                    <td style={{ padding: '10px 16px', color: theme.text.secondary, fontSize: 13 }}>
                      {net.vlan_id ?? '—'}
                    </td>
                    <td style={{ padding: '10px 16px' }}>
                      <span
                        style={{
                          color: net.dhcp ? theme.status.running : theme.text.secondary,
                          fontSize: 13,
                        }}
                      >
                        {net.dhcp === undefined ? '—' : net.dhcp ? 'Yes' : 'No'}
                      </span>
                    </td>
                    <td style={{ padding: '10px 16px', color: theme.text.secondary, fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace", fontSize: 13 }}>
                      {net.subnet ?? '—'}
                    </td>
                    <td style={{ padding: '10px 16px' }}>
                      <ActionsMenu
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
        <div
          style={{
            background: theme.main.card,
            border: `1px solid ${theme.main.cardBorder}`,
            borderRadius: theme.radius.lg,
          }}
        >
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
            <div style={{ padding: 40, textAlign: 'center', color: theme.text.dim, fontSize: 13 }}>
              Loading cluster NADs...
            </div>
          ) : clusterNADs.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: theme.text.dim, fontSize: 13 }}>
              No NADs found in other namespaces.
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: theme.main.tableHeaderBg, borderBottom: `1px solid ${theme.main.tableRowBorder}` }}>
                  {['Name', 'Namespace', 'Full Reference'].map((col) => (
                    <th
                      key={col}
                      style={{
                        padding: '10px 16px',
                        textAlign: 'left',
                        color: theme.text.secondary,
                        fontWeight: 600,
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
                {clusterNADs.map((nad) => (
                  <tr
                    key={nad.full_name}
                    style={{ borderBottom: `1px solid ${theme.main.tableRowBorder}` }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = theme.main.hoverBg)}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    <td style={{ padding: '10px 16px' }}>
                      <div style={{ color: theme.text.primary, fontWeight: 500, fontSize: 14 }}>{nad.display_name}</div>
                      {nad.display_name !== nad.name && (
                        <div style={{ color: theme.text.dim, fontSize: 11, marginTop: 2 }}>{nad.name}</div>
                      )}
                    </td>
                    <td style={{ padding: '10px 16px' }}>
                      <Badge label={nad.namespace} color={theme.accent} />
                    </td>
                    <td style={{ padding: '10px 16px', color: theme.text.secondary, fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace", fontSize: 13 }}>
                      {nad.full_name}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
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

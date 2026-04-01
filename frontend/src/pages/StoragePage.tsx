import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { TopBar } from '@/components/layout/TopBar'
import { useDisks, useCreateDisk, useDeleteDisk, useResizeDisk } from '@/hooks/useDisks'
import { useDatastores, type Datastore } from '@/hooks/useDatastores'
import { useSortable } from '@/hooks/useSortable'
import { theme } from '@/lib/theme'
import { useUIStore } from '@/stores/ui-store'
import { Modal } from '@/components/ui/Modal'
import { YamlPreview } from '@/components/ui/YamlPreview'
import { ConfirmModal } from '@/components/ui/ConfirmModal'
import { EmptyState } from '@/components/ui/EmptyState'
import { TableSkeleton } from '@/components/ui/Skeleton'
import { extractErrorMessage } from '@/lib/api-client'
import { toast } from '@/components/ui/Toast'
import { HardDrive, Database } from 'lucide-react'
import { DropdownMenu } from '@/components/ui/DropdownMenu'

const tierColor: Record<string, string> = {
  SSD: theme.status.running,
  NVMe: theme.accent,
  HDD: theme.status.stopped,
  Premium: theme.status.migrating,
}

const diskStatusColor: Record<string, string> = {
  Available: theme.status.running,
  Bound: theme.status.provisioning,
  Released: theme.status.migrating,
  Failed: theme.status.error,
}

const providerColor: Record<string, string> = {
  topolvm: theme.accent,
  'ceph-rbd': theme.status.running,
  cephfs: theme.status.running,
  nfs: theme.status.provisioning,
  'local-path': theme.status.migrating,
  longhorn: theme.status.running,
  'aws-ebs': theme.status.provisioning,
  'gcp-pd': theme.status.provisioning,
  'azure-disk': theme.status.provisioning,
  csi: theme.text.secondary,
  unknown: theme.text.dim,
}

interface Disk {
  name: string
  size_gb?: number
  performance_tier?: string
  status?: string
  attached_vm?: string | null
  is_image?: boolean
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

interface DiskForm {
  name: string
  size_gb: number
  performance_tier: string
}

export function StoragePage() {
  const navigate = useNavigate()
  const { activeCluster, activeNamespace } = useUIStore()

  // Tab state
  const [activeTab, setActiveTab] = useState<'disks' | 'datastores'>('disks')

  // --- Disks ---
  const { data, isLoading } = useDisks()
  const createDisk = useCreateDisk()
  const deleteDisk = useDeleteDisk()
  const disks: Disk[] = Array.isArray(data?.items) ? data.items : Array.isArray(data) ? data : []
  const { sorted: sortedDisks, sortConfig, requestSort } = useSortable(disks, { column: 'name', direction: 'asc' })
  const [showCreate, setShowCreate] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState<DiskForm>({
    name: '',
    size_gb: 20,
    performance_tier: '',
  })

  // --- Datastores ---
  const { data: dsData, isLoading: dsLoading } = useDatastores()
  const datastores: Datastore[] = Array.isArray(dsData?.items) ? dsData.items : []
  const { sorted: sortedDatastores, sortConfig: dsSortConfig, requestSort: requestDsSort } = useSortable(datastores, { column: 'name', direction: 'asc' })

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

  const [confirmAction, setConfirmAction] = useState<{ title: string; message: string; onConfirm: () => void; danger?: boolean; confirmLabel?: string } | null>(null)
  const [resizeTarget, setResizeTarget] = useState<{ name: string; currentSize: number } | null>(null)
  const [resizeSize, setResizeSize] = useState(0)
  const resizeDisk = useResizeDisk()

  const handleDelete = (disk: Disk) => {
    const warning = disk.attached_vm
      ? `This disk is currently attached to VM "${disk.attached_vm}". Deleting it may cause the VM to fail.`
      : ''
    setConfirmAction({
      title: 'Delete Disk',
      message: `Delete disk "${disk.name}"?${warning ? `\n\n${warning}` : ''} This action cannot be undone.`,
      danger: true,
      confirmLabel: 'Delete',
      onConfirm: () => {
        deleteDisk.mutate(disk.name, {
          onSuccess: () => toast.success('Disk deleted'),
          onError: (err) => toast.error(extractErrorMessage(err, 'Failed to delete disk')),
        })
        setConfirmAction(null)
      },
    })
  }

  const handleResize = (disk: Disk) => {
    setResizeTarget({ name: disk.name, currentSize: disk.size_gb ?? 0 })
    setResizeSize((disk.size_gb ?? 0) + 10)
  }

  const submitResize = (e: React.FormEvent) => {
    e.preventDefault()
    if (!resizeTarget) return
    resizeDisk.mutate(
      { name: resizeTarget.name, size_gb: resizeSize },
      {
        onSuccess: () => {
          toast.success('Disk resize requested')
          setResizeTarget(null)
        },
        onError: (err) => toast.error(extractErrorMessage(err, 'Failed to resize disk')),
      },
    )
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    createDisk.mutate(form, {
      onSuccess: () => {
        setShowCreate(false)
        setForm({ name: '', size_gb: 20, performance_tier: '' })
      },
      onError: (err: unknown) => {
        setError(extractErrorMessage(err, 'Failed to create disk'))
      },
    })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <TopBar
        title="Storage"
        action={
          activeTab === 'disks' ? (
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
              + New Disk
            </button>
          ) : undefined
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
        <button style={tabStyle(activeTab === 'disks')} onClick={() => setActiveTab('disks')}>
          Disks
        </button>
        <button style={tabStyle(activeTab === 'datastores')} onClick={() => setActiveTab('datastores')}>
          Datastores
        </button>
      </div>

      {/* Disks tab */}
      {activeTab === 'disks' && (
        <div className="page-content" style={{ animation: 'fadeInUp 0.35s ease-out' }}>
          <div className="page-container">
          <div className="card">
            {isLoading ? (
              <TableSkeleton rows={3} cols={6} />
            ) : disks.length === 0 ? (
              <EmptyState
                icon={<HardDrive size={24} />}
                title="No Disks"
                description="Create persistent disks for your virtual machines."
              />
            ) : (
              <table className="table">
                <thead>
                  <tr className="table-header">
                    <th className={`table-header-cell-sortable${sortConfig.column === 'name' ? ' active' : ''}`} onClick={() => requestSort('name')}>
                      Name {sortConfig.column === 'name' ? (sortConfig.direction === 'asc' ? ' ↑' : ' ↓') : ''}
                    </th>
                    {activeNamespace === '_all' && (
                      <th className={`table-header-cell-sortable${sortConfig.column === 'namespace' ? ' active' : ''}`} onClick={() => requestSort('namespace')}>
                        Namespace {sortConfig.column === 'namespace' ? (sortConfig.direction === 'asc' ? ' ↑' : ' ↓') : ''}
                      </th>
                    )}
                    <th className={`table-header-cell-sortable${sortConfig.column === 'size_gb' ? ' active' : ''}`} onClick={() => requestSort('size_gb')}>
                      Size (GB) {sortConfig.column === 'size_gb' ? (sortConfig.direction === 'asc' ? ' ↑' : ' ↓') : ''}
                    </th>
                    <th className={`table-header-cell-sortable${sortConfig.column === 'performance_tier' ? ' active' : ''}`} onClick={() => requestSort('performance_tier')}>
                      Performance Tier {sortConfig.column === 'performance_tier' ? (sortConfig.direction === 'asc' ? ' ↑' : ' ↓') : ''}
                    </th>
                    <th className={`table-header-cell-sortable${sortConfig.column === 'status' ? ' active' : ''}`} onClick={() => requestSort('status')}>
                      Status {sortConfig.column === 'status' ? (sortConfig.direction === 'asc' ? ' ↑' : ' ↓') : ''}
                    </th>
                    <th className={`table-header-cell-sortable${sortConfig.column === 'attached_vm' ? ' active' : ''}`} onClick={() => requestSort('attached_vm')}>
                      Attached VM {sortConfig.column === 'attached_vm' ? (sortConfig.direction === 'asc' ? ' ↑' : ' ↓') : ''}
                    </th>
                    <th className="table-header-cell">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedDisks.map((disk, i) => (
                    <tr
                      key={disk.name}
                      className="table-row-clickable"
                      onClick={() => navigate(`/storage/${activeNamespace}/${disk.name}`)}
                      style={i < 8 ? {
                        animation: `fadeInRow 0.3s ease-out both`,
                        animationDelay: `${0.05 + i * 0.04}s`,
                      } : undefined}
                    >
                      <td className="table-cell" style={{ color: theme.text.primary, fontWeight: 500, fontSize: 14, fontFamily: theme.typography.mono.fontFamily }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          {disk.name}
                          {disk.is_image && (
                            <span style={{ fontSize: 10, fontWeight: 600, padding: '1px 6px', borderRadius: 3, background: `${theme.status.provisioning}18`, color: theme.status.provisioning, border: `1px solid ${theme.status.provisioning}40`, fontFamily: 'inherit' }}>
                              Image
                            </span>
                          )}
                        </span>
                      </td>
                      {activeNamespace === '_all' && (
                        <td className="table-cell" style={{ color: theme.text.secondary, fontSize: 12 }}>{(disk as any).namespace}</td>
                      )}
                      <td className="table-cell" style={{ color: theme.text.secondary, fontSize: 13, fontFamily: theme.typography.mono.fontFamily }}>
                        {disk.size_gb != null ? disk.size_gb : '—'}
                      </td>
                      <td className="table-cell">
                        {disk.performance_tier ? (
                          <Badge
                            label={disk.performance_tier}
                            color={tierColor[disk.performance_tier] ?? theme.text.dim}
                          />
                        ) : (
                          <span style={{ color: theme.text.dim }}>—</span>
                        )}
                      </td>
                      <td className="table-cell">
                        {disk.status ? (
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 6,
                              fontSize: 13,
                              color: diskStatusColor[disk.status] ?? theme.text.secondary,
                            }}
                          >
                            <span
                              style={{
                                width: 7,
                                height: 7,
                                borderRadius: '50%',
                                background: diskStatusColor[disk.status] ?? theme.text.secondary,
                                flexShrink: 0,
                              }}
                            />
                            {disk.status}
                          </span>
                        ) : (
                          <span style={{ color: theme.text.dim }}>—</span>
                        )}
                      </td>
                      <td className="table-cell" style={{ color: theme.text.secondary, fontSize: 13 }}>
                        {disk.attached_vm ?? '—'}
                      </td>
                      <td className="table-cell" style={{ position: 'relative', zIndex: 10 }}>
                        <DropdownMenu
                          actions={[
                            { label: 'Resize', action: 'resize' },
                            { label: 'Delete', action: 'delete', danger: true },
                          ]}
                          onAction={(action) => {
                            if (action === 'delete') handleDelete(disk)
                            if (action === 'resize') handleResize(disk)
                          }}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          </div>
        </div>
      )}

      {/* Datastores tab */}
      {activeTab === 'datastores' && (
        <div className="page-content" style={{ animation: 'fadeInUp 0.35s ease-out' }}>
          <div className="page-container">
          <div className="card">
            {dsLoading ? (
              <TableSkeleton rows={3} cols={6} />
            ) : datastores.length === 0 ? (
              <EmptyState
                icon={<Database size={24} />}
                title="No Datastores"
                description="No datastores found in this cluster."
              />
            ) : (
              <table className="table">
                <thead>
                  <tr className="table-header">
                    <th className={`table-header-cell-sortable${dsSortConfig.column === 'name' ? ' active' : ''}`} onClick={() => requestDsSort('name')}>
                      Name {dsSortConfig.column === 'name' ? (dsSortConfig.direction === 'asc' ? ' ↑' : ' ↓') : ''}
                    </th>
                    <th className={`table-header-cell-sortable${dsSortConfig.column === 'provisioner' ? ' active' : ''}`} onClick={() => requestDsSort('provisioner')}>
                      Provisioner {dsSortConfig.column === 'provisioner' ? (dsSortConfig.direction === 'asc' ? ' ↑' : ' ↓') : ''}
                    </th>
                    <th className={`table-header-cell-sortable${dsSortConfig.column === 'provider_type' ? ' active' : ''}`} onClick={() => requestDsSort('provider_type')}>
                      Type {dsSortConfig.column === 'provider_type' ? (dsSortConfig.direction === 'asc' ? ' ↑' : ' ↓') : ''}
                    </th>
                    <th className={`table-header-cell-sortable${dsSortConfig.column === 'pv_count' ? ' active' : ''}`} onClick={() => requestDsSort('pv_count')}>
                      PVs {dsSortConfig.column === 'pv_count' ? (dsSortConfig.direction === 'asc' ? ' ↑' : ' ↓') : ''}
                    </th>
                    <th className={`table-header-cell-sortable${dsSortConfig.column === 'total_capacity_gb' ? ' active' : ''}`} onClick={() => requestDsSort('total_capacity_gb')}>
                      Total Capacity {dsSortConfig.column === 'total_capacity_gb' ? (dsSortConfig.direction === 'asc' ? ' ↑' : ' ↓') : ''}
                    </th>
                    <th className={`table-header-cell-sortable${dsSortConfig.column === 'available_capacity_gb' ? ' active' : ''}`} onClick={() => requestDsSort('available_capacity_gb')}>
                      Available {dsSortConfig.column === 'available_capacity_gb' ? (dsSortConfig.direction === 'asc' ? ' ↑' : ' ↓') : ''}
                    </th>
                    <th className="table-header-cell">Default</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedDatastores.map((ds: Datastore, i: number) => (
                    <tr
                      key={ds.name}
                      className="table-row-clickable"
                      onClick={() => navigate(`/storage/datastores/${ds.name}`)}
                      style={i < 8 ? {
                        animation: `fadeInRow 0.3s ease-out both`,
                        animationDelay: `${0.05 + i * 0.04}s`,
                      } : undefined}
                    >
                      <td className="table-cell" style={{ color: theme.text.primary, fontWeight: 500, fontSize: 14, fontFamily: theme.typography.mono.fontFamily }}>
                        {ds.name}
                      </td>
                      <td className="table-cell" style={{ color: theme.text.secondary, fontSize: 12, fontFamily: theme.typography.mono.fontFamily }}>
                        {ds.provisioner}
                      </td>
                      <td className="table-cell">
                        <Badge
                          label={ds.provider_type}
                          color={providerColor[ds.provider_type] ?? theme.text.dim}
                        />
                      </td>
                      <td className="table-cell" style={{ color: theme.text.secondary, fontSize: 13, fontFamily: theme.typography.mono.fontFamily }}>
                        {ds.pv_count}
                      </td>
                      <td className="table-cell" style={{ color: theme.text.secondary, fontSize: 13, fontFamily: theme.typography.mono.fontFamily }}>
                        {ds.total_capacity_gb > 0 ? `${ds.total_capacity_gb} GB` : '—'}
                      </td>
                      <td className="table-cell" style={{ color: theme.text.secondary, fontSize: 13, fontFamily: theme.typography.mono.fontFamily }}>
                        {ds.available_capacity_gb != null ? `${ds.available_capacity_gb} GB` : '—'}
                      </td>
                      <td className="table-cell">
                        {ds.is_default && (
                          <Badge label="Default" color={theme.status.running} />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          </div>
        </div>
      )}

      <ConfirmModal
        open={!!confirmAction}
        title={confirmAction?.title ?? ''}
        message={confirmAction?.message ?? ''}
        danger={confirmAction?.danger}
        confirmLabel={confirmAction?.confirmLabel ?? 'Confirm'}
        onConfirm={() => confirmAction?.onConfirm()}
        onCancel={() => setConfirmAction(null)}
      />

      <Modal open={!!resizeTarget} onClose={() => setResizeTarget(null)} title="Resize Disk">
        <form onSubmit={submitResize}>
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Current Size</label>
            <div style={{ fontSize: 14, color: theme.text.primary, fontWeight: 500, fontFamily: theme.typography.mono.fontFamily }}>
              {resizeTarget?.currentSize ?? 0} GB
            </div>
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>New Size (GB)</label>
            <input
              type="number"
              min={(resizeTarget?.currentSize ?? 0) + 1}
              value={resizeSize}
              onChange={(e) => setResizeSize(Number(e.target.value))}
              style={inputStyle}
            />
            <div style={{ fontSize: 11, color: theme.text.dim, marginTop: 4 }}>
              Only expansion is supported. New size must be larger than current size.
            </div>
          </div>
          {error && (
            <div style={{ color: theme.status.error, fontSize: 13, marginBottom: 8 }}>{error}</div>
          )}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
            <button
              type="button"
              onClick={() => setResizeTarget(null)}
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
              disabled={resizeDisk.isPending || resizeSize <= (resizeTarget?.currentSize ?? 0)}
              style={{
                background: theme.button.primary,
                border: 'none',
                color: theme.button.primaryText,
                borderRadius: theme.radius.md,
                padding: '7px 16px',
                fontSize: 13,
                fontWeight: 500,
                cursor: resizeDisk.isPending ? 'not-allowed' : 'pointer',
                fontFamily: 'inherit',
                opacity: resizeDisk.isPending ? 0.7 : 1,
              }}
            >
              {resizeDisk.isPending ? 'Resizing...' : 'Resize Disk'}
            </button>
          </div>
        </form>
      </Modal>

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="New Disk">
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Name</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="my-disk"
              style={inputStyle}
            />
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Size (GB)</label>
            <input
              type="number"
              min={1}
              value={form.size_gb}
              onChange={(e) => setForm((f) => ({ ...f, size_gb: Number(e.target.value) }))}
              style={inputStyle}
            />
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Performance Tier</label>
            <input
              type="text"
              value={form.performance_tier}
              onChange={(e) => setForm((f) => ({ ...f, performance_tier: e.target.value }))}
              placeholder="e.g. SSD, NVMe, HDD"
              style={inputStyle}
            />
          </div>
          <YamlPreview
            endpoint={`/clusters/${activeCluster}/namespaces/${activeNamespace}/disks/preview`}
            payload={{ name: form.name, namespace: activeNamespace, size_gb: Number(form.size_gb), performance_tier: form.performance_tier, labels: {} }}
          />
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
              disabled={createDisk.isPending}
              style={{
                background: theme.button.primary,
                border: 'none',
                color: theme.button.primaryText,
                borderRadius: theme.radius.md,
                padding: '7px 16px',
                fontSize: 13,
                fontWeight: 500,
                cursor: createDisk.isPending ? 'not-allowed' : 'pointer',
                fontFamily: 'inherit',
                opacity: createDisk.isPending ? 0.7 : 1,
              }}
            >
              {createDisk.isPending ? 'Creating...' : 'Create Disk'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}

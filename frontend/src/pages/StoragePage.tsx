import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { TopBar } from '@/components/layout/TopBar'
import { useDisks, useCreateDisk, useDeleteDisk } from '@/hooks/useDisks'
import { theme } from '@/lib/theme'
import { useUIStore } from '@/stores/ui-store'
import { Modal } from '@/components/ui/Modal'
import { EmptyState } from '@/components/ui/EmptyState'
import { TableSkeleton } from '@/components/ui/Skeleton'
import { HardDrive } from 'lucide-react'
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

interface Disk {
  name: string
  size_gb?: number
  performance_tier?: string
  status?: string
  attached_vm?: string | null
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
  const { activeNamespace } = useUIStore()
  const { data, isLoading } = useDisks()
  const createDisk = useCreateDisk()
  const deleteDisk = useDeleteDisk()
  const disks: Disk[] = Array.isArray(data?.items) ? data.items : Array.isArray(data) ? data : []
  const [showCreate, setShowCreate] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState<DiskForm>({
    name: '',
    size_gb: 20,
    performance_tier: '',
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
    if (!confirm(`Delete disk "${name}"?`)) return
    deleteDisk.mutate(name)
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
        const e = err as { message?: string }
        setError(e.message ?? 'Failed to create disk')
      },
    })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <TopBar
        title="Disks"
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
            + New Disk
          </button>
        }
      />

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
                  {['Name', 'Size (GB)', 'Performance Tier', 'Status', 'Attached VM', 'Actions'].map((col) => (
                    <th
                      key={col}
                      className="table-header-cell"
                    >
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {disks.map((disk, i) => (
                  <tr
                    key={disk.name}
                    className="table-row-clickable"
                    onClick={() => navigate(`/storage/${activeNamespace}/${disk.name}`)}
                    style={i < 8 ? {
                      animation: `fadeInRow 0.3s ease-out both`,
                      animationDelay: `${0.05 + i * 0.04}s`,
                    } : undefined}
                  >
                    <td className="table-cell" style={{ color: theme.text.primary, fontWeight: 500, fontSize: 14, fontFamily: theme.typography.mono.fontFamily }}>{disk.name}</td>
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
                        actions={[{ label: 'Delete', action: 'delete', danger: true }]}
                        onAction={(action) => {
                          if (action === 'delete') handleDelete(disk.name)
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

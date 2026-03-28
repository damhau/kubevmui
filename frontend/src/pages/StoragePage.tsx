import { useState, useRef, useEffect } from 'react'
import { TopBar } from '@/components/layout/TopBar'
import { useDisks, useCreateDisk, useDeleteDisk } from '@/hooks/useDisks'
import { theme } from '@/lib/theme'
import { Modal } from '@/components/ui/Modal'
import { EmptyState } from '@/components/ui/EmptyState'
import { TableSkeleton } from '@/components/ui/Skeleton'
import { HardDrive } from 'lucide-react'

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

export function StoragePage() {
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

      <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
        <div
          style={{
            background: theme.main.card,
            border: `1px solid ${theme.main.cardBorder}`,
            borderRadius: theme.radius.lg,
          }}
        >
          {isLoading ? (
            <TableSkeleton rows={3} cols={6} />
          ) : disks.length === 0 ? (
            <EmptyState
              icon={<HardDrive size={24} />}
              title="No Disks"
              description="Create persistent disks for your virtual machines."
            />
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: theme.main.tableHeaderBg, borderBottom: `1px solid ${theme.main.tableRowBorder}` }}>
                  {['Name', 'Size (GB)', 'Performance Tier', 'Status', 'Attached VM', 'Actions'].map((col) => (
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
                {disks.map((disk) => (
                  <tr
                    key={disk.name}
                    style={{ borderBottom: `1px solid ${theme.main.tableRowBorder}` }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = theme.main.hoverBg)}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    <td style={{ padding: '10px 16px', color: theme.text.primary, fontWeight: 500, fontSize: 14 }}>{disk.name}</td>
                    <td style={{ padding: '10px 16px', color: theme.text.secondary, fontSize: 13 }}>
                      {disk.size_gb != null ? disk.size_gb : '—'}
                    </td>
                    <td style={{ padding: '10px 16px' }}>
                      {disk.performance_tier ? (
                        <Badge
                          label={disk.performance_tier}
                          color={tierColor[disk.performance_tier] ?? theme.text.dim}
                        />
                      ) : (
                        <span style={{ color: theme.text.dim }}>—</span>
                      )}
                    </td>
                    <td style={{ padding: '10px 16px' }}>
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
                    <td style={{ padding: '10px 16px', color: theme.text.secondary, fontSize: 13 }}>
                      {disk.attached_vm ?? '—'}
                    </td>
                    <td style={{ padding: '10px 16px' }}>
                      <ActionsMenu
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

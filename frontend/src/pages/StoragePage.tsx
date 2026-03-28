import { useState } from 'react'
import { TopBar } from '@/components/layout/TopBar'
import { useDisks } from '@/hooks/useDisks'
import { theme } from '@/lib/theme'
import { Modal } from '@/components/ui/Modal'

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
  const { data, isLoading } = useDisks()
  const disks: Disk[] = Array.isArray(data) ? data : []
  const [showCreate, setShowCreate] = useState(false)
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    // TODO: wire up mutation
    setShowCreate(false)
    setForm({ name: '', size_gb: 20, performance_tier: '' })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <TopBar
        title="Disks"
        action={
          <button
            onClick={() => setShowCreate(true)}
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
            <div style={{ padding: 40, textAlign: 'center', color: theme.text.dim, fontSize: 13 }}>
              Loading disks...
            </div>
          ) : disks.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: theme.text.dim, fontSize: 13 }}>
              No disks found.
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: theme.main.tableHeaderBg, borderBottom: `1px solid ${theme.main.tableRowBorder}` }}>
                  {['Name', 'Size (GB)', 'Performance Tier', 'Status', 'Attached VM'].map((col) => (
                    <th
                      key={col}
                      style={{
                        padding: '10px 16px',
                        textAlign: 'left',
                        color: theme.text.dim,
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
                {disks.map((disk) => (
                  <tr
                    key={disk.name}
                    style={{ borderBottom: `1px solid ${theme.main.tableRowBorder}` }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = theme.main.hoverBg)}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    <td style={{ padding: '10px 16px', color: theme.text.primary, fontWeight: 500 }}>{disk.name}</td>
                    <td style={{ padding: '10px 16px', color: theme.text.dim }}>
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
                            fontSize: 12,
                            color: diskStatusColor[disk.status] ?? theme.text.dim,
                          }}
                        >
                          <span
                            style={{
                              width: 7,
                              height: 7,
                              borderRadius: '50%',
                              background: diskStatusColor[disk.status] ?? theme.text.dim,
                              flexShrink: 0,
                            }}
                          />
                          {disk.status}
                        </span>
                      ) : (
                        <span style={{ color: theme.text.dim }}>—</span>
                      )}
                    </td>
                    <td style={{ padding: '10px 16px', color: theme.text.dim }}>
                      {disk.attached_vm ?? '—'}
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
              style={{
                background: theme.button.primary,
                border: 'none',
                color: theme.button.primaryText,
                borderRadius: theme.radius.md,
                padding: '7px 16px',
                fontSize: 13,
                fontWeight: 500,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              Create Disk
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}

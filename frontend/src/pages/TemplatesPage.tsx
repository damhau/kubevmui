import { useState } from 'react'
import { TopBar } from '@/components/layout/TopBar'
import { useTemplates } from '@/hooks/useTemplates'
import { theme } from '@/lib/theme'
import { Modal } from '@/components/ui/Modal'

const categoryColor: Record<string, string> = {
  OS: theme.status.provisioning,
  Application: theme.accent,
  Custom: theme.status.migrating,
  Base: theme.status.running,
}

interface Template {
  name: string
  category?: string
  os_type?: string
  cpu?: number
  memory?: string
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

interface TemplateForm {
  display_name: string
  name: string
  category: string
  os_type: string
  cpu: number
  memory_mb: number
}

export function TemplatesPage() {
  const { data, isLoading } = useTemplates()
  const templates: Template[] = Array.isArray(data) ? data : []
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState<TemplateForm>({
    display_name: '',
    name: '',
    category: 'linux',
    os_type: '',
    cpu: 2,
    memory_mb: 2048,
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

  const handleDisplayNameChange = (val: string) => {
    setForm((f) => ({
      ...f,
      display_name: val,
      name: val.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, ''),
    }))
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    // TODO: wire up mutation
    setShowCreate(false)
    setForm({ display_name: '', name: '', category: 'linux', os_type: '', cpu: 2, memory_mb: 2048 })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <TopBar
        title="Templates"
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
            + New Template
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
              Loading templates...
            </div>
          ) : templates.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: theme.text.dim, fontSize: 13 }}>
              No templates found. Create one to get started.
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: theme.main.tableHeaderBg, borderBottom: `1px solid ${theme.main.tableRowBorder}` }}>
                  {['Name', 'Category', 'OS Type', 'CPU', 'Memory'].map((col) => (
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
                {templates.map((tpl) => (
                  <tr
                    key={tpl.name}
                    style={{ borderBottom: `1px solid ${theme.main.tableRowBorder}` }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = theme.main.hoverBg)}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    <td style={{ padding: '10px 16px', color: theme.text.primary, fontWeight: 500 }}>{tpl.name}</td>
                    <td style={{ padding: '10px 16px' }}>
                      {tpl.category ? (
                        <Badge
                          label={tpl.category}
                          color={categoryColor[tpl.category] ?? theme.text.dim}
                        />
                      ) : (
                        <span style={{ color: theme.text.dim }}>—</span>
                      )}
                    </td>
                    <td style={{ padding: '10px 16px', color: theme.text.dim }}>{tpl.os_type ?? '—'}</td>
                    <td style={{ padding: '10px 16px', color: theme.text.dim }}>{tpl.cpu ? `${tpl.cpu} vCPU` : '—'}</td>
                    <td style={{ padding: '10px 16px', color: theme.text.dim }}>{tpl.memory ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="New Template">
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Display Name</label>
            <input
              type="text"
              value={form.display_name}
              onChange={(e) => handleDisplayNameChange(e.target.value)}
              placeholder="My Template"
              style={inputStyle}
            />
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Name (auto-generated)</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="my-template"
              style={inputStyle}
            />
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Category</label>
            <select
              value={form.category}
              onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
              style={inputStyle}
            >
              <option value="linux">Linux</option>
              <option value="windows">Windows</option>
              <option value="custom">Custom</option>
            </select>
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>OS Type</label>
            <input
              type="text"
              value={form.os_type}
              onChange={(e) => setForm((f) => ({ ...f, os_type: e.target.value }))}
              placeholder="e.g. ubuntu22.04"
              style={inputStyle}
            />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
            <div>
              <label style={labelStyle}>CPU Cores</label>
              <input
                type="number"
                min={1}
                max={64}
                value={form.cpu}
                onChange={(e) => setForm((f) => ({ ...f, cpu: Number(e.target.value) }))}
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Memory (MB)</label>
              <input
                type="number"
                min={512}
                step={512}
                value={form.memory_mb}
                onChange={(e) => setForm((f) => ({ ...f, memory_mb: Number(e.target.value) }))}
                style={inputStyle}
              />
            </div>
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
              Create Template
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}

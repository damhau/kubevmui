import { useState } from 'react'
import { TopBar } from '@/components/layout/TopBar'
import { useSSHKeys, useCreateSSHKey, useDeleteSSHKey } from '@/hooks/useSSHKeys'
import { theme } from '@/lib/theme'
import { Modal } from '@/components/ui/Modal'

interface SSHKey {
  name: string
  namespace: string
  public_key: string
  created_at: string | null
}

interface SSHKeyForm {
  name: string
  public_key: string
}

function truncateKey(key: string, maxLen = 60): string {
  if (key.length <= maxLen) return key
  return key.substring(0, maxLen) + '...'
}

function formatDate(iso: string | null): string {
  if (!iso) return '\u2014'
  try {
    return new Date(iso).toLocaleString()
  } catch {
    return '\u2014'
  }
}

export function SSHKeysPage() {
  const { data, isLoading } = useSSHKeys()
  const createSSHKey = useCreateSSHKey()
  const deleteSSHKey = useDeleteSSHKey()
  const keys: SSHKey[] = data?.items ?? []
  const [showCreate, setShowCreate] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState<SSHKeyForm>({ name: '', public_key: '' })

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
    setError(null)
    createSSHKey.mutate(form, {
      onSuccess: () => {
        setShowCreate(false)
        setForm({ name: '', public_key: '' })
      },
      onError: (err: unknown) => {
        const e = err as { message?: string }
        setError(e.message ?? 'Failed to create SSH key')
      },
    })
  }

  const handleDelete = (name: string) => {
    if (!confirm(`Delete SSH key "${name}"?`)) return
    deleteSSHKey.mutate(name)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <TopBar
        title="SSH Keys"
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
            + Add SSH Key
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
              Loading SSH keys...
            </div>
          ) : keys.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: theme.text.dim, fontSize: 13 }}>
              No SSH keys found.
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: theme.main.tableHeaderBg, borderBottom: `1px solid ${theme.main.tableRowBorder}` }}>
                  {['Name', 'Public Key', 'Created', ''].map((col) => (
                    <th
                      key={col || 'actions'}
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
                {keys.map((key) => (
                  <tr
                    key={key.name}
                    style={{ borderBottom: `1px solid ${theme.main.tableRowBorder}` }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = theme.main.hoverBg)}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    <td style={{ padding: '10px 16px', color: theme.text.primary, fontWeight: 500, fontSize: 14 }}>
                      {key.name}
                    </td>
                    <td
                      style={{
                        padding: '10px 16px',
                        color: theme.text.secondary,
                        fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace",
                        fontSize: 12,
                        maxWidth: 400,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                      title={key.public_key}
                    >
                      {truncateKey(key.public_key)}
                    </td>
                    <td style={{ padding: '10px 16px', color: theme.text.secondary, fontSize: 13 }}>
                      {formatDate(key.created_at)}
                    </td>
                    <td style={{ padding: '10px 16px', textAlign: 'right' }}>
                      <button
                        onClick={() => handleDelete(key.name)}
                        disabled={deleteSSHKey.isPending}
                        style={{
                          background: 'transparent',
                          border: `1px solid ${theme.status.error}40`,
                          color: theme.status.error,
                          borderRadius: theme.radius.sm,
                          padding: '4px 10px',
                          fontSize: 12,
                          cursor: deleteSSHKey.isPending ? 'not-allowed' : 'pointer',
                          fontFamily: 'inherit',
                          opacity: deleteSSHKey.isPending ? 0.5 : 1,
                        }}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Add SSH Key">
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Name</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="my-ssh-key"
              style={inputStyle}
            />
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Public Key</label>
            <textarea
              value={form.public_key}
              onChange={(e) => setForm((f) => ({ ...f, public_key: e.target.value }))}
              placeholder="ssh-rsa AAAAB3... user@host"
              rows={4}
              style={{
                ...inputStyle,
                resize: 'vertical',
                fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace",
                fontSize: 12,
              }}
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
              disabled={createSSHKey.isPending || !form.name || !form.public_key}
              style={{
                background: theme.button.primary,
                border: 'none',
                color: theme.button.primaryText,
                borderRadius: theme.radius.md,
                padding: '7px 16px',
                fontSize: 13,
                fontWeight: 500,
                cursor: createSSHKey.isPending || !form.name || !form.public_key ? 'not-allowed' : 'pointer',
                fontFamily: 'inherit',
                opacity: createSSHKey.isPending || !form.name || !form.public_key ? 0.7 : 1,
              }}
            >
              {createSSHKey.isPending ? 'Adding...' : 'Add SSH Key'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}

import { useState, useRef, useEffect } from 'react'
import { TopBar } from '@/components/layout/TopBar'
import { useImages, useCreateImage, useDeleteImage, useStorageClasses } from '@/hooks/useImages'
import { theme } from '@/lib/theme'
import { Modal } from '@/components/ui/Modal'

const osColor: Record<string, string> = {
  linux: theme.status.running,
  windows: theme.status.provisioning,
}

const sourceColor: Record<string, string> = {
  http: theme.status.migrating,
  pvc: theme.status.running,
  registry: theme.status.provisioning,
}

interface ImageItem {
  name: string
  display_name?: string
  description?: string
  os_type?: string
  source_type?: string
  source_url?: string
  size_gb?: number
  storage_class?: string
  created_at?: string
  dv_phase?: string
  dv_progress?: string
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

interface ImageForm {
  display_name: string
  name: string
  description: string
  os_type: string
  source_type: string
  source_url: string
  size_gb: number
  storage_class: string
}

const SUGGESTIONS = [
  {
    label: 'Rocky Linux 10 (Registry)',
    name: 'rocky10-golden',
    display_name: 'Rocky Linux 10',
    os_type: 'linux',
    source_type: 'registry',
    source_url: 'docker://docker.io/damienh/rocky10-disk:10.1',
  },
  {
    label: 'Alpine Linux (HTTP)',
    name: 'alpine-http',
    display_name: 'Alpine Linux',
    os_type: 'linux',
    source_type: 'http',
    source_url: 'https://dl-cdn.alpinelinux.org/alpine/v3.19/releases/x86_64/alpine-virt-3.19.1-x86_64.iso',
  },
  {
    label: 'Ubuntu 24.04 (HTTP)',
    name: 'ubuntu-2404',
    display_name: 'Ubuntu 24.04',
    os_type: 'linux',
    source_type: 'http',
    source_url: 'https://cloud-images.ubuntu.com/noble/current/noble-server-cloudimg-amd64.img',
  },
]

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

export function ImagesPage() {
  const { data, isLoading } = useImages()
  const createImage = useCreateImage()
  const deleteImage = useDeleteImage()
  const { data: storageClassData } = useStorageClasses()
  const storageClasses: string[] = Array.isArray(storageClassData?.items) ? storageClassData.items.map((sc: { name: string }) => sc.name) : []
  const images: ImageItem[] = Array.isArray(data?.items) ? data.items : []
  const [showCreate, setShowCreate] = useState(false)
  const [editingName, setEditingName] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const defaultForm: ImageForm = {
    display_name: '',
    name: '',
    description: '',
    os_type: 'linux',
    source_type: 'registry',
    source_url: '',
    size_gb: 20,
    storage_class: '',
  }
  const [form, setForm] = useState<ImageForm>(defaultForm)

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
      name: val
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, ''),
    }))
  }

  const applySuggestion = (s: (typeof SUGGESTIONS)[number]) => {
    setForm({
      display_name: s.display_name,
      name: s.name,
      description: '',
      os_type: s.os_type,
      source_type: s.source_type,
      source_url: s.source_url,
      size_gb: 20,
      storage_class: '',
    })
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    const payload = { ...form, source_url: form.source_url.trim() }
    const resetAndClose = () => {
      setShowCreate(false)
      setEditingName(null)
      setForm(defaultForm)
    }
    if (editingName) {
      deleteImage.mutate(editingName, {
        onSuccess: () => {
          createImage.mutate(payload, {
            onSuccess: resetAndClose,
            onError: (err: unknown) => { setError((err as { message?: string }).message ?? 'Failed to save image') },
          })
        },
        onError: (err: unknown) => { setError((err as { message?: string }).message ?? 'Failed to update image') },
      })
      return
    }
    createImage.mutate(payload, {
      onSuccess: resetAndClose,
      onError: (err: unknown) => {
        const e = err as { message?: string }
        setError(e.message ?? 'Failed to create image')
      },
    })
  }

  const handleImageAction = (img: ImageItem, action: string) => {
    if (action === 'edit') {
      setForm({
        display_name: img.display_name || img.name,
        name: img.name,
        description: img.description || '',
        os_type: img.os_type || 'linux',
        source_type: img.source_type || 'registry',
        source_url: img.source_url || '',
        size_gb: img.size_gb ?? 20,
        storage_class: img.storage_class || '',
      })
      setEditingName(img.name)
      setError(null)
      setShowCreate(true)
      return
    }
    if (action === 'duplicate') {
      const newName = window.prompt('New image name:', `${img.name}-copy`)
      if (!newName) return
      createImage.mutate({
        name: newName,
        display_name: `${img.display_name || img.name} (copy)`,
        description: img.description,
        os_type: img.os_type,
        source_type: img.source_type,
        source_url: img.source_url?.trim(),
        size_gb: img.size_gb ?? 20,
        storage_class: img.storage_class,
      })
      return
    }
    if (action === 'reimport') {
      if (!window.confirm(`Re-import "${img.display_name || img.name}"? This will delete and recreate the DataVolume.`)) return
      deleteImage.mutate(img.name, {
        onSuccess: () => {
          createImage.mutate({
            name: img.name,
            display_name: img.display_name,
            description: img.description,
            os_type: img.os_type,
            source_type: img.source_type,
            source_url: img.source_url?.trim(),
            size_gb: img.size_gb ?? 20,
            storage_class: img.storage_class,
          })
        },
      })
      return
    }
    if (action === 'delete') {
      if (!window.confirm(`Delete image "${img.display_name || img.name}"?`)) return
      deleteImage.mutate(img.name)
    }
  }

  const formatDate = (d?: string) => {
    if (!d) return '\u2014'
    try {
      return new Date(d).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
    } catch {
      return '\u2014'
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <TopBar
        title="Boot Source Images"
        action={
          <button
            onClick={() => {
              setForm(defaultForm)
              setEditingName(null)
              setError(null)
              setShowCreate(true)
            }}
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
            + Add Image
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
            <div
              style={{
                padding: 40,
                textAlign: 'center',
                color: theme.text.dim,
                fontSize: 13,
              }}
            >
              Loading images...
            </div>
          ) : images.length === 0 ? (
            <div
              style={{
                padding: 40,
                textAlign: 'center',
                color: theme.text.dim,
                fontSize: 13,
              }}
            >
              No boot source images found. Click &quot;+ Add Image&quot; to register one.
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr
                  style={{
                    background: theme.main.tableHeaderBg,
                    borderBottom: `1px solid ${theme.main.tableRowBorder}`,
                  }}
                >
                  {[
                    'Name',
                    'Display Name',
                    'OS Type',
                    'Source Type',
                    'Source URL',
                    'Status',
                    'Created',
                    'Actions',
                  ].map((col) => (
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
                {images.map((img) => (
                  <tr
                    key={img.name}
                    style={{
                      borderBottom: `1px solid ${theme.main.tableRowBorder}`,
                    }}
                    onMouseEnter={(e) =>
                      (e.currentTarget.style.background = theme.main.hoverBg)
                    }
                    onMouseLeave={(e) =>
                      (e.currentTarget.style.background = 'transparent')
                    }
                  >
                    <td
                      style={{
                        padding: '10px 16px',
                        color: theme.text.primary,
                        fontWeight: 500,
                        fontSize: 13,
                        ...theme.typography.mono,
                      }}
                    >
                      {img.name}
                    </td>
                    <td
                      style={{
                        padding: '10px 16px',
                        color: theme.text.primary,
                        fontSize: 13,
                      }}
                    >
                      {img.display_name || '\u2014'}
                    </td>
                    <td style={{ padding: '10px 16px' }}>
                      {img.os_type ? (
                        <Badge
                          label={img.os_type}
                          color={osColor[img.os_type] ?? theme.text.dim}
                        />
                      ) : (
                        <span style={{ color: theme.text.dim }}>{'\u2014'}</span>
                      )}
                    </td>
                    <td style={{ padding: '10px 16px' }}>
                      {img.source_type ? (
                        <Badge
                          label={img.source_type.replace('_', ' ')}
                          color={
                            sourceColor[img.source_type] ?? theme.text.dim
                          }
                        />
                      ) : (
                        <span style={{ color: theme.text.dim }}>{'\u2014'}</span>
                      )}
                    </td>
                    <td
                      style={{
                        padding: '10px 16px',
                        color: theme.text.secondary,
                        fontSize: 12,
                        maxWidth: 260,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        ...theme.typography.mono,
                      }}
                      title={img.source_url}
                    >
                      {img.source_url || '\u2014'}
                    </td>
                    <td style={{ padding: '10px 16px', minWidth: 160 }}>
                      {(() => {
                        const phase = img.dv_phase || 'Pending'
                        const progress = img.dv_progress && img.dv_progress !== 'N/A' ? img.dv_progress : null
                        const pct = progress ? parseFloat(progress.replace('%', '')) : 0
                        const isActive = ['ImportScheduled', 'ImportInProgress', 'CloneScheduled', 'CloneInProgress', 'Pending'].includes(phase)
                        const isDone = phase === 'Succeeded'
                        const isFailed = phase === 'Failed'

                        if (isDone) return <Badge label="Ready" color={theme.status.running} />
                        if (isFailed) return <Badge label="Failed" color={theme.status.error} />

                        return (
                          <div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                              <span style={{ fontSize: 11, color: theme.text.secondary }}>
                                {phase === 'Pending' || phase === 'ImportScheduled' ? 'Scheduling...' : 'Importing...'}
                              </span>
                              {progress && (
                                <span style={{ fontSize: 11, fontWeight: 600, color: theme.status.provisioning }}>
                                  {progress}
                                </span>
                              )}
                            </div>
                            <div style={{
                              height: 6,
                              background: theme.main.inputBg,
                              borderRadius: 3,
                              overflow: 'hidden',
                              border: `1px solid ${theme.main.inputBorder}`,
                            }}>
                              <div style={{
                                height: '100%',
                                width: isActive && progress ? `${Math.min(pct, 100)}%` : '0%',
                                background: theme.status.provisioning,
                                borderRadius: 3,
                                transition: 'width 0.5s ease',
                                ...(isActive && !progress ? {
                                  width: '100%',
                                  opacity: 0.4,
                                } : {}),
                              }} />
                            </div>
                          </div>
                        )
                      })()}
                    </td>
                    <td
                      style={{
                        padding: '10px 16px',
                        color: theme.text.secondary,
                        fontSize: 13,
                      }}
                    >
                      {formatDate(img.created_at)}
                    </td>
                    <td style={{ padding: '10px 16px' }}>
                      <ActionsMenu
                        actions={[
                          { label: 'Edit', action: 'edit' },
                          { label: 'Duplicate', action: 'duplicate' },
                          { label: 'Re-import', action: 'reimport' },
                          { label: 'Delete', action: 'delete', danger: true },
                        ]}
                        onAction={(action) => handleImageAction(img, action)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <Modal
        open={showCreate}
        onClose={() => { setShowCreate(false); setEditingName(null) }}
        title={editingName ? 'Edit Boot Source Image' : 'Add Boot Source Image'}
        maxWidth={540}
      >
        <form onSubmit={handleSubmit}>
          {/* Suggestions */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ ...labelStyle, marginBottom: 8 }}>
              Quick presets
            </label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {SUGGESTIONS.map((s) => (
                <button
                  key={s.name}
                  type="button"
                  onClick={() => applySuggestion(s)}
                  style={{
                    background:
                      form.name === s.name ? theme.accentLight : 'transparent',
                    border: `1px solid ${form.name === s.name ? theme.accent : theme.main.inputBorder}`,
                    color:
                      form.name === s.name
                        ? theme.accent
                        : theme.text.secondary,
                    borderRadius: theme.radius.md,
                    padding: '5px 10px',
                    fontSize: 12,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Display Name</label>
            <input
              type="text"
              value={form.display_name}
              onChange={(e) => handleDisplayNameChange(e.target.value)}
              placeholder="e.g. Ubuntu 22.04"
              style={inputStyle}
            />
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Name (auto-generated)</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="ubuntu-2204"
              style={inputStyle}
            />
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Description</label>
            <input
              type="text"
              value={form.description}
              onChange={(e) =>
                setForm((f) => ({ ...f, description: e.target.value }))
              }
              placeholder="Optional description"
              style={inputStyle}
            />
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 12,
              marginBottom: 14,
            }}
          >
            <div>
              <label style={labelStyle}>OS Type</label>
              <select
                value={form.os_type}
                onChange={(e) =>
                  setForm((f) => ({ ...f, os_type: e.target.value }))
                }
                style={inputStyle}
              >
                <option value="linux">Linux</option>
                <option value="windows">Windows</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>Source Type</label>
              <select
                value={form.source_type}
                onChange={(e) =>
                  setForm((f) => ({ ...f, source_type: e.target.value }))
                }
                style={inputStyle}
              >
                <option value="registry">Registry</option>
                <option value="http">HTTP</option>
                <option value="registry">Registry</option>
              </select>
            </div>
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Source URL</label>
            <input
              type="text"
              value={form.source_url}
              onChange={(e) =>
                setForm((f) => ({ ...f, source_url: e.target.value }))
              }
              placeholder={
                form.source_type === 'registry'
                  ? 'docker://docker.io/org/image:tag'
                  : 'https://example.com/disk.img'
              }
              style={inputStyle}
            />
          </div>
          <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 12,
                marginBottom: 14,
              }}
            >
              <div>
                <label style={labelStyle}>Size (GB)</label>
                <input
                  type="number"
                  min={1}
                  value={form.size_gb}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, size_gb: Number(e.target.value) || 1 }))
                  }
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>Storage Class</label>
                <select
                  value={form.storage_class}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, storage_class: e.target.value }))
                  }
                  style={inputStyle}
                >
                  <option value="">Default</option>
                  {storageClasses.map((sc) => (
                    <option key={sc} value={sc}>
                      {sc}
                    </option>
                  ))}
                </select>
              </div>
            </div>

          {error && (
            <div
              style={{
                color: theme.status.error,
                fontSize: 13,
                marginBottom: 8,
              }}
            >
              {error}
            </div>
          )}
          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              gap: 8,
              marginTop: 8,
            }}
          >
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
              disabled={createImage.isPending || !form.name}
              style={{
                background: theme.button.primary,
                border: 'none',
                color: theme.button.primaryText,
                borderRadius: theme.radius.md,
                padding: '7px 16px',
                fontSize: 13,
                fontWeight: 500,
                cursor:
                  createImage.isPending || !form.name
                    ? 'not-allowed'
                    : 'pointer',
                fontFamily: 'inherit',
                opacity: createImage.isPending || !form.name ? 0.7 : 1,
              }}
            >
              {createImage.isPending || deleteImage.isPending ? 'Saving...' : editingName ? 'Save Image' : 'Add Image'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { TopBar } from '@/components/layout/TopBar'
import { useImages, useCreateImage, useDeleteImage, useStorageClasses, useUploadImage } from '@/hooks/useImages'
import { useSortable } from '@/hooks/useSortable'
import { theme } from '@/lib/theme'
import { useUIStore } from '@/stores/ui-store'
import { Modal } from '@/components/ui/Modal'
import { YamlPreview } from '@/components/ui/YamlPreview'
import { extractErrorMessage } from '@/lib/api-client'
import { toast } from '@/components/ui/Toast'
import { ConfirmModal } from '@/components/ui/ConfirmModal'
import { PromptModal } from '@/components/ui/PromptModal'
import { EmptyState } from '@/components/ui/EmptyState'
import { TableSkeleton } from '@/components/ui/Skeleton'
import { Disc } from 'lucide-react'
import { DropdownMenu } from '@/components/ui/DropdownMenu'

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
  is_global: boolean
  media_type: string
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

export function ImagesPage() {
  const navigate = useNavigate()
  const { activeCluster, activeNamespace } = useUIStore()
  const { data, isLoading } = useImages()
  const createImage = useCreateImage()
  const deleteImage = useDeleteImage()
  const { data: storageClassData } = useStorageClasses()
  const storageClasses: string[] = Array.isArray(storageClassData?.items) ? storageClassData.items.map((sc: { name: string }) => sc.name) : []
  const images: ImageItem[] = Array.isArray(data?.items) ? data.items : []
  const { sorted: sortedImages, sortConfig, requestSort } = useSortable(images, { column: 'name', direction: 'asc' })
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
    is_global: false,
    media_type: 'disk',
  }
  const [form, setForm] = useState<ImageForm>(defaultForm)
  const { upload: uploadImage, progress: uploadProgress, isUploading, phase: uploadPhase } = useUploadImage()
  const [selectedFile, setSelectedFile] = useState<File | null>(null)

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
      is_global: false,
      media_type: 'disk',
    })
  }

  const [confirmAction, setConfirmAction] = useState<{ title: string; message: string; onConfirm: () => void; danger?: boolean } | null>(null)
  const [promptAction, setPromptAction] = useState<{ title: string; message: string; defaultValue: string; onConfirm: (value: string) => void } | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    const payload = { ...form, source_url: form.source_url.trim() }
    const resetAndClose = () => {
      setShowCreate(false)
      setEditingName(null)
      setForm(defaultForm)
      setSelectedFile(null)
    }

    if (form.source_type === 'upload' && selectedFile) {
      try {
        await uploadImage(selectedFile, {
          name: form.name,
          display_name: form.display_name,
          description: form.description,
          os_type: form.os_type,
          size_gb: form.size_gb,
          storage_class: form.storage_class,
          is_global: form.is_global,
          media_type: form.media_type,
        })
        resetAndClose()
        toast.success('Image uploaded successfully')
      } catch (err: unknown) {
        const msg = extractErrorMessage(err, 'Upload failed')
        setError(msg)
        toast.error(msg)
      }
      return
    }

    if (editingName) {
      deleteImage.mutate(editingName, {
        onSuccess: () => {
          createImage.mutate(payload, {
            onSuccess: () => { resetAndClose(); toast.success('Image saved') },
            onError: (err: unknown) => { const msg = extractErrorMessage(err, 'Failed to save image'); setError(msg); toast.error(msg) },
          })
        },
        onError: (err: unknown) => { const msg = extractErrorMessage(err, 'Failed to update image'); setError(msg); toast.error(msg) },
      })
      return
    }
    createImage.mutate(payload, {
      onSuccess: () => { resetAndClose(); toast.success('Image created') },
      onError: (err: unknown) => {
        const msg = extractErrorMessage(err, 'Failed to create image')
        setError(msg)
        toast.error(msg)
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
        is_global: (img as any).is_global ?? false,
        media_type: (img as any).media_type || 'disk',
      })
      setEditingName(img.name)
      setError(null)
      setShowCreate(true)
      return
    }
    if (action === 'duplicate') {
      setPromptAction({
        title: 'Duplicate Image',
        message: `Enter a name for the duplicated image:`,
        defaultValue: `${img.name}-copy`,
        onConfirm: (newName) => {
          createImage.mutate(
            {
              name: newName,
              display_name: `${img.display_name || img.name} (copy)`,
              description: img.description,
              os_type: img.os_type,
              source_type: img.source_type,
              source_url: img.source_url?.trim(),
              size_gb: img.size_gb ?? 20,
              storage_class: img.storage_class,
              is_global: (img as any).is_global ?? false,
            },
            {
              onSuccess: () => toast.success('Image duplicated'),
              onError: (err) => toast.error(extractErrorMessage(err, 'Failed to duplicate image')),
            },
          )
          setPromptAction(null)
        },
      })
      return
    }
    if (action === 'reimport') {
      setConfirmAction({
        title: 'Re-import Image',
        message: `Re-import "${img.display_name || img.name}"? This will delete and recreate the DataVolume.`,
        onConfirm: () => {
          deleteImage.mutate(img.name, {
            onSuccess: () => {
              createImage.mutate(
                {
                  name: img.name,
                  display_name: img.display_name,
                  description: img.description,
                  os_type: img.os_type,
                  source_type: img.source_type,
                  source_url: img.source_url?.trim(),
                  size_gb: img.size_gb ?? 20,
                  storage_class: img.storage_class,
                  is_global: (img as any).is_global ?? false,
                },
                {
                  onSuccess: () => toast.success('Re-import started'),
                  onError: (err) => toast.error(extractErrorMessage(err, 'Failed to re-import image')),
                },
              )
            },
            onError: (err) => toast.error(extractErrorMessage(err, 'Failed to delete image for re-import')),
          })
          setConfirmAction(null)
        },
      })
      return
    }
    if (action === 'delete') {
      setConfirmAction({
        title: 'Delete Image',
        message: `Delete image "${img.display_name || img.name}"? This action cannot be undone.`,
        danger: true,
        onConfirm: () => {
          deleteImage.mutate(img.name, {
            onSuccess: () => toast.success('Image deleted'),
            onError: (err) => toast.error(extractErrorMessage(err, 'Failed to delete image')),
          })
          setConfirmAction(null)
        },
      })
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

      <div className="page-content" style={{ animation: 'fadeInUp 0.35s ease-out' }}>
        <div className="page-container">
        <div className="card">
          {isLoading ? (
            <TableSkeleton rows={3} cols={8} />
          ) : images.length === 0 ? (
            <EmptyState
              icon={<Disc size={24} />}
              title="No Boot Source Images"
              description="Import OS images from container registries or HTTP sources."
              action={{ label: 'Add Image', onClick: () => { setForm(defaultForm); setEditingName(null); setError(null); setShowCreate(true) } }}
            />
          ) : (
            <table className="table">
              <thead>
                <tr className="table-header">
                  <th className={`table-header-cell-sortable${sortConfig.column === 'name' ? ' active' : ''}`} onClick={() => requestSort('name')}>
                    Name{sortConfig.column === 'name' ? (sortConfig.direction === 'asc' ? ' \u2191' : ' \u2193') : ''}
                  </th>
                  {activeNamespace === '_all' && (
                    <th className={`table-header-cell-sortable${sortConfig.column === 'namespace' ? ' active' : ''}`} onClick={() => requestSort('namespace')}>
                      Namespace{sortConfig.column === 'namespace' ? (sortConfig.direction === 'asc' ? ' \u2191' : ' \u2193') : ''}
                    </th>
                  )}
                  <th className={`table-header-cell-sortable${sortConfig.column === 'display_name' ? ' active' : ''}`} onClick={() => requestSort('display_name')}>
                    Display Name{sortConfig.column === 'display_name' ? (sortConfig.direction === 'asc' ? ' \u2191' : ' \u2193') : ''}
                  </th>
                  <th className={`table-header-cell-sortable${sortConfig.column === 'os_type' ? ' active' : ''}`} onClick={() => requestSort('os_type')}>
                    OS Type{sortConfig.column === 'os_type' ? (sortConfig.direction === 'asc' ? ' \u2191' : ' \u2193') : ''}
                  </th>
                  <th className={`table-header-cell-sortable${sortConfig.column === 'source_type' ? ' active' : ''}`} onClick={() => requestSort('source_type')}>
                    Source Type{sortConfig.column === 'source_type' ? (sortConfig.direction === 'asc' ? ' \u2191' : ' \u2193') : ''}
                  </th>
                  <th className={`table-header-cell-sortable${sortConfig.column === 'source_url' ? ' active' : ''}`} onClick={() => requestSort('source_url')}>
                    Source URL{sortConfig.column === 'source_url' ? (sortConfig.direction === 'asc' ? ' \u2191' : ' \u2193') : ''}
                  </th>
                  <th className={`table-header-cell-sortable${sortConfig.column === 'dv_phase' ? ' active' : ''}`} onClick={() => requestSort('dv_phase')}>
                    Status{sortConfig.column === 'dv_phase' ? (sortConfig.direction === 'asc' ? ' \u2191' : ' \u2193') : ''}
                  </th>
                  <th className={`table-header-cell-sortable${sortConfig.column === 'created_at' ? ' active' : ''}`} onClick={() => requestSort('created_at')}>
                    Created{sortConfig.column === 'created_at' ? (sortConfig.direction === 'asc' ? ' \u2191' : ' \u2193') : ''}
                  </th>
                  <th className="table-header-cell">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedImages.map((img, i) => (
                  <tr
                    key={img.name}
                    className="table-row-clickable"
                    onClick={() => navigate(`/images/${activeNamespace}/${img.name}`)}
                    style={i < 8 ? {
                      animation: `fadeInRow 0.3s ease-out both`,
                      animationDelay: `${0.05 + i * 0.04}s`,
                    } : undefined}
                  >
                    <td
                      className="table-cell"
                      style={{
                        color: theme.text.primary,
                        fontWeight: 500,
                        fontSize: 13,
                        ...theme.typography.mono,
                      }}
                    >
                      <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        {img.name}
                        {(img as any).is_global && (
                          <span style={{ fontSize: 10, fontWeight: 600, padding: '1px 6px', borderRadius: 3, background: `${theme.accent}15`, color: theme.accent, border: `1px solid ${theme.accent}40` }}>Global</span>
                        )}
                      </span>
                    </td>
                    {activeNamespace === '_all' && (
                      <td className="table-cell" style={{ color: theme.text.secondary, fontSize: 12 }}>{(img as any).namespace}</td>
                    )}
                    <td
                      className="table-cell"
                      style={{
                        color: theme.text.primary,
                        fontSize: 13,
                      }}
                    >
                      {img.display_name || '\u2014'}
                    </td>
                    <td className="table-cell">
                      {img.os_type ? (
                        <Badge
                          label={img.os_type}
                          color={osColor[img.os_type] ?? theme.text.dim}
                        />
                      ) : (
                        <span style={{ color: theme.text.dim }}>{'\u2014'}</span>
                      )}
                    </td>
                    <td className="table-cell">
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
                      className="table-cell"
                      style={{
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
                    <td className="table-cell" style={{ minWidth: 160 }}>
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
                              height: 10,
                              background: theme.main.inputBg,
                              borderRadius: 5,
                              overflow: 'hidden',
                              border: `1px solid ${theme.main.inputBorder}`,
                            }}>
                              <div style={{
                                height: '100%',
                                width: isActive && progress ? `${Math.min(pct, 100)}%` : '0%',
                                background: theme.status.provisioning,
                                borderRadius: 5,
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
                      className="table-cell"
                      style={{
                        color: theme.text.secondary,
                        fontSize: 13,
                      }}
                    >
                      {formatDate(img.created_at)}
                    </td>
                    <td className="table-cell" style={{ position: 'relative', zIndex: 10 }}>
                      <DropdownMenu
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
                <option value="upload">Upload</option>
              </select>
            </div>
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Media Type</label>
            <select
              value={form.media_type}
              onChange={(e) => setForm((f) => ({ ...f, media_type: e.target.value }))}
              style={inputStyle}
            >
              <option value="disk">Disk Image</option>
              <option value="iso">ISO (CD-ROM)</option>
            </select>
          </div>
          {form.source_type === 'upload' ? (
            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>File</label>
              <input
                type="file"
                accept=".iso,.img,.qcow2,.raw"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) {
                    setSelectedFile(file)
                    // Auto-detect media type from extension
                    if (file.name.toLowerCase().endsWith('.iso')) {
                      setForm((f) => ({ ...f, media_type: 'iso' }))
                    }
                    // Auto-set size from file size (round up to nearest GB)
                    const sizeGb = Math.max(1, Math.ceil(file.size / (1024 * 1024 * 1024)))
                    setForm((f) => ({ ...f, size_gb: sizeGb }))
                  }
                }}
                style={{
                  width: '100%',
                  background: theme.main.inputBg,
                  border: `1px solid ${theme.main.inputBorder}`,
                  borderRadius: theme.radius.md,
                  color: theme.text.primary,
                  fontSize: 13,
                  padding: '8px 12px',
                  fontFamily: 'inherit',
                }}
              />
              {selectedFile && (
                <div style={{ fontSize: 12, color: theme.text.secondary, marginTop: 4 }}>
                  {selectedFile.name} ({(selectedFile.size / (1024 * 1024)).toFixed(1)} MB)
                </div>
              )}
            </div>
          ) : (
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
          )}
          {isUploading && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: 12, color: theme.text.secondary }}>
                  {uploadPhase === 'writing' ? 'Writing to cluster storage...' : 'Uploading to server...'}
                </span>
                <span style={{ fontSize: 12, fontWeight: 600, color: theme.accent }}>{uploadProgress}%</span>
              </div>
              <div style={{ height: 6, background: theme.main.inputBg, borderRadius: 3, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${uploadProgress}%`, background: theme.accent, borderRadius: 3, transition: 'width 0.3s' }} />
              </div>
            </div>
          )}
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

            <div style={{ marginTop: 12 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: theme.text.primary, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={form.is_global}
                  onChange={(e) => setForm((f) => ({ ...f, is_global: e.target.checked }))}
                  style={{ width: 16, height: 16, accentColor: theme.accent }}
                />
                Global image (available across all namespaces)
              </label>
            </div>

          {!editingName && (
            <YamlPreview
              endpoint={`/clusters/${activeCluster}/namespaces/${activeNamespace}/images/preview`}
              payload={{ ...form, source_url: form.source_url.trim() }}
            />
          )}
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
              disabled={createImage.isPending || isUploading || !form.name}
              style={{
                background: theme.button.primary,
                border: 'none',
                color: theme.button.primaryText,
                borderRadius: theme.radius.md,
                padding: '7px 16px',
                fontSize: 13,
                fontWeight: 500,
                cursor:
                  createImage.isPending || isUploading || !form.name
                    ? 'not-allowed'
                    : 'pointer',
                fontFamily: 'inherit',
                opacity: createImage.isPending || isUploading || !form.name ? 0.7 : 1,
              }}
            >
              {uploadPhase === 'writing' ? 'Writing to cluster...' : isUploading ? 'Uploading...' : createImage.isPending || deleteImage.isPending ? 'Saving...' : editingName ? 'Save Image' : 'Add Image'}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmModal
        open={!!confirmAction}
        title={confirmAction?.title ?? ''}
        message={confirmAction?.message ?? ''}
        danger={confirmAction?.danger}
        confirmLabel={confirmAction?.danger ? 'Delete' : 'Confirm'}
        onConfirm={() => confirmAction?.onConfirm()}
        onCancel={() => setConfirmAction(null)}
      />
      <PromptModal
        open={!!promptAction}
        title={promptAction?.title ?? ''}
        message={promptAction?.message ?? ''}
        defaultValue={promptAction?.defaultValue ?? ''}
        onConfirm={(value) => promptAction?.onConfirm(value)}
        onCancel={() => setPromptAction(null)}
      />
    </div>
  )
}

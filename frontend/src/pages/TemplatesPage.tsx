import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { TopBar } from '@/components/layout/TopBar'
import { useTemplates, useCreateTemplate, useDeleteTemplate } from '@/hooks/useTemplates'
import { useAllNetworks } from '@/hooks/useNetworks'
import { useImages, useStorageClasses } from '@/hooks/useImages'
import { theme } from '@/lib/theme'
import { formatMemoryMb } from '@/lib/format'
import { useUIStore } from '@/stores/ui-store'
import { Modal } from '@/components/ui/Modal'
import { toast } from '@/components/ui/Toast'
import { ConfirmModal } from '@/components/ui/ConfirmModal'
import { PromptModal } from '@/components/ui/PromptModal'
import { EmptyState } from '@/components/ui/EmptyState'
import { TableSkeleton } from '@/components/ui/Skeleton'
import { Copy } from 'lucide-react'
import { DropdownMenu } from '@/components/ui/DropdownMenu'

const categoryColor: Record<string, string> = {
  OS: theme.status.provisioning,
  Application: theme.accent,
  Custom: theme.status.migrating,
  Base: theme.status.running,
}

interface Template {
  name: string
  display_name?: string
  category?: string
  os_type?: string
  compute?: { cpu_cores?: number; memory_mb?: number }
  disks?: unknown[]
  networks?: unknown[]
  cloud_init_user_data?: string
  cloud_init_network_data?: string
  autoattach_pod_interface?: boolean
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

const templateActions = [
  { label: 'Create VM', action: 'create-vm' },
  { label: 'Edit', action: 'edit' },
  { label: 'Duplicate', action: 'duplicate' },
  { label: 'Delete', action: 'delete', danger: true },
]

/* ── Form types ── */

interface TemplateDisk {
  name: string
  source_type: 'pvc' | 'container_disk' | 'datavolume_clone'
  size_gb: number
  bus: string
  image: string
  clone_source: string
  clone_namespace: string
  storage_class: string
}

interface TemplateNIC {
  name: string
  type: 'pod' | 'multus'
  network_profile: string
}

interface TemplateForm {
  display_name: string
  name: string
  category: string
  os_type: string
  cpu: number
  memory_mb: number
  disks: TemplateDisk[]
  nics: TemplateNIC[]
  cloud_init_user_data: string
  cloud_init_network_data: string
  autoattach_pod_interface: boolean
  is_global: boolean
}

const emptyDisk = (): TemplateDisk => ({
  name: '',
  source_type: 'container_disk',
  size_gb: 20,
  bus: 'virtio',
  image: '',
  clone_source: '',
  clone_namespace: '',
  storage_class: '',
})

const emptyNIC = (): TemplateNIC => ({
  name: '',
  type: 'multus',
  network_profile: '',
})

const defaultForm = (): TemplateForm => ({
  display_name: '',
  name: '',
  category: 'linux',
  os_type: '',
  cpu: 2,
  memory_mb: 2048,
  disks: [],
  nics: [],
  cloud_init_user_data: '',
  cloud_init_network_data: '',
  autoattach_pod_interface: true,
  is_global: false,
})

/* ── Styles ── */

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

const sectionLabelStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  color: theme.text.secondary,
  marginBottom: 10,
  marginTop: 20,
  paddingBottom: 6,
  borderBottom: `1px solid ${theme.main.cardBorder}`,
}

const smallBtnStyle: React.CSSProperties = {
  background: theme.button.secondary,
  border: `1px solid ${theme.button.secondaryBorder}`,
  color: theme.button.secondaryText,
  borderRadius: theme.radius.sm,
  padding: '4px 10px',
  fontSize: 12,
  cursor: 'pointer',
  fontFamily: 'inherit',
}

const removeBtnStyle: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  color: theme.status.error,
  cursor: 'pointer',
  fontSize: 16,
  padding: '2px 6px',
  lineHeight: 1,
  borderRadius: theme.radius.sm,
}

const textareaStyle: React.CSSProperties = {
  ...inputStyle,
  minHeight: 80,
  resize: 'vertical',
  fontFamily: theme.typography.mono.fontFamily,
  fontSize: 12,
}

/* ── Component ── */

export function TemplatesPage() {
  const navigate = useNavigate()
  const { activeNamespace } = useUIStore()
  const { data, isLoading } = useTemplates()
  const { data: allNADsData } = useAllNetworks()
  const availableNADs: Array<{ name: string; namespace: string; full_name: string; display_name: string }> =
    Array.isArray(allNADsData?.items) ? allNADsData.items : []
  const { data: imagesData } = useImages()
  const registeredImages: Array<{ name: string; namespace: string; display_name: string; source_type: string; source_url: string; size_gb: number }> =
    Array.isArray(imagesData?.items) ? imagesData.items : []
  const { data: storageClassData } = useStorageClasses()
  const storageClasses: Array<{ name: string; is_default: boolean }> =
    Array.isArray(storageClassData?.items) ? storageClassData.items : []
  const createTemplate = useCreateTemplate()
  const deleteTemplate = useDeleteTemplate()
  const templates: Template[] = Array.isArray(data?.items) ? data.items : Array.isArray(data) ? data : []
  const [showCreate, setShowCreate] = useState(false)
  const [editingName, setEditingName] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState<TemplateForm>(defaultForm)

  const [confirmAction, setConfirmAction] = useState<{ title: string; message: string; onConfirm: () => void; danger?: boolean } | null>(null)
  const [promptAction, setPromptAction] = useState<{ title: string; message: string; defaultValue: string; onConfirm: (value: string) => void } | null>(null)

  const handleTemplateAction = (tpl: Template, action: string) => {
    if (action === 'create-vm') {
      navigate(`/vms/create?template=${encodeURIComponent(tpl.name)}`)
      return
    }
    if (action === 'edit') {
      setForm({
        display_name: tpl.display_name || tpl.name,
        name: tpl.name,
        category: tpl.category || 'custom',
        os_type: tpl.os_type || '',
        cpu: tpl.compute?.cpu_cores ?? 2,
        memory_mb: tpl.compute?.memory_mb ?? 2048,
        disks: (tpl.disks || []).map((d: any) => ({
          name: d.name || '',
          source_type: d.source_type || 'pvc',
          size_gb: d.size_gb || 20,
          bus: d.bus || 'virtio',
          image: d.image || '',
          clone_source: d.clone_source || '',
          clone_namespace: d.clone_namespace || '',
          storage_class: d.storage_class || '',
        })),
        nics: (tpl.networks || []).map((n: any) => ({
          name: n.name || '',
          type: (n.network_profile === 'pod' ? 'pod' : 'multus') as 'pod' | 'multus',
          network_profile: n.network_profile || '',
        })),
        cloud_init_user_data: tpl.cloud_init_user_data || '',
        cloud_init_network_data: tpl.cloud_init_network_data || '',
        autoattach_pod_interface: tpl.autoattach_pod_interface ?? true,
        is_global: tpl.is_global ?? false,
      })
      setEditingName(tpl.name)
      setError(null)
      setShowCreate(true)
      return
    }
    if (action === 'duplicate') {
      setPromptAction({
        title: 'Duplicate Template',
        message: `Enter a name for the duplicated template:`,
        defaultValue: `${tpl.name}-copy`,
        onConfirm: (newName) => {
          createTemplate.mutate(
            { ...tpl, name: newName, display_name: `${tpl.display_name || tpl.name} (copy)` },
            {
              onSuccess: () => toast.success('Template duplicated'),
              onError: () => toast.error('Failed to duplicate template'),
            },
          )
          setPromptAction(null)
        },
      })
      return
    }
    if (action === 'delete') {
      setConfirmAction({
        title: 'Delete Template',
        message: `Delete template "${tpl.display_name || tpl.name}"? This action cannot be undone.`,
        danger: true,
        onConfirm: () => {
          deleteTemplate.mutate(tpl.name, {
            onSuccess: () => toast.success('Template deleted'),
            onError: () => toast.error('Failed to delete template'),
          })
          setConfirmAction(null)
        },
      })
    }
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

  const updateDisk = (idx: number, patch: Partial<TemplateDisk>) => {
    setForm((f) => ({
      ...f,
      disks: f.disks.map((d, i) => (i === idx ? { ...d, ...patch } : d)),
    }))
  }

  const removeDisk = (idx: number) => {
    setForm((f) => ({ ...f, disks: f.disks.filter((_, i) => i !== idx) }))
  }

  const updateNIC = (idx: number, patch: Partial<TemplateNIC>) => {
    setForm((f) => ({
      ...f,
      nics: f.nics.map((n, i) => (i === idx ? { ...n, ...patch } : n)),
    }))
  }

  const removeNIC = (idx: number) => {
    setForm((f) => ({ ...f, nics: f.nics.filter((_, i) => i !== idx) }))
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    const payload = {
      display_name: form.display_name,
      name: form.name,
      category: form.category,
      os_type: form.os_type || null,
      compute: {
        cpu_cores: form.cpu,
        memory_mb: form.memory_mb,
        sockets: 1,
        threads_per_core: 1,
      },
      disks: form.disks.map((d) => ({
        name: d.name,
        size_gb: d.size_gb,
        bus: d.bus,
        source_type: d.source_type,
        image: d.image || undefined,
        clone_source: d.clone_source || undefined,
        clone_namespace: d.clone_namespace || undefined,
        storage_class: d.storage_class || undefined,
      })),
      networks: form.nics.map((n) => ({
        name: n.name,
        network_profile: n.network_profile,
      })),
      cloud_init_user_data: form.cloud_init_user_data || null,
      cloud_init_network_data: form.cloud_init_network_data || null,
      autoattach_pod_interface: form.autoattach_pod_interface,
      is_global: form.is_global,
    }
    if (editingName) {
      // Edit: delete old, then create new
      deleteTemplate.mutate(editingName, {
        onSuccess: () => {
          createTemplate.mutate(payload, {
            onSuccess: () => {
              setShowCreate(false)
              setEditingName(null)
              setForm(defaultForm())
              toast.success('Template saved')
            },
            onError: (err: unknown) => {
              const e = err as { message?: string }
              setError(e.message ?? 'Failed to save template')
              toast.error('Failed to save template')
            },
          })
        },
        onError: (err: unknown) => {
          const e = err as { message?: string }
          setError(e.message ?? 'Failed to update template')
          toast.error('Failed to update template')
        },
      })
    } else {
      createTemplate.mutate(payload, {
        onSuccess: () => {
          setShowCreate(false)
          setForm(defaultForm())
          toast.success('Template created')
        },
        onError: (err: unknown) => {
          const e = err as { message?: string }
          setError(e.message ?? 'Failed to create template')
          toast.error('Failed to create template')
        },
      })
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <TopBar
        title="Templates"
        action={
          <button
            onClick={() => {
              setForm(defaultForm())
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
            + New Template
          </button>
        }
      />

      <div className="page-content" style={{ animation: 'fadeInUp 0.35s ease-out' }}>
        <div className="page-container">
        <div className="card">
          {isLoading ? (
            <TableSkeleton rows={3} cols={8} />
          ) : templates.length === 0 ? (
            <EmptyState
              icon={<Copy size={24} />}
              title="No Templates"
              description="Templates let you create VMs from pre-configured blueprints."
              action={{ label: 'Create Template', onClick: () => { setForm(defaultForm()); setEditingName(null); setError(null); setShowCreate(true) } }}
            />
          ) : (
            <table className="table">
              <thead>
                <tr className="table-header">
                  {['Name', ...(activeNamespace === '_all' ? ['Namespace'] : []), 'Category', 'OS Type', 'CPU', 'Memory', 'Disks', 'Networks', ''].map(
                    (col) => (
                      <th
                        key={col || '_actions'}
                        className="table-header-cell"
                      >
                        {col}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {templates.map((tpl, i) => (
                  <tr
                    key={tpl.name}
                    className="table-row-clickable"
                    onClick={() => navigate(`/templates/${tpl.name}`)}
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
                        fontSize: 14,
                        fontFamily: theme.typography.mono.fontFamily,
                      }}
                    >
                      <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        {tpl.display_name || tpl.name}
                        {(tpl as any).is_global && (
                          <span style={{ fontSize: 10, fontWeight: 600, padding: '1px 6px', borderRadius: 3, background: `${theme.accent}15`, color: theme.accent, border: `1px solid ${theme.accent}40` }}>Global</span>
                        )}
                      </span>
                    </td>
                    {activeNamespace === '_all' && (
                      <td className="table-cell" style={{ color: theme.text.secondary, fontSize: 12 }}>{(tpl as any).namespace}</td>
                    )}
                    <td className="table-cell">
                      {tpl.category ? (
                        <Badge
                          label={tpl.category}
                          color={categoryColor[tpl.category] ?? theme.text.dim}
                        />
                      ) : (
                        <span style={{ color: theme.text.dim }}>—</span>
                      )}
                    </td>
                    <td className="table-cell" style={{ color: theme.text.secondary, fontSize: 13 }}>
                      {tpl.os_type ?? '—'}
                    </td>
                    <td className="table-cell" style={{ color: theme.text.secondary, fontSize: 13 }}>
                      {tpl.compute?.cpu_cores ? `${tpl.compute.cpu_cores} vCPU` : '—'}
                    </td>
                    <td className="table-cell" style={{ color: theme.text.secondary, fontSize: 13 }}>
                      {formatMemoryMb(tpl.compute?.memory_mb)}
                    </td>
                    <td className="table-cell" style={{ color: theme.text.secondary, fontSize: 13 }}>
                      {tpl.disks?.length ?? 0}
                    </td>
                    <td className="table-cell" style={{ color: theme.text.secondary, fontSize: 13 }}>
                      {tpl.networks?.length ?? 0}
                    </td>
                    <td className="table-cell" style={{ textAlign: 'right', position: 'relative', zIndex: 10 }}>
                      <DropdownMenu actions={templateActions} onAction={(action) => handleTemplateAction(tpl, action)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        </div>
      </div>

      {/* ── Create Template Modal ── */}
      <Modal open={showCreate} onClose={() => { setShowCreate(false); setEditingName(null) }} title={editingName ? 'Edit Template' : 'New Template'} maxWidth={600}>
        <form onSubmit={handleSubmit}>
          {/* BASIC INFO */}
          <div style={sectionLabelStyle}>Basic Info</div>
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
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
            <div>
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
            <div>
              <label style={labelStyle}>OS Type</label>
              <input
                type="text"
                value={form.os_type}
                onChange={(e) => setForm((f) => ({ ...f, os_type: e.target.value }))}
                placeholder="e.g. ubuntu22.04"
                style={inputStyle}
              />
            </div>
          </div>

          {/* COMPUTE */}
          <div style={sectionLabelStyle}>Compute</div>
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

          {/* DISKS */}
          <div style={sectionLabelStyle}>
            <span>Disks</span>
            <button
              type="button"
              onClick={() => setForm((f) => ({ ...f, disks: [...f.disks, emptyDisk()] }))}
              style={{ ...smallBtnStyle, marginLeft: 12, verticalAlign: 'middle' }}
            >
              + Add Disk
            </button>
          </div>
          {form.disks.length === 0 && (
            <div style={{ color: theme.text.dim, fontSize: 12, marginBottom: 10 }}>
              No disks configured.
            </div>
          )}
          {form.disks.map((disk, idx) => (
            <div
              key={idx}
              style={{
                background: theme.main.tableHeaderBg,
                border: `1px solid ${theme.main.cardBorder}`, boxShadow: theme.shadow.card,
                borderRadius: theme.radius.md,
                padding: 12,
                marginBottom: 10,
                position: 'relative',
              }}
            >
              <button
                type="button"
                onClick={() => removeDisk(idx)}
                style={{ ...removeBtnStyle, position: 'absolute', top: 8, right: 8 }}
                title="Remove disk"
              >
                x
              </button>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr 1fr',
                  gap: 10,
                  marginBottom: 10,
                }}
              >
                <div>
                  <label style={labelStyle}>Name</label>
                  <input
                    type="text"
                    value={disk.name}
                    onChange={(e) => updateDisk(idx, { name: e.target.value })}
                    placeholder="disk-0"
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Source Type</label>
                  <select
                    value={disk.source_type}
                    onChange={(e) =>
                      updateDisk(idx, {
                        source_type: e.target.value as TemplateDisk['source_type'],
                      })
                    }
                    style={inputStyle}
                  >
                    <option value="container_disk">Container Disk</option>
                    <option value="datavolume_clone">Clone from Image</option>
                    <option value="pvc">PVC</option>
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Bus</label>
                  <select
                    value={disk.bus}
                    onChange={(e) => updateDisk(idx, { bus: e.target.value })}
                    style={inputStyle}
                  >
                    <option value="virtio">virtio</option>
                    <option value="sata">sata</option>
                    <option value="scsi">scsi</option>
                  </select>
                </div>
              </div>

              {/* Container Disk fields */}
              {disk.source_type === 'container_disk' && (
                <div>
                  <label style={labelStyle}>Boot Image</label>
                  {registeredImages.filter((img) => img.source_type === 'container_disk').length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <select
                        value={registeredImages.some((img) => img.source_url === disk.image) ? disk.image : '__custom__'}
                        onChange={(e) => {
                          if (e.target.value === '__custom__') {
                            updateDisk(idx, { image: '' })
                          } else {
                            updateDisk(idx, { image: e.target.value })
                          }
                        }}
                        style={inputStyle}
                      >
                        {registeredImages
                          .filter((img) => img.source_type === 'container_disk')
                          .map((img) => (
                            <option key={img.name} value={img.source_url}>{img.display_name || img.name}</option>
                          ))}
                        <option value="__custom__">Custom image URL...</option>
                      </select>
                      {!registeredImages.some((img) => img.source_url === disk.image) && (
                        <input
                          type="text"
                          value={disk.image}
                          onChange={(e) => updateDisk(idx, { image: e.target.value })}
                          placeholder="registry.example.com/image:tag"
                          style={inputStyle}
                        />
                      )}
                    </div>
                  ) : (
                    <input
                      type="text"
                      value={disk.image}
                      onChange={(e) => updateDisk(idx, { image: e.target.value })}
                      placeholder="registry.example.com/image:tag"
                      style={inputStyle}
                    />
                  )}
                </div>
              )}

              {/* DataVolume Clone fields */}
              {disk.source_type === 'datavolume_clone' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div>
                    <label style={labelStyle}>Golden Image</label>
                    <select
                      value={disk.clone_source}
                      onChange={(e) => {
                        const img = registeredImages.find((i) => i.name === e.target.value)
                        updateDisk(idx, {
                          clone_source: e.target.value,
                          clone_namespace: img?.namespace || disk.clone_namespace,
                          size_gb: img?.size_gb || disk.size_gb || 20,
                          name: disk.name || 'rootdisk',
                        })
                      }}
                      style={inputStyle}
                    >
                      <option value="">Select image...</option>
                      {registeredImages
                        .filter((img) => img.source_type !== 'container_disk')
                        .map((img) => (
                          <option key={img.name} value={img.name}>{img.display_name || img.name}</option>
                        ))}
                    </select>
                  </div>
                  <div>
                    <label style={labelStyle}>Clone Namespace</label>
                    <input
                      type="text"
                      value={disk.clone_namespace}
                      onChange={(e) => updateDisk(idx, { clone_namespace: e.target.value })}
                      placeholder="default"
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>Size (GB)</label>
                    <input
                      type="number"
                      min={1}
                      value={disk.size_gb}
                      onChange={(e) => updateDisk(idx, { size_gb: Number(e.target.value) })}
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>Storage Class</label>
                    <select
                      value={disk.storage_class}
                      onChange={(e) => updateDisk(idx, { storage_class: e.target.value })}
                      style={inputStyle}
                    >
                      <option value="">Default</option>
                      {storageClasses.map((sc) => (
                        <option key={sc.name} value={sc.name}>{sc.name}{sc.is_default ? ' (default)' : ''}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}
            </div>
          ))}

          {/* NETWORKS */}
          <div style={sectionLabelStyle}>
            <span>Networks</span>
            <button
              type="button"
              onClick={() => setForm((f) => ({ ...f, nics: [...f.nics, emptyNIC()] }))}
              style={{ ...smallBtnStyle, marginLeft: 12, verticalAlign: 'middle' }}
            >
              + Add NIC
            </button>
          </div>
          {form.nics.length === 0 && (
            <div style={{ color: theme.text.dim, fontSize: 12, marginBottom: 10 }}>
              No network interfaces configured.
            </div>
          )}
          {form.nics.map((nic, idx) => (
            <div
              key={idx}
              style={{
                background: theme.main.inputBg,
                border: `1px solid ${theme.main.inputBorder}`,
                borderRadius: theme.radius.md,
                padding: 12,
                marginBottom: 10,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <div style={{ display: 'flex', gap: 6 }}>
                  {(['pod', 'multus'] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => updateNIC(idx, {
                        type: t,
                        network_profile: t === 'pod' ? 'pod' : '',
                        name: t === 'pod' ? 'default' : nic.name,
                      })}
                      style={{
                        padding: '4px 10px',
                        fontSize: 11,
                        fontFamily: 'inherit',
                        borderRadius: theme.radius.sm,
                        cursor: 'pointer',
                        background: nic.type === t ? theme.accentLight : theme.main.card,
                        border: nic.type === t ? `2px solid ${theme.accent}` : `1px solid ${theme.main.cardBorder}`,
                        color: nic.type === t ? theme.accent : theme.text.primary,
                        fontWeight: nic.type === t ? 600 : 400,
                      }}
                    >
                      {t === 'pod' ? 'Pod Network' : 'Multus'}
                    </button>
                  ))}
                </div>
                <button type="button" onClick={() => removeNIC(idx)} style={removeBtnStyle} title="Remove NIC">x</button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: nic.type === 'multus' ? '1fr 1fr' : '1fr', gap: 10 }}>
                <div>
                  <label style={labelStyle}>Name</label>
                  <input
                    type="text"
                    value={nic.name}
                    onChange={(e) => updateNIC(idx, { name: e.target.value })}
                    placeholder={nic.type === 'pod' ? 'default' : 'nic-0'}
                    style={inputStyle}
                  />
                </div>
                {nic.type === 'multus' && (
                  <div>
                    <label style={labelStyle}>Network (NAD)</label>
                    <select
                      value={nic.network_profile}
                      onChange={(e) => updateNIC(idx, { network_profile: e.target.value })}
                      style={inputStyle}
                    >
                      <option value="">Select network...</option>
                      {availableNADs.map((nad) => (
                        <option key={nad.full_name} value={nad.full_name}>
                          {nad.display_name} ({nad.namespace})
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            </div>
          ))}

          {/* CLOUD-INIT */}
          <div style={sectionLabelStyle}>Cloud-Init</div>
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>User Data</label>
            <textarea
              value={form.cloud_init_user_data}
              onChange={(e) => setForm((f) => ({ ...f, cloud_init_user_data: e.target.value }))}
              placeholder={'#cloud-config\npackages:\n  - nginx'}
              style={textareaStyle}
            />
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Network Data</label>
            <textarea
              value={form.cloud_init_network_data}
              onChange={(e) => setForm((f) => ({ ...f, cloud_init_network_data: e.target.value }))}
              placeholder="network:\n  version: 2\n  ethernets: ..."
              style={textareaStyle}
            />
          </div>

          {/* OPTIONS */}
          <div style={sectionLabelStyle}>Options</div>
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontSize: 13,
              color: theme.text.primary,
              cursor: 'pointer',
              marginBottom: 14,
            }}
          >
            <input
              type="checkbox"
              checked={form.autoattach_pod_interface}
              onChange={(e) =>
                setForm((f) => ({ ...f, autoattach_pod_interface: e.target.checked }))
              }
              style={{ accentColor: theme.accent }}
            />
            Attach default pod network interface
          </label>

          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontSize: 13,
              color: theme.text.primary,
              cursor: 'pointer',
              marginBottom: 14,
            }}
          >
            <input
              type="checkbox"
              checked={form.is_global}
              onChange={(e) =>
                setForm((f) => ({ ...f, is_global: e.target.checked }))
              }
              style={{ accentColor: theme.accent }}
            />
            Global template (available across all namespaces)
          </label>

          {/* ERROR / ACTIONS */}
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
              disabled={createTemplate.isPending}
              style={{
                background: theme.button.primary,
                border: 'none',
                color: theme.button.primaryText,
                borderRadius: theme.radius.md,
                padding: '7px 16px',
                fontSize: 13,
                fontWeight: 500,
                cursor: createTemplate.isPending ? 'not-allowed' : 'pointer',
                fontFamily: 'inherit',
                opacity: createTemplate.isPending ? 0.7 : 1,
              }}
            >
              {createTemplate.isPending || deleteTemplate.isPending ? 'Saving...' : editingName ? 'Save Template' : 'Create Template'}
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

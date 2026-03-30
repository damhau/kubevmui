import { useState, useEffect } from 'react'
import { useCreateVM } from '@/hooks/useVMs'
import { useNamespaces } from '@/hooks/useNamespaces'
import { useImages, useStorageClasses } from '@/hooks/useImages'
import { useNetworkCRs, type NetworkCR } from '@/hooks/useNetworkCRs'
import { useTemplates } from '@/hooks/useTemplates'
import { useUIStore } from '@/stores/ui-store'
import { theme } from '@/lib/theme'
import { YamlPreview } from '@/components/ui/YamlPreview'

const STEPS = [
  { id: 1, label: 'Basic Information', description: 'Name, namespace, and description' },
  { id: 2, label: 'Compute Resources', description: 'CPU and memory configuration' },
  { id: 3, label: 'Firmware', description: 'Boot mode and security options' },
  { id: 4, label: 'Storage', description: 'Configure disk volumes' },
  { id: 5, label: 'Networking', description: 'Network interface configuration' },
  { id: 6, label: 'Scheduling', description: 'Node placement and affinity' },
  { id: 7, label: 'Cloud-Init', description: 'Initialization scripts and SSH keys' },
  { id: 8, label: 'Review & Create', description: 'Review configuration' },
]

const COMPUTE_PRESETS = [
  { label: 'Small', cpu: 1, memory: 2048, description: 'Light workloads' },
  { label: 'Medium', cpu: 2, memory: 4096, description: 'General purpose' },
  { label: 'Large', cpu: 4, memory: 8192, description: 'Production workloads' },
  { label: 'XL', cpu: 8, memory: 16384, description: 'High performance' },
  { label: 'Custom', cpu: 0, memory: 0, description: 'Define your own' },
]

interface Disk {
  name: string
  size_gb: number
  bus: 'virtio' | 'sata' | 'scsi'
  source_type: 'pvc' | 'container_disk' | 'datavolume_clone' | 'blank'
  disk_type: 'disk' | 'cdrom'
  image: string
  clone_source: string
  clone_namespace: string
  storage_class: string
}

interface NIC {
  name: string
  network_cr: string
}

interface FormData {
  name: string
  namespace: string
  description: string
  cpu: number
  memory: number
  preset: string
  disks: Disk[]
  nics: NIC[]
  user_data: string
  network_data: string
  ssh_key: string
  firmware: 'default' | 'bios' | 'uefi'
  secure_boot: boolean
  node_selector: string
  eviction_strategy: string
  template_name: string
}

interface VMCreateWizardProps {
  onClose: () => void
  onSuccess: () => void
  initialTemplate?: string
}

function inputStyle(extra?: React.CSSProperties): React.CSSProperties {
  return {
    width: '100%',
    background: theme.main.inputBg,
    border: `1px solid ${theme.main.inputBorder}`,
    borderRadius: theme.radius.md,
    color: theme.text.primary,
    fontSize: 14,
    padding: '8px 12px',
    outline: 'none',
    fontFamily: 'inherit',
    boxSizing: 'border-box' as const,
    ...extra,
  }
}

function labelStyle(): React.CSSProperties {
  return {
    display: 'block',
    fontSize: 12,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
    color: theme.text.secondary,
    marginBottom: 6,
    fontWeight: 500,
  }
}

function FieldGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={labelStyle()}>{label}</label>
      {children}
    </div>
  )
}

function SectionCard({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        background: theme.main.card,
        border: `1px solid ${theme.main.cardBorder}`,
        borderRadius: theme.radius.lg,
        padding: 24,
      }}
    >
      {children}
    </div>
  )
}

function Badge({
  label,
  variant = 'neutral',
}: {
  label: string
  variant?: 'neutral' | 'success' | 'info' | 'warning'
}) {
  const colors = {
    neutral: { bg: theme.main.tableHeaderBg, color: theme.text.primary, border: theme.main.cardBorder },
    success: { bg: '#ecfdf5', color: '#16a34a', border: '#bbf7d0' },
    info: { bg: '#eff6ff', color: '#2563eb', border: '#bfdbfe' },
    warning: { bg: '#fffbeb', color: '#d97706', border: '#fde68a' },
  }
  const c = colors[variant]
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '2px 8px',
        borderRadius: 4,
        fontSize: 12,
        fontWeight: 500,
        background: c.bg,
        color: c.color,
        border: `1px solid ${c.border}`,
      }}
    >
      {label}
    </span>
  )
}

// Settings / gear icon for the Custom preset card
function SettingsIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ display: 'block' }}
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  )
}

// Disk / hard-drive icon
function DiskIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ display: 'block' }}
    >
      <ellipse cx="12" cy="5" rx="9" ry="3" />
      <path d="M21 12c0 1.66-4.03 3-9 3S3 13.66 3 12" />
      <path d="M3 5v14c0 1.66 4.03 3 9 3s9-1.34 9-3V5" />
    </svg>
  )
}

export function VMCreateWizard({ onClose, onSuccess, initialTemplate }: VMCreateWizardProps) {
  const createVM = useCreateVM()
  const { activeCluster, activeNamespace } = useUIStore()
  const [quickCreate, setQuickCreate] = useState(!!initialTemplate)
  const { data: namespacesData } = useNamespaces()
  const { data: imagesData } = useImages()
  const registeredImages: Array<{ name: string; display_name: string; source_url: string; os_type: string; source_type?: string }> =
    Array.isArray(imagesData?.items) ? imagesData.items : []
  const { data: templatesData } = useTemplates()
  const { data: storageClassData } = useStorageClasses()
  const { data: networkCRsData } = useNetworkCRs()
  const networkCRs: NetworkCR[] = networkCRsData?.items || []
  const templates: Array<any> = Array.isArray(templatesData?.items) ? templatesData.items : []
  const storageClasses: Array<{ name: string; is_default: boolean }> = Array.isArray(storageClassData?.items) ? storageClassData.items : []
  const [step, setStep] = useState(1)
  const [error, setError] = useState('')

  const rawNamespaces = Array.isArray(namespacesData?.items)
    ? namespacesData.items
    : Array.isArray(namespacesData)
      ? namespacesData
      : []
  const namespaces: string[] = rawNamespaces.length > 0
    ? rawNamespaces.map((n: { name?: string } | string) =>
        typeof n === 'string' ? n : n.name ?? String(n),
      )
    : ['default']

  const [form, setForm] = useState<FormData>({
    name: '',
    namespace: activeNamespace === '_all' ? 'default' : activeNamespace,
    description: '',
    cpu: 2,
    memory: 4096,
    preset: 'Medium',
    disks: [],
    nics: [{ name: 'default', network_cr: 'pod-network' }],
    user_data: '',
    network_data: '',
    ssh_key: '',
    firmware: 'default',
    secure_boot: false,
    node_selector: '',
    eviction_strategy: '',
    template_name: '',
  })

  const updateForm = (patch: Partial<FormData>) => setForm((f) => ({ ...f, ...patch }))

  const applyTemplate = (templateName: string) => {
    const tpl = templates.find((t: any) => t.name === templateName)
    if (!tpl) {
      updateForm({ template_name: '' })
      return
    }
    setForm((f) => ({
      ...f,
      template_name: templateName,
      cpu: tpl.compute?.cpu_cores ?? f.cpu,
      memory: tpl.compute?.memory_mb ?? f.memory,
      preset: 'Custom',
      disks: (tpl.disks || []).map((d: any) => ({
        name: d.name || 'rootdisk',
        size_gb: d.size_gb || 20,
        bus: d.bus || 'virtio',
        source_type: d.source_type || 'pvc',
        disk_type: d.disk_type || 'disk',
        image: d.image || '',
        clone_source: d.clone_source || '',
        clone_namespace: d.clone_namespace || '',
        storage_class: d.storage_class || '',
      })),
      nics: (tpl.networks || []).map((n: any) => ({
        name: n.name || 'default',
        network_cr: n.network_cr || 'pod-network',
      })),
      user_data: tpl.cloud_init_user_data || '',
      network_data: tpl.cloud_init_network_data || '',
    }))
  }

  // Apply initial template from URL param once templates are loaded
  useEffect(() => {
    if (initialTemplate && templates.length > 0 && !form.template_name) {
      applyTemplate(initialTemplate)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialTemplate, templates.length])

  const addDisk = () =>
    updateForm({
      disks: [...form.disks, { name: `disk${form.disks.length}`, size_gb: 10, bus: 'virtio', source_type: 'blank', disk_type: 'disk', image: '', clone_source: '', clone_namespace: '', storage_class: '' }],
    })

  const removeDisk = (i: number) =>
    updateForm({ disks: form.disks.filter((_, idx) => idx !== i) })

  const updateDisk = (i: number, patch: Partial<Disk>) =>
    updateForm({ disks: form.disks.map((d, idx) => (idx === i ? { ...d, ...patch } : d)) })

  const addNIC = () =>
    updateForm({
      nics: [...form.nics, { name: `nic${form.nics.length}`, network_cr: '' }],
    })

  const removeNIC = (i: number) =>
    updateForm({ nics: form.nics.filter((_, idx) => idx !== i) })

  const updateNIC = (i: number, patch: Partial<NIC>) =>
    updateForm({ nics: form.nics.map((n, idx) => (idx === i ? { ...n, ...patch } : n)) })

  const handleSubmit = () => {
    setError('')
    const payload = {
      name: form.name,
      namespace: form.namespace,
      description: form.description,
      compute: {
        cpu_cores: form.cpu,
        memory_mb: form.memory,
        sockets: 1,
        threads_per_core: 1,
      },
      disks: form.disks.map((d) => ({
        name: d.name,
        size_gb: d.size_gb,
        bus: d.bus,
        source_type: d.source_type,
        disk_type: d.disk_type || 'disk',
        image: d.image,
        clone_source: d.clone_source,
        clone_namespace: d.clone_namespace,
        storage_class: d.storage_class,
      })),
      networks: form.nics.map((n) => ({
        name: n.name,
        network_cr: n.network_cr,
      })),
      cloud_init_user_data: form.user_data || null,
      cloud_init_network_data: form.network_data || null,
      template_name: form.template_name || null,
      run_strategy: 'RerunOnFailure',
      labels: {},
      firmware_boot_mode: form.firmware === 'default' ? null : form.firmware,
      secure_boot: form.secure_boot,
      node_selector: form.node_selector
        ? Object.fromEntries(form.node_selector.split(',').map((kv) => kv.trim().split('=')))
        : {},
      eviction_strategy: form.eviction_strategy || null,
    }
    createVM.mutate(payload, {
      onSuccess: () => onSuccess(),
      onError: (err: unknown) => {
        const e = err as { message?: string }
        setError(e.message ?? 'Failed to create VM')
      },
    })
  }

  const canNext = () => {
    if (step === 1) return form.name.trim().length > 0
    return true
  }

  const currentStep = STEPS[step - 1]

  // Max disk size for the proportional bar (use 500 GB as reference)
  const MAX_DISK_SIZE_GB = 500

  // Left panel step item styles
  const stepItemStyle = (s: (typeof STEPS)[0]): React.CSSProperties => {
    const isActive = step === s.id
    const isCompleted = step > s.id
    return {
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      padding: '12px 20px',
      borderLeft: isActive ? `3px solid ${theme.accent}` : '3px solid transparent',
      background: isActive ? theme.accentLight : 'transparent',
      cursor: isCompleted ? 'pointer' : isActive ? 'default' : 'default',
      opacity: !isActive && !isCompleted ? 0.35 : 1,
      filter: !isActive && !isCompleted ? 'grayscale(100%)' : 'none',
      transition: 'opacity 0.2s, background 0.15s, filter 0.2s',
    }
  }

  const circleStyle = (s: (typeof STEPS)[0]): React.CSSProperties => {
    const isActive = step === s.id
    const isCompleted = step > s.id
    return {
      width: 28,
      height: 28,
      borderRadius: '50%',
      background: isActive
        ? theme.accent
        : isCompleted
          ? theme.status.running
          : theme.main.cardBorder,
      color: isActive || isCompleted ? '#fff' : theme.text.secondary,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: 12,
      fontWeight: 700,
      flexShrink: 0,
    }
  }

  // Quick create mode: template selected, just name + create
  if (quickCreate && form.template_name) {
    const selectedTpl = templates.find((t: any) => t.name === form.template_name)
    return (
      <div style={{ display: 'flex', height: '100%', overflow: 'hidden', justifyContent: 'center', alignItems: 'flex-start', padding: '60px 24px' }}>
        <div className="card-padded" style={{ maxWidth: 500, width: '100%' }}>
          <div style={{ fontSize: 18, fontWeight: 700, fontFamily: theme.typography.heading.fontFamily, color: theme.text.heading, marginBottom: 4 }}>
            Create Virtual Machine
          </div>
          <div style={{ fontSize: 13, color: theme.text.secondary, marginBottom: 24 }}>
            From template: <strong style={{ color: theme.accent }}>{selectedTpl?.display_name || form.template_name}</strong>
          </div>

          <FieldGroup label="VM Name">
            <input
              type="text"
              value={form.name}
              onChange={(e) => updateForm({ name: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })}
              placeholder="my-vm"
              style={inputStyle()}
              autoFocus
            />
          </FieldGroup>

          <FieldGroup label="Namespace">
            <div style={{ fontSize: 14, color: theme.text.primary, fontFamily: theme.typography.mono.fontFamily, padding: '8px 0' }}>
              {form.namespace}
            </div>
          </FieldGroup>

          {selectedTpl && (
            <div style={{ fontSize: 12, color: theme.text.secondary, marginBottom: 20, lineHeight: 1.6 }}>
              <span style={{ color: theme.text.dim }}>CPU:</span> {selectedTpl.compute?.cpu_cores ?? '?'} vCPU &nbsp;
              <span style={{ color: theme.text.dim }}>Memory:</span> {selectedTpl.compute?.memory_mb ?? '?'} MB &nbsp;
              <span style={{ color: theme.text.dim }}>Disks:</span> {selectedTpl.disks?.length ?? 0}
            </div>
          )}

          {error && (
            <div style={{ color: theme.status.error, fontSize: 13, marginBottom: 12 }}>{error}</div>
          )}

          <div style={{ display: 'flex', gap: 10 }}>
            <button
              onClick={handleSubmit}
              disabled={!form.name.trim() || createVM.isPending}
              style={{
                flex: 1,
                padding: '10px 20px',
                background: theme.button.primary,
                color: theme.button.primaryText,
                border: 'none',
                borderRadius: theme.radius.md,
                fontSize: 14,
                fontWeight: 600,
                cursor: form.name.trim() && !createVM.isPending ? 'pointer' : 'not-allowed',
                opacity: form.name.trim() && !createVM.isPending ? 1 : 0.5,
                fontFamily: 'inherit',
              }}
            >
              {createVM.isPending ? 'Creating...' : 'Create VM'}
            </button>
            <button
              onClick={() => setQuickCreate(false)}
              style={{
                padding: '10px 20px',
                background: theme.button.secondary,
                color: theme.button.secondaryText,
                border: `1px solid ${theme.button.secondaryBorder}`,
                borderRadius: theme.radius.md,
                fontSize: 14,
                fontWeight: 500,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              Customize
            </button>
            <button
              onClick={onClose}
              style={{
                padding: '10px 20px',
                background: 'transparent',
                color: theme.text.secondary,
                border: 'none',
                fontSize: 14,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      {/* Left panel */}
      <div
        style={{
          width: 220,
          flexShrink: 0,
          background: theme.main.card,
          borderRight: `1px solid ${theme.main.cardBorder}`,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Title */}
        <div
          style={{
            padding: '24px 20px 20px',
            borderBottom: `1px solid ${theme.main.cardBorder}`,
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 700, fontFamily: theme.typography.heading.fontFamily, color: theme.text.heading, lineHeight: 1.3 }}>
            Create Virtual Machine
          </div>
        </div>

        {/* Step list */}
        <div style={{ flex: 1, overflowY: 'auto', paddingTop: 8, paddingBottom: 8 }}>
          {STEPS.map((s) => (
            <div
              key={s.id}
              style={stepItemStyle(s)}
              onClick={() => {
                if (step > s.id) setStep(s.id)
              }}
            >
              <div style={circleStyle(s)}>{step > s.id ? '✓' : s.id}</div>
              <span
                style={{
                  fontSize: 13,
                  fontWeight: step === s.id ? 700 : 400,
                  color:
                    step === s.id
                      ? theme.text.heading
                      : step > s.id
                        ? theme.text.primary
                        : theme.text.secondary,
                  lineHeight: 1.3,
                }}
              >
                {s.label}
              </span>
            </div>
          ))}
        </div>

        {/* Cancel button */}
        <div
          style={{
            padding: '16px 20px',
            borderTop: `1px solid ${theme.main.cardBorder}`,
          }}
        >
          <button
            onClick={onClose}
            style={{
              width: '100%',
              background: 'transparent',
              border: `1px solid ${theme.main.cardBorder}`,
              color: theme.text.secondary,
              borderRadius: theme.radius.md,
              padding: '8px 12px',
              fontSize: 13,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            Cancel
          </button>
        </div>
      </div>

      {/* Right panel */}
      <div
        style={{
          flex: 1,
          background: theme.main.bg,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          minWidth: 0,
        }}
      >
        {/* Step header */}
        <div style={{ padding: '32px 32px 0' }} key={step}>
          <div style={{ fontSize: 18, fontWeight: 600, fontFamily: theme.typography.heading.fontFamily, color: theme.text.heading, marginBottom: 4, animation: 'fadeInUp 0.25s ease-out' }}>
            {currentStep.label}
          </div>
          <div style={{ fontSize: 13, color: theme.text.secondary, marginBottom: 24 }}>
            {currentStep.description}
          </div>
        </div>

        {/* Step content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 32px 24px' }}>
          {/* Step 1 — Basic Information */}
          {step === 1 && (
            <SectionCard>
              <FieldGroup label="Name *">
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => updateForm({ name: e.target.value })}
                  placeholder="my-virtual-machine"
                  style={inputStyle()}
                />
              </FieldGroup>
              {activeNamespace === '_all' ? (
                <FieldGroup label="Namespace">
                  <select
                    value={form.namespace}
                    onChange={(e) => updateForm({ namespace: e.target.value })}
                    style={inputStyle()}
                  >
                    {namespaces.map((ns) => (
                      <option key={ns} value={ns}>
                        {ns}
                      </option>
                    ))}
                  </select>
                </FieldGroup>
              ) : (
                <FieldGroup label="Namespace">
                  <div style={{ fontSize: 14, color: theme.text.primary, fontFamily: theme.typography.mono.fontFamily, padding: '8px 0' }}>
                    {form.namespace}
                  </div>
                </FieldGroup>
              )}
              <FieldGroup label="Description">
                <textarea
                  value={form.description}
                  onChange={(e) => updateForm({ description: e.target.value })}
                  placeholder="Optional description..."
                  rows={3}
                  style={inputStyle({ resize: 'vertical' })}
                />
              </FieldGroup>
              <FieldGroup label="Template (Optional)">
                <select
                  value={form.template_name}
                  onChange={(e) => { applyTemplate(e.target.value); if (e.target.value) setQuickCreate(true) }}
                  style={inputStyle()}
                >
                  <option value="">No template — configure manually</option>
                  {templates.map((tpl: any) => (
                    <option key={tpl.name} value={tpl.name}>
                      {tpl.display_name || tpl.name} ({tpl.category})
                    </option>
                  ))}
                </select>
              </FieldGroup>
            </SectionCard>
          )}

          {/* Step 2 — Compute Resources */}
          {step === 2 && (
            <SectionCard>
              {/* Preset cards */}
              <div style={{ marginBottom: 20 }}>
                <label style={labelStyle()}>Instance Preset</label>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  {COMPUTE_PRESETS.map((preset) => {
                    const isSelected = form.preset === preset.label
                    return (
                      <button
                        key={preset.label}
                        onClick={() => {
                          if (preset.label === 'Custom') {
                            updateForm({ preset: 'Custom' })
                          } else {
                            updateForm({
                              preset: preset.label,
                              cpu: preset.cpu,
                              memory: preset.memory,
                            })
                          }
                        }}
                        style={{
                          width: 130,
                          background: isSelected ? theme.accentLight : theme.main.card,
                          border: isSelected
                            ? `2px solid ${theme.accent}`
                            : `1px solid ${theme.main.cardBorder}`,
                          borderRadius: theme.radius.lg,
                          padding: 16,
                          cursor: 'pointer',
                          textAlign: 'left' as const,
                          fontFamily: 'inherit',
                          transition: 'border-color 0.15s, background 0.15s',
                          // compensate for 2px border on selected to avoid layout shift
                          margin: isSelected ? 0 : 1,
                        }}
                      >
                        {preset.label === 'Custom' ? (
                          <div
                            style={{
                              color: isSelected ? theme.accent : theme.text.secondary,
                              marginBottom: 6,
                            }}
                          >
                            <SettingsIcon />
                          </div>
                        ) : (
                          <div style={{ fontSize: 12, color: theme.text.secondary, marginBottom: 4 }}>
                            {preset.cpu} CPU · {preset.memory >= 1024 ? `${preset.memory / 1024} GB` : `${preset.memory} MB`}
                          </div>
                        )}
                        <div
                          style={{
                            fontSize: 14,
                            fontWeight: 700,
                            color: isSelected ? theme.accent : theme.text.heading,
                            marginBottom: 4,
                          }}
                        >
                          {preset.label}
                        </div>
                        <div style={{ fontSize: 11, color: theme.text.dim }}>{preset.description}</div>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Manual inputs only for Custom preset */}
              {form.preset === 'Custom' && (
                <div>
                  <div
                    style={{
                      height: 1,
                      background: theme.main.cardBorder,
                      marginBottom: 16,
                    }}
                  />
                  <FieldGroup label="CPU Cores">
                    <input
                      type="number"
                      min={1}
                      max={64}
                      value={form.cpu}
                      onChange={(e) => updateForm({ cpu: Number(e.target.value) })}
                      style={inputStyle()}
                    />
                    <div style={{ fontSize: 11, color: theme.text.placeholder, marginTop: 4 }}>
                      1 – 64 cores
                    </div>
                  </FieldGroup>
                  <FieldGroup label="Memory (MB)">
                    <input
                      type="number"
                      min={512}
                      max={65536}
                      step={512}
                      value={form.memory}
                      onChange={(e) => updateForm({ memory: Number(e.target.value) })}
                      style={inputStyle()}
                    />
                    <div style={{ fontSize: 11, color: theme.text.placeholder, marginTop: 4 }}>
                      512 – 65536 MB
                    </div>
                  </FieldGroup>
                </div>
              )}
            </SectionCard>
          )}

          {/* Step 3 — Firmware */}
          {step === 3 && (
            <SectionCard>
              <FieldGroup label="Boot Mode">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {(['default', 'bios', 'uefi'] as const).map((mode) => (
                    <label
                      key={mode}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        padding: '10px 14px',
                        background: form.firmware === mode ? theme.accentLight : theme.main.card,
                        border: form.firmware === mode
                          ? `2px solid ${theme.accent}`
                          : `1px solid ${theme.main.cardBorder}`,
                        borderRadius: theme.radius.md,
                        cursor: 'pointer',
                        margin: form.firmware === mode ? 0 : 1,
                      }}
                    >
                      <input
                        type="radio"
                        name="firmware"
                        value={mode}
                        checked={form.firmware === mode}
                        onChange={() => updateForm({ firmware: mode, secure_boot: false })}
                        style={{ accentColor: theme.accent }}
                      />
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 600, color: theme.text.heading }}>
                          {mode === 'default' ? 'Default' : mode.toUpperCase()}
                        </div>
                        <div style={{ fontSize: 12, color: theme.text.secondary }}>
                          {mode === 'default' && 'Use KubeVirt default bootloader'}
                          {mode === 'bios' && 'Legacy BIOS boot mode'}
                          {mode === 'uefi' && 'UEFI boot mode with optional Secure Boot'}
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
              </FieldGroup>
              {form.firmware === 'uefi' && (
                <FieldGroup label="Secure Boot">
                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '10px 14px',
                      background: theme.main.card,
                      border: `1px solid ${theme.main.cardBorder}`,
                      borderRadius: theme.radius.md,
                      cursor: 'pointer',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={form.secure_boot}
                      onChange={(e) => updateForm({ secure_boot: e.target.checked })}
                      style={{ accentColor: theme.accent }}
                    />
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: theme.text.heading }}>
                        Enable Secure Boot
                      </div>
                      <div style={{ fontSize: 12, color: theme.text.secondary }}>
                        Requires UEFI-compatible guest OS and signed bootloader
                      </div>
                    </div>
                  </label>
                </FieldGroup>
              )}
            </SectionCard>
          )}

          {/* Step 4 — Storage */}
          {step === 4 && (
            <div>
              {form.disks.map((disk, i) => {
                const barPercent = Math.min((disk.size_gb / MAX_DISK_SIZE_GB) * 100, 100)
                const busColors: Record<string, { bg: string; color: string; border: string }> = {
                  virtio: { bg: '#eff6ff', color: '#2563eb', border: '#bfdbfe' },
                  sata: { bg: '#fffbeb', color: '#d97706', border: '#fde68a' },
                  scsi: { bg: '#f5f3ff', color: '#7c3aed', border: '#ddd6fe' },
                }
                const busColor = busColors[disk.bus] ?? busColors.virtio

                return (
                  <div
                    key={i}
                    style={{
                      background: theme.main.card,
                      border: `1px solid ${theme.main.cardBorder}`,
                      borderRadius: theme.radius.lg,
                      padding: 20,
                      marginBottom: 12,
                    }}
                  >
                    {/* Disk card header with icon */}
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'flex-start',
                        marginBottom: 14,
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div
                          style={{
                            width: 36,
                            height: 36,
                            borderRadius: theme.radius.md,
                            background: theme.main.tableHeaderBg,
                            border: `1px solid ${theme.main.cardBorder}`,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: theme.text.secondary,
                            flexShrink: 0,
                          }}
                        >
                          <DiskIcon />
                        </div>
                        <div>
                          <span style={{ fontSize: 14, fontWeight: 600, color: theme.text.primary }}>
                            Disk {i + 1}
                          </span>
                          {/* Bus badge */}
                          <div style={{ marginTop: 3, display: 'flex', gap: 4 }}>
                            <span
                              style={{
                                display: 'inline-block',
                                padding: '1px 7px',
                                borderRadius: 20,
                                fontSize: 11,
                                fontWeight: 500,
                                background: busColor.bg,
                                color: busColor.color,
                                border: `1px solid ${busColor.border}`,
                              }}
                            >
                              {disk.bus}
                            </span>
                            <span
                              style={{
                                display: 'inline-block',
                                padding: '1px 7px',
                                borderRadius: 20,
                                fontSize: 11,
                                fontWeight: 500,
                                background: disk.source_type === 'container_disk' ? '#fdf2f8' : disk.source_type === 'datavolume_clone' ? '#fefce8' : '#f0fdf4',
                                color: disk.source_type === 'container_disk' ? '#be185d' : disk.source_type === 'datavolume_clone' ? '#a16207' : '#16a34a',
                                border: `1px solid ${disk.source_type === 'container_disk' ? '#fbcfe8' : disk.source_type === 'datavolume_clone' ? '#fde047' : '#bbf7d0'}`,
                              }}
                            >
                              {disk.source_type === 'container_disk' ? 'container' : disk.source_type === 'datavolume_clone' ? 'clone' : 'pvc'}
                            </span>
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={() => removeDisk(i)}
                        style={{
                          background: 'transparent',
                          border: '1px solid rgba(239,68,68,0.3)',
                          color: theme.status.error,
                          borderRadius: 5,
                          padding: '3px 8px',
                          fontSize: 11,
                          cursor: 'pointer',
                          fontFamily: 'inherit',
                        }}
                      >
                        Remove
                      </button>
                    </div>

                    {/* Disk type toggle */}
                    <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
                      {(['disk', 'cdrom'] as const).map((dt) => (
                        <button
                          key={dt}
                          type="button"
                          onClick={() => updateDisk(i, {
                            disk_type: dt,
                            name: dt === 'cdrom'
                              ? `cdrom${form.disks.filter((d, j) => j !== i && d.disk_type === 'cdrom').length}`
                              : `disk${form.disks.filter((d, j) => j !== i && d.disk_type !== 'cdrom').length}`,
                            bus: dt === 'cdrom' ? 'sata' : 'virtio',
                            source_type: dt === 'cdrom' ? 'datavolume_clone' : disk.source_type === 'datavolume_clone' ? 'blank' : disk.source_type,
                          })}
                          style={{
                            padding: '4px 10px',
                            fontSize: 11,
                            fontFamily: 'inherit',
                            borderRadius: theme.radius.sm,
                            cursor: 'pointer',
                            background: disk.disk_type === dt ? theme.accentLight : theme.main.card,
                            border: disk.disk_type === dt ? `2px solid ${theme.accent}` : `1px solid ${theme.main.cardBorder}`,
                            color: disk.disk_type === dt ? theme.accent : theme.text.primary,
                            fontWeight: disk.disk_type === dt ? 600 : 400,
                          }}
                        >
                          {dt === 'disk' ? 'Disk' : 'CD-ROM'}
                        </button>
                      ))}
                    </div>

                    {/* Source type selector */}
                    {disk.disk_type !== 'cdrom' && (
                    <div style={{ marginBottom: 14 }}>
                      <FieldGroup label="Source Type">
                        <div style={{ display: 'flex', gap: 8 }}>
                          {(['blank', 'datavolume_clone', 'pvc', 'container_disk'] as const).map((st) => (
                            <button
                              key={st}
                              onClick={() => updateDisk(i, { source_type: st })}
                              style={{
                                padding: '6px 14px',
                                fontSize: 13,
                                fontFamily: 'inherit',
                                borderRadius: theme.radius.md,
                                cursor: 'pointer',
                                background: disk.source_type === st ? theme.accentLight : theme.main.card,
                                border: disk.source_type === st
                                  ? `2px solid ${theme.accent}`
                                  : `1px solid ${theme.main.cardBorder}`,
                                color: disk.source_type === st ? theme.accent : theme.text.primary,
                                fontWeight: disk.source_type === st ? 600 : 400,
                                margin: disk.source_type === st ? 0 : 1,
                              }}
                            >
                              {st === 'blank' ? 'Blank Disk' : st === 'pvc' ? 'Existing PVC' : st === 'container_disk' ? 'Container Disk' : 'Clone from Image'}
                            </button>
                          ))}
                        </div>
                      </FieldGroup>
                    </div>
                    )}

                    {disk.disk_type === 'cdrom' ? (
                      <>
                        {/* CD-ROM fields */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                          <FieldGroup label="Name">
                            <input type="text" value={disk.name} onChange={(e) => updateDisk(i, { name: e.target.value })} style={inputStyle()} />
                          </FieldGroup>
                          <FieldGroup label="ISO Image">
                            <select
                              value={disk.clone_source}
                              onChange={(e) => updateDisk(i, { clone_source: e.target.value })}
                              style={inputStyle()}
                            >
                              <option value="">Select ISO image...</option>
                              {registeredImages
                                .filter((img: any) => img.media_type === 'iso')
                                .map((img: any) => (
                                  <option key={img.name} value={img.name}>{img.display_name || img.name}</option>
                                ))}
                            </select>
                          </FieldGroup>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
                          <FieldGroup label="Storage Class">
                            <select value={disk.storage_class} onChange={(e) => updateDisk(i, { storage_class: e.target.value })} style={inputStyle()}>
                              <option value="">Default</option>
                              {storageClasses.map((sc: any) => (
                                <option key={sc.name} value={sc.name}>{sc.name}{sc.is_default ? ' (default)' : ''}</option>
                              ))}
                            </select>
                          </FieldGroup>
                          <FieldGroup label="Bus">
                            <select value={disk.bus} onChange={(e) => updateDisk(i, { bus: e.target.value as Disk['bus'] })} style={inputStyle()}>
                              <option value="sata">sata</option>
                              <option value="scsi">scsi</option>
                              <option value="virtio">virtio</option>
                            </select>
                          </FieldGroup>
                        </div>
                      </>
                    ) : disk.source_type === 'container_disk' ? (
                      <>
                        {/* Container disk fields */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                          <FieldGroup label="Name">
                            <input
                              type="text"
                              value={disk.name}
                              onChange={(e) => updateDisk(i, { name: e.target.value })}
                              style={inputStyle()}
                            />
                          </FieldGroup>
                          <FieldGroup label="Boot Image">
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                              <select
                                value={[
                                  'quay.io/kubevirt/cirros-container-disk-demo',
                                  'quay.io/kubevirt/fedora-cloud-container-disk-demo',
                                  'quay.io/containerdisks/ubuntu:22.04',
                                  'quay.io/containerdisks/centos-stream:9',
                                ].includes(disk.image) ? disk.image : '__custom__'}
                                onChange={(e) => {
                                  if (e.target.value === '__custom__') {
                                    updateDisk(i, { image: '' })
                                  } else {
                                    updateDisk(i, { image: e.target.value })
                                  }
                                }}
                                style={inputStyle()}
                              >
                                <option value="quay.io/kubevirt/cirros-container-disk-demo">CirrOS (test)</option>
                                <option value="quay.io/kubevirt/fedora-cloud-container-disk-demo">Fedora Cloud</option>
                                <option value="quay.io/containerdisks/ubuntu:22.04">Ubuntu 22.04</option>
                                <option value="quay.io/containerdisks/centos-stream:9">CentOS Stream 9</option>
                                <option value="__custom__">Custom image URL...</option>
                              </select>
                              {![
                                'quay.io/kubevirt/cirros-container-disk-demo',
                                'quay.io/kubevirt/fedora-cloud-container-disk-demo',
                                'quay.io/containerdisks/ubuntu:22.04',
                                'quay.io/containerdisks/centos-stream:9',
                              ].includes(disk.image) && (
                                <input
                                  type="text"
                                  value={disk.image}
                                  onChange={(e) => updateDisk(i, { image: e.target.value })}
                                  placeholder="registry.io/image:tag"
                                  style={inputStyle()}
                                />
                              )}
                            </div>
                          </FieldGroup>
                          <FieldGroup label="Bus">
                            <select
                              value={disk.bus}
                              onChange={(e) => updateDisk(i, { bus: e.target.value as Disk['bus'] })}
                              style={inputStyle()}
                            >
                              <option value="virtio">virtio</option>
                              <option value="sata">sata</option>
                              <option value="scsi">scsi</option>
                            </select>
                          </FieldGroup>
                        </div>
                      </>
                    ) : disk.source_type === 'datavolume_clone' ? (
                      <>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                          <FieldGroup label="Name">
                            <input type="text" value={disk.name} onChange={(e) => updateDisk(i, { name: e.target.value })} style={inputStyle()} />
                          </FieldGroup>
                          <FieldGroup label="Clone Source (Golden Image)">
                            <select
                              value={disk.clone_source}
                              onChange={(e) => updateDisk(i, { clone_source: e.target.value })}
                              style={inputStyle()}
                            >
                              <option value="">Select image...</option>
                              {registeredImages
                                .filter((img: any) => img.source_type !== 'container_disk')
                                .map((img: any) => (
                                  <option key={img.name} value={img.name}>{img.display_name || img.name}</option>
                                ))}
                            </select>
                          </FieldGroup>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginTop: 12 }}>
                          <FieldGroup label="Size (GB)">
                            <input type="number" value={disk.size_gb} onChange={(e) => updateDisk(i, { size_gb: parseInt(e.target.value) || 10 })} style={inputStyle()} />
                          </FieldGroup>
                          <FieldGroup label="Storage Class">
                            <select value={disk.storage_class} onChange={(e) => updateDisk(i, { storage_class: e.target.value })} style={inputStyle()}>
                              <option value="">Default</option>
                              {storageClasses.map((sc: any) => (
                                <option key={sc.name} value={sc.name}>{sc.name}{sc.is_default ? ' (default)' : ''}</option>
                              ))}
                            </select>
                          </FieldGroup>
                          <FieldGroup label="Bus">
                            <select value={disk.bus} onChange={(e) => updateDisk(i, { bus: e.target.value as Disk['bus'] })} style={inputStyle()}>
                              <option value="virtio">virtio</option>
                              <option value="sata">sata</option>
                              <option value="scsi">scsi</option>
                            </select>
                          </FieldGroup>
                        </div>
                      </>
                    ) : (
                      <>
                        {/* Size bar */}
                        <div style={{ marginBottom: 14 }}>
                          <div
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              marginBottom: 5,
                            }}
                          >
                            <span style={{ fontSize: 11, color: theme.text.secondary, fontWeight: 500 }}>
                              SIZE
                            </span>
                            <span style={{ fontSize: 12, fontWeight: 600, color: theme.text.primary }}>
                              {disk.size_gb} GB
                            </span>
                          </div>
                          <div
                            style={{
                              height: 6,
                              background: theme.main.tableHeaderBg,
                              borderRadius: 3,
                              overflow: 'hidden',
                              border: `1px solid ${theme.main.cardBorder}`,
                            }}
                          >
                            <div
                              style={{
                                height: '100%',
                                width: `${barPercent}%`,
                                background: theme.accent,
                                borderRadius: 3,
                                transition: 'width 0.2s ease',
                              }}
                            />
                          </div>
                        </div>

                        {/* PVC form fields */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                          <FieldGroup label="Name">
                            <input
                              type="text"
                              value={disk.name}
                              onChange={(e) => updateDisk(i, { name: e.target.value })}
                              style={inputStyle()}
                            />
                          </FieldGroup>
                          <FieldGroup label="Size (GB)">
                            <input
                              type="number"
                              min={1}
                              value={disk.size_gb}
                              onChange={(e) => updateDisk(i, { size_gb: Number(e.target.value) })}
                              style={inputStyle()}
                            />
                          </FieldGroup>
                          <FieldGroup label="Bus">
                            <select
                              value={disk.bus}
                              onChange={(e) => updateDisk(i, { bus: e.target.value as Disk['bus'] })}
                              style={inputStyle()}
                            >
                              <option value="virtio">virtio</option>
                              <option value="sata">sata</option>
                              <option value="scsi">scsi</option>
                            </select>
                          </FieldGroup>
                        </div>
                      </>
                    )}
                  </div>
                )
              })}
              <button
                onClick={addDisk}
                style={{
                  background: theme.main.card,
                  border: `1px solid ${theme.main.inputBorder}`,
                  color: theme.text.primary,
                  borderRadius: theme.radius.md,
                  padding: '8px 14px',
                  fontSize: 13,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                + Add Disk
              </button>
            </div>
          )}

          {/* Step 5 — Networking */}
          {step === 5 && (
            <div>
              {form.nics.map((nic, i) => {
                const selectedCR = networkCRs.find((cr) => cr.name === nic.network_cr)
                const isPodType = selectedCR?.network_type === 'pod'
                const interfaceType = selectedCR?.interface_type || '—'
                const badgeColors = isPodType
                  ? { bg: '#eff6ff', color: '#2563eb', border: '#bfdbfe' }
                  : { bg: '#f0fdf4', color: '#16a34a', border: '#bbf7d0' }

                // Pod-type CRs already used by other NICs
                const podCRsUsedByOthers = form.nics
                  .filter((_, idx) => idx !== i)
                  .map((n) => n.network_cr)
                  .filter((crName) => {
                    const cr = networkCRs.find((c) => c.name === crName)
                    return cr?.network_type === 'pod'
                  })

                return (
                  <div
                    key={i}
                    style={{
                      background: theme.main.card,
                      border: `1px solid ${theme.main.cardBorder}`,
                      borderRadius: theme.radius.lg,
                      padding: 20,
                      marginBottom: 12,
                    }}
                  >
                    {/* NIC card header */}
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'flex-start',
                        marginBottom: 14,
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ fontSize: 14, fontWeight: 600, color: theme.text.primary }}>
                          NIC {i + 1}
                        </span>
                        {selectedCR && (
                          <span
                            style={{
                              display: 'inline-block',
                              padding: '1px 7px',
                              borderRadius: 20,
                              fontSize: 11,
                              fontWeight: 500,
                              background: badgeColors.bg,
                              color: badgeColors.color,
                              border: `1px solid ${badgeColors.border}`,
                            }}
                          >
                            {interfaceType}
                          </span>
                        )}
                      </div>
                      <button
                        onClick={() => removeNIC(i)}
                        style={{
                          background: 'transparent',
                          border: '1px solid rgba(239,68,68,0.3)',
                          color: theme.status.error,
                          borderRadius: 5,
                          padding: '3px 8px',
                          fontSize: 11,
                          cursor: 'pointer',
                          fontFamily: 'inherit',
                        }}
                      >
                        Remove
                      </button>
                    </div>

                    {/* Network CR selector */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                      <FieldGroup label="Network">
                        <select
                          value={nic.network_cr}
                          onChange={(e) => updateNIC(i, { network_cr: e.target.value })}
                          style={inputStyle()}
                        >
                          <option value="">Select network...</option>
                          {networkCRs.map((cr) => {
                            const isPodCR = cr.network_type === 'pod'
                            const alreadyUsed = isPodCR && podCRsUsedByOthers.includes(cr.name)
                            return (
                              <option
                                key={cr.name}
                                value={cr.name}
                                disabled={alreadyUsed}
                              >
                                {cr.display_name}{alreadyUsed ? ' (already selected)' : ''}
                              </option>
                            )
                          })}
                        </select>
                      </FieldGroup>
                      <FieldGroup label="Interface Name">
                        <input
                          type="text"
                          value={nic.name}
                          onChange={(e) => updateNIC(i, { name: e.target.value })}
                          style={inputStyle()}
                        />
                      </FieldGroup>
                    </div>

                    {/* Network CR details */}
                    {selectedCR && (
                      <div
                        style={{
                          padding: '10px 14px',
                          background: theme.main.tableHeaderBg,
                          borderRadius: theme.radius.md,
                          border: `1px solid ${theme.main.cardBorder}`,
                        }}
                      >
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: selectedCR.description ? 6 : 0 }}>
                          <Badge
                            label={selectedCR.network_type}
                            variant={isPodType ? 'info' : 'success'}
                          />
                          <Badge label={interfaceType} variant="warning" />
                          {selectedCR.bridge_name && (
                            <span style={{ fontSize: 12, color: theme.text.secondary }}>
                              Bridge: <span style={{ color: theme.text.primary, fontFamily: theme.typography.mono.fontFamily }}>{selectedCR.bridge_name}</span>
                            </span>
                          )}
                          {selectedCR.vlan_id != null && (
                            <span style={{ fontSize: 12, color: theme.text.secondary }}>
                              VLAN: <span style={{ color: theme.text.primary, fontFamily: theme.typography.mono.fontFamily }}>{selectedCR.vlan_id}</span>
                            </span>
                          )}
                        </div>
                        {selectedCR.description && (
                          <div style={{ fontSize: 12, color: theme.text.secondary, lineHeight: 1.5 }}>
                            {selectedCR.description}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
              <button
                onClick={addNIC}
                style={{
                  background: theme.main.card,
                  border: `1px solid ${theme.main.inputBorder}`,
                  color: theme.text.primary,
                  borderRadius: theme.radius.md,
                  padding: '8px 14px',
                  fontSize: 13,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                + Add NIC
              </button>
            </div>
          )}

          {/* Step 6 — Scheduling */}
          {step === 6 && (
            <SectionCard>
              <FieldGroup label="Node Selector">
                <input
                  type="text"
                  value={form.node_selector}
                  onChange={(e) => updateForm({ node_selector: e.target.value })}
                  placeholder="e.g. kubernetes.io/os=linux, node-type=gpu"
                  style={inputStyle()}
                />
                <div style={{ fontSize: 11, color: theme.text.placeholder, marginTop: 4 }}>
                  Comma-separated key=value pairs for node selection constraints
                </div>
              </FieldGroup>
              <FieldGroup label="Eviction Strategy">
                <select
                  value={form.eviction_strategy}
                  onChange={(e) => updateForm({ eviction_strategy: e.target.value })}
                  style={inputStyle()}
                >
                  <option value="">None</option>
                  <option value="LiveMigrate">LiveMigrate</option>
                </select>
                <div style={{ fontSize: 11, color: theme.text.placeholder, marginTop: 4 }}>
                  LiveMigrate will automatically migrate the VM before node maintenance
                </div>
              </FieldGroup>
            </SectionCard>
          )}

          {/* Step 7 — Cloud-Init */}
          {step === 7 && (
            <SectionCard>
              <FieldGroup label="User Data (cloud-init)">
                <textarea
                  value={form.user_data}
                  onChange={(e) => updateForm({ user_data: e.target.value })}
                  placeholder="#cloud-config&#10;..."
                  rows={6}
                  style={inputStyle({ fontFamily: 'monospace', resize: 'vertical' })}
                />
              </FieldGroup>
              <FieldGroup label="Network Data">
                <textarea
                  value={form.network_data}
                  onChange={(e) => updateForm({ network_data: e.target.value })}
                  placeholder={'network:\n  version: 2\n  ethernets:\n    enp1s0:\n      dhcp4: true'}
                  rows={6}
                  style={{ ...inputStyle(), fontFamily: 'JetBrains Mono, Fira Code, monospace', fontSize: 13, resize: 'vertical' }}
                />
              </FieldGroup>
              <FieldGroup label="SSH Public Key">
                <textarea
                  value={form.ssh_key}
                  onChange={(e) => updateForm({ ssh_key: e.target.value })}
                  placeholder="ssh-rsa AAAA..."
                  rows={3}
                  style={inputStyle({ fontFamily: 'monospace', resize: 'vertical' })}
                />
              </FieldGroup>
            </SectionCard>
          )}

          {/* Step 8 — Review & Create */}
          {step === 8 && (
            <SectionCard>
              <div
                style={{ fontSize: 16, fontWeight: 600, color: theme.text.heading, marginBottom: 16 }}
              >
                Review Configuration
              </div>

              {/* Basic info rows */}
              {[
                { label: 'Name', value: <span style={{ color: theme.text.primary }}>{form.name}</span> },
                {
                  label: 'Namespace',
                  value: <span style={{ color: theme.text.primary }}>{form.namespace}</span>,
                },
                {
                  label: 'Template',
                  value: <span style={{ color: theme.text.primary }}>{form.template_name || 'None'}</span>,
                },
                {
                  label: 'Description',
                  value: (
                    <span style={{ color: theme.text.primary }}>
                      {form.description || '—'}
                    </span>
                  ),
                },
              ].map(({ label, value }) => (
                <div
                  key={label}
                  style={{
                    display: 'flex',
                    gap: 16,
                    padding: '9px 0',
                    borderBottom: `1px solid ${theme.main.tableRowBorder}`,
                    fontSize: 14,
                    alignItems: 'center',
                  }}
                >
                  <span
                    style={{
                      minWidth: 130,
                      color: theme.text.secondary,
                      fontWeight: 500,
                      flexShrink: 0,
                      fontSize: 12,
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                    }}
                  >
                    {label}
                  </span>
                  {value}
                </div>
              ))}

              {/* Compute row */}
              <div
                style={{
                  display: 'flex',
                  gap: 16,
                  padding: '9px 0',
                  borderBottom: `1px solid ${theme.main.tableRowBorder}`,
                  fontSize: 14,
                  alignItems: 'center',
                }}
              >
                <span
                  style={{
                    minWidth: 130,
                    color: theme.text.secondary,
                    fontWeight: 500,
                    flexShrink: 0,
                    fontSize: 12,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                  }}
                >
                  CPU
                </span>
                <Badge label={`${form.cpu} vCPU`} variant="neutral" />
              </div>

              <div
                style={{
                  display: 'flex',
                  gap: 16,
                  padding: '9px 0',
                  borderBottom: `1px solid ${theme.main.tableRowBorder}`,
                  fontSize: 14,
                  alignItems: 'center',
                }}
              >
                <span
                  style={{
                    minWidth: 130,
                    color: theme.text.secondary,
                    fontWeight: 500,
                    flexShrink: 0,
                    fontSize: 12,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                  }}
                >
                  Memory
                </span>
                <Badge label={`${form.memory} MB`} variant="neutral" />
              </div>

              {/* Firmware row */}
              <div
                style={{
                  display: 'flex',
                  gap: 16,
                  padding: '9px 0',
                  borderBottom: `1px solid ${theme.main.tableRowBorder}`,
                  fontSize: 14,
                  alignItems: 'center',
                }}
              >
                <span
                  style={{
                    minWidth: 130,
                    color: theme.text.secondary,
                    fontWeight: 500,
                    flexShrink: 0,
                    fontSize: 12,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                  }}
                >
                  Firmware
                </span>
                <Badge
                  label={form.firmware === 'default' ? 'Default' : form.firmware.toUpperCase()}
                  variant="neutral"
                />
                {form.firmware === 'uefi' && form.secure_boot && (
                  <Badge label="Secure Boot" variant="success" />
                )}
              </div>

              {/* Disks row */}
              <div
                style={{
                  display: 'flex',
                  gap: 16,
                  padding: '9px 0',
                  borderBottom: `1px solid ${theme.main.tableRowBorder}`,
                  fontSize: 14,
                  alignItems: 'flex-start',
                }}
              >
                <span
                  style={{
                    minWidth: 130,
                    color: theme.text.secondary,
                    fontWeight: 500,
                    flexShrink: 0,
                    fontSize: 12,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    paddingTop: 2,
                  }}
                >
                  Disks
                </span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {form.disks.map((d, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 13, color: theme.text.primary, marginRight: 2 }}>
                        {d.name}
                      </span>
                      {d.disk_type === 'cdrom' && (
                        <Badge label="CD-ROM" variant="warning" />
                      )}
                      {d.source_type === 'container_disk' ? (
                        <Badge label="container" variant="warning" />
                      ) : d.source_type === 'datavolume_clone' ? (
                        <Badge label="clone" variant="warning" />
                      ) : (
                        <Badge label={`${d.size_gb} GB`} variant="neutral" />
                      )}
                      <Badge label={d.bus} variant="info" />
                      {d.source_type === 'container_disk' && d.image && (
                        <span style={{ fontSize: 11, color: theme.text.secondary }}>
                          {d.image}
                        </span>
                      )}
                      {d.source_type === 'datavolume_clone' && d.clone_source && (
                        <span style={{ fontSize: 11, color: theme.text.secondary }}>
                          clone: {d.clone_source}{d.storage_class ? ` (${d.storage_class})` : ''}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Networks row */}
              <div
                style={{
                  display: 'flex',
                  gap: 16,
                  padding: '9px 0',
                  borderBottom: `1px solid ${theme.main.tableRowBorder}`,
                  fontSize: 14,
                  alignItems: 'flex-start',
                }}
              >
                <span
                  style={{
                    minWidth: 130,
                    color: theme.text.secondary,
                    fontWeight: 500,
                    flexShrink: 0,
                    fontSize: 12,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    paddingTop: 2,
                  }}
                >
                  Network
                </span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {form.nics.map((n, i) => {
                    const cr = networkCRs.find((c) => c.name === n.network_cr)
                    return (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: 13, color: theme.text.primary, marginRight: 2 }}>
                          {n.name}
                        </span>
                        <Badge
                          label={cr?.display_name || n.network_cr || '—'}
                          variant={cr?.network_type === 'pod' ? 'info' : 'success'}
                        />
                        {cr && (
                          <Badge label={cr.interface_type} variant="warning" />
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Scheduling row */}
              <div
                style={{
                  display: 'flex',
                  gap: 16,
                  padding: '9px 0',
                  borderBottom: `1px solid ${theme.main.tableRowBorder}`,
                  fontSize: 14,
                  alignItems: 'center',
                }}
              >
                <span
                  style={{
                    minWidth: 130,
                    color: theme.text.secondary,
                    fontWeight: 500,
                    flexShrink: 0,
                    fontSize: 12,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                  }}
                >
                  Scheduling
                </span>
                {form.node_selector ? (
                  <Badge label={form.node_selector} variant="info" />
                ) : (
                  <Badge label="No constraints" variant="neutral" />
                )}
                {form.eviction_strategy && (
                  <Badge label={form.eviction_strategy} variant="warning" />
                )}
              </div>

              {/* Cloud-Init row */}
              <div
                style={{
                  display: 'flex',
                  gap: 16,
                  padding: '9px 0',
                  borderBottom: `1px solid ${theme.main.tableRowBorder}`,
                  fontSize: 14,
                  alignItems: 'center',
                }}
              >
                <span
                  style={{
                    minWidth: 130,
                    color: theme.text.secondary,
                    fontWeight: 500,
                    flexShrink: 0,
                    fontSize: 12,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                  }}
                >
                  Cloud-Init
                </span>
                {form.user_data ? (
                  <Badge label="Configured" variant="success" />
                ) : (
                  <Badge label="None" variant="neutral" />
                )}
              </div>

              {/* Network Data row */}
              <div
                style={{
                  display: 'flex',
                  gap: 16,
                  padding: '9px 0',
                  borderBottom: `1px solid ${theme.main.tableRowBorder}`,
                  fontSize: 14,
                  alignItems: 'center',
                }}
              >
                <span
                  style={{
                    minWidth: 130,
                    color: theme.text.secondary,
                    fontWeight: 500,
                    flexShrink: 0,
                    fontSize: 12,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                  }}
                >
                  Network Data
                </span>
                {form.network_data ? (
                  <Badge label="Configured" variant="success" />
                ) : (
                  <Badge label="None" variant="neutral" />
                )}
              </div>

              {/* SSH Key row */}
              <div
                style={{
                  display: 'flex',
                  gap: 16,
                  padding: '9px 0',
                  borderBottom: `1px solid ${theme.main.tableRowBorder}`,
                  fontSize: 14,
                  alignItems: 'center',
                }}
              >
                <span
                  style={{
                    minWidth: 130,
                    color: theme.text.secondary,
                    fontWeight: 500,
                    flexShrink: 0,
                    fontSize: 12,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                  }}
                >
                  SSH Key
                </span>
                {form.ssh_key ? (
                  <Badge label="Provided" variant="success" />
                ) : (
                  <Badge label="None" variant="neutral" />
                )}
              </div>

              {error && (
                <div
                  style={{
                    marginTop: 16,
                    padding: '10px 12px',
                    background: 'rgba(239,68,68,0.08)',
                    border: '1px solid rgba(239,68,68,0.3)',
                    borderRadius: theme.radius.md,
                    color: theme.status.error,
                    fontSize: 13,
                  }}
                >
                  {error}
                </div>
              )}

              <YamlPreview
                endpoint={`/clusters/${activeCluster}/namespaces/${form.namespace}/vms/preview`}
                payload={{
                  name: form.name,
                  namespace: form.namespace,
                  description: form.description,
                  compute: {
                    cpu_cores: form.cpu,
                    memory_mb: form.memory,
                    sockets: 1,
                    threads_per_core: 1,
                  },
                  disks: form.disks.map((d) => ({
                    name: d.name,
                    size_gb: d.size_gb,
                    bus: d.bus,
                    source_type: d.source_type,
                    disk_type: d.disk_type || 'disk',
                    image: d.image,
                    clone_source: d.clone_source,
                    clone_namespace: d.clone_namespace,
                    storage_class: d.storage_class,
                  })),
                  networks: form.nics.map((n) => ({
                    name: n.name,
                    network_cr: n.network_cr,
                  })),
                  cloud_init_user_data: form.user_data || null,
                  cloud_init_network_data: form.network_data || null,
                  template_name: form.template_name || null,
                  run_strategy: 'RerunOnFailure',
                  labels: {},
                  firmware_boot_mode: form.firmware === 'default' ? null : form.firmware,
                  secure_boot: form.secure_boot,
                  node_selector: form.node_selector
                    ? Object.fromEntries(form.node_selector.split(',').map((kv) => kv.trim().split('=')))
                    : {},
                  eviction_strategy: form.eviction_strategy || null,
                }}
              />
            </SectionCard>
          )}
        </div>

        {/* Footer bar */}
        <div
          style={{
            padding: '16px 32px',
            background: theme.main.card,
            borderTop: `1px solid ${theme.main.cardBorder}`,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexShrink: 0,
          }}
        >
          <button
            onClick={() => step > 1 && setStep((s) => s - 1)}
            disabled={step === 1}
            style={{
              background: 'transparent',
              border: `1px solid ${theme.main.cardBorder}`,
              color: step === 1 ? theme.text.dim : theme.text.primary,
              borderRadius: theme.radius.md,
              padding: '8px 18px',
              fontSize: 13,
              cursor: step === 1 ? 'default' : 'pointer',
              fontFamily: 'inherit',
              opacity: step === 1 ? 0.4 : 1,
            }}
          >
            ← Back
          </button>

          {step < 8 ? (
            <button
              onClick={() => setStep((s) => s + 1)}
              disabled={!canNext()}
              style={{
                background: theme.button.primary,
                color: theme.button.primaryText,
                border: 'none',
                borderRadius: theme.radius.md,
                padding: '8px 20px',
                fontSize: 13,
                fontWeight: 500,
                cursor: canNext() ? 'pointer' : 'not-allowed',
                fontFamily: 'inherit',
                opacity: canNext() ? 1 : 0.4,
                filter: canNext() ? 'none' : 'grayscale(50%)',
                transition: 'opacity 0.15s, filter 0.15s',
              }}
            >
              Next Step →
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={createVM.isPending}
              style={{
                background: theme.button.primary,
                color: theme.button.primaryText,
                border: 'none',
                borderRadius: theme.radius.md,
                padding: '8px 20px',
                fontSize: 13,
                fontWeight: 600,
                cursor: createVM.isPending ? 'not-allowed' : 'pointer',
                fontFamily: 'inherit',
                opacity: createVM.isPending ? 0.7 : 1,
              }}
            >
              {createVM.isPending ? 'Creating...' : 'Create Virtual Machine'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

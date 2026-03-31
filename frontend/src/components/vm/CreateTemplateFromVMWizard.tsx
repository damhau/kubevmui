import { useState, useEffect } from 'react'
import { useVMTemplateConfig, useCreateTemplateFromVM } from '@/hooks/useVMs'
import { useStorageClasses } from '@/hooks/useImages'
import { useNetworkCRs, type NetworkCR } from '@/hooks/useNetworkCRs'
import { theme } from '@/lib/theme'
import { extractErrorMessage } from '@/lib/api-client'
import { toast } from '@/components/ui/Toast'

const STEPS = [
  { id: 1, label: 'Basic Information', description: 'Template name, category, and description' },
  { id: 2, label: 'Compute Resources', description: 'CPU and memory configuration' },
  { id: 3, label: 'Storage', description: 'Disk images to clone from the VM' },
  { id: 4, label: 'Networking', description: 'Network interface configuration' },
  { id: 5, label: 'Cloud-Init', description: 'Initialization scripts' },
  { id: 6, label: 'Review & Create', description: 'Review and create template' },
]

const COMPUTE_PRESETS = [
  { label: 'Small', cpu: 1, memory: 2048, description: 'Light workloads' },
  { label: 'Medium', cpu: 2, memory: 4096, description: 'General purpose' },
  { label: 'Large', cpu: 4, memory: 8192, description: 'Production workloads' },
  { label: 'XL', cpu: 8, memory: 16384, description: 'High performance' },
  { label: 'Custom', cpu: 0, memory: 0, description: 'Define your own' },
]

interface DiskEntry {
  name: string
  size_gb: number
  bus: string
  source_type: string
  image: string
  volume_name: string
  storage_class: string
  image_name: string
}

interface NICEntry {
  name: string
  network_cr: string
}

interface FormData {
  template_name: string
  template_display_name: string
  description: string
  category: string
  os_type: string
  cpu: number
  memory: number
  preset: string
  sockets: number
  threads_per_core: number
  disks: DiskEntry[]
  nics: NICEntry[]
  cloud_init_user_data: string
  cloud_init_network_data: string
}

interface Props {
  vmName: string
  vmNamespace: string
  onClose: () => void
  onSuccess: () => void
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

const MAX_DISK_SIZE_GB = 500

export function CreateTemplateFromVMWizard({ vmName, vmNamespace, onClose, onSuccess }: Props) {
  const { data: configData, isLoading, error: configError } = useVMTemplateConfig(vmNamespace, vmName, true)
  const createTemplate = useCreateTemplateFromVM()
  const { data: storageClassData } = useStorageClasses()
  const { data: networkCRsData } = useNetworkCRs()
  const networkCRs: NetworkCR[] = networkCRsData?.items || []
  const storageClasses: Array<{ name: string; is_default: boolean }> = Array.isArray(storageClassData?.items) ? storageClassData.items : []

  const [step, setStep] = useState(1)
  const [error, setError] = useState('')
  const [form, setForm] = useState<FormData>({
    template_name: '',
    template_display_name: '',
    description: '',
    category: 'custom',
    os_type: '',
    cpu: 1,
    memory: 2048,
    preset: 'Custom',
    sockets: 1,
    threads_per_core: 1,
    disks: [],
    nics: [],
    cloud_init_user_data: '',
    cloud_init_network_data: '',
  })

  // Populate form from backend config once loaded
  useEffect(() => {
    if (!configData) return
    const matchPreset = COMPUTE_PRESETS.find(
      (p) => p.cpu === configData.compute.cpu_cores && p.memory === configData.compute.memory_mb,
    )
    setForm({
      template_name: configData.template_name || `${vmName}-tpl`,
      template_display_name: configData.template_display_name || `${vmName} template`,
      description: '',
      category: 'custom',
      os_type: configData.os_type || '',
      cpu: configData.compute.cpu_cores || 1,
      memory: configData.compute.memory_mb || 2048,
      preset: matchPreset ? matchPreset.label : 'Custom',
      sockets: configData.compute.sockets || 1,
      threads_per_core: configData.compute.threads_per_core || 1,
      disks: (configData.disks || []).map((d: any) => ({
        name: d.name || '',
        size_gb: d.size_gb || 0,
        bus: d.bus || 'virtio',
        source_type: d.source_type || 'pvc',
        image: d.image || '',
        volume_name: d.volume_name || '',
        storage_class: d.storage_class || '',
        image_name: d.image_name || '',
      })),
      nics: (configData.networks || []).map((n: any) => ({
        name: n.name || '',
        network_cr: n.network_cr || '',
      })),
      cloud_init_user_data: configData.cloud_init_user_data || '',
      cloud_init_network_data: configData.cloud_init_network_data || '',
    })
  }, [configData, vmName])

  const updateForm = (patch: Partial<FormData>) => setForm((f) => ({ ...f, ...patch }))

  const updateDisk = (i: number, patch: Partial<DiskEntry>) =>
    updateForm({ disks: form.disks.map((d, idx) => (idx === i ? { ...d, ...patch } : d)) })

  const updateNIC = (i: number, patch: Partial<NICEntry>) =>
    updateForm({ nics: form.nics.map((n, idx) => (idx === i ? { ...n, ...patch } : n)) })

  const removeNIC = (i: number) =>
    updateForm({ nics: form.nics.filter((_, idx) => idx !== i) })

  const addNIC = () =>
    updateForm({ nics: [...form.nics, { name: `nic${form.nics.length}`, network_cr: '' }] })

  const handleSubmit = () => {
    setError('')
    const payload = {
      template_name: form.template_name,
      template_display_name: form.template_display_name,
      description: form.description,
      category: form.category,
      os_type: form.os_type || null,
      compute: {
        cpu_cores: form.cpu,
        memory_mb: form.memory,
        sockets: form.sockets,
        threads_per_core: form.threads_per_core,
      },
      disks: form.disks.map((d) => ({
        name: d.name,
        size_gb: d.size_gb,
        bus: d.bus,
        source_type: d.source_type,
        image: d.image,
        volume_name: d.volume_name,
        storage_class: d.storage_class,
        image_name: d.image_name,
      })),
      networks: form.nics.map((n) => ({
        name: n.name,
        network_cr: n.network_cr,
      })),
      cloud_init_user_data: form.cloud_init_user_data || null,
      cloud_init_network_data: form.cloud_init_network_data || null,
    }
    createTemplate.mutate(
      { namespace: vmNamespace, name: vmName, body: payload },
      {
        onSuccess: () => {
          toast.success('Template created successfully')
          onSuccess()
        },
        onError: (err: unknown) => {
          const msg = extractErrorMessage(err, 'Failed to create template')
          setError(msg)
          toast.error(msg)
        },
      },
    )
  }

  const canNext = () => {
    if (step === 1) return form.template_name.trim().length > 0 && form.template_display_name.trim().length > 0
    return true
  }

  const currentStep = STEPS[step - 1]
  const totalSteps = STEPS.length

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
      cursor: isCompleted ? 'pointer' : 'default',
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

  // Loading state
  if (isLoading) {
    return (
      <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 14, color: theme.text.secondary, marginBottom: 8 }}>Loading VM configuration...</div>
          <div style={{ fontSize: 12, color: theme.text.dim }}>Extracting disks, networks, and cloud-init from {vmName}</div>
        </div>
      </div>
    )
  }

  // Error state
  if (configError) {
    return (
      <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', maxWidth: 400 }}>
          <div style={{ fontSize: 14, color: theme.status.error, marginBottom: 8 }}>
            Failed to load VM configuration
          </div>
          <div style={{ fontSize: 12, color: theme.text.secondary, marginBottom: 16 }}>
            {extractErrorMessage(configError, 'Unknown error')}
          </div>
          <button
            onClick={onClose}
            style={{
              background: theme.button.secondary,
              color: theme.button.secondaryText,
              border: `1px solid ${theme.button.secondaryBorder}`,
              borderRadius: theme.radius.md,
              padding: '8px 18px',
              fontSize: 13,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            Close
          </button>
        </div>
      </div>
    )
  }

  const pvcDiskCount = form.disks.filter((d) => d.source_type === 'pvc').length
  const containerDiskCount = form.disks.filter((d) => d.source_type === 'container_disk').length

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
        <div style={{ padding: '24px 20px 20px', borderBottom: `1px solid ${theme.main.cardBorder}` }}>
          <div style={{ fontSize: 13, fontWeight: 700, fontFamily: theme.typography.heading.fontFamily, color: theme.text.heading, lineHeight: 1.3 }}>
            Create Template from VM
          </div>
          <div style={{ fontSize: 11, color: theme.text.secondary, marginTop: 4, fontFamily: theme.typography.mono.fontFamily }}>
            {vmName}
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', paddingTop: 8, paddingBottom: 8 }}>
          {STEPS.map((s) => (
            <div
              key={s.id}
              style={stepItemStyle(s)}
              onClick={() => { if (step > s.id) setStep(s.id) }}
            >
              <div style={circleStyle(s)}>{step > s.id ? '✓' : s.id}</div>
              <span
                style={{
                  fontSize: 13,
                  fontWeight: step === s.id ? 700 : 400,
                  color: step === s.id ? theme.text.heading : step > s.id ? theme.text.primary : theme.text.secondary,
                  lineHeight: 1.3,
                }}
              >
                {s.label}
              </span>
            </div>
          ))}
        </div>

        <div style={{ padding: '16px 20px', borderTop: `1px solid ${theme.main.cardBorder}` }}>
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
      <div style={{ flex: 1, background: theme.main.bg, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
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
              <FieldGroup label="Template Name *">
                <input
                  type="text"
                  value={form.template_name}
                  onChange={(e) => updateForm({ template_name: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })}
                  placeholder="my-vm-template"
                  style={inputStyle()}
                  autoFocus
                />
                <div style={{ fontSize: 11, color: theme.text.placeholder, marginTop: 4 }}>
                  Kubernetes resource name (lowercase, alphanumeric and hyphens)
                </div>
              </FieldGroup>
              <FieldGroup label="Display Name *">
                <input
                  type="text"
                  value={form.template_display_name}
                  onChange={(e) => updateForm({ template_display_name: e.target.value })}
                  placeholder="My VM Template"
                  style={inputStyle()}
                />
              </FieldGroup>
              <FieldGroup label="Description">
                <textarea
                  value={form.description}
                  onChange={(e) => updateForm({ description: e.target.value })}
                  placeholder="Optional description..."
                  rows={3}
                  style={inputStyle({ resize: 'vertical' })}
                />
              </FieldGroup>
              <div style={{ display: 'flex', gap: 16 }}>
                <div style={{ flex: 1 }}>
                  <FieldGroup label="Category">
                    <select
                      value={form.category}
                      onChange={(e) => updateForm({ category: e.target.value })}
                      style={inputStyle()}
                    >
                      <option value="custom">Custom</option>
                      <option value="os">OS</option>
                      <option value="application">Application</option>
                      <option value="base">Base</option>
                    </select>
                  </FieldGroup>
                </div>
                <div style={{ flex: 1 }}>
                  <FieldGroup label="OS Type">
                    <select
                      value={form.os_type}
                      onChange={(e) => updateForm({ os_type: e.target.value })}
                      style={inputStyle()}
                    >
                      <option value="">None</option>
                      <option value="linux">Linux</option>
                      <option value="windows">Windows</option>
                    </select>
                  </FieldGroup>
                </div>
              </div>
              <div style={{ padding: '12px 16px', background: theme.main.tableHeaderBg, borderRadius: theme.radius.md, fontSize: 12, color: theme.text.secondary, lineHeight: 1.6 }}>
                Source VM: <strong style={{ color: theme.text.primary }}>{vmName}</strong> in <strong style={{ color: theme.text.primary }}>{vmNamespace}</strong>
                <br />
                {pvcDiskCount > 0 && <>{pvcDiskCount} disk{pvcDiskCount > 1 ? 's' : ''} will be cloned as Image{pvcDiskCount > 1 ? 's' : ''}. </>}
                {containerDiskCount > 0 && <>{containerDiskCount} container disk{containerDiskCount > 1 ? 's' : ''} will be referenced directly.</>}
              </div>
            </SectionCard>
          )}

          {/* Step 2 — Compute Resources */}
          {step === 2 && (
            <SectionCard>
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
                            updateForm({ preset: preset.label, cpu: preset.cpu, memory: preset.memory })
                          }
                        }}
                        style={{
                          width: 130,
                          background: isSelected ? theme.accentLight : theme.main.card,
                          border: isSelected ? `2px solid ${theme.accent}` : `1px solid ${theme.main.cardBorder}`,
                          borderRadius: theme.radius.lg,
                          padding: 16,
                          cursor: 'pointer',
                          textAlign: 'left' as const,
                          fontFamily: 'inherit',
                          transition: 'border-color 0.15s, background 0.15s',
                          margin: isSelected ? 0 : 1,
                        }}
                      >
                        {preset.label === 'Custom' ? (
                          <div style={{ color: isSelected ? theme.accent : theme.text.secondary, marginBottom: 6 }}>
                            <SettingsIcon />
                          </div>
                        ) : (
                          <div style={{ fontSize: 12, color: theme.text.secondary, marginBottom: 4 }}>
                            {preset.cpu} CPU · {preset.memory >= 1024 ? `${preset.memory / 1024} GB` : `${preset.memory} MB`}
                          </div>
                        )}
                        <div style={{ fontSize: 14, fontWeight: 700, color: isSelected ? theme.accent : theme.text.heading, marginBottom: 4 }}>
                          {preset.label}
                        </div>
                        <div style={{ fontSize: 11, color: theme.text.dim }}>{preset.description}</div>
                      </button>
                    )
                  })}
                </div>
              </div>

              {form.preset === 'Custom' && (
                <div>
                  <div style={{ height: 1, background: theme.main.cardBorder, marginBottom: 16 }} />
                  <FieldGroup label="CPU Cores">
                    <input
                      type="number"
                      min={1}
                      max={64}
                      value={form.cpu}
                      onChange={(e) => updateForm({ cpu: Number(e.target.value) })}
                      style={inputStyle()}
                    />
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
                  </FieldGroup>
                </div>
              )}
            </SectionCard>
          )}

          {/* Step 3 — Storage */}
          {step === 3 && (
            <div>
              {form.disks.length === 0 && (
                <SectionCard>
                  <div style={{ textAlign: 'center', padding: 20, color: theme.text.secondary, fontSize: 13 }}>
                    No disks found in this VM.
                  </div>
                </SectionCard>
              )}
              {form.disks.map((disk, i) => {
                const barPercent = Math.min((disk.size_gb / MAX_DISK_SIZE_GB) * 100, 100)
                const isPVC = disk.source_type === 'pvc'
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
                    {/* Header */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
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
                            {disk.name}
                          </span>
                          <div style={{ marginTop: 3, display: 'flex', gap: 4 }}>
                            <span style={{
                              display: 'inline-block',
                              padding: '1px 7px',
                              borderRadius: 20,
                              fontSize: 11,
                              fontWeight: 500,
                              background: busColor.bg,
                              color: busColor.color,
                              border: `1px solid ${busColor.border}`,
                            }}>
                              {disk.bus}
                            </span>
                            <span style={{
                              display: 'inline-block',
                              padding: '1px 7px',
                              borderRadius: 20,
                              fontSize: 11,
                              fontWeight: 500,
                              background: isPVC ? '#eff6ff' : '#fdf2f8',
                              color: isPVC ? '#2563eb' : '#be185d',
                              border: `1px solid ${isPVC ? '#bfdbfe' : '#fbcfe8'}`,
                            }}>
                              {isPVC ? 'will clone' : 'container disk'}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Size bar */}
                    {disk.size_gb > 0 && (
                      <div style={{ marginBottom: 14 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                          <span style={{ fontSize: 11, color: theme.text.dim }}>Disk Size</span>
                          <span style={{ fontSize: 12, fontWeight: 600, color: theme.text.primary, fontFamily: theme.typography.mono.fontFamily }}>
                            {disk.size_gb} GB
                          </span>
                        </div>
                        <div style={{ height: 6, background: theme.main.tableHeaderBg, borderRadius: 3 }}>
                          <div style={{ height: '100%', width: `${barPercent}%`, background: theme.accent, borderRadius: 3, transition: 'width 0.3s' }} />
                        </div>
                      </div>
                    )}

                    {/* PVC disk: editable fields */}
                    {isPVC && (
                      <div>
                        <FieldGroup label="Image Name">
                          <input
                            type="text"
                            value={disk.image_name}
                            onChange={(e) => updateDisk(i, { image_name: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })}
                            placeholder="image-name"
                            style={inputStyle()}
                          />
                          <div style={{ fontSize: 11, color: theme.text.placeholder, marginTop: 4 }}>
                            Name for the Image CRD cloned from PVC "{disk.volume_name}"
                          </div>
                        </FieldGroup>
                        <div style={{ display: 'flex', gap: 12 }}>
                          <div style={{ flex: 1 }}>
                            <FieldGroup label="Size (GB)">
                              <input
                                type="number"
                                min={1}
                                value={disk.size_gb}
                                onChange={(e) => updateDisk(i, { size_gb: Number(e.target.value) })}
                                style={inputStyle()}
                              />
                            </FieldGroup>
                          </div>
                          <div style={{ flex: 1 }}>
                            <FieldGroup label="Bus">
                              <select value={disk.bus} onChange={(e) => updateDisk(i, { bus: e.target.value })} style={inputStyle()}>
                                <option value="virtio">virtio</option>
                                <option value="sata">sata</option>
                                <option value="scsi">scsi</option>
                              </select>
                            </FieldGroup>
                          </div>
                          <div style={{ flex: 1 }}>
                            <FieldGroup label="Storage Class">
                              <select value={disk.storage_class} onChange={(e) => updateDisk(i, { storage_class: e.target.value })} style={inputStyle()}>
                                <option value="">Default</option>
                                {storageClasses.map((sc) => (
                                  <option key={sc.name} value={sc.name}>{sc.name}{sc.is_default ? ' (default)' : ''}</option>
                                ))}
                              </select>
                            </FieldGroup>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Container disk: read-only info */}
                    {!isPVC && disk.image && (
                      <div style={{ fontSize: 12, color: theme.text.secondary, fontFamily: theme.typography.mono.fontFamily, wordBreak: 'break-all' }}>
                        Image: {disk.image}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* Step 4 — Networking */}
          {step === 4 && (
            <div>
              {form.nics.map((nic, i) => (
                <SectionCard key={i}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <span style={{ fontSize: 14, fontWeight: 600, color: theme.text.primary }}>
                      Interface {i + 1}
                    </span>
                    {form.nics.length > 1 && (
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
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 12 }}>
                    <div style={{ flex: 1 }}>
                      <FieldGroup label="Name">
                        <input
                          type="text"
                          value={nic.name}
                          onChange={(e) => updateNIC(i, { name: e.target.value })}
                          style={inputStyle()}
                        />
                      </FieldGroup>
                    </div>
                    <div style={{ flex: 1 }}>
                      <FieldGroup label="Network">
                        <select
                          value={nic.network_cr}
                          onChange={(e) => updateNIC(i, { network_cr: e.target.value })}
                          style={inputStyle()}
                        >
                          <option value="">Select network...</option>
                          <option value="pod-network">Pod Network (default)</option>
                          {networkCRs.filter((n) => n.name !== 'pod-network').map((n) => (
                            <option key={n.name} value={n.name}>{n.display_name || n.name}</option>
                          ))}
                        </select>
                      </FieldGroup>
                    </div>
                  </div>
                </SectionCard>
              ))}
              <button
                onClick={addNIC}
                style={{
                  width: '100%',
                  padding: '10px 0',
                  background: 'transparent',
                  border: `1px dashed ${theme.main.cardBorder}`,
                  borderRadius: theme.radius.md,
                  color: theme.accent,
                  fontSize: 13,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  marginTop: 4,
                }}
              >
                + Add Network Interface
              </button>
            </div>
          )}

          {/* Step 5 — Cloud-Init */}
          {step === 5 && (
            <SectionCard>
              <FieldGroup label="User Data">
                <textarea
                  value={form.cloud_init_user_data}
                  onChange={(e) => updateForm({ cloud_init_user_data: e.target.value })}
                  placeholder="#cloud-config&#10;..."
                  rows={12}
                  style={inputStyle({ resize: 'vertical', fontFamily: theme.typography.mono.fontFamily, fontSize: 13 })}
                />
              </FieldGroup>
              <FieldGroup label="Network Data">
                <textarea
                  value={form.cloud_init_network_data}
                  onChange={(e) => updateForm({ cloud_init_network_data: e.target.value })}
                  placeholder="Network configuration (optional)..."
                  rows={8}
                  style={inputStyle({ resize: 'vertical', fontFamily: theme.typography.mono.fontFamily, fontSize: 13 })}
                />
              </FieldGroup>
            </SectionCard>
          )}

          {/* Step 6 — Review & Create */}
          {step === 6 && (
            <SectionCard>
              <div style={{ fontSize: 15, fontWeight: 600, color: theme.text.heading, marginBottom: 16 }}>
                Template Summary
              </div>

              {error && (
                <div style={{ color: theme.status.error, fontSize: 13, marginBottom: 12, padding: '8px 12px', background: `${theme.status.error}10`, borderRadius: theme.radius.md }}>
                  {error}
                </div>
              )}

              {/* Basic Info */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: theme.text.secondary, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
                  Basic Information
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: '6px 16px', fontSize: 13 }}>
                  <span style={{ color: theme.text.dim }}>Name:</span>
                  <span style={{ color: theme.text.primary, fontFamily: theme.typography.mono.fontFamily }}>{form.template_name}</span>
                  <span style={{ color: theme.text.dim }}>Display Name:</span>
                  <span style={{ color: theme.text.primary }}>{form.template_display_name}</span>
                  <span style={{ color: theme.text.dim }}>Category:</span>
                  <span style={{ color: theme.text.primary }}>{form.category}</span>
                  {form.os_type && <>
                    <span style={{ color: theme.text.dim }}>OS Type:</span>
                    <span style={{ color: theme.text.primary }}>{form.os_type}</span>
                  </>}
                  <span style={{ color: theme.text.dim }}>Source VM:</span>
                  <span style={{ color: theme.text.primary, fontFamily: theme.typography.mono.fontFamily }}>{vmNamespace}/{vmName}</span>
                </div>
              </div>

              <div style={{ height: 1, background: theme.main.cardBorder, marginBottom: 16 }} />

              {/* Compute */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: theme.text.secondary, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
                  Compute
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: '6px 16px', fontSize: 13 }}>
                  <span style={{ color: theme.text.dim }}>CPU:</span>
                  <span style={{ color: theme.text.primary }}>{form.cpu} vCPU</span>
                  <span style={{ color: theme.text.dim }}>Memory:</span>
                  <span style={{ color: theme.text.primary }}>{form.memory >= 1024 ? `${(form.memory / 1024).toFixed(1)} GB` : `${form.memory} MB`}</span>
                </div>
              </div>

              <div style={{ height: 1, background: theme.main.cardBorder, marginBottom: 16 }} />

              {/* Disks */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: theme.text.secondary, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
                  Storage ({form.disks.length} disk{form.disks.length !== 1 ? 's' : ''})
                </div>
                {form.disks.map((d, i) => (
                  <div key={i} style={{ fontSize: 13, marginBottom: 4, display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span style={{ color: theme.text.primary, fontFamily: theme.typography.mono.fontFamily }}>{d.name}</span>
                    <span style={{ color: theme.text.dim }}>—</span>
                    {d.source_type === 'pvc' ? (
                      <span style={{ color: theme.text.secondary }}>
                        {d.size_gb} GB, clone as <span style={{ fontFamily: theme.typography.mono.fontFamily, color: theme.accent }}>{d.image_name}</span>
                      </span>
                    ) : (
                      <span style={{ color: theme.text.secondary }}>container disk</span>
                    )}
                  </div>
                ))}
              </div>

              <div style={{ height: 1, background: theme.main.cardBorder, marginBottom: 16 }} />

              {/* Networks */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: theme.text.secondary, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
                  Networking ({form.nics.length} interface{form.nics.length !== 1 ? 's' : ''})
                </div>
                {form.nics.map((n, i) => (
                  <div key={i} style={{ fontSize: 13, marginBottom: 4 }}>
                    <span style={{ color: theme.text.primary, fontFamily: theme.typography.mono.fontFamily }}>{n.name}</span>
                    <span style={{ color: theme.text.dim }}> — </span>
                    <span style={{ color: theme.text.secondary }}>{n.network_cr || 'none'}</span>
                  </div>
                ))}
              </div>

              {(form.cloud_init_user_data || form.cloud_init_network_data) && (
                <>
                  <div style={{ height: 1, background: theme.main.cardBorder, marginBottom: 16 }} />
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: theme.text.secondary, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
                      Cloud-Init
                    </div>
                    <div style={{ fontSize: 12, color: theme.text.secondary }}>
                      {form.cloud_init_user_data && 'User data configured'}
                      {form.cloud_init_user_data && form.cloud_init_network_data && ' · '}
                      {form.cloud_init_network_data && 'Network data configured'}
                    </div>
                  </div>
                </>
              )}
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

          {step < totalSteps ? (
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
              disabled={createTemplate.isPending}
              style={{
                background: theme.button.primary,
                color: theme.button.primaryText,
                border: 'none',
                borderRadius: theme.radius.md,
                padding: '8px 20px',
                fontSize: 13,
                fontWeight: 600,
                cursor: createTemplate.isPending ? 'not-allowed' : 'pointer',
                fontFamily: 'inherit',
                opacity: createTemplate.isPending ? 0.7 : 1,
              }}
            >
              {createTemplate.isPending ? 'Creating...' : 'Create Template'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

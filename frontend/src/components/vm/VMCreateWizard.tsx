import { useState } from 'react'
import { useCreateVM } from '@/hooks/useVMs'
import { useNamespaces } from '@/hooks/useNamespaces'
import { theme } from '@/lib/theme'

const STEPS = [
  { id: 1, label: 'Basic Information', description: 'Name, namespace, and description for your virtual machine' },
  { id: 2, label: 'Compute Resources', description: 'CPU and memory configuration' },
  { id: 3, label: 'Storage', description: 'Configure disk volumes for the virtual machine' },
  { id: 4, label: 'Networking', description: 'Network interface configuration' },
  { id: 5, label: 'Cloud-Init', description: 'Initialization scripts and SSH keys' },
  { id: 6, label: 'Review & Create', description: 'Review your configuration before creating the VM' },
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
}

interface NIC {
  name: string
  network_profile: string
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
  ssh_key: string
}

interface VMCreateWizardProps {
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

export function VMCreateWizard({ onClose, onSuccess }: VMCreateWizardProps) {
  const createVM = useCreateVM()
  const { data: namespacesData } = useNamespaces()
  const [step, setStep] = useState(1)
  const [error, setError] = useState('')

  const namespaces: string[] = Array.isArray(namespacesData)
    ? namespacesData.map((n: { name?: string } | string) =>
        typeof n === 'string' ? n : n.name ?? String(n),
      )
    : ['default']

  const [form, setForm] = useState<FormData>({
    name: '',
    namespace: 'default',
    description: '',
    cpu: 2,
    memory: 4096,
    preset: 'Medium',
    disks: [],
    nics: [{ name: 'default', network_profile: 'pod' }],
    user_data: '',
    ssh_key: '',
  })

  const updateForm = (patch: Partial<FormData>) => setForm((f) => ({ ...f, ...patch }))

  const addDisk = () =>
    updateForm({
      disks: [...form.disks, { name: `disk${form.disks.length}`, size_gb: 10, bus: 'virtio' }],
    })

  const removeDisk = (i: number) =>
    updateForm({ disks: form.disks.filter((_, idx) => idx !== i) })

  const updateDisk = (i: number, patch: Partial<Disk>) =>
    updateForm({ disks: form.disks.map((d, idx) => (idx === i ? { ...d, ...patch } : d)) })

  const addNIC = () =>
    updateForm({
      nics: [...form.nics, { name: `nic${form.nics.length}`, network_profile: '' }],
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
      })),
      networks: form.nics.map((n) => ({
        name: n.name,
        network_profile: n.network_profile || 'pod',
      })),
      cloud_init_user_data: form.user_data || null,
      run_strategy: 'RerunOnFailure',
      labels: {},
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
      opacity: !isActive && !isCompleted ? 0.5 : 1,
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
          <div style={{ fontSize: 13, fontWeight: 700, color: theme.text.heading, lineHeight: 1.3 }}>
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
        <div style={{ padding: '32px 32px 0' }}>
          <div style={{ fontSize: 18, fontWeight: 600, color: theme.text.heading, marginBottom: 4 }}>
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
              <FieldGroup label="Description">
                <textarea
                  value={form.description}
                  onChange={(e) => updateForm({ description: e.target.value })}
                  placeholder="Optional description..."
                  rows={3}
                  style={inputStyle({ resize: 'vertical' })}
                />
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

          {/* Step 3 — Storage */}
          {step === 3 && (
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
                          <div style={{ marginTop: 3 }}>
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

                    {/* Form fields */}
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

          {/* Step 4 — Networking */}
          {step === 4 && (
            <div>
              {form.nics.map((nic, i) => (
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
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: 14,
                    }}
                  >
                    <span style={{ fontSize: 14, fontWeight: 600, color: theme.text.primary }}>
                      NIC {i + 1}
                    </span>
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
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <FieldGroup label="Name">
                      <input
                        type="text"
                        value={nic.name}
                        onChange={(e) => updateNIC(i, { name: e.target.value })}
                        style={inputStyle()}
                      />
                    </FieldGroup>
                    <FieldGroup label="Network Profile">
                      <input
                        type="text"
                        value={nic.network_profile}
                        onChange={(e) => updateNIC(i, { network_profile: e.target.value })}
                        placeholder="e.g. default"
                        style={inputStyle()}
                      />
                    </FieldGroup>
                  </div>
                </div>
              ))}
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

          {/* Step 5 — Cloud-Init */}
          {step === 5 && (
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

          {/* Step 6 — Review & Create */}
          {step === 6 && (
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
                      <Badge label={`${d.size_gb} GB`} variant="neutral" />
                      <Badge label={d.bus} variant="info" />
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
                  {form.nics.map((n, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 13, color: theme.text.primary, marginRight: 2 }}>
                        {n.name}
                      </span>
                      {n.network_profile && (
                        <Badge label={n.network_profile} variant="info" />
                      )}
                    </div>
                  ))}
                </div>
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

          {step < 6 ? (
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
                opacity: canNext() ? 1 : 0.5,
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

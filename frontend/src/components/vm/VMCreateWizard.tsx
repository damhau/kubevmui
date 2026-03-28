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
    memory: 2048,
    disks: [{ name: 'disk0', size_gb: 20, bus: 'virtio' }],
    nics: [{ name: 'nic0', network_profile: 'default' }],
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
    createVM.mutate(form, {
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

  // Left panel step item styles
  const stepItemStyle = (s: typeof STEPS[0]): React.CSSProperties => {
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
      opacity: (!isActive && !isCompleted) ? 0.5 : 1,
    }
  }

  const circleStyle = (s: typeof STEPS[0]): React.CSSProperties => {
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
              <div style={circleStyle(s)}>
                {step > s.id ? '✓' : s.id}
              </div>
              <span
                style={{
                  fontSize: 13,
                  fontWeight: step === s.id ? 700 : 400,
                  color: step === s.id
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
                    <option key={ns} value={ns}>{ns}</option>
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

          {step === 2 && (
            <SectionCard>
              <FieldGroup label="CPU Cores">
                <input
                  type="number"
                  min={1}
                  max={64}
                  value={form.cpu}
                  onChange={(e) => updateForm({ cpu: Number(e.target.value) })}
                  style={inputStyle()}
                />
                <div style={{ fontSize: 11, color: theme.text.placeholder, marginTop: 4 }}>1 – 64 cores</div>
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
                <div style={{ fontSize: 11, color: theme.text.placeholder, marginTop: 4 }}>512 – 65536 MB</div>
              </FieldGroup>
            </SectionCard>
          )}

          {step === 3 && (
            <div>
              {form.disks.map((disk, i) => (
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
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                    <span style={{ fontSize: 14, fontWeight: 600, color: theme.text.primary }}>Disk {i + 1}</span>
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
              ))}
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
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                    <span style={{ fontSize: 14, fontWeight: 600, color: theme.text.primary }}>NIC {i + 1}</span>
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

          {step === 6 && (
            <SectionCard>
              <div style={{ fontSize: 16, fontWeight: 600, color: theme.text.heading, marginBottom: 16 }}>
                Review Configuration
              </div>
              {[
                ['Name', form.name],
                ['Namespace', form.namespace],
                ['Description', form.description || '—'],
                ['CPU', `${form.cpu} vCPU`],
                ['Memory', `${form.memory} MB`],
                ['Disks', form.disks.map((d) => `${d.name} (${d.size_gb}GB, ${d.bus})`).join(', ')],
                ['NICs', form.nics.map((n) => `${n.name} → ${n.network_profile}`).join(', ')],
                ['Cloud-Init', form.user_data ? 'Provided' : 'None'],
                ['SSH Key', form.ssh_key ? 'Provided' : 'None'],
              ].map(([label, value]) => (
                <div
                  key={label}
                  style={{
                    display: 'flex',
                    gap: 16,
                    padding: '9px 0',
                    borderBottom: `1px solid ${theme.main.tableRowBorder}`,
                    fontSize: 14,
                  }}
                >
                  <span style={{ minWidth: 130, color: theme.text.secondary, fontWeight: 500, flexShrink: 0, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</span>
                  <span style={{ color: theme.text.primary }}>{value}</span>
                </div>
              ))}

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

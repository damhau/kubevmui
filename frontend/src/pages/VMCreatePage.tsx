import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCreateVM } from '@/hooks/useVMs'
import { useNamespaces } from '@/hooks/useNamespaces'

const STEPS = [
  { id: 1, label: 'Basics' },
  { id: 2, label: 'Compute' },
  { id: 3, label: 'Storage' },
  { id: 4, label: 'Networking' },
  { id: 5, label: 'Cloud-Init' },
  { id: 6, label: 'Review' },
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

function inputStyle(extra?: React.CSSProperties): React.CSSProperties {
  return {
    width: '100%',
    background: '#2e2e33',
    border: '1px solid #3a3a3f',
    borderRadius: 6,
    color: '#e4e4e7',
    fontSize: 13,
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
    color: '#a1a1aa',
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

export function VMCreatePage() {
  const navigate = useNavigate()
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
      onSuccess: () => navigate('/vms'),
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

  const sectionCard = (children: React.ReactNode) => (
    <div
      style={{
        background: '#2a2a2e',
        border: '1px solid #3a3a3f',
        borderRadius: 8,
        padding: 24,
        maxWidth: 560,
      }}
    >
      {children}
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <div
        style={{
          padding: '16px 24px',
          borderBottom: '1px solid #3a3a3f',
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          flexShrink: 0,
        }}
      >
        <button
          onClick={() => navigate('/vms')}
          style={{
            background: 'transparent',
            border: 'none',
            color: '#71717a',
            fontSize: 13,
            cursor: 'pointer',
            padding: 0,
            fontFamily: 'inherit',
          }}
        >
          ← VMs
        </button>
        <h1 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: '#f0f0f0' }}>
          Create Virtual Machine
        </h1>
      </div>

      {/* Step indicator */}
      <div
        style={{
          padding: '16px 24px',
          borderBottom: '1px solid #3a3a3f',
          display: 'flex',
          gap: 0,
          flexShrink: 0,
          overflowX: 'auto',
        }}
      >
        {STEPS.map((s, i) => (
          <div
            key={s.id}
            style={{ display: 'flex', alignItems: 'center', gap: 0 }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 8px' }}>
              <div
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: '50%',
                  background:
                    step === s.id
                      ? '#6366f1'
                      : step > s.id
                        ? 'rgba(99,102,241,0.3)'
                        : '#3a3a3f',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 11,
                  fontWeight: 700,
                  color:
                    step === s.id
                      ? '#fff'
                      : step > s.id
                        ? '#818cf8'
                        : '#6b6b73',
                  flexShrink: 0,
                }}
              >
                {step > s.id ? '✓' : s.id}
              </div>
              <span
                style={{
                  fontSize: 12,
                  fontWeight: step === s.id ? 600 : 400,
                  color: step === s.id ? '#e4e4e7' : step > s.id ? '#818cf8' : '#6b6b73',
                  whiteSpace: 'nowrap',
                }}
              >
                {s.label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div
                style={{
                  width: 24,
                  height: 1,
                  background: step > s.id ? '#6366f1' : '#3a3a3f',
                }}
              />
            )}
          </div>
        ))}
      </div>

      {/* Step content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
        {step === 1 && sectionCard(
          <>
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
          </>,
        )}

        {step === 2 && sectionCard(
          <>
            <FieldGroup label="CPU Cores">
              <input
                type="number"
                min={1}
                max={64}
                value={form.cpu}
                onChange={(e) => updateForm({ cpu: Number(e.target.value) })}
                style={inputStyle()}
              />
              <div style={{ fontSize: 11, color: '#6b6b73', marginTop: 4 }}>1 – 64 cores</div>
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
              <div style={{ fontSize: 11, color: '#6b6b73', marginTop: 4 }}>512 – 65536 MB</div>
            </FieldGroup>
          </>,
        )}

        {step === 3 && (
          <div style={{ maxWidth: 640 }}>
            {form.disks.map((disk, i) => (
              <div
                key={i}
                style={{
                  background: '#2a2a2e',
                  border: '1px solid #3a3a3f',
                  borderRadius: 8,
                  padding: 20,
                  marginBottom: 12,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#e4e4e7' }}>Disk {i + 1}</span>
                  <button
                    onClick={() => removeDisk(i)}
                    style={{
                      background: 'transparent',
                      border: '1px solid rgba(239,68,68,0.3)',
                      color: '#ef4444',
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
                background: '#2e2e33',
                border: '1px solid #3a3a3f',
                color: '#a1a1aa',
                borderRadius: 6,
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
          <div style={{ maxWidth: 560 }}>
            {form.nics.map((nic, i) => (
              <div
                key={i}
                style={{
                  background: '#2a2a2e',
                  border: '1px solid #3a3a3f',
                  borderRadius: 8,
                  padding: 20,
                  marginBottom: 12,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#e4e4e7' }}>NIC {i + 1}</span>
                  <button
                    onClick={() => removeNIC(i)}
                    style={{
                      background: 'transparent',
                      border: '1px solid rgba(239,68,68,0.3)',
                      color: '#ef4444',
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
                background: '#2e2e33',
                border: '1px solid #3a3a3f',
                color: '#a1a1aa',
                borderRadius: 6,
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

        {step === 5 && sectionCard(
          <>
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
          </>,
        )}

        {step === 6 && (
          <div
            style={{
              background: '#2a2a2e',
              border: '1px solid #3a3a3f',
              borderRadius: 8,
              padding: 24,
              maxWidth: 560,
            }}
          >
            <div style={{ fontSize: 14, fontWeight: 600, color: '#f0f0f0', marginBottom: 16 }}>
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
                  borderBottom: '1px solid #353539',
                  fontSize: 13,
                }}
              >
                <span style={{ minWidth: 120, color: '#71717a', fontWeight: 500, flexShrink: 0 }}>{label}</span>
                <span style={{ color: '#e4e4e7' }}>{value}</span>
              </div>
            ))}

            {error && (
              <div
                style={{
                  marginTop: 16,
                  padding: '10px 12px',
                  background: 'rgba(239,68,68,0.1)',
                  border: '1px solid rgba(239,68,68,0.3)',
                  borderRadius: 6,
                  color: '#ef4444',
                  fontSize: 13,
                }}
              >
                {error}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer navigation */}
      <div
        style={{
          padding: '14px 24px',
          borderTop: '1px solid #3a3a3f',
          display: 'flex',
          justifyContent: 'space-between',
          flexShrink: 0,
        }}
      >
        <button
          onClick={() => (step === 1 ? navigate('/vms') : setStep((s) => s - 1))}
          style={{
            background: '#2e2e33',
            border: '1px solid #3a3a3f',
            color: '#a1a1aa',
            borderRadius: 6,
            padding: '7px 16px',
            fontSize: 13,
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          {step === 1 ? 'Cancel' : '← Back'}
        </button>

        {step < 6 ? (
          <button
            onClick={() => setStep((s) => s + 1)}
            disabled={!canNext()}
            style={{
              background: '#6366f1',
              color: '#fff',
              border: 'none',
              borderRadius: 6,
              padding: '7px 16px',
              fontSize: 13,
              fontWeight: 500,
              cursor: canNext() ? 'pointer' : 'not-allowed',
              fontFamily: 'inherit',
              opacity: canNext() ? 1 : 0.5,
            }}
          >
            Next →
          </button>
        ) : (
          <button
            onClick={handleSubmit}
            disabled={createVM.isPending}
            style={{
              background: '#6366f1',
              color: '#fff',
              border: 'none',
              borderRadius: 6,
              padding: '7px 16px',
              fontSize: 13,
              fontWeight: 600,
              cursor: createVM.isPending ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit',
              opacity: createVM.isPending ? 0.7 : 1,
            }}
          >
            {createVM.isPending ? 'Creating...' : 'Create VM'}
          </button>
        )}
      </div>
    </div>
  )
}

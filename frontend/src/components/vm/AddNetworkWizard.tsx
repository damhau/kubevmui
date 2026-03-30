import { useState } from 'react'
import { createPortal } from 'react-dom'
import { theme } from '@/lib/theme'
import { toast } from '@/components/ui/Toast'
import { extractErrorMessage } from '@/lib/api-client'
import { useNetworkCRs, type NetworkCR } from '@/hooks/useNetworkCRs'
import { useAddInterface, useAddInterfaceToSpec } from '@/hooks/useHotplug'

interface AddNetworkWizardProps {
  open: boolean
  onClose: () => void
  namespace: string
  vmName: string
  vmStatus: string
  existingNicCount: number
}

interface NicConfig {
  name: string
  networkCR: string
  model: string
  macAddress: string
}

const STEPS = [
  { id: 1, label: 'Network' },
  { id: 2, label: 'Configure' },
  { id: 3, label: 'Review' },
]

const NIC_MODELS = ['virtio', 'e1000e', 'rtl8139']

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

interface RadioCardProps {
  selected: boolean
  disabled?: boolean
  onClick: () => void
  title: string
  description: string
  icon: string
}

function RadioCard({ selected, disabled, onClick, title, description, icon }: RadioCardProps) {
  return (
    <button
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 12,
        padding: '14px 16px',
        borderRadius: theme.radius.lg,
        border: selected
          ? `2px solid ${theme.accent}`
          : `1px solid ${theme.main.cardBorder}`,
        background: selected ? theme.accentLight : theme.main.card,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        textAlign: 'left',
        width: '100%',
        fontFamily: 'inherit',
        transition: 'border-color 0.15s, background 0.15s',
        marginBottom: 8,
      }}
    >
      <span style={{ fontSize: 20, lineHeight: 1, flexShrink: 0 }}>{icon}</span>
      <div>
        <div style={{ fontSize: 14, fontWeight: 600, color: theme.text.heading, marginBottom: 2 }}>
          {title}
        </div>
        <div style={{ fontSize: 12, color: theme.text.secondary }}>{description}</div>
      </div>
    </button>
  )
}

export function AddNetworkWizard({
  open,
  onClose,
  namespace,
  vmName,
  vmStatus,
  existingNicCount,
}: AddNetworkWizardProps) {
  const [step, setStep] = useState(1)
  const [config, setConfig] = useState<NicConfig>({
    name: `net${existingNicCount + 1}`,
    networkCR: '',
    model: 'virtio',
    macAddress: '',
  })

  const isRunning = vmStatus === 'Running'

  const { data: networkCRsData } = useNetworkCRs()
  const networkCRs: NetworkCR[] = networkCRsData?.items || []
  const addInterface = useAddInterface()
  const addInterfaceToSpec = useAddInterfaceToSpec()

  const selectedNetwork = networkCRs.find((n) => n.name === config.networkCR)

  function resetAndClose() {
    setStep(1)
    setConfig({
      name: `net${existingNicCount + 1}`,
      networkCR: '',
      model: 'virtio',
      macAddress: '',
    })
    onClose()
  }

  function canProceedStep1() {
    if (!config.networkCR) return false
    // For running VMs, pod network cannot be hotplugged
    if (isRunning && selectedNetwork?.network_type === 'pod') return false
    return true
  }

  function canProceedStep2() {
    if (!config.name.trim()) return false
    return true
  }

  function handleSubmit() {
    if (isRunning) {
      // Hotplug: backend resolves network_cr to the appropriate NAD
      if (!config.networkCR || !namespace || !vmName) return
      addInterface.mutate(
        {
          namespace,
          vmName,
          name: config.name.trim(),
          networkCR: config.networkCR,
        },
        {
          onSuccess: () => {
            toast.success('Interface hotplugged successfully')
            resetAndClose()
          },
          onError: (err) => {
            toast.error(extractErrorMessage(err, 'Failed to hotplug interface'))
          },
        }
      )
    } else {
      addInterfaceToSpec.mutate(
        {
          namespace,
          vmName,
          iface: {
            name: config.name.trim(),
            network_cr: config.networkCR,
            model: config.model || undefined,
            mac_address: config.macAddress.trim() || undefined,
          },
        },
        {
          onSuccess: () => {
            toast.success('Interface added to VM spec')
            resetAndClose()
          },
          onError: (err) => {
            toast.error(extractErrorMessage(err, 'Failed to add interface'))
          },
        }
      )
    }
  }

  const isPending = addInterface.isPending || addInterfaceToSpec.isPending

  if (!open) return null

  return createPortal(
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 50,
        display: 'flex',
        justifyContent: 'flex-end',
      }}
    >
      {/* Overlay */}
      <div
        onClick={resetAndClose}
        style={{
          position: 'absolute',
          inset: 0,
          background: theme.modal.overlay,
          backdropFilter: 'blur(4px)',
          transition: 'opacity 150ms',
        }}
      />

      {/* Panel */}
      <div
        style={{
          position: 'relative',
          width: 520,
          maxWidth: '100vw',
          height: '100%',
          background: theme.modal.bg,
          borderLeft: `1px solid ${theme.modal.border}`,
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '-4px 0 24px rgba(0,0,0,0.12)',
          animation: 'slideInRight 0.25s ease-out',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 24px',
            borderBottom: `1px solid ${theme.modal.headerBorder}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexShrink: 0,
          }}
        >
          <div>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: theme.text.heading }}>
              Add Network Interface
            </h2>
            <div style={{ fontSize: 12, color: theme.text.secondary, marginTop: 2 }}>
              {vmName} &middot; Step {step} of 3
            </div>
          </div>
          <button
            onClick={resetAndClose}
            style={{
              background: 'transparent',
              border: 'none',
              fontSize: 18,
              color: theme.text.secondary,
              cursor: 'pointer',
              padding: '4px 8px',
              borderRadius: theme.radius.sm,
            }}
          >
            &#10005;
          </button>
        </div>

        {/* Step indicators */}
        <div
          style={{
            display: 'flex',
            padding: '12px 24px',
            gap: 0,
            borderBottom: `1px solid ${theme.main.tableRowBorder}`,
            flexShrink: 0,
          }}
        >
          {STEPS.map((s, i) => (
            <div key={s.id} style={{ display: 'flex', alignItems: 'center', flex: i < STEPS.length - 1 ? 1 : undefined }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 12,
                    fontWeight: 600,
                    background: step > s.id ? '#22c55e' : step === s.id ? theme.accent : theme.main.tableHeaderBg,
                    color: step >= s.id ? '#fff' : theme.text.secondary,
                    border: step === s.id ? `2px solid ${theme.accent}` : '2px solid transparent',
                    flexShrink: 0,
                  }}
                >
                  {step > s.id ? '✓' : s.id}
                </div>
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: step === s.id ? 600 : 400,
                    color: step === s.id ? theme.text.heading : theme.text.secondary,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {s.label}
                </span>
              </div>
              {i < STEPS.length - 1 && (
                <div
                  style={{
                    flex: 1,
                    height: 1,
                    background: step > s.id ? '#22c55e' : theme.main.cardBorder,
                    margin: '0 8px',
                  }}
                />
              )}
            </div>
          ))}
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
          {/* Step 1: Network selection */}
          {step === 1 && (
            <div>
              {isRunning && (
                <div
                  style={{
                    padding: '10px 14px',
                    borderRadius: theme.radius.md,
                    background: '#fffbeb',
                    border: '1px solid #fde68a',
                    color: '#92400e',
                    fontSize: 13,
                    marginBottom: 16,
                  }}
                >
                  <strong>VM is running.</strong> Only bridge interfaces can be hotplugged. Pod network requires a VM restart.
                </div>
              )}

              <div style={{ fontSize: 13, color: theme.text.secondary, marginBottom: 16 }}>
                Select a network:
              </div>

              {networkCRs.length === 0 && (
                <div style={{ fontSize: 13, color: theme.text.secondary, padding: '24px 0', textAlign: 'center' }}>
                  No networks available. Create a Network CR first.
                </div>
              )}

              {networkCRs.map((net) => {
                const isPod = net.network_type === 'pod'
                const disabled = isRunning && isPod
                return (
                  <RadioCard
                    key={net.name}
                    selected={config.networkCR === net.name}
                    disabled={disabled}
                    onClick={() => setConfig({ ...config, networkCR: net.name })}
                    icon={isPod ? '🌐' : '🔗'}
                    title={net.display_name}
                    description={
                      (disabled ? 'Requires VM restart. ' : '') +
                      (net.description || `${net.interface_type} interface`) +
                      (net.bridge_name ? ` (bridge: ${net.bridge_name})` : '') +
                      (net.vlan_id != null ? ` (VLAN ${net.vlan_id})` : '')
                    }
                  />
                )
              })}
            </div>
          )}

          {/* Step 2: Configuration */}
          {step === 2 && (
            <div>
              <FieldGroup label="Interface name">
                <input
                  type="text"
                  value={config.name}
                  onChange={(e) => setConfig({ ...config, name: e.target.value })}
                  style={inputStyle()}
                  placeholder="e.g. eth1"
                />
              </FieldGroup>

              <FieldGroup label="NIC model">
                <select
                  value={config.model}
                  onChange={(e) => setConfig({ ...config, model: e.target.value })}
                  style={inputStyle()}
                >
                  {NIC_MODELS.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </FieldGroup>

              <FieldGroup label="MAC address (optional)">
                <input
                  type="text"
                  value={config.macAddress}
                  onChange={(e) => setConfig({ ...config, macAddress: e.target.value })}
                  style={inputStyle()}
                  placeholder="e.g. 02:00:00:00:00:01"
                />
              </FieldGroup>
            </div>
          )}

          {/* Step 3: Review */}
          {step === 3 && (
            <div>
              <div style={{ fontSize: 13, color: theme.text.secondary, marginBottom: 16 }}>
                Review your interface configuration before adding it.
              </div>

              <div
                style={{
                  background: theme.main.tableHeaderBg,
                  border: `1px solid ${theme.main.cardBorder}`,
                  borderRadius: theme.radius.lg,
                  padding: 16,
                }}
              >
                {[
                  { label: 'Interface name', value: config.name },
                  {
                    label: 'Network',
                    value: selectedNetwork?.display_name || config.networkCR,
                  },
                  {
                    label: 'Interface type',
                    value: selectedNetwork?.interface_type || '-',
                  },
                  { label: 'NIC model', value: config.model || 'virtio' },
                  ...(config.macAddress ? [{ label: 'MAC address', value: config.macAddress }] : []),
                  {
                    label: 'Method',
                    value: isRunning ? 'Hotplug (live attach)' : 'Patch VM spec (requires stopped VM)',
                  },
                ].map(({ label, value }) => (
                  <div
                    key={label}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      padding: '6px 0',
                      borderBottom: `1px solid ${theme.main.tableRowBorder}`,
                      fontSize: 13,
                    }}
                  >
                    <span style={{ color: theme.text.secondary, fontWeight: 500 }}>{label}</span>
                    <span style={{ color: theme.text.primary, fontWeight: 500 }}>{value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '16px 24px',
            borderTop: `1px solid ${theme.modal.footerBorder}`,
            background: theme.modal.footerBg,
            display: 'flex',
            justifyContent: 'space-between',
            flexShrink: 0,
          }}
        >
          <button
            onClick={() => (step > 1 ? setStep(step - 1) : resetAndClose())}
            style={{
              background: theme.button.secondary,
              color: theme.button.secondaryText,
              border: `1px solid ${theme.button.secondaryBorder}`,
              borderRadius: theme.radius.md,
              padding: '8px 16px',
              fontSize: 13,
              cursor: 'pointer',
              fontFamily: 'inherit',
              fontWeight: 500,
            }}
          >
            {step === 1 ? 'Cancel' : 'Back'}
          </button>

          {step < 3 ? (
            <button
              onClick={() => setStep(step + 1)}
              disabled={step === 1 ? !canProceedStep1() : !canProceedStep2()}
              style={{
                background: theme.accent,
                color: theme.button.primaryText,
                border: 'none',
                borderRadius: theme.radius.md,
                padding: '8px 16px',
                fontSize: 13,
                cursor:
                  (step === 1 ? !canProceedStep1() : !canProceedStep2()) ? 'not-allowed' : 'pointer',
                fontFamily: 'inherit',
                fontWeight: 500,
                opacity: (step === 1 ? !canProceedStep1() : !canProceedStep2()) ? 0.6 : 1,
              }}
            >
              Next
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={isPending}
              style={{
                background: theme.accent,
                color: theme.button.primaryText,
                border: 'none',
                borderRadius: theme.radius.md,
                padding: '8px 16px',
                fontSize: 13,
                cursor: isPending ? 'not-allowed' : 'pointer',
                fontFamily: 'inherit',
                fontWeight: 500,
                opacity: isPending ? 0.7 : 1,
              }}
            >
              {isPending ? 'Adding...' : 'Add Interface'}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}

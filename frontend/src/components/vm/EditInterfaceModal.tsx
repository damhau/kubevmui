import { useState, useEffect } from 'react'
import { Modal } from '@/components/ui/Modal'
import { theme } from '@/lib/theme'
import { toast } from '@/components/ui/Toast'
import { extractErrorMessage } from '@/lib/api-client'
import { useEditInterface } from '@/hooks/useHotplug'
import { useNetworkCRs } from '@/hooks/useNetworkCRs'

interface EditInterfaceModalProps {
  open: boolean
  onClose: () => void
  namespace: string
  vmName: string
  iface: { name: string; model: string | null; mac_address: string | null; network_profile: string; network_cr: string } | null
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

function FieldGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{
        display: 'block',
        fontSize: 12,
        textTransform: 'uppercase' as const,
        letterSpacing: '0.05em',
        color: theme.text.secondary,
        marginBottom: 6,
        fontWeight: 500,
      }}>{label}</label>
      {children}
    </div>
  )
}

export function EditInterfaceModal({ open, onClose, namespace, vmName, iface }: EditInterfaceModalProps) {
  const editInterface = useEditInterface()
  const { data: networkCRs } = useNetworkCRs()
  const [networkCR, setNetworkCR] = useState('')
  const [model, setModel] = useState('virtio')
  const [macAddress, setMacAddress] = useState('')

  useEffect(() => {
    if (iface) {
      setNetworkCR(iface.network_cr || '')
      setModel(iface.model || 'virtio')
      setMacAddress(iface.mac_address || '')
    }
  }, [iface])

  if (!iface) return null

  const handleSubmit = () => {
    const updates: { model?: string; mac_address?: string; network_cr?: string } = {}
    if (model !== (iface.model || 'virtio')) updates.model = model
    if (macAddress !== (iface.mac_address || '')) updates.mac_address = macAddress
    if (networkCR !== (iface.network_cr || '') && networkCR) updates.network_cr = networkCR

    if (Object.keys(updates).length === 0) {
      onClose()
      return
    }

    editInterface.mutate(
      { namespace, vmName, ifaceName: iface.name, updates },
      {
        onSuccess: () => {
          toast.success('Interface updated')
          onClose()
        },
        onError: (err) => toast.error(extractErrorMessage(err, 'Failed to update interface')),
      },
    )
  }

  return (
    <Modal open={open} onClose={onClose} title={`Edit Interface — ${iface.name}`}>
      <FieldGroup label="Interface Name">
        <div style={{ ...inputStyle(), background: theme.main.bg, color: theme.text.secondary }}>
          {iface.name}
        </div>
      </FieldGroup>

      <FieldGroup label="Network">
        <select value={networkCR} onChange={(e) => setNetworkCR(e.target.value)} style={inputStyle()}>
          {networkCRs?.items?.map((net) => (
            <option key={net.name} value={net.name}>
              {net.display_name || net.name}
            </option>
          ))}
        </select>
      </FieldGroup>

      <FieldGroup label="NIC Model">
        <select value={model} onChange={(e) => setModel(e.target.value)} style={inputStyle()}>
          <option value="virtio">virtio</option>
          <option value="e1000e">e1000e</option>
          <option value="rtl8139">rtl8139</option>
        </select>
      </FieldGroup>

      <FieldGroup label="MAC Address">
        <input
          type="text"
          value={macAddress}
          onChange={(e) => setMacAddress(e.target.value)}
          placeholder="Auto-assigned if empty"
          style={inputStyle()}
        />
      </FieldGroup>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 24 }}>
        <button
          onClick={onClose}
          style={{
            background: 'transparent',
            color: theme.text.secondary,
            border: `1px solid ${theme.main.inputBorder}`,
            borderRadius: theme.radius.md,
            padding: '8px 16px',
            fontSize: 13,
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          Cancel
        </button>
        <button
          onClick={handleSubmit}
          disabled={editInterface.isPending}
          style={{
            background: theme.accent,
            color: theme.button.primaryText,
            border: 'none',
            borderRadius: theme.radius.md,
            padding: '8px 16px',
            fontSize: 13,
            cursor: editInterface.isPending ? 'not-allowed' : 'pointer',
            fontFamily: 'inherit',
            fontWeight: 500,
          }}
        >
          {editInterface.isPending ? 'Saving...' : 'Save'}
        </button>
      </div>
    </Modal>
  )
}

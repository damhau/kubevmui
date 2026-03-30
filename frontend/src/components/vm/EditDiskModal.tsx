import { useState, useEffect } from 'react'
import { Modal } from '@/components/ui/Modal'
import { theme } from '@/lib/theme'
import { toast } from '@/components/ui/Toast'
import { extractErrorMessage } from '@/lib/api-client'
import { useEditDisk } from '@/hooks/useHotplug'

interface EditDiskModalProps {
  open: boolean
  onClose: () => void
  namespace: string
  vmName: string
  disk: { name: string; bus: string; boot_order: number | null; disk_type: string } | null
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

export function EditDiskModal({ open, onClose, namespace, vmName, disk }: EditDiskModalProps) {
  const editDisk = useEditDisk()
  const [bus, setBus] = useState('virtio')
  const [bootOrder, setBootOrder] = useState('')

  useEffect(() => {
    if (disk) {
      setBus(disk.bus || 'virtio')
      setBootOrder(disk.boot_order ? String(disk.boot_order) : '')
    }
  }, [disk])

  if (!disk) return null

  const handleSubmit = () => {
    const updates: { bus?: string; boot_order?: number | null } = {}
    if (bus !== disk.bus) updates.bus = bus
    const newOrder = bootOrder ? parseInt(bootOrder, 10) : 0
    const oldOrder = disk.boot_order ?? 0
    if (newOrder !== oldOrder) updates.boot_order = newOrder || 0

    if (Object.keys(updates).length === 0) {
      onClose()
      return
    }

    editDisk.mutate(
      { namespace, vmName, diskName: disk.name, updates },
      {
        onSuccess: () => {
          toast.success('Disk updated')
          onClose()
        },
        onError: (err) => toast.error(extractErrorMessage(err, 'Failed to update disk')),
      },
    )
  }

  return (
    <Modal open={open} onClose={onClose} title={`Edit Disk — ${disk.name}`}>
      <FieldGroup label="Disk Name">
        <div style={{ ...inputStyle(), background: theme.main.bg, color: theme.text.secondary }}>
          {disk.name}
        </div>
      </FieldGroup>

      <FieldGroup label="Bus Type">
        <select value={bus} onChange={(e) => setBus(e.target.value)} style={inputStyle()}>
          <option value="virtio">virtio</option>
          <option value="scsi">scsi</option>
          <option value="sata">sata</option>
        </select>
      </FieldGroup>

      <FieldGroup label="Boot Order">
        <input
          type="number"
          min={0}
          value={bootOrder}
          onChange={(e) => setBootOrder(e.target.value)}
          placeholder="None"
          style={inputStyle()}
        />
        <div style={{ fontSize: 11, color: theme.text.secondary, marginTop: 4 }}>
          Leave empty or 0 to clear boot order
        </div>
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
          disabled={editDisk.isPending}
          style={{
            background: theme.accent,
            color: theme.button.primaryText,
            border: 'none',
            borderRadius: theme.radius.md,
            padding: '8px 16px',
            fontSize: 13,
            cursor: editDisk.isPending ? 'not-allowed' : 'pointer',
            fontFamily: 'inherit',
            fontWeight: 500,
          }}
        >
          {editDisk.isPending ? 'Saving...' : 'Save'}
        </button>
      </div>
    </Modal>
  )
}

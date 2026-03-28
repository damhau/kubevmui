import { Modal } from '@/components/ui/Modal'
import { theme } from '@/lib/theme'

interface ConfirmModalProps {
  open: boolean
  title: string
  message: string
  confirmLabel?: string
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmModal({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  danger = false,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  return (
    <Modal open={open} onClose={onCancel} title={title} maxWidth={400}>
      <p style={{ margin: '0 0 20px', fontSize: 14, color: theme.text.primary, lineHeight: 1.5 }}>
        {message}
      </p>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <button
          onClick={onCancel}
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
          onClick={onConfirm}
          style={{
            background: danger ? theme.button.danger : theme.button.primary,
            border: 'none',
            color: danger ? theme.button.dangerText : theme.button.primaryText,
            borderRadius: theme.radius.md,
            padding: '7px 16px',
            fontSize: 13,
            fontWeight: 500,
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          {confirmLabel}
        </button>
      </div>
    </Modal>
  )
}

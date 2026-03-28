import { useState, useEffect } from 'react'
import { Modal } from '@/components/ui/Modal'
import { theme } from '@/lib/theme'

interface PromptModalProps {
  open: boolean
  title: string
  message: string
  defaultValue?: string
  placeholder?: string
  onConfirm: (value: string) => void
  onCancel: () => void
}

export function PromptModal({
  open,
  title,
  message,
  defaultValue = '',
  placeholder = '',
  onConfirm,
  onCancel,
}: PromptModalProps) {
  const [value, setValue] = useState(defaultValue)

  useEffect(() => {
    if (open) setValue(defaultValue)
  }, [open, defaultValue])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (value.trim()) onConfirm(value.trim())
  }

  return (
    <Modal open={open} onClose={onCancel} title={title} maxWidth={400}>
      <form onSubmit={handleSubmit}>
        <p style={{ margin: '0 0 12px', fontSize: 14, color: theme.text.primary, lineHeight: 1.5 }}>
          {message}
        </p>
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={placeholder}
          autoFocus
          style={{
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
            marginBottom: 20,
          }}
        />
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button
            type="button"
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
            type="submit"
            disabled={!value.trim()}
            style={{
              background: theme.button.primary,
              border: 'none',
              color: theme.button.primaryText,
              borderRadius: theme.radius.md,
              padding: '7px 16px',
              fontSize: 13,
              fontWeight: 500,
              cursor: value.trim() ? 'pointer' : 'not-allowed',
              fontFamily: 'inherit',
              opacity: value.trim() ? 1 : 0.6,
            }}
          >
            Confirm
          </button>
        </div>
      </form>
    </Modal>
  )
}

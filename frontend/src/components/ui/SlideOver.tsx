import { createPortal } from 'react-dom'
import { theme } from '@/lib/theme'

interface SlideOverProps {
  open: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
  width?: number
}

export function SlideOver({ open, onClose, title, children, width = 480 }: SlideOverProps) {
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
        onClick={onClose}
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
          width,
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
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: theme.text.heading }}>
            {title}
          </h2>
          <button
            onClick={onClose}
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
            ✕
          </button>
        </div>
        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {children}
        </div>
      </div>
    </div>,
    document.body,
  )
}

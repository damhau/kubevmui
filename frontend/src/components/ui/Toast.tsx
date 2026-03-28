import { create } from 'zustand'
import { createPortal } from 'react-dom'
import { theme } from '@/lib/theme'

interface Toast {
  id: string
  message: string
  type: 'success' | 'error' | 'info'
  duration?: number
}

interface ToastStore {
  toasts: Toast[]
  addToast: (toast: Omit<Toast, 'id'>) => void
  removeToast: (id: string) => void
}

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  addToast: (toast) => {
    const id = Math.random().toString(36).slice(2)
    set((s) => ({ toasts: [...s.toasts, { ...toast, id }] }))
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
    }, toast.duration ?? 4000)
  },
  removeToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}))

export const toast = {
  success: (message: string) => useToastStore.getState().addToast({ message, type: 'success' }),
  error: (message: string) => useToastStore.getState().addToast({ message, type: 'error' }),
  info: (message: string) => useToastStore.getState().addToast({ message, type: 'info' }),
}

const borderColors: Record<Toast['type'], string> = {
  success: '#22c55e',
  error: '#ef4444',
  info: '#3b82f6',
}

const iconMap: Record<Toast['type'], string> = {
  success: '\u2713',
  error: '\u2717',
  info: 'i',
}

const iconBgColors: Record<Toast['type'], string> = {
  success: '#ecfdf5',
  error: '#fef2f2',
  info: '#eff6ff',
}

const iconTextColors: Record<Toast['type'], string> = {
  success: '#16a34a',
  error: '#dc2626',
  info: '#2563eb',
}

export function ToastContainer() {
  const { toasts, removeToast } = useToastStore()

  if (toasts.length === 0) return null

  return createPortal(
    <div
      style={{
        position: 'fixed',
        bottom: 24,
        right: 24,
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        pointerEvents: 'none',
      }}
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          style={{
            pointerEvents: 'auto',
            background: theme.main.card,
            borderLeft: `4px solid ${borderColors[t.type]}`,
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            borderRadius: theme.radius.md,
            padding: '12px 16px',
            maxWidth: 360,
            minWidth: 240,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            animation: 'toastSlideIn 0.2s ease-out',
          }}
        >
          <span
            style={{
              width: 22,
              height: 22,
              borderRadius: '50%',
              background: iconBgColors[t.type],
              color: iconTextColors[t.type],
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 11,
              fontWeight: 700,
              flexShrink: 0,
            }}
          >
            {iconMap[t.type]}
          </span>
          <span
            style={{
              flex: 1,
              fontSize: 13,
              color: theme.text.primary,
              lineHeight: 1.4,
            }}
          >
            {t.message}
          </span>
          <button
            onClick={() => removeToast(t.id)}
            style={{
              background: 'transparent',
              border: 'none',
              color: theme.text.dim,
              cursor: 'pointer',
              fontSize: 14,
              padding: '2px 4px',
              lineHeight: 1,
              flexShrink: 0,
              borderRadius: theme.radius.sm,
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = theme.text.primary)}
            onMouseLeave={(e) => (e.currentTarget.style.color = theme.text.dim)}
          >
            &#10005;
          </button>
        </div>
      ))}
      <style>{`
        @keyframes toastSlideIn {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
      `}</style>
    </div>,
    document.body,
  )
}

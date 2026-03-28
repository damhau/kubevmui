import { theme } from '@/lib/theme'

interface EmptyStateProps {
  icon: React.ReactNode
  title: string
  description: string
  action?: { label: string; onClick: () => void }
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div style={{
      padding: '60px 24px',
      textAlign: 'center',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 12,
      animation: 'fadeInUp 0.35s ease-out',
    }}>
      <div style={{
        width: 48,
        height: 48,
        borderRadius: 12,
        background: theme.accentLight,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: theme.accent,
        marginBottom: 4,
      }}>
        {icon}
      </div>
      <div style={{ fontSize: 15, fontWeight: 600, color: theme.text.heading, fontFamily: theme.typography.heading.fontFamily }}>{title}</div>
      <div style={{ fontSize: 13, color: theme.text.secondary, maxWidth: 320, lineHeight: 1.5 }}>{description}</div>
      {action && (
        <button
          onClick={action.onClick}
          style={{
            marginTop: 8,
            padding: '8px 16px',
            background: theme.accent,
            color: '#fff',
            border: 'none',
            borderRadius: theme.radius.md,
            fontSize: 13,
            fontWeight: 500,
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          {action.label}
        </button>
      )}
    </div>
  )
}

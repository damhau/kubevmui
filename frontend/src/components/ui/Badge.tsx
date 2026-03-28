import { theme } from '@/lib/theme'

interface BadgeProps {
  label: string
  variant?: 'success' | 'error' | 'warning' | 'info' | 'neutral' | 'accent'
  size?: 'sm' | 'md'
}

const variantStyles = {
  success: { bg: theme.status.runningBg, color: theme.status.running, border: `1px solid ${theme.status.running}40` },
  error: { bg: theme.status.errorBg, color: theme.status.error, border: `1px solid ${theme.status.error}40` },
  warning: { bg: theme.status.migratingBg, color: theme.status.migrating, border: `1px solid ${theme.status.migrating}40` },
  info: { bg: theme.status.provisioningBg, color: theme.status.provisioning, border: `1px solid ${theme.status.provisioning}40` },
  neutral: { bg: theme.status.stoppedBg, color: theme.status.stopped, border: `1px solid ${theme.status.stopped}40` },
  accent: { bg: theme.accentLight, color: theme.accent, border: `1px solid ${theme.accent}40` },
}

export function Badge({ label, variant = 'neutral', size = 'sm' }: BadgeProps) {
  const style = variantStyles[variant]
  return (
    <span style={{
      display: 'inline-block',
      padding: size === 'sm' ? '2px 8px' : '3px 10px',
      borderRadius: 20,
      fontSize: size === 'sm' ? 11 : 12,
      fontWeight: 500,
      color: style.color,
      background: style.bg,
      border: style.border,
      lineHeight: 1.4,
    }}>
      {label}
    </span>
  )
}

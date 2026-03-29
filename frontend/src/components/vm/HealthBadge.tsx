const healthConfig: Record<string, { color: string; bg: string; border: string; label: string }> = {
  healthy:  { color: '#16a34a', bg: '#ecfdf5', border: '#bbf7d0', label: 'Healthy' },
  degraded: { color: '#d97706', bg: '#fffbeb', border: '#fde68a', label: 'Degraded' },
  critical: { color: '#dc2626', bg: '#fef2f2', border: '#fecaca', label: 'Critical' },
  unknown:  { color: '#71717a', bg: '#f4f4f5', border: '#d4d4d8', label: 'Unknown' },
}

export function HealthBadge({ health, size = 'badge' }: { health: string; size?: 'badge' | 'dot' }) {
  const cfg = healthConfig[health] ?? healthConfig.unknown

  if (size === 'dot') {
    return (
      <span
        title={cfg.label}
        style={{
          display: 'inline-block',
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: cfg.color,
          flexShrink: 0,
        }}
      />
    )
  }

  const isHealthy = health === 'healthy'
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '3px 10px',
        borderRadius: 12,
        fontSize: 12,
        fontWeight: 500,
        background: cfg.bg,
        color: cfg.color,
        border: `1px solid ${cfg.border}`,
        whiteSpace: 'nowrap',
        opacity: isHealthy ? 0.7 : 1,
      }}
    >
      {cfg.label}
    </span>
  )
}

import { theme } from '@/lib/theme'

interface SkeletonProps {
  width?: string | number
  height?: string | number
  borderRadius?: string | number
  style?: React.CSSProperties
}

export function Skeleton({ width = '100%', height = 16, borderRadius = 4, style }: SkeletonProps) {
  return (
    <div
      style={{
        width,
        height,
        borderRadius,
        background: `linear-gradient(90deg, ${theme.main.inputBg} 20%, ${theme.main.hoverBg} 40%, ${theme.main.inputBg} 60%)`,
        backgroundSize: '200% 100%',
        animation: 'shimmer 1.5s infinite',
        ...style,
      }}
    />
  )
}

// Table skeleton: multiple rows of skeletons
export function TableSkeleton({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div style={{ padding: '8px 0' }}>
      {Array.from({ length: rows }).map((_, r) => (
        <div
          key={r}
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${cols}, 1fr)`,
            gap: 16,
            padding: '12px 16px',
            borderBottom: `1px solid ${theme.main.tableRowBorder}`,
          }}
        >
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton key={c} height={14} width={c === 0 ? '70%' : '50%'} />
          ))}
        </div>
      ))}
    </div>
  )
}

// Card skeleton
export function CardSkeleton({ height = 80 }: { height?: number }) {
  return (
    <div
      style={{
        background: theme.main.card,
        border: `1px solid ${theme.main.cardBorder}`, boxShadow: theme.shadow.card,
        borderRadius: theme.radius.lg,
        padding: 16,
        height,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      <Skeleton height={10} width="40%" />
      <Skeleton height={24} width="30%" />
    </div>
  )
}

import { theme } from '@/lib/theme'

interface TimeRangeSelectorProps {
  ranges?: string[]
  value: string
  onChange: (range: string) => void
}

export function TimeRangeSelector({ ranges = ['1h', '6h', '24h', '7d', '30d'], value, onChange }: TimeRangeSelectorProps) {
  return (
    <div style={{ display: 'flex', gap: 8 }}>
      {ranges.map((r) => (
        <button
          key={r}
          onClick={() => onChange(r)}
          style={{
            padding: '5px 12px',
            fontSize: 12,
            fontFamily: 'inherit',
            borderRadius: theme.radius.md,
            cursor: 'pointer',
            background: value === r ? theme.accent : theme.main.card,
            color: value === r ? '#fff' : theme.text.primary,
            border: value === r ? `1px solid ${theme.accent}` : `1px solid ${theme.main.inputBorder}`,
            fontWeight: value === r ? 600 : 400,
          }}
        >
          {r}
        </button>
      ))}
    </div>
  )
}

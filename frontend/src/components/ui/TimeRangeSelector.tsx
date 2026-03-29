import { useState } from 'react'
import { theme } from '@/lib/theme'

interface TimeRangeSelectorProps {
  ranges?: string[]
  value: string
  onChange: (range: string) => void
  allowCustom?: boolean
  onCustomRange?: (start: string, end: string) => void
}

export function TimeRangeSelector({ ranges = ['1h', '6h', '24h', '7d', '30d'], value, onChange, allowCustom, onCustomRange }: TimeRangeSelectorProps) {
  const [showCustom, setShowCustom] = useState(false)
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')

  const btnStyle = (active: boolean): React.CSSProperties => ({
    padding: '5px 12px',
    fontSize: 12,
    fontFamily: 'inherit',
    borderRadius: theme.radius.md,
    cursor: 'pointer',
    background: active ? theme.accent : theme.main.card,
    color: active ? '#fff' : theme.text.primary,
    border: active ? `1px solid ${theme.accent}` : `1px solid ${theme.main.inputBorder}`,
    fontWeight: active ? 600 : 400,
  })

  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      {ranges.map((r) => (
        <button
          key={r}
          onClick={() => { onChange(r); setShowCustom(false) }}
          style={btnStyle(value === r && !showCustom)}
        >
          {r}
        </button>
      ))}
      {allowCustom && (
        <>
          <button
            onClick={() => setShowCustom(!showCustom)}
            style={btnStyle(showCustom)}
          >
            Custom
          </button>
          {showCustom && (
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input
                type="datetime-local"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                style={{
                  background: theme.main.inputBg,
                  border: `1px solid ${theme.main.inputBorder}`,
                  borderRadius: theme.radius.md,
                  color: theme.text.primary,
                  fontSize: 12,
                  padding: '4px 8px',
                  fontFamily: 'inherit',
                }}
              />
              <span style={{ fontSize: 12, color: theme.text.dim }}>to</span>
              <input
                type="datetime-local"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                style={{
                  background: theme.main.inputBg,
                  border: `1px solid ${theme.main.inputBorder}`,
                  borderRadius: theme.radius.md,
                  color: theme.text.primary,
                  fontSize: 12,
                  padding: '4px 8px',
                  fontFamily: 'inherit',
                }}
              />
              <button
                onClick={() => {
                  if (customStart && customEnd && onCustomRange) {
                    onCustomRange(new Date(customStart).toISOString(), new Date(customEnd).toISOString())
                  }
                }}
                disabled={!customStart || !customEnd}
                style={{
                  ...btnStyle(false),
                  opacity: !customStart || !customEnd ? 0.5 : 1,
                  cursor: !customStart || !customEnd ? 'not-allowed' : 'pointer',
                }}
              >
                Apply
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

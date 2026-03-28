import { Search } from 'lucide-react'

interface TopBarProps {
  title: string
  subtitle?: string
  action?: React.ReactNode
}

export function TopBar({ title, subtitle, action }: TopBarProps) {
  return (
    <header
      style={{
        height: 56,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 24px',
        borderBottom: '1px solid #2e2e33',
        flexShrink: 0,
        gap: 16,
      }}
    >
      {/* Title group */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, minWidth: 0 }}>
        <h1
          style={{
            margin: 0,
            fontSize: 18,
            fontWeight: 600,
            color: '#f0f0f0',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {title}
        </h1>
        {subtitle && (
          <span style={{ fontSize: 12, color: '#71717a', whiteSpace: 'nowrap' }}>
            {subtitle}
          </span>
        )}
      </div>

      {/* Right side */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        {/* Search */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            background: '#2e2e33',
            border: '1px solid #3a3a3f',
            borderRadius: 6,
            padding: '6px 12px',
            cursor: 'text',
          }}
        >
          <Search size={14} style={{ color: '#6b6b73', flexShrink: 0 }} />
          <span style={{ fontSize: 13, color: '#6b6b73', userSelect: 'none', whiteSpace: 'nowrap' }}>
            Search VMs...{' '}
            <kbd
              style={{
                fontSize: 11,
                color: '#3f3f46',
                background: '#3a3a3f',
                border: '1px solid #3f3f46',
                borderRadius: 3,
                padding: '0 4px',
                fontFamily: 'inherit',
              }}
            >
              ⌘K
            </kbd>
          </span>
        </div>

        {/* Action button or default */}
        {action ?? (
          <button
            style={{
              background: '#6366f1',
              color: '#fff',
              border: 'none',
              borderRadius: 6,
              padding: '7px 14px',
              fontSize: 13,
              fontWeight: 500,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              fontFamily: 'inherit',
            }}
          >
            + New VM
          </button>
        )}
      </div>
    </header>
  )
}

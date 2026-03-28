import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search } from 'lucide-react'
import { theme } from '@/lib/theme'

interface TopBarProps {
  title: string
  subtitle?: string
  action?: React.ReactNode
  searchPlaceholder?: string
}

export function TopBar({ title, subtitle, action, searchPlaceholder = 'Search...' }: TopBarProps) {
  const navigate = useNavigate()
  const searchRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        navigate('/vms')
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [navigate])

  return (
    <header
      style={{
        height: 56,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 24px',
        background: theme.topBar.bg,
        borderBottom: `1px solid ${theme.topBar.border}`,
        borderTop: `2px solid ${theme.accent}`,
        flexShrink: 0,
        gap: 16,
      }}
    >
      {/* Title group */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, minWidth: 0 }}>
        <h1
          style={{
            margin: 0,
            fontSize: 20,
            fontWeight: 700,
            color: theme.text.heading,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {title}
        </h1>
        {subtitle && (
          <span style={{ fontSize: 13, color: theme.text.secondary, whiteSpace: 'nowrap' }}>
            {subtitle}
          </span>
        )}
      </div>

      {/* Right side */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        {/* Search */}
        <div
          ref={searchRef}
          onClick={() => navigate('/vms')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            background: theme.topBar.searchBg,
            border: `1px solid ${theme.topBar.searchBorder}`,
            borderRadius: theme.radius.md,
            padding: '6px 12px',
            cursor: 'pointer',
          }}
        >
          <Search size={14} style={{ color: theme.text.dim, flexShrink: 0 }} />
          <span style={{ fontSize: 13, color: theme.text.dim, userSelect: 'none', whiteSpace: 'nowrap' }}>
            {searchPlaceholder}{' '}
            <kbd
              style={{
                fontSize: 11,
                color: theme.text.dim,
                background: theme.main.card,
                border: `1px solid ${theme.topBar.searchBorder}`,
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
              background: theme.button.primary,
              color: theme.button.primaryText,
              border: 'none',
              borderRadius: theme.radius.md,
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

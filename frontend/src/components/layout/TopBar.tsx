import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, ChevronDown, Check } from 'lucide-react'
import { createPortal } from 'react-dom'
import { theme } from '@/lib/theme'
import { useUIStore } from '@/stores/ui-store'
import { useNamespaces } from '@/hooks/useNamespaces'

interface TopBarProps {
  title: string
  subtitle?: string
  action?: React.ReactNode
  searchPlaceholder?: string
}

export function TopBar({ title, subtitle, action, searchPlaceholder = 'Search...' }: TopBarProps) {
  const navigate = useNavigate()
  const searchRef = useRef<HTMLDivElement>(null)
  const { activeNamespace, setActiveNamespace } = useUIStore()
  const { data: namespacesData } = useNamespaces()
  const [nsOpen, setNsOpen] = useState(false)
  const nsBtnRef = useRef<HTMLButtonElement>(null)
  const nsMenuRef = useRef<HTMLDivElement>(null)
  const [nsPos, setNsPos] = useState({ top: 0, left: 0, width: 0 })

  const rawNamespaces = Array.isArray(namespacesData?.items)
    ? namespacesData.items
    : Array.isArray(namespacesData)
      ? namespacesData
      : []
  const namespaces: string[] = rawNamespaces.length > 0
    ? rawNamespaces.map((n: { name?: string } | string) =>
        typeof n === 'string' ? n : n.name ?? String(n)
      )
    : ['default']

  const updateNsPos = useCallback(() => {
    if (!nsBtnRef.current) return
    const r = nsBtnRef.current.getBoundingClientRect()
    setNsPos({ top: r.bottom + 4, left: r.left, width: r.width })
  }, [])

  useEffect(() => {
    if (!nsOpen) return
    updateNsPos()
    const handleClick = (e: MouseEvent) => {
      if (
        nsMenuRef.current && !nsMenuRef.current.contains(e.target as Node) &&
        nsBtnRef.current && !nsBtnRef.current.contains(e.target as Node)
      ) setNsOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [nsOpen, updateNsPos])

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
        flexShrink: 0,
        gap: 16,
      }}
    >
      {/* Title group */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, minWidth: 0 }}>
        <h1
          style={{
            margin: 0,
            fontSize: 20,
            fontWeight: 700,
            fontFamily: theme.typography.heading.fontFamily,
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

        {/* Namespace selector */}
        <button
          ref={nsBtnRef}
          onClick={() => setNsOpen((v) => !v)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '5px 10px',
            background: theme.topBar.searchBg,
            border: `1px solid ${theme.topBar.searchBorder}`,
            borderRadius: theme.radius.md,
            color: theme.text.primary,
            fontSize: 13,
            cursor: 'pointer',
            fontFamily: theme.typography.mono.fontFamily,
            whiteSpace: 'nowrap',
          }}
        >
          <span style={{ fontSize: 11, color: theme.text.secondary, fontFamily: theme.typography.heading.fontFamily }}>NS:</span>
          {activeNamespace}
          <ChevronDown
            size={14}
            style={{
              color: theme.text.dim,
              flexShrink: 0,
              transition: 'transform 0.15s',
              transform: nsOpen ? 'rotate(180deg)' : 'none',
            }}
          />
        </button>
        {nsOpen && createPortal(
          <div
            ref={nsMenuRef}
            style={{
              position: 'fixed',
              top: nsPos.top,
              left: nsPos.left,
              minWidth: Math.max(nsPos.width, 180),
              background: theme.main.card,
              border: `1px solid ${theme.main.cardBorder}`,
              borderRadius: theme.radius.md,
              overflow: 'hidden',
              zIndex: 9999,
              maxHeight: 300,
              overflowY: 'auto',
              boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
            }}
          >
            {namespaces.map((ns) => (
              <button
                key={ns}
                onClick={() => { setActiveNamespace(ns); setNsOpen(false) }}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '7px 12px',
                  background: ns === activeNamespace ? theme.accentLight : 'transparent',
                  border: 'none',
                  color: ns === activeNamespace ? theme.accent : theme.text.primary,
                  fontSize: 13,
                  cursor: 'pointer',
                  textAlign: 'left',
                  fontFamily: theme.typography.mono.fontFamily,
                }}
                onMouseEnter={(e) => { if (ns !== activeNamespace) e.currentTarget.style.background = theme.main.hoverBg }}
                onMouseLeave={(e) => { if (ns !== activeNamespace) e.currentTarget.style.background = 'transparent' }}
              >
                {ns}
                {ns === activeNamespace && <Check size={13} style={{ color: theme.accent }} />}
              </button>
            ))}
          </div>,
          document.body
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

        {/* Action button */}
        {action}
      </div>
    </header>
  )
}

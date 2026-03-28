import { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { theme } from '@/lib/theme'

export interface DropdownAction {
  label: string
  action: string
  danger?: boolean
}

interface DropdownMenuProps {
  actions: DropdownAction[]
  onAction: (action: string) => void
}

export function DropdownMenu({ actions, onAction }: DropdownMenuProps) {
  const [open, setOpen] = useState(false)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ top: 0, left: 0 })

  const updatePosition = useCallback(() => {
    if (!buttonRef.current) return
    const rect = buttonRef.current.getBoundingClientRect()
    setPos({
      top: rect.bottom + 4,
      left: rect.right,
    })
  }, [])

  useEffect(() => {
    if (!open) return
    updatePosition()
    const handleClickOutside = (e: MouseEvent) => {
      if (
        menuRef.current && !menuRef.current.contains(e.target as Node) &&
        buttonRef.current && !buttonRef.current.contains(e.target as Node)
      ) {
        setOpen(false)
      }
    }
    const handleScroll = () => setOpen(false)
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('scroll', handleScroll, true)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('scroll', handleScroll, true)
    }
  }, [open, updatePosition])

  return (
    <div style={{ display: 'inline-block' }} onClick={(e) => e.stopPropagation()}>
      <button
        ref={buttonRef}
        onClick={() => setOpen((v) => !v)}
        style={{
          background: theme.main.card,
          border: `1px solid ${theme.main.inputBorder}`,
          borderRadius: 5,
          color: theme.text.secondary,
          cursor: 'pointer',
          padding: '3px 8px',
          fontSize: 16,
          lineHeight: 1,
          fontFamily: 'inherit',
        }}
      >
        ⋯
      </button>
      {open && createPortal(
        <div
          ref={menuRef}
          style={{
            position: 'fixed',
            top: pos.top,
            left: pos.left,
            transform: 'translateX(-100%)',
            background: theme.main.card,
            border: `1px solid ${theme.main.cardBorder}`,
            borderRadius: 7,
            minWidth: 140,
            zIndex: 9999,
            boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
          }}
        >
          {actions.map((a) => (
            <button
              key={a.action}
              onClick={() => {
                setOpen(false)
                onAction(a.action)
              }}
              style={{
                width: '100%',
                display: 'block',
                padding: '8px 14px',
                background: 'transparent',
                border: 'none',
                textAlign: 'left',
                fontSize: 13,
                color: a.danger ? theme.status.error : theme.text.primary,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = theme.main.hoverBg)}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              {a.label}
            </button>
          ))}
        </div>,
        document.body
      )}
    </div>
  )
}

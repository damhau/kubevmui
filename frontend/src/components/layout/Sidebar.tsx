import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard,
  Monitor,
  Copy,
  Network,
  HardDrive,
  ChevronDown,
  Check,
} from 'lucide-react'
import { useUIStore } from '@/stores/ui-store'
import { useNamespaces } from '@/hooks/useNamespaces'

const VERSION = 'v0.1.0'

interface NavItem {
  label: string
  to: string
  icon: React.ReactNode
}

interface NavGroup {
  section: string
  items: NavItem[]
}

const navGroups: NavGroup[] = [
  {
    section: 'Main',
    items: [
      { label: 'Dashboard', to: '/dashboard', icon: <LayoutDashboard size={16} /> },
      { label: 'Virtual Machines', to: '/vms', icon: <Monitor size={16} /> },
      { label: 'Templates', to: '/templates', icon: <Copy size={16} /> },
    ],
  },
  {
    section: 'Infrastructure',
    items: [
      { label: 'Networks', to: '/networks', icon: <Network size={16} /> },
      { label: 'Storage', to: '/storage', icon: <HardDrive size={16} /> },
    ],
  },
]

export function Sidebar() {
  const { activeNamespace, setActiveNamespace } = useUIStore()
  const { data: namespacesData } = useNamespaces()
  const [nsOpen, setNsOpen] = useState(false)

  const namespaces: string[] =
    Array.isArray(namespacesData)
      ? namespacesData.map((n: { name?: string } | string) =>
          typeof n === 'string' ? n : n.name ?? String(n)
        )
      : ['default']

  return (
    <aside
      style={{
        width: 240,
        minWidth: 240,
        background: '#2a2a2e',
        borderRight: '1px solid #3a3a3f',
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        overflow: 'hidden',
      }}
    >
      {/* Logo */}
      <div style={{ padding: '20px 16px 16px', borderBottom: '1px solid #3a3a3f' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* Icon */}
          <div
            style={{
              width: 30,
              height: 30,
              borderRadius: 8,
              background: 'linear-gradient(135deg, #6366f1, #818cf8)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <rect x="2" y="3" width="5" height="4" rx="1" fill="white" fillOpacity="0.9" />
              <rect x="9" y="3" width="5" height="4" rx="1" fill="white" fillOpacity="0.6" />
              <rect x="2" y="9" width="5" height="4" rx="1" fill="white" fillOpacity="0.6" />
              <rect x="9" y="9" width="5" height="4" rx="1" fill="white" fillOpacity="0.9" />
            </svg>
          </div>
          <span style={{ color: '#f0f0f0', fontWeight: 600, fontSize: 15, letterSpacing: '-0.01em' }}>
            kubevmui
          </span>
          <span
            style={{
              marginLeft: 'auto',
              fontSize: 10,
              color: '#6366f1',
              background: 'rgba(99,102,241,0.12)',
              border: '1px solid rgba(99,102,241,0.25)',
              borderRadius: 4,
              padding: '1px 5px',
              fontWeight: 500,
              letterSpacing: '0.02em',
            }}
          >
            {VERSION}
          </span>
        </div>
      </div>

      {/* Namespace selector */}
      <div style={{ padding: '12px 12px 0' }}>
        <div
          style={{ marginBottom: 4, fontSize: 10, color: '#6b6b73', textTransform: 'uppercase', letterSpacing: '0.08em', paddingLeft: 4 }}
        >
          Namespace
        </div>
        <button
          onClick={() => setNsOpen((v) => !v)}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '7px 10px',
            background: '#2e2e33',
            border: '1px solid #3a3a3f',
            borderRadius: 6,
            color: '#e4e4e7',
            fontSize: 13,
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {activeNamespace}
          </span>
          <ChevronDown
            size={14}
            style={{
              color: '#71717a',
              flexShrink: 0,
              transition: 'transform 0.15s',
              transform: nsOpen ? 'rotate(180deg)' : 'none',
            }}
          />
        </button>

        {nsOpen && (
          <div
            style={{
              marginTop: 4,
              background: '#2e2e33',
              border: '1px solid #3a3a3f',
              borderRadius: 6,
              overflow: 'hidden',
            }}
          >
            {namespaces.map((ns) => (
              <button
                key={ns}
                onClick={() => {
                  setActiveNamespace(ns)
                  setNsOpen(false)
                }}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '7px 10px',
                  background: ns === activeNamespace ? 'rgba(99,102,241,0.1)' : 'transparent',
                  border: 'none',
                  color: ns === activeNamespace ? '#818cf8' : '#a1a1aa',
                  fontSize: 13,
                  cursor: 'pointer',
                  textAlign: 'left',
                  fontFamily: 'inherit',
                }}
              >
                {ns}
                {ns === activeNamespace && <Check size={13} style={{ color: '#6366f1' }} />}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav style={{ flex: 1, overflowY: 'auto', padding: '12px 0' }}>
        {navGroups.map((group) => (
          <div key={group.section} style={{ marginBottom: 8 }}>
            <div
              style={{
                padding: '6px 16px 4px',
                fontSize: 10,
                color: '#6b6b73',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                fontWeight: 600,
              }}
            >
              {group.section}
            </div>
            {group.items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                style={({ isActive }) => ({
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '7px 16px',
                  marginBottom: 1,
                  textDecoration: 'none',
                  fontSize: 13,
                  fontWeight: isActive ? 500 : 400,
                  color: isActive ? '#e4e4e7' : '#a1a1aa',
                  background: isActive
                    ? 'linear-gradient(90deg, rgba(99,102,241,0.12) 0%, rgba(99,102,241,0.04) 100%)'
                    : 'transparent',
                  borderLeft: isActive ? '2px solid #6366f1' : '2px solid transparent',
                  transition: 'background 0.12s, color 0.12s',
                })}
              >
                <span style={{ flexShrink: 0 }}>{item.icon}</span>
                {item.label}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>

      {/* User profile */}
      <div
        style={{
          padding: '12px 16px',
          borderTop: '1px solid #3a3a3f',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}
      >
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #6366f1, #818cf8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            fontSize: 13,
            fontWeight: 600,
            flexShrink: 0,
          }}
        >
          AD
        </div>
        <div style={{ overflow: 'hidden' }}>
          <div
            style={{
              fontSize: 13,
              color: '#e4e4e7',
              fontWeight: 500,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            Admin
          </div>
          <div
            style={{
              fontSize: 11,
              color: '#71717a',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            Cluster Admin
          </div>
        </div>
      </div>
    </aside>
  )
}

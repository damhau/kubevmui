import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard,
  Monitor,
  Copy,
  Network,
  HardDrive,
  Disc,
  KeyRound,
  Server,
  Activity,
  BarChart3,
  TrendingUp,
  FileText,
  Package,
  Settings,
} from 'lucide-react'
import { theme } from '@/lib/theme'

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
      { label: 'Catalog', to: '/catalog', icon: <Package size={16} /> },
      { label: 'Templates', to: '/templates', icon: <Copy size={16} /> },
      { label: 'Events', to: '/events', icon: <Activity size={16} /> },
    ],
  },
  {
    section: 'Monitoring',
    items: [
      { label: 'Cluster Metrics', to: '/monitoring/cluster', icon: <BarChart3 size={16} /> },
      { label: 'Analytics', to: '/monitoring/analytics', icon: <TrendingUp size={16} /> },
      { label: 'Audit Log', to: '/monitoring/audit', icon: <FileText size={16} /> },
    ],
  },
  {
    section: 'Infrastructure',
    items: [
      { label: 'Images', to: '/images', icon: <Disc size={16} /> },
      { label: 'Networks', to: '/networks', icon: <Network size={16} /> },
      { label: 'Storage', to: '/storage', icon: <HardDrive size={16} /> },
      { label: 'Nodes', to: '/nodes', icon: <Server size={16} /> },
      { label: 'KubeVirt', to: '/kubevirt-info', icon: <Settings size={16} /> },
      { label: 'SSH Keys', to: '/ssh-keys', icon: <KeyRound size={16} /> },
    ],
  },
]

export function Sidebar() {
  return (
    <aside
      style={{
        width: 240,
        minWidth: 240,
        background: theme.sidebar.bg,
        borderRight: `1px solid ${theme.sidebar.border}`,
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        overflow: 'hidden',
      }}
    >
      {/* Logo */}
      <div style={{ padding: '20px 16px 16px', borderBottom: `1px solid ${theme.sidebar.border}` }}>
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
          <span style={{ color: theme.sidebar.text, fontWeight: 700, fontSize: 15, letterSpacing: '-0.02em', fontFamily: theme.typography.heading.fontFamily }}>
            kubevmui
          </span>
          <span
            style={{
              marginLeft: 'auto',
              fontSize: 10,
              color: theme.accent,
              background: theme.accentLight,
              border: `1px solid rgba(99,102,241,0.25)`,
              borderRadius: theme.radius.sm,
              padding: '1px 5px',
              fontWeight: 500,
              letterSpacing: '0.02em',
            }}
          >
            {VERSION}
          </span>
          <span
            title="Cluster connected"
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: theme.status.running,
              flexShrink: 0,
              display: 'inline-block',
            }}
          />
        </div>
      </div>

      {/* Navigation */}
      <nav style={{ flex: 1, overflowY: 'auto', padding: '12px 0' }}>
        {navGroups.map((group, groupIndex) => (
          <div key={group.section} style={{ marginBottom: 8, ...(groupIndex > 0 ? { marginTop: 20, borderTop: `1px solid ${theme.sidebar.border}`, paddingTop: 12 } : {}) }}>
            <div
              style={{
                padding: '6px 16px 4px',
                fontSize: 10,
                color: theme.sidebar.sectionLabel,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                fontWeight: 700,
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
                  padding: '7px 12px',
                  margin: '1px 8px',
                  textDecoration: 'none',
                  fontSize: 13,
                  borderRadius: theme.radius.md,
                  fontWeight: isActive ? 500 : 400,
                  color: isActive ? theme.sidebar.text : theme.sidebar.textMuted,
                  background: isActive ? theme.sidebar.bgHover : 'transparent',
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
          borderTop: `1px solid ${theme.sidebar.border}`,
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
              color: theme.sidebar.text,
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
              color: theme.sidebar.textDim,
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

import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { theme } from '@/lib/theme'
import { useUIStore } from '@/stores/ui-store'
import { VNCConsole } from '@/components/console/VNCConsole'
import { SerialConsole } from '@/components/console/SerialConsole'

type ConsoleTab = 'vnc' | 'serial'

export function ConsolePage() {
  const { namespace, name } = useParams<{ namespace: string; name: string }>()
  const { activeCluster } = useUIStore()
  const [activeTab, setActiveTab] = useState<ConsoleTab>('vnc')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <div
        style={{
          padding: '14px 24px',
          background: theme.console.headerBg,
          borderBottom: `1px solid ${theme.console.headerBorder}`,
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          flexShrink: 0,
        }}
      >
        <Link
          to={`/vms/${namespace}/${name}`}
          style={{ color: theme.text.secondary, textDecoration: 'none', fontSize: 13, flexShrink: 0 }}
        >
          ← {name}
        </Link>
        <h1 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: theme.text.heading }}>
          Console — {name}
        </h1>
        <span
          style={{
            marginLeft: 'auto',
            fontSize: 11,
            color: theme.text.secondary,
            background: theme.main.bg,
            border: `1px solid ${theme.main.inputBorder}`,
            borderRadius: theme.radius.sm,
            padding: '3px 8px',
          }}
        >
          {namespace}
        </span>
      </div>

      {/* Tab bar */}
      <div
        style={{
          display: 'flex',
          background: theme.console.headerBg,
          borderBottom: `1px solid ${theme.console.headerBorder}`,
          padding: '0 24px',
          flexShrink: 0,
        }}
      >
        {(['vnc', 'serial'] as ConsoleTab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              background: 'transparent',
              border: 'none',
              borderBottom: activeTab === tab ? `2px solid ${theme.accent}` : '2px solid transparent',
              color: activeTab === tab ? theme.text.primary : theme.text.secondary,
              cursor: 'pointer',
              padding: '10px 16px',
              fontSize: 13,
              fontWeight: activeTab === tab ? 600 : 400,
              fontFamily: 'inherit',
              marginBottom: -1,
              textTransform: 'uppercase' as const,
              letterSpacing: '0.04em',
            }}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Console area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <div
          style={{
            flex: 1,
            background: theme.console.bg,
            display: 'flex',
            flexDirection: 'column',
            minHeight: 400,
            overflow: 'hidden',
          }}
        >
          {activeTab === 'vnc' ? (
            <VNCConsole
              cluster={activeCluster}
              namespace={namespace ?? ''}
              vmName={name ?? ''}
            />
          ) : (
            <SerialConsole
              cluster={activeCluster}
              namespace={namespace ?? ''}
              vmName={name ?? ''}
            />
          )}
        </div>
      </div>
    </div>
  )
}

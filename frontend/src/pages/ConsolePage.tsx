import { useState, useRef, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { Maximize2, Minimize2, Power } from 'lucide-react'
import { theme } from '@/lib/theme'
import { useUIStore } from '@/stores/ui-store'
import { VNCConsole } from '@/components/console/VNCConsole'
import { SerialConsole } from '@/components/console/SerialConsole'
import type { VNCConsoleRef, ConnectionStatus } from '@/components/console/VNCConsole'
import type { SerialConsoleRef } from '@/components/console/SerialConsole'

type ConsoleTab = 'vnc' | 'serial'

const toolbarBtnStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  padding: '4px 8px',
  background: 'transparent',
  border: `1px solid ${theme.main.inputBorder}`,
  borderRadius: theme.radius.sm,
  color: theme.text.secondary,
  cursor: 'pointer',
  fontSize: 12,
  fontFamily: 'inherit',
}

export function ConsolePage() {
  const { namespace, name } = useParams<{ namespace: string; name: string }>()
  const { activeCluster } = useUIStore()
  const [activeTab, setActiveTab] = useState<ConsoleTab>('vnc')
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('connecting')

  const consoleContainerRef = useRef<HTMLDivElement>(null)
  const vncRef = useRef<VNCConsoleRef>(null)
  const serialRef = useRef<SerialConsoleRef>(null)

  const connected = connectionStatus === 'connected'

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      consoleContainerRef.current?.requestFullscreen()
      setIsFullscreen(true)
    } else {
      document.exitFullscreen()
      setIsFullscreen(false)
    }
  }

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', handler)
    return () => document.removeEventListener('fullscreenchange', handler)
  }, [])

  const sendCtrlAltDel = () => vncRef.current?.sendCtrlAltDel()

  const handleDisconnect = () => {
    if (activeTab === 'vnc') vncRef.current?.disconnect()
    else serialRef.current?.disconnect()
  }

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
        <h1 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: theme.text.heading, fontFamily: theme.typography.heading.fontFamily }}>
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
            fontFamily: theme.typography.mono.fontFamily,
          }}
        >
          {namespace}
        </span>
      </div>

      {/* Fullscreen container: tab bar + toolbar + console */}
      <div
        ref={consoleContainerRef}
        style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}
      >
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

        {/* Toolbar */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '6px 24px',
            background: theme.main.card,
            borderBottom: `1px solid ${theme.main.cardBorder}`,
            flexShrink: 0,
          }}
        >
          {/* Fullscreen toggle */}
          <button onClick={toggleFullscreen} style={toolbarBtnStyle} title="Toggle fullscreen">
            {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </button>

          {/* Send Ctrl+Alt+Del (VNC only) */}
          {activeTab === 'vnc' && (
            <button onClick={sendCtrlAltDel} style={toolbarBtnStyle} title="Send Ctrl+Alt+Del">
              <span style={{ fontSize: 11, fontWeight: 500 }}>Ctrl+Alt+Del</span>
            </button>
          )}

          {/* Disconnect / Reconnect */}
          <button onClick={handleDisconnect} style={toolbarBtnStyle} title="Disconnect">
            <Power size={14} />
          </button>

          {/* Spacer */}
          <div style={{ flex: 1 }} />

          {/* Connection status indicator */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 11,
              color: theme.text.secondary,
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: connected ? theme.status.running : theme.status.error,
                animation: connectionStatus === 'connected' ? 'pulseDot 2s ease-in-out infinite' : undefined,
              }}
            />
            {connected ? 'Connected' : 'Disconnected'}
          </div>
        </div>

        {/* Console area */}
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
              ref={vncRef}
              cluster={activeCluster}
              namespace={namespace ?? ''}
              vmName={name ?? ''}
              onStatusChange={setConnectionStatus}
            />
          ) : (
            <SerialConsole
              ref={serialRef}
              cluster={activeCluster}
              namespace={namespace ?? ''}
              vmName={name ?? ''}
              onStatusChange={setConnectionStatus}
            />
          )}
        </div>
      </div>
    </div>
  )
}

import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'

type ConsoleTab = 'vnc' | 'serial'

export function ConsolePage() {
  const { namespace, name } = useParams<{ namespace: string; name: string }>()
  const [activeTab, setActiveTab] = useState<ConsoleTab>('vnc')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <div
        style={{
          padding: '14px 24px',
          borderBottom: '1px solid #27272a',
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          flexShrink: 0,
        }}
      >
        <Link
          to={`/vms/${namespace}/${name}`}
          style={{ color: '#71717a', textDecoration: 'none', fontSize: 13, flexShrink: 0 }}
        >
          ← {name}
        </Link>
        <h1 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: '#fafafa' }}>
          Console — {name}
        </h1>
        <span
          style={{
            marginLeft: 'auto',
            fontSize: 11,
            color: '#52525b',
            background: '#18181b',
            border: '1px solid #27272a',
            borderRadius: 4,
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
          borderBottom: '1px solid #27272a',
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
              borderBottom: activeTab === tab ? '2px solid #6366f1' : '2px solid transparent',
              color: activeTab === tab ? '#e4e4e7' : '#71717a',
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
      <div style={{ flex: 1, padding: 24, display: 'flex', flexDirection: 'column' }}>
        <div
          style={{
            flex: 1,
            background: '#0a0a0b',
            border: '1px solid #27272a',
            borderRadius: 8,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: 400,
          }}
        >
          {activeTab === 'vnc' ? (
            <div style={{ textAlign: 'center' }}>
              <div
                style={{
                  width: 56,
                  height: 56,
                  background: '#18181b',
                  border: '1px solid #27272a',
                  borderRadius: 12,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 16px',
                  fontSize: 28,
                }}
              >
                🖥
              </div>
              <div style={{ fontSize: 15, fontWeight: 600, color: '#e4e4e7', marginBottom: 8 }}>
                VNC Console
              </div>
              <div style={{ fontSize: 13, color: '#52525b' }}>
                VNC Console — requires noVNC integration
              </div>
              <div
                style={{
                  marginTop: 16,
                  padding: '6px 14px',
                  background: '#18181b',
                  border: '1px solid #27272a',
                  borderRadius: 6,
                  fontSize: 11,
                  color: '#71717a',
                  display: 'inline-block',
                  fontFamily: 'monospace',
                }}
              >
                ws://{window.location.hostname}/api/v1/namespaces/{namespace}/vms/{name}/vnc
              </div>
            </div>
          ) : (
            <div style={{ textAlign: 'center' }}>
              <div
                style={{
                  width: 56,
                  height: 56,
                  background: '#18181b',
                  border: '1px solid #27272a',
                  borderRadius: 12,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 16px',
                  fontSize: 28,
                }}
              >
                ⌨
              </div>
              <div style={{ fontSize: 15, fontWeight: 600, color: '#e4e4e7', marginBottom: 8 }}>
                Serial Console
              </div>
              <div style={{ fontSize: 13, color: '#52525b' }}>
                Serial Console — requires xterm.js integration
              </div>
              <div
                style={{
                  marginTop: 16,
                  padding: '6px 14px',
                  background: '#18181b',
                  border: '1px solid #27272a',
                  borderRadius: 6,
                  fontSize: 11,
                  color: '#71717a',
                  display: 'inline-block',
                  fontFamily: 'monospace',
                }}
              >
                ws://{window.location.hostname}/api/v1/namespaces/{namespace}/vms/{name}/serial
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

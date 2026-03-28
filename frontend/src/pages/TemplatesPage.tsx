import { TopBar } from '@/components/layout/TopBar'
import { useTemplates } from '@/hooks/useTemplates'

const categoryColor: Record<string, string> = {
  OS: '#3b82f6',
  Application: '#6366f1',
  Custom: '#f59e0b',
  Base: '#22c55e',
}

interface Template {
  name: string
  category?: string
  os_type?: string
  cpu?: number
  memory?: string
}

function Badge({ label, color }: { label: string; color: string }) {
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '2px 8px',
        borderRadius: 4,
        fontSize: 11,
        fontWeight: 600,
        color,
        background: `${color}1a`,
        border: `1px solid ${color}40`,
      }}
    >
      {label}
    </span>
  )
}

export function TemplatesPage() {
  const { data, isLoading } = useTemplates()
  const templates: Template[] = Array.isArray(data) ? data : []

  const handleNewTemplate = () => {
    alert('New Template: feature coming soon.')
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <TopBar
        title="Templates"
        action={
          <button
            onClick={handleNewTemplate}
            style={{
              background: '#6366f1',
              color: '#fff',
              border: 'none',
              borderRadius: 6,
              padding: '7px 14px',
              fontSize: 13,
              fontWeight: 500,
              cursor: 'pointer',
              fontFamily: 'inherit',
              whiteSpace: 'nowrap',
            }}
          >
            + New Template
          </button>
        }
      />

      <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
        <div
          style={{
            background: '#2a2a2e',
            border: '1px solid #3a3a3f',
            borderRadius: 8,
          }}
        >
          {isLoading ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#6b6b73', fontSize: 13 }}>
              Loading templates...
            </div>
          ) : templates.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#6b6b73', fontSize: 13 }}>
              No templates found. Create one to get started.
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #3a3a3f' }}>
                  {['Name', 'Category', 'OS Type', 'CPU', 'Memory'].map((col) => (
                    <th
                      key={col}
                      style={{
                        padding: '10px 16px',
                        textAlign: 'left',
                        color: '#71717a',
                        fontWeight: 500,
                        fontSize: 11,
                        textTransform: 'uppercase',
                        letterSpacing: '0.06em',
                      }}
                    >
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {templates.map((tpl) => (
                  <tr
                    key={tpl.name}
                    style={{ borderBottom: '1px solid #353539' }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = '#2e2e33')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    <td style={{ padding: '10px 16px', color: '#e4e4e7', fontWeight: 500 }}>{tpl.name}</td>
                    <td style={{ padding: '10px 16px' }}>
                      {tpl.category ? (
                        <Badge
                          label={tpl.category}
                          color={categoryColor[tpl.category] ?? '#a1a1aa'}
                        />
                      ) : (
                        <span style={{ color: '#6b6b73' }}>—</span>
                      )}
                    </td>
                    <td style={{ padding: '10px 16px', color: '#a1a1aa' }}>{tpl.os_type ?? '—'}</td>
                    <td style={{ padding: '10px 16px', color: '#a1a1aa' }}>{tpl.cpu ? `${tpl.cpu} vCPU` : '—'}</td>
                    <td style={{ padding: '10px 16px', color: '#a1a1aa' }}>{tpl.memory ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}

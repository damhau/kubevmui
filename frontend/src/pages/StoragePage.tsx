import { TopBar } from '@/components/layout/TopBar'
import { useDisks } from '@/hooks/useDisks'

const tierColor: Record<string, string> = {
  SSD: '#22c55e',
  NVMe: '#6366f1',
  HDD: '#71717a',
  Premium: '#f59e0b',
}

const diskStatusColor: Record<string, string> = {
  Available: '#22c55e',
  Bound: '#3b82f6',
  Released: '#f59e0b',
  Failed: '#ef4444',
}

interface Disk {
  name: string
  size_gb?: number
  performance_tier?: string
  status?: string
  attached_vm?: string | null
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

export function StoragePage() {
  const { data, isLoading } = useDisks()
  const disks: Disk[] = Array.isArray(data) ? data : []

  const handleNew = () => {
    alert('New Disk: feature coming soon.')
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <TopBar
        title="Disks"
        action={
          <button
            onClick={handleNew}
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
            + New Disk
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
              Loading disks...
            </div>
          ) : disks.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#6b6b73', fontSize: 13 }}>
              No disks found.
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #3a3a3f' }}>
                  {['Name', 'Size (GB)', 'Performance Tier', 'Status', 'Attached VM'].map((col) => (
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
                {disks.map((disk) => (
                  <tr
                    key={disk.name}
                    style={{ borderBottom: '1px solid #353539' }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = '#2e2e33')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    <td style={{ padding: '10px 16px', color: '#e4e4e7', fontWeight: 500 }}>{disk.name}</td>
                    <td style={{ padding: '10px 16px', color: '#a1a1aa' }}>
                      {disk.size_gb != null ? disk.size_gb : '—'}
                    </td>
                    <td style={{ padding: '10px 16px' }}>
                      {disk.performance_tier ? (
                        <Badge
                          label={disk.performance_tier}
                          color={tierColor[disk.performance_tier] ?? '#a1a1aa'}
                        />
                      ) : (
                        <span style={{ color: '#6b6b73' }}>—</span>
                      )}
                    </td>
                    <td style={{ padding: '10px 16px' }}>
                      {disk.status ? (
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 6,
                            fontSize: 12,
                            color: diskStatusColor[disk.status] ?? '#a1a1aa',
                          }}
                        >
                          <span
                            style={{
                              width: 7,
                              height: 7,
                              borderRadius: '50%',
                              background: diskStatusColor[disk.status] ?? '#a1a1aa',
                              flexShrink: 0,
                            }}
                          />
                          {disk.status}
                        </span>
                      ) : (
                        <span style={{ color: '#6b6b73' }}>—</span>
                      )}
                    </td>
                    <td style={{ padding: '10px 16px', color: '#a1a1aa' }}>
                      {disk.attached_vm ?? '—'}
                    </td>
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

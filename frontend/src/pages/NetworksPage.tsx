import { TopBar } from '@/components/layout/TopBar'
import { useNetworks } from '@/hooks/useNetworks'

const typeColor: Record<string, string> = {
  Bridge: '#22c55e',
  Masquerade: '#3b82f6',
  'SR-IOV': '#f59e0b',
  OVS: '#6366f1',
}

interface NetworkProfile {
  name: string
  display_name?: string
  type?: string
  vlan_id?: number | null
  dhcp?: boolean
  subnet?: string
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

export function NetworksPage() {
  const { data, isLoading } = useNetworks()
  const networks: NetworkProfile[] = Array.isArray(data) ? data : []

  const handleNew = () => {
    alert('New Network Profile: feature coming soon.')
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <TopBar
        title="Network Profiles"
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
            + New Network Profile
          </button>
        }
      />

      <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
        <div
          style={{
            background: '#ffffff',
            border: '1px solid #e0e0e5',
            borderRadius: 8,
          }}
        >
          {isLoading ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#6b6b73', fontSize: 13 }}>
              Loading network profiles...
            </div>
          ) : networks.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#6b6b73', fontSize: 13 }}>
              No network profiles found.
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#f7f7f9', borderBottom: '1px solid #e8e8ec' }}>
                  {['Display Name', 'Type', 'VLAN ID', 'DHCP', 'Subnet'].map((col) => (
                    <th
                      key={col}
                      style={{
                        padding: '10px 16px',
                        textAlign: 'left',
                        color: '#6b6b73',
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
                {networks.map((net) => (
                  <tr
                    key={net.name}
                    style={{ borderBottom: '1px solid #e8e8ec' }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = '#f7f7f9')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    <td style={{ padding: '10px 16px' }}>
                      <div style={{ color: '#1c1c1e', fontWeight: 500 }}>{net.display_name ?? net.name}</div>
                      {net.display_name && (
                        <div style={{ color: '#6b6b73', fontSize: 11, marginTop: 2 }}>{net.name}</div>
                      )}
                    </td>
                    <td style={{ padding: '10px 16px' }}>
                      {net.type ? (
                        <Badge label={net.type} color={typeColor[net.type] ?? '#6b6b73'} />
                      ) : (
                        <span style={{ color: '#8a8a8f' }}>—</span>
                      )}
                    </td>
                    <td style={{ padding: '10px 16px', color: '#6b6b73' }}>
                      {net.vlan_id ?? '—'}
                    </td>
                    <td style={{ padding: '10px 16px' }}>
                      <span
                        style={{
                          color: net.dhcp ? '#22c55e' : '#6b6b73',
                          fontSize: 12,
                        }}
                      >
                        {net.dhcp === undefined ? '—' : net.dhcp ? 'Yes' : 'No'}
                      </span>
                    </td>
                    <td style={{ padding: '10px 16px', color: '#6b6b73', fontFamily: 'monospace', fontSize: 12 }}>
                      {net.subnet ?? '—'}
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

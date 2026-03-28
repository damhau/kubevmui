import { useState, useRef, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { TopBar } from '@/components/layout/TopBar'
import { useVMs, useVMAction } from '@/hooks/useVMs'

const statusColor: Record<string, string> = {
  Running: '#22c55e',
  Stopped: '#71717a',
  Error: '#ef4444',
  Migrating: '#f59e0b',
  Provisioning: '#3b82f6',
}

interface VM {
  name: string
  namespace: string
  status: string
  cpu: number
  memory: string
  node?: string
  age?: string
}

function ActionsMenu({ onAction }: { vm: VM; onAction: (action: string) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const actions = [
    { label: 'Start', action: 'start' },
    { label: 'Stop', action: 'stop' },
    { label: 'Restart', action: 'restart' },
    { label: 'Console', action: 'console' },
    { label: 'Delete', action: 'delete', danger: true },
  ]

  return (
    <div ref={ref} style={{ position: 'relative' }} onClick={(e) => e.stopPropagation()}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          background: 'transparent',
          border: '1px solid #3a3a3f',
          borderRadius: 5,
          color: '#a1a1aa',
          cursor: 'pointer',
          padding: '3px 8px',
          fontSize: 16,
          lineHeight: 1,
          fontFamily: 'inherit',
        }}
      >
        ⋯
      </button>
      {open && (
        <div
          style={{
            position: 'absolute',
            right: 0,
            top: '100%',
            marginTop: 4,
            background: '#2e2e33',
            border: '1px solid #3a3a3f',
            borderRadius: 7,
            minWidth: 130,
            zIndex: 100,
            overflow: 'hidden',
            boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
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
                color: a.danger ? '#ef4444' : '#e4e4e7',
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = '#3a3a3f')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              {a.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export function VMListPage() {
  const [search, setSearch] = useState('')
  const navigate = useNavigate()
  const { data, isLoading } = useVMs()
  const vmAction = useVMAction()

  const vms: VM[] = Array.isArray(data) ? data : []
  const filtered = vms.filter(
    (vm) =>
      vm.name.toLowerCase().includes(search.toLowerCase()) ||
      vm.namespace?.toLowerCase().includes(search.toLowerCase()),
  )

  const handleAction = (vm: VM, action: string) => {
    if (action === 'console') {
      navigate(`/vms/${vm.namespace}/${vm.name}/console`)
      return
    }
    if (action === 'delete') {
      if (!window.confirm(`Delete VM "${vm.name}"?`)) return
    }
    vmAction.mutate({ namespace: vm.namespace, name: vm.name, action })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <TopBar
        title="Virtual Machines"
        action={
          <Link
            to="/vms/create"
            style={{
              background: '#6366f1',
              color: '#fff',
              border: 'none',
              borderRadius: 6,
              padding: '7px 14px',
              fontSize: 13,
              fontWeight: 500,
              cursor: 'pointer',
              textDecoration: 'none',
              whiteSpace: 'nowrap',
            }}
          >
            + New VM
          </Link>
        }
      />

      <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
        {/* Search */}
        <div style={{ marginBottom: 16 }}>
          <input
            type="text"
            placeholder="Search virtual machines..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              width: 280,
              background: '#2e2e33',
              border: '1px solid #3a3a3f',
              borderRadius: 6,
              color: '#e4e4e7',
              fontSize: 13,
              padding: '8px 12px',
              outline: 'none',
              fontFamily: 'inherit',
            }}
          />
        </div>

        {/* Table */}
        <div
          style={{
            background: '#2a2a2e',
            border: '1px solid #3a3a3f',
            borderRadius: 8,
          }}
        >
          {isLoading ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#6b6b73', fontSize: 13 }}>
              Loading virtual machines...
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#6b6b73', fontSize: 13 }}>
              {search ? 'No VMs match your search.' : 'No virtual machines found.'}
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #3a3a3f' }}>
                  {['Name', 'Status', 'CPU', 'Memory', 'Node', 'Age', ''].map((col, i) => (
                    <th
                      key={i}
                      style={{
                        padding: '10px 16px',
                        textAlign: 'left',
                        color: '#71717a',
                        fontWeight: 500,
                        fontSize: 11,
                        textTransform: 'uppercase',
                        letterSpacing: '0.06em',
                        width: col === '' ? 48 : undefined,
                      }}
                    >
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((vm) => (
                  <tr
                    key={`${vm.namespace}/${vm.name}`}
                    onClick={() => navigate(`/vms/${vm.namespace}/${vm.name}`)}
                    style={{ borderBottom: '1px solid #353539', cursor: 'pointer' }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = '#2e2e33')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    <td style={{ padding: '10px 16px' }}>
                      <div style={{ color: '#e4e4e7', fontWeight: 500 }}>{vm.name}</div>
                      <div style={{ color: '#71717a', fontSize: 11, marginTop: 2 }}>{vm.namespace}</div>
                    </td>
                    <td style={{ padding: '10px 16px' }}>
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                          fontSize: 12,
                          color: statusColor[vm.status] ?? '#a1a1aa',
                        }}
                      >
                        <span
                          style={{
                            width: 8,
                            height: 8,
                            borderRadius: '50%',
                            background: statusColor[vm.status] ?? '#a1a1aa',
                            flexShrink: 0,
                          }}
                        />
                        {vm.status}
                      </span>
                    </td>
                    <td style={{ padding: '10px 16px', color: '#a1a1aa' }}>{vm.cpu} vCPU</td>
                    <td style={{ padding: '10px 16px', color: '#a1a1aa' }}>{vm.memory}</td>
                    <td style={{ padding: '10px 16px', color: '#a1a1aa' }}>{vm.node ?? '—'}</td>
                    <td style={{ padding: '10px 16px', color: '#a1a1aa' }}>{vm.age ?? '—'}</td>
                    <td style={{ padding: '10px 16px' }}>
                      <ActionsMenu vm={vm} onAction={(action) => handleAction(vm, action)} />
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

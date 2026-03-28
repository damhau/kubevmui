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
          background: '#ffffff',
          border: '1px solid #d0d0d5',
          borderRadius: 5,
          color: '#6b6b73',
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
            background: '#ffffff',
            border: '1px solid #e0e0e5',
            borderRadius: 7,
            minWidth: 130,
            zIndex: 100,
            overflow: 'hidden',
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
                color: a.danger ? '#ef4444' : '#1c1c1e',
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = '#f7f7f9')}
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
              background: '#ffffff',
              border: '1px solid #d0d0d5',
              borderRadius: 6,
              color: '#1c1c1e',
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
            background: '#ffffff',
            border: '1px solid #e0e0e5',
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
                <tr style={{ background: '#f7f7f9', borderBottom: '1px solid #e8e8ec' }}>
                  {['Name', 'Status', 'CPU', 'Memory', 'Node', 'Age', ''].map((col, i) => (
                    <th
                      key={i}
                      style={{
                        padding: '10px 16px',
                        textAlign: 'left',
                        color: '#6b6b73',
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
                    style={{ borderBottom: '1px solid #e8e8ec', cursor: 'pointer' }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = '#f7f7f9')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    <td style={{ padding: '10px 16px' }}>
                      <div style={{ color: '#1c1c1e', fontWeight: 500 }}>{vm.name}</div>
                      <div style={{ color: '#6b6b73', fontSize: 11, marginTop: 2 }}>{vm.namespace}</div>
                    </td>
                    <td style={{ padding: '10px 16px' }}>
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                          fontSize: 12,
                          color: statusColor[vm.status] ?? '#6b6b73',
                        }}
                      >
                        <span
                          style={{
                            width: 8,
                            height: 8,
                            borderRadius: '50%',
                            background: statusColor[vm.status] ?? '#6b6b73',
                            flexShrink: 0,
                          }}
                        />
                        {vm.status}
                      </span>
                    </td>
                    <td style={{ padding: '10px 16px', color: '#6b6b73' }}>{vm.cpu} vCPU</td>
                    <td style={{ padding: '10px 16px', color: '#6b6b73' }}>{vm.memory}</td>
                    <td style={{ padding: '10px 16px', color: '#6b6b73' }}>{vm.node ?? '—'}</td>
                    <td style={{ padding: '10px 16px', color: '#6b6b73' }}>{vm.age ?? '—'}</td>
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

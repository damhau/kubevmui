import { useState, useRef, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { TopBar } from '@/components/layout/TopBar'
import { useVMs, useVMAction } from '@/hooks/useVMs'
import { theme } from '@/lib/theme'

const statusColor: Record<string, string> = {
  Running: theme.status.running,
  Stopped: theme.status.stopped,
  Error: theme.status.error,
  Migrating: theme.status.migrating,
  Provisioning: theme.status.provisioning,
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
          background: theme.main.card,
          border: `1px solid ${theme.main.inputBorder}`,
          borderRadius: 5,
          color: theme.text.secondary,
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
            background: theme.main.card,
            border: `1px solid ${theme.main.cardBorder}`,
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
                color: a.danger ? theme.status.error : theme.text.primary,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = theme.main.hoverBg)}
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
              display: 'inline-block',
              background: theme.button.primary,
              color: theme.button.primaryText,
              border: 'none',
              borderRadius: theme.radius.md,
              padding: '7px 14px',
              fontSize: 13,
              fontWeight: 500,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              fontFamily: 'inherit',
              textDecoration: 'none',
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
              background: theme.main.inputBg,
              border: `1px solid ${theme.main.inputBorder}`,
              borderRadius: theme.radius.md,
              color: theme.text.primary,
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
            background: theme.main.card,
            border: `1px solid ${theme.main.cardBorder}`,
            borderRadius: theme.radius.lg,
          }}
        >
          {isLoading ? (
            <div style={{ padding: 40, textAlign: 'center', color: theme.text.secondary, fontSize: 13 }}>
              Loading virtual machines...
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: theme.text.secondary, fontSize: 13 }}>
              {search ? 'No VMs match your search.' : 'No virtual machines found.'}
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: theme.main.tableHeaderBg, borderBottom: `1px solid ${theme.main.tableRowBorder}` }}>
                  {['Name', 'Status', 'CPU', 'Memory', 'Node', 'Age', ''].map((col, i) => (
                    <th
                      key={i}
                      style={{
                        padding: '10px 16px',
                        textAlign: 'left',
                        color: theme.text.secondary,
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
                    style={{ borderBottom: `1px solid ${theme.main.tableRowBorder}`, cursor: 'pointer' }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = theme.main.hoverBg)}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    <td style={{ padding: '10px 16px' }}>
                      <div style={{ color: theme.text.primary, fontWeight: 500 }}>{vm.name}</div>
                      <div style={{ color: theme.text.secondary, fontSize: 11, marginTop: 2 }}>{vm.namespace}</div>
                    </td>
                    <td style={{ padding: '10px 16px' }}>
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                          fontSize: 12,
                          color: statusColor[vm.status] ?? theme.text.secondary,
                        }}
                      >
                        <span
                          style={{
                            width: 8,
                            height: 8,
                            borderRadius: '50%',
                            background: statusColor[vm.status] ?? theme.text.secondary,
                            flexShrink: 0,
                          }}
                        />
                        {vm.status}
                      </span>
                    </td>
                    <td style={{ padding: '10px 16px', color: theme.text.secondary }}>{vm.cpu} vCPU</td>
                    <td style={{ padding: '10px 16px', color: theme.text.secondary }}>{vm.memory}</td>
                    <td style={{ padding: '10px 16px', color: theme.text.secondary }}>{vm.node ?? '—'}</td>
                    <td style={{ padding: '10px 16px', color: theme.text.secondary }}>{vm.age ?? '—'}</td>
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

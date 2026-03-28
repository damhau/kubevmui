import { useState, useRef, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { TopBar } from '@/components/layout/TopBar'
import { useVMs, useVMAction } from '@/hooks/useVMs'
import { useCreateSnapshot } from '@/hooks/useSnapshots'
import { useCreateMigration } from '@/hooks/useMigrations'
import apiClient from '@/lib/api-client'
import { useUIStore } from '@/stores/ui-store'
import { theme } from '@/lib/theme'
import { formatTimeAgo, formatMemoryMb } from '@/lib/format'
import { toast } from '@/components/ui/Toast'
import { ConfirmModal } from '@/components/ui/ConfirmModal'
import { PromptModal } from '@/components/ui/PromptModal'
import { EmptyState } from '@/components/ui/EmptyState'
import { TableSkeleton } from '@/components/ui/Skeleton'
import { Monitor } from 'lucide-react'

const statusBadge: Record<string, { bg: string; color: string; border: string }> = {
  Running:      { bg: '#ecfdf5', color: '#16a34a', border: '1px solid #bbf7d0' },
  Stopped:      { bg: '#f4f4f5', color: '#52525b', border: '1px solid #d4d4d8' },
  Error:        { bg: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca' },
  Migrating:    { bg: '#fffbeb', color: '#d97706', border: '1px solid #fde68a' },
  Provisioning: { bg: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe' },
}

function StatusBadge({ status }: { status: string }) {
  const s = statusBadge[status]
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '3px 10px',
        borderRadius: 12,
        fontSize: 12,
        fontWeight: 500,
        background: s?.bg ?? theme.main.bg,
        color: s?.color ?? theme.text.secondary,
        border: s?.border ?? `1px solid ${theme.main.cardBorder}`,
        whiteSpace: 'nowrap',
      }}
    >
      {status}
    </span>
  )
}

interface VM {
  name: string
  namespace: string
  status: string
  compute?: { cpu_cores?: number; memory_mb?: number }
  node?: string
  created_at?: string
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
    { label: 'Force Stop', action: 'force-stop', danger: true },
    { label: 'Restart', action: 'restart' },
    { label: 'Snapshot', action: 'snapshot' },
    { label: 'Migrate', action: 'migrate' },
    { label: 'Clone', action: 'clone' },
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
  const createSnapshot = useCreateSnapshot()
  const createMigration = useCreateMigration()

  const [confirmAction, setConfirmAction] = useState<{ title: string; message: string; onConfirm: () => void; danger?: boolean } | null>(null)
  const [promptAction, setPromptAction] = useState<{ title: string; message: string; defaultValue: string; onConfirm: (value: string) => void } | null>(null)

  const vms: VM[] = Array.isArray(data?.items) ? data.items : Array.isArray(data) ? data : []
  const filtered = vms.filter(
    (vm) =>
      vm.name.toLowerCase().includes(search.toLowerCase()) ||
      vm.namespace?.toLowerCase().includes(search.toLowerCase()),
  )

  const { activeCluster } = useUIStore()
  const queryClient = useQueryClient()

  const cloneMutation = useMutation({
    mutationFn: async ({ namespace, name, newName }: { namespace: string; name: string; newName: string }) => {
      const { data } = await apiClient.post(
        `/clusters/${activeCluster}/namespaces/${namespace}/vms/${name}/clone`,
        { new_name: newName },
      )
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vms'] })
      toast.success('VM cloned successfully')
    },
    onError: () => {
      toast.error('Failed to clone VM')
    },
  })

  const forceStopMutation = useMutation({
    mutationFn: async ({ namespace, name }: { namespace: string; name: string }) => {
      const { data } = await apiClient.post(
        `/clusters/${activeCluster}/namespaces/${namespace}/vms/${name}/force-stop`,
      )
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vms'] })
      toast.success('VM force stopped')
    },
    onError: () => {
      toast.error('Failed to force stop VM')
    },
  })

  const handleAction = (vm: VM, action: string) => {
    if (action === 'console') {
      navigate(`/vms/${vm.namespace}/${vm.name}/console`)
      return
    }
    if (action === 'clone') {
      setPromptAction({
        title: 'Clone VM',
        message: `Enter a name for the new VM cloned from "${vm.name}":`,
        defaultValue: `${vm.name}-clone`,
        onConfirm: (newName) => {
          cloneMutation.mutate({ namespace: vm.namespace, name: vm.name, newName })
          setPromptAction(null)
        },
      })
      return
    }
    if (action === 'force-stop') {
      setConfirmAction({
        title: 'Force Stop VM',
        message: `Force stop VM "${vm.name}"? This will immediately halt the VM.`,
        danger: true,
        onConfirm: () => {
          forceStopMutation.mutate({ namespace: vm.namespace, name: vm.name })
          setConfirmAction(null)
        },
      })
      return
    }
    if (action === 'snapshot') {
      createSnapshot.mutate(
        { namespace: vm.namespace, vmName: vm.name, snapshotName: `snap-${vm.name}-${Date.now()}` },
        {
          onSuccess: () => toast.success('Snapshot created'),
          onError: () => toast.error('Failed to create snapshot'),
        },
      )
      return
    }
    if (action === 'migrate') {
      createMigration.mutate(
        { namespace: vm.namespace, vmName: vm.name },
        {
          onSuccess: () => toast.success('Migration started'),
          onError: () => toast.error('Failed to start migration'),
        },
      )
      return
    }
    if (action === 'delete') {
      setConfirmAction({
        title: 'Delete VM',
        message: `Delete VM "${vm.name}"? This action cannot be undone.`,
        danger: true,
        onConfirm: () => {
          apiClient.delete(`/clusters/${activeCluster}/namespaces/${vm.namespace}/vms/${vm.name}`)
            .then(() => {
              queryClient.invalidateQueries({ queryKey: ['vms'] })
              toast.success('VM deleted')
            })
            .catch(() => toast.error('Failed to delete VM'))
          setConfirmAction(null)
        },
      })
      return
    }
    vmAction.mutate(
      { namespace: vm.namespace, name: vm.name, action },
      {
        onSuccess: () => toast.success(`VM ${action} requested`),
        onError: () => toast.error(`Failed to ${action} VM`),
      },
    )
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
            <TableSkeleton rows={5} cols={7} />
          ) : filtered.length === 0 ? (
            search ? (
              <div style={{ padding: 40, textAlign: 'center', color: theme.text.secondary, fontSize: 13 }}>
                No VMs match your search.
              </div>
            ) : (
              <EmptyState
                icon={<Monitor size={24} />}
                title="No Virtual Machines"
                description="Create your first VM to get started."
                action={{ label: 'Create VM', onClick: () => navigate('/vms/create') }}
              />
            )
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: theme.main.tableHeaderBg, borderBottom: `1px solid ${theme.main.tableRowBorder}` }}>
                  {['Name', 'Status', 'CPU', 'Memory', 'Node', 'Age', ''].map((col, i) => (
                    <th
                      key={i}
                      style={{
                        padding: '10px 16px',
                        textAlign: 'left',
                        color: theme.text.secondary,
                        fontWeight: 600,
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
                    style={{ borderBottom: `1px solid ${theme.main.tableRowBorder}`, cursor: 'pointer', transition: 'background 0.12s ease' }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = theme.main.hoverBg)}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    <td style={{ padding: '10px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 7, color: theme.text.primary, fontWeight: 600, fontSize: 14 }}>
                        <span style={{
                          width: 7,
                          height: 7,
                          borderRadius: '50%',
                          background: vm.status === 'Running' ? theme.status.running
                            : vm.status === 'Error' ? theme.status.error
                            : vm.status === 'Migrating' ? theme.status.migrating
                            : vm.status === 'Provisioning' ? theme.status.provisioning
                            : theme.status.stopped,
                          flexShrink: 0,
                        }} />
                        {vm.name}
                      </div>
                      <div style={{ color: theme.text.secondary, fontSize: 11, marginTop: 2, paddingLeft: 14 }}>{vm.namespace}</div>
                    </td>
                    <td style={{ padding: '10px 16px' }}>
                      <StatusBadge status={vm.status} />
                    </td>
                    <td style={{ padding: '10px 16px', color: theme.text.secondary, fontSize: 13 }}>{vm.compute?.cpu_cores ?? '—'} vCPU</td>
                    <td style={{ padding: '10px 16px', color: theme.text.secondary, fontSize: 13 }}>{formatMemoryMb(vm.compute?.memory_mb)}</td>
                    <td style={{ padding: '10px 16px', color: theme.text.secondary, fontSize: 13, fontFamily: theme.typography.mono.fontFamily }}>{vm.node ?? '—'}</td>
                    <td style={{ padding: '10px 16px', color: theme.text.secondary, fontSize: 13 }}>{formatTimeAgo(vm.created_at)}</td>
                    <td style={{ padding: '10px 16px' }} onClick={(e) => e.stopPropagation()}>
                      <ActionsMenu vm={vm} onAction={(action) => handleAction(vm, action)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <ConfirmModal
        open={!!confirmAction}
        title={confirmAction?.title ?? ''}
        message={confirmAction?.message ?? ''}
        danger={confirmAction?.danger}
        confirmLabel={confirmAction?.danger ? 'Delete' : 'Confirm'}
        onConfirm={() => confirmAction?.onConfirm()}
        onCancel={() => setConfirmAction(null)}
      />
      <PromptModal
        open={!!promptAction}
        title={promptAction?.title ?? ''}
        message={promptAction?.message ?? ''}
        defaultValue={promptAction?.defaultValue ?? ''}
        onConfirm={(value) => promptAction?.onConfirm(value)}
        onCancel={() => setPromptAction(null)}
      />
    </div>
  )
}

import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useSortable } from '@/hooks/useSortable'
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
import { DropdownMenu } from '@/components/ui/DropdownMenu'
import { HealthBadge } from '@/components/vm/HealthBadge'

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
  health?: string
  compute?: { cpu_cores?: number; memory_mb?: number }
  node?: string
  created_at?: string
}

const vmActions = [
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

export function VMListPage() {
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const navigate = useNavigate()
  const { data, isLoading } = useVMs()
  const vmAction = useVMAction()
  const createSnapshot = useCreateSnapshot()
  const createMigration = useCreateMigration()

  const [confirmAction, setConfirmAction] = useState<{ title: string; message: string; onConfirm: () => void; danger?: boolean; confirmLabel?: string } | null>(null)
  const [promptAction, setPromptAction] = useState<{ title: string; message: string; defaultValue: string; onConfirm: (value: string) => void } | null>(null)

  const vms: VM[] = Array.isArray(data?.items) ? data.items : Array.isArray(data) ? data : []
  const filtered = vms.filter(
    (vm) =>
      vm.name.toLowerCase().includes(search.toLowerCase()) ||
      vm.namespace?.toLowerCase().includes(search.toLowerCase()),
  )
  const { sorted, sortConfig, requestSort } = useSortable(filtered, { column: 'name', direction: 'asc' })

  const vmKey = (vm: VM) => `${vm.namespace}/${vm.name}`
  const allSelected = filtered.length > 0 && filtered.every((vm) => selected.has(vmKey(vm)))
  const someSelected = selected.size > 0

  const toggleAll = () => {
    if (allSelected) {
      setSelected(new Set())
    } else {
      setSelected(new Set(filtered.map(vmKey)))
    }
  }

  const toggleOne = (vm: VM) => {
    setSelected((prev) => {
      const next = new Set(prev)
      const k = vmKey(vm)
      if (next.has(k)) next.delete(k)
      else next.add(k)
      return next
    })
  }

  const selectedVMs = vms.filter((vm) => selected.has(vmKey(vm)))

  const handleBulkAction = (action: string) => {
    if (selectedVMs.length === 0) return
    const names = selectedVMs.map((vm) => vm.name).join(', ')
    if (action === 'delete') {
      setConfirmAction({
        title: `Delete ${selectedVMs.length} VMs`,
        message: `Delete the following VMs? This action cannot be undone.\n\n${names}`,
        danger: true,
        confirmLabel: 'Delete All',
        onConfirm: () => {
          selectedVMs.forEach((vm) => {
            apiClient.delete(`/clusters/${activeCluster}/namespaces/${vm.namespace}/vms/${vm.name}`)
              .then(() => toast.success(`VM ${vm.name} deleted`))
              .catch(() => toast.error(`Failed to delete ${vm.name}`))
          })
          queryClient.invalidateQueries({ queryKey: ['vms'] })
          setSelected(new Set())
          setConfirmAction(null)
        },
      })
    } else {
      setConfirmAction({
        title: `${action.charAt(0).toUpperCase() + action.slice(1)} ${selectedVMs.length} VMs`,
        message: `${action.charAt(0).toUpperCase() + action.slice(1)} the following VMs?\n\n${names}`,
        onConfirm: () => {
          selectedVMs.forEach((vm) => {
            vmAction.mutate(
              { namespace: vm.namespace, name: vm.name, action },
              {
                onSuccess: () => toast.success(`VM ${vm.name} ${action} requested`),
                onError: () => toast.error(`Failed to ${action} ${vm.name}`),
              },
            )
          })
          setSelected(new Set())
          setConfirmAction(null)
        },
      })
    }
  }

  const { activeCluster, activeNamespace } = useUIStore()
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

      <div className="page-content" style={{ animation: 'fadeInUp 0.35s ease-out' }}>
        <div className="page-container">
        {/* Search + Bulk Actions */}
        <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
          <input
            type="text"
            placeholder="Search virtual machines..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input"
            style={{ width: 280 }}
          />
          {someSelected && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '6px 12px',
              background: theme.main.card,
              border: `1px solid ${theme.main.cardBorder}`,
              borderRadius: theme.radius.md,
              animation: 'fadeInScale 0.2s ease-out both',
            }}>
              <span style={{ fontSize: 12, color: theme.text.secondary, fontWeight: 500 }}>
                {selected.size} selected
              </span>
              <button
                onClick={() => handleBulkAction('start')}
                style={{
                  background: theme.status.runningBg,
                  border: `1px solid ${theme.status.running}40`,
                  color: theme.status.running,
                  borderRadius: theme.radius.sm,
                  padding: '4px 10px',
                  fontSize: 12,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  fontWeight: 500,
                }}
              >
                Start
              </button>
              <button
                onClick={() => handleBulkAction('stop')}
                style={{
                  background: theme.main.tableHeaderBg,
                  border: `1px solid ${theme.main.cardBorder}`,
                  color: theme.text.secondary,
                  borderRadius: theme.radius.sm,
                  padding: '4px 10px',
                  fontSize: 12,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  fontWeight: 500,
                }}
              >
                Stop
              </button>
              <button
                onClick={() => handleBulkAction('restart')}
                style={{
                  background: theme.main.tableHeaderBg,
                  border: `1px solid ${theme.main.cardBorder}`,
                  color: theme.text.secondary,
                  borderRadius: theme.radius.sm,
                  padding: '4px 10px',
                  fontSize: 12,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  fontWeight: 500,
                }}
              >
                Restart
              </button>
              <button
                onClick={() => handleBulkAction('delete')}
                style={{
                  background: theme.status.errorBg,
                  border: `1px solid ${theme.status.error}40`,
                  color: theme.status.error,
                  borderRadius: theme.radius.sm,
                  padding: '4px 10px',
                  fontSize: 12,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  fontWeight: 500,
                }}
              >
                Delete
              </button>
              <button
                onClick={() => setSelected(new Set())}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: theme.text.dim,
                  cursor: 'pointer',
                  fontSize: 14,
                  padding: '2px 4px',
                  fontFamily: 'inherit',
                }}
                title="Clear selection"
              >
                x
              </button>
            </div>
          )}
        </div>

        {/* Table */}
        <div className="card">
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
            <table className="table">
              <thead>
                <tr className="table-header">
                  <th className="table-header-cell" style={{ width: 36, padding: '10px 12px' }}>
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleAll}
                      style={{ cursor: 'pointer', accentColor: theme.accent }}
                    />
                  </th>
                  <th
                    className={`table-header-cell-sortable${sortConfig.column === 'name' ? ' active' : ''}`}
                    onClick={() => requestSort('name')}
                  >
                    Name{sortConfig.column === 'name' ? (sortConfig.direction === 'asc' ? ' ↑' : ' ↓') : ''}
                  </th>
                  {activeNamespace === '_all' && (
                    <th
                      className={`table-header-cell-sortable${sortConfig.column === 'namespace' ? ' active' : ''}`}
                      onClick={() => requestSort('namespace')}
                    >
                      Namespace{sortConfig.column === 'namespace' ? (sortConfig.direction === 'asc' ? ' ↑' : ' ↓') : ''}
                    </th>
                  )}
                  <th
                    className={`table-header-cell-sortable${sortConfig.column === 'status' ? ' active' : ''}`}
                    onClick={() => requestSort('status')}
                  >
                    Status{sortConfig.column === 'status' ? (sortConfig.direction === 'asc' ? ' ↑' : ' ↓') : ''}
                  </th>
                  <th
                    className={`table-header-cell-sortable${sortConfig.column === 'compute.cpu_cores' ? ' active' : ''}`}
                    onClick={() => requestSort('compute.cpu_cores')}
                  >
                    CPU{sortConfig.column === 'compute.cpu_cores' ? (sortConfig.direction === 'asc' ? ' ↑' : ' ↓') : ''}
                  </th>
                  <th
                    className={`table-header-cell-sortable${sortConfig.column === 'compute.memory_mb' ? ' active' : ''}`}
                    onClick={() => requestSort('compute.memory_mb')}
                  >
                    Memory{sortConfig.column === 'compute.memory_mb' ? (sortConfig.direction === 'asc' ? ' ↑' : ' ↓') : ''}
                  </th>
                  <th
                    className={`table-header-cell-sortable${sortConfig.column === 'node' ? ' active' : ''}`}
                    onClick={() => requestSort('node')}
                  >
                    Node{sortConfig.column === 'node' ? (sortConfig.direction === 'asc' ? ' ↑' : ' ↓') : ''}
                  </th>
                  <th
                    className={`table-header-cell-sortable${sortConfig.column === 'created_at' ? ' active' : ''}`}
                    onClick={() => requestSort('created_at')}
                  >
                    Age{sortConfig.column === 'created_at' ? (sortConfig.direction === 'asc' ? ' ↑' : ' ↓') : ''}
                  </th>
                  <th className="table-header-cell" style={{ width: 48 }}></th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((vm, i) => (
                  <tr
                    key={`${vm.namespace}/${vm.name}`}
                    className="table-row-clickable"
                    onClick={() => navigate(`/vms/${vm.namespace}/${vm.name}`)}
                    style={i < 8 ? {
                      animation: `fadeInRow 0.3s ease-out both`,
                      animationDelay: `${0.05 + i * 0.04}s`,
                    } : undefined}
                  >
                    <td className="table-cell" style={{ padding: '10px 12px' }} onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selected.has(vmKey(vm))}
                        onChange={() => toggleOne(vm)}
                        style={{ cursor: 'pointer', accentColor: theme.accent }}
                      />
                    </td>
                    <td className="table-cell">
                      <div style={{ color: theme.text.primary, fontWeight: 600, fontSize: 14, fontFamily: theme.typography.mono.fontFamily }}>
                        {vm.name}
                      </div>
                      <div style={{ color: theme.text.secondary, fontSize: 11, marginTop: 2, fontFamily: theme.typography.mono.fontFamily }}>{vm.namespace}</div>
                    </td>
                    {activeNamespace === '_all' && (
                      <td className="table-cell" style={{ color: theme.text.secondary, fontSize: 12 }}>{vm.namespace}</td>
                    )}
                    <td className="table-cell">
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <StatusBadge status={vm.status} />
                        {vm.health && vm.health !== 'unknown' && vm.health !== 'healthy' && (
                          <HealthBadge health={vm.health} size="dot" />
                        )}
                      </div>
                    </td>
                    <td className="table-cell" style={{ color: theme.text.secondary, fontSize: 13, fontFamily: theme.typography.mono.fontFamily }}>{vm.compute?.cpu_cores ?? '—'} vCPU</td>
                    <td className="table-cell" style={{ color: theme.text.secondary, fontSize: 13, fontFamily: theme.typography.mono.fontFamily }}>{formatMemoryMb(vm.compute?.memory_mb)}</td>
                    <td className="table-cell" style={{ color: theme.text.secondary, fontSize: 13, fontFamily: theme.typography.mono.fontFamily }}>{vm.node ?? '—'}</td>
                    <td className="table-cell" style={{ color: theme.text.secondary, fontSize: 13 }}>{formatTimeAgo(vm.created_at)}</td>
                    <td className="table-cell" style={{ position: 'relative', zIndex: 10 }} onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu actions={vmActions} onAction={(action) => handleAction(vm, action)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        </div>
      </div>

      <ConfirmModal
        open={!!confirmAction}
        title={confirmAction?.title ?? ''}
        message={confirmAction?.message ?? ''}
        danger={confirmAction?.danger}
        confirmLabel={confirmAction?.confirmLabel ?? (confirmAction?.danger ? 'Delete' : 'Confirm')}
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

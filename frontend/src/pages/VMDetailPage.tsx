import { useState, useRef, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import apiClient from '@/lib/api-client'
import { useUIStore } from '@/stores/ui-store'
import { useVMAction } from '@/hooks/useVMs'
import { useSnapshots, useCreateSnapshot, useDeleteSnapshot, useRestoreSnapshot } from '@/hooks/useSnapshots'
import { useMigrations, useCreateMigration, useCancelMigration } from '@/hooks/useMigrations'
import { useAddVolume, useRemoveVolume, useAddInterface, useRemoveInterface } from '@/hooks/useHotplug'
import { useResourceEvents } from '@/hooks/useEvents'
import { theme } from '@/lib/theme'
import { formatDate, formatMemoryMb } from '@/lib/format'
import { useVMMetrics, useVMTimeline } from '@/hooks/useMetrics'
import { MetricChart } from '@/components/ui/MetricChart'
import { TimeRangeSelector } from '@/components/ui/TimeRangeSelector'
import { toast } from '@/components/ui/Toast'
import { ConfirmModal } from '@/components/ui/ConfirmModal'
import { PromptModal } from '@/components/ui/PromptModal'
import { CardSkeleton } from '@/components/ui/Skeleton'
import { InfoRow } from '@/components/ui/InfoRow'
import { YamlViewer } from '@/components/ui/YamlViewer'
import { YamlPreview } from '@/components/ui/YamlPreview'
import { ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'
import { Cpu, Network, HardDrive, Tag, Monitor } from 'lucide-react'
import { VNCConsole } from '@/components/console/VNCConsole'
import type { VNCConsoleRef, ConnectionStatus } from '@/components/console/VNCConsole'

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

type Tab = 'overview' | 'console' | 'metrics' | 'timeline' | 'disks' | 'network' | 'snapshots' | 'events' | 'yaml'

export function VMDetailPage() {
  const { namespace, name } = useParams<{ namespace: string; name: string }>()
  const navigate = useNavigate()
  const { activeCluster } = useUIStore()
  const vmAction = useVMAction()
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState<Tab>('overview')
  const [editingRunStrategy, setEditingRunStrategy] = useState(false)
  const [metricsRange, setMetricsRange] = useState('1h')
  const vncRef = useRef<VNCConsoleRef>(null)
  const [consoleStatus, setConsoleStatus] = useState<ConnectionStatus>('connecting')
  const { data: metricsData, isLoading: metricsLoading } = useVMMetrics(namespace!, name!, metricsRange)
  const { data: timelineData, isLoading: timelineLoading } = useVMTimeline(namespace ?? '', name ?? '', metricsRange)
  const { data: liveEvents } = useResourceEvents(namespace!, name!)

  const cloneMutation = useMutation({
    mutationFn: async (newName: string) => {
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
    mutationFn: async () => {
      const { data } = await apiClient.post(
        `/clusters/${activeCluster}/namespaces/${namespace}/vms/${name}/force-stop`,
      )
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vms'] })
      queryClient.invalidateQueries({ queryKey: ['vm'] })
      toast.success('VM force stopped')
    },
    onError: () => {
      toast.error('Failed to force stop VM')
    },
  })

  const updateRunStrategyMutation = useMutation({
    mutationFn: async (strategy: string) => {
      const { data } = await apiClient.patch(
        `/clusters/${activeCluster}/namespaces/${namespace}/vms/${name}`,
        { run_strategy: strategy },
      )
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vm'] })
      setEditingRunStrategy(false)
      toast.success('Run strategy updated')
    },
    onError: () => {
      toast.error('Failed to update run strategy')
    },
  })

  const [editingCpu, setEditingCpu] = useState(false)
  const [editingMemory, setEditingMemory] = useState(false)
  const [cpuValue, setCpuValue] = useState(0)
  const [memoryValue, setMemoryValue] = useState(0)
  const [memoryUnit, setMemoryUnit] = useState<'MB' | 'GB'>('GB')

  const updateComputeMutation = useMutation({
    mutationFn: async (patch: { cpu_cores?: number; memory_mb?: number }) => {
      const { data } = await apiClient.patch(
        `/clusters/${activeCluster}/namespaces/${namespace}/vms/${name}`,
        patch,
      )
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vm'] })
      setEditingCpu(false)
      setEditingMemory(false)
      toast.success('Compute resources updated')
    },
    onError: () => {
      toast.error('Failed to update compute resources')
    },
  })

  const { data: vm, isLoading } = useQuery({
    queryKey: ['vm', activeCluster, namespace, name],
    queryFn: async () => {
      const { data } = await apiClient.get(
        `/clusters/${activeCluster}/namespaces/${namespace}/vms/${name}`,
      )
      return data
    },
    enabled: !!(namespace && name),
  })

  const { data: snapshotData } = useSnapshots(namespace!, name!)
  const createSnapshot = useCreateSnapshot()
  const deleteSnapshot = useDeleteSnapshot()
  const restoreSnapshot = useRestoreSnapshot()
  const addVolume = useAddVolume()
  const removeVolume = useRemoveVolume()
  const addInterface = useAddInterface()
  const removeInterface = useRemoveInterface()
  const [showAddDisk, setShowAddDisk] = useState(false)
  const [newDisk, setNewDisk] = useState({ name: '', pvc_name: '', bus: 'scsi' })
  const [showAddNic, setShowAddNic] = useState(false)
  const [newNic, setNewNic] = useState({ name: '', nad_name: '' })

  const [snapshotName, setSnapshotName] = useState('')
  const [snapshotError, setSnapshotError] = useState<string | null>(null)
  const [confirmAction, setConfirmAction] = useState<{ title: string; message: string; onConfirm: () => void; danger?: boolean; confirmLabel?: string } | null>(null)
  const [promptAction, setPromptAction] = useState<{ title: string; message: string; defaultValue: string; onConfirm: (value: string) => void } | null>(null)

  const snapshots = Array.isArray(snapshotData?.items) ? snapshotData.items : []

  const { data: migrationData } = useMigrations(namespace!, name!)
  const createMigration = useCreateMigration()
  const cancelMigration = useCancelMigration()
  const migrations = Array.isArray(migrationData?.items) ? migrationData.items : []
  const activeMigration = migrations.find((m: any) =>
    m.vm_name === name && !['Succeeded', 'Failed'].includes(m.phase)
  )

  const handleAction = (action: string) => {
    if (!namespace || !name) return
    if (action === 'delete') {
      setConfirmAction({
        title: 'Delete VM',
        message: `Delete VM "${name}"? This action cannot be undone.`,
        danger: true,
        confirmLabel: 'Delete',
        onConfirm: () => {
          apiClient.delete(`/clusters/${activeCluster}/namespaces/${namespace}/vms/${name}`)
            .then(() => {
              toast.success('VM deleted')
              navigate('/vms')
            })
            .catch(() => toast.error('Failed to delete VM'))
          setConfirmAction(null)
        },
      })
      return
    }
    if (action === 'console') {
      navigate(`/vms/${namespace}/${name}/console`)
      return
    }
    vmAction.mutate(
      { namespace, name, action },
      {
        onSuccess: () => toast.success(`VM ${action} requested`),
        onError: () => toast.error(`Failed to ${action} VM`),
      },
    )
  }

  useEffect(() => {
    if (activeTab === 'console') {
      // Focus the VNC canvas after a short delay to ensure it's mounted
      setTimeout(() => {
        const canvas = document.querySelector('canvas')
        if (canvas) canvas.focus()
      }, 500)
    }
  }, [activeTab])

  const tabs: { id: Tab; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'metrics', label: 'Metrics' },
    { id: 'timeline', label: 'Timeline' },
    { id: 'disks', label: 'Disks' },
    { id: 'network', label: 'Network' },
    { id: 'snapshots', label: 'Snapshots' },
    { id: 'console', label: 'Console' },
    { id: 'events', label: 'Events' },
    { id: 'yaml', label: 'YAML' },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <div
        style={{
          padding: '16px 24px',
          background: theme.main.card,
          borderBottom: `1px solid ${theme.main.cardBorder}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0 }}>
          <Link
            to="/vms"
            style={{
              color: theme.text.secondary,
              textDecoration: 'none',
              fontSize: 13,
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              flexShrink: 0,
            }}
          >
            ← VMs
          </Link>
          <h1
            style={{
              margin: 0,
              fontSize: 20,
              fontWeight: 700,
              fontFamily: theme.typography.heading.fontFamily,
              color: theme.text.heading,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {name}
          </h1>
          {vm?.status && (
            <StatusBadge status={vm.status} />
          )}
        </div>

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: 8, flexShrink: 0, alignItems: 'center' }}>
          {/* Primary action */}
          {vm?.status === 'Running' ? (
            <button
              onClick={() => handleAction('console')}
              style={{
                background: theme.button.primary,
                color: theme.button.primaryText,
                border: 'none',
                borderRadius: theme.radius.md,
                padding: '6px 14px',
                fontSize: 12,
                cursor: 'pointer',
                fontFamily: 'inherit',
                fontWeight: 600,
              }}
            >
              Console
            </button>
          ) : (
            <button
              onClick={() => handleAction('start')}
              style={{
                background: theme.button.primary,
                color: theme.button.primaryText,
                border: 'none',
                borderRadius: theme.radius.md,
                padding: '6px 14px',
                fontSize: 12,
                cursor: 'pointer',
                fontFamily: 'inherit',
                fontWeight: 600,
              }}
            >
              Start
            </button>
          )}
          {/* Secondary actions */}
          {vm?.status === 'Running' && (
            <button
              onClick={() => handleAction('stop')}
              style={{
                background: theme.main.card,
                color: theme.text.primary,
                border: `1px solid ${theme.main.inputBorder}`,
                borderRadius: theme.radius.md,
                padding: '6px 12px',
                fontSize: 12,
                cursor: 'pointer',
                fontFamily: 'inherit',
                fontWeight: 500,
              }}
            >
              Stop
            </button>
          )}
          <button
            onClick={() => handleAction('restart')}
            style={{
              background: theme.main.card,
              color: theme.text.primary,
              border: `1px solid ${theme.main.inputBorder}`,
              borderRadius: theme.radius.md,
              padding: '6px 12px',
              fontSize: 12,
              cursor: 'pointer',
              fontFamily: 'inherit',
              fontWeight: 500,
            }}
          >
            Restart
          </button>
          <button
            onClick={() => {
              setPromptAction({
                title: 'Clone VM',
                message: `Enter a name for the new VM cloned from "${name}":`,
                defaultValue: `${name}-clone`,
                onConfirm: (newName) => {
                  if (namespace && name) cloneMutation.mutate(newName)
                  setPromptAction(null)
                },
              })
            }}
            disabled={cloneMutation.isPending}
            style={{
              background: theme.main.card,
              color: theme.text.primary,
              border: `1px solid ${theme.main.inputBorder}`,
              borderRadius: theme.radius.md,
              padding: '6px 12px',
              fontSize: 12,
              cursor: cloneMutation.isPending ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit',
              fontWeight: 500,
              opacity: cloneMutation.isPending ? 0.6 : 1,
            }}
          >
            {cloneMutation.isPending ? 'Cloning...' : 'Clone'}
          </button>
          <button
            onClick={() => {
              if (!namespace || !name) return
              const snapName = `snap-${name}-${Date.now()}`
              createSnapshot.mutate(
                { namespace, vmName: name, snapshotName: snapName },
                { onError: (err: unknown) => { setSnapshotError((err as { message?: string }).message ?? 'Snapshot failed') } },
              )
            }}
            disabled={createSnapshot.isPending}
            style={{
              background: theme.main.card,
              color: theme.text.primary,
              border: `1px solid ${theme.main.inputBorder}`,
              borderRadius: theme.radius.md,
              padding: '6px 12px',
              fontSize: 12,
              cursor: createSnapshot.isPending ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit',
              fontWeight: 500,
              opacity: createSnapshot.isPending ? 0.6 : 1,
            }}
          >
            {createSnapshot.isPending ? 'Snapshotting...' : 'Snapshot'}
          </button>
          {vm?.status === 'Running' && (
            <button
              onClick={() => {
                setConfirmAction({
                  title: 'Force Stop VM',
                  message: `Force stop VM "${name}"? This will immediately halt the VM.`,
                  danger: true,
                  confirmLabel: 'Force Stop',
                  onConfirm: () => {
                    forceStopMutation.mutate()
                    setConfirmAction(null)
                  },
                })
              }}
              disabled={forceStopMutation.isPending}
              style={{
                background: 'rgba(239,68,68,0.08)',
                color: theme.status.error,
                border: `1px solid rgba(239,68,68,0.3)`,
                borderRadius: theme.radius.md,
                padding: '6px 12px',
                fontSize: 12,
                cursor: forceStopMutation.isPending ? 'not-allowed' : 'pointer',
                fontFamily: 'inherit',
                fontWeight: 500,
                opacity: forceStopMutation.isPending ? 0.6 : 1,
              }}
            >
              {forceStopMutation.isPending ? 'Force Stopping...' : 'Force Stop'}
            </button>
          )}
          {vm?.status === 'Running' && (
            <button
              onClick={() => {
                if (namespace && name) {
                  createMigration.mutate({ namespace, vmName: name })
                }
              }}
              disabled={!!activeMigration || createMigration.isPending}
              style={{
                background: theme.status.migratingBg,
                color: theme.status.migrating,
                border: `1px solid rgba(245,158,11,0.3)`,
                borderRadius: theme.radius.md,
                padding: '6px 12px',
                fontSize: 12,
                cursor: activeMigration || createMigration.isPending ? 'not-allowed' : 'pointer',
                fontFamily: 'inherit',
                fontWeight: 500,
                opacity: activeMigration || createMigration.isPending ? 0.6 : 1,
              }}
            >
              {activeMigration || createMigration.isPending ? 'Migrating...' : 'Migrate'}
            </button>
          )}
          {/* Separator + Delete */}
          <div style={{ width: 1, height: 20, background: theme.main.cardBorder, margin: '0 4px' }} />
          <button
            onClick={() => handleAction('delete')}
            style={{
              background: 'transparent',
              color: theme.status.error,
              border: 'none',
              borderRadius: theme.radius.md,
              padding: '6px 12px',
              fontSize: 12,
              cursor: 'pointer',
              fontFamily: 'inherit',
              fontWeight: 500,
              opacity: 0.8,
            }}
          >
            Delete
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div
        className="tab-bar"
        style={{
          background: theme.main.card,
          padding: '0 24px',
          flexShrink: 0,
        }}
      >
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`tab-button ${activeTab === tab.id ? 'active' : ''}`}
            style={{
              marginBottom: -1,
              fontWeight: activeTab === tab.id ? 600 : 400,
              transition: 'color 0.15s, border-color 0.2s, font-weight 0.15s',
              textTransform: activeTab === tab.id ? 'uppercase' : 'none',
              letterSpacing: activeTab === tab.id ? '0.05em' : 'normal',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="page-content">
      <div style={{ maxWidth: theme.layout.contentMaxWidth, margin: '0 auto', width: '100%' }}>
        {isLoading ? (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <CardSkeleton height={100} />
            <CardSkeleton height={100} />
            <CardSkeleton height={100} />
            <CardSkeleton height={100} />
          </div>
        ) : !vm ? (
          <div style={{ color: theme.text.secondary, fontSize: 13 }}>VM not found.</div>
        ) : (
          <>
            {/* Overview */}
            {activeTab === 'overview' && (
              <>
                {/* Active migration banner */}
                {activeMigration && (
                  <div
                    style={{
                      background: theme.status.migratingBg,
                      borderLeft: `4px solid ${theme.status.migrating}`,
                      borderRadius: theme.radius.md,
                      padding: '12px 16px',
                      marginBottom: 16,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 12,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: theme.text.primary }}>
                        Migration in progress
                      </span>
                      <span
                        style={{
                          display: 'inline-block',
                          padding: '2px 8px',
                          borderRadius: 10,
                          fontSize: 11,
                          fontWeight: 500,
                          background: 'rgba(245,158,11,0.15)',
                          color: theme.status.migrating,
                        }}
                      >
                        {activeMigration.phase}
                      </span>
                      {(activeMigration.source_node || activeMigration.target_node) && (
                        <span style={{ fontSize: 12, color: theme.text.secondary }}>
                          {activeMigration.source_node ?? '?'} → {activeMigration.target_node ?? '?'}
                        </span>
                      )}
                    </div>
                    <button
                      onClick={() => {
                        if (namespace) {
                          cancelMigration.mutate({ namespace, name: activeMigration.name })
                        }
                      }}
                      disabled={cancelMigration.isPending}
                      style={{
                        background: theme.main.card,
                        color: theme.status.error,
                        border: `1px solid rgba(239,68,68,0.3)`,
                        borderRadius: theme.radius.md,
                        padding: '4px 10px',
                        fontSize: 12,
                        cursor: cancelMigration.isPending ? 'not-allowed' : 'pointer',
                        fontFamily: 'inherit',
                        fontWeight: 500,
                        flexShrink: 0,
                      }}
                    >
                      {cancelMigration.isPending ? 'Cancelling...' : 'Cancel'}
                    </button>
                  </div>
                )}

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  {/* Compute card */}
                  <div className="card-padded animate-fade-in-up">
                    <div className="section-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Cpu size={13} style={{ opacity: 0.6 }} />
                      Compute
                    </div>
                    <InfoRow label="Status" value={<StatusBadge status={vm.status} />} />
                    <InfoRow label="CPU" value={
                      vm.status?.toLowerCase() === 'stopped' || vm.status?.toLowerCase() === 'unknown' ? (
                        editingCpu ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <input type="number" min={1} max={64} value={cpuValue}
                              onChange={(e) => setCpuValue(parseInt(e.target.value) || 1)}
                              onKeyDown={(e) => { if (e.key === 'Enter') updateComputeMutation.mutate({ cpu_cores: cpuValue }); if (e.key === 'Escape') setEditingCpu(false) }}
                              autoFocus
                              style={{ width: 60, background: theme.main.inputBg, border: `1px solid ${theme.main.inputBorder}`, borderRadius: theme.radius.md, color: theme.text.primary, fontSize: 14, padding: '4px 8px', outline: 'none', fontFamily: 'inherit' }}
                            />
                            <span style={{ fontSize: 13, color: theme.text.secondary }}>vCPU</span>
                            <button onClick={() => updateComputeMutation.mutate({ cpu_cores: cpuValue })} disabled={updateComputeMutation.isPending}
                              style={{ fontSize: 12, color: theme.accent, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>Save</button>
                            <button onClick={() => setEditingCpu(false)}
                              style={{ fontSize: 12, color: theme.text.secondary, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
                          </div>
                        ) : (
                          <span onClick={() => { setCpuValue(vm.compute?.cpu_cores ?? 1); setEditingCpu(true) }}
                            style={{ cursor: 'pointer', borderBottom: `1px dashed ${theme.text.dim}` }}
                            title="Click to edit">{vm.compute?.cpu_cores ?? '—'} vCPU</span>
                        )
                      ) : `${vm.compute?.cpu_cores ?? '—'} vCPU`
                    } />
                    <InfoRow label="Memory" value={
                      vm.status?.toLowerCase() === 'stopped' || vm.status?.toLowerCase() === 'unknown' ? (
                        editingMemory ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <input type="number" min={memoryUnit === 'GB' ? 1 : 128} step={memoryUnit === 'GB' ? 1 : 256} value={memoryValue}
                              onChange={(e) => setMemoryValue(parseFloat(e.target.value) || 1)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') updateComputeMutation.mutate({ memory_mb: memoryUnit === 'GB' ? memoryValue * 1024 : memoryValue })
                                if (e.key === 'Escape') setEditingMemory(false)
                              }}
                              autoFocus
                              style={{ width: 70, background: theme.main.inputBg, border: `1px solid ${theme.main.inputBorder}`, borderRadius: theme.radius.md, color: theme.text.primary, fontSize: 14, padding: '4px 8px', outline: 'none', fontFamily: 'inherit' }}
                            />
                            <select value={memoryUnit} onChange={(e) => {
                              const newUnit = e.target.value as 'MB' | 'GB'
                              setMemoryValue(newUnit === 'GB' ? memoryValue / 1024 : memoryValue * 1024)
                              setMemoryUnit(newUnit)
                            }} style={{ background: theme.main.inputBg, border: `1px solid ${theme.main.inputBorder}`, borderRadius: theme.radius.md, color: theme.text.primary, fontSize: 13, padding: '4px 6px', fontFamily: 'inherit' }}>
                              <option value="GB">GB</option>
                              <option value="MB">MB</option>
                            </select>
                            <button onClick={() => updateComputeMutation.mutate({ memory_mb: Math.round(memoryUnit === 'GB' ? memoryValue * 1024 : memoryValue) })} disabled={updateComputeMutation.isPending}
                              style={{ fontSize: 12, color: theme.accent, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>Save</button>
                            <button onClick={() => setEditingMemory(false)}
                              style={{ fontSize: 12, color: theme.text.secondary, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
                          </div>
                        ) : (
                          <span onClick={() => {
                            const mb = vm.compute?.memory_mb ?? 512
                            if (mb >= 1024) { setMemoryValue(mb / 1024); setMemoryUnit('GB') }
                            else { setMemoryValue(mb); setMemoryUnit('MB') }
                            setEditingMemory(true)
                          }}
                            style={{ cursor: 'pointer', borderBottom: `1px dashed ${theme.text.dim}` }}
                            title="Click to edit">{formatMemoryMb(vm.compute?.memory_mb)}</span>
                        )
                      ) : formatMemoryMb(vm.compute?.memory_mb)
                    } />
                    <InfoRow label="Run Strategy" value={
                      editingRunStrategy ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <select
                            defaultValue={vm.run_strategy}
                            onChange={(e) => updateRunStrategyMutation.mutate(e.target.value)}
                            disabled={updateRunStrategyMutation.isPending}
                            style={{
                              background: theme.main.inputBg,
                              border: `1px solid ${theme.main.inputBorder}`,
                              borderRadius: theme.radius.md,
                              padding: '4px 8px',
                              fontSize: 13,
                              color: theme.text.primary,
                              fontFamily: 'inherit',
                              cursor: 'pointer',
                            }}
                          >
                            {['Always', 'Halted', 'Manual', 'RerunOnFailure'].map((s) => (
                              <option key={s} value={s}>{s}</option>
                            ))}
                          </select>
                          <button
                            onClick={() => setEditingRunStrategy(false)}
                            style={{
                              background: 'transparent',
                              border: 'none',
                              color: theme.text.secondary,
                              cursor: 'pointer',
                              fontSize: 12,
                              fontFamily: 'inherit',
                            }}
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span>{vm.run_strategy}</span>
                          <button
                            onClick={() => setEditingRunStrategy(true)}
                            style={{
                              background: 'transparent',
                              border: `1px solid ${theme.main.inputBorder}`,
                              borderRadius: theme.radius.sm,
                              padding: '1px 6px',
                              fontSize: 11,
                              cursor: 'pointer',
                              color: theme.text.secondary,
                              fontFamily: 'inherit',
                            }}
                          >
                            Edit
                          </button>
                        </div>
                      )
                    } />
                  </div>

                  {/* Network card */}
                  <div className="card-padded animate-fade-in-up stagger-1">
                    <div className="section-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Network size={13} style={{ opacity: 0.6 }} />
                      Network
                    </div>
                    <InfoRow label="Node" value={vm.node ?? '—'} mono />
                    <InfoRow label="IP Addresses" value={
                      vm.ip_addresses?.length
                        ? vm.ip_addresses.join(', ')
                        : vm.ip ?? '—'
                    } mono />
                    <InfoRow label="Interfaces" value={`${vm.networks?.length ?? 0}`} />
                  </div>

                  {/* Guest Agent card */}
                  {vm.guest_agent_info && (vm.guest_agent_info.hostname || vm.guest_agent_info.os_name) && (
                    <div className="card-padded animate-fade-in-up stagger-2">
                      <div className="section-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Monitor size={13} style={{ opacity: 0.6 }} />
                        Guest Agent
                      </div>
                      {vm.guest_agent_info.hostname && (
                        <InfoRow label="Hostname" value={vm.guest_agent_info.hostname} mono />
                      )}
                      {vm.guest_agent_info.os_name && (
                        <InfoRow label="OS" value={
                          vm.guest_agent_info.os_version
                            ? `${vm.guest_agent_info.os_name} ${vm.guest_agent_info.os_version}`
                            : vm.guest_agent_info.os_name
                        } />
                      )}
                      {vm.guest_agent_info.kernel && (
                        <InfoRow label="Kernel" value={vm.guest_agent_info.kernel} mono />
                      )}
                      {vm.guest_agent_info.timezone && (
                        <InfoRow label="Timezone" value={vm.guest_agent_info.timezone} />
                      )}
                    </div>
                  )}

                  {/* Storage card */}
                  <div className="card-padded animate-fade-in-up stagger-2">
                    <div className="section-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <HardDrive size={13} style={{ opacity: 0.6 }} />
                      Storage
                    </div>
                    {vm.disks?.filter((d: any) => d.source_type !== 'cloud_init').map((disk: any) => (
                      <InfoRow
                        key={disk.name}
                        label={disk.name}
                        value={
                          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            {disk.volume_name ? (
                              <Link to={`/storage/${namespace}/${disk.volume_name}`} style={{ color: theme.accent, textDecoration: 'none' }}>
                                {disk.volume_name}
                              </Link>
                            ) : disk.source_type === 'container_disk' ? disk.image || '—' : '—'}
                            {disk.size_gb > 0 && (
                              <span style={{ color: theme.text.secondary, fontSize: 12 }}>
                                {disk.used_gb > 0 ? `${disk.used_gb} / ` : ''}{disk.size_gb} Gi
                              </span>
                            )}
                          </span>
                        }
                      />
                    ))}
                  </div>

                  {/* Identity card */}
                  <div className="card-padded animate-fade-in-up stagger-3">
                    <div className="section-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Tag size={13} style={{ opacity: 0.6 }} />
                      Identity
                    </div>
                    <InfoRow label="Namespace" value={namespace} mono />
                    <InfoRow label="OS Type" value={vm.os_type ?? vm.os ?? '—'} />
                    <InfoRow label="Created" value={formatDate(vm.created_at ?? vm.creation_timestamp)} />
                    <InfoRow label="Template" value={vm.template_name ? <Link to={`/templates/${vm.template_name}`} style={{ color: theme.accent, textDecoration: 'none' }}>{vm.template_name}</Link> : '—'} />
                    <InfoRow label="Description" value={vm.description || '—'} />
                    {vm.labels && Object.keys(vm.labels).length > 0 && (
                      <InfoRow
                        label="Labels"
                        value={
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                            {Object.entries(vm.labels).map(([k, v]) => (
                              <span
                                key={k}
                                style={{
                                  background: theme.main.bg,
                                  border: `1px solid ${theme.main.inputBorder}`,
                                  borderRadius: theme.radius.sm,
                                  padding: '2px 7px',
                                  fontSize: 11,
                                  color: theme.text.secondary,
                                  fontFamily: 'monospace',
                                }}
                              >
                                {k}={String(v)}
                              </span>
                            ))}
                          </div>
                        }
                      />
                    )}
                  </div>
                </div>
              </>
            )}

            {/* Console */}
            {activeTab === 'console' && (
              <div className="card" style={{ overflow: 'hidden' }}>
                {vm.status?.toLowerCase() !== 'running' ? (
                  <div className="empty-text">VM must be running to access the console.</div>
                ) : (
                  <div style={{ height: 600, background: '#000' }}>
                    <VNCConsole
                      ref={vncRef}
                      cluster={activeCluster}
                      namespace={namespace!}
                      vmName={name!}
                      onStatusChange={setConsoleStatus}
                    />
                  </div>
                )}
              </div>
            )}

            {/* Metrics */}
            {activeTab === 'metrics' && (
              <div>
                {/* Time range selector */}
                <div style={{ marginBottom: 16 }}>
                  <TimeRangeSelector value={metricsRange} onChange={setMetricsRange} ranges={['1h', '6h', '24h', '7d']} />
                </div>

                {metricsLoading ? (
                  <div style={{ padding: 40, textAlign: 'center', color: theme.text.secondary, fontSize: 13 }}>Loading metrics...</div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                    <MetricChart
                      title="CPU Usage (cores)"
                      data={metricsData?.cpu ?? []}
                      color={theme.accent}
                      formatValue={(v) => `${v.toFixed(2)}`}
                    />
                    <MetricChart
                      title="Memory Usage"
                      data={(metricsData?.memory ?? []).map((d: any) => ({ ...d, value: d.value / (1024 * 1024) }))}
                      color={theme.status.running}
                      formatValue={(v) => `${v.toFixed(0)} MB`}
                    />
                    <MetricChart
                      title="Network Receive"
                      data={(metricsData?.network_rx ?? []).map((d: any) => ({ ...d, value: d.value / 1024 }))}
                      color={theme.status.provisioning}
                      formatValue={(v) => `${v.toFixed(1)} KB/s`}
                    />
                    <MetricChart
                      title="Network Transmit"
                      data={(metricsData?.network_tx ?? []).map((d: any) => ({ ...d, value: d.value / 1024 }))}
                      color={theme.status.migrating}
                      formatValue={(v) => `${v.toFixed(1)} KB/s`}
                    />
                  </div>
                )}

                {/* Disk I/O charts */}
                {(metricsData?.disk_read?.length > 0 || metricsData?.disk_write?.length > 0) && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                    <MetricChart
                      title="Disk Read"
                      data={(metricsData?.disk_read ?? []).map((d: any) => ({ ...d, value: d.value / 1024 }))}
                      color="#8b5cf6"
                      formatValue={(v) => `${v.toFixed(1)} KB/s`}
                    />
                    <MetricChart
                      title="Disk Write"
                      data={(metricsData?.disk_write ?? []).map((d: any) => ({ ...d, value: d.value / 1024 }))}
                      color="#ec4899"
                      formatValue={(v) => `${v.toFixed(1)} KB/s`}
                    />
                  </div>
                )}

                {/* Storage charts */}
                {metricsData?.storage && Object.keys(metricsData.storage).length > 0 && (
                  <div style={{ display: 'grid', gridTemplateColumns: Object.keys(metricsData.storage).length === 1 ? '1fr' : '1fr 1fr', gap: 16 }}>
                    {Object.entries(metricsData.storage).map(([pvcName, data]: [string, any]) => (
                      <MetricChart
                        key={pvcName}
                        title={`Storage: ${pvcName}`}
                        data={data.map((d: any) => ({ ...d, value: d.value * 100 }))}
                        color="#8b5cf6"
                        formatValue={(v) => `${v.toFixed(1)}%`}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Timeline */}
            {activeTab === 'timeline' && (
              <div>
                <TimeRangeSelector value={metricsRange} onChange={setMetricsRange} />
                {timelineLoading ? (
                  <div style={{ padding: 40, textAlign: 'center', color: theme.text.secondary, fontSize: 13 }}>Loading timeline...</div>
                ) : (
                  <>
                    {/* CPU chart with event markers */}
                    <div className="card" style={{ padding: 16, marginTop: 16 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: theme.text.heading, marginBottom: 12 }}>CPU Usage with Events</div>
                      {(timelineData?.cpu ?? []).length === 0 ? (
                        <div style={{ height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', color: theme.text.secondary, fontSize: 13 }}>No data available</div>
                      ) : (
                        <ResponsiveContainer width="100%" height={220}>
                          <ComposedChart data={timelineData?.cpu ?? []}>
                            <CartesianGrid strokeDasharray="3 3" stroke={theme.main.cardBorder} />
                            <XAxis dataKey="timestamp" tickFormatter={(ts) => new Date(ts * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} tick={{ fontSize: 10, fill: theme.text.secondary }} stroke={theme.main.cardBorder} />
                            <YAxis tickFormatter={(v) => `${v.toFixed(2)}`} tick={{ fontSize: 10, fill: theme.text.secondary }} stroke={theme.main.cardBorder} width={50} />
                            <Tooltip contentStyle={{ background: theme.main.card, border: `1px solid ${theme.main.cardBorder}`, borderRadius: 6, fontSize: 12 }} labelFormatter={(ts) => new Date(Number(ts) * 1000).toLocaleString()} formatter={(value: number) => [`${value.toFixed(3)} cores`, 'CPU']} />
                            <Line type="monotone" dataKey="value" stroke={theme.accent} strokeWidth={1.5} dot={false} />
                            {(timelineData?.events ?? []).map((event: any, i: number) => (
                              <ReferenceLine key={i} x={new Date(event.timestamp).getTime() / 1000} stroke={event.type === 'Warning' ? theme.status.migrating : theme.status.running} strokeDasharray="3 3" strokeWidth={1} />
                            ))}
                          </ComposedChart>
                        </ResponsiveContainer>
                      )}
                    </div>

                    {/* Memory chart with event markers */}
                    <div className="card" style={{ padding: 16, marginTop: 16 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: theme.text.heading, marginBottom: 12 }}>Memory Usage with Events</div>
                      {(timelineData?.memory ?? []).length === 0 ? (
                        <div style={{ height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', color: theme.text.secondary, fontSize: 13 }}>No data available</div>
                      ) : (
                        <ResponsiveContainer width="100%" height={220}>
                          <ComposedChart data={(timelineData?.memory ?? []).map((d: any) => ({ ...d, value: d.value / (1024 * 1024) }))}>
                            <CartesianGrid strokeDasharray="3 3" stroke={theme.main.cardBorder} />
                            <XAxis dataKey="timestamp" tickFormatter={(ts) => new Date(ts * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} tick={{ fontSize: 10, fill: theme.text.secondary }} stroke={theme.main.cardBorder} />
                            <YAxis tickFormatter={(v) => `${v.toFixed(0)} MB`} tick={{ fontSize: 10, fill: theme.text.secondary }} stroke={theme.main.cardBorder} width={60} />
                            <Tooltip contentStyle={{ background: theme.main.card, border: `1px solid ${theme.main.cardBorder}`, borderRadius: 6, fontSize: 12 }} labelFormatter={(ts) => new Date(Number(ts) * 1000).toLocaleString()} formatter={(value: number) => [`${value.toFixed(0)} MB`, 'Memory']} />
                            <Line type="monotone" dataKey="value" stroke={theme.status.running} strokeWidth={1.5} dot={false} />
                            {(timelineData?.events ?? []).map((event: any, i: number) => (
                              <ReferenceLine key={i} x={new Date(event.timestamp).getTime() / 1000} stroke={event.type === 'Warning' ? theme.status.migrating : theme.status.running} strokeDasharray="3 3" strokeWidth={1} />
                            ))}
                          </ComposedChart>
                        </ResponsiveContainer>
                      )}
                    </div>

                    {/* Event timeline */}
                    <div className="card" style={{ padding: 16, marginTop: 16 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: theme.text.heading, marginBottom: 12 }}>Events Timeline</div>
                      {(timelineData?.events ?? []).length === 0 ? (
                        <div style={{ padding: 20, textAlign: 'center', color: theme.text.secondary, fontSize: 13 }}>No events in this time range</div>
                      ) : (
                        <div style={{ position: 'relative', paddingLeft: 24 }}>
                          {/* Vertical line */}
                          <div style={{ position: 'absolute', left: 7, top: 0, bottom: 0, width: 2, background: theme.main.cardBorder }} />
                          {(timelineData?.events ?? []).map((event: any, i: number) => {
                            const isStateChange = timelineData?.state_changes?.some((sc: any) => sc.timestamp === event.timestamp)
                            return (
                              <div key={i} style={{ position: 'relative', paddingBottom: 16, display: 'flex', gap: 12 }}>
                                {/* Dot */}
                                <div style={{
                                  position: 'absolute',
                                  left: -20,
                                  top: 4,
                                  width: 12,
                                  height: 12,
                                  borderRadius: '50%',
                                  background: event.type === 'Warning' ? theme.status.migrating : theme.status.running,
                                  border: `2px solid ${theme.main.card}`,
                                  zIndex: 1,
                                }} />
                                <div style={{ flex: 1 }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <span style={{ fontSize: 11, color: theme.text.dim, fontFamily: theme.typography.mono.fontFamily }}>{new Date(event.timestamp).toLocaleTimeString()}</span>
                                    <span style={{ fontSize: 12, fontWeight: 600, color: theme.text.primary }}>{event.reason}</span>
                                    {isStateChange && (
                                      <span style={{ fontSize: 10, fontWeight: 600, padding: '1px 6px', borderRadius: 3, background: `${theme.accent}15`, color: theme.accent, border: `1px solid ${theme.accent}40` }}>State Change</span>
                                    )}
                                    <span style={{ fontSize: 10, padding: '1px 5px', borderRadius: 3, background: event.type === 'Warning' ? `${theme.status.migrating}15` : `${theme.status.running}15`, color: event.type === 'Warning' ? theme.status.migrating : theme.status.running, border: `1px solid ${event.type === 'Warning' ? theme.status.migrating : theme.status.running}30` }}>{event.type}</span>
                                  </div>
                                  <div style={{ fontSize: 12, color: theme.text.secondary, marginTop: 2 }}>{event.message}</div>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Disks */}
            {activeTab === 'disks' && (
              <div className="card">
                {/* Add disk toolbar */}
                <div
                  style={{
                    padding: '16px 20px',
                    borderBottom: `1px solid ${theme.main.tableRowBorder}`,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    flexWrap: 'wrap',
                  }}
                >
                  {!showAddDisk ? (
                    <button
                      onClick={() => setShowAddDisk(true)}
                      style={{
                        background: theme.accent,
                        color: theme.button.primaryText,
                        border: 'none',
                        borderRadius: theme.radius.md,
                        padding: '6px 14px',
                        fontSize: 12,
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                        fontWeight: 500,
                      }}
                    >
                      Add Disk
                    </button>
                  ) : (
                    <>
                      <input
                        type="text"
                        placeholder="Disk name"
                        value={newDisk.name}
                        onChange={(e) => setNewDisk({ ...newDisk, name: e.target.value })}
                        style={{
                          background: theme.main.inputBg,
                          border: `1px solid ${theme.main.inputBorder}`,
                          borderRadius: theme.radius.md,
                          padding: '6px 12px',
                          fontSize: 13,
                          color: theme.text.primary,
                          fontFamily: 'inherit',
                          outline: 'none',
                          minWidth: 140,
                        }}
                      />
                      <input
                        type="text"
                        placeholder="PVC name"
                        value={newDisk.pvc_name}
                        onChange={(e) => setNewDisk({ ...newDisk, pvc_name: e.target.value })}
                        style={{
                          background: theme.main.inputBg,
                          border: `1px solid ${theme.main.inputBorder}`,
                          borderRadius: theme.radius.md,
                          padding: '6px 12px',
                          fontSize: 13,
                          color: theme.text.primary,
                          fontFamily: 'inherit',
                          outline: 'none',
                          minWidth: 140,
                        }}
                      />
                      <select
                        value={newDisk.bus}
                        onChange={(e) => setNewDisk({ ...newDisk, bus: e.target.value })}
                        style={{
                          background: theme.main.inputBg,
                          border: `1px solid ${theme.main.inputBorder}`,
                          borderRadius: theme.radius.md,
                          padding: '6px 8px',
                          fontSize: 13,
                          color: theme.text.primary,
                          fontFamily: 'inherit',
                          cursor: 'pointer',
                        }}
                      >
                        {['scsi', 'virtio', 'sata'].map((b) => (
                          <option key={b} value={b}>{b}</option>
                        ))}
                      </select>
                      <button
                        onClick={() => {
                          if (!newDisk.name.trim() || !newDisk.pvc_name.trim() || !namespace || !name) return
                          addVolume.mutate(
                            { namespace, vmName: name, name: newDisk.name.trim(), pvcName: newDisk.pvc_name.trim(), bus: newDisk.bus },
                            {
                              onSuccess: () => {
                                setNewDisk({ name: '', pvc_name: '', bus: 'scsi' })
                                setShowAddDisk(false)
                              },
                            }
                          )
                        }}
                        disabled={addVolume.isPending}
                        style={{
                          background: theme.accent,
                          color: theme.button.primaryText,
                          border: 'none',
                          borderRadius: theme.radius.md,
                          padding: '6px 14px',
                          fontSize: 12,
                          cursor: addVolume.isPending ? 'not-allowed' : 'pointer',
                          fontFamily: 'inherit',
                          fontWeight: 500,
                          opacity: addVolume.isPending ? 0.7 : 1,
                        }}
                      >
                        {addVolume.isPending ? 'Attaching...' : 'Attach'}
                      </button>
                      <button
                        onClick={() => {
                          setShowAddDisk(false)
                          setNewDisk({ name: '', pvc_name: '', bus: 'scsi' })
                        }}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: theme.text.secondary,
                          cursor: 'pointer',
                          fontSize: 12,
                          fontFamily: 'inherit',
                        }}
                      >
                        Cancel
                      </button>
                    </>
                  )}
                  <span style={{ fontSize: 11, color: theme.text.dim, marginLeft: 8 }}>
                    Hotplug is only available on running VMs
                  </span>
                </div>

                {/* Disks table */}
                {vm.disks?.length ? (
                  <table className="table">
                    <thead>
                      <tr className="table-header">
                        {['Name', 'Size', 'Bus', 'Actions'].map((col) => (
                          <th key={col} className="table-header-cell">
                            {col}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {vm.disks.map((disk: any) => (
                        <tr key={disk.name} className="table-row">
                          <td className="table-cell" style={{ fontWeight: 500 }}>
                            {disk.volume_name ? (
                              <Link to={`/storage/${namespace}/${disk.volume_name}`} style={{ color: theme.accent, textDecoration: 'none' }}>
                                {disk.name}
                              </Link>
                            ) : (
                              <span style={{ color: theme.text.primary }}>{disk.name}</span>
                            )}
                            {disk.volume_name && disk.volume_name !== disk.name && (
                              <div style={{ fontSize: 11, color: theme.text.secondary, marginTop: 1 }}>{disk.volume_name}</div>
                            )}
                          </td>
                          <td className="table-cell" style={{ color: theme.text.secondary }}>
                            {disk.size_gb ? `${disk.size_gb} GB` : '—'}
                          </td>
                          <td className="table-cell" style={{ color: theme.text.secondary }}>
                            {disk.bus ?? '—'}
                          </td>
                          <td className="table-cell">
                            {vm.status === 'Running' && (
                              <button
                                onClick={() => {
                                  if (!namespace || !name) return
                                  setConfirmAction({
                                    title: 'Remove Disk',
                                    message: `Remove disk "${disk.name}" from VM "${name}"?`,
                                    danger: true,
                                    confirmLabel: 'Remove',
                                    onConfirm: () => {
                                      removeVolume.mutate(
                                        { namespace, vmName: name, volName: disk.name },
                                        {
                                          onSuccess: () => toast.success('Disk removed'),
                                          onError: () => toast.error('Failed to remove disk'),
                                        },
                                      )
                                      setConfirmAction(null)
                                    },
                                  })
                                }}
                                disabled={removeVolume.isPending}
                                style={{
                                  background: 'rgba(239,68,68,0.08)',
                                  color: theme.status.error,
                                  border: `1px solid rgba(239,68,68,0.3)`,
                                  borderRadius: theme.radius.md,
                                  padding: '3px 8px',
                                  fontSize: 11,
                                  cursor: removeVolume.isPending ? 'not-allowed' : 'pointer',
                                  fontFamily: 'inherit',
                                  fontWeight: 500,
                                }}
                              >
                                Remove
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div className="empty-text">
                    No disks found for this VM.
                  </div>
                )}
              </div>
            )}

            {/* Network */}
            {activeTab === 'network' && (
              <div className="card">
                {/* Add interface toolbar */}
                <div
                  style={{
                    padding: '16px 20px',
                    borderBottom: `1px solid ${theme.main.tableRowBorder}`,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    flexWrap: 'wrap',
                  }}
                >
                  {!showAddNic ? (
                    <button
                      onClick={() => setShowAddNic(true)}
                      style={{
                        background: theme.accent,
                        color: theme.button.primaryText,
                        border: 'none',
                        borderRadius: theme.radius.md,
                        padding: '6px 14px',
                        fontSize: 12,
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                        fontWeight: 500,
                      }}
                    >
                      Add Interface
                    </button>
                  ) : (
                    <>
                      <input
                        type="text"
                        placeholder="Interface name"
                        value={newNic.name}
                        onChange={(e) => setNewNic({ ...newNic, name: e.target.value })}
                        style={{
                          background: theme.main.inputBg,
                          border: `1px solid ${theme.main.inputBorder}`,
                          borderRadius: theme.radius.md,
                          padding: '6px 12px',
                          fontSize: 13,
                          color: theme.text.primary,
                          fontFamily: 'inherit',
                          outline: 'none',
                          minWidth: 140,
                        }}
                      />
                      <input
                        type="text"
                        placeholder="Network Attachment Definition"
                        value={newNic.nad_name}
                        onChange={(e) => setNewNic({ ...newNic, nad_name: e.target.value })}
                        style={{
                          background: theme.main.inputBg,
                          border: `1px solid ${theme.main.inputBorder}`,
                          borderRadius: theme.radius.md,
                          padding: '6px 12px',
                          fontSize: 13,
                          color: theme.text.primary,
                          fontFamily: 'inherit',
                          outline: 'none',
                          minWidth: 200,
                        }}
                      />
                      <button
                        onClick={() => {
                          if (!newNic.name.trim() || !newNic.nad_name.trim() || !namespace || !name) return
                          addInterface.mutate(
                            { namespace, vmName: name, name: newNic.name.trim(), nadName: newNic.nad_name.trim() },
                            {
                              onSuccess: () => {
                                setNewNic({ name: '', nad_name: '' })
                                setShowAddNic(false)
                              },
                            }
                          )
                        }}
                        disabled={addInterface.isPending}
                        style={{
                          background: theme.accent,
                          color: theme.button.primaryText,
                          border: 'none',
                          borderRadius: theme.radius.md,
                          padding: '6px 14px',
                          fontSize: 12,
                          cursor: addInterface.isPending ? 'not-allowed' : 'pointer',
                          fontFamily: 'inherit',
                          fontWeight: 500,
                          opacity: addInterface.isPending ? 0.7 : 1,
                        }}
                      >
                        {addInterface.isPending ? 'Attaching...' : 'Attach'}
                      </button>
                      <button
                        onClick={() => {
                          setShowAddNic(false)
                          setNewNic({ name: '', nad_name: '' })
                        }}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: theme.text.secondary,
                          cursor: 'pointer',
                          fontSize: 12,
                          fontFamily: 'inherit',
                        }}
                      >
                        Cancel
                      </button>
                    </>
                  )}
                  <span style={{ fontSize: 11, color: theme.text.dim, marginLeft: 8 }}>
                    Hotplug is only available on running VMs
                  </span>
                </div>

                {/* Network table */}
                {vm.networks?.length ? (
                  <table className="table">
                    <thead>
                      <tr className="table-header">
                        {['Name', 'Network', 'IP', 'MAC', 'Actions'].map((col) => (
                          <th key={col} className="table-header-cell">
                            {col}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {vm.networks.map((net: any) => (
                        <tr key={net.name} className="table-row">
                          <td className="table-cell" style={{ color: theme.text.primary, fontWeight: 500 }}>
                            {net.name}
                          </td>
                          <td className="table-cell" style={{ color: theme.text.secondary }}>
                            {net.network_profile ?? '—'}
                          </td>
                          <td className="table-cell" style={{ color: theme.text.secondary, fontFamily: "'JetBrains Mono', monospace", fontSize: 12 }}>
                            {net.ip_address ?? '—'}
                          </td>
                          <td className="table-cell" style={{ color: theme.text.secondary, fontFamily: "'JetBrains Mono', monospace", fontSize: 12 }}>
                            {net.mac_address ?? '—'}
                          </td>
                          <td className="table-cell">
                            {vm.status === 'Running' && (
                              <button
                                onClick={() => {
                                  if (!namespace || !name) return
                                  setConfirmAction({
                                    title: 'Remove Interface',
                                    message: `Remove interface "${net.name}" from VM "${name}"?`,
                                    danger: true,
                                    confirmLabel: 'Remove',
                                    onConfirm: () => {
                                      removeInterface.mutate(
                                        { namespace, vmName: name, ifaceName: net.name },
                                        {
                                          onSuccess: () => toast.success('Interface removed'),
                                          onError: () => toast.error('Failed to remove interface'),
                                        },
                                      )
                                      setConfirmAction(null)
                                    },
                                  })
                                }}
                                disabled={removeInterface.isPending}
                                style={{
                                  background: 'rgba(239,68,68,0.08)',
                                  color: theme.status.error,
                                  border: `1px solid rgba(239,68,68,0.3)`,
                                  borderRadius: theme.radius.md,
                                  padding: '3px 8px',
                                  fontSize: 11,
                                  cursor: removeInterface.isPending ? 'not-allowed' : 'pointer',
                                  fontFamily: 'inherit',
                                  fontWeight: 500,
                                }}
                              >
                                Remove
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div className="empty-text">
                    No network interfaces found for this VM.
                  </div>
                )}
              </div>
            )}

            {/* Snapshots */}
            {activeTab === 'snapshots' && (
              <div className="card">
                {/* Create snapshot form */}
                <div
                  style={{
                    padding: '16px 20px',
                    borderBottom: `1px solid ${theme.main.tableRowBorder}`,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    flexWrap: 'wrap',
                  }}
                >
                  <input
                    type="text"
                    placeholder="Snapshot name"
                    value={snapshotName}
                    onChange={(e) => {
                      setSnapshotName(e.target.value)
                      setSnapshotError(null)
                    }}
                    style={{
                      background: theme.main.inputBg,
                      border: `1px solid ${theme.main.inputBorder}`,
                      borderRadius: theme.radius.md,
                      padding: '6px 12px',
                      fontSize: 13,
                      color: theme.text.primary,
                      fontFamily: 'inherit',
                      outline: 'none',
                      minWidth: 200,
                    }}
                  />
                  <button
                    onClick={() => {
                      if (!snapshotName.trim()) {
                        setSnapshotError('Snapshot name is required')
                        return
                      }
                      if (!namespace || !name) return
                      setSnapshotError(null)
                      createSnapshot.mutate(
                        { namespace, vmName: name, snapshotName: snapshotName.trim() },
                        {
                          onSuccess: () => setSnapshotName(''),
                          onError: (err: any) => setSnapshotError(err?.message ?? 'Failed to create snapshot'),
                        }
                      )
                    }}
                    disabled={createSnapshot.isPending}
                    style={{
                      background: theme.accent,
                      color: theme.button.primaryText,
                      border: 'none',
                      borderRadius: theme.radius.md,
                      padding: '6px 14px',
                      fontSize: 12,
                      cursor: createSnapshot.isPending ? 'not-allowed' : 'pointer',
                      fontFamily: 'inherit',
                      fontWeight: 500,
                      opacity: createSnapshot.isPending ? 0.7 : 1,
                    }}
                  >
                    {createSnapshot.isPending ? 'Creating...' : 'Take Snapshot'}
                  </button>
                  {snapshotError && (
                    <span style={{ fontSize: 12, color: theme.status.error }}>{snapshotError}</span>
                  )}
                  {snapshotName.trim() && namespace && name && (
                    <div style={{ width: '100%' }}>
                      <YamlPreview
                        endpoint={`/clusters/${activeCluster}/namespaces/${namespace}/snapshots/preview`}
                        payload={{ name: snapshotName.trim(), vm_name: name }}
                      />
                    </div>
                  )}
                </div>

                {/* Snapshots table */}
                {snapshots.length > 0 ? (
                  <table className="table">
                    <thead>
                      <tr className="table-header">
                        {['Name', 'Phase', 'Ready', 'Created', 'Actions'].map((col) => (
                          <th key={col} className="table-header-cell">
                            {col}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {snapshots.map((snap: any) => {
                        const phaseColors: Record<string, { bg: string; color: string }> = {
                          Succeeded: { bg: '#ecfdf5', color: '#16a34a' },
                          InProgress: { bg: '#eff6ff', color: '#2563eb' },
                          Pending: { bg: '#eff6ff', color: '#2563eb' },
                          Failed: { bg: '#fef2f2', color: '#dc2626' },
                          Unknown: { bg: '#f4f4f5', color: '#71717a' },
                        }
                        const pc = phaseColors[snap.phase] ?? phaseColors.Unknown
                        return (
                          <tr key={snap.name} className="table-row">
                            <td className="table-cell" style={{ color: theme.text.primary, fontWeight: 500 }}>
                              {snap.name}
                            </td>
                            <td className="table-cell">
                              <span
                                style={{
                                  display: 'inline-block',
                                  padding: '2px 8px',
                                  borderRadius: 10,
                                  fontSize: 11,
                                  fontWeight: 500,
                                  background: pc.bg,
                                  color: pc.color,
                                }}
                              >
                                {snap.phase}
                              </span>
                            </td>
                            <td className="table-cell">
                              {snap.ready_to_use ? (
                                <span style={{ color: theme.status.running, fontSize: 14 }}>&#10003;</span>
                              ) : (
                                <span style={{ color: theme.text.dim, fontSize: 14 }}>&#10005;</span>
                              )}
                            </td>
                            <td className="table-cell" style={{ color: theme.text.secondary, fontSize: 12, whiteSpace: 'nowrap' }}>
                              {snap.creation_time
                                ? new Date(snap.creation_time).toLocaleString()
                                : snap.created_at
                                  ? new Date(snap.created_at).toLocaleString()
                                  : '—'}
                            </td>
                            <td className="table-cell">
                              <div style={{ display: 'flex', gap: 6 }}>
                                {snap.ready_to_use && (
                                  <button
                                    onClick={() => {
                                      if (!namespace || !name) return
                                      setConfirmAction({
                                        title: 'Restore Snapshot',
                                        message: `Restore VM "${name}" from snapshot "${snap.name}"? The VM will be stopped, reverted to this snapshot state, and restarted.`,
                                        confirmLabel: 'Restore',
                                        onConfirm: () => {
                                          restoreSnapshot.mutate(
                                            { namespace, vmName: name, snapshotName: snap.name },
                                            {
                                              onSuccess: () => toast.success('Snapshot restored — VM restarting'),
                                              onError: (err: unknown) => {
                                                const msg = (err as { message?: string }).message ?? 'Restore failed'
                                                setSnapshotError(msg)
                                                toast.error(msg)
                                              },
                                            },
                                          )
                                          setConfirmAction(null)
                                        },
                                      })
                                    }}
                                    disabled={restoreSnapshot.isPending}
                                    style={{
                                      background: theme.main.card,
                                      color: theme.accent,
                                      border: `1px solid ${theme.main.inputBorder}`,
                                      borderRadius: theme.radius.md,
                                      padding: '3px 8px',
                                      fontSize: 11,
                                      cursor: restoreSnapshot.isPending ? 'not-allowed' : 'pointer',
                                      fontFamily: 'inherit',
                                      fontWeight: 500,
                                    }}
                                  >
                                    {restoreSnapshot.isPending ? 'Restoring…' : 'Restore'}
                                  </button>
                                )}
                                <button
                                  onClick={() => {
                                    if (!namespace) return
                                    setConfirmAction({
                                      title: 'Delete Snapshot',
                                      message: `Delete snapshot "${snap.name}"? This action cannot be undone.`,
                                      danger: true,
                                      confirmLabel: 'Delete',
                                      onConfirm: () => {
                                        deleteSnapshot.mutate(
                                          { namespace, name: snap.name },
                                          {
                                            onSuccess: () => toast.success('Snapshot deleted'),
                                            onError: () => toast.error('Failed to delete snapshot'),
                                          },
                                        )
                                        setConfirmAction(null)
                                      },
                                    })
                                  }}
                                  disabled={deleteSnapshot.isPending}
                                  style={{
                                    background: 'rgba(239,68,68,0.08)',
                                    color: theme.status.error,
                                    border: `1px solid rgba(239,68,68,0.3)`,
                                    borderRadius: theme.radius.md,
                                    padding: '3px 8px',
                                    fontSize: 11,
                                    cursor: deleteSnapshot.isPending ? 'not-allowed' : 'pointer',
                                    fontFamily: 'inherit',
                                    fontWeight: 500,
                                  }}
                                >
                                  Delete
                                </button>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                ) : (
                  <div className="empty-text">
                    No snapshots found for this VM.
                  </div>
                )}
              </div>
            )}

            {/* Events */}
            {activeTab === 'events' && (() => {
              const eventsData = liveEvents ?? vm.events ?? []
              return (
                <div className="card">
                  {eventsData.length > 0 ? (
                    <table className="table">
                      <thead>
                        <tr className="table-header">
                          {['Time', 'Type', 'Source', 'Reason', 'Message'].map((col) => (
                            <th key={col} className="table-header-cell">
                              {col}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {eventsData.map((evt: any, i: number) => (
                          <tr key={i} className="table-row">
                            <td className="table-cell" style={{ color: theme.text.secondary, fontSize: 12, whiteSpace: 'nowrap' }}>
                              {evt.timestamp}
                            </td>
                            <td className="table-cell">
                              <span
                                style={{
                                  color: evt.type === 'Warning' ? theme.status.migrating : theme.status.running,
                                  fontSize: 12,
                                  fontWeight: 500,
                                }}
                              >
                                {evt.type}
                              </span>
                            </td>
                            <td className="table-cell" style={{ color: theme.text.secondary, fontSize: 12, whiteSpace: 'nowrap' }}>
                              {evt.source && (
                                <span style={{
                                  display: 'inline-block',
                                  padding: '2px 6px',
                                  borderRadius: 4,
                                  fontSize: 11,
                                  fontWeight: 500,
                                  background: evt.source === 'DataVolume' ? `${theme.status.provisioning}1a` : `${theme.accent}1a`,
                                  color: evt.source === 'DataVolume' ? theme.status.provisioning : theme.accent,
                                  border: `1px solid ${evt.source === 'DataVolume' ? theme.status.provisioning : theme.accent}40`,
                                }}>
                                  {evt.source}
                                </span>
                              )}
                            </td>
                            <td className="table-cell" style={{ color: theme.text.secondary }}>{evt.reason}</td>
                            <td className="table-cell" style={{ color: theme.text.primary }}>{evt.message}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <div className="empty-text">
                      No events found for this VM.
                    </div>
                  )}
                </div>
              )
            })()}

            {/* YAML */}
            {activeTab === 'yaml' && (
              <YamlViewer resources={[
                ...(vm.raw_manifest ? [{ label: vm.name, kind: 'VirtualMachine', data: vm.raw_manifest }] : []),
                ...(vm.raw_vmi_manifest ? [{ label: `${vm.name} (instance)`, kind: 'VirtualMachineInstance', data: vm.raw_vmi_manifest }] : []),
                ...(!vm.raw_manifest ? [{ label: vm.name, kind: 'VM', data: vm }] : []),
              ]} />
            )}
          </>
        )}
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

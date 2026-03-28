import { useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import apiClient from '@/lib/api-client'
import { useUIStore } from '@/stores/ui-store'
import { useVMAction } from '@/hooks/useVMs'
import { useSnapshots, useCreateSnapshot, useDeleteSnapshot, useRestoreSnapshot } from '@/hooks/useSnapshots'
import { useMigrations, useCreateMigration, useCancelMigration } from '@/hooks/useMigrations'
import { useAddVolume, useRemoveVolume, useAddInterface, useRemoveInterface } from '@/hooks/useHotplug'
import { theme } from '@/lib/theme'
import { useVMMetrics } from '@/hooks/useMetrics'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

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

type Tab = 'overview' | 'metrics' | 'disks' | 'network' | 'snapshots' | 'events' | 'yaml'

function InfoRow({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        padding: '10px 0',
        borderBottom: `1px solid ${theme.main.tableRowBorder}`,
        gap: 16,
      }}
    >
      <span style={{ minWidth: 160, fontSize: 12, color: theme.text.secondary, fontWeight: 500, flexShrink: 0 }}>{label}</span>
      <span
        style={{
          fontSize: 14,
          fontWeight: 500,
          color: theme.text.primary,
          fontFamily: mono ? "'JetBrains Mono', 'Fira Code', 'Consolas', monospace" : 'inherit',
        }}
      >
        {value ?? '—'}
      </span>
    </div>
  )
}

function MetricChart({ title, data, color, formatValue }: { title: string; data: any[]; color: string; formatValue: (v: number) => string }) {
  return (
    <div style={{
      background: theme.main.card,
      border: `1px solid ${theme.main.cardBorder}`,
      borderRadius: theme.radius.lg,
      padding: 16,
    }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: theme.text.heading, marginBottom: 12 }}>{title}</div>
      {data.length === 0 ? (
        <div style={{ height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', color: theme.text.secondary, fontSize: 13 }}>
          No data available
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke={theme.main.cardBorder} />
            <XAxis
              dataKey="timestamp"
              tickFormatter={(ts) => new Date(ts * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              tick={{ fontSize: 10, fill: theme.text.secondary }}
              stroke={theme.main.cardBorder}
            />
            <YAxis
              tickFormatter={(v) => formatValue(v)}
              tick={{ fontSize: 10, fill: theme.text.secondary }}
              stroke={theme.main.cardBorder}
              width={50}
            />
            <Tooltip
              contentStyle={{ background: theme.main.card, border: `1px solid ${theme.main.cardBorder}`, borderRadius: 6, fontSize: 12 }}
              labelFormatter={(ts) => new Date(Number(ts) * 1000).toLocaleString()}
              formatter={(value: number) => [formatValue(value), '']}
            />
            <Line type="monotone" dataKey="value" stroke={color} strokeWidth={1.5} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}

export function VMDetailPage() {
  const { namespace, name } = useParams<{ namespace: string; name: string }>()
  const navigate = useNavigate()
  const { activeCluster } = useUIStore()
  const vmAction = useVMAction()
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState<Tab>('overview')
  const [editingRunStrategy, setEditingRunStrategy] = useState(false)
  const [metricsRange, setMetricsRange] = useState('1h')
  const { data: metricsData, isLoading: metricsLoading } = useVMMetrics(namespace!, name!, metricsRange)

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
      if (!window.confirm(`Delete VM "${name}"?`)) return
      apiClient.delete(`/clusters/${activeCluster}/namespaces/${namespace}/vms/${name}`)
        .then(() => navigate('/vms'))
      return
    }
    if (action === 'console') {
      navigate(`/vms/${namespace}/${name}/console`)
      return
    }
    vmAction.mutate({ namespace, name, action })
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'metrics', label: 'Metrics' },
    { id: 'disks', label: 'Disks' },
    { id: 'network', label: 'Network' },
    { id: 'snapshots', label: 'Snapshots' },
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
        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
          {[
            { label: vm?.status === 'Running' ? 'Stop' : 'Start', action: vm?.status === 'Running' ? 'stop' : 'start' },
            { label: 'Restart', action: 'restart' },
            { label: 'Console', action: 'console' },
            { label: 'Delete', action: 'delete', danger: true },
          ].map((btn) => (
            <button
              key={btn.action}
              onClick={() => handleAction(btn.action)}
              style={{
                background: btn.danger ? 'rgba(239,68,68,0.08)' : theme.main.card,
                color: btn.danger ? theme.status.error : theme.text.primary,
                border: `1px solid ${btn.danger ? 'rgba(239,68,68,0.3)' : theme.main.inputBorder}`,
                borderRadius: theme.radius.md,
                padding: '6px 12px',
                fontSize: 12,
                cursor: 'pointer',
                fontFamily: 'inherit',
                fontWeight: 500,
              }}
            >
              {btn.label}
            </button>
          ))}
          <button
            onClick={() => {
              const newName = window.prompt('New VM name:', `${name}-clone`)
              if (newName && namespace && name) {
                cloneMutation.mutate(newName)
              }
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
                if (!window.confirm(`Force stop VM "${name}"? This will immediately halt the VM.`)) return
                forceStopMutation.mutate()
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
        </div>
      </div>

      {/* Tabs */}
      <div
        style={{
          display: 'flex',
          gap: 0,
          background: theme.main.card,
          borderBottom: `1px solid ${theme.main.cardBorder}`,
          padding: '0 24px',
          flexShrink: 0,
        }}
      >
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              background: 'transparent',
              border: 'none',
              borderBottom: activeTab === tab.id ? `2px solid ${theme.accent}` : '2px solid transparent',
              color: activeTab === tab.id ? theme.text.primary : theme.text.secondary,
              cursor: 'pointer',
              padding: '10px 16px',
              fontSize: 13,
              fontWeight: activeTab === tab.id ? 600 : 400,
              fontFamily: 'inherit',
              marginBottom: -1,
              transition: 'color 0.12s',
              textTransform: activeTab === tab.id ? 'uppercase' : 'none',
              letterSpacing: activeTab === tab.id ? '0.05em' : 'normal',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
        {isLoading ? (
          <div style={{ color: theme.text.secondary, fontSize: 13 }}>Loading VM details...</div>
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

                <div
                  style={{
                    background: theme.main.card,
                    border: `1px solid ${theme.main.cardBorder}`,
                    borderRadius: theme.radius.lg,
                    padding: '4px 20px',
                  }}
                >
                <InfoRow label="Namespace" value={namespace} />
                <InfoRow label="Status" value={<StatusBadge status={vm.status} />} />
                <InfoRow label="CPU Cores" value={`${vm.cpu ?? '—'} vCPU`} />
                <InfoRow label="Memory" value={vm.memory} />
                <InfoRow label="Node" value={vm.node} mono />
                <InfoRow label="IP Addresses" value={
                  vm.ip_addresses?.length
                    ? vm.ip_addresses.join(', ')
                    : vm.ip ?? '—'
                } mono />
                <InfoRow label="OS Type" value={vm.os_type ?? vm.os} />
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
                <InfoRow label="Creation Time" value={vm.created_at ?? vm.creation_timestamp} />
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
              </>
            )}

            {/* Metrics */}
            {activeTab === 'metrics' && (
              <div>
                {/* Time range selector */}
                <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                  {['1h', '6h', '24h', '7d'].map((r) => (
                    <button
                      key={r}
                      onClick={() => setMetricsRange(r)}
                      style={{
                        padding: '5px 12px',
                        fontSize: 12,
                        fontFamily: 'inherit',
                        borderRadius: theme.radius.md,
                        cursor: 'pointer',
                        background: metricsRange === r ? theme.accent : theme.main.card,
                        color: metricsRange === r ? '#fff' : theme.text.primary,
                        border: metricsRange === r ? `1px solid ${theme.accent}` : `1px solid ${theme.main.inputBorder}`,
                        fontWeight: metricsRange === r ? 600 : 400,
                      }}
                    >
                      {r}
                    </button>
                  ))}
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
              </div>
            )}

            {/* Disks */}
            {activeTab === 'disks' && (
              <div
                style={{
                  background: theme.main.card,
                  border: `1px solid ${theme.main.cardBorder}`,
                  borderRadius: theme.radius.lg,
                }}
              >
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
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ background: theme.main.tableHeaderBg, borderBottom: `1px solid ${theme.main.tableRowBorder}` }}>
                        {['Name', 'Size', 'Bus', 'Actions'].map((col) => (
                          <th
                            key={col}
                            style={{
                              padding: '10px 16px',
                              textAlign: 'left',
                              color: theme.text.secondary,
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
                      {vm.disks.map((disk: any) => (
                        <tr key={disk.name} style={{ borderBottom: `1px solid ${theme.main.tableRowBorder}` }}>
                          <td style={{ padding: '10px 16px', color: theme.text.primary, fontWeight: 500 }}>
                            {disk.name}
                          </td>
                          <td style={{ padding: '10px 16px', color: theme.text.secondary }}>
                            {disk.size_gb ? `${disk.size_gb} GB` : '—'}
                          </td>
                          <td style={{ padding: '10px 16px', color: theme.text.secondary }}>
                            {disk.bus ?? '—'}
                          </td>
                          <td style={{ padding: '10px 16px' }}>
                            {vm.status === 'Running' && (
                              <button
                                onClick={() => {
                                  if (!namespace || !name) return
                                  if (!window.confirm(`Remove disk "${disk.name}" from VM "${name}"?`)) return
                                  removeVolume.mutate({ namespace, vmName: name, volName: disk.name })
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
                  <div style={{ padding: 40, textAlign: 'center', color: theme.text.secondary, fontSize: 13 }}>
                    No disks found for this VM.
                  </div>
                )}
              </div>
            )}

            {/* Network */}
            {activeTab === 'network' && (
              <div
                style={{
                  background: theme.main.card,
                  border: `1px solid ${theme.main.cardBorder}`,
                  borderRadius: theme.radius.lg,
                }}
              >
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
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ background: theme.main.tableHeaderBg, borderBottom: `1px solid ${theme.main.tableRowBorder}` }}>
                        {['Name', 'Network', 'IP', 'MAC', 'Actions'].map((col) => (
                          <th
                            key={col}
                            style={{
                              padding: '10px 16px',
                              textAlign: 'left',
                              color: theme.text.secondary,
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
                      {vm.networks.map((net: any) => (
                        <tr key={net.name} style={{ borderBottom: `1px solid ${theme.main.tableRowBorder}` }}>
                          <td style={{ padding: '10px 16px', color: theme.text.primary, fontWeight: 500 }}>
                            {net.name}
                          </td>
                          <td style={{ padding: '10px 16px', color: theme.text.secondary }}>
                            {net.network_profile ?? '—'}
                          </td>
                          <td style={{ padding: '10px 16px', color: theme.text.secondary, fontFamily: "'JetBrains Mono', monospace", fontSize: 12 }}>
                            {net.ip_address ?? '—'}
                          </td>
                          <td style={{ padding: '10px 16px', color: theme.text.secondary, fontFamily: "'JetBrains Mono', monospace", fontSize: 12 }}>
                            {net.mac_address ?? '—'}
                          </td>
                          <td style={{ padding: '10px 16px' }}>
                            {vm.status === 'Running' && (
                              <button
                                onClick={() => {
                                  if (!namespace || !name) return
                                  if (!window.confirm(`Remove interface "${net.name}" from VM "${name}"?`)) return
                                  removeInterface.mutate({ namespace, vmName: name, ifaceName: net.name })
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
                  <div style={{ padding: 40, textAlign: 'center', color: theme.text.secondary, fontSize: 13 }}>
                    No network interfaces found for this VM.
                  </div>
                )}
              </div>
            )}

            {/* Snapshots */}
            {activeTab === 'snapshots' && (
              <div
                style={{
                  background: theme.main.card,
                  border: `1px solid ${theme.main.cardBorder}`,
                  borderRadius: theme.radius.lg,
                }}
              >
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
                </div>

                {/* Snapshots table */}
                {snapshots.length > 0 ? (
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ background: theme.main.tableHeaderBg, borderBottom: `1px solid ${theme.main.tableRowBorder}` }}>
                        {['Name', 'Phase', 'Ready', 'Created', 'Actions'].map((col) => (
                          <th
                            key={col}
                            style={{
                              padding: '10px 16px',
                              textAlign: 'left',
                              color: theme.text.secondary,
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
                          <tr key={snap.name} style={{ borderBottom: `1px solid ${theme.main.tableRowBorder}` }}>
                            <td style={{ padding: '10px 16px', color: theme.text.primary, fontWeight: 500 }}>
                              {snap.name}
                            </td>
                            <td style={{ padding: '10px 16px' }}>
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
                            <td style={{ padding: '10px 16px' }}>
                              {snap.ready_to_use ? (
                                <span style={{ color: theme.status.running, fontSize: 14 }}>&#10003;</span>
                              ) : (
                                <span style={{ color: theme.text.dim, fontSize: 14 }}>&#10005;</span>
                              )}
                            </td>
                            <td style={{ padding: '10px 16px', color: theme.text.secondary, fontSize: 12, whiteSpace: 'nowrap' }}>
                              {snap.creation_time
                                ? new Date(snap.creation_time).toLocaleString()
                                : snap.created_at
                                  ? new Date(snap.created_at).toLocaleString()
                                  : '—'}
                            </td>
                            <td style={{ padding: '10px 16px' }}>
                              <div style={{ display: 'flex', gap: 6 }}>
                                {snap.ready_to_use && (
                                  <button
                                    onClick={() => {
                                      if (!namespace || !name) return
                                      if (!window.confirm(`Restore VM "${name}" from snapshot "${snap.name}"?`)) return
                                      restoreSnapshot.mutate(
                                        { namespace, vmName: name, snapshotName: snap.name },
                                        { onError: (err: unknown) => { setSnapshotError((err as { message?: string }).message ?? 'Restore failed') } },
                                      )
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
                                    Restore
                                  </button>
                                )}
                                <button
                                  onClick={() => {
                                    if (!namespace) return
                                    if (!window.confirm(`Delete snapshot "${snap.name}"?`)) return
                                    deleteSnapshot.mutate({ namespace, name: snap.name })
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
                  <div style={{ padding: 40, textAlign: 'center', color: theme.text.secondary, fontSize: 13 }}>
                    No snapshots found for this VM.
                  </div>
                )}
              </div>
            )}

            {/* Events */}
            {activeTab === 'events' && (
              <div
                style={{
                  background: theme.main.card,
                  border: `1px solid ${theme.main.cardBorder}`,
                  borderRadius: theme.radius.lg,
                }}
              >
                {vm.events?.length ? (
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ background: theme.main.tableHeaderBg, borderBottom: `1px solid ${theme.main.tableRowBorder}` }}>
                        {['Time', 'Type', 'Reason', 'Message'].map((col) => (
                          <th
                            key={col}
                            style={{
                              padding: '10px 16px',
                              textAlign: 'left',
                              color: theme.text.secondary,
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
                      {vm.events.map((evt: { timestamp: string; type: string; reason: string; message: string }, i: number) => (
                        <tr key={i} style={{ borderBottom: `1px solid ${theme.main.tableRowBorder}` }}>
                          <td style={{ padding: '10px 16px', color: theme.text.secondary, fontSize: 12, whiteSpace: 'nowrap' }}>
                            {evt.timestamp}
                          </td>
                          <td style={{ padding: '10px 16px' }}>
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
                          <td style={{ padding: '10px 16px', color: theme.text.secondary }}>{evt.reason}</td>
                          <td style={{ padding: '10px 16px', color: theme.text.primary }}>{evt.message}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div style={{ padding: 40, textAlign: 'center', color: theme.text.secondary, fontSize: 13 }}>
                    No events found for this VM.
                  </div>
                )}
              </div>
            )}

            {/* YAML */}
            {activeTab === 'yaml' && (
              <pre
                style={{
                  background: theme.main.card,
                  border: `1px solid ${theme.main.cardBorder}`,
                  borderRadius: theme.radius.lg,
                  padding: 20,
                  fontSize: 12,
                  fontFamily: 'monospace',
                  color: theme.text.primary,
                  overflow: 'auto',
                  margin: 0,
                  lineHeight: 1.6,
                }}
              >
                {JSON.stringify(vm, null, 2)}
              </pre>
            )}
          </>
        )}
      </div>
    </div>
  )
}

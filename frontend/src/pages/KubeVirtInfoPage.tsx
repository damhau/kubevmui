import { useState } from 'react'
import { theme } from '@/lib/theme'
import { useKubeVirtInfo } from '@/hooks/useKubeVirtInfo'
import { InfoRow } from '@/components/ui/InfoRow'
import { Badge } from '@/components/ui/Badge'
import { CardSkeleton } from '@/components/ui/Skeleton'

type Tab = 'overview' | 'conditions' | 'components' | 'features'

function conditionVariant(type: string, status: string) {
  if (type === 'Available' && status === 'True') return 'success' as const
  if (type === 'Degraded' && status === 'True') return 'error' as const
  if (type === 'Progressing' && status === 'True') return 'warning' as const
  if (type === 'Created' && status === 'True') return 'success' as const
  if (status === 'False') return 'neutral' as const
  return 'info' as const
}

function phaseVariant(phase: string) {
  if (phase === 'Deployed') return 'success' as const
  if (phase === 'Deploying') return 'warning' as const
  if (phase === 'Deleting') return 'error' as const
  return 'info' as const
}

export function KubeVirtInfoPage() {
  const { data: info, isLoading } = useKubeVirtInfo()
  const [activeTab, setActiveTab] = useState<Tab>('overview')

  const tabs: { id: Tab; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'conditions', label: 'Conditions' },
    { id: 'components', label: 'Components' },
    { id: 'features', label: 'Feature Gates' },
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
          gap: 14,
          flexShrink: 0,
        }}
      >
        <h1
          style={{
            margin: 0,
            fontSize: 20,
            fontWeight: 700,
            fontFamily: theme.typography.heading.fontFamily,
            color: theme.text.heading,
          }}
        >
          KubeVirt
        </h1>
        {info && (
          <>
            <Badge label={info.phase} variant={phaseVariant(info.phase)} size="md" />
            <span
              style={{
                fontSize: 13,
                fontFamily: theme.typography.mono.fontFamily,
                color: theme.text.secondary,
              }}
            >
              {info.operator_version}
            </span>
          </>
        )}
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
            className={`tab-button${activeTab === tab.id ? ' active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="page-content">
        <div style={{ maxWidth: theme.layout.contentMaxWidth, margin: '0 auto', width: '100%' }}>
          {isLoading ? (
            <CardSkeleton height={300} />
          ) : !info ? (
            <div
              className="card-padded"
              style={{ textAlign: 'center', color: theme.text.secondary, padding: 40 }}
            >
              KubeVirt CR not found on this cluster.
            </div>
          ) : (
            <div style={{ animation: 'fadeInUp 0.35s ease-out both' }}>
              {activeTab === 'overview' && <OverviewTab info={info} />}
              {activeTab === 'conditions' && <ConditionsTab info={info} />}
              {activeTab === 'components' && <ComponentsTab info={info} />}
              {activeTab === 'features' && <FeaturesTab info={info} />}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function OverviewTab({ info }: { info: NonNullable<ReturnType<typeof useKubeVirtInfo>['data']> }) {
  const upgradeInProgress = info.observed_version !== info.target_version

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
      {/* General info */}
      <div className="card-padded">
        <div
          style={{
            fontSize: 14,
            fontWeight: 600,
            color: theme.text.heading,
            fontFamily: theme.typography.heading.fontFamily,
            marginBottom: 12,
          }}
        >
          General
        </div>
        <InfoRow label="Phase" value={<Badge label={info.phase} variant={phaseVariant(info.phase)} />} />
        <InfoRow label="Operator Version" value={info.operator_version} mono />
        <InfoRow label="Observed Version" value={info.observed_version} mono />
        {upgradeInProgress && (
          <InfoRow
            label="Target Version"
            value={
              <span style={{ color: theme.status.migrating, fontFamily: theme.typography.mono.fontFamily }}>
                {info.target_version}
              </span>
            }
          />
        )}
        <InfoRow label="Registry" value={info.registry} mono />
        <InfoRow label="Architecture" value={info.default_architecture} mono />
        {info.infra_replicas != null && (
          <InfoRow label="Infra Replicas" value={info.infra_replicas} mono />
        )}
        {info.created_at && (
          <InfoRow label="Created" value={new Date(info.created_at).toLocaleString()} />
        )}
      </div>

      {/* Status summary */}
      <div className="card-padded">
        <div
          style={{
            fontSize: 14,
            fontWeight: 600,
            color: theme.text.heading,
            fontFamily: theme.typography.heading.fontFamily,
            marginBottom: 12,
          }}
        >
          Status
        </div>
        {info.conditions.map((c) => (
          <InfoRow
            key={c.type}
            label={c.type}
            value={<Badge label={c.status === 'True' ? 'Yes' : 'No'} variant={conditionVariant(c.type, c.status)} />}
          />
        ))}
        <InfoRow
          label="Outdated Workloads"
          value={
            info.outdated_workloads > 0 ? (
              <Badge label={String(info.outdated_workloads)} variant="warning" />
            ) : (
              <Badge label="0" variant="success" />
            )
          }
        />

        {info.feature_gates.length > 0 && (
          <>
            <div
              style={{
                fontSize: 11,
                fontWeight: 500,
                color: theme.text.secondary,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                marginTop: 16,
                marginBottom: 8,
              }}
            >
              Feature Gates
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {info.feature_gates.map((fg) => (
                <Badge key={fg} label={fg} variant="accent" />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function ConditionsTab({ info }: { info: NonNullable<ReturnType<typeof useKubeVirtInfo>['data']> }) {
  return (
    <div className="card">
      <table className="table">
        <thead>
          <tr className="table-header">
            {['Type', 'Status', 'Reason', 'Message', 'Last Transition'].map((col) => (
              <th key={col} className="table-header-cell">
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {info.conditions.map((c, i) => (
            <tr
              key={c.type}
              className="table-row"
              style={{
                animation: 'fadeInRow 0.3s ease-out both',
                animationDelay: `${0.1 + i * 0.04}s`,
              }}
            >
              <td className="table-cell" style={{ fontWeight: 500, color: theme.text.primary }}>
                {c.type}
              </td>
              <td className="table-cell">
                <Badge
                  label={c.status}
                  variant={conditionVariant(c.type, c.status)}
                />
              </td>
              <td
                className="table-cell"
                style={{ fontFamily: theme.typography.mono.fontFamily, fontSize: 12, color: theme.text.secondary }}
              >
                {c.reason || '—'}
              </td>
              <td className="table-cell" style={{ color: theme.text.secondary, maxWidth: 400 }}>
                {c.message || '—'}
              </td>
              <td
                className="table-cell"
                style={{ fontSize: 12, color: theme.text.dim, whiteSpace: 'nowrap' }}
              >
                {c.last_transition_time ? new Date(c.last_transition_time).toLocaleString() : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ComponentsTab({ info }: { info: NonNullable<ReturnType<typeof useKubeVirtInfo>['data']> }) {
  return (
    <div className="card">
      <table className="table">
        <thead>
          <tr className="table-header">
            {['Name', 'Resource Type', 'Namespace'].map((col) => (
              <th key={col} className="table-header-cell">
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {info.components.map((c, i) => (
            <tr
              key={c.name}
              className="table-row"
              style={{
                animation: 'fadeInRow 0.3s ease-out both',
                animationDelay: `${0.1 + i * 0.04}s`,
              }}
            >
              <td className="table-cell" style={{ fontWeight: 500, color: theme.text.primary }}>
                {c.name}
              </td>
              <td className="table-cell">
                <Badge label={c.resource} variant="accent" />
              </td>
              <td
                className="table-cell"
                style={{ fontFamily: theme.typography.mono.fontFamily, color: theme.text.secondary }}
              >
                {c.namespace || '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function maturityVariant(maturity: string) {
  if (maturity === 'GA') return 'success' as const
  if (maturity === 'Beta') return 'info' as const
  if (maturity === 'Alpha') return 'warning' as const
  if (maturity === 'Deprecated') return 'neutral' as const
  if (maturity === 'Discontinued') return 'error' as const
  return 'neutral' as const
}

function FeaturesTab({ info }: { info: NonNullable<ReturnType<typeof useKubeVirtInfo>['data']> }) {
  const gates = info.all_feature_gates.length > 0
    ? info.all_feature_gates
    : info.feature_gates.map((fg) => ({ name: fg, description: '', maturity: '', enabled: true }))

  // Sort: enabled first, then alphabetical
  const sorted = [...gates].sort((a, b) => {
    if (a.enabled !== b.enabled) return a.enabled ? -1 : 1
    return a.name.localeCompare(b.name)
  })

  return (
    <div className="card">
      <table className="table">
        <thead>
          <tr className="table-header">
            <th className="table-header-cell">Feature Gate</th>
            <th className="table-header-cell">Description</th>
            <th className="table-header-cell">Maturity</th>
            <th className="table-header-cell">Status</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((fg, i) => (
            <tr
              key={fg.name}
              className="table-row"
              style={{
                animation: 'fadeInRow 0.3s ease-out both',
                animationDelay: `${0.1 + Math.min(i, 15) * 0.03}s`,
                opacity: fg.enabled ? 1 : 0.6,
              }}
            >
              <td className="table-cell" style={{ fontWeight: 500, color: theme.text.primary, whiteSpace: 'nowrap' }}>
                {fg.name}
              </td>
              <td className="table-cell" style={{ color: theme.text.secondary, fontSize: 12, maxWidth: 420 }}>
                {fg.description || '—'}
              </td>
              <td className="table-cell">
                {fg.maturity ? <Badge label={fg.maturity} variant={maturityVariant(fg.maturity)} /> : '—'}
              </td>
              <td className="table-cell">
                <Badge label={fg.enabled ? 'Enabled' : 'Disabled'} variant={fg.enabled ? 'success' : 'neutral'} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

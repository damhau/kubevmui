import { useState, useMemo } from 'react'
import { TopBar } from '@/components/layout/TopBar'
import {
  useCatalogEntries,
  useCatalogStatus,
  useProvisionCatalog,
} from '@/hooks/useCatalog'
import type { CatalogEntry, CatalogTemplate } from '@/hooks/useCatalog'
import { useStorageClasses } from '@/hooks/useImages'
import { useUIStore } from '@/stores/ui-store'
import { theme } from '@/lib/theme'
import { Modal } from '@/components/ui/Modal'
import { toast } from '@/components/ui/Toast'
import { EmptyState } from '@/components/ui/EmptyState'
import { TableSkeleton } from '@/components/ui/Skeleton'
import { Package, Download, CheckCircle, Loader, AlertCircle } from 'lucide-react'

/* ── Distro icon map ─────────────────────────────────────────── */

const DISTRO_COLORS: Record<string, string> = {
  ubuntu: '#E95420',
  debian: '#A80030',
  fedora: '#51A2DA',
  centos: '#932279',
  rocky: '#10B981',
  almalinux: '#0F4266',
  alpine: '#0D597F',
}

function DistroIcon({ icon, size = 40 }: { icon: string; size?: number }) {
  const color = DISTRO_COLORS[icon] || theme.accent
  const letter = icon ? icon[0].toUpperCase() : '?'
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: theme.radius.md,
        background: `${color}20`,
        border: `1px solid ${color}40`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color,
        fontSize: size * 0.45,
        fontWeight: 700,
        flexShrink: 0,
      }}
    >
      {letter}
    </div>
  )
}

/* ── Status badge ────────────────────────────────────────────── */

function StatusBadge({ entryName, namespace }: { entryName: string; namespace: string }) {
  const { data: status } = useCatalogStatus(entryName, namespace)

  if (!status || namespace === '_all') {
    return (
      <span style={{ fontSize: 11, color: theme.text.secondary }}>Select a namespace</span>
    )
  }

  if (!status.provisioned) {
    return (
      <span
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 4,
          fontSize: 11, color: theme.text.dim,
        }}
      >
        <Download size={12} /> Not provisioned
      </span>
    )
  }

  const phase = status.image?.phase || ''
  if (phase === 'Succeeded') {
    return (
      <span
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 4,
          fontSize: 11, color: theme.status.running, fontWeight: 500,
        }}
      >
        <CheckCircle size={12} /> Ready
      </span>
    )
  }

  if (phase === 'Failed') {
    return (
      <span
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 4,
          fontSize: 11, color: theme.status.error, fontWeight: 500,
        }}
      >
        <AlertCircle size={12} /> Failed
      </span>
    )
  }

  const progress = status.image?.progress || ''
  return (
    <span
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        fontSize: 11, color: theme.status.provisioning, fontWeight: 500,
      }}
    >
      <Loader size={12} style={{ animation: 'spin 1s linear infinite' }} />
      Importing {progress}
    </span>
  )
}

/* ── Size chip ───────────────────────────────────────────────── */

function SizeChips({ templates }: { templates: CatalogTemplate[] }) {
  return (
    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
      {templates.map((t) => (
        <span
          key={t.name}
          title={t.display_name}
          style={{
            fontSize: 10,
            fontWeight: 600,
            padding: '1px 6px',
            borderRadius: theme.radius.sm,
            background: theme.accentLight,
            color: theme.accent,
            border: `1px solid rgba(99,102,241,0.2)`,
            textTransform: 'uppercase',
          }}
        >
          {t.name[0].toUpperCase()}
        </span>
      ))}
    </div>
  )
}

/* ── Provision wizard ────────────────────────────────────────── */

interface WizardState {
  step: number
  namespace: string
  storageClass: string
  imageSizeGb: number
  selectedTemplates: Record<string, boolean>
  templateOverrides: Record<string, { cpuCores: number; memoryMb: number; diskSizeGb: number }>
}

function ProvisionWizard({
  entry,
  namespace,
  onClose,
}: {
  entry: CatalogEntry
  namespace: string
  onClose: () => void
}) {
  const { data: storageClasses } = useStorageClasses()
  const provision = useProvisionCatalog()

  const [state, setState] = useState<WizardState>(() => {
    const selectedTemplates: Record<string, boolean> = {}
    const templateOverrides: Record<string, { cpuCores: number; memoryMb: number; diskSizeGb: number }> = {}
    for (const t of entry.templates) {
      selectedTemplates[t.name] = true
      templateOverrides[t.name] = {
        cpuCores: t.cpu_cores,
        memoryMb: t.memory_mb,
        diskSizeGb: t.disk_size_gb || entry.image.default_size_gb,
      }
    }
    return {
      step: 1,
      namespace,
      storageClass: '',
      imageSizeGb: entry.image.default_size_gb,
      selectedTemplates,
      templateOverrides,
    }
  })

  const selectedVariants = Object.entries(state.selectedTemplates)
    .filter(([, v]) => v)
    .map(([k]) => k)

  const handleProvision = () => {
    provision.mutate(
      {
        name: entry.name,
        body: {
          namespace: state.namespace,
          storage_class: state.storageClass,
          templates: selectedVariants,
        },
      },
      {
        onSuccess: (data) => {
          toast.success(
            `Provisioned ${entry.display_name}: 1 image + ${data.template_names.length} templates`
          )
          onClose()
        },
        onError: (err: any) => {
          toast.error(err?.response?.data?.detail || 'Provisioning failed')
        },
      }
    )
  }

  const scItems: { name: string }[] = storageClasses?.items || []

  return (
    <Modal
      open={true}
      title={`Provision ${entry.display_name}`}
      onClose={onClose}
      maxWidth={540}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Step indicator */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          {[1, 2, 3].map((s) => (
            <div
              key={s}
              style={{
                flex: 1, height: 3, borderRadius: 2,
                background: s <= state.step ? theme.accent : theme.main.cardBorder,
                transition: 'background 0.2s',
              }}
            />
          ))}
        </div>

        {/* Step 1: Image config */}
        {state.step === 1 && (
          <>
            <div style={{ fontSize: 13, fontWeight: 600, color: theme.text.primary }}>
              Step 1: Image Configuration
            </div>
            <label style={{ fontSize: 12, color: theme.text.secondary }}>
              Target Namespace
              <input
                type="text"
                value={state.namespace}
                onChange={(e) => setState((s) => ({ ...s, namespace: e.target.value }))}
                className="input"
                style={{ width: '100%', marginTop: 4 }}
              />
            </label>
            <label style={{ fontSize: 12, color: theme.text.secondary }}>
              Storage Class
              <select
                value={state.storageClass}
                onChange={(e) => setState((s) => ({ ...s, storageClass: e.target.value }))}
                className="input"
                style={{ width: '100%', marginTop: 4 }}
              >
                <option value="">Default</option>
                {scItems.map((sc) => (
                  <option key={sc.name} value={sc.name}>{sc.name}</option>
                ))}
              </select>
            </label>
            <label style={{ fontSize: 12, color: theme.text.secondary }}>
              Image Size (GB)
              <input
                type="number"
                value={state.imageSizeGb}
                onChange={(e) => setState((s) => ({ ...s, imageSizeGb: parseInt(e.target.value) || 1 }))}
                className="input"
                style={{ width: '100%', marginTop: 4 }}
                min={1}
              />
            </label>
          </>
        )}

        {/* Step 2: Template selection */}
        {state.step === 2 && (
          <>
            <div style={{ fontSize: 13, fontWeight: 600, color: theme.text.primary }}>
              Step 2: Select Template Sizes
            </div>
            {entry.templates.map((t) => (
              <div
                key={t.name}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '10px 12px',
                  borderRadius: theme.radius.md,
                  border: `1px solid ${state.selectedTemplates[t.name] ? theme.accent : theme.main.cardBorder}`,
                  background: state.selectedTemplates[t.name] ? `${theme.accent}08` : 'transparent',
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
                onClick={() =>
                  setState((s) => ({
                    ...s,
                    selectedTemplates: {
                      ...s.selectedTemplates,
                      [t.name]: !s.selectedTemplates[t.name],
                    },
                  }))
                }
              >
                <input
                  type="checkbox"
                  checked={state.selectedTemplates[t.name] || false}
                  readOnly
                  style={{ accentColor: theme.accent }}
                />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: theme.text.primary }}>
                    {t.display_name}
                  </div>
                  <div style={{ fontSize: 11, color: theme.text.dim }}>
                    {t.cpu_cores} vCPU / {t.memory_mb >= 1024 ? `${t.memory_mb / 1024} GB` : `${t.memory_mb} MB`} RAM
                    / {t.disk_size_gb || entry.image.default_size_gb} GB disk
                  </div>
                </div>
              </div>
            ))}
          </>
        )}

        {/* Step 3: Confirm */}
        {state.step === 3 && (
          <>
            <div style={{ fontSize: 13, fontWeight: 600, color: theme.text.primary }}>
              Step 3: Confirm Provisioning
            </div>
            <div
              style={{
                padding: 12, borderRadius: theme.radius.md,
                background: theme.main.bg, fontSize: 12,
                display: 'flex', flexDirection: 'column', gap: 6,
              }}
            >
              <div><strong>Distribution:</strong> {entry.display_name}</div>
              <div><strong>Namespace:</strong> {state.namespace}</div>
              <div><strong>Storage Class:</strong> {state.storageClass || 'Default'}</div>
              <div><strong>Image Size:</strong> {state.imageSizeGb} GB</div>
              <div style={{ marginTop: 8 }}>
                <strong>Resources to create:</strong>
                <ul style={{ margin: '4px 0 0 16px', padding: 0 }}>
                  <li>1 Image: <code>{entry.name}</code></li>
                  {selectedVariants.map((v) => (
                    <li key={v}>Template: <code>{entry.name}-{v}</code></li>
                  ))}
                </ul>
              </div>
            </div>
          </>
        )}

        {/* Navigation buttons */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
          {state.step > 1 && (
            <button
              className="btn btn-secondary"
              onClick={() => setState((s) => ({ ...s, step: s.step - 1 }))}
            >
              Back
            </button>
          )}
          {state.step < 3 ? (
            <button
              className="btn btn-primary"
              onClick={() => setState((s) => ({ ...s, step: s.step + 1 }))}
              disabled={state.step === 2 && selectedVariants.length === 0}
            >
              Next
            </button>
          ) : (
            <button
              className="btn btn-primary"
              onClick={handleProvision}
              disabled={provision.isPending || selectedVariants.length === 0}
            >
              {provision.isPending ? 'Provisioning...' : 'Provision'}
            </button>
          )}
        </div>
      </div>
    </Modal>
  )
}

/* ── Main page ───────────────────────────────────────────────── */

export function CatalogPage() {
  const { activeNamespace } = useUIStore()
  const { data, isLoading } = useCatalogEntries()
  const [search, setSearch] = useState('')
  const [wizardEntry, setWizardEntry] = useState<CatalogEntry | null>(null)

  const entries = data?.items || []

  const filtered = useMemo(() => {
    if (!search) return entries
    const q = search.toLowerCase()
    return entries.filter(
      (e) =>
        e.display_name.toLowerCase().includes(q) ||
        e.description.toLowerCase().includes(q) ||
        e.name.toLowerCase().includes(q)
    )
  }, [entries, search])

  const ns = activeNamespace === '_all' ? '' : activeNamespace

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <TopBar title="Catalog">
        <input
          type="text"
          placeholder="Search distributions..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="input"
          style={{ width: 240 }}
        />
      </TopBar>

      <div style={{ flex: 1, overflow: 'auto', padding: 24 }}>
        {isLoading ? (
          <TableSkeleton rows={6} cols={3} />
        ) : entries.length === 0 ? (
          <EmptyState
            icon={<Package size={40} />}
            title="No catalog entries"
            description="Catalog entries will appear here once the backend seeds them on startup."
          />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<Package size={40} />}
            title="No matching distributions"
            description="Try a different search term."
          />
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
              gap: 16,
            }}
          >
            {filtered.map((entry) => (
              <div
                key={entry.name}
                onClick={() => setWizardEntry(entry)}
                style={{
                  padding: 16,
                  borderRadius: theme.radius.lg,
                  border: `1px solid ${theme.main.cardBorder}`,
                  background: theme.main.card,
                  cursor: 'pointer',
                  transition: 'border-color 0.15s, box-shadow 0.15s',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 12,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = theme.accent
                  e.currentTarget.style.boxShadow = `0 0 0 1px ${theme.accent}40`
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = theme.main.cardBorder
                  e.currentTarget.style.boxShadow = 'none'
                }}
              >
                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <DistroIcon icon={entry.icon} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 14, fontWeight: 600, color: theme.text.primary,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}
                    >
                      {entry.display_name}
                    </div>
                    <div
                      style={{
                        fontSize: 12, color: theme.text.dim, marginTop: 2,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}
                    >
                      {entry.description}
                    </div>
                  </div>
                </div>

                {/* Footer */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <SizeChips templates={entry.templates} />
                  <StatusBadge entryName={entry.name} namespace={ns} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Provision wizard modal */}
      {wizardEntry && (
        <ProvisionWizard
          entry={wizardEntry}
          namespace={ns || 'default'}
          onClose={() => setWizardEntry(null)}
        />
      )}
    </div>
  )
}

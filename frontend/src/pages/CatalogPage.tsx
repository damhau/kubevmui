import { useState, useMemo } from 'react'
import { TopBar } from '@/components/layout/TopBar'
import {
  useCatalogEntries,
  useCatalogStatus,
  useProvisionCatalog,
} from '@/hooks/useCatalog'
import type { CatalogEntry } from '@/hooks/useCatalog'
import { useStorageClasses } from '@/hooks/useImages'
import { useUIStore } from '@/stores/ui-store'
import { theme } from '@/lib/theme'
import { Modal } from '@/components/ui/Modal'
import { extractErrorMessage } from '@/lib/api-client'
import { toast } from '@/components/ui/Toast'
import { EmptyState } from '@/components/ui/EmptyState'
import { TableSkeleton } from '@/components/ui/Skeleton'
import { Package, Download, CheckCircle, Loader, AlertCircle } from 'lucide-react'

import ubuntuLogo from '@/assets/distros/ubuntu.svg'
import debianLogo from '@/assets/distros/debian.svg'
import fedoraLogo from '@/assets/distros/fedora.svg'
import centosLogo from '@/assets/distros/centos.svg'
import rockyLogo from '@/assets/distros/rocky.svg'
import almalinuxLogo from '@/assets/distros/almalinux.svg'
import alpineLogo from '@/assets/distros/alpine.svg'

/* ── Distro icon map ─────────────────────────────────────────── */

const DISTRO_LOGOS: Record<string, string> = {
  ubuntu: ubuntuLogo,
  debian: debianLogo,
  fedora: fedoraLogo,
  centos: centosLogo,
  rocky: rockyLogo,
  almalinux: almalinuxLogo,
  alpine: alpineLogo,
}

function DistroIcon({ icon, size = 36 }: { icon: string; size?: number }) {
  const logo = DISTRO_LOGOS[icon]
  if (logo) {
    return (
      <img
        src={logo}
        alt={icon}
        style={{
          width: size,
          height: size,
          flexShrink: 0,
        }}
      />
    )
  }
  const letter = icon ? icon[0].toUpperCase() : '?'
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: theme.radius.md,
        background: theme.accentLight,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: theme.accent,
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

/* ── Size chip (removed — templates shown in wizard step 2) ─── */

/* ── Provision wizard ────────────────────────────────────────── */

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: theme.main.inputBg,
  border: `1px solid ${theme.main.inputBorder}`,
  borderRadius: theme.radius.md,
  color: theme.text.primary,
  fontSize: 13,
  padding: '8px 12px',
  outline: 'none',
  fontFamily: 'inherit',
  boxSizing: 'border-box',
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 12,
  color: theme.text.secondary,
  marginBottom: 6,
  fontWeight: 500,
}

const primaryBtnStyle: React.CSSProperties = {
  background: theme.button.primary,
  color: theme.button.primaryText,
  border: 'none',
  borderRadius: theme.radius.md,
  padding: '7px 16px',
  fontSize: 13,
  fontWeight: 500,
  cursor: 'pointer',
  fontFamily: 'inherit',
}

const secondaryBtnStyle: React.CSSProperties = {
  background: theme.button.secondary,
  border: `1px solid ${theme.button.secondaryBorder}`,
  color: theme.button.secondaryText,
  borderRadius: theme.radius.md,
  padding: '7px 16px',
  fontSize: 13,
  cursor: 'pointer',
  fontFamily: 'inherit',
}

const textareaStyle: React.CSSProperties = {
  ...inputStyle,
  minHeight: 120,
  resize: 'vertical',
  fontFamily: theme.typography.mono.fontFamily,
  fontSize: 12,
}

const TOTAL_STEPS = 4

interface WizardState {
  step: number
  namespace: string
  storageClass: string
  imageSizeGb: number
  selectedTemplates: Record<string, boolean>
  templateOverrides: Record<string, { cpuCores: number; memoryMb: number; diskSizeGb: number }>
  cloudInitUserData: string
  isGlobal: boolean
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
      cloudInitUserData: entry.cloud_init_user_data || '',
      isGlobal: false,
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
          is_global: state.isGlobal,
        },
      },
      {
        onSuccess: (data) => {
          toast.success(
            `Provisioned ${entry.display_name}: 1 image + ${data.template_names.length} templates`
          )
          onClose()
        },
        onError: (err: unknown) => {
          toast.error(extractErrorMessage(err, 'Provisioning failed'))
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
          {Array.from({ length: TOTAL_STEPS }, (_, i) => i + 1).map((s) => (
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
            <div>
              <label style={labelStyle}>Target Namespace</label>
              <input
                type="text"
                value={state.namespace}
                onChange={(e) => setState((s) => ({ ...s, namespace: e.target.value }))}
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Storage Class</label>
              <select
                value={state.storageClass}
                onChange={(e) => setState((s) => ({ ...s, storageClass: e.target.value }))}
                style={inputStyle}
              >
                <option value="">Default</option>
                {scItems.map((sc) => (
                  <option key={sc.name} value={sc.name}>{sc.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Image Size (GB)</label>
              <input
                type="number"
                value={state.imageSizeGb}
                onChange={(e) => setState((s) => ({ ...s, imageSizeGb: parseInt(e.target.value) || 1 }))}
                style={inputStyle}
                min={1}
              />
            </div>
            <div
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 12px', borderRadius: theme.radius.md,
                border: `1px solid ${theme.main.cardBorder}`,
                cursor: 'pointer',
              }}
              onClick={() => setState((s) => ({ ...s, isGlobal: !s.isGlobal }))}
            >
              <input
                type="checkbox"
                checked={state.isGlobal}
                readOnly
                style={{ accentColor: theme.accent }}
              />
              <div>
                <div style={{ fontSize: 13, fontWeight: 500, color: theme.text.primary }}>
                  Global resources
                </div>
                <div style={{ fontSize: 11, color: theme.text.dim }}>
                  Make image and templates available across all namespaces
                </div>
              </div>
            </div>
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
                  background: state.selectedTemplates[t.name] ? theme.accentLight : 'transparent',
                  cursor: 'pointer',
                  transition: 'border-color 0.15s, background 0.15s',
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

        {/* Step 3: Cloud-Init */}
        {state.step === 3 && (
          <>
            <div style={{ fontSize: 13, fontWeight: 600, color: theme.text.primary }}>
              Step 3: Cloud-Init Configuration
            </div>
            <div style={{ fontSize: 12, color: theme.text.dim, marginBottom: 4 }}>
              Pre-filled based on {entry.display_name}. Installs and enables the QEMU guest agent by default. You can customize or leave as-is.
            </div>
            <div>
              <label style={labelStyle}>User Data (cloud-init)</label>
              <textarea
                value={state.cloudInitUserData}
                onChange={(e) => setState((s) => ({ ...s, cloudInitUserData: e.target.value }))}
                placeholder={'#cloud-config\npackages:\n  - qemu-guest-agent'}
                style={textareaStyle}
              />
            </div>
          </>
        )}

        {/* Step 4: Confirm */}
        {state.step === 4 && (
          <>
            <div style={{ fontSize: 13, fontWeight: 600, color: theme.text.primary }}>
              Step 4: Confirm Provisioning
            </div>
            <div
              style={{
                padding: 16, borderRadius: theme.radius.md,
                background: theme.main.bg,
                border: `1px solid ${theme.main.cardBorder}`,
                fontSize: 13, color: theme.text.primary,
                display: 'flex', flexDirection: 'column', gap: 8,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: theme.text.secondary }}>Distribution</span>
                <span style={{ fontWeight: 500 }}>{entry.display_name}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: theme.text.secondary }}>Namespace</span>
                <span style={{ fontWeight: 500 }}>{state.namespace}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: theme.text.secondary }}>Storage Class</span>
                <span style={{ fontWeight: 500 }}>{state.storageClass || 'Default'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: theme.text.secondary }}>Image Size</span>
                <span style={{ fontWeight: 500 }}>{state.imageSizeGb} GB</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: theme.text.secondary }}>Global</span>
                <span style={{ fontWeight: 500 }}>{state.isGlobal ? 'Yes' : 'No'}</span>
              </div>
              <div style={{ borderTop: `1px solid ${theme.main.cardBorder}`, paddingTop: 8, marginTop: 4 }}>
                <div style={{ color: theme.text.secondary, marginBottom: 6 }}>Resources to create</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{
                      fontSize: 10, fontWeight: 600, padding: '1px 6px',
                      borderRadius: theme.radius.sm, background: theme.status.provisioningBg,
                      color: theme.status.provisioning,
                    }}>IMAGE</span>
                    <code style={{ fontSize: 12, fontFamily: theme.typography.mono.fontFamily }}>{entry.name}</code>
                  </div>
                  {selectedVariants.map((v) => (
                    <div key={v} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{
                        fontSize: 10, fontWeight: 600, padding: '1px 6px',
                        borderRadius: theme.radius.sm, background: theme.accentLight,
                        color: theme.accent,
                      }}>TEMPLATE</span>
                      <code style={{ fontSize: 12, fontFamily: theme.typography.mono.fontFamily }}>{entry.name}-{v}</code>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </>
        )}

        {/* Navigation buttons */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
          {state.step > 1 && (
            <button
              style={secondaryBtnStyle}
              onClick={() => setState((s) => ({ ...s, step: s.step - 1 }))}
            >
              Back
            </button>
          )}
          {state.step < TOTAL_STEPS ? (
            <button
              style={{
                ...primaryBtnStyle,
                ...(state.step === 2 && selectedVariants.length === 0
                  ? { opacity: 0.7, cursor: 'not-allowed' } : {}),
              }}
              onClick={() => setState((s) => ({ ...s, step: s.step + 1 }))}
              disabled={state.step === 2 && selectedVariants.length === 0}
            >
              Next
            </button>
          ) : (
            <button
              style={{
                ...primaryBtnStyle,
                ...(provision.isPending || selectedVariants.length === 0
                  ? { opacity: 0.7, cursor: 'not-allowed' } : {}),
              }}
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
                  <span style={{ fontSize: 11, color: theme.text.dim }}>
                    {entry.templates.length} size{entry.templates.length !== 1 ? 's' : ''}
                  </span>
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

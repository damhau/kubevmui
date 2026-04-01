import { useState } from 'react'
import { createPortal } from 'react-dom'
import { theme } from '@/lib/theme'
import { toast } from '@/components/ui/Toast'
import { extractErrorMessage } from '@/lib/api-client'
import { useStorageClasses, useImages } from '@/hooks/useImages'
import { useDisks } from '@/hooks/useDisks'
import { useAddVolume, useAddDiskToSpec } from '@/hooks/useHotplug'

interface AddDiskWizardProps {
  open: boolean
  onClose: () => void
  namespace: string
  vmName: string
  vmStatus: string
  existingDiskCount: number
  activeCluster: string
}

type SourceType = 'blank' | 'existing' | 'clone' | 'container_disk'

interface DiskConfig {
  name: string
  bus: string
  sourceType: SourceType
  diskType: 'disk' | 'cdrom'
  sizeGb: number
  storageClass: string
  pvcName: string
  imageName: string
  imageNamespace: string
  containerDiskImage: string
}

const STEPS = [
  { id: 1, label: 'Source' },
  { id: 2, label: 'Configure' },
  { id: 3, label: 'Review' },
]

function inputStyle(extra?: React.CSSProperties): React.CSSProperties {
  return {
    width: '100%',
    background: theme.main.inputBg,
    border: `1px solid ${theme.main.inputBorder}`,
    borderRadius: theme.radius.md,
    color: theme.text.primary,
    fontSize: 14,
    padding: '8px 12px',
    outline: 'none',
    fontFamily: 'inherit',
    boxSizing: 'border-box' as const,
    ...extra,
  }
}

function labelStyle(): React.CSSProperties {
  return {
    display: 'block',
    fontSize: 12,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
    color: theme.text.secondary,
    marginBottom: 6,
    fontWeight: 500,
  }
}

function FieldGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={labelStyle()}>{label}</label>
      {children}
    </div>
  )
}

interface RadioCardProps {
  selected: boolean
  disabled?: boolean
  onClick: () => void
  title: string
  description: string
  icon: string
}

function RadioCard({ selected, disabled, onClick, title, description, icon }: RadioCardProps) {
  return (
    <button
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 12,
        padding: '14px 16px',
        borderRadius: theme.radius.lg,
        border: selected
          ? `2px solid ${theme.accent}`
          : `1px solid ${theme.main.cardBorder}`,
        background: selected ? theme.accentLight : theme.main.card,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        textAlign: 'left',
        width: '100%',
        fontFamily: 'inherit',
        transition: 'border-color 0.15s, background 0.15s',
        marginBottom: 8,
      }}
    >
      <span style={{ fontSize: 20, lineHeight: 1, flexShrink: 0 }}>{icon}</span>
      <div>
        <div style={{ fontSize: 14, fontWeight: 600, color: theme.text.heading, marginBottom: 2 }}>
          {title}
        </div>
        <div style={{ fontSize: 12, color: theme.text.secondary }}>{description}</div>
      </div>
    </button>
  )
}

export function AddDiskWizard({
  open,
  onClose,
  namespace,
  vmName,
  vmStatus,
  existingDiskCount,
  activeCluster: _activeCluster,
}: AddDiskWizardProps) {
  const [step, setStep] = useState(1)
  const [config, setConfig] = useState<DiskConfig>({
    name: `disk-${existingDiskCount + 1}`,
    bus: 'virtio',
    sourceType: 'blank',
    diskType: 'disk',
    sizeGb: 10,
    storageClass: '',
    pvcName: '',
    imageName: '',
    imageNamespace: namespace,
    containerDiskImage: '',
  })

  const isRunning = vmStatus === 'running'

  const { data: storageClassesData } = useStorageClasses()
  const { data: disksData } = useDisks()
  const { data: imagesData } = useImages()
  const addVolume = useAddVolume()
  const addDiskToSpec = useAddDiskToSpec()

  const storageClasses: string[] = Array.isArray(storageClassesData) ? storageClassesData : []
  const pvcs: { name: string; namespace: string }[] = Array.isArray(disksData?.items)
    ? disksData.items.filter((d: any) => d.namespace === namespace)
    : []
  const images: { name: string; namespace: string; display_name?: string }[] = Array.isArray(
    imagesData?.items
  )
    ? imagesData.items
    : []

  function resetAndClose() {
    setStep(1)
    setConfig({
      name: `disk-${existingDiskCount + 1}`,
      bus: 'virtio',
      sourceType: 'blank',
      diskType: 'disk',
      sizeGb: 10,
      storageClass: '',
      pvcName: '',
      imageName: '',
      imageNamespace: namespace,
      containerDiskImage: '',
    })
    onClose()
  }

  function canProceedStep1() {
    if (isRunning && config.sourceType !== 'existing') return false
    return true
  }

  function canProceedStep2() {
    if (!config.name.trim()) return false
    if (config.sourceType === 'existing' && !config.pvcName) return false
    if (config.sourceType === 'clone' && !config.imageName) return false
    return true
  }

  function handleSubmit() {
    if (isRunning) {
      // Hotplug existing PVC only
      if (!config.pvcName) return
      addVolume.mutate(
        {
          namespace,
          vmName,
          name: config.name.trim(),
          pvcName: config.pvcName,
          bus: config.bus,
        },
        {
          onSuccess: () => {
            toast.success('Disk attached successfully')
            resetAndClose()
          },
          onError: (err) => {
            toast.error(extractErrorMessage(err, 'Failed to attach disk'))
          },
        }
      )
    } else {
      addDiskToSpec.mutate(
        {
          namespace,
          vmName,
          disk: {
            name: config.name.trim(),
            bus: config.bus,
            source_type: config.sourceType === 'container_disk' ? 'container_disk' : config.sourceType,
            disk_type: config.diskType,
            size_gb: config.sourceType !== 'existing' && config.sourceType !== 'container_disk' && config.diskType !== 'cdrom' ? config.sizeGb : undefined,
            storage_class: config.sourceType !== 'container_disk' ? config.storageClass || undefined : undefined,
            pvc_name: config.sourceType === 'existing' ? config.pvcName : undefined,
            image_name: config.sourceType === 'clone' ? config.imageName : undefined,
            image_namespace:
              config.sourceType === 'clone' ? config.imageNamespace || namespace : undefined,
            image: config.sourceType === 'container_disk' ? config.containerDiskImage : undefined,
          },
        },
        {
          onSuccess: () => {
            toast.success('Disk added to VM spec')
            resetAndClose()
          },
          onError: (err) => {
            toast.error(extractErrorMessage(err, 'Failed to add disk'))
          },
        }
      )
    }
  }

  const isPending = addVolume.isPending || addDiskToSpec.isPending

  if (!open) return null

  return createPortal(
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 50,
        display: 'flex',
        justifyContent: 'flex-end',
      }}
    >
      {/* Overlay */}
      <div
        onClick={resetAndClose}
        style={{
          position: 'absolute',
          inset: 0,
          background: theme.modal.overlay,
          backdropFilter: 'blur(4px)',
          transition: 'opacity 150ms',
        }}
      />

      {/* Panel */}
      <div
        style={{
          position: 'relative',
          width: 520,
          maxWidth: '100vw',
          height: '100%',
          background: theme.modal.bg,
          borderLeft: `1px solid ${theme.modal.border}`,
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '-4px 0 24px rgba(0,0,0,0.12)',
          animation: 'slideInRight 0.25s ease-out',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 24px',
            borderBottom: `1px solid ${theme.modal.headerBorder}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexShrink: 0,
          }}
        >
          <div>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: theme.text.heading }}>
              Add Disk
            </h2>
            <div style={{ fontSize: 12, color: theme.text.secondary, marginTop: 2 }}>
              {vmName} &middot; Step {step} of 3
            </div>
          </div>
          <button
            onClick={resetAndClose}
            style={{
              background: 'transparent',
              border: 'none',
              fontSize: 18,
              color: theme.text.secondary,
              cursor: 'pointer',
              padding: '4px 8px',
              borderRadius: theme.radius.sm,
            }}
          >
            &#10005;
          </button>
        </div>

        {/* Step indicators */}
        <div
          style={{
            display: 'flex',
            padding: '12px 24px',
            gap: 0,
            borderBottom: `1px solid ${theme.main.tableRowBorder}`,
            flexShrink: 0,
          }}
        >
          {STEPS.map((s, i) => (
            <div key={s.id} style={{ display: 'flex', alignItems: 'center', flex: i < STEPS.length - 1 ? 1 : undefined }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 12,
                    fontWeight: 600,
                    background: step > s.id ? '#22c55e' : step === s.id ? theme.accent : theme.main.tableHeaderBg,
                    color: step >= s.id ? '#fff' : theme.text.secondary,
                    border: step === s.id ? `2px solid ${theme.accent}` : '2px solid transparent',
                    flexShrink: 0,
                  }}
                >
                  {step > s.id ? '✓' : s.id}
                </div>
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: step === s.id ? 600 : 400,
                    color: step === s.id ? theme.text.heading : theme.text.secondary,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {s.label}
                </span>
              </div>
              {i < STEPS.length - 1 && (
                <div
                  style={{
                    flex: 1,
                    height: 1,
                    background: step > s.id ? '#22c55e' : theme.main.cardBorder,
                    margin: '0 8px',
                  }}
                />
              )}
            </div>
          ))}
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
          {/* Step 1: Source selection */}
          {step === 1 && (
            <div>
              {isRunning && (
                <div
                  style={{
                    padding: '10px 14px',
                    borderRadius: theme.radius.md,
                    background: '#fffbeb',
                    border: '1px solid #fde68a',
                    color: '#92400e',
                    fontSize: 13,
                    marginBottom: 16,
                  }}
                >
                  <strong>VM is running.</strong> Only existing PVC hotplug is supported by
                  KubeVirt. Stop the VM to add blank disks, clone images, or attach ISOs.
                </div>
              )}

              <div style={{ fontSize: 13, color: theme.text.secondary, marginBottom: 16 }}>
                Choose the disk source type:
              </div>

              <RadioCard
                selected={config.sourceType === 'blank' && config.diskType === 'disk'}
                disabled={isRunning}
                onClick={() => setConfig({ ...config, sourceType: 'blank', diskType: 'disk' })}
                icon="💾"
                title="New blank disk"
                description="Create a new empty DataVolume. Choose size and storage class."
              />
              <RadioCard
                selected={config.sourceType === 'existing' && config.diskType === 'disk'}
                onClick={() => setConfig({ ...config, sourceType: 'existing', diskType: 'disk' })}
                icon="📦"
                title="Existing PVC"
                description="Attach an existing PersistentVolumeClaim from this namespace."
              />
              <RadioCard
                selected={config.sourceType === 'clone' && config.diskType === 'disk'}
                disabled={isRunning}
                onClick={() => setConfig({ ...config, sourceType: 'clone', diskType: 'disk' })}
                icon="🖼️"
                title="Clone from image"
                description="Clone a DataVolume from a registered image. Choose size and storage class."
              />
              <RadioCard
                selected={config.sourceType === 'clone' && config.diskType === 'cdrom'}
                disabled={isRunning}
                onClick={() => setConfig({ ...config, sourceType: 'clone', diskType: 'cdrom', bus: 'sata' })}
                icon="💿"
                title="CD-ROM (ISO)"
                description="Mount an ISO image as a virtual CD-ROM drive. Ideal for OS installation."
              />
            </div>
          )}

          {/* Step 2: Configuration */}
          {step === 2 && (
            <div>
              <FieldGroup label="Disk name">
                <input
                  type="text"
                  value={config.name}
                  onChange={(e) => setConfig({ ...config, name: e.target.value })}
                  style={inputStyle()}
                  placeholder="e.g. data-disk"
                />
              </FieldGroup>

              <FieldGroup label="Bus type">
                <select
                  value={config.bus}
                  onChange={(e) => setConfig({ ...config, bus: e.target.value })}
                  style={inputStyle()}
                >
                  {['virtio', 'scsi', 'sata'].map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                </select>
              </FieldGroup>

              {config.sourceType === 'existing' && (
                <FieldGroup label="PVC name">
                  {pvcs.length > 0 ? (
                    <select
                      value={config.pvcName}
                      onChange={(e) => setConfig({ ...config, pvcName: e.target.value })}
                      style={inputStyle()}
                    >
                      <option value="">Select a PVC...</option>
                      {pvcs.map((pvc) => (
                        <option key={pvc.name} value={pvc.name}>
                          {pvc.name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      value={config.pvcName}
                      onChange={(e) => setConfig({ ...config, pvcName: e.target.value })}
                      style={inputStyle()}
                      placeholder="Enter PVC name"
                    />
                  )}
                </FieldGroup>
              )}

              {(config.sourceType === 'clone' || config.sourceType === 'container_disk') && (
                <>
                  <FieldGroup label={config.diskType === 'cdrom' ? 'ISO Image' : 'Source image'}>
                    {(() => {
                      const filteredImages = config.diskType === 'cdrom'
                        ? images.filter((img: any) => img.media_type === 'iso')
                        : images
                      return filteredImages.length > 0 ? (
                        <select
                          value={config.sourceType === 'container_disk' ? config.containerDiskImage : config.imageName}
                          onChange={(e) => {
                            const img = filteredImages.find((i: any) =>
                              i.source_type === 'container_disk' ? i.source_url === e.target.value : i.name === e.target.value
                            )
                            if ((img as any)?.source_type === 'container_disk') {
                              setConfig({
                                ...config,
                                sourceType: 'container_disk',
                                containerDiskImage: (img as any).source_url,
                                imageName: '',
                                imageNamespace: namespace,
                              })
                            } else {
                              setConfig({
                                ...config,
                                sourceType: 'clone',
                                imageName: e.target.value,
                                imageNamespace: img?.namespace || namespace,
                                containerDiskImage: '',
                              })
                            }
                          }}
                          style={inputStyle()}
                        >
                          <option value="">{config.diskType === 'cdrom' ? 'Select an ISO image...' : 'Select an image...'}</option>
                          {filteredImages.map((img: any) => (
                            <option key={`${img.namespace}/${img.name}`} value={img.source_type === 'container_disk' ? img.source_url : img.name}>
                              {img.display_name || img.name}{' '}
                              {img.namespace !== namespace ? `(${img.namespace})` : ''}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          type="text"
                          value={config.imageName}
                          onChange={(e) => setConfig({ ...config, imageName: e.target.value })}
                          style={inputStyle()}
                          placeholder={config.diskType === 'cdrom' ? 'Enter ISO image name' : 'Enter image name'}
                        />
                      )
                    })()}
                  </FieldGroup>
                </>
              )}

              {(config.sourceType === 'blank' || config.sourceType === 'clone') && (
                <>
                  {config.diskType !== 'cdrom' && (
                    <FieldGroup label="Size (GB)">
                      <input
                        type="number"
                        min={1}
                        value={config.sizeGb}
                        onChange={(e) =>
                          setConfig({ ...config, sizeGb: parseInt(e.target.value) || 10 })
                        }
                        style={inputStyle()}
                      />
                    </FieldGroup>
                  )}

                  <FieldGroup label="Storage class (optional)">
                    {storageClasses.length > 0 ? (
                      <select
                        value={config.storageClass}
                        onChange={(e) => setConfig({ ...config, storageClass: e.target.value })}
                        style={inputStyle()}
                      >
                        <option value="">Default</option>
                        {storageClasses.map((sc: string) => (
                          <option key={sc} value={sc}>
                            {sc}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="text"
                        value={config.storageClass}
                        onChange={(e) => setConfig({ ...config, storageClass: e.target.value })}
                        style={inputStyle()}
                        placeholder="Leave empty for default"
                      />
                    )}
                  </FieldGroup>
                </>
              )}
            </div>
          )}

          {/* Step 3: Review */}
          {step === 3 && (
            <div>
              <div style={{ fontSize: 13, color: theme.text.secondary, marginBottom: 16 }}>
                Review your disk configuration before adding it.
              </div>

              <div
                style={{
                  background: theme.main.tableHeaderBg,
                  border: `1px solid ${theme.main.cardBorder}`,
                  borderRadius: theme.radius.lg,
                  padding: 16,
                }}
              >
                {[
                  { label: 'Disk name', value: config.name },
                  { label: 'Disk type', value: config.diskType === 'cdrom' ? 'CD-ROM' : 'Data Disk' },
                  { label: 'Bus type', value: config.bus },
                  {
                    label: 'Source',
                    value:
                      config.sourceType === 'blank'
                        ? 'New blank disk'
                        : config.sourceType === 'existing'
                        ? 'Existing PVC'
                        : config.sourceType === 'container_disk'
                        ? 'Container disk'
                        : config.diskType === 'cdrom'
                        ? 'ISO image'
                        : 'Clone from image',
                  },
                  ...(config.sourceType === 'existing'
                    ? [{ label: 'PVC name', value: config.pvcName }]
                    : []),
                  ...(config.sourceType === 'clone'
                    ? [
                        { label: 'Image', value: config.imageName },
                        { label: 'Image namespace', value: config.imageNamespace || namespace },
                      ]
                    : []),
                  ...(config.sourceType === 'container_disk'
                    ? [{ label: 'Container image', value: config.containerDiskImage }]
                    : []),
                  ...(config.sourceType !== 'existing' && config.sourceType !== 'container_disk'
                    ? [{ label: 'Size', value: `${config.sizeGb} GB` }]
                    : []),
                  ...(config.storageClass && config.sourceType !== 'existing' && config.sourceType !== 'container_disk'
                    ? [{ label: 'Storage class', value: config.storageClass }]
                    : []),
                  {
                    label: 'Method',
                    value: isRunning ? 'Hotplug (live attach)' : 'Patch VM spec (requires stopped VM)',
                  },
                ].map(({ label, value }) => (
                  <div
                    key={label}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      padding: '6px 0',
                      borderBottom: `1px solid ${theme.main.tableRowBorder}`,
                      fontSize: 13,
                    }}
                  >
                    <span style={{ color: theme.text.secondary, fontWeight: 500 }}>{label}</span>
                    <span style={{ color: theme.text.primary, fontWeight: 500 }}>{value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '16px 24px',
            borderTop: `1px solid ${theme.modal.footerBorder}`,
            background: theme.modal.footerBg,
            display: 'flex',
            justifyContent: 'space-between',
            flexShrink: 0,
          }}
        >
          <button
            onClick={() => (step > 1 ? setStep(step - 1) : resetAndClose())}
            style={{
              background: theme.button.secondary,
              color: theme.button.secondaryText,
              border: `1px solid ${theme.button.secondaryBorder}`,
              borderRadius: theme.radius.md,
              padding: '8px 16px',
              fontSize: 13,
              cursor: 'pointer',
              fontFamily: 'inherit',
              fontWeight: 500,
            }}
          >
            {step === 1 ? 'Cancel' : 'Back'}
          </button>

          {step < 3 ? (
            <button
              onClick={() => setStep(step + 1)}
              disabled={step === 1 ? !canProceedStep1() : !canProceedStep2()}
              style={{
                background: theme.accent,
                color: theme.button.primaryText,
                border: 'none',
                borderRadius: theme.radius.md,
                padding: '8px 16px',
                fontSize: 13,
                cursor:
                  (step === 1 ? !canProceedStep1() : !canProceedStep2()) ? 'not-allowed' : 'pointer',
                fontFamily: 'inherit',
                fontWeight: 500,
                opacity: (step === 1 ? !canProceedStep1() : !canProceedStep2()) ? 0.6 : 1,
              }}
            >
              Next
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={isPending}
              style={{
                background: theme.accent,
                color: theme.button.primaryText,
                border: 'none',
                borderRadius: theme.radius.md,
                padding: '8px 16px',
                fontSize: 13,
                cursor: isPending ? 'not-allowed' : 'pointer',
                fontFamily: 'inherit',
                fontWeight: 500,
                opacity: isPending ? 0.7 : 1,
              }}
            >
              {isPending ? 'Adding...' : 'Add Disk'}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}

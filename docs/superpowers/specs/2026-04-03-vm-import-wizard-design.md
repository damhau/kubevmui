# VM Import Wizard — Design Spec

**Date:** 2026-04-03
**Updated:** 2026-04-08
**Status:** Draft

## Priorities

| Priority | Source Hypervisor | Rationale |
|---|---|---|
| **P1** | **Microsoft Hyper-V** | Many organizations run Hyper-V on-prem (included with Windows Server). VHD/VHDX → qcow2 conversion is well-supported by qemu-img. WinRM-based discovery is straightforward. |
| **P2** | **VMware vCenter / ESXi** | Large VMware install base. More complex API surface (pyvmomi/SOAP) but well-documented. |
| — | **OVA/OVF file upload** | Hypervisor-agnostic fallback, supported from day one for both priorities. |

## Problem

The primary audience for KubeVM UI is administrators migrating traditional VMs (Hyper-V, VMware) to KubeVirt. The biggest barrier to adoption is the migration itself — converting disk images (VHD/VHDX, VMDK) to KubeVirt-compatible formats and recreating networking/storage/configuration. Today this requires manual disk conversion, kubectl YAML authoring, and deep KubeVirt knowledge.

Red Hat offers MTV (Migration Toolkit for Virtualization) but it requires OpenShift. No standalone open-source tool exists for vanilla Kubernetes.

## Solution

A guided **VM Import Wizard** that connects to a source hypervisor (Hyper-V host or VMware vCenter/ESXi), discovers VMs, maps their resources to KubeVirt equivalents, and orchestrates the migration — all from the KubeVM UI.

## Key Decisions

- **Multi-hypervisor connectors** — Pluggable connector architecture. P1: Hyper-V via WinRM/PowerShell. P2: VMware via pyvmomi SOAP API.
- **Hyper-V integration (P1)** — Connect to a Windows Server Hyper-V host via WinRM. Discover VMs using PowerShell remoting (`Get-VM`, `Get-VHD`). Export VHD/VHDX disks via SMB share or WinRM file transfer. Read-only WinRM access is sufficient for discovery; disk export requires Hyper-V Administrator privileges.
- **vCenter API integration (P2)** — Use VMware's SOAP API (pyvmomi) to discover VMs. Read-only access is sufficient for discovery; disk export requires limited privileges.
- **Disk conversion** — VHD/VHDX (Hyper-V) and VMDKs (VMware) are converted to qcow2 and imported via CDI (Containerized Data Importer) DataVolumes. Conversion happens server-side (backend pod or a dedicated migration worker). `qemu-img` supports all source formats natively.
- **No agent required on source VMs** — Migration is agentless. Source VMs can be powered on (warm migration) or off (cold migration).
- **Cold migration first** — Phase 1 supports powered-off VMs only. Warm migration is a future enhancement.
- **OVA/OVF file import as alternative** — Users can upload OVA/OVF files directly if they don't want to connect to a hypervisor.
- **Batch migration** — Select multiple VMs and migrate them as a group with progress tracking per VM.
- **Migration plan persistence** — Migration plans are stored as a CRD (`migrationplans.kubevmui.io`) so they survive backend restarts and can be audited.

## Concept Mapping: Hyper-V → KubeVirt (P1)

| Hyper-V Concept | KubeVM UI Mapping | KubeVirt Resource |
|---|---|---|
| Virtual Machine | VM in target namespace | `VirtualMachine` |
| VHD/VHDX (disk) | Disk converted to qcow2 | `DataVolume` (CDI import) |
| Virtual Switch | Network CR mapping | `Network` CR → NAD |
| VM Storage Path | StorageClass mapping | `StorageClass` → PVC |
| Generation 1 / 2 | Firmware selection (BIOS/UEFI) | VM spec `firmware` |
| Integration Services | qemu-guest-agent (cloud-init) | cloud-init `runcmd` |
| CPU/Memory | Compute resources | VM spec `cpu`/`memory` |
| Checkpoints | Not migrated (recreate post-migration) | `VirtualMachineSnapshot` |
| ISO media | Not migrated | — |
| Fibre Channel adapters | Not migrated | — |
| RemoteFX / GPU-P | Not migrated (manual post-migration) | — |
| Pass-through disks | Not migrated (manual post-migration) | — |

## Concept Mapping: VMware → KubeVirt (P2)

| VMware Concept | KubeVM UI Mapping | KubeVirt Resource |
|---|---|---|
| Virtual Machine | VM in target namespace | `VirtualMachine` |
| VMDK (disk) | Disk converted to qcow2 | `DataVolume` (CDI import) |
| VM Network (vSwitch/dvSwitch) | Network CR mapping | `Network` CR → NAD |
| Datastore | StorageClass mapping | `StorageClass` → PVC |
| Resource Pool | Namespace mapping | Kubernetes Namespace |
| VM Template | Template CRD | `Template` CR |
| Snapshot | Not migrated (recreate post-migration) | `VirtualMachineSnapshot` |
| VM Hardware Version | Firmware selection (BIOS/UEFI) | VM spec `firmware` |
| VMware Tools | qemu-guest-agent (cloud-init) | cloud-init `runcmd` |
| CPU/Memory | Compute resources | VM spec `cpu`/`memory` |
| CD/DVD drive | Not migrated | — |
| USB devices | Not migrated | — |
| GPU passthrough | Not migrated (manual post-migration) | — |

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     KubeVM UI Frontend                      │
│                    VM Import Wizard (6 steps)                │
└──────────────────────┬──────────────────────────────────────┘
                       │ REST API
┌──────────────────────▼──────────────────────────────────────┐
│                   Backend: ImportService                     │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────────┐  │
│  │ Hyper-V      │  │ vCenter      │  │ Migration Plan    │  │
│  │ Connector    │  │ Connector    │  │ Controller        │  │
│  │ (WinRM) [P1] │  │ (pyvmomi)[P2]│  │ (orchestration)   │  │
│  └──────┬───────┘  └──────┬───────┘  └─────────┬─────────┘  │
│         │                 │                     │            │
│         │          ┌──────┴───────┐              │            │
│         │          │ OVA/OVF      │              │            │
│         │          │ Parser       │              │            │
│         │          └──────┬───────┘              │            │
│         │                 │                     │            │
│  ┌──────▼─────────────────▼─────────────────────▼─────────┐  │
│  │                  Disk Converter                         │  │
│  │  VHD/VHDX|VMDK → qcow2 (qemu-img) → CDI DV import    │  │
│  └────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
```

## CRD: `migrationplans.kubevmui.io`

**Scope:** Namespaced (migrations target a specific namespace)

**Group:** `kubevmui.io`

**Version:** `v1`

**Kind:** `MigrationPlan`

**Plural:** `migrationplans`

**Short name:** `mp`

### Spec Schema

| Field | Type | Required | Description |
|---|---|---|---|
| `displayName` | string | yes | Human-readable plan name |
| `description` | string | no | Optional description |
| `source` | object | yes | Source environment connection details |
| `source.type` | enum | yes | `hyperv`, `vcenter`, `esxi`, or `ova` |
| `source.endpoint` | string | conditional | Hyper-V/vCenter/ESXi hostname or IP (not for OVA) |
| `source.credentials` | string | conditional | K8s Secret name containing username/password |
| `source.insecureSkipVerify` | boolean | no | Skip TLS verification (default: false) |
| `source.winrmPort` | integer | no | WinRM port (default: 5986 for HTTPS, 5985 for HTTP). Hyper-V only. |
| `source.winrmTransport` | enum | no | `https` (default) or `http`. Hyper-V only. |
| `targetNamespace` | string | yes | Namespace where VMs will be created |
| `networkMappings` | array | yes | VMware network → Network CR mappings |
| `networkMappings[].source` | string | yes | VMware network name (e.g., "VM Network") |
| `networkMappings[].target` | string | yes | Network CR name |
| `storageMappings` | array | yes | VMware datastore → StorageClass mappings |
| `storageMappings[].source` | string | yes | VMware datastore name |
| `storageMappings[].target` | string | yes | K8s StorageClass name |
| `vms` | array | yes | VMs to migrate |
| `vms[].sourceVMId` | string | yes | VMware VM managed object reference ID |
| `vms[].sourceName` | string | yes | Original VM name in VMware |
| `vms[].targetName` | string | no | Target VM name (defaults to source name, sanitized) |
| `vms[].cpuCores` | integer | no | Override CPU count (default: keep source value) |
| `vms[].memoryMb` | integer | no | Override memory (default: keep source value) |
| `vms[].firmware` | enum | no | `bios` or `uefi` (default: auto-detect from source) |
| `vms[].startAfterMigration` | boolean | no | Start VM after successful migration (default: false) |
| `vms[].installGuestAgent` | boolean | no | Inject cloud-init to install qemu-guest-agent (default: true) |

### Status Schema

| Field | Type | Description |
|---|---|---|
| `phase` | enum | `Pending`, `Validating`, `InProgress`, `Completed`, `Failed`, `PartiallyCompleted` |
| `startTime` | string | Migration start timestamp |
| `completionTime` | string | Migration completion timestamp |
| `vmStatuses` | array | Per-VM migration status |
| `vmStatuses[].name` | string | Source VM name |
| `vmStatuses[].phase` | enum | `Pending`, `ExportingDisk`, `ConvertingDisk`, `ImportingDisk`, `CreatingVM`, `Completed`, `Failed` |
| `vmStatuses[].progress` | integer | 0-100 percentage |
| `vmStatuses[].diskStatuses` | array | Per-disk progress |
| `vmStatuses[].error` | string | Error message if failed |
| `vmStatuses[].startTime` | string | Per-VM start time |
| `vmStatuses[].completionTime` | string | Per-VM completion time |

### Example: Hyper-V Migration (P1)

```yaml
apiVersion: kubevmui.io/v1
kind: MigrationPlan
metadata:
  name: migrate-hyperv-web
  namespace: production
spec:
  displayName: "Migrate Web VMs from Hyper-V"
  source:
    type: hyperv
    endpoint: hyperv-host01.corp.local
    credentials: hyperv-credentials
    winrmTransport: https
    insecureSkipVerify: true
  targetNamespace: production
  networkMappings:
    - source: "Default Switch"
      target: pod-network
    - source: "Production VLAN"
      target: prod-vlan100
  storageMappings:
    - source: "C:\\Hyper-V\\Virtual Hard Disks"
      target: longhorn
  vms:
    - sourceVMId: "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
      sourceName: "web-frontend-01"
      targetName: "web-frontend-01"
      firmware: uefi    # Hyper-V Gen2
      startAfterMigration: false
      installGuestAgent: true
    - sourceVMId: "b2c3d4e5-f6a7-8901-bcde-f12345678901"
      sourceName: "web-frontend-02"
      targetName: "web-frontend-02"
      firmware: bios    # Hyper-V Gen1
      startAfterMigration: false
status:
  phase: InProgress
  startTime: "2026-04-08T10:00:00Z"
  vmStatuses:
    - name: web-frontend-01
      phase: ImportingDisk
      progress: 65
      diskStatuses:
        - name: "web-frontend-01.vhdx"
          sizeMb: 40960
          phase: Importing
          progress: 65
    - name: web-frontend-02
      phase: Pending
      progress: 0
```

### Example: VMware Migration (P2)

```yaml
apiVersion: kubevmui.io/v1
kind: MigrationPlan
metadata:
  name: migrate-web-tier
  namespace: production
spec:
  displayName: "Migrate Web Tier from vCenter"
  source:
    type: vcenter
    endpoint: vcenter.corp.local
    credentials: vcenter-credentials
    insecureSkipVerify: true
  targetNamespace: production
  networkMappings:
    - source: "VM Network"
      target: pod-network
    - source: "Production VLAN 100"
      target: prod-vlan100
  storageMappings:
    - source: "vsanDatastore"
      target: longhorn
    - source: "nfs-datastore"
      target: nfs-csi
  vms:
    - sourceVMId: "vm-1234"
      sourceName: "web-frontend-01"
      targetName: "web-frontend-01"
      startAfterMigration: false
      installGuestAgent: true
    - sourceVMId: "vm-1235"
      sourceName: "web-frontend-02"
      targetName: "web-frontend-02"
      startAfterMigration: false
status:
  phase: InProgress
  startTime: "2026-04-03T10:00:00Z"
  vmStatuses:
    - name: web-frontend-01
      phase: ImportingDisk
      progress: 65
      diskStatuses:
        - name: "Hard disk 1"
          sizeMb: 40960
          phase: Importing
          progress: 65
    - name: web-frontend-02
      phase: Pending
      progress: 0
```

## Wizard Flow (6 Steps)

### Step 1: Source Selection

**Options:**
- **Hyper-V (P1)** — Enter Windows Server hostname, username, password. Connects via WinRM (HTTPS by default). "Test Connection" validates WinRM access and Hyper-V role.
- **VMware vCenter (P2)** — Enter hostname, username, password. "Test Connection" button validates credentials and API access.
- **VMware ESXi (P2)** — Direct ESXi host connection (for smaller environments without vCenter).
- **OVA/OVF File** — Upload an OVA file or provide a URL to an OVF descriptor. No hypervisor connection needed.

For Hyper-V:
```
┌──────────────────────────────────────────────────────────────┐
│ Source Type:  ● Hyper-V  ○ vCenter  ○ ESXi  ○ OVA/OVF     │
│                                                              │
│ Hostname:    [hyperv-host01.corp.local     ]                │
│ Username:    [CORP\admin                   ]                │
│ Password:    [••••••••••••••               ]                │
│ Transport:   [HTTPS ▾]  Port: [5986]                        │
│ Skip TLS:    ☑ (self-signed cert)                           │
│                                                              │
│              [Test Connection]  ✓ Connected                  │
│              Hyper-V 10.0.20348 │ Found: 12 VMs             │
└──────────────────────────────────────────────────────────────┘
```

For vCenter/ESXi:
```
┌──────────────────────────────────────────────────────────────┐
│ Source Type:  ○ Hyper-V  ● vCenter  ○ ESXi  ○ OVA/OVF     │
│                                                              │
│ Hostname:    [vcenter.corp.local           ]                │
│ Username:    [administrator@vsphere.local  ]                │
│ Password:    [••••••••••••••               ]                │
│ Skip TLS:    ☑ (self-signed cert)                           │
│                                                              │
│              [Test Connection]  ✓ Connected                  │
│              Found: 3 datacenters, 47 VMs                   │
└──────────────────────────────────────────────────────────────┘
```

Credentials are stored as a K8s Secret (never persisted in the CRD spec itself).

### Step 2: VM Selection

Browse the vCenter inventory tree (Datacenter → Cluster → Resource Pool → VMs) and select VMs to migrate.

```
┌─────────────────────────────────────────────────────────────┐
│ ▼ Datacenter: DC-Primary                                    │
│   ▼ Cluster: Production                                     │
│     ▼ Resource Pool: Web Tier                               │
│       ☑ web-frontend-01    2 vCPU  4 GB  40 GB  Running    │
│       ☑ web-frontend-02    2 vCPU  4 GB  40 GB  Running    │
│       ☐ web-frontend-03    2 vCPU  4 GB  40 GB  Running    │
│     ▼ Resource Pool: App Tier                               │
│       ☐ app-api-01         4 vCPU  8 GB  80 GB  Running    │
│       ☐ app-api-02         4 vCPU  8 GB  80 GB  Stopped    │
│   ▼ Cluster: Development                                    │
│     ☐ dev-test-01          1 vCPU  2 GB  20 GB  Stopped    │
│                                                              │
│ Selected: 2 VMs  │  Total disk: 80 GB                       │
│                                                              │
│ ⚠ Running VMs will NOT be shut down automatically.          │
│   Power off source VMs before starting migration for         │
│   data consistency.                                          │
└─────────────────────────────────────────────────────────────┘
```

Each VM row shows:
- Name, CPU, memory, total disk size, power state
- Expandable detail: guest OS, VMware tools version, disk list, network list
- Warning icon if VM has unsupported features (GPU, USB, RDM disks)

### Step 3: Resource Mapping

Map VMware networks and datastores to KubeVirt equivalents.

```
┌─── Network Mapping ──────────────────────────────────────────┐
│                                                               │
│ VMware Network          →    KubeVM UI Network               │
│ ─────────────────────────────────────────────────            │
│ VM Network              →    [Pod Network (default)    ▾]    │
│ Production VLAN 100     →    [prod-vlan100             ▾]    │
│                                                               │
│ [+ Create New Network CR]                                    │
│                                                               │
├─── Storage Mapping ──────────────────────────────────────────┤
│                                                               │
│ VMware Datastore        →    Storage Class                   │
│ ─────────────────────────────────────────────────            │
│ vsanDatastore           →    [longhorn                 ▾]    │
│ nfs-datastore           →    [nfs-csi                  ▾]    │
│                                                               │
│ Estimated storage needed: 80 GB                              │
│ Available (longhorn):    450 GB  ✓                           │
└──────────────────────────────────────────────────────────────┘
```

- Dropdowns populated from existing Network CRs and StorageClasses
- "+ Create New Network CR" link opens the network creation flow inline
- Storage availability check against the selected StorageClass

### Step 4: VM Configuration

Per-VM settings. Table with inline editing:

```
┌──────────────────────────────────────────────────────────────┐
│ VM              │ Target Name       │ CPU │ RAM  │ Firmware  │
│─────────────────┼───────────────────┼─────┼──────┼──────────│
│ web-frontend-01 │ [web-frontend-01] │ [2] │ [4G] │ [BIOS ▾] │
│ web-frontend-02 │ [web-frontend-02] │ [2] │ [4G] │ [BIOS ▾] │
│                                                              │
│ Target Namespace: [production ▾]                             │
│                                                              │
│ Options:                                                     │
│ ☑ Install qemu-guest-agent via cloud-init                   │
│ ☐ Start VMs after migration                                 │
│ ☐ Delete source VM after successful migration               │
└──────────────────────────────────────────────────────────────┘
```

- Target names auto-sanitized (lowercase, hyphens, K8s naming rules)
- Firmware auto-detected from VMware VM config (BIOS/EFI)
- Cloud-init injection for guest agent is on by default

### Step 5: Validation & Preview

Pre-flight checks before starting migration:

```
┌─── Pre-flight Validation ────────────────────────────────────┐
│                                                               │
│ ✓ vCenter connection active                                  │
│ ✓ Source VMs accessible                                      │
│ ✓ Target namespace "production" exists                       │
│ ✓ Network CRs "pod-network", "prod-vlan100" exist           │
│ ✓ StorageClass "longhorn" exists with 450 GB available       │
│ ✓ Target VM names are unique in namespace                    │
│ ⚠ web-frontend-01 is powered ON — recommend powering off    │
│ ⚠ web-frontend-02 is powered ON — recommend powering off    │
│ ✗ Unsupported: web-frontend-01 has USB device (will skip)   │
│                                                               │
│ Resources to create:                                         │
│   2 VirtualMachines                                          │
│   2 DataVolumes (80 GB total)                                │
│   1 NAD (prod-vlan100 in production namespace)               │
│                                                               │
│ Estimated migration time: ~15 minutes                        │
│ (based on 80 GB disk at ~90 MB/s transfer)                   │
└──────────────────────────────────────────────────────────────┘
```

YAML preview tab shows the exact VirtualMachine manifests that will be created.

### Step 6: Migration Execution & Progress

Real-time progress tracking:

```
┌─── Migration Progress ──────────────────────────────────────┐
│                                                              │
│ Plan: Migrate Web Tier         Status: In Progress           │
│ Started: 10:00:00              Elapsed: 8m 23s               │
│                                                              │
│ ┌─ web-frontend-01 ──────────────────────────────────────┐  │
│ │ Phase: Importing Disk                                   │  │
│ │ ████████████████████████████░░░░░░░░░░  65%             │  │
│ │                                                         │  │
│ │ Disk 1: Hard disk 1 (40 GB)                            │  │
│ │   Export:  ✓ Complete (2m 15s)                          │  │
│ │   Convert: ✓ Complete (1m 30s)                          │  │
│ │   Import:  ████████████████████░░░░░░  65% (26 GB)     │  │
│ └─────────────────────────────────────────────────────────┘  │
│                                                              │
│ ┌─ web-frontend-02 ──────────────────────────────────────┐  │
│ │ Phase: Pending (queued)                                 │  │
│ │ ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  0%              │  │
│ └─────────────────────────────────────────────────────────┘  │
│                                                              │
│ [Cancel Migration]                                           │
└──────────────────────────────────────────────────────────────┘
```

Progress updates via polling (5s interval). Each VM shows:
- Current phase with icon
- Per-disk progress bars
- Time elapsed per phase
- Error details if failed (with retry button)

## Migration Pipeline (per VM)

```
1. Export Disk(s) from Source Hypervisor
   ├── Hyper-V: copy VHD/VHDX via SMB share or WinRM file transfer
   └── VMware: download VMDK via vCenter HTTP/NFC API
   └── Stream to temporary PVC or local storage

2. Convert Disk(s)
   ├── Hyper-V:  qemu-img convert -f vpc -O qcow2 input.vhdx output.qcow2
   └── VMware:   qemu-img convert -f vmdk -O qcow2 input.vmdk output.qcow2
   └── Runs in a migration worker pod (or backend pod)

3. Import Disk(s) via CDI
   └── Create DataVolume with source: upload or HTTP
   └── Upload qcow2 to CDI upload proxy
   └── Track DataVolume progress via CDI status

4. Create VM Manifest
   └── Map CPU, memory, firmware from source VM config
   ├── Hyper-V Gen1 → BIOS, Gen2 → UEFI
   └── Attach imported DataVolumes as disks
   └── Attach mapped Network CRs as interfaces
   └── Inject cloud-init (guest agent install)

5. Create VirtualMachine
   └── Apply manifest to target namespace
   └── Optionally start VM

6. Post-Migration Validation
   └── Check VM created successfully
   └── Check DataVolumes bound
   └── If startAfterMigration: verify VM reaches Running state
```

## Backend Architecture

### New Files

| File | Purpose |
|---|---|
| `backend/app/models/import_vm.py` | Pydantic models for migration plan, VM source, progress tracking |
| `backend/app/services/import_service.py` | Migration orchestration, plan lifecycle management |
| `backend/app/services/hyperv_connector.py` | **(P1)** Hyper-V host discovery and disk export via WinRM/PowerShell |
| `backend/app/services/vcenter_connector.py` | **(P2)** VMware vCenter/ESXi API client (pyvmomi wrapper) |
| `backend/app/services/ova_parser.py` | OVA/OVF file parsing and disk extraction |
| `backend/app/services/disk_converter.py` | VHD/VHDX/VMDK-to-qcow2 conversion (qemu-img subprocess) |
| `backend/app/api/routes/import_vm.py` | REST endpoints for migration plans |
| `kubernetes/crds/migrationplans.kubevmui.io.yaml` | MigrationPlan CRD definition |

### Dependencies

```toml
# pyproject.toml additions
dependencies = [
    # ... existing ...
    "pywinrm>=0.4",        # P1: WinRM client for Hyper-V
    "pyvmomi>=8.0",        # P2: VMware vSphere API client
]
```

`qemu-img` must be available in the backend container image (install via `apt-get install qemu-utils` in Dockerfile). It natively supports VHD/VHDX (Hyper-V) and VMDK (VMware) as source formats.

### API Endpoints

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/v1/clusters/{cluster}/import/connect` | Test vCenter/ESXi connection |
| `GET` | `/api/v1/clusters/{cluster}/import/discover` | Discover VMs from connected source |
| `GET` | `/api/v1/clusters/{cluster}/import/discover/{vm_id}` | Get detailed VM info (disks, networks, config) |
| `POST` | `/api/v1/clusters/{cluster}/import/validate` | Pre-flight validation of migration plan |
| `GET` | `/api/v1/clusters/{cluster}/namespaces/{ns}/migration-plans` | List migration plans |
| `GET` | `/api/v1/clusters/{cluster}/namespaces/{ns}/migration-plans/{name}` | Get plan with status |
| `POST` | `/api/v1/clusters/{cluster}/namespaces/{ns}/migration-plans` | Create and start migration plan |
| `DELETE` | `/api/v1/clusters/{cluster}/namespaces/{ns}/migration-plans/{name}` | Cancel/delete migration plan |
| `POST` | `/api/v1/clusters/{cluster}/namespaces/{ns}/migration-plans/{name}/retry` | Retry failed VMs in a plan |
| `POST` | `/api/v1/clusters/{cluster}/import/upload-ova` | Upload OVA file for import |

### Frontend Files

| File | Purpose |
|---|---|
| `frontend/src/pages/ImportPage.tsx` | Migration plans list page |
| `frontend/src/pages/ImportWizardPage.tsx` | 6-step import wizard |
| `frontend/src/pages/MigrationPlanDetailPage.tsx` | Plan detail with live progress |
| `frontend/src/components/import/SourceSelector.tsx` | Step 1: source type and connection |
| `frontend/src/components/import/VMSelector.tsx` | Step 2: vCenter tree browser |
| `frontend/src/components/import/ResourceMapping.tsx` | Step 3: network/storage mapping |
| `frontend/src/components/import/VMConfigurator.tsx` | Step 4: per-VM config table |
| `frontend/src/components/import/ValidationPanel.tsx` | Step 5: pre-flight checks |
| `frontend/src/components/import/MigrationProgress.tsx` | Step 6: live progress bars |
| `frontend/src/hooks/useImport.ts` | React Query hooks for import API |

### Navigation

New "Import VMs" item in the sidebar under "Main" section:

```
Main
  ├── Dashboard
  ├── Virtual Machines
  ├── Import VMs            (upload-cloud icon)  ← NEW
  ├── Console
  └── Catalog
```

## Security Considerations

- **Hypervisor credentials** stored as K8s Secrets with `type: Opaque`, referenced by Secret name in the MigrationPlan spec. Never stored in CRD directly.
- **RBAC** — import operations require cluster-admin or a dedicated `kubevmui-import` ClusterRole with permissions to create DataVolumes, VMs, and Secrets.
- **Network isolation** — the backend must be able to reach the Hyper-V host (WinRM port 5985/5986) or vCenter/ESXi endpoint. In air-gapped environments, use OVA file upload instead.
- **Disk data in transit** — VHD/VHDX transfer via WinRM HTTPS or SMB (Hyper-V). VMDK download over HTTPS (vCenter NFC). qcow2 upload to CDI over HTTPS.
- **WinRM security** — Prefer HTTPS transport (port 5986) with certificate validation. HTTP (5985) should only be used in lab/dev environments with `insecureSkipVerify: true`.

## Out of Scope (Future)

- **Warm migration** — Migrate running VMs with near-zero downtime (VMware CBT, Hyper-V Replica). Requires iterative disk sync.
- **SCVMM integration** — Connect to System Center Virtual Machine Manager for centralized Hyper-V discovery across multiple hosts.
- **Bulk migration scheduling** — Schedule migrations for maintenance windows.
- **Automatic source VM shutdown** — Optionally power off source VM after successful migration.
- **Source VM deletion** — Delete source VM from hypervisor after migration. Dangerous, requires explicit confirmation.
- **Migration from other hypervisors** — KVM/libvirt, Proxmox. Each needs its own connector.
- **P2V (Physical to Virtual)** — Convert physical servers to VMs. Out of scope.
- **Windows Sysprep integration** — Generalize Windows VMs during migration.
- **Network mapping auto-detection** — Suggest KubeVirt network mappings based on VLAN IDs matching source hypervisor virtual switches.

# VM Import Wizard — Design Spec

**Date:** 2026-04-03
**Status:** Draft

## Problem

The primary audience for KubeVM UI is VMware vCenter administrators migrating to KubeVirt. The biggest barrier to adoption is the migration itself — converting VMware VMs (VMDKs, OVAs, OVFs) to KubeVirt-compatible formats and recreating networking/storage/configuration. Today this requires manual VMDK-to-qcow2 conversion, kubectl YAML authoring, and deep KubeVirt knowledge.

Red Hat offers MTV (Migration Toolkit for Virtualization) but it requires OpenShift. No standalone open-source tool exists for vanilla Kubernetes.

## Solution

A guided **VM Import Wizard** that connects to a VMware vCenter or ESXi host, discovers VMs, maps their resources to KubeVirt equivalents, and orchestrates the migration — all from the KubeVM UI.

## Key Decisions

- **vCenter API integration** — Use VMware's REST API (vSphere Automation SDK) or SOAP API (pyvmomi) to discover VMs. Read-only access is sufficient for discovery; disk export requires limited privileges.
- **Disk conversion** — VMDKs are converted to qcow2 and imported via CDI (Containerized Data Importer) DataVolumes. Conversion happens server-side (backend pod or a dedicated migration worker).
- **No agent required on source VMs** — Migration is agentless. Source VMs can be powered on (warm migration) or off (cold migration).
- **Cold migration first** — Phase 1 supports powered-off VMs only. Warm migration (with change block tracking) is a future enhancement.
- **OVA/OVF file import as alternative** — Users can upload OVA/OVF files directly if they don't want to connect to vCenter.
- **Batch migration** — Select multiple VMs and migrate them as a group with progress tracking per VM.
- **Migration plan persistence** — Migration plans are stored as a CRD (`migrationplans.kubevmui.io`) so they survive backend restarts and can be audited.

## Concept Mapping: VMware → KubeVirt

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
│  │ vCenter      │  │ OVA/OVF      │  │ Migration Plan    │  │
│  │ Connector    │  │ Parser       │  │ Controller        │  │
│  │ (pyvmomi)    │  │              │  │ (orchestration)   │  │
│  └──────┬───────┘  └──────┬───────┘  └─────────┬─────────┘  │
│         │                 │                     │            │
│  ┌──────▼─────────────────▼─────────────────────▼─────────┐  │
│  │                  Disk Converter                         │  │
│  │   VMDK → qcow2 (qemu-img) → CDI DataVolume import     │  │
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
| `source.type` | enum | yes | `vcenter`, `esxi`, or `ova` |
| `source.endpoint` | string | conditional | vCenter/ESXi hostname or IP (not for OVA) |
| `source.credentials` | string | conditional | K8s Secret name containing username/password |
| `source.insecureSkipVerify` | boolean | no | Skip TLS verification (default: false) |
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

### Example

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
- **VMware vCenter** — Enter hostname, username, password. "Test Connection" button validates credentials and API access.
- **VMware ESXi** — Direct ESXi host connection (for smaller environments without vCenter).
- **OVA/OVF File** — Upload an OVA file or provide a URL to an OVF descriptor. No VMware connection needed.

For vCenter/ESXi:
```
┌─────────────────────────────────────────────────┐
│ Source Type:  ● vCenter  ○ ESXi  ○ OVA/OVF     │
│                                                  │
│ Hostname:    [vcenter.corp.local        ]       │
│ Username:    [administrator@vsphere.local]       │
│ Password:    [••••••••••••••            ]       │
│ Skip TLS:    ☑ (self-signed cert)               │
│                                                  │
│              [Test Connection]  ✓ Connected      │
│              Found: 3 datacenters, 47 VMs       │
└─────────────────────────────────────────────────┘
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
1. Export Disk(s) from VMware
   └── vCenter API: download VMDK via HTTP/NFC
   └── Stream to temporary PVC or local storage

2. Convert Disk(s)
   └── qemu-img convert -f vmdk -O qcow2 input.vmdk output.qcow2
   └── Runs in a migration worker pod (or backend pod)

3. Import Disk(s) via CDI
   └── Create DataVolume with source: upload or HTTP
   └── Upload qcow2 to CDI upload proxy
   └── Track DataVolume progress via CDI status

4. Create VM Manifest
   └── Map CPU, memory, firmware from source VM config
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
| `backend/app/services/vcenter_connector.py` | VMware vCenter/ESXi API client (pyvmomi wrapper) |
| `backend/app/services/ova_parser.py` | OVA/OVF file parsing and disk extraction |
| `backend/app/services/disk_converter.py` | VMDK-to-qcow2 conversion (qemu-img subprocess) |
| `backend/app/api/routes/import_vm.py` | REST endpoints for migration plans |
| `kubernetes/crds/migrationplans.kubevmui.io.yaml` | MigrationPlan CRD definition |

### Dependencies

```toml
# pyproject.toml additions
dependencies = [
    # ... existing ...
    "pyvmomi>=8.0",        # VMware vSphere API client
]
```

`qemu-img` must be available in the backend container image (install via `apt-get install qemu-utils` in Dockerfile).

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

- **vCenter credentials** stored as K8s Secrets with `type: Opaque`, referenced by Secret name in the MigrationPlan spec. Never stored in CRD directly.
- **RBAC** — import operations require cluster-admin or a dedicated `kubevmui-import` ClusterRole with permissions to create DataVolumes, VMs, and Secrets.
- **Network isolation** — the backend must be able to reach the vCenter/ESXi endpoint. In air-gapped environments, use OVA file upload instead.
- **Disk data in transit** — VMDK download over HTTPS (vCenter NFC). qcow2 upload to CDI over HTTPS.

## Out of Scope (Future)

- **Warm migration** — Migrate running VMs using VMware CBT (Changed Block Tracking) for near-zero downtime. Requires iterative disk sync.
- **Bulk migration scheduling** — Schedule migrations for maintenance windows.
- **Automatic source VM shutdown** — Optionally power off source VM after successful migration.
- **Source VM deletion** — Delete source VM from vCenter after migration. Dangerous, requires explicit confirmation.
- **Migration from other hypervisors** — Hyper-V, KVM/libvirt, Proxmox. Each needs its own connector.
- **P2V (Physical to Virtual)** — Convert physical servers to VMs. Out of scope.
- **Windows Sysprep integration** — Generalize Windows VMs during migration.
- **Network mapping auto-detection** — Suggest KubeVirt network mappings based on VLAN IDs matching VMware port groups.

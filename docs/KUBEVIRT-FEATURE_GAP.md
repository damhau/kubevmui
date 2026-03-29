# KubeVirt Feature Gap Analysis — KubeVM UI

> **Date:** 2026-03-29
>
> Comparison of KubeVirt capabilities (from official documentation at kubevirt.io/user-guide)
> against features currently implemented in the KubeVM UI codebase.

## Legend

| Symbol | Meaning |
|--------|---------|
| :white_check_mark: | Fully implemented |
| :large_orange_diamond: | Partially implemented |
| :x: | Not implemented |

---

## 1. User Workloads / Lifecycle

| KubeVirt Feature | Status | Notes |
|---|---|---|
| Create VirtualMachine | :white_check_mark: | Full VM creation wizard with disks, networks, cloud-init, firmware, scheduling |
| Delete VirtualMachine | :white_check_mark: | Via API endpoint |
| Start VM | :white_check_mark: | Via `vm_action` subresource |
| Stop VM | :white_check_mark: | Via `vm_action` subresource |
| Force Stop VM | :white_check_mark: | Patches `runStrategy` to `Halted` |
| Restart VM | :white_check_mark: | Via `vm_action` subresource |
| Pause VM | :white_check_mark: | Via `vm_action` subresource |
| Unpause VM | :white_check_mark: | Via `vm_action` subresource |
| Run Strategy management | :white_check_mark: | Supports `RerunOnFailure`, `Halted`, `Always`, `Once`, `Manual` |
| Standalone VMI (without VM wrapper) | :x: | Only `VirtualMachine` objects are managed; no direct VMI creation |
| Paused condition display | :large_orange_diamond: | VM status tracked but `Paused` condition not explicitly surfaced in UI models |

### Startup Scripts

| KubeVirt Feature | Status | Notes |
|---|---|---|
| Cloud-init NoCloud (userData) | :white_check_mark: | Inline user-data in VM creation |
| Cloud-init NoCloud (networkData) | :white_check_mark: | Inline network-data in VM creation |
| Cloud-init from Secret (`secretRef`) | :x: | Only inline cloud-init supported, not Secret references |
| Cloud-init base64 encoding (`userDataBase64`) | :x: | Not exposed in API models |
| Cloud-init ConfigDrive datasource | :large_orange_diamond: | Code references `cloudInitConfigDrive` but primary path is NoCloud |
| Ignition support | :x: | No Ignition volume type in models or services |
| Sysprep (Windows unattend) | :x: | No Sysprep volume support; Windows `os_type` exists but no Sysprep automation |
| SSH key injection | :white_check_mark: | Via SSH key secrets + cloud-init integration |

### Presets (Deprecated)

| KubeVirt Feature | Status | Notes |
|---|---|---|
| VirtualMachineInstancePreset | :x: | Deprecated upstream; not implemented (correctly skipped) |

### Instance Types & Preferences

| KubeVirt Feature | Status | Notes |
|---|---|---|
| VirtualMachineInstancetype (namespaced) | :x: | Not implemented; uses custom `Template` CRD instead |
| VirtualMachineClusterInstancetype | :x: | Not implemented |
| VirtualMachinePreference (namespaced) | :x: | Not implemented |
| VirtualMachineClusterPreference | :x: | Not implemented |
| `inferFromVolume` auto-detection | :x: | Not implemented |
| Instance type hotplug (change type on running VM) | :x: | Not implemented |
| ControllerRevision versioning | :x: | Not implemented |
| common-instancetypes integration | :x: | Not implemented |

> **Note:** KubeVM UI uses its own custom `Template` CRD (`templates.kubevmui.io`) with categories
> (OS, Application, Custom, Base) and compute presets. This provides similar functionality to
> KubeVirt instancetypes but is not compatible with the native KubeVirt API.

### Templates

| KubeVirt Feature | Status | Notes |
|---|---|---|
| Custom template system | :white_check_mark: | Own CRD `templates.kubevmui.io` with full CRUD |
| Template categories | :white_check_mark: | OS, Application, Custom, Base |
| Global (cross-namespace) templates | :white_check_mark: | Via `spec.global: true` |
| Template-based VM creation | :white_check_mark: | Template name stored in VM labels |
| OpenShift-style templates (`oc process`) | :x: | Uses custom CRD, not OpenShift templates |
| Parameterized template validation | :x: | No JSONPath validation rules |

### Guest Memory Dump

| KubeVirt Feature | Status | Notes |
|---|---|---|
| Memory dump to PVC | :x: | Not implemented |
| Memory dump download | :x: | Not implemented |
| Memory dump in snapshots | :x: | Not implemented |

---

## 2. Compute

### CPU Configuration

| KubeVirt Feature | Status | Notes |
|---|---|---|
| CPU cores count | :white_check_mark: | Configurable at creation and update |
| CPU topology (sockets/cores/threads) | :white_check_mark: | Full topology support in VM creation |
| CPU model selection | :white_check_mark: | Optional CPU model field |
| CPU model `host-passthrough` | :large_orange_diamond: | Model field accepts any string but not validated/guided in UI |
| CPU model `host-model` | :large_orange_diamond: | Same as above |
| CPU feature flags (force/require/disable/forbid) | :x: | Not exposed in models |
| Default cluster CPU model | :x: | KubeVirt CR-level config, not managed |
| Obsolete CPU model filtering | :x: | KubeVirt CR-level config, not managed |

### Dedicated CPU Resources

| KubeVirt Feature | Status | Notes |
|---|---|---|
| `dedicatedCpuPlacement` | :x: | Not exposed in VM creation models |
| `isolateEmulatorThread` | :x: | Not exposed |
| SMT alignment (`AlignCPUs`) | :x: | Not exposed |
| CPU Manager node labeling | :x: | Not managed |

### CPU Hotplug

| KubeVirt Feature | Status | Notes |
|---|---|---|
| Socket hotplug (live CPU add/remove) | :x: | CPU update exists but triggers `RestartRequired`, no live hotplug |
| `maxSockets` configuration | :x: | Not exposed |
| `HotVCPUChange` condition display | :x: | Not tracked |

### Memory Hotplug

| KubeVirt Feature | Status | Notes |
|---|---|---|
| Live memory resize via `memory.guest` | :x: | Memory update exists but no live hotplug support |
| `maxGuest` configuration | :x: | Not exposed |
| Memory status fields (guestAtBoot/guestCurrent) | :x: | Not tracked in response models |

### Huge Pages

| KubeVirt Feature | Status | Notes |
|---|---|---|
| `hugepages.pageSize` configuration | :x: | Not exposed in VM creation |
| memfd control | :x: | Not exposed |

### Host Devices & GPU

| KubeVirt Feature | Status | Notes |
|---|---|---|
| PCI device passthrough (`gpus[]`) | :x: | Not exposed in VM models |
| Generic host devices (`hostDevices[]`) | :x: | Not exposed |
| USB host passthrough | :x: | Not exposed |
| Mediated devices (vGPU) | :x: | Not exposed |
| Mediated device configuration in KubeVirt CR | :x: | Not managed |

### Client Passthrough

| KubeVirt Feature | Status | Notes |
|---|---|---|
| USB redirection (`clientPassthrough`) | :x: | Not implemented |

### Node Assignment & Scheduling

| KubeVirt Feature | Status | Notes |
|---|---|---|
| `nodeSelector` | :white_check_mark: | Supported in VM creation |
| Tolerations | :white_check_mark: | Full toleration support (key, operator, effect, seconds) |
| Pod affinity/anti-affinity | :x: | Not exposed in models |
| Node affinity expressions | :x: | Only simple `nodeSelector` labels, not full affinity rules |
| Topology spread constraints | :x: | Not exposed |
| Descheduler support (eviction annotation) | :x: | Not exposed |

### NUMA

| KubeVirt Feature | Status | Notes |
|---|---|---|
| `guestMappingPassthrough` | :x: | Not exposed |
| Real-time workload scheduling | :x: | Not exposed |

### Resource Management

| KubeVirt Feature | Status | Notes |
|---|---|---|
| `overcommitGuestOverhead` | :x: | Not exposed |
| Guest memory overcommit (request < guest) | :x: | Not exposed |
| `cpuAllocationRatio` | :x: | KubeVirt CR-level, not managed |
| Auto CPU/memory limits | :x: | Not managed |

### Virtual Hardware

| KubeVirt Feature | Status | Notes |
|---|---|---|
| Machine type (`pc-q35-*`) | :x: | Not exposed; uses KubeVirt defaults |
| BIOS boot | :white_check_mark: | Default firmware option |
| UEFI boot | :white_check_mark: | Supported in VM creation |
| UEFI Secure Boot | :white_check_mark: | Toggle in VM creation |
| SMBIOS UUID/Serial | :x: | Not exposed |
| Clock configuration (UTC/timezone) | :x: | Not exposed |
| Clock timers (hpet, pit, rtc, kvm, hyperv) | :x: | Not exposed |
| Virtio RNG device | :x: | Not exposed |
| Video device type selection | :x: | Not exposed (uses default VGA) |
| Headless mode (`autoattachGraphicsDevice: false`) | :x: | Not exposed |
| HyperV features (relaxed, vapic, spinlocks) | :x: | Not exposed |
| Input devices (tablet) | :x: | Not exposed |
| SMM (System Management Mode) | :x: | Not exposed |

---

## 3. Networking

### Core Networking

| KubeVirt Feature | Status | Notes |
|---|---|---|
| Pod network (default) | :white_check_mark: | Supported in VM creation |
| Multus secondary networks | :white_check_mark: | Via NetworkAttachmentDefinition management |
| Bridge binding | :white_check_mark: | Supported network type |
| Masquerade binding | :white_check_mark: | Supported network type |
| SR-IOV binding | :white_check_mark: | Supported network type |
| Passt binding | :x: | Not implemented |
| Pod network auto-attachment toggle | :white_check_mark: | `autoattachPodInterface` field |

### Network Attachment Definitions

| KubeVirt Feature | Status | Notes |
|---|---|---|
| List NADs | :white_check_mark: | Namespace and cluster-wide listing |
| Create NAD | :white_check_mark: | With VLAN, DHCP, subnet, gateway config |
| Delete NAD | :white_check_mark: | Via API endpoint |
| NAD display name/description | :white_check_mark: | Via annotations |

### Interface Configuration

| KubeVirt Feature | Status | Notes |
|---|---|---|
| MAC address specification | :white_check_mark: | Supported per interface |
| NIC model selection (virtio, e1000, etc.) | :x: | Not exposed in models |
| PCI address assignment | :x: | Not exposed |
| Port forwarding (masquerade) | :x: | Not exposed in VM creation |
| Interface link state management (up/down/absent) | :x: | Not exposed |
| MAC spoofing protection | :x: | Not managed |
| Custom MTU | :x: | Not exposed |
| Virtio-net multiqueue | :x: | Not exposed |

### Network Hotplug

| KubeVirt Feature | Status | Notes |
|---|---|---|
| Add interface to running VM | :white_check_mark: | Via hotplug API endpoint |
| Remove interface from running VM | :white_check_mark: | Via hotplug API endpoint |
| SR-IOV hotplug (migration-based) | :x: | Not implemented |

### DNS

| KubeVirt Feature | Status | Notes |
|---|---|---|
| Per-VMI hostname/subdomain DNS records | :x: | Not exposed in VM creation models |
| Headless Service pairing for DNS | :x: | Not managed |

### Network Policies

| KubeVirt Feature | Status | Notes |
|---|---|---|
| NetworkPolicy management for VMs | :x: | Not implemented |

### Service Mesh

| KubeVirt Feature | Status | Notes |
|---|---|---|
| Istio service mesh integration | :x: | Not implemented |
| Istio sidecar injection annotation | :x: | Not exposed |

### Service Objects

| KubeVirt Feature | Status | Notes |
|---|---|---|
| ClusterIP Service for VMs | :x: | Not managed |
| NodePort Service for VMs | :x: | Not managed |
| LoadBalancer Service for VMs | :x: | Not managed |

### Network Binding Plugins

| KubeVirt Feature | Status | Notes |
|---|---|---|
| Custom binding plugin registration | :x: | KubeVirt CR-level config, not managed |
| Sidecar image configuration | :x: | Not managed |

---

## 4. Storage

### Disks & Volumes

| KubeVirt Feature | Status | Notes |
|---|---|---|
| Disk type: `disk` | :white_check_mark: | Primary disk type |
| Disk type: `cdrom` | :x: | Not exposed in models |
| Disk type: `lun` (SCSI passthrough) | :x: | Not exposed |
| Disk type: `filesystem` (virtiofs) | :x: | Not exposed |
| Bus types: virtio, sata, scsi | :white_check_mark: | Supported for disk attachment |
| Boot order | :white_check_mark: | Configurable per disk |
| Disk error policy | :x: | Not exposed |
| Disk cache modes (none, writeback, writethrough) | :x: | Not exposed |
| Disk sharing (`shareable: true`) | :x: | Not exposed |

### Volume Sources

| KubeVirt Feature | Status | Notes |
|---|---|---|
| PersistentVolumeClaim | :white_check_mark: | Full PVC management |
| DataVolume | :white_check_mark: | CDI integration for imports |
| DataVolume templates | :large_orange_diamond: | Used internally but not fully exposed as a user concept |
| Container disk | :white_check_mark: | From OCI registry images |
| Cloud-init volumes | :white_check_mark: | NoCloud and ConfigDrive |
| Ephemeral volumes | :x: | Not exposed |
| Empty disk | :x: | Not exposed |
| Host disk | :x: | Not exposed |
| ConfigMap as disk/virtiofs | :x: | Not exposed |
| Secret as disk/virtiofs | :x: | Not exposed |
| ServiceAccount as disk/virtiofs | :x: | Not exposed |
| Downward metrics volume | :x: | Not exposed |

### Disk Management

| KubeVirt Feature | Status | Notes |
|---|---|---|
| Create PVC (disk) | :white_check_mark: | Full disk creation with storage class, access mode, volume mode |
| List disks | :white_check_mark: | With metadata (size, tier, status, attached VM) |
| Resize disk | :white_check_mark: | Via PATCH endpoint |
| Delete disk | :white_check_mark: | Via API endpoint |
| Storage class listing | :white_check_mark: | With default flag |

### Hotplug Volumes

| KubeVirt Feature | Status | Notes |
|---|---|---|
| Hotplug disk (virtio/sata/scsi) | :white_check_mark: | Via subresource API |
| Hot-unplug disk | :white_check_mark: | Via subresource API |
| Hotplug CD-ROM | :x: | Not implemented |
| Hotplug LUN | :x: | Not implemented |
| Declarative hotplug (GitOps) | :x: | Uses imperative subresource API only |

### High Performance Storage

| KubeVirt Feature | Status | Notes |
|---|---|---|
| IOThreads policy (shared/auto) | :x: | Not exposed |
| Dedicated IOThread per disk | :x: | Not exposed |
| Virtio block multi-queue | :x: | Not exposed |
| Thin provisioning / `fstrim` | :x: | Not managed (uses KubeVirt defaults) |

### CDI (Containerized Data Importer)

| KubeVirt Feature | Status | Notes |
|---|---|---|
| HTTP image import | :white_check_mark: | Via DataVolume creation in Image service |
| Registry image import | :white_check_mark: | Supported in Image model |
| PVC clone import | :white_check_mark: | Cross-namespace cloning |
| Local image upload (`virtctl image-upload`) | :x: | No upload proxy integration |
| Import progress tracking | :white_check_mark: | DataVolume phase and progress in Image model |
| CDI configuration management | :x: | Not managed |

### Clone API

| KubeVirt Feature | Status | Notes |
|---|---|---|
| VM Clone (VirtualMachineClone CRD) | :white_check_mark: | Via `clone.kubevirt.io/v1beta1` |
| Clone from VirtualMachineSnapshot | :x: | Only VM-to-VM clone, not snapshot-to-VM |
| Label/annotation filters on clone | :x: | Not exposed |
| Template label/annotation filters | :x: | Not exposed |
| `newMacAddresses` on clone | :x: | Not exposed |
| `newSMBiosSerial` on clone | :x: | Not exposed |
| JSON patches on clone | :x: | Not exposed |
| Clone phase tracking | :x: | Clone is fire-and-forget |

### Snapshot & Restore

| KubeVirt Feature | Status | Notes |
|---|---|---|
| Create snapshot | :white_check_mark: | Via `snapshot.kubevirt.io/v1beta1` |
| List snapshots | :white_check_mark: | With phase and readiness tracking |
| Delete snapshot | :white_check_mark: | Via API endpoint |
| Restore from snapshot | :white_check_mark: | To same or new VM |
| Online snapshots (running VM) | :white_check_mark: | Supported via KubeVirt |
| Guest agent filesystem freeze indication | :x: | Indications (Online/GuestAgent/NoGuestAgent) not surfaced |
| Snapshot failure deadline configuration | :x: | Not exposed |
| Restore target readiness policies | :x: | Not exposed (WaitGracePeriod, StopTarget, etc.) |
| Volume restore policies (RandomizeNames/InPlace) | :x: | Not exposed |
| Volume ownership policies | :x: | Not exposed |

### Export API

| KubeVirt Feature | Status | Notes |
|---|---|---|
| VirtualMachineExport CRD | :x: | Not implemented |
| Export from VM/Snapshot/PVC | :x: | Not implemented |
| Export download (raw/gzip) | :x: | Not implemented |
| Cross-cluster cloning via export | :x: | Not implemented |
| Export TTL management | :x: | Not implemented |

### Volume Migration

| KubeVirt Feature | Status | Notes |
|---|---|---|
| Live storage migration (`updateVolumesStrategy: Migration`) | :x: | Not implemented |
| Cross-storage-class migration | :x: | Not implemented |
| Multi-volume migration | :x: | Not implemented |
| Migration cancellation via spec revert | :x: | Not implemented |

---

## 5. Additional Features in KubeVM UI (Not from KubeVirt Docs)

These features are implemented in KubeVM UI but go beyond what is covered in the KubeVirt
user guide sections reviewed:

| Feature | Description |
|---|---|
| **Custom Image CRD** | `images.kubevmui.io` — manages boot source images with HTTP/registry/PVC/container_disk sources |
| **Custom Template CRD** | `templates.kubevmui.io` — pre-configured VM templates with categories |
| **Multi-cluster support** | Multiple kubeconfig contexts with per-cluster operations |
| **Prometheus metrics** | CPU, memory, network, storage metrics with time-range queries |
| **Analytics dashboard** | Top consumers, trends, migration statistics |
| **Audit logging** | Track all VM lifecycle operations with user attribution |
| **SSH key management** | Kubernetes Secrets-backed SSH public key storage |
| **VNC console** | WebSocket proxy to KubeVirt VNC subresource |
| **Serial console** | WebSocket proxy to KubeVirt serial console subresource |
| **Guest OS information** | Hostname, OS, kernel, filesystem usage via guest agent |
| **Health status computation** | Healthy/Degraded/Critical based on VMI conditions |
| **VM timeline** | Correlated metrics and events for VM lifecycle visualization |
| **Node management** | Node listing with capacity, allocatable resources, and VM counts |
| **Dashboard** | Aggregate VM/node/storage counts and status |

---

## 6. Priority Recommendations

### High Priority (Core KubeVirt Functionality)

1. **Instance Types & Preferences** — Native KubeVirt instancetype/preference support is the
   modern replacement for VM sizing. Consider supporting both the custom Template CRD and native
   instancetypes.
2. **Export API** — VM export/import is essential for backup, disaster recovery, and
   cross-cluster migration workflows.
3. **Volume Migration** — Live storage migration enables storage class changes and backend
   migrations without VM downtime.
4. **CPU/Memory Hotplug** — Live resource scaling is a key operational feature for production
   workloads.
5. **Clone API enhancements** — Label filters, MAC address control, and clone-from-snapshot
   enable golden image workflows.

### Medium Priority (Operational Improvements)

6. **Snapshot/Restore policies** — Expose target readiness, volume restore, and volume ownership
   policies for production-grade snapshot management.
7. **Advanced scheduling** — Pod affinity/anti-affinity, node affinity expressions, and topology
   spread constraints for HA deployments.
8. **Dedicated CPU resources** — CPU pinning and emulator thread isolation for latency-sensitive
   workloads.
9. **Huge Pages** — Required for high-performance and DPDK workloads.
10. **Service Objects for VMs** — ClusterIP/NodePort/LoadBalancer service management for
    VM connectivity.

### Lower Priority (Specialized Use Cases)

11. **Host device / GPU passthrough** — PCI, USB, and mediated device assignment for GPU
    workloads.
12. **NUMA topology passthrough** — For HPC and real-time workloads.
13. **Advanced disk types** — CD-ROM, LUN, virtiofs, ephemeral, emptyDisk volumes.
14. **Sysprep / Ignition** — Windows automation and Fedora CoreOS/Flatcar initialization.
15. **Network binding plugins** — Passt, custom plugins for advanced networking.
16. **Virtual hardware tuning** — Clock, timers, HyperV features, video device selection,
    input devices.
17. **IOThreads / multi-queue** — High-performance storage and networking tuning.
18. **DNS records / NetworkPolicy** — Kubernetes-native networking features for VMs.
19. **Client passthrough (USB redirection)** — Niche desktop virtualization feature.
20. **Guest memory dump** — Diagnostic feature for troubleshooting.

---

## 7. Summary Statistics

| Category | Total Features | Implemented | Partial | Not Implemented |
|---|---|---|---|---|
| **Lifecycle** | 11 | 9 | 1 | 1 |
| **Startup Scripts** | 8 | 3 | 1 | 4 |
| **Instance Types** | 8 | 0 | 0 | 8 |
| **Templates** | 6 | 4 | 0 | 2 |
| **Compute (CPU/Memory)** | 20 | 4 | 2 | 14 |
| **Virtual Hardware** | 14 | 3 | 0 | 11 |
| **Scheduling** | 6 | 2 | 0 | 4 |
| **Networking (Core)** | 7 | 6 | 0 | 1 |
| **Networking (Config)** | 8 | 1 | 0 | 7 |
| **Networking (Advanced)** | 8 | 2 | 0 | 6 |
| **Storage (Disks)** | 9 | 4 | 0 | 5 |
| **Storage (Volumes)** | 12 | 5 | 1 | 6 |
| **Storage (Hotplug)** | 5 | 2 | 0 | 3 |
| **Storage (Performance)** | 4 | 0 | 0 | 4 |
| **CDI** | 6 | 4 | 0 | 2 |
| **Clone API** | 7 | 1 | 0 | 6 |
| **Snapshots** | 9 | 5 | 0 | 4 |
| **Export API** | 5 | 0 | 0 | 5 |
| **Volume Migration** | 4 | 0 | 0 | 4 |
| **Guest Memory Dump** | 3 | 0 | 0 | 3 |
| **TOTALS** | **160** | **55 (34%)** | **5 (3%)** | **100 (63%)** |

> **Overall coverage: ~37% of KubeVirt features documented in the official user guide are
> implemented (fully or partially) in KubeVM UI.** The core VM lifecycle, basic compute, primary
> networking, and essential storage operations are well-covered. The main gaps are in advanced
> compute (CPU pinning, hotplug, NUMA, GPU), advanced storage (export, volume migration,
> performance tuning), and native KubeVirt instance types.

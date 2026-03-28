# Phase 2 Implementation Status

> **Last updated:** 2026-03-28

## Phase 2 — VM Management (COMPLETE)

All VM Management items from the Phase 2 spec have been implemented. Auth & Multi-cluster was intentionally skipped per user request.

### Completed Features

| Feature | Status | Commits |
|---------|--------|---------|
| **Snapshots** — create, restore, delete, list per VM | Done | `a56535e`–`6fe2362` |
| **Live Migration** — trigger, cancel, active migration banner | Done | (same batch) |
| **SSH Key Management** — full CRUD, K8s Secret-backed | Done | `be37d1c` |
| **Image / Boot Source Registry** — ConfigMap metadata + real DataVolume import (registry/http), progress tracking, storage class selection | Done | `b85c6af`, `f633691`, `1d1777b`, `dfe9204` |
| **Disk Hotplug/Unplug** — add/remove volumes on running VMs via subresource API | Done | `ffbb0eb`, `5d70b39` |
| **NIC Hotplug/Unplug** — add/remove interfaces on running VMs | Done | (same batch) |
| **VM Clone** — via VirtualMachineClone CRD | Done | `4d2e886` |
| **Force Stop** — patch runStrategy to Halted | Done | `4d2e886` |
| **Run Strategy Management** — editable in VM detail, PATCH endpoint | Done | `4d2e886` |
| **Enhanced VM Wizard (8-step)** — firmware (BIOS/UEFI/SecureBoot), scheduling (node selector, tolerations, eviction strategy), container disk, compute presets | Done | `a934e7a` |
| **DataVolume Clone Workflow** — golden image import → template → VM with `dataVolumeTemplates` | Done | `dfe9204`–`e3eeff4` |
| **Template Selector in Wizard** — pre-fills compute, disks, networks, cloud-init from template | Done | `95c6f50` |
| **Cloud-Init Network Data** — network_data textarea in wizard and templates | Done | `95c6f50`, `2ab1494` |
| **autoattachPodInterface** — toggle in wizard and templates for bridge-only networking | Done | `073069d`, `95c6f50` |
| **VNC Console** — noVNC/RFB with connection status overlays | Done | `c28159e`–`31b6c87` |
| **Serial Console** — xterm.js with binary WebSocket frames for KubeVirt | Done | `c28159e`–`9e6f4bf` |
| **K8s Events on VM Detail** — fetches VirtualMachine + VMI events | Done | `dcf3798` |
| **VM Detail Tabs** — Overview, Disks, Network, Snapshots, Events, YAML | Done | `5d70b39`, `7721092` |

### Deviations from Spec

1. **GPU/Sysprep wizard steps** — deferred. The spec called for GPU passthrough and Sysprep (Windows) steps. These require cluster-specific device discovery APIs not yet available.
2. **Snapshots** — cluster doesn't have snapshot feature gate enabled, so snapshots API returns 400. Code is correct and returns the K8s error message.
3. **Migration progress bar** — shows phase badges (Pending → Running → Succeeded) but not a continuous progress percentage. KubeVirt migration status doesn't expose byte-level progress.
4. **Image browser upload** — not implemented. Images are imported from registry URLs or HTTP. Direct browser upload requires CDI upload proxy integration.
5. **Priority class management** — not implemented as a separate feature. Can be added as a field on the wizard/template later.

---

## Phase 2 — Observability & Admin (NOT STARTED)

Remaining from the Phase 2 spec (skipping Auth & Multi-cluster):

### High Priority

1. **Node Overview Page** — list nodes with CPU/memory capacity, KubeVirt info, VM count per node
2. **Monitoring / Metrics** — Prometheus metrics proxy, VM-level CPU/memory/disk/network charts (Recharts)

### Medium Priority

3. **Audit Log** — log every action (who, what, when), searchable, Redis-backed or simple file-backed
4. **VM Health Status** — derived Healthy/Degraded/Critical from conditions + guest agent + resource pressure

### Lower Priority (may defer to Phase 3)

5. **RDP Console** — Guacamole integration (requires external guacd service)
6. **Real-Time Events WebSocket** — K8s watch API → WS fan-out to replace polling

---

## Phase 3 — Scale & Operations (NOT STARTED)

From the spec:
- VM Pools with replica scaling
- Backups to NFS/S3 + scheduled backups
- VM timeline view + event correlation
- Project quotas
- Services for VMs (expose ports)
- RBAC admin panel
- Diagnostics tab
- Helm chart
- Settings page

---

## Commit History (Phase 2)

| Commit | Description |
|--------|-------------|
| `a56535e` | Snapshot and migration Pydantic models |
| `1467f03` | K8s client snapshot/migration methods |
| `60ed1bb` | Snapshot and migration services |
| `6100421` | Snapshot and migration API routes |
| `b524e6c` | Snapshot and migration React Query hooks |
| `7721092` | Snapshots tab + migration controls on VM detail |
| `1edbaff` | Snapshot/migrate quick actions in VM list |
| `6fe2362` | Route ordering + K8s error handling for snapshots |
| `be37d1c` | SSH key management (full stack) |
| `b85c6af` | Image/boot source management (full stack) |
| `ffbb0eb` | Disk and NIC hotplug APIs |
| `4d2e886` | VM clone, force stop, run strategy management |
| `a934e7a` | Enhanced VM wizard (firmware, scheduling, container disk) |
| `5d70b39` | Disks + Network tabs with hotplug on VM detail |
| `dcf3798` | K8s events on VM detail page |
| `ec07295` | Container disk selector from registered images |
| `1014b40` | Snapshot quick action button on VM detail |
| `dfe9204` | DataVolume + StorageClass methods in K8s client |
| `f633691` | Image service creates real DataVolumes |
| `073069d` | datavolume_clone disk type with dataVolumeTemplates |
| `2ab1494` | Cloud-init network data + autoattach on templates |
| `1d1777b` | Image import UI with DV progress + storage class |
| `490d38f` | Enhanced template form (disks, networks, cloud-init) |
| `95c6f50` | Wizard: template selector, DV clone, network data, autoattach |
| `e3eeff4` | Template namespace fix |
| Various | Console fixes (StrictMode, binary frames, xterm fit) |

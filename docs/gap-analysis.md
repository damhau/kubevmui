# Gap Analysis: Spec vs Current Implementation

Comparing sections 5.1, 5.2, 5.6, 5.12, and 5.14 of the design spec against what is currently implemented.

Legend: [x] Implemented | [~] Partial | [ ] Missing

---

## 5.1 Dashboard

| Feature | Status | Notes |
|---------|--------|-------|
| Stats cards (total VMs running/stopped/error) | [x] | |
| Aggregate CPU usage gauge | [x] | Now filters to running VMs only |
| Total memory allocated gauge | [x] | Now filters to running VMs only |
| Storage utilization | [X] | No storage gauge on dashboard |
| Recent VMs table | [x] | |
| Cluster health / node status summary | [x] | Node cards with status |
| KubeVirt version display | [ ] | Not shown |
| Alerts | [~] | Shows error VMs and importing images, no K8s alerts integration |
| Activity feed (recent events) | [X] | No events feed on dashboard (Events page exists separately) |

**Missing for 5.1:**
- Storage utilization gauge on dashboard
- KubeVirt version info
- Activity feed / recent events panel on dashboard

---

## 5.2 Virtual Machine Management

### VM List Page

| Feature | Status | Notes |
|---------|--------|-------|
| Sortable table | [X] | No column sorting |
| Filterable table | [x] | Search by name/namespace |
| Columns: name, namespace, status, CPU, memory, node, OS, age | [~] | Missing OS column |
| Bulk actions (start, stop, restart, delete) | [X] | No multi-select / bulk actions |
| Namespace filter dropdown | [x] | In TopBar, supports "All Namespaces" |
| Quick search by name | [x] | |
| Status badges | [x] | Running, Stopped, Migrating, Error, Provisioning |

### VM Detail Page

| Feature | Status | Notes |
|---------|--------|-------|
| Overview tab | [x] | Status, IPs, creation time, labels, run strategy (editable), OS, template link |
| Guest agent info on overview | [X] | Guest OS info not shown (backend has it via VMI status) |
| Metrics tab (CPU, memory, network) | [x] | CPU, memory, network RX/TX, storage usage charts |
| Disk I/O charts | [ ] | No disk I/O metrics |
| Disks tab - list volumes | [x] | With links to storage detail |
| Disks tab - add/remove disks | [x] | Hotplug supported |
| Disks tab - edit bus type | [ ] | |
| Disks tab - boot order (drag-and-drop) | [ ] | |
| Network tab - interfaces/IPs | [x] | |
| Network tab - hotplug NICs | [x] | Add/remove interface |
| Snapshots tab | [x] | List, create, restore, delete |
| Scheduling tab | [ ] | Node selector in wizard only, no dedicated tab |
| Diagnostics tab | [ ] | No guest agent status, health probes, troubleshooting |
| Events tab | [x] | Auto-refresh, shows all related events (VM, VMI, DV) |
| YAML tab | [x] | Syntax-highlighted viewer with real K8s manifests (VM + VMI) |
| YAML editor (apply/revert) | [ ] | Read-only viewer, no editing |
| YAML download as file | [ ] | Copy button exists, no download |
| Console tab (VNC) | [x] | Embedded VNC with auto-focus |
| Console tab (Serial) | [~] | Available on separate console page, not in detail tab |
| Console tab (RDP) | [ ] | Not implemented |

### VM Create Wizard

| Feature | Status | Notes |
|---------|--------|-------|
| Step 1 - Basics (name, ns, description, template) | [x] | Quick create from template |
| Step 1 - Labels, OS type selector | [ ] | No label editor |
| Step 1 - Run strategy selection | [ ] | Not in wizard (defaults to RerunOnFailure) |
| Step 2 - Compute (CPU, memory, presets) | [x] | With compute presets |
| Step 2 - CPU model, topology | [ ] | Not exposed in wizard |
| Step 2 - Dedicated resources / CPU pinning | [ ] | |
| Step 3 - Firmware (BIOS/UEFI) | [x] | Boot mode + Secure Boot toggle |
| Step 3 - TPM 2.0 | [ ] | |
| Step 4 - Storage | [x] | DataVolume clone, container disk, with storage class |
| Step 4 - Cache mode, volume mode, access mode | [ ] | |
| Step 4 - Boot order drag-and-drop | [ ] | |
| Step 5 - Networking | [x] | Pod + Multus NAD selection |
| Step 5 - Port forwarding | [ ] | |
| Step 6 - Scheduling | [~] | Node selector as text field, no affinity rules UI |
| Step 7 - Cloud-Init | [x] | User data + network data + SSH key |
| Step 7 - Sysprep (Windows) | [ ] | |
| Step 8 - GPU/Devices | [ ] | |
| Step 9 - Review | [x] | Summary with all settings |

### VM Lifecycle Actions

| Feature | Status | Notes |
|---------|--------|-------|
| Start, Stop, Restart | [x] | |
| Pause, Unpause | [x] | |
| Force stop | [x] | |
| Delete (with confirmation) | [x] | |
| Delete associated PVCs option | [ ] | |
| Clone VM | [x] | |
| Edit CPU/memory while stopped | [x] | Inline editing with GB/MB unit switching |
| Change Run Strategy | [x] | Inline editable |
| Resize CPU/Memory on running VMs | [ ] | Only when stopped |
| Take Snapshot (quick action from list) | [ ] | Only from detail page |

---

## 5.6 Image / Boot Source Management

| Feature | Status | Notes |
|---------|--------|-------|
| Registry of OS images | [x] | Custom CRD `images.kubevmui.io` |
| Source: HTTP URL | [x] | DataVolume with HTTP source |
| Source: Container registry | [x] | DataVolume with registry source |
| Source: PVC | [~] | In wizard disk config, not in image management |
| Source: S3 | [ ] | |
| Source: Local upload | [ ] | No browser upload |
| Image metadata (name, description, OS) | [x] | |
| Image categories | [~] | OS type (linux/windows) but no category grouping |
| Global images (cross-namespace) | [x] | `spec.global` flag with cross-namespace visibility |
| DV import progress bar | [x] | On image list and detail |
| Auto-import from registries | [ ] | |
| Events tab on image detail | [x] | Shows DataVolume events |
| YAML tab on image detail | [x] | Shows Image CR + DataVolume manifest |

**Missing for 5.6:**
- S3 source support
- Browser-based disk image upload (qcow2, raw, ISO)
- Auto-import from container registries

---

## 5.12 Storage Management (Disks)

| Feature | Status | Notes |
|---------|--------|-------|
| Disk list with name, size, tier, status | [x] | |
| Performance tier (mapped from StorageClass) | [x] | |
| Backend info (Ceph, TopoLVM, etc.) | [ ] | Not shown |
| Attached VM | [x] | Cross-referenced from VM specs |
| Real usage vs provisioned size | [~] | `used_gb` from guest agent on VM detail, not on storage list |
| Status | [x] | Available/Bound/Pending |
| Image badge on PVCs | [x] | Shows "Image" tag for image-backed PVCs |
| Filter non-VM PVCs | [x] | Only shows CDI-managed and VM-referenced PVCs |
| Create Disk | [x] | Name, size, performance tier |
| Import Disk from URL/registry | [ ] | Only via image management |
| Upload Disk from browser | [ ] | |
| Resize Disk | [ ] | |
| Snapshot Disk (volume-level) | [ ] | |
| Delete Disk (with VM warnings) | [~] | Delete works, no warning if attached |
| Storage overview (capacity breakdown) | [ ] | No aggregate storage stats |
| Events tab on storage detail | [x] | Shows PVC events |
| YAML tab on storage detail | [x] | Shows PVC manifest |
| Link to image from storage detail | [x] | When PVC is image-backed |

**Missing for 5.12:**
- Backend storage system info (Ceph, TopoLVM, Longhorn)
- Disk import from URL/registry (separate from image flow)
- Browser upload for qcow2/raw/ISO
- Disk resize
- Volume-level snapshots
- Warning when deleting disk attached to VM
- Storage overview with capacity breakdown per tier

---

## 5.14 Monitoring & Observability

### VM Timeline View

| Feature | Status | Notes |
|---------|--------|-------|
| Correlated timeline of events + metrics | [ ] | Events tab exists but no timeline visualization |
| Config change tracking | [ ] | |
| Who triggered actions (audit log) | [ ] | |
| Metric overlays with events | [ ] | |
| "What changed?" diff view | [ ] | |

### Derived Health Status

| Feature | Status | Notes |
|---------|--------|-------|
| Computed health per VM (Healthy/Degraded/Critical) | [~] | Model has health field, but not computed from real signals |
| Health based on conditions + guest agent + errors | [ ] | |
| Dashboard health distribution | [~] | Shows error VM count, not full health breakdown |

### Metrics Dashboard

| Feature | Status | Notes |
|---------|--------|-------|
| Prometheus as metrics source | [x] | Via K8s API proxy |
| VM-level CPU usage | [x] | |
| VM-level memory usage | [x] | |
| VM-level disk I/O | [ ] | |
| VM-level network throughput | [x] | RX and TX charts |
| VM-level storage usage over time | [x] | Per-PVC usage % from kubelet metrics |
| Cluster-level VM count over time | [~] | In cluster metrics but not displayed |
| Resource utilization trends | [ ] | |
| Migration frequency | [ ] | |
| Top consumers | [ ] | |
| Time range selector | [x] | 1h, 6h, 24h on VM and node metrics |
| 7d, 30d, custom ranges | [ ] | |

### Event Correlation

| Feature | Status | Notes |
|---------|--------|-------|
| Cross-source event view | [x] | VM events include VM, VMI, DataVolume events |
| Global events page | [x] | With search and warning filter |
| Filterable by severity | [x] | Warning filter on events page |
| Filterable by source, time range | [~] | Search covers source, no time range filter |
| "Why did migration fail?" correlation | [ ] | No multi-event correlation view |

**Missing for 5.14:**
- VM Timeline view (events + metrics correlated on a timeline)
- Config change tracking / audit log
- Disk I/O metrics
- True derived health status from real signals
- Cluster-level analytics (trends, top consumers, migration frequency)
- Extended time ranges (7d, 30d, custom)
- Event time range filtering

---

## Summary: Top Priority Missing Features

### High Impact / Moderate Effort
1. **Column sorting** on all list pages
2. **Bulk actions** (select multiple VMs → start/stop/delete)
3. **Dashboard activity feed** (recent events panel)
4. **Guest agent info** on VM detail overview (OS, hostname, IPs from agent)
5. **Storage overview** on dashboard (total/used across tiers)
6. **Delete disk warning** when attached to VM
7. **Disk resize** support

### High Impact / High Effort
8. **Browser file upload** for disk images (qcow2, raw, ISO with progress)
9. **YAML editor** (edit + apply, not just view)
10. **VM Timeline view** (correlated events + metrics)
11. **Scheduling tab** on VM detail (affinity rules, tolerations UI)
12. **Diagnostics tab** (guest agent status, conditions, health probes)

### Lower Priority
13. Serial console in VM detail tab (currently separate page only)
14. RDP console via Guacamole
15. S3 image source
16. Disk I/O metrics
17. Extended time ranges (7d, 30d, custom)
18. KubeVirt version on dashboard
19. TPM 2.0 toggle in wizard
20. Sysprep support for Windows

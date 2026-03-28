# kubevmui — Design Specification

A modern, enterprise-ready web UI for managing KubeVirt virtual machines across Kubernetes clusters.

## 1. Overview

kubevmui is a **virtualization control plane** for KubeVirt — not just a UI, but an abstraction layer that sits above KubeVirt and presents operator-friendly workflows. It hides Kubernetes complexity (PVCs, NADs, CRDs) behind its own resource model (VMs, Disks, Network Profiles, Templates) while providing full VM lifecycle management, console access (VNC, serial, RDP), monitoring, and multi-cluster support. It targets both small single-cluster deployments and large enterprise environments with OIDC SSO.

### Design Philosophy

- **Control plane, not just a UI**: The API defines its own resource model. The UI consumes this API — never K8s directly. This allows automation (CLI, Terraform) later without coupling to K8s internals.
- **Operator-first**: Abstractions are designed for infra operators, not Kubernetes experts. Networking uses "network profiles," storage uses "disks," not raw NADs and PVCs.
- **Kubernetes is the data store**: All VM state lives in Kubernetes (no separate database). The API layer translates between our model and K8s CRDs. This avoids dual source-of-truth problems.
- **Progressive disclosure**: Simple by default, powerful when needed. A VM can be created in 3 clicks from a template, or fully customized via a 9-step wizard. YAML editor is always available as an escape hatch.

### Goals

- Replace manual YAML/kubectl workflows with an intuitive UI
- Abstract Kubernetes complexity behind operator-friendly concepts
- Provide enterprise-grade auth (OIDC + K8s RBAC impersonation)
- Support multi-cluster management from a single pane of glass
- Deliver a polished, dark modern UI inspired by Vercel/Linear aesthetics
- Zero-config deployment that works immediately against the local cluster
- Full audit trail of every action

### Non-Goals

- Replacing general-purpose Kubernetes management (Lens, Rancher, etc.)
- Managing non-KubeVirt workloads (pods, deployments, etc.)
- Providing a KubeVirt operator or installer
- Maintaining a separate database for VM state (Kubernetes is the source of truth)

## 2. Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Python 3.12+, FastAPI, uvicorn (ASGI) |
| Frontend | React 18+, TypeScript, Vite |
| UI Components | shadcn/ui + Tailwind CSS |
| Data Fetching | TanStack Query (React Query) |
| Routing | React Router v6 |
| UI State | Zustand |
| API Client | Auto-generated from OpenAPI spec (openapi-typescript-codegen) |
| VNC Console | noVNC (WebSocket) |
| Serial Console | xterm.js (WebSocket) |
| RDP Console | Apache Guacamole + guacamole-common-js |
| Charts | Recharts |
| K8s Client | official `kubernetes` Python client |
| Package Manager | uv (Python), npm (Node) |
| Deployment | Helm chart + Docker Compose (dev) |

## 3. Architecture

### 3.1 High-Level

```
┌─────────────────────────────────────────────────┐
│                   Browser                        │
│  React + shadcn/ui + noVNC + xterm.js + guac    │
└─────────┬──────────────┬──────────────┬─────────┘
          │ REST API     │ WebSocket    │ WebSocket
          │ (JSON)       │ (console)    │ (events)
┌─────────▼──────────────▼──────────────▼─────────┐
│                FastAPI Backend                    │
│  ┌──────┐ ┌──────────┐ ┌────────┐ ┌──────────┐ │
│  │ API  │ │ Console  │ │ Auth   │ │ Events   │ │
│  │Routes│ │ Proxy    │ │ Module │ │ Watcher  │ │
│  └──┬───┘ └────┬─────┘ └───┬────┘ └────┬─────┘ │
│     │          │            │            │       │
│  ┌──▼──────────▼────────────▼────────────▼─────┐ │
│  │          Cluster Manager                     │ │
│  │  (multi-cluster kubeconfig registry)         │ │
│  └──┬───────────┬───────────┬──────────────────┘ │
└─────┼───────────┼───────────┼────────────────────┘
      │           │           │
┌─────▼───┐ ┌────▼────┐ ┌───▼──────┐
│Cluster 1│ │Cluster 2│ │Cluster N │
│ (local) │ │(remote) │ │(remote)  │
│K8s API  │ │K8s API  │ │K8s API   │
└─────────┘ └─────────┘ └──────────┘
```

### 3.2 Backend Structure

```
backend/
├── app/
│   ├── main.py                 # FastAPI app factory, lifespan, CORS, middleware
│   ├── api/
│   │   ├── routes/
│   │   │   ├── vms.py          # VM CRUD + lifecycle actions
│   │   │   ├── vm_pools.py     # VirtualMachinePool CRUD + scaling
│   │   │   ├── templates.py    # VM template management
│   │   │   ├── snapshots.py    # Snapshot/restore operations
│   │   │   ├── backups.py      # Backup/restore + scheduled backups
│   │   │   ├── migrations.py   # Live migration controls
│   │   │   ├── networks.py     # Network profiles (abstracts Multus/NADs)
│   │   │   ├── storage.py      # Disks (abstracts PVCs/DataVolumes/StorageClasses)
│   │   │   ├── images.py       # OS image/boot source registry
│   │   │   ├── ssh_keys.py     # SSH key secret management
│   │   │   ├── nodes.py        # Node info and scheduling
│   │   │   ├── clusters.py     # Cluster registry CRUD
│   │   │   ├── auth.py         # Login, OIDC callback, token refresh
│   │   │   ├── metrics.py      # Prometheus proxy for VM metrics
│   │   │   └── admin.py        # RBAC roles viewer, settings
│   │   └── deps.py             # Shared dependencies (auth, cluster context)
│   ├── core/
│   │   ├── config.py           # Settings (env vars, OIDC config)
│   │   ├── cluster_manager.py  # Multi-cluster kubeconfig registry (K8s Secrets in management cluster)
│   │   └── k8s_client.py       # Kubernetes client wrapper with impersonation
│   ├── services/
│   │   ├── vm_service.py       # VM business logic
│   │   ├── vm_pool_service.py  # VM Pool scaling + management
│   │   ├── template_service.py
│   │   ├── snapshot_service.py
│   │   ├── backup_service.py   # Backup/restore + scheduling
│   │   ├── migration_service.py
│   │   ├── network_service.py
│   │   ├── storage_service.py
│   │   ├── image_service.py    # OS image registry
│   │   ├── ssh_key_service.py  # SSH key management
│   │   ├── node_service.py
│   │   └── metrics_service.py
│   ├── ws/
│   │   ├── vnc_proxy.py        # noVNC WebSocket relay
│   │   ├── serial_proxy.py     # Serial console WebSocket relay
│   │   ├── rdp_proxy.py        # Guacamole protocol proxy
│   │   └── events.py           # K8s watch → WebSocket fan-out
│   ├── auth/
│   │   ├── oidc.py             # OIDC provider integration
│   │   ├── k8s_token.py        # Direct K8s token validation
│   │   ├── session.py          # JWT session management
│   │   └── impersonation.py    # K8s user impersonation helper
│   ├── models/
│   │   ├── vm.py               # Pydantic models for VMs (our own schema, not K8s CRDs)
│   │   ├── disk.py             # Disk model (abstracts PVC/DataVolume)
│   │   ├── network_profile.py  # Network profile model (abstracts NAD/Multus)
│   │   ├── template.py         # Template model
│   │   ├── cluster.py          # Cluster registry models
│   │   └── auth.py             # Auth request/response models
│   └── audit/
│       └── logger.py           # Audit trail: who did what, when, on which cluster
├── pyproject.toml
└── Dockerfile
```

### 3.3 Frontend Structure

```
frontend/
├── src/
│   ├── main.tsx                    # App entry point
│   ├── App.tsx                     # Router setup, providers
│   ├── api/
│   │   └── generated/              # Auto-generated from OpenAPI spec
│   ├── components/
│   │   ├── ui/                     # shadcn/ui components
│   │   ├── layout/
│   │   │   ├── Sidebar.tsx         # Main navigation sidebar
│   │   │   ├── TopBar.tsx          # Page header + search + actions
│   │   │   └── AppShell.tsx        # Overall layout wrapper
│   │   ├── vm/
│   │   │   ├── VMTable.tsx         # VM list with filters/sorting
│   │   │   ├── VMDetail.tsx        # VM detail view (tabs: overview, metrics, disks, network, snapshots, scheduling, diagnostics, events, yaml, console)
│   │   │   ├── VMCreateWizard.tsx  # Multi-step VM creation (9 steps)
│   │   │   ├── VMActions.tsx       # Start/stop/delete action buttons
│   │   │   ├── VMMetrics.tsx       # CPU/memory/network charts
│   │   │   ├── VMPoolTable.tsx     # VM Pool list
│   │   │   ├── VMPoolDetail.tsx    # Pool detail with instance list
│   │   │   └── VMDiagnostics.tsx   # Conditions, guest agent, health
│   │   ├── console/
│   │   │   ├── VNCConsole.tsx      # noVNC wrapper
│   │   │   ├── SerialConsole.tsx   # xterm.js wrapper
│   │   │   └── RDPConsole.tsx      # Guacamole client wrapper
│   │   ├── cluster/
│   │   │   ├── ClusterSelector.tsx # Sidebar cluster dropdown
│   │   │   └── ClusterManager.tsx  # Admin cluster registration
│   │   ├── images/
│   │   │   ├── ImageList.tsx       # OS image registry
│   │   │   └── ImageUpload.tsx     # Browser upload with progress
│   │   ├── ssh-keys/
│   │   │   └── SSHKeyList.tsx      # SSH key management
│   │   ├── backups/
│   │   │   ├── BackupList.tsx      # Backup list + restore
│   │   │   └── ScheduleList.tsx    # Scheduled backup/snapshot management
│   │   ├── dashboard/
│   │   │   ├── StatsCards.tsx      # Overview stat cards
│   │   │   └── RecentVMs.tsx       # Recent VM activity table
│   │   └── admin/
│   │       ├── RBACViewer.tsx      # Roles and bindings viewer
│   │       └── Settings.tsx        # App settings
│   ├── hooks/
│   │   ├── useVMs.ts              # VM data fetching hooks
│   │   ├── useCluster.ts          # Active cluster context
│   │   ├── useWebSocket.ts        # WebSocket connection hook
│   │   └── useAuth.ts             # Auth state and actions
│   ├── stores/
│   │   └── ui-store.ts            # Zustand store (sidebar, theme, active cluster)
│   ├── lib/
│   │   ├── api-client.ts          # Axios instance with auth interceptor
│   │   └── utils.ts               # Shared utilities
│   └── pages/
│       ├── DashboardPage.tsx
│       ├── VMListPage.tsx
│       ├── VMDetailPage.tsx
│       ├── VMPoolListPage.tsx
│       ├── VMPoolDetailPage.tsx
│       ├── ConsolePage.tsx
│       ├── TemplatesPage.tsx
│       ├── ImagesPage.tsx
│       ├── SSHKeysPage.tsx
│       ├── SnapshotsPage.tsx
│       ├── BackupsPage.tsx
│       ├── BackupSchedulesPage.tsx
│       ├── MigrationsPage.tsx
│       ├── NetworksPage.tsx
│       ├── StoragePage.tsx
│       ├── NodesPage.tsx
│       ├── AdminClustersPage.tsx
│       ├── AdminRBACPage.tsx
│       ├── AdminAuditLogPage.tsx
│       ├── SettingsPage.tsx
│       └── LoginPage.tsx
├── package.json
├── tsconfig.json
├── tailwind.config.ts
├── vite.config.ts
└── Dockerfile
```

## 4. Authentication & Authorization

### 4.1 Adaptive Auth Model

The application adapts based on what is configured — no mode flags needed.

**Default (zero-config) — kubeconfig/token auth:**
- kubevmui starts with the in-cluster service account automatically
- Users authenticate by providing a K8s bearer token
- Backend validates the token against the local cluster's API server
- Operates as a single-cluster deployment
- The local cluster is always present as the default entry

**Enterprise — OIDC + multi-cluster:**
- Admin configures an OIDC provider (Keycloak, Azure AD, Okta, etc.) in Settings
- Users authenticate via SSO redirect flow
- Backend creates a JWT session from the OIDC identity
- Admin registers additional clusters via the Cluster Management page

**UI adapts automatically:**
- No OIDC configured → show token/kubeconfig login form
- OIDC configured → show "Sign in with SSO" button (with token fallback)
- Only local cluster → hide cluster selector dropdown
- Multiple clusters registered → show cluster selector in sidebar

### 4.2 Multi-Cluster Auth — User Impersonation

Each registered cluster has a ServiceAccount with impersonation rights:

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: kubevmui-impersonator
rules:
- apiGroups: [""]
  resources: ["users", "groups"]
  verbs: ["impersonate"]
```

When a user makes a request:
1. Backend resolves the user's identity (OIDC claims or K8s token)
2. Backend sends the K8s API request to the target cluster with impersonation headers:
   - `Impersonate-User: user@example.com`
   - `Impersonate-Group: group1, group2`
3. The target cluster's API server evaluates its own RBAC as if the request came from that user
4. Audit logs on each cluster show the real user identity

### 4.3 Session Management

- JWT access tokens with 15-minute TTL
- Refresh tokens with 7-day TTL
- Stored in httpOnly, secure, SameSite=Strict cookies
- Stateless by default (JWT-only), optional Redis session store for revocation

## 5. Features

### 5.1 Dashboard

- **Stats cards**: Total VMs (running/stopped/error), aggregate CPU usage, total memory allocated, storage utilization
- **Recent VMs table**: Last 10 modified VMs with status, resources, node, quick actions
- **Cluster health**: Node status summary, KubeVirt version, any alerts
- **Activity feed**: Recent events (VM created, migration completed, snapshot taken)

### 5.2 Virtual Machine Management

**VM List Page:**
- Sortable, filterable table with columns: name, namespace, status, CPU, memory, node, OS, age
- Bulk actions: start, stop, restart, delete (with confirmation)
- Namespace filter dropdown
- Quick search by name
- Status badges: Running (green), Stopped (gray), Migrating (amber), Error (red), Provisioning (blue)

**VM Detail Page:**
- **Overview tab**: Status, IP addresses, creation time, labels, annotations, run strategy (editable), OS type, guest agent info
- **Metrics tab**: CPU, memory, disk I/O, network throughput charts (Recharts, time-range selectable)
- **Disks tab**: List of attached volumes, DataVolumes, add/remove disks, **hotplug/unplug disks on running VMs**, edit bus type, boot order (drag-and-drop reorder)
- **Network tab**: Network interfaces, IPs, Multus attachments, **hotplug/unplug NICs on running VMs**
- **Snapshots tab**: List snapshots, create new, restore
- **Scheduling tab**: Node selector, tolerations, affinity/anti-affinity rules (node and workload level), eviction strategy (LiveMigrate/None), priority class
- **Diagnostics tab**: VM conditions, QEMU guest agent status, health probes, guest OS info, troubleshooting data
- **Events tab**: K8s events for this VM
- **YAML tab**: Raw YAML editor with syntax highlighting, apply/revert, download as file
- **Console tab**: Inline console launcher (VNC / Serial / RDP selector)

**VM Create Wizard (multi-step):**
1. **Basics**: Name, namespace, description, labels, OS type selector, template selection (optional), run strategy (Always/Halted/Manual/RerunOnFailure)
2. **Compute**: CPU cores, memory, CPU model, topology (sockets/cores/threads), reserved memory override, priority class selection, dedicated resources (CPU pinning)
3. **Firmware**: Boot mode (BIOS/UEFI), Secure Boot toggle, TPM 2.0 toggle (for Windows 11)
4. **Storage**: Boot disk (DataVolume from image, PVC, blank, container disk), additional disks with detailed options: bus type (virtio/sata/scsi), cache mode (none/writethrough/writeback), volume mode (filesystem/block), access mode (RWO/ROX/RWX), boot order (drag-and-drop)
5. **Networking**: Network interfaces with type selection (bridge/masquerade/SR-IOV), Multus network selection, port forwarding
6. **Scheduling**: Node selector, tolerations, node affinity/anti-affinity rules, workload affinity rules, eviction strategy
7. **Cloud-Init / Sysprep**: Cloud-init user data script editor, network data, SSH key selection (from stored K8s Secrets), hostname — OR Sysprep for Windows VMs (upload autounattend.xml / unattend.xml)
8. **GPU/Devices**: GPU/vGPU passthrough selection, host device passthrough (optional, shown only if devices available on cluster)
9. **Review**: Summary of all settings, estimated resources, create button

**VM Lifecycle Actions:**
- Start, Stop, Restart, Pause, Unpause
- Force stop (with confirmation)
- Delete (with confirmation, option to delete associated PVCs)
- Clone VM (direct clone without requiring snapshot)
- Edit VM (modify CPU/memory/disks while stopped)
- Change Run Strategy
- Change Priority Class
- Resize CPU/Memory (for running VMs where supported)
- Take Backup, Take Snapshot (quick actions from VM list)

### 5.3 Console Access

**VNC Console (noVNC):**
- Full-screen or embedded view
- Clipboard sync (copy/paste between host and VM)
- Send Ctrl+Alt+Del and other key combos via toolbar
- Connection status indicator
- Auto-reconnect on disconnect

**Serial Console (xterm.js):**
- Full terminal emulator
- Scrollback buffer
- Copy/paste support
- Font size adjustment

**RDP Console (Guacamole):**
- Requires Apache Guacamole deployed alongside kubevmui (optional Helm subchart)
- Connects to VM's RDP port via K8s pod networking
- Clipboard, file transfer support
- Resolution auto-detection

**Console Page Layout:**
- Tab bar to switch between VNC / Serial / RDP for the same VM
- Toolbar: full-screen toggle, send keys, screenshot, disconnect
- Status bar: connection state, latency, resolution

### 5.4 VM Pools (VirtualMachinePool)

- List all VM Pools with name, namespace, replicas (ready/desired), instance type, status
- Create new VM Pool (same options as VM creation plus replica count)
- Scale pool replicas up/down
- Per-pool actions: start all, stop all, resize, delete
- Per-instance actions: start, stop, restart, pause, migrate, remove from pool
- Pool detail page with template configuration, instance list, and status overview

### 5.5 SSH Key Management

- List all SSH key secrets (labeled for kubevmui)
- Create new SSH key: name, namespace, public key value
- Delete SSH keys
- Select SSH keys during VM creation (injected via cloud-init)
- Keys stored as Kubernetes Secrets

### 5.6 Image / Boot Source Management

- Registry of OS images for VM provisioning
- Image sources: HTTP URL, S3, container registry, PVC, local upload
- Upload disk images (qcow2, raw, ISO) from browser with progress bar
- Image metadata: display name, description, OS type, source URL
- Image categories: Linux, Windows, Custom
- Images stored as DataVolume sources or custom resource
- Auto-import from container registries (configurable)

### 5.7 Templates

- List all VirtualMachineClusterInstanceTypes and VirtualMachineInstancetypes
- Create custom templates (save a VM config as reusable template)
- Edit/delete custom templates
- Template categories: Linux, Windows, Custom
- Template details: default CPU, memory, disks, cloud-init, networks

### 5.8 Snapshots

- List all VirtualMachineSnapshots for current namespace/cluster
- Create snapshot from a running or stopped VM (filesystem freeze via QEMU guest agent for consistency)
- Restore VM from snapshot (with confirmation — current state will be replaced)
- Restore as new VM from snapshot
- Delete snapshots
- Snapshot details: creation time, size, source VM, status
- Snapshot quota management: per-namespace and per-VM storage limits

### 5.9 Backups

- **Backup target configuration**: NFS server or S3-compatible storage (endpoint, bucket, credentials)
- Create on-demand backup from VM list or detail page
- **Scheduled backups**: Cron-based automatic backups with configurable retention count
- **Scheduled snapshots**: Cron-based automatic snapshots with retention
- Schedule management: create, edit, suspend, resume, delete schedules
- Max failure threshold before auto-suspending a schedule
- Restore VM from backup (as new VM or replace existing)
- Backup list with status, size, creation time, source VM
- Cross-cluster restore support (restore backup to a different registered cluster)

### 5.10 Live Migration

- List active and completed migrations
- Trigger live migration for a running VM (select target node or let scheduler decide)
- Cancel in-progress migration
- Migration progress bar with bandwidth and completion estimate
- Migration policy management (bandwidth limits, auto-converge settings)

### 5.11 Network Management (Network Profiles)

Network Profiles abstract Multus/NADs into operator-friendly concepts. Users define networks in terms they understand, not K8s primitives.

- **Network Profile list**: Name, VLAN ID, type (L2 bridge / L3 routed / SR-IOV), DHCP/static, subnet, connected VM count
- **Create Network Profile**: Form-based wizard:
  - Display name and description
  - Type: Bridge, SR-IOV, Masquerade
  - VLAN ID (optional)
  - L2/L3 mode
  - DHCP enabled or static IP range
  - Subnet / gateway (if static)
  - Under the hood: creates/updates the appropriate NetworkAttachmentDefinition
- **Edit / delete** network profiles
- **VM NIC attachment**: When attaching a NIC to a VM, users pick a "network profile" — not a raw NAD
- **Show connected VMs**: Which VMs are using each profile
- **Network topology diagram** (stretch goal)

### 5.12 Storage Management (Disks)

Storage is presented as "Disks" — operators think in terms of disk size and performance, not PVCs and StorageClasses.

- **Disk list**: Name, size, performance tier (mapped from StorageClass), backend info (Ceph, TopoLVM, Longhorn, etc.), attached VM, real usage vs provisioned size, status
- **Create Disk**: Name, size, performance tier (dropdown mapped from available StorageClasses with human labels), access mode and volume mode hidden behind sensible defaults (overridable in advanced section)
- **Import Disk**: From URL, container registry, clone existing disk — presented as a disk import, not "create DataVolume"
- **Upload Disk**: Upload qcow2/raw/ISO from browser with progress bar
- **Resize Disk**: Expand size (if StorageClass supports it)
- **Snapshot Disk**: Volume-level snapshot
- **Delete Disk**: With warnings if attached to a VM
- **Storage overview**: Total capacity, used, available across all tiers. Per-tier breakdown showing backend storage system info

### 5.13 Node Overview

- List Kubernetes nodes with: status, roles, CPU/memory capacity vs allocatable vs used
- KubeVirt-specific info: virt-handler status, supported features, VM count per node
- Node labels and taints (relevant for VM scheduling)
- Node detail: running VMs on this node, resource utilization charts

### 5.13b Projects (Namespaces)

Namespaces are presented as "Projects" — a scoping unit for VMs, templates, disks, and network profiles.

- **Project list**: Name, VM count, resource usage vs quota, member count
- **Create project**: Name, resource quotas (CPU, memory, storage, VM count), description
- **Edit project quotas**: Adjust resource limits
- **Project selector**: Global dropdown or sidebar filter to scope all views to a project
- **Default project**: Configurable per-user default

### 5.13c Services for VMs

Expose VM ports via Kubernetes Services — presented as "VM Port Forwarding" in the UI.

- **List services** attached to VMs with type (ClusterIP/NodePort/LoadBalancer), ports, external IP
- **Create service for VM**: Select VM, port mappings (source → target), service type
- **Edit / delete** services
- **Quick action from VM detail**: "Expose port" button that creates the service inline

### 5.14 Monitoring & Observability

Not just Prometheus graphs — operator-first observability that answers "why is this VM slow?" and "what changed yesterday?"

**VM Timeline View** (on VM Detail page):
- Correlated timeline of events + metrics + config changes for a single VM
- Shows: creation, start/stop, migrations, snapshot/backup, config changes (CPU resize, disk attach), error events
- Each entry shows who triggered it (from audit log) and what happened
- Metric overlays: CPU/memory spikes correlated with events on the same timeline
- "What changed?" — diff view for any config change event

**Derived Health Status** (on VM list + detail):
- Each VM shows a computed health: Healthy / Degraded / Critical / Unknown
- Based on: K8s conditions + guest agent status + resource pressure + error events
- Cluster dashboard shows health distribution (e.g. "42 healthy, 3 degraded, 2 critical")

**Metrics Dashboard**:
- **Metrics source**: Prometheus (via metrics endpoint proxy)
- **VM-level**: CPU usage, memory usage, disk I/O (read/write), network throughput (in/out)
- **Cluster-level**: Total VM count over time, resource utilization trends, migration frequency, top consumers
- **Time range selector**: Last 1h, 6h, 24h, 7d, 30d, custom
- **Charts**: Line charts for time series, bar charts for comparisons (Recharts)

**Event Correlation**:
- Cross-source event view: KubeVirt events + node events + storage events for a VM
- Filterable by severity, source, time range
- "Why did migration fail?" — shows migration event + node conditions + resource pressure in one view

### 5.15 Admin Panel

**Cluster Management:**
- List registered clusters with status (connected/unreachable), KubeVirt version, VM count
- Add cluster: upload kubeconfig or provide API server URL + token
- Connectivity test on add
- Edit/remove clusters (cannot remove the local cluster)
- Health check indicators (API server reachable, KubeVirt CRDs present, impersonation working)

**RBAC Viewer:**
- List ClusterRoles and Roles that contain KubeVirt resource rules
- List RoleBindings/ClusterRoleBindings for those roles
- Pre-built role templates: VM Viewer (read-only), VM Operator (lifecycle actions), VM Admin (full CRUD), Cluster Admin (all + cluster management)
- Create/apply role bindings from the UI

**Audit Log:**
- Searchable log of every action: who, what, when, which cluster, which resource
- Filter by: user, action type, cluster, resource, time range
- Actions logged: VM lifecycle (start/stop/create/delete), config changes, console access, cluster registration, RBAC changes, login/logout
- Stored in Redis stream (lightweight, no SQL dependency) with configurable retention (default 90 days)
- Export to external systems (syslog, webhook) for compliance

**Settings:**
- OIDC provider configuration (issuer URL, client ID, client secret, scopes)
- Default namespace
- Session TTL
- Metrics endpoint configuration
- Guacamole service URL (for RDP)
- Backup target configuration (NFS endpoint or S3 bucket/credentials)
- Snapshot quota defaults (per-namespace limits)
- Audit log retention and export configuration

## 6. Console Architecture — Data Flow

### 6.1 VNC (noVNC)

```
Browser (noVNC client)
  ↕ WebSocket (wss://kubevmui/ws/vnc/{cluster}/{namespace}/{vm})
FastAPI WebSocket handler
  → Authenticates user, resolves cluster context
  → Opens WebSocket to KubeVirt VNC subresource:
    /apis/subresources.kubevirt.io/v1/namespaces/{ns}/virtualmachineinstances/{name}/vnc
  ↕ Bidirectional frame relay
KubeVirt virt-handler → VM's VNC server
```

### 6.2 Serial Console

```
Browser (xterm.js)
  ↕ WebSocket (wss://kubevmui/ws/console/{cluster}/{namespace}/{vm})
FastAPI WebSocket handler
  → Same auth + cluster resolution
  → Opens WebSocket to KubeVirt console subresource:
    .../virtualmachineinstances/{name}/console
  ↕ Bidirectional byte stream relay
KubeVirt virt-handler → VM's serial port
```

### 6.3 RDP (Guacamole)

```
Browser (guacamole-common-js)
  ↕ WebSocket (wss://kubevmui/ws/rdp/{cluster}/{namespace}/{vm})
FastAPI WebSocket handler
  → Authenticates user
  → Resolves VM's pod IP and RDP port via K8s API
  → Connects to Guacamole daemon (guacd) with RDP connection params
  ↕ Guacamole protocol relay
guacd → RDP connection to VM pod IP:3389
```

### 6.4 Real-Time Events

```
FastAPI Event Watcher (per cluster)
  → K8s watch API: watch=true on VirtualMachine, VirtualMachineInstance, Migration resources
  → Maintains persistent connection to each cluster's API server
  → On event: fans out to all connected WebSocket clients for that cluster

Browser
  ↕ WebSocket (wss://kubevmui/ws/events/{cluster})
  → Receives: VM state changes, migration progress, new/deleted resources
  → TanStack Query cache invalidation on relevant events (no polling needed for status)
```

## 7. API Design

### 7.0 Resource Model

The API exposes our own resource model — not raw K8s CRDs. The service layer translates between our model and Kubernetes objects. This decouples the UI/API consumers from K8s internals and allows future automation (CLI, Terraform provider) without K8s coupling.

**Core resources and their K8s mappings:**

| kubevmui Resource | K8s Backend | Abstraction |
|---|---|---|
| `VM` | VirtualMachine + VMI | Unified view: status from VMI, config from VM. Adds derived health, timeline. |
| `Disk` | PVC + DataVolume | Presents as: name, size, performance tier, backend. Hides PVC/DV/SC plumbing. |
| `NetworkProfile` | NetworkAttachmentDefinition | Operator-facing: name, VLAN ID, type (L2/L3), DHCP/static. Hides Multus config. |
| `Template` | VM config + cloud-init + preferences | Versioned. Includes compute, storage, network, init script as a single unit. |
| `Image` | DataVolume source / container disk | OS image with name, version, source (HTTP/S3/registry/upload). |
| `Snapshot` | VirtualMachineSnapshot | Direct mapping with added metadata. |
| `Backup` | VirtualMachineBackup (or Velero) | Backup with target (NFS/S3), schedule, retention. |
| `Cluster` | K8s Secret (kubeconfig) | Registered cluster with health, version, VM count. |
| `AuditEntry` | In-memory / Redis stream | Who did what, when, on which cluster/VM. Queryable log. |

**Key principle:** A VM returned by our API is a single JSON object with everything an operator needs: status, health, IPs, disks (as Disk objects), networks (as NetworkProfile references), metrics summary, and recent events. The operator never needs to know about VirtualMachineInstance, PodStatus, or PersistentVolumeClaim.

**Derived health status:** Each VM gets a computed health field:
- **Healthy** — Running, guest agent connected, no error conditions
- **Degraded** — Running but with warnings (high CPU, guest agent disconnected, disk pressure)
- **Critical** — Error state, crash loop, migration failed
- **Unknown** — No guest agent, cannot determine health

### 7.1 REST Endpoints

All endpoints are prefixed with `/api/v1` and scoped to a cluster via header or path parameter.

**Authentication:**
- `POST /api/v1/auth/login` — token-based login
- `GET /api/v1/auth/oidc/login` — OIDC redirect
- `GET /api/v1/auth/oidc/callback` — OIDC callback
- `POST /api/v1/auth/refresh` — refresh JWT
- `POST /api/v1/auth/logout` — invalidate session

**Virtual Machines:**
- `GET /api/v1/clusters/{cluster}/namespaces/{ns}/vms` — list VMs
- `POST /api/v1/clusters/{cluster}/namespaces/{ns}/vms` — create VM
- `GET /api/v1/clusters/{cluster}/namespaces/{ns}/vms/{name}` — get VM
- `PUT /api/v1/clusters/{cluster}/namespaces/{ns}/vms/{name}` — update VM
- `DELETE /api/v1/clusters/{cluster}/namespaces/{ns}/vms/{name}` — delete VM
- `POST /api/v1/clusters/{cluster}/namespaces/{ns}/vms/{name}/start` — start
- `POST /api/v1/clusters/{cluster}/namespaces/{ns}/vms/{name}/stop` — stop
- `POST /api/v1/clusters/{cluster}/namespaces/{ns}/vms/{name}/restart` — restart
- `POST /api/v1/clusters/{cluster}/namespaces/{ns}/vms/{name}/pause` — pause
- `POST /api/v1/clusters/{cluster}/namespaces/{ns}/vms/{name}/unpause` — unpause
- `POST /api/v1/clusters/{cluster}/namespaces/{ns}/vms/{name}/clone` — clone

**VM Pools:**
- `GET /api/v1/clusters/{cluster}/namespaces/{ns}/vmpools` — list VM Pools
- `POST /api/v1/clusters/{cluster}/namespaces/{ns}/vmpools` — create VM Pool
- `GET /api/v1/clusters/{cluster}/namespaces/{ns}/vmpools/{name}` — get VM Pool
- `PUT /api/v1/clusters/{cluster}/namespaces/{ns}/vmpools/{name}` — update VM Pool
- `POST /api/v1/clusters/{cluster}/namespaces/{ns}/vmpools/{name}/scale` — scale replicas
- `DELETE /api/v1/clusters/{cluster}/namespaces/{ns}/vmpools/{name}` — delete VM Pool

**SSH Keys:**
- `GET /api/v1/clusters/{cluster}/namespaces/{ns}/sshkeys` — list SSH keys
- `POST /api/v1/clusters/{cluster}/namespaces/{ns}/sshkeys` — create SSH key
- `DELETE /api/v1/clusters/{cluster}/namespaces/{ns}/sshkeys/{name}` — delete SSH key

**Images / Boot Sources:**
- `GET /api/v1/clusters/{cluster}/images` — list OS images (cluster-scoped)
- `GET /api/v1/clusters/{cluster}/namespaces/{ns}/images` — list namespace-scoped images
- `POST /api/v1/clusters/{cluster}/namespaces/{ns}/images` — create image (from URL, registry, S3)
- `POST /api/v1/clusters/{cluster}/namespaces/{ns}/images/upload` — upload image from browser
- `DELETE /api/v1/clusters/{cluster}/namespaces/{ns}/images/{name}` — delete image

**Backups:**
- `GET /api/v1/clusters/{cluster}/namespaces/{ns}/backups` — list backups
- `POST /api/v1/clusters/{cluster}/namespaces/{ns}/vms/{name}/backups` — create backup for VM
- `POST /api/v1/clusters/{cluster}/namespaces/{ns}/backups/{name}/restore` — restore backup
- `DELETE /api/v1/clusters/{cluster}/namespaces/{ns}/backups/{name}` — delete backup

**Backup Schedules:**
- `GET /api/v1/clusters/{cluster}/namespaces/{ns}/backup-schedules` — list schedules
- `POST /api/v1/clusters/{cluster}/namespaces/{ns}/backup-schedules` — create schedule
- `PUT /api/v1/clusters/{cluster}/namespaces/{ns}/backup-schedules/{name}` — update schedule
- `POST /api/v1/clusters/{cluster}/namespaces/{ns}/backup-schedules/{name}/suspend` — suspend
- `POST /api/v1/clusters/{cluster}/namespaces/{ns}/backup-schedules/{name}/resume` — resume
- `DELETE /api/v1/clusters/{cluster}/namespaces/{ns}/backup-schedules/{name}` — delete

**Templates:**
- `GET /api/v1/clusters/{cluster}/templates` — list VM templates (cluster-scoped)
- `GET /api/v1/clusters/{cluster}/namespaces/{ns}/templates` — list namespace-scoped templates
- `POST /api/v1/clusters/{cluster}/namespaces/{ns}/templates` — create template
- `DELETE /api/v1/clusters/{cluster}/namespaces/{ns}/templates/{name}` — delete template

**Snapshots:**
- `GET /api/v1/clusters/{cluster}/namespaces/{ns}/snapshots` — list snapshots
- `POST /api/v1/clusters/{cluster}/namespaces/{ns}/vms/{name}/snapshots` — create snapshot for VM
- `POST /api/v1/clusters/{cluster}/namespaces/{ns}/snapshots/{name}/restore` — restore snapshot
- `DELETE /api/v1/clusters/{cluster}/namespaces/{ns}/snapshots/{name}` — delete snapshot

**Migrations:**
- `GET /api/v1/clusters/{cluster}/namespaces/{ns}/migrations` — list migrations
- `POST /api/v1/clusters/{cluster}/namespaces/{ns}/vms/{name}/migrate` — trigger migration
- `DELETE /api/v1/clusters/{cluster}/namespaces/{ns}/migrations/{name}` — cancel migration

**Networks:**
- `GET /api/v1/clusters/{cluster}/namespaces/{ns}/networks` — list NetworkAttachmentDefinitions
- `POST /api/v1/clusters/{cluster}/namespaces/{ns}/networks` — create network
- `PUT /api/v1/clusters/{cluster}/namespaces/{ns}/networks/{name}` — update network
- `DELETE /api/v1/clusters/{cluster}/namespaces/{ns}/networks/{name}` — delete network

**Storage:**
- `GET /api/v1/clusters/{cluster}/storageclasses` — list StorageClasses
- `GET /api/v1/clusters/{cluster}/namespaces/{ns}/pvcs` — list PVCs
- `GET /api/v1/clusters/{cluster}/namespaces/{ns}/datavolumes` — list DataVolumes
- `POST /api/v1/clusters/{cluster}/namespaces/{ns}/datavolumes` — create DataVolume
- `POST /api/v1/clusters/{cluster}/namespaces/{ns}/datavolumes/upload` — upload disk image
- `DELETE /api/v1/clusters/{cluster}/namespaces/{ns}/datavolumes/{name}` — delete DataVolume

**Nodes:**
- `GET /api/v1/clusters/{cluster}/nodes` — list nodes with KubeVirt info
- `GET /api/v1/clusters/{cluster}/nodes/{name}` — node detail with running VMs

**Clusters (admin):**
- `GET /api/v1/clusters` — list registered clusters
- `POST /api/v1/clusters` — register cluster
- `PUT /api/v1/clusters/{cluster}` — update cluster config
- `DELETE /api/v1/clusters/{cluster}` — remove cluster
- `POST /api/v1/clusters/{cluster}/test` — test connectivity

**Metrics:**
- `GET /api/v1/clusters/{cluster}/namespaces/{ns}/vms/{name}/metrics` — VM metrics (CPU, mem, disk, net)
- `GET /api/v1/clusters/{cluster}/metrics/overview` — cluster-level aggregates

**WebSocket Endpoints:**
- `WS /ws/vnc/{cluster}/{namespace}/{vm}` — VNC console
- `WS /ws/console/{cluster}/{namespace}/{vm}` — serial console
- `WS /ws/rdp/{cluster}/{namespace}/{vm}` — RDP console
- `WS /ws/events/{cluster}` — real-time K8s events

**Audit:**
- `GET /api/v1/audit` — query audit log (filters: user, action, cluster, resource, time range)
- `GET /api/v1/audit/export` — export audit log (CSV/JSON)

**VM Timeline:**
- `GET /api/v1/clusters/{cluster}/namespaces/{ns}/vms/{name}/timeline` — correlated timeline (events + config changes + metrics)

### 7.2 Request Scoping

Every API request includes:
- **Auth**: JWT in cookie (or Bearer token in Authorization header for API clients)
- **Cluster**: Path parameter `{cluster}` — name from the cluster registry
- **Namespace**: Path parameter `{ns}` where applicable

The backend resolves the cluster to its kubeconfig, applies user impersonation headers, and forwards to the target K8s API server.

## 8. UI Design

### 8.1 Visual Style

- **Theme**: Dark modern, inspired by Vercel/Linear
- **Background**: Near-black (#0a0a0b) main, slightly lighter sidebar (#111113)
- **Borders**: Subtle zinc (#27272a)
- **Accent**: Indigo (#6366f1) for primary actions, active states, links
- **Status colors**: Green (#22c55e) running, amber (#f59e0b) warning/migrating, red (#ef4444) error, gray (#71717a) stopped, blue (#3b82f6) provisioning
- **Typography**: Inter (sans-serif), monospace for technical values (IPs, resource names)
- **Spacing**: Consistent 4px grid, generous padding in cards and tables
- **Borders/Shadows**: 1px solid borders, no box shadows (flat design)

### 8.2 Layout

- **Sidebar** (240px): Logo + cluster selector + navigation groups + user profile
- **Main area**: Top bar (page title + search + primary action) + content
- **Command palette**: Cmd+K for global search across VMs, namespaces, actions
- **Responsive**: Sidebar collapsible for smaller screens, tables scroll horizontally

### 8.3 Key Interactions

- **VM lifecycle**: Dropdown menu on each VM row (start/stop/restart/console/delete)
- **Bulk actions**: Checkbox selection + action bar at top of table
- **Create wizard**: Multi-step with progress indicator, back/next navigation, summary review
- **Console**: Opens in dedicated full-width view (no sidebar), tab bar for VNC/Serial/RDP
- **Cluster switching**: Dropdown in sidebar, switches all views to the selected cluster
- **Notifications**: Toast messages for action results (success/error), persistent for errors

## 9. Deployment

### 9.1 Helm Chart

```
helm/kubevmui/
├── Chart.yaml
├── values.yaml
├── templates/
│   ├── deployment-backend.yaml
│   ├── deployment-frontend.yaml
│   ├── service.yaml
│   ├── ingress.yaml
│   ├── configmap.yaml          # App config, OIDC settings
│   ├── secret.yaml             # Cluster kubeconfigs, OIDC client secret
│   ├── serviceaccount.yaml
│   ├── clusterrole.yaml        # KubeVirt read + impersonation
│   ├── clusterrolebinding.yaml
│   └── _helpers.tpl
└── charts/
    └── guacamole/              # Optional subchart for RDP support
```

**Default values.yaml config:**
- Backend replicas: 1
- Frontend served via nginx container
- Ingress enabled with TLS
- Guacamole disabled by default
- Redis disabled by default (JWT-only sessions)
- Resource limits set for both containers

### 9.2 Docker Compose (Development)

```yaml
services:
  backend:
    build: ./backend
    command: uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
    volumes:
      - ./backend:/app
    ports:
      - "8000:8000"
    environment:
      - KUBECONFIG=/app/.kubeconfig  # Mount local kubeconfig for dev

  frontend:
    build: ./frontend
    command: npm run dev
    volumes:
      - ./frontend:/app
      - /app/node_modules
    ports:
      - "5173:5173"
    environment:
      - VITE_API_URL=http://localhost:8000

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"

  guacd:
    image: guacamole/guacd
    ports:
      - "4822:4822"
```

### 9.3 Container Images

**Backend** (`kubevmui-backend`):
```dockerfile
# Multi-stage: build deps with uv, run with python:3.12-slim
FROM python:3.12-slim
```

**Frontend** (`kubevmui-frontend`):
```dockerfile
# Multi-stage: build with node:20, serve with nginx:alpine
FROM node:20-alpine AS build
FROM nginx:alpine
```

## 10. Project Structure

```
kubevmui/
├── backend/                    # Python FastAPI application
├── frontend/                   # React TypeScript application
├── helm/                       # Helm chart
├── docker-compose.yml          # Development environment
├── docker-compose.prod.yml     # Production-like local environment
├── docs/                       # Documentation
│   └── superpowers/specs/      # Design specs
├── .github/                    # CI/CD workflows (future)
├── Makefile                    # Common dev commands
└── README.md
```

## 11. Implementation Phases

### Phase 1 — MVP (Functional single-cluster)

The minimum that makes kubevmui usable and better than kubectl. Parallel backend + frontend development.

**Backend:**
- FastAPI project scaffolding with uv
- K8s client wrapper with cluster manager (single local cluster)
- Auth middleware (K8s token validation — no OIDC yet)
- API resource model: VM, Disk, NetworkProfile, Template (our own Pydantic schemas)
- VM service: list, get, create, start, stop, restart, pause, delete
- Template service: list, create from VM config, create VM from template
- Network profile service: list, create, map to/from NADs
- Disk service: list, create, map to/from PVCs/DataVolumes
- WebSocket handlers: VNC proxy, serial console proxy
- Docker Compose for dev environment

**Frontend:**
- React + Vite + TypeScript + shadcn/ui scaffolding
- Dark theme setup (Tailwind config, color tokens)
- App shell: sidebar navigation, top bar, project (namespace) selector
- Login page (K8s token form)
- Dashboard: stats cards, recent VMs, cluster health
- VM list page: table with status, search, project filter, bulk actions
- VM detail page: overview, events, YAML editor tabs
- VM create wizard (simplified: basics + compute + storage + networking + cloud-init + review)
- VNC console (noVNC component)
- Serial console (xterm.js component)
- Template list + create VM from template
- Network profile list + create form
- Disk list + create form
- Auto-generated API client from OpenAPI spec

### Phase 2 — Enterprise Features

What makes it credible for production deployments.

**Auth & Multi-cluster:**
- OIDC authentication + adaptive auth model (SSO login + token fallback)
- Multi-cluster: cluster registry, sidebar cluster selector, user impersonation
- JWT session management with refresh tokens

**VM Management:**
- Full 9-step VM create wizard (firmware/UEFI/Secure Boot, scheduling, GPU, Sysprep)
- Disk hotplug/unplug on running VMs
- NIC hotplug/unplug on running VMs
- Snapshots: create, restore, restore as new VM, delete
- Live migration: trigger, cancel, progress bar, migration policies
- Image / boot source registry with browser upload
- SSH key management (stored as K8s Secrets)
- Run strategy, priority class management

**Observability & Admin:**
- Monitoring: Prometheus metrics proxy, VM-level and cluster-level charts
- VM health status (derived Healthy/Degraded/Critical)
- Node overview with KubeVirt info
- Audit log (Redis-backed, searchable, exportable)
- RDP console (Guacamole integration)

### Phase 3 — Scale & Operations

What differentiates kubevmui from competition.

- VM Pools with replica scaling
- Backups to NFS/S3 + scheduled backups with cron and retention policies
- VM timeline view + event correlation ("why did this fail?")
- Project quotas (CPU, memory, storage, VM count)
- Services for VMs (expose ports via LoadBalancer/NodePort)
- RBAC admin panel (roles, bindings, pre-built role templates)
- Diagnostics tab (conditions, guest agent info, health probes)
- Helm chart for production Kubernetes deployment
- Settings page (OIDC config, backup targets, metrics endpoints, Guacamole URL)
- Cross-cluster backup restore

### Phase 4 — Future Roadmap

Features identified from competitive analysis for long-term differentiation:

- **Cluster API (CAPK)**: Provision tenant Kubernetes clusters on KubeVirt VMs
- **VM Import**: Migration toolkit for VMware vSphere, RHV, OpenStack
- **HPA Auto-scaling**: Horizontal Pod Autoscaler for VM Pools
- **Liveness/Readiness probes**: Health probes for VM Pool instances
- **Network health checkups**: Latency testing, DPDK validation
- **Topology view**: Visual graph of VMs, services, and connections
- **VM Folders / grouping**: Organize VMs into folders within a project
- **vTPM (persistent)**: Persistent Trusted Platform Module with Bitlocker support
- **PXE/iPXE boot**: Automated bare-metal style provisioning
- **Storage migration**: Move VM storage between backends independently
- **Overlay/SDN networking**: Kube-OVN for VPC, microsegmentation
- **Cross-cluster live migration**: Move running VMs between clusters
- **Policy engine**: Prevent risky configs, enforce standards, approval workflows
- **CLI tool**: Command-line client consuming the same API
- **Terraform provider**: Infrastructure-as-code for kubevmui resources

## 12. Competitive Feature Coverage

Summary of feature coverage against existing tools:

| Feature Area | kubevirt-manager | OpenShift Virt | Harvester | kubevmui |
|---|---|---|---|---|
| VM Lifecycle (CRUD + start/stop/pause) | Yes | Yes | Yes | Yes |
| VM Pools / Scaling | Yes | Yes | No | Yes |
| VNC Console | Yes | Yes | Yes | Yes |
| Serial Console | Yes | Yes | Yes | Yes |
| RDP Console | No | Yes (file download) | No | Yes (Guacamole) |
| Live Migration | Yes | Yes | Yes | Yes |
| Snapshots | Yes | Yes | Yes | Yes |
| Backups (external NFS/S3) | No | Via OADP | Yes | Yes |
| Scheduled Backups | No | No | Yes | Yes |
| Templates | No (uses pools) | Yes (SSP) | Yes | Yes |
| Image Registry | Yes (custom CRD) | Yes (bootable volumes) | Yes | Yes |
| SSH Key Management | Yes | Yes | Yes | Yes |
| Disk Hotplug | Yes | Yes | No | Yes |
| NIC Hotplug | No | Yes | No | Yes |
| UEFI / Secure Boot | Yes | Yes | Yes | Yes |
| GPU/vGPU Passthrough | No | Yes | Yes | Yes |
| Sysprep (Windows) | No | Yes | No | Yes |
| Scheduling (affinity/tolerations) | No | Yes | Yes | Yes |
| Diagnostics / Guest Agent | No | Yes | Partial | Yes |
| Multi-cluster | No | Via ACM | Via Rancher | Yes (native) |
| OIDC SSO | Via OAuth2 proxy | Yes | Via Rancher | Yes (native) |
| Prometheus Monitoring | Yes | Yes | Yes | Yes |
| Network Management | View only | Full CRUD | Full CRUD | Full CRUD |
| Storage Management | DataVolumes | Full CRUD | Full CRUD | Full CRUD |
| RBAC Admin | No | Yes | Via Rancher | Yes |
| Dark Modern UI | No | No | No | Yes |

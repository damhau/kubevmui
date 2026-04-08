# Project & Folder Hierarchy — Design Spec

**Date:** 2026-04-05
**Status:** Draft

## Problem

Kubernetes namespaces are the primary organizational unit for resources, but VMware admins don't think in namespaces. They think in **folders**, **resource pools**, and **permissions**. Every existing KubeVirt UI (Harvester, OpenShift Virtualization, kubevirt-manager) exposes namespaces directly, creating an immediate "this is Kubernetes, not for me" reaction.

VMware vCenter provides a hierarchical folder tree:

```
Datacenter
└── Resource Pool: Finance
    ├── Folder: Production
    │   ├── Folder: Web Servers
    │   │   ├── web-01
    │   │   └── web-02
    │   └── Folder: Databases
    │       └── oracle-01
    └── Folder: DR
        └── web-replica
```

Admins need this familiar structure while the platform leverages Kubernetes primitives (namespaces, RBAC, ResourceQuotas) behind the scenes.

## Solution

A **three-level hierarchy** — `Cluster → Project → Folder → VM` — with three UI modes that progressively reveal Kubernetes concepts:

| Mode | What User Sees | Target |
|---|---|---|
| **Simple** | Flat VM list, no tree | Single team, POC, day 1 |
| **Projects** | Project → Folder → VM tree | Multi-team, enterprise |
| **Kubernetes** | Cluster → Namespace → VM + labels | Power users, K8s admins |

The admin graduates from Simple to Kubernetes at their own pace. No mode requires Kubernetes knowledge.

## Key Decisions

- **Project = Namespace** — Each project creates and owns a Kubernetes namespace. This gives real isolation (RBAC, quotas, network policies) without exposing namespace terminology.
- **Folder = Label** — Subfolders within a project are stored as a label on the VM (`kubevmui.io/folder: "Production/Web Servers"`). No K8s resource created — instant rename, drag-and-drop, unlimited depth.
- **Project CRD replaces Tenant CRD** — The self-service portal's Tenant concept is merged into the Project CRD. One abstraction for ownership, quotas, and organization.
- **Default project** — In Simple mode, all VMs go in a `default` project (namespace: `kubevmui-default`). Never use the K8s `default` namespace.
- **Folder tree stored in Project CRD** — Empty folders persist via the Project spec, not just derived from VM labels.
- **Cross-cluster projects** — A project name can exist on multiple clusters. The UI shows a unified tree across clusters.

## Hierarchy Mapping

| UI Concept | K8s Reality | VMware Equivalent | Provides |
|---|---|---|---|
| **Cluster** | K8s cluster (via ClusterManager) | vCenter / Datacenter | Full isolation |
| **Project** | Namespace + Project CRD | Resource Pool + Permissions | RBAC, quotas, network policies |
| **Folder** | Label `kubevmui.io/folder` | VM Folder | Logical grouping |
| **VM** | VirtualMachine CR | Virtual Machine | — |

Key insight: **Project = who can access + how much they can use. Folder = how they organize within their space.**

A project admin can create/rename/delete folders freely (just label changes) but cannot see or touch another project's VMs.

## UI Modes

### Simple Mode

Flat VM list with no organizational hierarchy. All VMs in the default project.

```
┌─── Virtual Machines ─────────────────────────────────────────────────┐
│                                                                       │
│  [+ Create VM]                              Search: [___________]    │
│                                                                       │
│  NAME           STATUS     CPU    MEMORY    IP               HOST    │
│  ─────────────────────────────────────────────────────────────────── │
│  web-01         Running    4      8 GB      192.168.1.10     node-03 │
│  web-02         Running    4      8 GB      192.168.1.11     node-02 │
│  db-01          Running    8      32 GB     192.168.1.20     node-01 │
│  dev-app-01     Stopped    2      4 GB      —                —       │
│  monitoring     Running    2      4 GB      192.168.1.30     node-03 │
│                                                                       │
│  5 VMs  |  20 cores  |  56 GB memory                                 │
└──────────────────────────────────────────────────────────────────────┘
```

No sidebar tree, no project selector, no namespace column. This is the vCenter experience for a small shop with one admin.

### Projects Mode

Sidebar tree with Projects → Folders → VMs. The primary mode for multi-team deployments.

```
┌────────────────────┬─────────────────────────────────────────────────┐
│                    │                                                  │
│  PROJECTS          │  Finance > Production > Web Servers             │
│                    │                                                  │
│  ▾ Finance    (12) │  [+ Create VM]  [+ New Folder]    Search: [__] │
│    ▾ Production    │                                                  │
│      ▸ Web Servers │  NAME       STATUS    CPU   MEM    IP           │
│      ▸ Databases   │  ──────────────────────────────────────────     │
│      ▸ Middleware   │  web-01     Running   4    8 GB   192.168.1.10 │
│    ▾ DR            │  web-02     Running   4    8 GB   192.168.1.11 │
│        web-replica │  web-03     Running   4    8 GB   192.168.1.12 │
│    ▸ Archive       │                                                  │
│                    │  3 VMs  |  12 cores  |  24 GB                   │
│  ▾ HR         (5)  │                                                  │
│    ▸ Production    │                                                  │
│    ▸ Testing       │                                                  │
│                    │                                                  │
│  ▾ Engineering (8) │                                                  │
│    ▸ Team Alpha    │                                                  │
│    ▸ Team Beta     │                                                  │
│    ▸ Sandbox       │                                                  │
│                    │                                                  │
│  ─────────────     │                                                  │
│  [+ New Project]   │                                                  │
│                    │                                                  │
└────────────────────┴─────────────────────────────────────────────────┘
```

Features:
- Collapsible folder tree in the sidebar
- VM count per project in parentheses
- Breadcrumb navigation at the top (`Finance > Production > Web Servers`)
- Click a project to see all its VMs (flat); click a folder to filter
- Drag-and-drop VMs between folders (within same project = instant label change)
- Drag-and-drop between projects shows warning (namespace migration, brief VM stop)
- Right-click folder for context menu (rename, delete, move, create subfolder)

### Kubernetes Mode

Real namespace names, labels, node placement, and K8s metadata visible.

```
┌────────────────────────┬─────────────────────────────────────────────┐
│                        │                                              │
│  NAMESPACES            │  kubevmui-finance > Production/Web Servers  │
│                        │                                              │
│  ▾ prod-cluster-01     │  NAME     STATUS   CPU  MEM   NODE    LABELS│
│    ▸ kubevmui-finance  │  ──────────────────────────────────────────│
│    ▸ kubevmui-hr       │  web-01   Running  4    8Gi   node-03  app= │
│    ▸ kubevmui-eng      │  web-02   Running  4    8Gi   node-02  app= │
│  ▾ dev-cluster-01      │  web-03   Running  4    8Gi   node-01  app= │
│    ▸ kubevmui-eng      │                                              │
│    ▸ kubevmui-qa       │  Namespace: kubevmui-finance                │
│                        │  Labels: kubevmui.io/folder=Production/Web  │
│  ─────────────         │                                              │
│  Cluster: prod-cl.. ▾  │  kubectl get vm -n kubevmui-finance \      │
│                        │    -l kubevmui.io/folder="Production/Web S" │
└────────────────────────┴─────────────────────────────────────────────┘
```

Features:
- Real namespace names shown instead of project display names
- Cluster selector at the bottom of the sidebar
- Labels column in VM table
- `kubectl` command hints at the bottom
- Node column always visible
- YAML tab available on VM detail pages

## Mode Toggle

```
┌─── Settings > Interface ─────────────────────────────────────────────┐
│                                                                       │
│  Experience Level                                                     │
│                                                                       │
│  ○ Simple                                                            │
│    All VMs in one list. Best for single-team or small deployments.   │
│                                                                       │
│  ● Projects                                                          │
│    Organize VMs into projects and folders with separate quotas and   │
│    access control. Best for multi-team environments.                 │
│                                                                       │
│  ○ Kubernetes                                                        │
│    Full Kubernetes namespace view with labels, node info, and        │
│    kubectl command hints. For Kubernetes-experienced admins.         │
│                                                                       │
│  ──────────────────────────────────────────────────────────────────  │
│                                                                       │
│  ℹ Switching modes does not move or change any VMs. It only changes │
│    how they are displayed in the interface.                           │
│                                                                       │
└──────────────────────────────────────────────────────────────────────┘
```

The mode is stored per-user (not per-cluster), so one admin can use Projects mode while another uses Kubernetes mode on the same cluster.

## Project CRD

### Schema

```yaml
apiVersion: kubevmui.io/v1
kind: Project
metadata:
  name: finance
spec:
  displayName: "Finance"
  description: "Finance department virtual infrastructure"

  # Namespace management
  namespace: kubevmui-finance          # auto-generated from name if omitted
  createNamespace: true                # create namespace if it doesn't exist

  # Ownership & access
  owners:                              # full admin access to this project
    - kind: Group
      name: finance-admins
    - kind: User
      name: jane.doe@corp.com
  members:                             # can create/manage VMs, not project settings
    - kind: Group
      name: finance-users
  viewers:                             # read-only access
    - kind: Group
      name: finance-viewers

  # Resource quotas
  quota:
    cpu: 64                            # total CPU cores
    memory: 256Gi                      # total memory
    storage: 2Ti                       # total storage
    vms: 20                            # max VM count
    runningVms: 15                     # max simultaneously running VMs

  # Folder structure (persists empty folders)
  folders:
    - name: Production
      children:
        - name: Web Servers
        - name: Databases
        - name: Middleware
    - name: DR
    - name: Archive

  # Optional: network restrictions
  allowedNetworks:                     # which Network CRs this project can use
    - pod-network
    - vlan-100-production
    - vlan-200-storage

  # Optional: template restrictions
  allowedTemplates:                    # which VM templates this project can use
    - ubuntu-22.04
    - windows-server-2022
    - rhel-9

  # Optional: node placement
  nodeSelector:                        # restrict VMs to specific nodes
    disktype: ssd
  tolerations: []

status:
  namespace: kubevmui-finance
  phase: Active                        # Active, Terminating
  vmCount: 12
  runningVmCount: 10
  resourceUsage:
    cpu: 42                            # currently allocated
    memory: 168Gi
    storage: 1.2Ti
  conditions:
    - type: NamespaceReady
      status: "True"
    - type: QuotaEnforced
      status: "True"
    - type: RBACConfigured
      status: "True"
```

### Printer Columns

```
NAME       DISPLAY NAME   VMs   RUNNING   CPU     MEMORY    PHASE    AGE
finance    Finance        12    10        42/64   168/256   Active   14d
hr         HR              5     5         8/16    24/64    Active   14d
eng        Engineering     8     6        32/48   128/192  Active   7d
```

### What the Controller Does

When a Project is created:

1. **Create namespace** `kubevmui-finance` (if `createNamespace: true`)
2. **Apply ResourceQuota** in that namespace matching `spec.quota`
3. **Create RoleBindings** for owners (admin), members (edit), viewers (view)
4. **Label namespace** with `kubevmui.io/project: finance` and `kubevmui.io/managed-by: kubevmui`
5. **Apply NetworkPolicies** if `allowedNetworks` is set (restrict which networks VMs can attach to)

When a Project is deleted:

1. **Check for running VMs** — refuse deletion if VMs exist (must be empty)
2. **Delete RoleBindings**
3. **Delete ResourceQuota**
4. **Optionally delete namespace** (configurable: keep namespace on project deletion for safety)

## Folder Storage

### On VMs (Labels)

Every VM gets a folder label:

```yaml
metadata:
  name: web-01
  namespace: kubevmui-finance
  labels:
    kubevmui.io/project: finance
    kubevmui.io/folder: "Production/Web Servers"
```

The folder label uses `/` as a path separator for nested folders.

**Label constraints:**
- Max 63 characters for label values (K8s limitation)
- Valid characters: alphanumeric, `-`, `_`, `.`, `/`
- For deep paths exceeding 63 chars, use a hash reference:

```yaml
labels:
  kubevmui.io/folder: ""                              # empty = root of project
  kubevmui.io/folder-hash: "a1b2c3"                   # short hash of full path
annotations:
  kubevmui.io/folder-path: "Production/Web Servers/US-East/Datacenter-1/Rack-3"  # full path (no length limit)
```

In practice, 63 chars covers 3-4 levels of nesting, which is sufficient for 99% of use cases.

### Folder Tree (in Project CRD)

The `spec.folders` field in the Project CRD stores the folder structure. This ensures:

- **Empty folders are visible** — a folder with no VMs still appears in the sidebar
- **Folder order is preserved** — the tree renders in the order defined
- **Rename is atomic** — rename in the CRD + relabel VMs in one operation
- **Folder metadata** — future: per-folder descriptions, colors, icons

### Folder Operations

| Operation | What Happens | Speed |
|---|---|---|
| **Create folder** | Add entry to Project `spec.folders` | Instant |
| **Rename folder** | Update Project spec + relabel all VMs in folder | Fast (batch label update) |
| **Delete folder** | Remove from spec, VMs move to parent or root | Instant |
| **Move VM within project** | Change `kubevmui.io/folder` label | Instant |
| **Move VM between projects** | Stop VM → recreate in new namespace → restart | Seconds-minutes |
| **Drag-and-drop folder** | Reorder in Project spec | Instant |


## Multi-Cluster View

### How It Works

The platform already supports multiple K8s clusters via `ClusterManager`. Projects can exist on multiple clusters with the same name — the UI shows a unified tree:

```
▾ Finance
  ▾ Production
    ▾ Web Servers
      ├── [prod-cluster] web-01, web-02, web-03
      └── [dr-cluster]   web-replica-01
    ▾ Databases
      ├── [prod-cluster] oracle-01, postgres-01
      └── [dr-cluster]   oracle-replica
  ▾ DR
      [dr-cluster] failover-lb
```

The cluster badge (`[prod-cluster]`) appears next to each VM to show where it physically runs.

### Cross-Cluster Project Sync

Projects are **not** automatically synced between clusters. Each cluster has its own Project CRDs. The UI aggregates them by matching `metadata.name`.

For admin convenience, the CLI can replicate a project across clusters:

```bash
kubevmui project sync finance --from prod-cluster --to dr-cluster
```

This creates the same Project CRD (name, quotas, RBAC, folder structure) on the target cluster.

## Default Project Behavior

### Simple Mode (Projects disabled)

- A `default` Project is auto-created on first install
- All VMs go in namespace `kubevmui-default`
- No folder label set on VMs
- No sidebar tree — just a flat VM list

```yaml
apiVersion: kubevmui.io/v1
kind: Project
metadata:
  name: default
spec:
  displayName: "Default"
  namespace: kubevmui-default
  createNamespace: true
  owners:
    - kind: Group
      name: system:authenticated    # all authenticated users
  quota: {}                         # no limits in simple mode
  folders: []
```

### Switching from Simple → Projects

When the admin enables Projects mode:

1. The `default` project remains (with all existing VMs)
2. Admin can create new projects
3. Admin can move VMs from `default` to other projects
4. The `default` project can be renamed (e.g., to "Legacy" or "Unassigned")

No VMs are moved or disrupted during the switch.

## VM Creation Flow

### Simple Mode

```
┌─── Create Virtual Machine ───────────────────────────────────────────┐
│                                                                       │
│  Name:         [web-04                        ]                      │
│  Template:     [Ubuntu 22.04 Server           ▾]                     │
│  CPU:          [4    ] cores                                         │
│  Memory:       [8    ] GB                                            │
│                                                                       │
│  ...                                                                  │
│                                                                       │
│  [Cancel]                                        [Create VM]         │
└──────────────────────────────────────────────────────────────────────┘
```

No project or folder field — VM goes to the default project.

### Projects Mode

```
┌─── Create Virtual Machine ───────────────────────────────────────────┐
│                                                                       │
│  Project:      [Finance                       ▾]                     │
│  Folder:       [Production > Web Servers      ▾]  [+ New Folder]    │
│                                                                       │
│  Name:         [web-04                        ]                      │
│  Template:     [Ubuntu 22.04 Server           ▾]                     │
│  CPU:          [4    ] cores                                         │
│  Memory:       [8    ] GB                                            │
│                                                                       │
│  ...                                                                  │
│                                                                       │
│  Quota: 42/64 CPU, 168/256 GB memory (this VM: +4 CPU, +8 GB)      │
│                                                                       │
│  [Cancel]                                        [Create VM]         │
└──────────────────────────────────────────────────────────────────────┘
```

The Project dropdown only shows projects the user has `member` or `owner` access to. The Folder dropdown shows the folder tree for the selected project. Quota bar shows current usage + what this VM will add.

### Kubernetes Mode

```
┌─── Create Virtual Machine ───────────────────────────────────────────┐
│                                                                       │
│  Namespace:    [kubevmui-finance              ▾]                     │
│  Folder:       [Production/Web Servers        ▾]  [+ New Folder]    │
│                                                                       │
│  Name:         [web-04                        ]                      │
│  Template:     [Ubuntu 22.04 Server           ▾]                     │
│  CPU:          [4    ] cores     Requests: [4   ] Limits: [4   ]    │
│  Memory:       [8    ] Gi       Requests: [8Gi ] Limits: [8Gi ]    │
│                                                                       │
│  Labels:                                                              │
│    app:  [web          ]                                             │
│    tier: [frontend     ]                                             │
│    [+ Add Label]                                                     │
│                                                                       │
│  Node Selector:                                                      │
│    disktype: [ssd      ]                                             │
│                                                                       │
│  Quota: 42/64 CPU, 168/256 Gi memory                                │
│                                                                       │
│  [Cancel]                                        [Create VM]         │
└──────────────────────────────────────────────────────────────────────┘
```

Shows namespace name instead of project display name. Exposes labels, node selector, and request/limit fields.

## Contextual Learning (Kubernetes Mode)

In Projects and Kubernetes mode, show small tooltips that teach K8s concepts:

```
Project: Finance  ℹ
┌────────────────────────────────────────────────────┐
│ This project maps to Kubernetes namespace           │
│ "kubevmui-finance".                                │
│                                                     │
│ Resources in different projects (namespaces) are    │
│ isolated — they have separate quotas, access        │
│ controls, and network policies.                     │
│                                                     │
│ CLI: kubectl get vm -n kubevmui-finance             │
└────────────────────────────────────────────────────┘
```

```
Folder: Production/Web Servers  ℹ
┌────────────────────────────────────────────────────┐
│ Folders are stored as Kubernetes labels on VMs:     │
│                                                     │
│   kubevmui.io/folder: "Production/Web Servers"     │
│                                                     │
│ Folders provide visual organization but no          │
│ isolation. For isolation, use separate projects.    │
│                                                     │
│ CLI: kubectl get vm -n kubevmui-finance \           │
│   -l kubevmui.io/folder="Production/Web Servers"   │
└────────────────────────────────────────────────────┘
```

Tooltips only appear in Projects/Kubernetes modes and can be disabled in Settings.


## RBAC Model

### Roles

| Role | Scope | Can Do |
|---|---|---|
| **Platform Admin** | All clusters | Create/delete projects, manage all VMs, change settings |
| **Project Owner** | One project | Manage project settings, quotas, folders, members. Full VM control. |
| **Project Member** | One project | Create/manage VMs in the project. Cannot change project settings. |
| **Project Viewer** | One project | Read-only access to VMs. Cannot create, modify, or delete. |

### Kubernetes RBAC Mapping

When a Project is created, the controller generates these K8s resources:

```yaml
# Owner role — full access to namespace
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: kubevmui-finance-owners
  namespace: kubevmui-finance
  labels:
    kubevmui.io/project: finance
    kubevmui.io/managed-by: kubevmui
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: ClusterRole
  name: admin                         # built-in K8s admin role
subjects:
  - kind: Group
    name: finance-admins
    apiGroup: rbac.authorization.k8s.io
---
# Member role — create/manage VMs
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: kubevmui-finance-members
  namespace: kubevmui-finance
roleRef:
  kind: ClusterRole
  name: edit                          # built-in K8s edit role
subjects:
  - kind: Group
    name: finance-users
---
# Viewer role — read-only
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: kubevmui-finance-viewers
  namespace: kubevmui-finance
roleRef:
  kind: ClusterRole
  name: view                          # built-in K8s view role
subjects:
  - kind: Group
    name: finance-viewers
```

### Permission Matrix

| Action | Platform Admin | Project Owner | Project Member | Project Viewer |
|---|---|---|---|---|
| Create project | ✓ | — | — | — |
| Delete project | ✓ | — | — | — |
| Edit project settings | ✓ | ✓ | — | — |
| Manage project members | ✓ | ✓ | — | — |
| Set quotas | ✓ | ✓ | — | — |
| Create/delete folders | ✓ | ✓ | ✓ | — |
| Create VM | ✓ | ✓ | ✓ | — |
| Start/stop VM | ✓ | ✓ | ✓ | — |
| Delete VM | ✓ | ✓ | ✓ | — |
| Move VM (within project) | ✓ | ✓ | ✓ | — |
| Move VM (between projects) | ✓ | — | — | — |
| View VMs | ✓ | ✓ | ✓ | ✓ |
| Open console | ✓ | ✓ | ✓ | — |
| View other projects | ✓ | — | — | — |

## Quota Enforcement

### ResourceQuota Mapping

The Project controller creates a K8s ResourceQuota from the Project spec:

```yaml
apiVersion: v1
kind: ResourceQuota
metadata:
  name: kubevmui-project-quota
  namespace: kubevmui-finance
  labels:
    kubevmui.io/project: finance
    kubevmui.io/managed-by: kubevmui
spec:
  hard:
    requests.cpu: "64"
    requests.memory: 256Gi
    requests.storage: 2Ti
    count/virtualmachines.kubevirt.io: "20"
```

### Quota Visualization (Projects Mode)

```
┌─── Finance — Quota Usage ────────────────────────────────────────────┐
│                                                                       │
│  CPU        ████████████████████░░░░░░░░░░░░  42 / 64 cores  (66%) │
│  Memory     █████████████████████████░░░░░░░  168 / 256 GB   (66%) │
│  Storage    ████████████░░░░░░░░░░░░░░░░░░░░  1.2 / 2.0 TB  (60%) │
│  VMs        ████████████████████████░░░░░░░░  12 / 20        (60%) │
│  Running    █████████████████████████████░░░░  10 / 15        (67%) │
│                                                                       │
│  ⚠ At current growth rate, CPU quota will be reached in ~3 weeks    │
│                                                                       │
└──────────────────────────────────────────────────────────────────────┘
```

This appears at the top of the project page (in Projects mode) or as a panel in the sidebar.

## Project Management UI

### Create Project

```
┌─── New Project ──────────────────────────────────────────────────────┐
│                                                                       │
│  Name:          [finance                      ]                      │
│  Display Name:  [Finance                      ]                      │
│  Description:   [Finance department VMs        ]                     │
│                                                                       │
│  ─── Quotas ──────────────────────────────────────────────────────── │
│  CPU:           [64   ] cores                                        │
│  Memory:        [256  ] GB                                           │
│  Storage:       [2048 ] GB                                           │
│  Max VMs:       [20   ]                                              │
│  Max Running:   [15   ]                                              │
│                                                                       │
│  ─── Access ──────────────────────────────────────────────────────── │
│  Owners:        [finance-admins (Group)    ] [+ Add]                │
│  Members:       [finance-users (Group)     ] [+ Add]                │
│  Viewers:       [finance-viewers (Group)   ] [+ Add]                │
│                                                                       │
│  ─── Restrictions (optional) ─────────────────────────────────────── │
│  Allowed Networks:   [☑ pod-network  ☑ vlan-100  ☐ vlan-200]       │
│  Allowed Templates:  [☑ All templates                      ]        │
│  Node Selector:      [                                     ]        │
│                                                                       │
│  [Cancel]                                       [Create Project]     │
└──────────────────────────────────────────────────────────────────────┘
```

### Project Settings

```
┌─── Finance — Settings ───────────────────────────────────────────────┐
│                                                                       │
│  [General]  [Quotas]  [Members]  [Networks]  [Templates]            │
│                                                                       │
│  ─── Members ─────────────────────────────────────────────────────── │
│                                                                       │
│  ROLE      TYPE    NAME                STATUS                        │
│  ─────────────────────────────────────────────────                   │
│  Owner     Group   finance-admins      Active (3 users)             │
│  Owner     User    jane.doe@corp.com   Active                        │
│  Member    Group   finance-users       Active (12 users)            │
│  Viewer    Group   finance-viewers     Active (5 users)             │
│                                                                       │
│  [+ Add Member]                                                      │
│                                                                       │
│  ─── Danger Zone ─────────────────────────────────────────────────── │
│                                                                       │
│  [Delete Project]  ⚠ Requires all VMs to be deleted first           │
│                                                                       │
└──────────────────────────────────────────────────────────────────────┘
```


## API Endpoints

### Project CRUD

```
GET    /api/v1/projects                              # List all projects (filtered by RBAC)
POST   /api/v1/projects                              # Create project
GET    /api/v1/projects/{project}                    # Get project details
PUT    /api/v1/projects/{project}                    # Update project
DELETE /api/v1/projects/{project}                    # Delete project (must be empty)
```

### Folder Operations

```
POST   /api/v1/projects/{project}/folders            # Create folder
PUT    /api/v1/projects/{project}/folders/{path}     # Rename/move folder
DELETE /api/v1/projects/{project}/folders/{path}     # Delete folder (VMs move to parent)
```

### VM Operations (scoped to project)

```
GET    /api/v1/projects/{project}/vms                # List VMs in project
GET    /api/v1/projects/{project}/vms?folder=Production/Web Servers  # Filter by folder
POST   /api/v1/projects/{project}/vms                # Create VM in project
POST   /api/v1/projects/{project}/vms/{vm}/move      # Move VM to different folder/project
```

### Backward Compatibility

The existing namespace-based API continues to work:

```
GET    /api/v1/clusters/{cluster}/namespaces/{namespace}/vms
```

The new project API is an overlay that translates project names to namespaces. Both APIs are always available regardless of UI mode.

## Backend Implementation

### Project Controller

```python
# backend/app/services/project_service.py

class ProjectService:
    """Manages Project CRDs and their backing K8s resources."""

    async def create_project(self, project: ProjectCreate) -> Project:
        """
        1. Create Project CRD
        2. Create namespace (if createNamespace=true)
        3. Apply ResourceQuota
        4. Create RoleBindings for owners/members/viewers
        5. Label namespace with kubevmui.io/project
        """

    async def delete_project(self, name: str) -> None:
        """
        1. Check no VMs exist in the project namespace
        2. Delete RoleBindings
        3. Delete ResourceQuota
        4. Optionally delete namespace
        5. Delete Project CRD
        """

    async def list_projects(self, user: str) -> list[Project]:
        """
        List projects the user has access to.
        Uses SelfSubjectAccessReview to filter by RBAC.
        """

    async def get_folder_tree(self, project: str) -> FolderTree:
        """
        Build folder tree from:
        1. Project spec.folders (for structure + empty folders)
        2. VM labels (for VM counts per folder)
        """

    async def move_vm(self, vm: str, from_project: str, to_project: str,
                      to_folder: str = "") -> None:
        """
        Move VM between projects (namespace migration):
        1. Export VM spec
        2. Stop VM (if running)
        3. Delete VM in source namespace
        4. Create VM in target namespace with new folder label
        5. Start VM (if was running)
        """
```

### Folder Tree Builder

```python
# backend/app/services/folder_service.py

@dataclass
class FolderNode:
    name: str
    path: str                        # "Production/Web Servers"
    children: list["FolderNode"]
    vm_count: int                    # VMs directly in this folder
    total_vm_count: int              # VMs in this folder + all subfolders

def build_folder_tree(project_spec: dict, vms: list[VM]) -> FolderNode:
    """
    Merge the folder structure from Project spec with actual VM counts.

    1. Build tree from spec.folders (preserves empty folders)
    2. Walk VM labels to count VMs per folder
    3. VMs with no folder label → root level
    4. VMs with folder label not in spec → auto-create folder node
    """
```

### Frontend Store

```typescript
// frontend/src/stores/project-store.ts

interface ProjectStore {
  // State
  projects: Project[]
  activeProject: string | null
  activeFolder: string | null          // path like "Production/Web Servers"
  uiMode: 'simple' | 'projects' | 'kubernetes'

  // Actions
  fetchProjects: () => Promise<void>
  setActiveProject: (name: string) => void
  setActiveFolder: (path: string | null) => void
  setUIMode: (mode: UIMode) => void

  // Computed
  folderTree: () => FolderNode         // tree for active project
  filteredVMs: () => VM[]              // VMs in active project+folder
  quotaUsage: () => QuotaUsage         // usage for active project
}
```

## Migration Path

### From Current Codebase

The current codebase uses namespace selectors in the sidebar. Here's what changes:

| Current | New (Simple) | New (Projects) | New (Kubernetes) |
|---|---|---|---|
| Namespace dropdown | Removed | Project tree sidebar | Namespace dropdown (like today) |
| `/clusters/{c}/namespaces/{n}/vms` | `/projects/default/vms` | `/projects/{p}/vms?folder=...` | `/clusters/{c}/namespaces/{n}/vms` |
| Namespace column in VM table | Hidden | Hidden (folder in breadcrumb) | Shown |

### Database/State Migration

No migration needed. The Project CRD is additive:

1. Install Project CRD
2. Auto-create `default` Project pointing to `kubevmui-default` namespace
3. Existing VMs (if any) get `kubevmui.io/project: default` label
4. UI defaults to Simple mode
5. Admin switches to Projects mode when ready

## Comparison with Competitors

| Feature | This Platform | OpenShift Virt | Harvester | kubevirt-manager |
|---|---|---|---|---|
| Hide namespaces | ✓ (Simple mode) | No | No | No |
| Project abstraction | ✓ (Project CRD) | ✓ (OpenShift Project) | No | No |
| Nested folders | ✓ (unlimited depth) | ✓ (4.18 tree view) | No | No |
| Folder = K8s label | ✓ | No (separate API) | — | — |
| Mode toggle | ✓ (3 modes) | No | No | No |
| VMware-like tree | ✓ | Partial (4.18+) | No | No |
| Cross-cluster view | ✓ | No (single cluster) | No (single cluster) | No |
| Quota per project | ✓ | ✓ | No | No |
| Learning tooltips | ✓ | No | No | No |
| No K8s knowledge required | ✓ (Simple mode) | No | No | No |

## Implementation Phases

### Phase 1: Project CRD + Simple Mode (1 week)
- Project CRD schema + controller (create namespace, quota, RBAC)
- Auto-create `default` project on install
- Simple mode: flat VM list (current behavior minus namespace selector)
- Settings toggle for UI mode (only Simple active)

### Phase 2: Projects Mode + Folder Tree (2 weeks)
- Sidebar folder tree component (collapsible, VM counts)
- Folder CRUD (create, rename, delete, drag-and-drop reorder)
- VM creation with project/folder selection
- Breadcrumb navigation
- Quota visualization bar

### Phase 3: Kubernetes Mode (1 week)
- Namespace view with real names
- Labels/annotations visible in VM table and detail
- kubectl command hints
- Node column always visible

### Phase 4: Advanced Features (2 weeks)
- Drag-and-drop VMs between folders (label change)
- Move VMs between projects (namespace migration with warning)
- Cross-cluster project view (aggregate by project name)
- Contextual learning tooltips
- Project sync CLI command

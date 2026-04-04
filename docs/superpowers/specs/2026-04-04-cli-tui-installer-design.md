# Platform CLI & TUI Installer — Design Spec

**Date:** 2026-04-04
**Status:** Draft

## Problem

Installing a full virtualization stack (Talos Linux + Kubernetes + KubeVirt + CNI + Storage + UI) requires deep expertise across multiple domains. A VMware admin replacing vSphere expects a streamlined install experience — not dozens of YAML files and CLI commands across different tools.

The platform needs a single CLI binary that:
1. Discovers bare-metal nodes on the network
2. Installs Talos Linux on them
3. Bootstraps a Kubernetes cluster
4. Deploys the full platform stack (KubeVirt, CNI, storage, UI)
5. Provides ongoing cluster management (upgrade, scale, backup)

## Solution

A **Go CLI with an interactive TUI** (Terminal User Interface) built with [Charm Bubbletea](https://github.com/charmbracelet/bubbletea). The TUI provides a guided, wizard-style installation experience while the CLI supports scripted/automated deployments via flags.

The CLI is the **single entry point** for the entire platform lifecycle: install, upgrade, scale, backup, and destroy.

## Key Decisions

- **Go + Bubbletea** — Single static binary, cross-platform, excellent TUI libraries from Charm ecosystem
- **Discovery-based provisioning** — Nodes boot via PXE/iPXE, the CLI discovers them automatically via DHCP leases or mDNS
- **Talos Linux only** — No Ubuntu/RHEL support. Talos is immutable, API-managed, and purpose-built for Kubernetes. Reduces support matrix to one OS.
- **Opinionated defaults** — The installer picks sane defaults (Calico CNI, Longhorn storage, 3 control planes). Advanced users can override.
- **Idempotent operations** — Every command can be re-run safely. Failed installs can be resumed.
- **No SSH** — Talos has no SSH. All node management goes through the Talos API. This is a feature, not a limitation.

## CLI Structure

```
kubevmui                          # (or platform name TBD)
├── init                          # Initialize a new cluster config
├── install                       # Interactive TUI installer
├── node
│   ├── list                      # List discovered/registered nodes
│   ├── add                       # Add a node to the cluster
│   ├── remove                    # Remove a node (drain + decommission)
│   ├── upgrade                   # Upgrade Talos on a node
│   └── reset                     # Wipe and reset a node
├── cluster
│   ├── status                    # Cluster health overview
│   ├── upgrade                   # Upgrade Kubernetes version
│   ├── backup                    # Backup etcd + platform state
│   ├── restore                   # Restore from backup
│   └── destroy                   # Tear down the entire cluster
├── platform
│   ├── status                    # Platform component status
│   ├── upgrade                   # Upgrade platform components
│   └── config                    # View/edit platform configuration
└── version                       # CLI version info
```


## TUI Screens

### 1. Welcome Screen

```
┌──────────────────────────────────────────────────────────────────────┐
│                                                                      │
│        ██╗  ██╗██╗   ██╗██████╗ ███████╗██╗   ██╗███╗   ███╗        │
│        ██║ ██╔╝██║   ██║██╔══██╗██╔════╝██║   ██║████╗ ████║        │
│        █████╔╝ ██║   ██║██████╔╝█████╗  ██║   ██║██╔████╔██║        │
│        ██╔═██╗ ██║   ██║██╔══██╗██╔══╝  ╚██╗ ██╔╝██║╚██╔╝██║        │
│        ██║  ██╗╚██████╔╝██████╔╝███████╗ ╚████╔╝ ██║ ╚═╝ ██║        │
│        ╚═╝  ╚═╝ ╚═════╝ ╚═════╝ ╚══════╝  ╚═══╝  ╚═╝     ╚═╝        │
│                                                                      │
│                    Platform Installer v1.0.0                         │
│                                                                      │
│   Welcome! This wizard will guide you through setting up your        │
│   virtualization platform on bare-metal servers.                     │
│                                                                      │
│   Prerequisites:                                                     │
│   ✓  Servers booted via PXE/iPXE with Talos installer               │
│   ✓  Network connectivity between all nodes                         │
│   ✓  This machine can reach the nodes via the management network     │
│                                                                      │
│   ┌─────────────────────────────────────┐                            │
│   │  ▸ Start New Installation           │                            │
│   │    Resume Previous Installation     │                            │
│   │    Import Existing Cluster          │                            │
│   │    Exit                             │                            │
│   └─────────────────────────────────────┘                            │
│                                                                      │
│   ↑/↓ Navigate  Enter Select  q Quit                                │
└──────────────────────────────────────────────────────────────────────┘
```

### 2. Network Configuration

```
┌──────────────────────────────────────────────────────────────────────┐
│  Step 1 of 6 — Network Configuration           ██░░░░░░░░░░ 16%    │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  Management Network                                                  │
│  ┌────────────────────────────────────────────┐                      │
│  │  Subnet:       10.0.0.0/24                │                      │
│  │  Gateway:      10.0.0.1                    │                      │
│  │  DNS Servers:  10.0.0.1, 8.8.8.8          │                      │
│  │  NTP Server:   pool.ntp.org               │                      │
│  └────────────────────────────────────────────┘                      │
│                                                                      │
│  VM Network                                                          │
│  ┌────────────────────────────────────────────┐                      │
│  │  VLAN ID:      100                         │                      │
│  │  Subnet:       192.168.100.0/24           │                      │
│  │  DHCP:         Enabled (MetalLB range)     │                      │
│  │  Range:        192.168.100.100-200        │                      │
│  └────────────────────────────────────────────┘                      │
│                                                                      │
│  Storage Network (optional)                                          │
│  ┌────────────────────────────────────────────┐                      │
│  │  [x] Dedicated storage network             │                      │
│  │  VLAN ID:      200                         │                      │
│  │  Subnet:       10.10.0.0/24               │                      │
│  └────────────────────────────────────────────┘                      │
│                                                                      │
│  ← Back    Tab Next Field    Enter Edit    Ctrl+N Next Step →       │
└──────────────────────────────────────────────────────────────────────┘
```

### 3. Node Discovery

```
┌──────────────────────────────────────────────────────────────────────┐
│  Step 2 of 6 — Node Discovery                  ████░░░░░░░░ 33%    │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  Scanning network 10.0.0.0/24 for Talos nodes...  ⠼                 │
│                                                                      │
│  Found 5 nodes:                                                      │
│  ┌────┬──────────────┬───────────────────┬────────┬────────┬───────┐ │
│  │    │ IP Address   │ MAC Address       │ CPU    │ Memory │ Disk  │ │
│  ├────┼──────────────┼───────────────────┼────────┼────────┼───────┤ │
│  │ ✓  │ 10.0.0.11    │ aa:bb:cc:dd:01:11 │ 32C    │ 128 GB │ 2 TB  │ │
│  │ ✓  │ 10.0.0.12    │ aa:bb:cc:dd:01:12 │ 32C    │ 128 GB │ 2 TB  │ │
│  │ ✓  │ 10.0.0.13    │ aa:bb:cc:dd:01:13 │ 32C    │ 128 GB │ 2 TB  │ │
│  │ ✓  │ 10.0.0.21    │ aa:bb:cc:dd:02:21 │ 64C    │ 256 GB │ 4 TB  │ │
│  │ ✓  │ 10.0.0.22    │ aa:bb:cc:dd:02:22 │ 64C    │ 256 GB │ 4 TB  │ │
│  └────┴──────────────┴───────────────────┴────────┴────────┴───────┘ │
│                                                                      │
│  Total: 5 nodes | 224 cores | 896 GB RAM | 12 TB storage            │
│                                                                      │
│  [Refresh]  [Add manually]  [Wait for more nodes...]                │
│                                                                      │
│  Tip: New nodes will appear automatically as they PXE boot.          │
│  Space to toggle selection, a to select all.                         │
│                                                                      │
│  ← Back                                               Next Step →   │
└──────────────────────────────────────────────────────────────────────┘
```


### 4. Role Assignment

```
┌──────────────────────────────────────────────────────────────────────┐
│  Step 3 of 6 — Role Assignment                  ██████░░░░░░ 50%   │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  Assign roles to discovered nodes. You need at least 1 control      │
│  plane node (3 recommended for HA).                                  │
│                                                                      │
│  ┌──────────────┬─────────────────┬────────┬────────┬──────────────┐ │
│  │ IP Address   │ Hardware        │ Role   │ Name   │ Status       │ │
│  ├──────────────┼─────────────────┼────────┼────────┼──────────────┤ │
│  │ 10.0.0.11    │ 32C/128G/2T     │ ▸ CP   │ cp-01  │ Ready        │ │
│  │ 10.0.0.12    │ 32C/128G/2T     │   CP   │ cp-02  │ Ready        │ │
│  │ 10.0.0.13    │ 32C/128G/2T     │   CP   │ cp-03  │ Ready        │ │
│  │ 10.0.0.21    │ 64C/256G/4T     │ Worker │ wk-01  │ Ready        │ │
│  │ 10.0.0.22    │ 64C/256G/4T     │ Worker │ wk-02  │ Ready        │ │
│  └──────────────┴─────────────────┴────────┴────────┴──────────────┘ │
│                                                                      │
│  Summary:                                                            │
│  ● Control Plane: 3 nodes (HA enabled ✓)                            │
│  ● Workers:       2 nodes                                            │
│  ● Total CPU:     224 cores (192 allocatable for VMs)               │
│  ● Total Memory:  896 GB (832 GB allocatable for VMs)               │
│  ● Total Storage: 12 TB (Longhorn 2-replica = 6 TB usable)          │
│                                                                      │
│  Tab Switch role   Enter Edit name   Space Toggle                   │
│                                                                      │
│  ← Back                                               Next Step →   │
└──────────────────────────────────────────────────────────────────────┘
```

### 5. Platform Options

```
┌──────────────────────────────────────────────────────────────────────┐
│  Step 4 of 6 — Platform Configuration          ████████░░░░ 66%    │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  Kubernetes Version                                                  │
│  ┌────────────────────────────────────────────┐                      │
│  │  ▸ v1.31.2 (latest stable, recommended)   │                      │
│  │    v1.30.6 (previous stable)              │                      │
│  │    v1.29.10 (maintenance)                 │                      │
│  └────────────────────────────────────────────┘                      │
│                                                                      │
│  CNI Plugin                                                          │
│  ┌────────────────────────────────────────────┐                      │
│  │  ▸ Calico (recommended — full firewall     │                      │
│  │    policy support, BGP, network policies)  │                      │
│  │    Cilium (eBPF-based, advanced            │                      │
│  │    observability via Hubble)               │                      │
│  └────────────────────────────────────────────┘                      │
│                                                                      │
│  Storage                                                             │
│  ┌────────────────────────────────────────────┐                      │
│  │  ▸ Longhorn (recommended — replicated      │                      │
│  │    block storage, snapshots, backup)       │                      │
│  │    Rook-Ceph (high performance,            │                      │
│  │    requires 3+ storage nodes)              │                      │
│  │    Local Path (single-node/dev only)       │                      │
│  └────────────────────────────────────────────┘                      │
│                                                                      │
│  Additional Components                                               │
│  ┌────────────────────────────────────────────┐                      │
│  │  [x] Prometheus + Grafana (monitoring)     │                      │
│  │  [x] Platform Web UI                       │                      │
│  │  [ ] Velero (backup to S3)                 │                      │
│  │  [ ] Cert-Manager (TLS certificates)       │                      │
│  │  [ ] Harbor (container registry)           │                      │
│  └────────────────────────────────────────────┘                      │
│                                                                      │
│  ← Back                                               Next Step →   │
└──────────────────────────────────────────────────────────────────────┘
```

### 6. Review & Confirm

```
┌──────────────────────────────────────────────────────────────────────┐
│  Step 5 of 6 — Review Configuration            ██████████░░ 83%    │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌─── Cluster ───────────────────────────────────────────────────┐   │
│  │  Name:          production-01                                 │   │
│  │  Kubernetes:    v1.31.2                                       │   │
│  │  Talos:         v1.9.1                                        │   │
│  │  Control Plane: 3 nodes (HA)                                  │   │
│  │  Workers:       2 nodes                                       │   │
│  └───────────────────────────────────────────────────────────────┘   │
│                                                                      │
│  ┌─── Network ───────────────────────────────────────────────────┐   │
│  │  Management:    10.0.0.0/24  (gateway 10.0.0.1)              │   │
│  │  VM Network:    VLAN 100 — 192.168.100.0/24                  │   │
│  │  Storage:       VLAN 200 — 10.10.0.0/24                      │   │
│  │  Pod CIDR:      10.244.0.0/16                                │   │
│  │  Service CIDR:  10.96.0.0/12                                 │   │
│  └───────────────────────────────────────────────────────────────┘   │
│                                                                      │
│  ┌─── Platform ──────────────────────────────────────────────────┐   │
│  │  CNI:           Calico v3.28                                  │   │
│  │  Storage:       Longhorn v1.7 (2 replicas)                   │   │
│  │  KubeVirt:      v1.4.0                                       │   │
│  │  CDI:           v1.60.0                                       │   │
│  │  Monitoring:    Prometheus + Grafana                          │   │
│  │  Web UI:        Platform UI v1.0                              │   │
│  └───────────────────────────────────────────────────────────────┘   │
│                                                                      │
│  ⚠  This will install Talos Linux on 5 nodes. All existing data     │
│     on these disks will be erased.                                   │
│                                                                      │
│  ← Back            [Cancel]              [▸ Begin Installation] →   │
└──────────────────────────────────────────────────────────────────────┘
```

### 7. Installation Progress

```
┌──────────────────────────────────────────────────────────────────────┐
│  Step 6 of 6 — Installing                      ████████████ 100%   │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  Phase 1: Talos Linux Installation                                   │
│  ✓ cp-01 (10.0.0.11)   Talos installed, rebooting       [00:42]    │
│  ✓ cp-02 (10.0.0.12)   Talos installed, rebooting       [00:38]    │
│  ✓ cp-03 (10.0.0.13)   Talos installed, rebooting       [00:41]    │
│  ✓ wk-01 (10.0.0.21)   Talos installed, rebooting       [00:35]    │
│  ⠸ wk-02 (10.0.0.22)   Writing disk image... 87%        [00:33]    │
│                                                                      │
│  Phase 2: Kubernetes Bootstrap                                       │
│  ◌ Waiting for control plane nodes to come online...                │
│  ◌ Bootstrap etcd cluster                                            │
│  ◌ Initialize Kubernetes API server                                  │
│  ◌ Join remaining control plane nodes                                │
│  ◌ Join worker nodes                                                 │
│                                                                      │
│  Phase 3: Platform Components                                        │
│  ◌ Install Calico CNI                                                │
│  ◌ Install Longhorn storage                                          │
│  ◌ Install KubeVirt + CDI                                            │
│  ◌ Install Prometheus + Grafana                                      │
│  ◌ Install Platform Web UI                                           │
│  ◌ Run post-install health checks                                    │
│                                                                      │
│  Elapsed: 02:49    Estimated remaining: ~12:00                       │
│                                                                      │
│  [View Logs]                                            [Cancel]    │
└──────────────────────────────────────────────────────────────────────┘
```

### 8. Installation Complete

```
┌──────────────────────────────────────────────────────────────────────┐
│                                                                      │
│                    ✓ Installation Complete!                           │
│                                                                      │
│  Cluster "production-01" is ready.                                   │
│                                                                      │
│  ┌─── Access ────────────────────────────────────────────────────┐   │
│  │                                                               │   │
│  │  Web UI:        https://10.0.0.11:8443                       │   │
│  │  Kubernetes:    export KUBECONFIG=~/.kube/production-01      │   │
│  │  Talos:         talosctl --talosconfig=~/.talos/production-01│   │
│  │                                                               │   │
│  │  Admin user:    admin                                         │   │
│  │  Admin token:   eyJhbGciOi... (saved to ~/.platform/token)  │   │
│  │                                                               │   │
│  └───────────────────────────────────────────────────────────────┘   │
│                                                                      │
│  ┌─── Cluster Health ────────────────────────────────────────────┐   │
│  │  Nodes:        5/5 Ready                                     │   │
│  │  Pods:         47/47 Running                                 │   │
│  │  Storage:      6.0 TB usable (Longhorn 2-replica)           │   │
│  │  KubeVirt:     ✓ Ready (live migration enabled)              │   │
│  │  Networking:   ✓ Calico BGP peered                           │   │
│  │  Monitoring:   ✓ Prometheus scraping 12 targets              │   │
│  └───────────────────────────────────────────────────────────────┘   │
│                                                                      │
│  Next steps:                                                         │
│  1. Open the Web UI to create your first VM                         │
│  2. Run: kubevmui cluster status  — to check cluster health         │
│  3. Run: kubevmui platform status — to check component versions     │
│                                                                      │
│  [Open Web UI]    [View Logs]    [Exit]                             │
└──────────────────────────────────────────────────────────────────────┘
```


### 9. Cluster Status (Post-Install)

```
$ kubevmui cluster status

┌─── Cluster: production-01 ───────────────────────────────────────────┐
│                                                                       │
│  Kubernetes: v1.31.2    Talos: v1.9.1    Uptime: 14d 6h             │
│                                                                       │
│  Nodes                                                                │
│  ┌──────────┬──────────┬────────┬────────────┬───────────┬──────────┐ │
│  │ Name     │ Role     │ Status │ CPU        │ Memory    │ VMs      │ │
│  ├──────────┼──────────┼────────┼────────────┼───────────┼──────────┤ │
│  │ cp-01    │ Control  │ ✓ Ready│  8% ░░░░░  │ 12% █░░░░ │ —        │ │
│  │ cp-02    │ Control  │ ✓ Ready│  6% ░░░░░  │ 11% █░░░░ │ —        │ │
│  │ cp-03    │ Control  │ ✓ Ready│  7% ░░░░░  │ 10% █░░░░ │ —        │ │
│  │ wk-01    │ Worker   │ ✓ Ready│ 62% █████░ │ 71% █████░│ 12       │ │
│  │ wk-02    │ Worker   │ ✓ Ready│ 45% ███░░░ │ 58% ████░░│  8       │ │
│  └──────────┴──────────┴────────┴────────────┴───────────┴──────────┘ │
│                                                                       │
│  Resources                                                            │
│  CPU:     54/192 cores used (28%)   ████████░░░░░░░░░░░░░░░░░░░░    │
│  Memory:  412/832 GB used (49%)     ████████████████░░░░░░░░░░░░    │
│  Storage: 2.1/6.0 TB used (35%)    ███████████░░░░░░░░░░░░░░░░░    │
│  VMs:     20 running, 3 stopped                                      │
│                                                                       │
│  Alerts: None                                                        │
└──────────────────────────────────────────────────────────────────────┘
```

### 10. Node Add (Day-2 Operation)

```
$ kubevmui node add

┌──────────────────────────────────────────────────────────────────────┐
│  Add Node to Cluster: production-01                                  │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  Scanning for new Talos nodes not yet in the cluster...  ⠼          │
│                                                                      │
│  Found 1 new node:                                                   │
│  ┌────┬──────────────┬───────────────────┬────────┬────────┬───────┐ │
│  │    │ IP Address   │ MAC Address       │ CPU    │ Memory │ Disk  │ │
│  ├────┼──────────────┼───────────────────┼────────┼────────┼───────┤ │
│  │ ▸  │ 10.0.0.23    │ aa:bb:cc:dd:02:23 │ 64C    │ 256 GB │ 4 TB  │ │
│  └────┴──────────────┴───────────────────┴────────┴────────┴───────┘ │
│                                                                      │
│  Role: ▸ Worker  ○ Control Plane                                    │
│  Name: wk-03                                                         │
│                                                                      │
│  This will:                                                          │
│  1. Apply Talos machine config to 10.0.0.23                         │
│  2. Join the node to the Kubernetes cluster                          │
│  3. Configure Longhorn storage on local disks                        │
│  4. Mark the node schedulable for VM workloads                       │
│                                                                      │
│  [Cancel]                                        [▸ Add Node] →     │
└──────────────────────────────────────────────────────────────────────┘
```

### 11. Platform Upgrade

```
$ kubevmui platform upgrade

┌──────────────────────────────────────────────────────────────────────┐
│  Platform Upgrade                                                    │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  Current versions → Available upgrades:                              │
│                                                                      │
│  ┌───────────────┬───────────────┬───────────────┬─────────────────┐ │
│  │ Component     │ Current       │ Available     │ Action          │ │
│  ├───────────────┼───────────────┼───────────────┼─────────────────┤ │
│  │ Talos Linux   │ v1.9.1        │ v1.9.2        │ [x] Upgrade    │ │
│  │ Kubernetes    │ v1.31.2       │ v1.31.3       │ [x] Upgrade    │ │
│  │ KubeVirt      │ v1.4.0        │ v1.4.0        │     Up to date │ │
│  │ Calico        │ v3.28.0       │ v3.28.2       │ [x] Upgrade    │ │
│  │ Longhorn      │ v1.7.0        │ v1.7.1        │ [x] Upgrade    │ │
│  │ Platform UI   │ v1.0.0        │ v1.1.0        │ [x] Upgrade    │ │
│  │ Prometheus    │ v2.54.0       │ v2.54.0       │     Up to date │ │
│  └───────────────┴───────────────┴───────────────┴─────────────────┘ │
│                                                                      │
│  Upgrade strategy:                                                   │
│  ● Talos/K8s: Rolling node-by-node (zero downtime)                  │
│  ● Helm charts: Rolling deployment                                   │
│  ● VMs will NOT be restarted (live migration during node drain)     │
│                                                                      │
│  ⚠  Estimated duration: ~25 minutes for 5 nodes                     │
│                                                                      │
│  [Cancel]              [View Changelog]     [▸ Begin Upgrade] →     │
└──────────────────────────────────────────────────────────────────────┘
```


## CLI Installer Output (Non-Interactive)

The primary install experience is a **streaming CLI output** — no interactive TUI needed. The admin prepares a config directory, runs a single command, and watches the install progress in their terminal. This is the VMware-admin-friendly experience: one command, watch it go.

### Full Install Flow

```
$ kubevmui install --config cluster/prod-virt-01/

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  KubeVM UI Platform Installer
  Cluster: prod-virt-01 (3 nodes expected)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Phase 1: Waiting for nodes to boot into Talos maintenance mode...

  Boot your servers from the Talos ISO now.
  The installer will detect them automatically.

  Expected nodes:
    ○ node-01 (MAC: aa:bb:cc:dd:ee:01)
    ○ node-02 (MAC: aa:bb:cc:dd:ee:02)
    ○ node-03 (MAC: aa:bb:cc:dd:ee:03)

  Scanning network 10.0.1.0/24 for Talos API (port 50000)...

  10:00:12  ● node-01 discovered at 10.0.1.1 (matched by MAC)
  10:00:12    → Applying Talos config... done ✓
  10:00:12    → Node is installing to /dev/sda...

  10:01:45  ● node-03 discovered at 10.0.1.3 (matched by MAC)
  10:01:45    → Applying Talos config... done ✓
  10:01:45    → Node is installing to /dev/sda...

  Waiting for remaining nodes... (1 of 3 remaining)
  ○ node-02 — not yet detected. Boot this server now.

  10:03:20  ● node-02 discovered at 10.0.1.2 (matched by MAC)
  10:03:20    → Applying Talos config... done ✓
  10:03:20    → Node is installing to /dev/sda...

  All 3 nodes discovered and configured ✓

Phase 2: Waiting for nodes to reboot and become ready...

  ● node-01  installing... rebooting... booted ✓  (3m 12s)
  ● node-03  installing... rebooting... booted ✓  (3m 28s)
  ● node-02  installing... rebooting... booted ✓  (3m 45s)

Phase 3: Bootstrapping Kubernetes...

  → Initializing etcd on node-01 ✓
  → node-01 control plane ready ✓
  → node-02 joined cluster ✓
  → node-03 joined cluster ✓
  → Cluster healthy (3/3 nodes Ready) ✓

Phase 4: Installing virtualization stack...

  [1/9]  Calico CNI ................ ✓  (45s)
  [2/9]  MetalLB .................. ✓  (15s)
  [3/9]  Longhorn Storage ......... ✓  (2m 10s)
  [4/9]  KubeVirt ................. ✓  (1m 30s)
  [5/9]  CDI ...................... ✓  (30s)
  [6/9]  Multus + Bridge CNI ...... ✓  (20s)
  [7/9]  NMState .................. ✓  (25s)
  [8/9]  Prometheus ............... ✓  (1m 15s)
  [9/9]  KubeVM UI ................ ✓  (45s)

Phase 5: Post-install validation...

  ✓ All nodes healthy
  ✓ KubeVirt ready (virt-handler on all nodes)
  ✓ Storage ready (Longhorn replicas: 3)
  ✓ Networking ready (Calico + Multus)
  ✓ Monitoring ready (Prometheus scraping)
  ✓ KubeVM UI accessible at https://kubevmui.corp.local

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Installation complete! (Total: 14 minutes)

  KubeVM UI:   https://kubevmui.corp.local
  Admin user:  admin
  Admin pass:  xK9m-2pQr-Fj7n-Lw4v  (change on first login)

  Files saved:
    cluster/prod-virt-01/kubeconfig
    cluster/prod-virt-01/talosconfig

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### Node Add (Day-2)

```
$ kubevmui node add --cluster prod-virt-01 --role worker

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Add Node to Cluster: prod-virt-01
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Scanning network 10.0.1.0/24 for new Talos nodes...

  10:15:33  ● New node discovered at 10.0.1.4 (MAC: aa:bb:cc:dd:ee:04)
            Hardware: 64C / 256 GB RAM / 4 TB NVMe
            → Applying worker config... done ✓
            → Installing to /dev/nvme0n1...
            → Rebooting... booted ✓  (3m 05s)
            → Joined Kubernetes cluster ✓
            → Longhorn storage configured ✓
            → Node schedulable ✓

  Node "node-04" added successfully. (Total: 4m 12s)

  Cluster now: 4 nodes | 192 cores | 768 GB RAM
```

### Cluster Status

```
$ kubevmui cluster status --cluster prod-virt-01

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Cluster: prod-virt-01          Uptime: 14d 6h 23m
  Kubernetes: v1.31.2            Talos: v1.9.1
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  NODES
  NAME      ROLE     STATUS   CPU        MEMORY     VMs
  node-01   CP       Ready     8% ░░░░   12% █░░░   —
  node-02   CP       Ready     6% ░░░░   11% █░░░   —
  node-03   Worker   Ready    62% █████  71% █████   12
  node-04   Worker   Ready    45% ███░░  58% ████░    8

  RESOURCES
  CPU:      54/192 cores  (28%)   ████████░░░░░░░░░░░░░░░░░░
  Memory:  412/768 GB     (54%)   ████████████████░░░░░░░░░░
  Storage: 2.1/8.0 TB     (26%)  ████████░░░░░░░░░░░░░░░░░░
  VMs:     20 running, 3 stopped

  COMPONENTS
  ✓ KubeVirt v1.4.0       ✓ Calico v3.28.0
  ✓ CDI v1.60.0           ✓ Longhorn v1.7.0
  ✓ Prometheus v2.54.0    ✓ KubeVM UI v1.0.0

  ALERTS: None
```

### Platform Upgrade

```
$ kubevmui platform upgrade --cluster prod-virt-01

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Platform Upgrade: prod-virt-01
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Available upgrades:

  COMPONENT        CURRENT     AVAILABLE    STATUS
  Talos Linux      v1.9.1      v1.9.2       Update available
  Kubernetes       v1.31.2     v1.31.3      Update available
  KubeVirt         v1.4.0      v1.4.0       Up to date
  Calico           v3.28.0     v3.28.2      Update available
  Longhorn         v1.7.0      v1.7.1       Update available
  KubeVM UI        v1.0.0      v1.1.0       Update available
  Prometheus       v2.54.0     v2.54.0      Up to date

  Upgrade strategy: Rolling (zero VM downtime)
  Estimated duration: ~25 minutes for 4 nodes

  Proceed? [y/N] y

  Upgrading Talos Linux v1.9.1 → v1.9.2...
    → node-01  upgrading... rebooted ✓  (2m 15s)
    → node-02  upgrading... rebooted ✓  (2m 20s)
    → node-03  upgrading... rebooted ✓  (2m 18s)  [VMs live-migrated]
    → node-04  upgrading... rebooted ✓  (2m 22s)  [VMs live-migrated]

  Upgrading Kubernetes v1.31.2 → v1.31.3...
    → Control plane upgraded ✓  (1m 30s)
    → Kubelets rolling restart ✓  (3m 10s)

  Upgrading Helm charts...
    [1/3]  Calico v3.28.0 → v3.28.2 ........ ✓  (30s)
    [2/3]  Longhorn v1.7.0 → v1.7.1 ........ ✓  (45s)
    [3/3]  KubeVM UI v1.0.0 → v1.1.0 ....... ✓  (20s)

  Post-upgrade validation...
    ✓ All nodes healthy (4/4 Ready)
    ✓ All VMs running (20/20)
    ✓ All components healthy

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Upgrade complete! (Total: 18 minutes, 0 VM downtime)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### Cluster Backup

```
$ kubevmui cluster backup --cluster prod-virt-01 --dest s3://backups/

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Backup: prod-virt-01
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  → Snapshotting etcd ..................... ✓  (8s)
  → Backing up Talos machine configs ...... ✓  (2s)
  → Backing up Helm release state ......... ✓  (3s)
  → Backing up platform CRDs .............. ✓  (5s)
  → Uploading to s3://backups/ ............ ✓  (12s)

  Backup saved: s3://backups/prod-virt-01/2026-04-04T10-30-00Z.tar.gz
  Size: 48 MB | Includes: etcd + configs + CRDs + Helm state
```

### Error Handling Example

```
$ kubevmui install --config cluster/prod-virt-01/

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  KubeVM UI Platform Installer
  Cluster: prod-virt-01 (3 nodes expected)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Phase 1: Waiting for nodes to boot into Talos maintenance mode...

  10:00:12  ● node-01 discovered at 10.0.1.1 (matched by MAC)
  10:00:12    → Applying Talos config... done ✓

  10:01:45  ● node-03 discovered at 10.0.1.3 (matched by MAC)
  10:01:45    → Applying Talos config... done ✓

  ⚠ node-02 not detected after 10 minutes.
    MAC: aa:bb:cc:dd:ee:02

    Troubleshooting:
    • Verify the server is powered on and PXE booting
    • Check that it's on the 10.0.1.0/24 network
    • Verify MAC address in cluster/prod-virt-01/nodes.yaml

    Options:
    [w] Keep waiting    [s] Skip this node    [a] Abort install

  > w

  10:12:30  ● node-02 discovered at 10.0.1.2 (matched by MAC)
  10:12:30    → Applying Talos config... done ✓

  All 3 nodes discovered and configured ✓

  ...
```

### Config Directory Structure

The CLI uses a **directory-based config** (not a single YAML file) for clarity:

```
cluster/
└── prod-virt-01/
    ├── cluster.yaml          # Cluster-level settings
    ├── nodes.yaml            # Node definitions (MAC, role, name)
    ├── network.yaml          # Network configuration
    ├── platform.yaml         # Platform components to install
    ├── kubeconfig            # (generated after install)
    └── talosconfig           # (generated after install)
```

**cluster.yaml:**
```yaml
apiVersion: kubevmui.io/v1
kind: ClusterConfig
metadata:
  name: prod-virt-01
spec:
  kubernetes:
    version: v1.31.2
  talos:
    version: v1.9.1
  controlPlaneEndpoint: 10.0.1.10  # VIP for HA control plane
```

**nodes.yaml:**
```yaml
apiVersion: kubevmui.io/v1
kind: NodeList
nodes:
  - name: node-01
    mac: aa:bb:cc:dd:ee:01
    role: controlplane
    installDisk: /dev/sda
  - name: node-02
    mac: aa:bb:cc:dd:ee:02
    role: controlplane
    installDisk: /dev/sda
  - name: node-03
    mac: aa:bb:cc:dd:ee:03
    role: worker
    installDisk: /dev/sda
```

**network.yaml:**
```yaml
apiVersion: kubevmui.io/v1
kind: NetworkConfig
spec:
  management:
    subnet: 10.0.1.0/24
    gateway: 10.0.1.254
    dns: [10.0.0.1, 8.8.8.8]
    ntp: pool.ntp.org
  vm:
    vlan: 100
    subnet: 192.168.100.0/24
    dhcpRange: 192.168.100.100-192.168.100.200
  pod:
    cidr: 10.244.0.0/16
  service:
    cidr: 10.96.0.0/12
```

**platform.yaml:**
```yaml
apiVersion: kubevmui.io/v1
kind: PlatformConfig
spec:
  cni: calico
  storage:
    provider: longhorn
    replicas: 3
  components:
    kubevirt: true
    cdi: true
    multus: true
    nmstate: true
    metallb: true
    prometheus: true
    webUI:
      enabled: true
      hostname: kubevmui.corp.local
      tls: true
```

---

## CLI Commands Reference

```bash
# Initialize a new cluster config directory
kubevmui init --name prod-virt-01

# Install from config directory
kubevmui install --config cluster/prod-virt-01/

# Add a node (waits for discovery)
kubevmui node add --cluster prod-virt-01 --role worker

# Cluster health
kubevmui cluster status --cluster prod-virt-01

# Upgrade everything
kubevmui platform upgrade --cluster prod-virt-01

# Backup etcd + state
kubevmui cluster backup --cluster prod-virt-01 --dest s3://backups/
```

## Discovery Protocol

### How Node Discovery Works

```
┌─────────────┐     PXE Boot      ┌──────────────┐
│  Bare Metal  │ ──────────────→  │  PXE/iPXE    │
│  Server      │                   │  Server       │
└──────┬──────┘                   └──────────────┘
       │  Boots Talos installer
       ▼
┌─────────────┐    Talos API (50000)   ┌──────────────┐
│  Talos       │ ◄────────────────────  │  CLI (this)  │
│  Maintenance │                        │              │
│  Mode        │  ──────────────────→  │  Discovers   │
└─────────────┘    Hardware info        │  via:        │
                                        │  1. ARP scan │
                                        │  2. mDNS     │
                                        │  3. DHCP     │
                                        │  4. Manual   │
                                        └──────────────┘
```

**Discovery methods (in order of preference):**

1. **Talos API scan** — Scan the management subnet for Talos nodes in maintenance mode (port 50000). This is the primary method.
2. **mDNS** — Talos nodes advertise via mDNS (`_talos._tcp`). Works on flat networks without scanning.
3. **DHCP lease parsing** — If the CLI has access to the DHCP server, it can read lease files for new MACs.
4. **Manual entry** — Admin enters IP/MAC addresses directly (fallback for air-gapped or complex network setups).

### Wait-for-Nodes Mode

The CLI can wait for nodes to appear, useful when PXE booting multiple servers simultaneously:

```bash
kubevmui install --wait-for-nodes=5 --timeout=30m
```

```
Waiting for 5 nodes to appear on 10.0.0.0/24...

  Found 3/5 nodes  ████████████████████░░░░░░░░░░  60%

  ✓ 10.0.0.11  (aa:bb:cc:dd:01:11)  32C / 128 GB    00:12 ago
  ✓ 10.0.0.12  (aa:bb:cc:dd:01:12)  32C / 128 GB    00:08 ago
  ✓ 10.0.0.21  (aa:bb:cc:dd:02:21)  64C / 256 GB    00:03 ago
  ⠼ Waiting for 2 more nodes...

  Timeout: 28:42 remaining
  Press Enter to continue with 3 nodes, or wait...
```


---

# Go Implementation Spec

## Project Structure

```
cli/
├── cmd/                          # Cobra command definitions
│   ├── root.go                   # Root command, global flags
│   ├── init.go                   # kubevmui init
│   ├── install.go                # kubevmui install
│   ├── node.go                   # kubevmui node {list,add,remove,upgrade,reset}
│   ├── cluster.go                # kubevmui cluster {status,upgrade,backup,restore,destroy}
│   ├── platform.go               # kubevmui platform {status,upgrade,config}
│   └── version.go                # kubevmui version
├── internal/
│   ├── tui/                      # Bubbletea TUI components
│   │   ├── app.go                # Main TUI application model
│   │   ├── styles.go             # Lipgloss styles and theme
│   │   ├── welcome.go            # Welcome screen model
│   │   ├── network.go            # Network config screen
│   │   ├── discovery.go          # Node discovery screen
│   │   ├── roles.go              # Role assignment screen
│   │   ├── options.go            # Platform options screen
│   │   ├── review.go             # Review & confirm screen
│   │   ├── progress.go           # Installation progress screen
│   │   ├── complete.go           # Completion screen
│   │   └── components/           # Reusable TUI widgets
│   │       ├── table.go          # Interactive table
│   │       ├── form.go           # Form input fields
│   │       ├── selector.go       # Single/multi select
│   │       ├── progress.go       # Progress bar
│   │       ├── spinner.go        # Animated spinner
│   │       └── confirm.go        # Confirmation dialog
│   ├── config/                   # Configuration management
│   │   ├── types.go              # ClusterConfig struct definitions
│   │   ├── loader.go             # YAML config file loader
│   │   ├── validator.go          # Config validation rules
│   │   └── defaults.go           # Default values
│   ├── discovery/                # Node discovery
│   │   ├── scanner.go            # Talos API port scanner
│   │   ├── mdns.go               # mDNS discovery
│   │   ├── dhcp.go               # DHCP lease parser
│   │   └── hardware.go           # Hardware info collector (via Talos API)
│   ├── talos/                    # Talos Linux operations
│   │   ├── client.go             # Talos gRPC client wrapper
│   │   ├── config.go             # Machine config generation
│   │   ├── install.go            # Talos install operations
│   │   ├── upgrade.go            # Talos upgrade operations
│   │   └── reset.go              # Talos reset/wipe
│   ├── kubernetes/               # Kubernetes operations
│   │   ├── bootstrap.go          # Cluster bootstrap (kubeadm via Talos)
│   │   ├── join.go               # Node join operations
│   │   ├── client.go             # Kubernetes client wrapper
│   │   ├── health.go             # Cluster health checks
│   │   └── upgrade.go            # Kubernetes version upgrade
│   ├── platform/                 # Platform component management
│   │   ├── helm.go               # Helm chart installer
│   │   ├── components.go         # Component definitions (versions, charts)
│   │   ├── kubevirt.go           # KubeVirt-specific install logic
│   │   ├── cni.go                # CNI install (Calico/Cilium)
│   │   ├── storage.go            # Storage install (Longhorn/Rook)
│   │   └── monitoring.go         # Prometheus + Grafana install
│   ├── backup/                   # Backup & restore
│   │   ├── etcd.go               # etcd snapshot backup/restore
│   │   ├── state.go              # Platform state backup
│   │   └── s3.go                 # S3-compatible storage client
│   └── logger/                   # Structured logging
│       └── logger.go             # Zerolog wrapper
├── pkg/                          # Public API (if needed by other tools)
│   └── version/
│       └── version.go            # Version info (set at build time)
├── go.mod
├── go.sum
├── Makefile
├── Dockerfile
└── .goreleaser.yaml              # Cross-platform release builds
```

## Core Dependencies

| Dependency | Purpose | Version |
|---|---|---|
| [cobra](https://github.com/spf13/cobra) | CLI framework (commands, flags, help) | v1.8+ |
| [bubbletea](https://github.com/charmbracelet/bubbletea) | TUI framework (Elm architecture) | v1.2+ |
| [lipgloss](https://github.com/charmbracelet/lipgloss) | TUI styling (borders, colors, layout) | v1.0+ |
| [bubbles](https://github.com/charmbracelet/bubbles) | Pre-built TUI components (tables, inputs, spinners) | v0.20+ |
| [viper](https://github.com/spf13/viper) | Config file loading (YAML) | v1.19+ |
| [talos/client](https://github.com/siderolabs/talos/pkg/machinery) | Talos gRPC API client | v1.9+ |
| [client-go](https://github.com/kubernetes/client-go) | Kubernetes API client | v0.31+ |
| [helm-sdk](https://github.com/helm/helm) | Helm chart install/upgrade | v3.16+ |
| [zerolog](https://github.com/rs/zerolog) | Structured JSON logging | v1.33+ |
| [go-yaml](https://github.com/go-yaml/yaml) | YAML parsing | v3 |

## Architecture Patterns

### Bubbletea Model (Elm Architecture)

Each TUI screen is a Bubbletea `Model` implementing three methods:

```go
type Model interface {
    Init() tea.Cmd           // Initial command (start spinner, fetch data)
    Update(tea.Msg) (Model, tea.Cmd)  // Handle input, update state
    View() string            // Render current state to string
}
```

### Wizard Navigation

The main app model holds a stack of screen models and manages navigation:

```go
// internal/tui/app.go
type App struct {
    screens  []Screen       // Screen stack
    current  int            // Current screen index
    config   *config.ClusterConfig  // Shared config state
    width    int            // Terminal width
    height   int            // Terminal height
}

type Screen interface {
    tea.Model
    Title() string          // Screen title for header
    Progress() float64      // 0.0 to 1.0 for progress bar
    Validate() error        // Validate before advancing
}
```

### Installation Pipeline

The install process is modeled as a pipeline of sequential phases, each containing parallel tasks:

```go
// internal/tui/progress.go
type Phase struct {
    Name   string
    Tasks  []Task
}

type Task struct {
    Name     string
    Status   TaskStatus  // Pending, Running, Done, Failed
    Duration time.Duration
    Error    error
    Run      func(ctx context.Context) error
}

type TaskStatus int

const (
    TaskPending TaskStatus = iota
    TaskRunning
    TaskDone
    TaskFailed
)
```

Tasks within a phase run in parallel (e.g., installing Talos on all nodes simultaneously). Phases run sequentially (Talos install → K8s bootstrap → platform deploy).

### Discovery Service

```go
// internal/discovery/scanner.go
type Scanner struct {
    subnet  netip.Prefix
    timeout time.Duration
}

type DiscoveredNode struct {
    IP       netip.Addr
    MAC      net.HardwareAddr
    CPU      int           // Core count
    Memory   uint64        // Bytes
    DiskSize uint64        // Bytes
    Hostname string
    TalosVer string        // Talos version in maintenance mode
}

// Scan the subnet for Talos nodes in maintenance mode
func (s *Scanner) Scan(ctx context.Context) ([]DiscoveredNode, error) {
    // 1. Concurrently probe port 50000 on all IPs in subnet
    // 2. For each responding host, call Talos Maintenance API
    // 3. Collect hardware info (CPU, memory, disks)
    // 4. Return sorted list of discovered nodes
}
```

### Talos Machine Config Generation

```go
// internal/talos/config.go
type ConfigGenerator struct {
    clusterName   string
    k8sVersion    string
    talosVersion  string
    endpoint      string  // Control plane endpoint (VIP or LB)
}

// GenerateControlPlane creates a Talos machine config for a control plane node
func (g *ConfigGenerator) GenerateControlPlane(node config.Node) (*v1alpha1.Config, error)

// GenerateWorker creates a Talos machine config for a worker node
func (g *ConfigGenerator) GenerateWorker(node config.Node) (*v1alpha1.Config, error)
```

### Helm-Based Platform Deploy

```go
// internal/platform/helm.go
type HelmInstaller struct {
    kubeconfig string
    namespace  string
}

type Chart struct {
    Name       string
    Repo       string
    Version    string
    Namespace  string
    Values     map[string]interface{}
    DependsOn  []string  // Charts that must be installed first
}

func (h *HelmInstaller) Install(ctx context.Context, chart Chart) error
func (h *HelmInstaller) Upgrade(ctx context.Context, chart Chart) error
func (h *HelmInstaller) Status(ctx context.Context, name string) (*release.Release, error)
```

## Build & Release

### Makefile

```makefile
VERSION   ?= $(shell git describe --tags --always --dirty)
COMMIT    := $(shell git rev-parse --short HEAD)
BUILD_DATE := $(shell date -u +%Y-%m-%dT%H:%M:%SZ)
LDFLAGS   := -s -w \
  -X cli/pkg/version.Version=$(VERSION) \
  -X cli/pkg/version.Commit=$(COMMIT) \
  -X cli/pkg/version.BuildDate=$(BUILD_DATE)

.PHONY: build
build:
	CGO_ENABLED=0 go build -ldflags "$(LDFLAGS)" -o bin/kubevmui ./

.PHONY: test
test:
	go test -race -cover ./...

.PHONY: lint
lint:
	golangci-lint run ./...

.PHONY: release
release:
	goreleaser release --clean
```

### GoReleaser Config

```yaml
# .goreleaser.yaml
version: 2
builds:
  - id: kubevmui
    main: ./
    binary: kubevmui
    env:
      - CGO_ENABLED=0
    goos:
      - linux
      - darwin
    goarch:
      - amd64
      - arm64
    ldflags:
      - -s -w
      - -X cli/pkg/version.Version={{.Version}}
      - -X cli/pkg/version.Commit={{.ShortCommit}}
      - -X cli/pkg/version.BuildDate={{.Date}}
archives:
  - format: tar.gz
    name_template: "kubevmui_{{ .Version }}_{{ .Os }}_{{ .Arch }}"
checksum:
  name_template: checksums.txt
release:
  github:
    owner: damhau
    name: kubevmui
```

## Testing Strategy

| Layer | Tool | What |
|---|---|---|
| Unit tests | `go test` | Config validation, discovery parsing, template generation |
| TUI tests | `bubbletea/teatest` | Screen rendering, navigation, key handling |
| Integration | `testcontainers-go` | Helm install against kind cluster |
| E2E | `talos/provision` | Full install on QEMU VMs (CI only) |

### Example TUI Test

```go
func TestDiscoveryScreen_ShowsNodes(t *testing.T) {
    m := discovery.NewModel(mockScanner{
        nodes: []discovery.DiscoveredNode{
            {IP: netip.MustParseAddr("10.0.0.11"), CPU: 32, Memory: 128 << 30},
            {IP: netip.MustParseAddr("10.0.0.12"), CPU: 32, Memory: 128 << 30},
        },
    })

    tm := teatest.NewTestModel(t, m)
    teatest.WaitFor(t, tm.Output(), func(bts []byte) bool {
        return strings.Contains(string(bts), "10.0.0.11")
    })

    // Verify both nodes are shown
    out := tm.FinalOutput(t)
    assert.Contains(t, string(out), "10.0.0.11")
    assert.Contains(t, string(out), "10.0.0.12")
    assert.Contains(t, string(out), "Found 2 nodes")
}
```

## Implementation Phases

### Phase 1: CLI Skeleton + Discovery (2 weeks)
- Cobra command structure with global flags
- Talos API scanner (port 50000 probe + hardware info)
- Config types, YAML loader, validator
- Basic TUI: welcome screen + discovery screen

### Phase 2: TUI Wizard (2 weeks)
- All wizard screens (network, roles, options, review)
- Wizard navigation (back/next, validation between steps)
- Lipgloss theme and responsive layout
- Non-interactive mode (`--config` flag)

### Phase 3: Talos Install (2 weeks)
- Machine config generation for CP and worker nodes
- Talos apply-config via gRPC API
- Wait-for-nodes mode with live discovery updates
- Kubernetes bootstrap (etcd init, API server, node join)

### Phase 4: Platform Deploy (2 weeks)
- Helm chart installer with dependency ordering
- Component installers: Calico/Cilium, Longhorn/Rook, KubeVirt, CDI
- Progress TUI with per-task status and timing
- Post-install health checks

### Phase 5: Day-2 Operations (2 weeks)
- `node add/remove/upgrade` with TUI
- `cluster upgrade` (rolling Talos + K8s upgrade)
- `platform upgrade` (Helm chart upgrades with diff)
- `cluster backup/restore` (etcd snapshots + S3)
- `cluster status` with resource utilization bars


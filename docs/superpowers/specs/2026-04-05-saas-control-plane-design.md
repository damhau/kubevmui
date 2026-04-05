# SaaS Control Plane & Cluster Import — Design Spec

**Date:** 2026-04-05
**Status:** Draft

## Problem

Self-hosted KubeVirt management UIs require the admin to be on the same network as the cluster (or use a VPN). This creates friction for:

- **Remote management** — admin wants to check VMs from home or a different office
- **Multi-cluster visibility** — multiple clusters across sites need a single pane of glass
- **MSP/consulting** — managing multiple customers' clusters from one place
- **Onboarding** — trying the platform should be as easy as signing up, not deploying a full stack

Existing solutions (Rancher, OpenShift) require deploying a heavy management cluster. There's no lightweight "connect your cluster and go" experience for KubeVirt.

## Solution

A **SaaS control plane** (hosted at `app.kubevmui.io`) that connects to on-prem or cloud clusters via **Tailscale** (WireGuard). The admin runs a single command — `kubevmui import` — to connect any KubeVirt-enabled cluster to the SaaS. No VPN, no port forwarding, no inbound firewall rules.

**Critical design principle: No VM data is stored in the SaaS.** Every API call is proxied to the on-prem cluster in real-time. VM specs, disk data, console streams — nothing is cached. The SaaS is a **remote control**, not a data store.

## Key Decisions

- **Tailscale over Cloudflare Tunnel** — Tailscale provides bidirectional mesh connectivity (SaaS calls K8s API directly), not just HTTP proxying. Lower latency, better for WebSocket (VNC/console).
- **Agent-based** — A lightweight agent runs in the cluster, handles auth handshake, health reporting, and API proxying. ~80 MB total footprint.
- **Works with any KubeVirt cluster** — Not limited to clusters deployed by the CLI. Import EKS, GKE, AKS, Harvester, or any K8s + KubeVirt setup.
- **Graceful degradation** — Missing components (CDI, Multus, Prometheus) disable features, not the entire platform.
- **Customer-controlled disconnect** — `kubevmui disconnect` instantly severs the connection. No residual access.
- **Same codebase** — The SaaS runs the same React UI + FastAPI backend as the self-hosted version, just connecting via Tailscale instead of local K8s API.

## Architecture

### Overview

```
┌─── KubeVM UI Cloud (SaaS) ──────────────────────────────────────┐
│                                                                    │
│  ┌────────────┐  ┌───────────┐  ┌────────────┐  ┌────────────┐  │
│  │ Web UI     │  │ API Server│  │ Tailscale  │  │ Auth       │  │
│  │ (React)    │  │ (FastAPI) │  │ Coordinator│  │ (SSO/OIDC) │  │
│  └─────┬──────┘  └─────┬─────┘  └──────┬─────┘  └────────────┘  │
│        │               │               │                          │
│        └───────────────┼───────────────┘                          │
│                        │                                          │
│                   ┌────▼────┐                                     │
│                   │ Cluster │  ← metadata, connection state,      │
│                   │ Registry│    user preferences (NO VM data)    │
│                   └─────────┘                                     │
│                                                                    │
│  No VM data stored in SaaS — everything is proxied live.          │
└──────────────────────┬────────────────────────────────────────────┘
                       │ Tailscale (WireGuard, encrypted)
         ┌─────────────┼─────────────┐
         │             │             │
    ┌────▼─────┐  ┌───▼──────┐  ┌──▼────────┐
    │ Cluster A │  │ Cluster B │  │ Cluster C  │
    │ (on-prem) │  │ (AWS EKS) │  │ (on-prem)  │
    │           │  │           │  │            │
    │ agent +   │  │ agent +   │  │ agent +    │
    │ tailscale │  │ tailscale │  │ tailscale  │
    └──────────┘  └──────────┘  └───────────┘
```

### What Runs On-Prem (in the cluster)

Two lightweight pods in `kubevmui-system` namespace:

**kubevmui-agent** (~50 MB RAM):
- Authenticates with SaaS via pre-shared token
- Reports cluster health, component inventory, node/VM counts
- Proxies K8s API calls from SaaS → local kube-apiserver
- Proxies VNC/serial console WebSocket streams
- Heartbeat every 30s (SaaS shows cluster as "offline" if missed)

**tailscale-relay** (~30 MB RAM):
- Joins a kubevmui-managed Tailscale tailnet (or customer's own tailnet)
- Exposes K8s API endpoint via Tailscale IP
- WireGuard-encrypted tunnel — zero unencrypted traffic
- NAT traversal built-in — works behind corporate firewalls

### What Runs in the SaaS

**Web UI** — Same React SPA as self-hosted, but with:
- Account management (signup, billing, team)
- Cluster switcher in top nav
- SSO login (Okta, Azure AD, Google, GitHub)

**API Server** — Same FastAPI backend, but with:
- Multi-tenant routing (maps user → clusters they can access)
- Tailscale coordinator (manages tailnet, ACLs per cluster)
- Cluster registry (metadata, connection state, feature flags)

**Cluster Registry** — Lightweight database storing:
- Cluster name, connection token, Tailscale IP
- Last heartbeat, online/offline status
- Detected components (KubeVirt version, CNI, storage)
- User access mappings

**NOT stored:** VM specs, disk data, console streams, secrets, or any K8s resources.

### Data Flow

```
Admin browser
    │
    ▼ HTTPS
SaaS API Server
    │
    │ "GET /api/v1/clusters/prod-01/projects/finance/vms"
    │
    ▼ Tailscale (WireGuard)
kubevmui-agent (in cluster)
    │
    │ kubectl get vm -n kubevmui-finance
    │
    ▼ K8s API
kube-apiserver
    │
    ▼ Response
    (reverse path, same tunnel)
```

Every request is proxied in real-time. The SaaS acts as a transparent relay with auth + routing.

## Cluster Import Flow

### `kubevmui import` — Full CLI Output

```
$ kubevmui import

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Import Cluster to KubeVM UI Cloud
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  This will connect your cluster to your KubeVM UI Cloud account.
  No data leaves your cluster — the SaaS connects via Tailscale.

  Step 1: Authenticate
  → Open https://app.kubevmui.io/link/abc123 in your browser
  → Waiting for approval...
  → Authenticated as jane@mycompany.com ✓

  Step 2: Detect cluster
  → Kubernetes: v1.31.2 (3 nodes)
  → KubeVirt: v1.4.0 (detected ✓)
  → VMs: 15 running
  → Storage: Longhorn v1.7.0
  → CNI: Calico v3.28.0

  Step 3: Install connector
  → Creating namespace kubevmui-system...
  → Installing kubevmui-agent (v1.0.0)...
  → Installing Tailscale relay...
  → Tailscale node registered: prod-virt-01.tail12345.ts.net ✓
  → Agent connected to app.kubevmui.io ✓

  Step 4: Verify
  → API connectivity: ✓
  → VM list accessible: ✓ (15 VMs)
  → VNC proxy: ✓ (WebSocket via Tailscale)
  → Metrics: ✓ (Prometheus reachable)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Cluster "prod-virt-01" imported successfully!

  Manage it at: https://app.kubevmui.io/clusters/prod-virt-01

  What was installed:
    - kubevmui-agent (1 pod, ~50 MB RAM)
    - tailscale-relay (1 pod, ~30 MB RAM)

  To disconnect: kubevmui disconnect
  To uninstall:  kubevmui uninstall-agent

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### Import Existing (Non-Talos) Cluster

The import works with any K8s cluster that has KubeVirt — not just Talos-based:

```
$ kubevmui import --context my-eks-cluster

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Import Cluster to KubeVM UI Cloud
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Step 1: Authenticate
  → Authenticated as jane@mycompany.com ✓

  Step 2: Detect cluster
  → Kubernetes: v1.29.4 (EKS, 8 nodes)
  → KubeVirt: v1.3.0 (detected ✓)
  → VMs: 42 running across 5 namespaces
  → Storage: EBS CSI driver
  → CNI: AWS VPC CNI

  ⚠ Missing optional components:
    ○ CDI — VM disk import won't work
    ○ Multus — advanced networking unavailable
    ○ Prometheus — metrics and DRS recommendations unavailable
    ○ NMState — network configuration unavailable

  Install missing components? [y/N] n
  (You can install them later: kubevmui platform install --component cdi)

  Step 3: Install connector
  → Installing kubevmui-agent...
  → Installing Tailscale relay...
  → Connected ✓

  Step 4: Verify
  → API connectivity: ✓
  → VM list accessible: ✓ (42 VMs)
  → VNC proxy: ✓
  → Metrics: ✗ (Prometheus not installed)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Cluster "my-eks-cluster" imported (limited features).

  Available:    VM management, console, snapshots, projects
  Unavailable:  disk import, advanced networking, DRS, metrics

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### Feature Matrix by Detected Components

| Feature | KubeVirt | + CDI | + Multus | + Prometheus | + NMState |
|---|---|---|---|---|---|
| VM CRUD | ✓ | ✓ | ✓ | ✓ | ✓ |
| Console (VNC/serial) | ✓ | ✓ | ✓ | ✓ | ✓ |
| Snapshots | ✓ | ✓ | ✓ | ✓ | ✓ |
| Live migration | ✓ | ✓ | ✓ | ✓ | ✓ |
| Disk import (URL/registry) | — | ✓ | ✓ | ✓ | ✓ |
| VM import (VMware) | — | ✓ | ✓ | ✓ | ✓ |
| Multiple networks per VM | — | — | ✓ | ✓ | ✓ |
| Network abstraction | — | — | ✓ | ✓ | ✓ |
| Resource monitoring | — | — | — | ✓ | ✓ |
| DRS recommendations | — | — | — | ✓ | ✓ |
| Capacity forecasting | — | — | — | ✓ | ✓ |
| Node network config | — | — | — | — | ✓ |

The UI dynamically hides features that aren't available, with a banner: "Install CDI to enable disk import → [Install Now]"

## Authentication

### Device Authorization Flow

The `kubevmui import` command uses the **OAuth 2.0 Device Authorization Grant** (RFC 8628) — the same flow GitHub CLI uses:

```
CLI                                SaaS
 │                                  │
 │  POST /api/auth/device           │
 │ ──────────────────────────────→ │
 │                                  │
 │  { device_code, user_code,       │
 │    verification_uri }            │
 │ ←────────────────────────────── │
 │                                  │
 │  Display: "Open https://app.     │
 │  kubevmui.io/link/ABC123"       │
 │                                  │
 │  Poll: POST /api/auth/token      │
 │ ──────────────────────────────→ │  (user logs in via browser)
 │  { "error": "pending" }         │
 │ ←────────────────────────────── │
 │                                  │
 │  Poll again...                   │
 │ ──────────────────────────────→ │  (user approves)
 │  { access_token, refresh_token } │
 │ ←────────────────────────────── │
 │                                  │
 │  Authenticated ✓                 │
```

No copy-pasting tokens. The admin opens a URL in their browser, logs in with SSO, and the CLI automatically picks up the token.

### SaaS Authentication Options

| Method | How | Best For |
|---|---|---|
| **Email + password** | Standard signup | Individuals, small teams |
| **SSO (OIDC)** | Okta, Azure AD, Google Workspace | Enterprise |
| **GitHub** | OAuth | Open-source contributors, developers |
| **API key** | Generated in dashboard | CI/CD, automation |

### Cluster-Level Authorization

The SaaS respects the cluster's existing K8s RBAC:

```
SaaS user "jane@corp.com"
    │
    ▼ mapped to
K8s user "jane" (via agent's impersonation)
    │
    ▼ checked against
K8s RBAC (RoleBindings in each namespace)
    │
    ▼ result
"jane can manage VMs in kubevmui-finance, read-only in kubevmui-hr"
```

The agent uses **K8s user impersonation** — it calls the K8s API with `Impersonate-User: jane` headers. This means the cluster's existing RBAC rules apply exactly as if the user were running kubectl locally.

## Why Tailscale Over Alternatives

| | Tailscale | Cloudflare Tunnel | WireGuard (raw) | VPN (OpenVPN/IPsec) |
|---|---|---|---|---|
| **Connectivity** | Mesh — direct API access | HTTP proxy only | Manual config | Full network tunnel |
| **NAT traversal** | Built-in (DERP relay) | Built-in | Manual | Varies |
| **Setup** | 1 command | 1 command | Complex | Complex |
| **Latency** | Direct P2P when possible | Extra hop via edge | Direct | Variable |
| **K8s API** | Direct via Tailscale IP | Must proxy HTTP | Direct | Direct |
| **WebSocket (VNC)** | Native support | Works (higher latency) | Native | Native |
| **Multi-cluster** | Each = Tailscale node | Each = separate tunnel | Each = peer config | Each = VPN peer |
| **Auth** | Tailscale ACLs | Cloudflare Access | Manual | Manual |
| **Air-gapped** | DERP relay (needs 1 outbound port) | Needs Cloudflare | P2P possible | P2P possible |
| **Cost** | Free 100 devices | Free tier | Free | Free |
| **Headscale** | Self-host option ✓ | No self-host | N/A | N/A |

### Tailscale or Headscale

For customers who can't use Tailscale's SaaS (compliance, air-gap):

```yaml
# platform.yaml — agent configuration
spec:
  saas:
    controlPlane: https://app.kubevmui.io    # or self-hosted
    tailscale:
      mode: tailscale          # Tailscale SaaS (default)
      # mode: headscale        # self-hosted Headscale
      # headscaleUrl: https://headscale.corp.local
```

The agent works with both Tailscale (SaaS) and Headscale (self-hosted). This removes the last objection from security-conscious customers.

## Agent Design

### Kubernetes Manifests

```yaml
# kubevmui-agent Deployment
apiVersion: apps/v1
kind: Deployment
metadata:
  name: kubevmui-agent
  namespace: kubevmui-system
spec:
  replicas: 1
  selector:
    matchLabels:
      app: kubevmui-agent
  template:
    spec:
      serviceAccountName: kubevmui-agent
      containers:
        - name: agent
          image: ghcr.io/kubevmui/agent:v1.0.0
          resources:
            requests:
              cpu: 50m
              memory: 50Mi
            limits:
              cpu: 200m
              memory: 128Mi
          env:
            - name: KUBEVMUI_SAAS_URL
              value: https://app.kubevmui.io
            - name: KUBEVMUI_CLUSTER_TOKEN
              valueFrom:
                secretKeyRef:
                  name: kubevmui-agent-token
                  key: token
            - name: KUBEVMUI_CLUSTER_NAME
              value: prod-virt-01
          ports:
            - containerPort: 8443    # agent API (internal)
---
# Tailscale relay
apiVersion: apps/v1
kind: Deployment
metadata:
  name: kubevmui-tailscale
  namespace: kubevmui-system
spec:
  replicas: 1
  template:
    spec:
      serviceAccountName: kubevmui-tailscale
      containers:
        - name: tailscale
          image: ghcr.io/tailscale/tailscale:latest
          resources:
            requests:
              cpu: 50m
              memory: 30Mi
            limits:
              cpu: 100m
              memory: 64Mi
          env:
            - name: TS_AUTHKEY
              valueFrom:
                secretKeyRef:
                  name: kubevmui-tailscale-auth
                  key: authkey
            - name: TS_HOSTNAME
              value: prod-virt-01
            - name: TS_ROUTES
              value: "10.96.0.1/32"    # only route to kube-apiserver
          securityContext:
            capabilities:
              add: [NET_ADMIN]
```

### Agent ServiceAccount RBAC

Minimal permissions — the agent can only access what the UI needs:

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: kubevmui-agent
rules:
  # VM management
  - apiGroups: [kubevirt.io]
    resources: [virtualmachines, virtualmachineinstances,
                virtualmachineinstancemigrations]
    verbs: [get, list, watch, create, update, patch, delete]

  # VM subresources (start, stop, restart, console, vnc)
  - apiGroups: [subresources.kubevirt.io]
    resources: [virtualmachineinstances/console, virtualmachineinstances/vnc,
                virtualmachines/start, virtualmachines/stop,
                virtualmachines/restart, virtualmachines/migrate]
    verbs: [get, update]

  # Platform CRDs
  - apiGroups: [kubevmui.io]
    resources: [projects, securitygroups, firewallpolicies,
                networks, images, templates, catalogs]
    verbs: [get, list, watch, create, update, patch, delete]

  # Storage (PVCs, DataVolumes)
  - apiGroups: [""]
    resources: [persistentvolumeclaims]
    verbs: [get, list, watch, create, delete]
  - apiGroups: [cdi.kubevirt.io]
    resources: [datavolumes]
    verbs: [get, list, watch, create, delete]

  # Read-only cluster info
  - apiGroups: [""]
    resources: [nodes, namespaces, events]
    verbs: [get, list, watch]
  - apiGroups: [""]
    resources: [pods]
    verbs: [get, list, watch]

  # RBAC (for project management)
  - apiGroups: [rbac.authorization.k8s.io]
    resources: [rolebindings]
    verbs: [get, list, watch, create, update, delete]

  # ResourceQuotas (for project quotas)
  - apiGroups: [""]
    resources: [resourcequotas]
    verbs: [get, list, watch, create, update, delete]

  # User impersonation (SaaS user → K8s user)
  - apiGroups: [""]
    resources: [users, groups]
    verbs: [impersonate]

  # NO access to: secrets (except kubevmui-system), configmaps,
  # deployments, services, or any non-VM resources
```

### Agent Heartbeat & Health

The agent sends a heartbeat to the SaaS every 30 seconds:

```json
{
  "cluster": "prod-virt-01",
  "timestamp": "2026-04-05T10:00:30Z",
  "health": {
    "nodes": { "total": 3, "ready": 3 },
    "vms": { "total": 15, "running": 12, "stopped": 3 },
    "components": {
      "kubevirt": { "version": "1.4.0", "status": "ready" },
      "cdi": { "version": "1.60.0", "status": "ready" },
      "calico": { "version": "3.28.0", "status": "ready" },
      "longhorn": { "version": "1.7.0", "status": "ready" },
      "prometheus": { "version": "2.54.0", "status": "ready" }
    },
    "resources": {
      "cpu": { "allocatable": 192, "used": 54 },
      "memory": { "allocatable": "832Gi", "used": "412Gi" },
      "storage": { "total": "6Ti", "used": "2.1Ti" }
    }
  }
}
```

If the SaaS misses 3 heartbeats (90s), the cluster shows as "Offline" in the UI with last-known state.


## SaaS Web UI

### Cluster Dashboard

```
┌─── KubeVM UI Cloud ──────────────────────────────────────────────────┐
│  jane@mycompany.com ▾                          [+ Import Cluster]   │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  Your Clusters                                                       │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐    │
│  │  ● prod-virt-01              Online         3 nodes          │    │
│  │    Kubernetes v1.31.2 | KubeVirt v1.4.0                      │    │
│  │    VMs: 15 running, 3 stopped    CPU: 28%    Memory: 49%    │    │
│  │    [Open Dashboard]                                          │    │
│  └──────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐    │
│  │  ● dev-cluster               Online         1 node           │    │
│  │    Kubernetes v1.30.6 | KubeVirt v1.3.0                      │    │
│  │    VMs: 4 running, 0 stopped     CPU: 45%    Memory: 62%    │    │
│  │    [Open Dashboard]                                          │    │
│  └──────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐    │
│  │  ○ dr-site                   Offline (last seen 2h ago)      │    │
│  │    Kubernetes v1.31.2 | KubeVirt v1.4.0                      │    │
│  │    Last known: 5 VMs, 2 nodes                                │    │
│  │    [Reconnect]  [View Last Known State]                      │    │
│  └──────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  ─────────────────────────────────────────────────────────────────── │
│  Total: 3 clusters | 6 nodes | 24 VMs | Plan: Pro ($29/mo)         │
└──────────────────────────────────────────────────────────────────────┘
```

### Cross-Cluster VM View

When the admin clicks "All VMs" across clusters:

```
┌─── All Virtual Machines ─────────────────────────────────────────────┐
│                                                                       │
│  Cluster: [All Clusters ▾]    Project: [All ▾]    Status: [All ▾]   │
│                                                                       │
│  NAME        CLUSTER        PROJECT    STATUS    CPU   MEM    IP     │
│  ─────────────────────────────────────────────────────────────────── │
│  web-01      prod-virt-01   Finance    Running   4    8 GB   .1.10  │
│  web-02      prod-virt-01   Finance    Running   4    8 GB   .1.11  │
│  oracle-01   prod-virt-01   Finance    Running   8    64 GB  .1.20  │
│  dev-app     dev-cluster    Eng        Running   2    4 GB   .2.10  │
│  test-db     dev-cluster    Eng        Running   4    16 GB  .2.11  │
│  dr-web-01   dr-site        Finance    Offline   4    8 GB   —      │
│                                                                       │
│  24 VMs across 3 clusters                                            │
└──────────────────────────────────────────────────────────────────────┘
```

### VNC Console via Tailscale

The VNC console works through the Tailscale tunnel — the browser connects to the SaaS, which proxies the WebSocket to the cluster:

```
Browser                SaaS              Tailscale        Cluster
  │                      │                   │               │
  │  wss://app.kubevmui  │                   │               │
  │  .io/ws/vnc/web-01   │                   │               │
  │ ────────────────────→│                   │               │
  │                      │  WireGuard tunnel │               │
  │                      │ ─────────────────→│               │
  │                      │                   │  ws://agent:  │
  │                      │                   │  8443/vnc/    │
  │                      │                   │ ─────────────→│
  │                      │                   │               │
  │  ← VNC frames (bidirectional) ──────────────────────────→│
```

Latency is typically 5-20ms additional over direct access (Tailscale P2P), which is imperceptible for VNC.

## Disconnect & Uninstall

### Disconnect (keep agent, stop tunnel)

```
$ kubevmui disconnect

  → Disconnecting prod-virt-01 from app.kubevmui.io...
  → Tailscale tunnel stopped ✓
  → Agent paused (not removed) ✓

  Cluster is disconnected. No SaaS access.
  To reconnect: kubevmui reconnect
```

### Full Uninstall

```
$ kubevmui uninstall-agent

  → Stopping kubevmui-agent...
  → Removing Tailscale relay...
  → Cleaning up RBAC resources...
  → Deleting namespace kubevmui-system...
  → Deregistering from app.kubevmui.io...

  Agent fully removed. No kubevmui components remain on this cluster.
```

### Emergency Kill (from SaaS dashboard)

If the admin loses CLI access to the cluster:

```
┌─── Cluster Settings: prod-virt-01 ───────────────────────────────────┐
│                                                                       │
│  Connection                                                           │
│  Status: ● Online                                                    │
│  Tailscale IP: 100.64.1.5                                            │
│  Agent version: v1.0.0                                               │
│  Last heartbeat: 12 seconds ago                                      │
│                                                                       │
│  [Disconnect]  [Rotate Token]  [View Audit Log]                     │
│                                                                       │
│  ─── Danger Zone ─────────────────────────────────────────────────── │
│  [Revoke Access]  ← immediately invalidates the cluster token,       │
│                     agent can no longer connect. Requires new import. │
└──────────────────────────────────────────────────────────────────────┘
```

## Security Model

### Zero Trust Principles

1. **No inbound ports** — The agent connects outbound to Tailscale. No firewall rules needed on the cluster side.
2. **No stored data** — SaaS stores cluster metadata only. All VM/K8s data is proxied live.
3. **Encrypted transport** — WireGuard end-to-end. SaaS cannot see traffic in transit.
4. **User impersonation** — SaaS doesn't use a super-admin token. Each user's requests go through K8s RBAC as that user.
5. **Minimal agent RBAC** — Agent can only access VM-related resources. No access to secrets, deployments, or infrastructure.
6. **Customer-controlled** — Disconnect/uninstall at any time. Revoke token from SaaS dashboard.
7. **Audit trail** — Every API call from SaaS to cluster is logged with user identity, action, and timestamp.

### Audit Log

```
┌─── Audit Log: prod-virt-01 ──────────────────────────────────────────┐
│                                                                       │
│  TIME         USER                  ACTION              RESOURCE      │
│  ─────────────────────────────────────────────────────────────────── │
│  10:05:32     jane@corp.com         VM.Start            web-01       │
│  10:04:15     jane@corp.com         VM.OpenConsole      web-01       │
│  10:02:00     john@corp.com         VM.Create           test-db-02   │
│  09:58:12     jane@corp.com         Project.Update      Finance      │
│  09:45:00     system                Heartbeat           —            │
│                                                                       │
│  [Export CSV]  [Filter]  Showing last 24 hours                       │
└──────────────────────────────────────────────────────────────────────┘
```

## Pricing

| Tier | Price | Clusters | Nodes | Features |
|---|---|---|---|---|
| **Free** | $0 | 1 cluster | 3 nodes | VM management, console, basic monitoring |
| **Pro** | $29/mo | 5 clusters | Unlimited | + Projects, DRS, import wizard, security policies, SSO |
| **Enterprise** | Custom | Unlimited | Unlimited | + Audit log, SLA, dedicated support, Headscale option |

### Free Tier Strategy

The free tier is the growth engine:
1. Admin discovers project on GitHub
2. Signs up at app.kubevmui.io (free)
3. Runs `kubevmui import` on their homelab/POC cluster
4. Falls in love with the UI
5. Adds more clusters → hits limit → upgrades to Pro
6. Company adopts it → needs SSO/audit → Enterprise

### Self-Hosted vs SaaS

| | Self-Hosted (open source) | SaaS |
|---|---|---|
| **UI runs** | In your cluster | app.kubevmui.io |
| **Data stays** | In your cluster | In your cluster (SaaS proxies) |
| **Connectivity** | Direct (LAN/VPN) | Tailscale tunnel |
| **Multi-cluster** | Built-in (ClusterManager) | Built-in (via Tailscale) |
| **Auth** | K8s service account tokens | SSO (Okta, Azure AD, Google) |
| **Updates** | Manual (`kubevmui upgrade`) | Automatic (always latest) |
| **Cost** | Free forever | Subscription |
| **Support** | Community (GitHub issues) | Paid (Pro/Enterprise) |

The self-hosted version is **always free and fully featured**. The SaaS adds convenience (remote access, SSO, managed updates) and is the revenue stream.


## Ingress Tiers (Self-Hosted)

For self-hosted deployments (not using the SaaS), the platform offers four ingress tiers:

### Tier 1: Local Access (default, zero config)

Out of the box — accessible via MetalLB LoadBalancer IP:

```
  KubeVM UI:   https://10.0.1.200
```

No DNS required. Admin adds to `/etc/hosts` or local DNS.

### Tier 2: Local DNS (cert-manager)

Admin provides a hostname. The platform generates TLS certs:

```yaml
# platform.yaml
spec:
  webUI:
    hostname: kubevmui.corp.local
    tls:
      enabled: true
      issuer: letsencrypt    # or selfsigned
```

### Tier 3: Cloudflare Tunnel (remote access)

One-command setup for remote access without VPN:

```bash
kubevmui tunnel enable

? Cloudflare API token:  [cf-xxxxxxxxxxxxx]
? Base domain:           [clusters.mycompany.com]

  → Creating Cloudflare Tunnel "prod-virt-01" ... ✓
  → DNS: prod-virt-01.clusters.mycompany.com → tunnel ✓
  → TLS: automatic (Cloudflare edge) ✓
  → cloudflared installed in cluster ✓

  Platform accessible at:
  https://prod-virt-01.clusters.mycompany.com
```

Multi-cluster auto-subdomain: `{cluster}.{base-domain}`

Optional Cloudflare Zero Trust (SSO in front):

```bash
kubevmui tunnel enable --zero-trust

? SSO provider: [Okta]
? Allowed emails: [@mycompany.com]

  → Cloudflare Access policy created ✓
  → Auth: Okta SSO for @mycompany.com
```

Architecture:

```
┌──────────┐     outbound     ┌─────────────────┐     HTTPS     ┌────────┐
│ Platform │ ────tunnel────→ │  Cloudflare Edge │ ←──────────── │ Admin  │
│ (on-prem)│                  │  - TLS terminate │               │ Browser│
│          │                  │  - WAF + DDoS    │               │        │
│ cloudflared                 │  - Access (SSO)  │               └────────┘
│ (Deployment)                └─────────────────┘
└──────────┘
```

### Tier 4: Bring Your Own Ingress

For existing ingress infrastructure (F5, HAProxy, nginx, Traefik):

```yaml
# platform.yaml
spec:
  webUI:
    ingressClass: nginx
    hostname: kubevmui.corp.local
    tls:
      secretName: kubevmui-tls    # pre-existing secret
    annotations:
      nginx.ingress.kubernetes.io/proxy-read-timeout: "3600"
      nginx.ingress.kubernetes.io/proxy-send-timeout: "3600"
```

### Ingress Summary

| Tier | DNS | TLS | Auth | Setup | Best For |
|---|---|---|---|---|---|
| Local | IP / hosts file | Self-signed | K8s token | Zero config | POC, lab |
| Local DNS | Admin-managed | cert-manager | K8s token | 1 setting | On-prem enterprise |
| Cloudflare | Auto-subdomain | Cloudflare edge | SSO via Access | 1 command | Remote access |
| BYO Ingress | Admin-managed | Admin-managed | Admin-managed | Manual | Existing infra |

## SaaS Backend Architecture

### Tech Stack

| Component | Technology | Why |
|---|---|---|
| **Web UI** | React + TypeScript (same as self-hosted) | Code reuse |
| **API Server** | FastAPI (same as self-hosted) | Code reuse |
| **Auth** | Auth0 / Clerk | Managed SSO/OIDC |
| **Database** | PostgreSQL | Cluster registry, user accounts, audit log |
| **Cache** | Redis | Session state, WebSocket routing |
| **Tailscale Coordinator** | Tailscale API / Headscale | Manages tailnet per customer |
| **Queue** | Redis Streams | Async agent communication |
| **Hosting** | Fly.io / Railway / K8s | Lightweight, globally distributed |

### Multi-Tenancy

Each SaaS customer (organization) gets:
- Isolated Tailscale tailnet (or shared with ACLs)
- Separate database rows (not separate databases — simpler ops)
- Isolated WebSocket channels

The API server routes requests based on the authenticated user's organization:

```python
# backend/app/services/cluster_proxy.py

class ClusterProxy:
    """Proxies API calls from SaaS to on-prem clusters via Tailscale."""

    async def proxy_request(
        self,
        cluster: str,
        user: SaaSUser,
        method: str,
        path: str,
        body: Optional[dict] = None,
    ) -> Response:
        """
        1. Look up cluster's Tailscale IP from registry
        2. Set Impersonate-User header to user's K8s identity
        3. Forward request to agent via Tailscale tunnel
        4. Return response to browser
        """
        cluster_info = await self.registry.get(cluster)
        if not cluster_info.online:
            raise ClusterOfflineError(cluster)

        headers = {
            "Impersonate-User": user.k8s_identity,
            "Impersonate-Group": ",".join(user.k8s_groups),
        }

        async with httpx.AsyncClient() as client:
            resp = await client.request(
                method=method,
                url=f"https://{cluster_info.tailscale_ip}:8443{path}",
                headers=headers,
                json=body,
                timeout=30.0,
            )
            return resp
```

## Implementation Phases

### Phase 1: Agent + Tailscale (3 weeks)
- Agent binary (Go) with K8s API proxy and health reporting
- Tailscale relay deployment
- `kubevmui import` CLI command (device auth flow)
- `kubevmui disconnect` and `kubevmui uninstall-agent`
- Cluster registry (PostgreSQL)

### Phase 2: SaaS Web UI (3 weeks)
- Cluster dashboard (list clusters, online/offline status)
- Auth integration (email/password + GitHub OAuth)
- Proxy API calls through to clusters
- VNC/console WebSocket proxying via Tailscale
- Cross-cluster VM view

### Phase 3: SSO + Teams (2 weeks)
- OIDC integration (Okta, Azure AD, Google)
- Team/organization management
- User → cluster access mappings
- K8s user impersonation

### Phase 4: Billing + Ingress Tiers (2 weeks)
- Stripe integration for Pro/Enterprise tiers
- Free tier enforcement (1 cluster, 3 nodes)
- Cloudflare Tunnel integration (`kubevmui tunnel enable`)
- Cloudflare Zero Trust setup

### Phase 5: Audit + Polish (2 weeks)
- Audit log (every proxied API call)
- Cluster settings page (disconnect, rotate token, revoke)
- Offline cluster handling (last-known state display)
- Headscale support for self-hosted Tailscale

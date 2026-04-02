# Security Policy Abstraction Design — NSX-T-style Security for KubeVirt

**Date:** 2026-04-02
**Status:** Draft

## Problem

Kubernetes NetworkPolicy is powerful but hostile to virtualization administrators. It requires understanding label selectors, namespace scoping, and implicit deny semantics. VMware vCenter administrators are accustomed to NSX-T's security model: **Security Tags**, **Security Groups**, and **Distributed Firewall Rules** — intuitive concepts that map to "tag your VMs, group them, write firewall rules between groups."

KubeVM UI targets vCenter administrators migrating to KubeVirt. Exposing raw NetworkPolicy would break the abstraction layer philosophy established by the Network CR and Catalog designs. We need a security abstraction that feels like NSX-T but generates native Kubernetes/Calico/Cilium network policies under the hood.

## Solution

Introduce three abstractions:

1. **Security Tags** — Labels on VMs using a `security.kubevmui.io/*` prefix. Managed via a tag catalog in the UI. No CRD needed — tags are K8s labels.
2. **Security Groups** (`securitygroups.kubevmui.io`) — Named, dynamic groups of VMs defined by tag-based membership criteria. Analogous to NSX-T Security Groups.
3. **Firewall Policies** (`firewallpolicies.kubevmui.io`) — Ordered rules referencing Security Groups as source/destination, with Allow/Deny actions and port/protocol specifications. Analogous to NSX-T Distributed Firewall sections and rules.

The backend reconciles these abstractions into native network policies based on the detected CNI:
- **Calico** (primary target): `GlobalNetworkPolicy` + `Tier` + `GlobalNetworkSet`
- **Cilium**: `CiliumClusterwideNetworkPolicy` + `CiliumCIDRGroup`
- **Vanilla Kubernetes**: `NetworkPolicy` (fallback, limited functionality)

## Key Decisions

- **Security Tags are labels, not a CRD** — Avoids a new resource type for something K8s labels already handle. The UI manages a tag catalog (allowed keys/values) stored as a ConfigMap.
- **Calico is the primary backend** — It has Tiers (policy ordering), explicit Deny, and GlobalNetworkSet (named IP groups), making it the closest match to NSX-T DFW.
- **Auto-detection of CNI** — The backend checks which CRDs exist in the cluster and selects the appropriate policy generator. Can be overridden per-policy.
- **Reconciliation, not real-time generation** — Policies are synced periodically and on CRD changes. Generated resources are labeled with `app.kubernetes.io/managed-by: kubevmui` so they can be safely garbage-collected.
- **Deny semantics vary by backend** — Calico supports explicit Deny. Cilium supports `ingressDeny`/`egressDeny`. Vanilla K8s only supports implicit deny (absence of allow). The UI warns when Deny rules are used on vanilla K8s.
- **Priority/ordering maps to Calico Tiers** — Calico is the only CNI with policy ordering. On Cilium and vanilla K8s, all policies are additive; priority is handled by the reconciler (higher-priority Deny suppresses lower-priority Allow).

## Concept Mapping

| NSX-T Concept | KubeVM UI Abstraction | Calico | Cilium | Vanilla K8s |
|---|---|---|---|---|
| Security Tag | `security.kubevmui.io/*` labels | Pod labels | Pod labels | Pod labels |
| Security Group | `SecurityGroup` CRD | `GlobalNetworkSet` + label selector | Inline `endpointSelector` | `podSelector` |
| DFW Section | FirewallPolicy `priority` | `Tier` + `order` | N/A (additive) | N/A (additive) |
| DFW Rule (Allow) | FirewallPolicy rule `action: Allow` | `GlobalNetworkPolicy` ingress/egress `action: Allow` | `CiliumClusterwideNetworkPolicy` ingress/egress | `NetworkPolicy` ingress/egress |
| DFW Rule (Deny) | FirewallPolicy rule `action: Deny` | `GlobalNetworkPolicy` ingress/egress `action: Deny` | `CiliumClusterwideNetworkPolicy` `ingressDeny`/`egressDeny` | Implicit (selecting policy activates default-deny) |
| Applied To | destination `securityGroup` | `selector` field | `endpointSelector` | `podSelector` |
| IP-based group | SecurityGroup with `cidrs` | `GlobalNetworkSet` with `nets` | `CiliumCIDRGroup` | `ipBlock` in peers |

## Security Tags

### Convention

All security tags use the label prefix `security.kubevmui.io/`:

```yaml
metadata:
  labels:
    security.kubevmui.io/zone: dmz
    security.kubevmui.io/app: web-frontend
    security.kubevmui.io/env: production
    security.kubevmui.io/tier: frontend
    security.kubevmui.io/compliance: pci-dss
```

### Tag Catalog

A ConfigMap stores the allowed tag keys and their permitted values:

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: security-tag-catalog
  namespace: kubevmui-system
  labels:
    app.kubernetes.io/managed-by: kubevmui
data:
  tags.yaml: |
    tags:
      - key: zone
        displayName: "Security Zone"
        description: "Network security zone"
        values:
          - { value: "dmz", displayName: "DMZ", color: "#f59e0b" }
          - { value: "trusted", displayName: "Trusted", color: "#22c55e" }
          - { value: "untrusted", displayName: "Untrusted", color: "#ef4444" }
      - key: app
        displayName: "Application"
        description: "Application tier or role"
        values:
          - { value: "web-frontend", displayName: "Web Frontend" }
          - { value: "web-backend", displayName: "Web Backend" }
          - { value: "database", displayName: "Database" }
          - { value: "cache", displayName: "Cache" }
          - { value: "monitoring", displayName: "Monitoring" }
      - key: env
        displayName: "Environment"
        description: "Deployment environment"
        values:
          - { value: "production", displayName: "Production" }
          - { value: "staging", displayName: "Staging" }
          - { value: "development", displayName: "Development" }
      - key: tier
        displayName: "Network Tier"
        description: "Application network tier"
        values:
          - { value: "frontend", displayName: "Frontend" }
          - { value: "backend", displayName: "Backend" }
          - { value: "data", displayName: "Data" }
      - key: compliance
        displayName: "Compliance"
        description: "Compliance framework requirement"
        values:
          - { value: "pci-dss", displayName: "PCI-DSS" }
          - { value: "hipaa", displayName: "HIPAA" }
          - { value: "sox", displayName: "SOX" }
```

The UI reads this catalog and presents dropdowns/chips for tag assignment. Admins can add new tag keys and values through the UI (updates the ConfigMap).

### Applying Tags to VMs

Tags are applied as labels on the VirtualMachine resource:

```python
async def set_vm_security_tags(self, namespace: str, name: str, tags: dict[str, str]):
    """Set security tags on a VM. Removes old security tags not in the new set."""
    vm = await self.get_vm(namespace, name)
    labels = vm.get("metadata", {}).get("labels", {})

    # Remove existing security tags
    labels = {k: v for k, v in labels.items() if not k.startswith("security.kubevmui.io/")}

    # Apply new tags
    for key, value in tags.items():
        labels[f"security.kubevmui.io/{key}"] = value

    # Patch VM
    await self.patch_vm(namespace, name, {"metadata": {"labels": labels}})
```

Tags on the VM propagate to the VMI (VirtualMachineInstance) pod via KubeVirt's label propagation, which is what NetworkPolicy selectors match against.

## CRD: `securitygroups.kubevmui.io`

**Scope:** Cluster

**Group:** `kubevmui.io`

**Version:** `v1`

**Kind:** `SecurityGroup`

**Plural:** `securitygroups`

**Short name:** `sg`

### Spec Schema

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `displayName` | string | yes | — | Human-readable name |
| `description` | string | no | `""` | Optional description |
| `color` | string | no | — | Hex color for UI display (e.g., `#6366f1`) |
| `membershipCriteria` | array | yes | — | At least one criterion (AND logic between criteria) |
| `membershipCriteria[].type` | enum | yes | — | `tag`, `name`, `namespace`, or `cidr` |
| `membershipCriteria[].key` | string | conditional | — | Tag key (required when type=tag). Short form without prefix, e.g., `app` not `security.kubevmui.io/app` |
| `membershipCriteria[].operator` | enum | no | `In` | `In`, `NotIn`, `Exists`, `DoesNotExist` |
| `membershipCriteria[].values` | array(string) | conditional | — | Values to match (required for `In`/`NotIn`) |
| `membershipCriteria[].pattern` | string | conditional | — | Glob pattern for name matching (required when type=name) |
| `membershipCriteria[].names` | array(string) | conditional | — | Namespace names (required when type=namespace) |
| `membershipCriteria[].cidrs` | array(string) | conditional | — | CIDR ranges (required when type=cidr). For external IP groups. |

### Status Schema (set by backend reconciler)

| Field | Type | Description |
|-------|------|-------------|
| `memberCount` | integer | Number of VMs matching all criteria |
| `members` | array | List of `{namespace, name}` for matched VMs |
| `lastEvaluated` | string (ISO datetime) | Last time membership was evaluated |
| `labelSelector` | string | Computed K8s label selector string (for transparency) |

### Example: Tag-based group

```yaml
apiVersion: kubevmui.io/v1
kind: SecurityGroup
metadata:
  name: web-servers
spec:
  displayName: "Web Servers"
  description: "All frontend and backend web VMs"
  color: "#3b82f6"
  membershipCriteria:
    - type: tag
      key: app
      operator: In
      values: ["web-frontend", "web-backend"]
    - type: tag
      key: env
      operator: In
      values: ["production", "staging"]
status:
  memberCount: 8
  members:
    - { namespace: production, name: web-frontend-01 }
    - { namespace: production, name: web-frontend-02 }
    - { namespace: production, name: web-backend-01 }
    - { namespace: staging, name: web-frontend-01 }
  lastEvaluated: "2026-04-02T12:00:00Z"
  labelSelector: "security.kubevmui.io/app in (web-frontend,web-backend),security.kubevmui.io/env in (production,staging)"
```

### Example: External IP group

```yaml
apiVersion: kubevmui.io/v1
kind: SecurityGroup
metadata:
  name: management-network
spec:
  displayName: "Management Network"
  description: "Corporate management subnet and jump hosts"
  color: "#8b5cf6"
  membershipCriteria:
    - type: cidr
      cidrs:
        - "10.0.100.0/24"
        - "192.168.1.50/32"
```

### Example: Name-pattern group

```yaml
apiVersion: kubevmui.io/v1
kind: SecurityGroup
metadata:
  name: database-servers
spec:
  displayName: "Database Servers"
  description: "All database VMs by naming convention"
  membershipCriteria:
    - type: tag
      key: app
      operator: In
      values: ["database"]
```

### Resolving SecurityGroup to Label Selector

```python
def resolve_label_selector(group: SecurityGroup) -> dict:
    """Convert tag criteria to K8s label selector components."""
    match_labels = {}
    match_expressions = []

    for c in group.spec.membershipCriteria:
        if c.type != "tag":
            continue

        full_key = f"security.kubevmui.io/{c.key}"

        if c.operator == "In" and len(c.values) == 1:
            match_labels[full_key] = c.values[0]
        elif c.operator in ("In", "NotIn"):
            match_expressions.append({
                "key": full_key,
                "operator": c.operator,
                "values": c.values,
            })
        elif c.operator == "Exists":
            match_expressions.append({
                "key": full_key,
                "operator": "Exists",
            })
        elif c.operator == "DoesNotExist":
            match_expressions.append({
                "key": full_key,
                "operator": "DoesNotExist",
            })

    return {
        "matchLabels": match_labels,
        "matchExpressions": match_expressions,
    }
```

## CRD: `firewallpolicies.kubevmui.io`

**Scope:** Cluster

**Group:** `kubevmui.io`

**Version:** `v1`

**Kind:** `FirewallPolicy`

**Plural:** `firewallpolicies`

**Short name:** `fwp`

### Spec Schema

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `displayName` | string | yes | — | Human-readable policy name |
| `description` | string | no | `""` | Optional description |
| `priority` | integer | yes | — | Policy evaluation order (lower = higher precedence). Range: 1-10000 |
| `enabled` | boolean | no | `true` | Enable/disable without deleting |
| `backend` | enum | no | `auto` | `auto`, `calico`, `cilium`, `kubernetes`. Auto-detects CNI if not set |
| `appliedTo` | object | yes | — | Which VMs this policy applies to |
| `appliedTo.securityGroup` | string | conditional | — | SecurityGroup name (mutually exclusive with `allVMs`) |
| `appliedTo.allVMs` | boolean | conditional | — | Apply to all VMs in all namespaces |
| `rules` | array | yes | — | Ordered list of firewall rules |
| `rules[].name` | string | yes | — | Rule name (unique within policy) |
| `rules[].description` | string | no | — | Rule description |
| `rules[].action` | enum | yes | — | `Allow` or `Deny` |
| `rules[].direction` | enum | yes | — | `ingress` or `egress` |
| `rules[].source` | object | yes | — | Traffic source |
| `rules[].source.securityGroup` | string | conditional | — | SecurityGroup name, or `any` for all sources |
| `rules[].source.ipBlock` | object | conditional | — | Raw CIDR block `{cidr, except[]}` |
| `rules[].destination` | object | yes | — | Traffic destination |
| `rules[].destination.securityGroup` | string | conditional | — | SecurityGroup name, or `any` for all destinations |
| `rules[].destination.ipBlock` | object | conditional | — | Raw CIDR block `{cidr, except[]}` |
| `rules[].services` | array | no | — | Port/protocol list. Empty or omitted = all traffic |
| `rules[].services[].protocol` | enum | yes | — | `TCP`, `UDP`, `ICMP`, `SCTP` |
| `rules[].services[].ports` | array(intOrString) | no | — | Port numbers or ranges (e.g., `[80, 443, "8000-8999"]`). Omit for all ports of this protocol |
| `rules[].logging` | boolean | no | `false` | Enable logging for this rule (Calico only) |

### Status Schema (set by backend reconciler)

| Field | Type | Description |
|-------|------|-------------|
| `detectedBackend` | string | CNI backend in use (`calico`, `cilium`, `kubernetes`) |
| `generatedResources` | integer | Number of network policy resources generated |
| `lastSyncTime` | string (ISO datetime) | Last successful reconciliation |
| `conditions` | array | Standard K8s conditions (Synced, DenyLimited, Error) |
| `warnings` | array(string) | Warnings (e.g., "Deny rules have limited effect on vanilla Kubernetes") |

### Example: Three-tier application firewall

```yaml
apiVersion: kubevmui.io/v1
kind: FirewallPolicy
metadata:
  name: three-tier-app
spec:
  displayName: "Three-Tier Application Policy"
  description: "Standard three-tier firewall: web → app → db"
  priority: 100
  enabled: true
  backend: auto

  appliedTo:
    allVMs: true

  rules:
    # Allow HTTPS from anywhere to web tier
    - name: allow-https-to-web
      description: "Allow inbound HTTPS to web servers"
      action: Allow
      direction: ingress
      source:
        securityGroup: any
      destination:
        securityGroup: web-servers
      services:
        - protocol: TCP
          ports: [443, 80]

    # Allow web tier to app tier on API port
    - name: allow-web-to-app
      description: "Allow web servers to reach application tier"
      action: Allow
      direction: ingress
      source:
        securityGroup: web-servers
      destination:
        securityGroup: app-servers
      services:
        - protocol: TCP
          ports: [8080, 8443]

    # Allow app tier to database tier on DB port
    - name: allow-app-to-db
      description: "Allow application tier to reach databases"
      action: Allow
      direction: ingress
      source:
        securityGroup: app-servers
      destination:
        securityGroup: database-servers
      services:
        - protocol: TCP
          ports: [5432, 3306]

    # Deny direct web-to-db access
    - name: deny-web-to-db
      description: "Block direct access from web tier to database tier"
      action: Deny
      direction: ingress
      source:
        securityGroup: web-servers
      destination:
        securityGroup: database-servers
      services: []

    # Allow monitoring to all tiers
    - name: allow-monitoring
      description: "Allow monitoring probes to all VMs"
      action: Allow
      direction: ingress
      source:
        securityGroup: monitoring-servers
      destination:
        securityGroup: any
      services:
        - protocol: TCP
          ports: [9100, 9090]

    # Allow SSH from management network
    - name: allow-ssh-management
      description: "Allow SSH from management network to all VMs"
      action: Allow
      direction: ingress
      source:
        securityGroup: management-network
      destination:
        securityGroup: any
      services:
        - protocol: TCP
          ports: [22]

status:
  detectedBackend: calico
  generatedResources: 12
  lastSyncTime: "2026-04-02T12:00:00Z"
  conditions:
    - type: Synced
      status: "True"
      lastTransitionTime: "2026-04-02T12:00:00Z"
      message: "All rules synced successfully"
  warnings: []
```

## Policy Generation — Per-Backend Details

### CNI Auto-Detection

```python
async def detect_cni_backend(k8s_client) -> str:
    """Auto-detect CNI by checking for installed CRDs."""
    try:
        crds = await k8s_client.list_crds()
        crd_names = {crd["metadata"]["name"] for crd in crds}

        if "globalnetworkpolicies.crd.projectcalico.org" in crd_names:
            return "calico"
        elif "ciliumnetworkpolicies.cilium.io" in crd_names:
            return "cilium"
        else:
            return "kubernetes"
    except Exception:
        return "kubernetes"
```

### Backend: Calico (Primary)

Calico is the recommended backend because it provides the closest mapping to NSX-T:

**Resources generated:**

| KubeVM UI Resource | Calico Resource |
|---|---|
| First FirewallPolicy created | `Tier` named `kubevmui` (one-time, `order: 500`) |
| SecurityGroup with CIDRs | `GlobalNetworkSet` with `nets` |
| FirewallPolicy | `GlobalNetworkPolicy` per rule (within `kubevmui` tier) |

**Tier creation (one-time):**

```yaml
apiVersion: projectcalico.org/v3
kind: Tier
metadata:
  name: kubevmui
  labels:
    app.kubernetes.io/managed-by: kubevmui
spec:
  order: 500
```

The `kubevmui` tier sits below platform tiers (order 100-300) and above the default tier (order 1000). This means platform-level policies (e.g., deny all inter-namespace traffic) take precedence, while kubevmui policies take precedence over ad-hoc NetworkPolicies in the default tier.

**GlobalNetworkSet for CIDR-based groups:**

```yaml
apiVersion: projectcalico.org/v3
kind: GlobalNetworkSet
metadata:
  name: kubevmui-sg-management-network
  labels:
    app.kubernetes.io/managed-by: kubevmui
    kubevmui.io/security-group: management-network
spec:
  nets:
    - "10.0.100.0/24"
    - "192.168.1.50/32"
```

**GlobalNetworkPolicy per rule:**

```yaml
# Generated from: three-tier-app / allow-https-to-web
apiVersion: projectcalico.org/v3
kind: GlobalNetworkPolicy
metadata:
  name: kubevmui-three-tier-app-allow-https-to-web
  labels:
    app.kubernetes.io/managed-by: kubevmui
    kubevmui.io/firewall-policy: three-tier-app
    kubevmui.io/rule: allow-https-to-web
spec:
  tier: kubevmui
  order: 100                  # from policy priority
  selector: security.kubevmui.io/app in { "web-frontend", "web-backend" }
  types:
    - Ingress
  ingress:
    - action: Allow
      protocol: TCP
      destination:
        ports: [443, 80]
      # source: any → no source selector needed

---
# Generated from: three-tier-app / deny-web-to-db
apiVersion: projectcalico.org/v3
kind: GlobalNetworkPolicy
metadata:
  name: kubevmui-three-tier-app-deny-web-to-db
  labels:
    app.kubernetes.io/managed-by: kubevmui
    kubevmui.io/firewall-policy: three-tier-app
    kubevmui.io/rule: deny-web-to-db
spec:
  tier: kubevmui
  order: 100
  selector: security.kubevmui.io/app == "database"
  types:
    - Ingress
  ingress:
    - action: Deny
      protocol: TCP
      source:
        selector: security.kubevmui.io/app in { "web-frontend", "web-backend" }

---
# Generated from: three-tier-app / allow-ssh-management (CIDR source)
apiVersion: projectcalico.org/v3
kind: GlobalNetworkPolicy
metadata:
  name: kubevmui-three-tier-app-allow-ssh-management
  labels:
    app.kubernetes.io/managed-by: kubevmui
    kubevmui.io/firewall-policy: three-tier-app
    kubevmui.io/rule: allow-ssh-management
spec:
  tier: kubevmui
  order: 100
  selector: has(security.kubevmui.io/app)    # all tagged VMs
  types:
    - Ingress
  ingress:
    - action: Allow
      protocol: TCP
      source:
        nets:
          - "10.0.100.0/24"
          - "192.168.1.50/32"
      destination:
        ports: [22]
```

**Calico logging support:**

```yaml
# When rule has logging: true
ingress:
  - action: Log
    protocol: TCP
    source:
      selector: security.kubevmui.io/app in { "web-frontend" }
  - action: Allow      # Log then Allow — Calico processes both
    protocol: TCP
    source:
      selector: security.kubevmui.io/app in { "web-frontend" }
    destination:
      ports: [8080]
```

### Backend: Cilium

**Resources generated:**

| KubeVM UI Resource | Cilium Resource |
|---|---|
| SecurityGroup with CIDRs | `CiliumCIDRGroup` |
| FirewallPolicy Allow rules | `CiliumClusterwideNetworkPolicy` with `ingress`/`egress` |
| FirewallPolicy Deny rules | `CiliumClusterwideNetworkPolicy` with `ingressDeny`/`egressDeny` |

**CiliumCIDRGroup for CIDR-based groups:**

```yaml
apiVersion: cilium.io/v2alpha1
kind: CiliumCIDRGroup
metadata:
  name: kubevmui-sg-management-network
  labels:
    app.kubernetes.io/managed-by: kubevmui
    kubevmui.io/security-group: management-network
spec:
  externalCIDRs:
    - "10.0.100.0/24"
    - "192.168.1.50/32"
```

**CiliumClusterwideNetworkPolicy — Allow rule:**

```yaml
# Generated from: three-tier-app / allow-web-to-app
apiVersion: cilium.io/v2
kind: CiliumClusterwideNetworkPolicy
metadata:
  name: kubevmui-three-tier-app-allow-web-to-app
  labels:
    app.kubernetes.io/managed-by: kubevmui
    kubevmui.io/firewall-policy: three-tier-app
    kubevmui.io/rule: allow-web-to-app
spec:
  endpointSelector:
    matchLabels:
      security.kubevmui.io/app: app-server
  ingress:
    - fromEndpoints:
        - matchLabels:
            security.kubevmui.io/app: web-frontend
        - matchLabels:
            security.kubevmui.io/app: web-backend
      toPorts:
        - ports:
            - port: "8080"
              protocol: TCP
            - port: "8443"
              protocol: TCP
```

**CiliumClusterwideNetworkPolicy — Deny rule:**

```yaml
# Generated from: three-tier-app / deny-web-to-db
apiVersion: cilium.io/v2
kind: CiliumClusterwideNetworkPolicy
metadata:
  name: kubevmui-three-tier-app-deny-web-to-db
  labels:
    app.kubernetes.io/managed-by: kubevmui
    kubevmui.io/firewall-policy: three-tier-app
    kubevmui.io/rule: deny-web-to-db
spec:
  endpointSelector:
    matchLabels:
      security.kubevmui.io/app: database
  ingressDeny:                  # Cilium-specific deny section
    - fromEndpoints:
        - matchLabels:
            security.kubevmui.io/app: web-frontend
        - matchLabels:
            security.kubevmui.io/app: web-backend
```

**Cilium limitation — no policy ordering:**

Cilium evaluates all policies additively. Deny rules always take precedence over Allow rules (Cilium's built-in behavior). This means:
- If a Deny rule and an Allow rule match the same traffic, the Deny wins — regardless of priority.
- Priority field is used only by the reconciler to decide generation order, not by Cilium itself.
- The UI should surface a warning when conflicting Allow/Deny rules exist on Cilium.

**Cilium L7 extension (future):**

The FirewallPolicy CRD can be extended with an optional `l7Rules` field for Cilium-only HTTP filtering:

```yaml
rules:
  - name: allow-api-readonly
    action: Allow
    direction: ingress
    source:
      securityGroup: web-servers
    destination:
      securityGroup: app-servers
    services:
      - protocol: TCP
        ports: [8080]
    l7Rules:                    # Cilium-only, ignored on other backends
      http:
        - method: GET
          path: "/api/.*"
```

### Backend: Vanilla Kubernetes (Fallback)

**Resources generated:**

| KubeVM UI Resource | K8s Resource |
|---|---|
| SecurityGroup | Inline `podSelector` / `namespaceSelector` |
| FirewallPolicy Allow rule | `NetworkPolicy` per namespace where destination VMs exist |
| FirewallPolicy Deny rule | `NetworkPolicy` that selects pods (activates implicit default-deny) without allowing the denied source |

**NetworkPolicy generation (per target namespace):**

```yaml
# Generated from: three-tier-app / allow-web-to-app
# Created in every namespace where app-servers VMs exist
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: kubevmui-three-tier-app-allow-web-to-app
  namespace: production
  labels:
    app.kubernetes.io/managed-by: kubevmui
    kubevmui.io/firewall-policy: three-tier-app
    kubevmui.io/rule: allow-web-to-app
spec:
  podSelector:
    matchLabels:
      security.kubevmui.io/app: app-server
  policyTypes:
    - Ingress
  ingress:
    - from:
        - podSelector:
            matchLabels:
              security.kubevmui.io/app: web-frontend
          namespaceSelector: {}     # all namespaces
        - podSelector:
            matchLabels:
              security.kubevmui.io/app: web-backend
          namespaceSelector: {}
      ports:
        - protocol: TCP
          port: 8080
        - protocol: TCP
          port: 8443
```

**Vanilla K8s limitations:**

| Feature | Supported | Workaround |
|---|---|---|
| Explicit Deny | No | Implicit deny via selecting policy |
| Policy ordering | No | Reconciler skips lower-priority Allow when Deny exists |
| Cluster-scoped policy | No | Must create NetworkPolicy in each namespace |
| Named IP groups | No | Inline `ipBlock` in each rule |
| Logging | No | None |
| L7 rules | No | None |

When `backend: kubernetes` and a Deny rule is used, the status shows:
```yaml
warnings:
  - "Deny rule 'deny-web-to-db' uses implicit deny on vanilla Kubernetes. A selecting NetworkPolicy is created to activate default-deny, but explicit per-source deny is not supported. Consider using Calico or Cilium for full deny support."
```

## Reconciliation Engine

### Architecture

```
FirewallPolicy CRD watch + SecurityGroup CRD watch
        ↓
   ReconciliationEngine
        ↓
   detect_cni_backend()
        ↓
   PolicyGenerator (strategy pattern)
        ├── CalicoGenerator
        ├── CiliumGenerator
        └── KubernetesGenerator
        ↓
   Desired State (list of resources to create)
        ↓
   Diff against existing kubevmui-managed resources
        ↓
   Create / Update / Delete
```

### Reconciliation Triggers

1. **On FirewallPolicy create/update/delete** — reconcile that policy
2. **On SecurityGroup create/update/delete** — reconcile all policies referencing that group
3. **On VM label change** — re-evaluate SecurityGroup membership (optional, can be periodic)
4. **Periodic full sync** — every 60 seconds, full reconciliation of all policies

### Reconciliation Logic

```python
class ReconciliationEngine:
    def __init__(self, k8s_client: K8sClient):
        self.k8s = k8s_client
        self.backend = None  # detected on first run

    async def reconcile_all(self):
        """Full reconciliation of all firewall policies."""
        if self.backend is None:
            self.backend = await detect_cni_backend(self.k8s)

        # 1. Load all SecurityGroups and FirewallPolicies
        groups = await self.k8s.list_security_groups()
        policies = await self.k8s.list_firewall_policies()
        groups_by_name = {g["metadata"]["name"]: g for g in groups}

        # 2. Select generator
        generator = self._get_generator()

        # 3. Generate desired state
        desired = []
        for policy in policies:
            if not policy["spec"].get("enabled", True):
                continue
            resources = generator.generate(policy, groups_by_name)
            desired.extend(resources)

        # 4. Load existing kubevmui-managed resources
        existing = await self._list_managed_resources()

        # 5. Diff and apply
        to_create, to_update, to_delete = self._diff(desired, existing)

        for r in to_create:
            await self._create_resource(r)
        for r in to_update:
            await self._update_resource(r)
        for r in to_delete:
            await self._delete_resource(r)

        # 6. Update SecurityGroup status (member counts)
        await self._update_group_statuses(groups)

        # 7. Update FirewallPolicy status
        for policy in policies:
            await self._update_policy_status(policy, desired)

    def _get_generator(self) -> PolicyGenerator:
        if self.backend == "calico":
            return CalicoGenerator()
        elif self.backend == "cilium":
            return CiliumGenerator()
        else:
            return KubernetesGenerator()

    async def _list_managed_resources(self) -> list:
        """List all resources managed by kubevmui across all backends."""
        resources = []
        if self.backend == "calico":
            resources.extend(await self.k8s.list_calico_global_network_policies(
                label_selector="app.kubernetes.io/managed-by=kubevmui"
            ))
            resources.extend(await self.k8s.list_calico_global_network_sets(
                label_selector="app.kubernetes.io/managed-by=kubevmui"
            ))
        elif self.backend == "cilium":
            resources.extend(await self.k8s.list_cilium_clusterwide_policies(
                label_selector="app.kubernetes.io/managed-by=kubevmui"
            ))
            resources.extend(await self.k8s.list_cilium_cidr_groups(
                label_selector="app.kubernetes.io/managed-by=kubevmui"
            ))
        else:
            resources.extend(await self.k8s.list_network_policies_all_namespaces(
                label_selector="app.kubernetes.io/managed-by=kubevmui"
            ))
        return resources

    def _diff(self, desired, existing):
        """Compute create/update/delete sets by resource name."""
        desired_by_name = {r["metadata"]["name"]: r for r in desired}
        existing_by_name = {r["metadata"]["name"]: r for r in existing}

        to_create = [r for name, r in desired_by_name.items() if name not in existing_by_name]
        to_delete = [r for name, r in existing_by_name.items() if name not in desired_by_name]
        to_update = [
            r for name, r in desired_by_name.items()
            if name in existing_by_name and r["spec"] != existing_by_name[name]["spec"]
        ]
        return to_create, to_update, to_delete
```

### Priority / Deny Conflict Resolution

```python
def resolve_conflicts(rules: list[dict]) -> list[dict]:
    """Process rules by priority, track deny set, suppress conflicting allows."""
    sorted_rules = sorted(rules, key=lambda r: r.get("priority", 5000))

    deny_set = set()   # (src_group, dst_group, service_key) tuples
    effective_rules = []

    for rule in sorted_rules:
        key = (
            rule["source"].get("securityGroup", "any"),
            rule["destination"].get("securityGroup", "any"),
            _service_key(rule.get("services", [])),
        )

        if rule["action"] == "Deny":
            deny_set.add(key)
            effective_rules.append(rule)
        elif rule["action"] == "Allow":
            if key not in deny_set:
                effective_rules.append(rule)
            # else: suppressed by higher-priority deny

    return effective_rules
```

### Safety Mechanisms

1. **Ownership labels** — All generated resources carry `app.kubernetes.io/managed-by: kubevmui` and `kubevmui.io/firewall-policy: <name>`. Only these resources are touched during reconciliation.
2. **Dry-run support** — The reconciler can output the desired state without applying, for preview in the UI.
3. **Disabled policies** — Setting `enabled: false` removes all generated resources for that policy without deleting the CRD.
4. **Orphan cleanup** — On policy deletion, all resources with that policy's label are deleted.
5. **No modification of external policies** — Resources without the `managed-by` label are never touched.

## API Endpoints

### Security Tags

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/v1/clusters/{cluster}/security/tags/catalog` | Get tag catalog (keys + allowed values) |
| `PUT` | `/api/v1/clusters/{cluster}/security/tags/catalog` | Update tag catalog |
| `GET` | `/api/v1/clusters/{cluster}/namespaces/{namespace}/vms/{name}/security-tags` | Get VM's security tags |
| `PUT` | `/api/v1/clusters/{cluster}/namespaces/{namespace}/vms/{name}/security-tags` | Set VM's security tags |
| `POST` | `/api/v1/clusters/{cluster}/security/tags/bulk` | Bulk tag/untag VMs |

### Security Groups

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/v1/clusters/{cluster}/security/groups` | List all Security Groups |
| `GET` | `/api/v1/clusters/{cluster}/security/groups/{name}` | Get Security Group with resolved members |
| `POST` | `/api/v1/clusters/{cluster}/security/groups` | Create Security Group |
| `PUT` | `/api/v1/clusters/{cluster}/security/groups/{name}` | Update Security Group |
| `DELETE` | `/api/v1/clusters/{cluster}/security/groups/{name}` | Delete Security Group |

### Firewall Policies

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/v1/clusters/{cluster}/security/firewall-policies` | List all Firewall Policies |
| `GET` | `/api/v1/clusters/{cluster}/security/firewall-policies/{name}` | Get policy with status |
| `POST` | `/api/v1/clusters/{cluster}/security/firewall-policies` | Create Firewall Policy |
| `PUT` | `/api/v1/clusters/{cluster}/security/firewall-policies/{name}` | Update Firewall Policy |
| `DELETE` | `/api/v1/clusters/{cluster}/security/firewall-policies/{name}` | Delete policy + cleanup generated resources |
| `POST` | `/api/v1/clusters/{cluster}/security/firewall-policies/{name}/toggle` | Enable/disable policy |
| `GET` | `/api/v1/clusters/{cluster}/security/firewall-policies/{name}/preview` | Dry-run: preview generated resources without applying |

### Reconciliation

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/v1/clusters/{cluster}/security/reconcile` | Trigger manual reconciliation |
| `GET` | `/api/v1/clusters/{cluster}/security/status` | Get overall security status (backend, sync time, errors) |

## Backend Architecture

### New Files

| File | Purpose |
|---|---|
| `backend/app/models/security.py` | Pydantic models: `SecurityTag`, `SecurityGroup`, `FirewallPolicy`, `FirewallRule`, `SecurityStatus` |
| `backend/app/services/security_tag_service.py` | Tag catalog CRUD, VM tag get/set, bulk operations |
| `backend/app/services/security_group_service.py` | SecurityGroup CRD CRUD, membership resolution |
| `backend/app/services/firewall_policy_service.py` | FirewallPolicy CRD CRUD, enable/disable, preview |
| `backend/app/services/policy_reconciler.py` | Reconciliation engine, CNI detection, diff/apply |
| `backend/app/services/generators/calico_generator.py` | Calico GlobalNetworkPolicy/Tier/GlobalNetworkSet generation |
| `backend/app/services/generators/cilium_generator.py` | Cilium CiliumClusterwideNetworkPolicy/CIDRGroup generation |
| `backend/app/services/generators/kubernetes_generator.py` | Vanilla NetworkPolicy generation |
| `backend/app/services/generators/base.py` | Abstract `PolicyGenerator` base class |
| `backend/app/api/routes/security.py` | REST endpoints for tags, groups, policies, reconciliation |
| `kubernetes/crds/securitygroups.kubevmui.io.yaml` | SecurityGroup CRD definition |
| `kubernetes/crds/firewallpolicies.kubevmui.io.yaml` | FirewallPolicy CRD definition |

### K8s Client Methods (new)

```python
# SecurityGroup CRD (cluster-scoped)
list_security_groups(label_selector=None) -> list
get_security_group(name) -> dict
create_security_group(body) -> dict
update_security_group(name, body) -> dict
delete_security_group(name)

# FirewallPolicy CRD (cluster-scoped)
list_firewall_policies(label_selector=None) -> list
get_firewall_policy(name) -> dict
create_firewall_policy(body) -> dict
update_firewall_policy(name, body) -> dict
delete_firewall_policy(name)

# Calico resources
list_calico_global_network_policies(label_selector=None) -> list
create_calico_global_network_policy(body) -> dict
update_calico_global_network_policy(name, body) -> dict
delete_calico_global_network_policy(name)
get_or_create_calico_tier(name, order) -> dict
list_calico_global_network_sets(label_selector=None) -> list
create_calico_global_network_set(body) -> dict
delete_calico_global_network_set(name)

# Cilium resources
list_cilium_clusterwide_policies(label_selector=None) -> list
create_cilium_clusterwide_policy(body) -> dict
update_cilium_clusterwide_policy(name, body) -> dict
delete_cilium_clusterwide_policy(name)
list_cilium_cidr_groups(label_selector=None) -> list
create_cilium_cidr_group(body) -> dict
delete_cilium_cidr_group(name)

# Vanilla K8s
list_network_policies_all_namespaces(label_selector=None) -> list
create_network_policy(namespace, body) -> dict
update_network_policy(namespace, name, body) -> dict
delete_network_policy(namespace, name)

# CRD detection
list_crds() -> list
```

## Frontend Architecture

### New Pages

#### 1. Security Tags Page (`/security/tags`)

**Layout:**
- **Left panel:** Tag catalog editor — list of tag keys, each expandable to show allowed values. Add/edit/delete keys and values.
- **Right panel:** VM tag assignment table — all VMs with their current security tags shown as colored chips. Bulk select + assign/remove tags via toolbar.

**Interactions:**
- Click a tag chip on a VM to remove it
- "Assign Tags" button opens a modal with tag key/value dropdowns
- Bulk select VMs → toolbar shows "Tag Selected" / "Untag Selected"
- Search/filter VMs by tag

#### 2. Security Groups Page (`/security/groups`)

**Layout:**
- Table listing all Security Groups with columns: Name, Display Name, Criteria Summary, Member Count, Last Evaluated
- Click row → detail slide-over or page

**Group Detail:**
- Membership criteria displayed as human-readable pills: `app IN (web-frontend, web-backend) AND env IN (production)`
- Resolved members table with namespace, name, tags
- "Edit" button opens criteria builder

**Group Create/Edit Modal:**
- Name, Display Name, Description, Color picker
- Criteria builder:
  - "Add Criterion" button
  - Each criterion: type selector (Tag / Name Pattern / Namespace / CIDR)
  - Tag: key dropdown (from catalog), operator dropdown (In/NotIn/Exists), value multi-select (from catalog)
  - CIDR: text input with CIDR validation
  - Multiple criteria = AND logic (displayed with "AND" connectors)
- "Preview Members" button → resolves criteria and shows matching VMs before saving

#### 3. Firewall Policies Page (`/security/firewall-policies`)

**Layout inspired by NSX-T Distributed Firewall:**

**Top section:**
- Policy list as collapsible sections, ordered by priority
- Each policy shows: name, priority, enabled/disabled toggle, rule count, sync status badge
- Drag handle to reorder (updates priority)

**Expanded policy (rule table):**

| # | Name | Source | Destination | Services | Action | Log | |
|---|------|--------|-------------|----------|--------|-----|---|
| 1 | allow-https-to-web | Any | web-servers | TCP/443, TCP/80 | Allow | - | Edit / Delete |
| 2 | allow-web-to-app | web-servers | app-servers | TCP/8080 | Allow | - | Edit / Delete |
| 3 | deny-web-to-db | web-servers | database-servers | Any | Deny | Yes | Edit / Delete |

- Source and Destination shown as Security Group chips (clickable → shows members)
- Services shown as protocol/port badges
- Action column: green "Allow" or red "Deny" badges
- "Add Rule" button at bottom of each policy
- "Preview Generated Policies" button → shows the actual Calico/Cilium/K8s resources that would be generated

**Rule Add/Edit Modal:**
- Name, Description
- Direction: Ingress / Egress toggle
- Source: dropdown of Security Groups + "Any" option
- Destination: dropdown of Security Groups + "Any" option
- Services: "Add Service" → protocol dropdown (TCP/UDP/ICMP) + port input (supports ranges like `8000-8999`)
- Action: Allow / Deny radio
- Logging: checkbox (shows note "Calico only" if applicable)

### Navigation

New "Security" section in sidebar, between "Monitoring" and "Infrastructure":

```
Security
  ├── Security Tags      (tag icon)
  ├── Security Groups    (shield icon)
  └── Firewall Policies  (flame icon)
```

### New Hooks

| Hook | Query Key | Description |
|---|---|---|
| `useSecurityTagCatalog()` | `["security-tag-catalog", cluster]` | Fetch tag catalog ConfigMap |
| `useUpdateSecurityTagCatalog()` | — | Mutation to update catalog |
| `useVMSecurityTags(namespace, name)` | `["vm-security-tags", cluster, namespace, name]` | Fetch VM's tags |
| `useSetVMSecurityTags()` | — | Mutation to set VM tags |
| `useBulkSetSecurityTags()` | — | Mutation for bulk tag operations |
| `useSecurityGroups()` | `["security-groups", cluster]` | List Security Groups with member counts |
| `useSecurityGroup(name)` | `["security-group", cluster, name]` | Get group with resolved members |
| `useCreateSecurityGroup()` | — | Create mutation |
| `useUpdateSecurityGroup()` | — | Update mutation |
| `useDeleteSecurityGroup()` | — | Delete mutation |
| `useFirewallPolicies()` | `["firewall-policies", cluster]` | List all policies with status |
| `useFirewallPolicy(name)` | `["firewall-policy", cluster, name]` | Get single policy |
| `useCreateFirewallPolicy()` | — | Create mutation |
| `useUpdateFirewallPolicy()` | — | Update mutation |
| `useDeleteFirewallPolicy()` | — | Delete mutation |
| `useToggleFirewallPolicy()` | — | Enable/disable mutation |
| `usePreviewFirewallPolicy(name)` | `["firewall-policy-preview", cluster, name]` | Preview generated resources |
| `useSecurityStatus()` | `["security-status", cluster]` | Overall security sync status |

### New Frontend Files

| File | Purpose |
|---|---|
| `frontend/src/pages/SecurityTagsPage.tsx` | Tag catalog + VM tag management |
| `frontend/src/pages/SecurityGroupsPage.tsx` | Security Group list + CRUD |
| `frontend/src/pages/SecurityGroupDetailPage.tsx` | Group detail with resolved members |
| `frontend/src/pages/FirewallPoliciesPage.tsx` | DFW-style policy/rule management |
| `frontend/src/pages/FirewallPolicyDetailPage.tsx` | Policy detail with rule table + preview |
| `frontend/src/components/security/CriteriaBuilder.tsx` | Reusable membership criteria editor |
| `frontend/src/components/security/RuleEditor.tsx` | Firewall rule add/edit modal |
| `frontend/src/components/security/PolicyPreview.tsx` | Generated resource preview panel |
| `frontend/src/components/security/SecurityGroupChip.tsx` | Clickable group badge with member tooltip |
| `frontend/src/components/security/TagChip.tsx` | Colored tag chip with remove button |
| `frontend/src/hooks/useSecurityTags.ts` | Tag-related React Query hooks |
| `frontend/src/hooks/useSecurityGroups.ts` | SecurityGroup hooks |
| `frontend/src/hooks/useFirewallPolicies.ts` | FirewallPolicy hooks |

### VM Detail Page Integration

Add a "Security" tab to the VM detail page:

- **Current Tags:** Editable tag chips with add/remove
- **Group Membership:** List of Security Groups this VM belongs to (computed by checking which groups' criteria match this VM's tags)
- **Effective Rules:** List of firewall rules that apply to this VM (from all policies where source or destination groups include this VM)

This gives administrators a per-VM security posture view — similar to NSX-T's "Applied Services" tab on a VM.

## CRD Definitions

### `securitygroups.kubevmui.io`

See `kubernetes/crds/securitygroups.kubevmui.io.yaml` for the full CRD definition.

### `firewallpolicies.kubevmui.io`

See `kubernetes/crds/firewallpolicies.kubevmui.io.yaml` for the full CRD definition.

## Out of Scope (Future)

- **L7 HTTP rules** — Cilium supports these natively; can extend `FirewallRule.l7Rules` field later
- **DNS-based groups** — Cilium's `toFQDNs` for allow-by-domain. Requires new SecurityGroup criterion type.
- **Time-based rules** — Schedule-aware policies (e.g., allow maintenance SSH only during change windows). No CNI supports this natively.
- **Microsegmentation visualization** — Graph/topology view showing traffic flows between Security Groups. Requires flow log integration (Calico Flow Logs / Hubble).
- **Policy simulation** — "What if" analysis: given a proposed policy change, show which traffic would be affected. Possible with dry-run + diff.
- **Import from NSX-T** — Parse NSX-T DFW export and generate equivalent KubeVM UI SecurityGroups + FirewallPolicies. Major migration accelerator for VMware refugees.
- **Alerting on policy violations** — Integration with monitoring to alert when denied traffic is detected (requires Calico/Cilium flow logs).

## Migration Path from NSX-T

For vCenter administrators migrating from VMware:

1. **Security Tags** → Export NSX-T tags, create matching tag catalog entries, apply to VMs during migration
2. **Security Groups** → Map NSX-T groups to SecurityGroup CRDs (membership criteria are conceptually identical)
3. **DFW Rules** → Map NSX-T DFW sections to FirewallPolicies, rules to rules. Priority ordering is preserved.
4. **IP Sets** → Map to SecurityGroups with `type: cidr` criteria

The abstraction is intentionally close to NSX-T's model so that migration is mechanical rather than requiring a conceptual redesign.

## CNI Backend Capability Summary

| Capability | Calico | Cilium | Vanilla K8s |
|---|---|---|---|
| Explicit Allow | Yes | Yes | Yes |
| Explicit Deny | Yes | Yes | No (implicit) |
| Policy Priority/Ordering | Yes (Tier + order) | No (additive) | No (additive) |
| Cluster-scoped Policy | Yes (GlobalNetworkPolicy) | Yes (CiliumClusterwideNetworkPolicy) | No (per-namespace) |
| Named IP Groups | Yes (GlobalNetworkSet) | Yes (CiliumCIDRGroup) | No (inline ipBlock) |
| Logging | Yes (action: Log) | Yes (Hubble) | No |
| L7 HTTP Rules | No | Yes | No |
| DNS-based Rules | Limited | Yes (toFQDNs) | No |
| Host Endpoint Policies | Yes | Yes | No |

**Recommendation:** Use **Calico** for the most faithful NSX-T experience. Use **Cilium** if L7 rules or DNS-based policies are needed. Vanilla K8s is supported as a fallback but with significant limitations.

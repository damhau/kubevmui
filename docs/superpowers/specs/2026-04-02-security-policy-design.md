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


## Firewall Logging & Flow Visibility

### NSX-T Context

VMware NSX-T provides integrated firewall logging: every DFW rule can be toggled to log matching traffic, with logs forwarded to syslog or vRealize Log Insight. Administrators expect to see which rules fired, what was allowed/denied, and source/destination details — all from within the management UI.

KubeVM UI must provide equivalent visibility. The implementation varies significantly by CNI backend, so the abstraction layer needs to normalize the experience.

### Logging Capabilities by Backend

| Capability | Calico OSS | Calico Enterprise | Cilium / Hubble (OSS) | Cilium Enterprise | Vanilla K8s |
|---|---|---|---|---|---|
| **Per-rule logging** | Yes (`action: Log`) | Yes | Yes (Hubble observes all flows) | Yes | No |
| **Source/Dest IP:port** | Yes (iptables log) | Yes | Yes | Yes | No |
| **Pod name / namespace** | No (IP only) | Yes | Yes | Yes | No |
| **Pod labels** | No | Yes | Yes | Yes | No |
| **Policy name in verdict** | No (chain name only) | Yes | Limited (drop reason, not policy name) | Yes (full audit trail) | No |
| **Allow / Deny verdict** | Implicit from chain | Yes | Yes (`FORWARDED` / `DROPPED`) | Yes | No |
| **Bytes / packets** | No | Yes (aggregated) | Via Prometheus metrics | Yes | No |
| **L7 (HTTP, DNS)** | No | No | Yes (with L7 proxy enabled) | Yes | No |
| **TCP flags** | Yes (raw) | Yes | Yes | Yes | No |
| **Real-time streaming** | syslog tail | Near-real-time | Yes (gRPC stream) | Yes | No |
| **Historical query** | grep log files | Elasticsearch | No (in-memory ring buffer) | Yes (Timescape) | No |
| **Programmatic API** | No | Proprietary REST | Yes (gRPC / protobuf) | Yes | No |
| **Performance impact** | High (per-packet kernel log) | Moderate (aggregated, 30s windows) | Very low (<1% CPU, eBPF native) | Very low | N/A |

### Backend: Calico OSS — `action: Log`

Calico open-source supports per-rule logging via the `action: Log` iptables target. This is a **non-terminating action** — it logs the packet and continues evaluating subsequent rules.

**How it works:**
1. The reconciler inserts an `action: Log` entry before the actual `Allow` or `Deny` action
2. Felix creates iptables LOG rules that emit kernel log messages
3. Logs appear in syslog (`/var/log/syslog`, `/var/log/kern.log`, or journald)

**Generated Calico policy with logging:**

```yaml
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
    # Log action first (non-terminating, logs then continues)
    - action: Log
      protocol: TCP
      source:
        selector: security.kubevmui.io/app in { "web-frontend", "web-backend" }
    # Then the actual deny
    - action: Deny
      protocol: TCP
      source:
        selector: security.kubevmui.io/app in { "web-frontend", "web-backend" }
```

**Log format (iptables LOG):**

```
calico-packet: IN=cali1a2b3c OUT= MAC=aa:bb:cc:dd:ee:ff
  SRC=10.0.1.5 DST=10.0.2.3 LEN=60 TOS=0x00 PREC=0x00 TTL=64
  ID=54321 DF PROTO=TCP SPT=45678 DPT=5432 WINDOW=29200
  RES=0x00 SYN URGP=0
```

The prefix `calico-packet` is configurable via Felix's `iptablesLogPrefix` setting. The reconciler sets a **custom prefix** per rule for correlation:

```yaml
# Felix configuration for kubevmui-managed logging
spec:
  ingress:
    - action: Log
      metadata:
        annotations:
          # Custom log prefix for correlation
          projectcalico.org/log-prefix: "kubevmui:deny-web-to-db"
```

**Calico OSS limitations:**
- **IP addresses only** — no pod name, namespace, or label metadata in the log. The backend must correlate IPs to pods via the K8s API.
- **Per-packet logging** — no aggregation. High-traffic rules will flood syslog. Use selectively.
- **No structured format** — standard iptables LOG text. Must be parsed.
- **No built-in query API** — must grep syslog or use an external log aggregator.

**KubeVM UI approach for Calico OSS:**

The backend collects logs via two mechanisms:
1. **Primary:** If a log aggregator is configured (Loki/Elasticsearch URL in config), query it directly
2. **Fallback:** Read syslog from node filesystem (via DaemonSet or hostPath mount) and parse iptables LOG entries with IP-to-pod correlation

### Backend: Cilium — Hubble

Hubble is Cilium's built-in observability layer. It is **fully open-source** and provides the richest flow visibility of any CNI.

**Architecture:**
- **Hubble Server** — embedded in the Cilium agent on each node. Hooks into eBPF data path with zero-copy flow capture.
- **Hubble Relay** — separate Deployment that aggregates flow data from all nodes. Exposes a cluster-wide gRPC API on port 4245.
- **Hubble UI** — optional web UI showing service dependency map and flow table.
- **Hubble CLI** — command-line client for filtering and streaming flows.

**Key advantage:** Hubble observes **all** flows automatically — no per-rule logging toggle needed. The `logging: true` field on a FirewallPolicy rule controls whether the KubeVM UI actively queries and displays logs for that rule, not whether Hubble captures them.

**Hubble gRPC API:**

```protobuf
service Observer {
  rpc GetFlows(GetFlowsRequest) returns (stream GetFlowsResponse);
  rpc GetAgentEvents(GetAgentEventsRequest) returns (stream GetAgentEventsResponse);
  rpc ServerStatus(ServerStatusRequest) returns (ServerStatusResponse);
}
```

The API supports rich server-side filtering:
- By namespace, pod name, label
- By verdict (`FORWARDED`, `DROPPED`, `REDIRECTED`, `ERROR`, `AUDIT`)
- By protocol, port, IP
- By traffic direction (ingress/egress)
- By HTTP method, URL, status code (L7)

**Flow event JSON structure:**

```json
{
  "time": "2026-04-02T10:30:00.123Z",
  "verdict": "DROPPED",
  "drop_reason": 133,
  "drop_reason_desc": "POLICY_DENIED",
  "IP": {
    "source": "10.0.1.5",
    "destination": "10.0.2.3",
    "ipVersion": "IPv4"
  },
  "l4": {
    "TCP": {
      "source_port": 45678,
      "destination_port": 5432,
      "flags": { "SYN": true }
    }
  },
  "source": {
    "identity": 12345,
    "namespace": "default",
    "labels": ["k8s:security.kubevmui.io/app=web-frontend"],
    "pod_name": "web-frontend-01"
  },
  "destination": {
    "identity": 67890,
    "namespace": "production",
    "labels": ["k8s:security.kubevmui.io/app=database"],
    "pod_name": "db-postgres-01"
  },
  "traffic_direction": "INGRESS",
  "trace_observation_point": "TO_ENDPOINT",
  "policy_match_type": 1
}
```

**Hubble file export (for long-term storage):**

Cilium can export Hubble flows to files, consumed by Fluent Bit/FluentD for forwarding to Loki, Elasticsearch, or Splunk:

```yaml
# Cilium Helm values
hubble:
  export:
    static:
      enabled: true
      filePath: /var/run/cilium/hubble/events.log
      fieldMask: [time, source, destination, verdict, l4, drop_reason_desc]
      allowList:
        - '{"verdict":["DROPPED"]}'   # only export denied flows
```

**Hubble Prometheus metrics (always recommended):**

```yaml
hubble:
  metrics:
    enabled:
      - dns
      - drop
      - tcp
      - flow
      - icmp
      - httpV2:exemplars=true;labelsContext=source_namespace,destination_namespace
```

These metrics power Grafana dashboards showing drop rates, flow counts, and HTTP golden signals per namespace/pod.

**Cilium limitations:**
- **In-memory ring buffer** — Hubble does not persist flow history by default (configurable size, default 4096 events per node). For historical queries, export to Loki/Elasticsearch is required.
- **Policy name not in OSS verdicts** — Hubble OSS shows `POLICY_DENIED` as the drop reason but does not include the specific policy name. Cilium Enterprise adds full policy audit trails.

### Backend: Vanilla Kubernetes

**There is no native NetworkPolicy logging.** The Kubernetes NetworkPolicy API is declarative intent only — enforcement and visibility are entirely delegated to the CNI.

If the detected backend is `kubernetes` and logging is requested on a rule, the backend sets a warning:

```yaml
status:
  warnings:
    - "Logging is not available with vanilla Kubernetes NetworkPolicy. Install Calico or Cilium for flow visibility."
```

### Log Aggregation Architecture

KubeVM UI needs a unified log query layer that abstracts the CNI-specific mechanisms:

```
┌─────────────────────────────────────────────────────┐
│                   KubeVM UI                         │
│              Flow Log Viewer Page                   │
└──────────────────┬──────────────────────────────────┘
                   │ REST API
┌──────────────────▼──────────────────────────────────┐
│              Backend: FlowLogService                │
│     Unified query interface across backends         │
└──────┬───────────┬───────────────┬──────────────────┘
       │           │               │
  ┌────▼────┐ ┌────▼─────┐  ┌─────▼──────┐
  │ Calico  │ │ Cilium   │  │ External   │
  │ Adapter │ │ Adapter  │  │ Log Store  │
  │         │ │          │  │ Adapter    │
  └────┬────┘ └────┬─────┘  └─────┬──────┘
       │           │               │
  syslog +    Hubble Relay    Loki / ES /
  IP-to-pod   gRPC API       Splunk API
  correlation
```

**Three adapter implementations:**

1. **CiliumFlowAdapter** (recommended) — Connects to Hubble Relay gRPC API. Real-time streaming with rich filtering. Best experience.
2. **CalicoFlowAdapter** — Parses syslog for `calico-packet` or custom kubevmui prefixes. Correlates IPs to pods via K8s API. Limited metadata.
3. **ExternalLogStoreAdapter** — Queries Loki (LogQL), Elasticsearch (Lucene), or Splunk (SPL) for kubevmui-tagged log entries. Works with any CNI when a log aggregator is deployed.

### Unified Flow Log Data Model

Regardless of backend, the FlowLogService normalizes all flow events to a common model:

```python
class FlowLogEntry(BaseModel):
    """Unified flow log entry across all CNI backends."""
    timestamp: str                          # ISO 8601
    verdict: str                            # "ALLOWED" | "DENIED" | "LOGGED"
    direction: str                          # "ingress" | "egress"

    # Source
    source_ip: str
    source_port: int | None = None
    source_pod: str | None = None           # "namespace/pod-name"
    source_namespace: str | None = None
    source_labels: dict[str, str] | None = None
    source_security_group: str | None = None  # resolved from labels

    # Destination
    dest_ip: str
    dest_port: int | None = None
    dest_pod: str | None = None
    dest_namespace: str | None = None
    dest_labels: dict[str, str] | None = None
    dest_security_group: str | None = None

    # Protocol
    protocol: str                           # "TCP" | "UDP" | "ICMP"
    tcp_flags: list[str] | None = None      # ["SYN", "ACK", ...]

    # Policy correlation
    firewall_policy: str | None = None      # kubevmui FirewallPolicy name
    rule_name: str | None = None            # rule within the policy
    cni_policy_name: str | None = None      # actual Calico/Cilium resource name

    # L7 (Cilium only)
    http_method: str | None = None
    http_url: str | None = None
    http_status: int | None = None
    dns_query: str | None = None
    dns_response: list[str] | None = None

    # Metadata
    node: str | None = None                 # node where the flow was observed
    backend: str                            # "calico" | "cilium" | "external"


class FlowLogQuery(BaseModel):
    """Query parameters for flow log search."""
    # Time range
    start_time: str | None = None           # ISO 8601
    end_time: str | None = None
    last: str | None = None                 # "5m", "1h", "24h" shorthand

    # Filters
    verdict: str | None = None              # "ALLOWED" | "DENIED"
    direction: str | None = None
    source_security_group: str | None = None
    dest_security_group: str | None = None
    source_namespace: str | None = None
    dest_namespace: str | None = None
    source_pod: str | None = None
    dest_pod: str | None = None
    protocol: str | None = None
    dest_port: int | None = None
    firewall_policy: str | None = None
    rule_name: str | None = None

    # Pagination
    limit: int = 100
    offset: int = 0

    # Mode
    follow: bool = False                    # Real-time streaming (WebSocket)


class FlowLogResponse(BaseModel):
    """Paginated flow log response."""
    entries: list[FlowLogEntry]
    total: int | None = None                # None for streaming mode
    backend: str                            # which adapter served this query
    has_more: bool = False
    warnings: list[str] = []                # e.g., "Pod names not available on Calico OSS"
```

### IP-to-Pod Correlation (Calico OSS)

Since Calico OSS `action: Log` only provides IP addresses, the backend must resolve IPs to pods:

```python
class IPToPodResolver:
    """Resolves IP addresses to pod metadata using the K8s API."""

    def __init__(self, k8s_client: K8sClient):
        self.k8s = k8s_client
        self._cache: dict[str, PodInfo] = {}
        self._cache_ttl = 30  # seconds

    async def resolve(self, ip: str) -> PodInfo | None:
        """Resolve an IP to pod name, namespace, and labels."""
        if ip in self._cache and not self._cache[ip].expired:
            return self._cache[ip]

        # Search all pods for this IP
        pods = await self.k8s.list_pods_all_namespaces(
            field_selector=f"status.podIP={ip}"
        )
        if pods:
            pod = pods[0]
            info = PodInfo(
                name=pod.metadata.name,
                namespace=pod.metadata.namespace,
                labels=pod.metadata.labels or {},
                ip=ip,
                expires_at=time.time() + self._cache_ttl,
            )
            self._cache[ip] = info
            return info
        return None

    async def enrich_flow_entry(self, entry: FlowLogEntry) -> FlowLogEntry:
        """Enrich a flow log entry with pod metadata."""
        src = await self.resolve(entry.source_ip)
        if src:
            entry.source_pod = f"{src.namespace}/{src.name}"
            entry.source_namespace = src.namespace
            entry.source_labels = src.labels
            entry.source_security_group = self._find_matching_group(src.labels)

        dst = await self.resolve(entry.dest_ip)
        if dst:
            entry.dest_pod = f"{dst.namespace}/{dst.name}"
            entry.dest_namespace = dst.namespace
            entry.dest_labels = dst.labels
            entry.dest_security_group = self._find_matching_group(dst.labels)

        return entry
```

### Configuration

New settings in the backend configuration:

```python
# config.py additions
class Settings(BaseSettings):
    # ... existing settings ...

    # Flow log backend (auto-detected if not set)
    kubevmui_flow_log_backend: str | None = None  # "cilium" | "calico" | "loki" | "elasticsearch"

    # Cilium / Hubble
    kubevmui_hubble_relay_address: str = "hubble-relay.kube-system.svc:4245"
    kubevmui_hubble_tls_enabled: bool = False
    kubevmui_hubble_tls_ca_cert: str | None = None

    # Calico syslog
    kubevmui_calico_log_prefix: str = "kubevmui"
    kubevmui_calico_syslog_path: str = "/var/log/syslog"

    # External log store
    kubevmui_loki_url: str | None = None          # e.g., "http://loki.monitoring:3100"
    kubevmui_elasticsearch_url: str | None = None  # e.g., "http://elasticsearch.logging:9200"
    kubevmui_elasticsearch_index: str = "kubevmui-flows-*"
```

### API Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/v1/clusters/{cluster}/security/flow-logs` | Query flow logs with filters |
| `WS` | `/ws/flow-logs/{cluster}` | Real-time flow log streaming via WebSocket |
| `GET` | `/api/v1/clusters/{cluster}/security/flow-logs/summary` | Aggregated flow summary (top sources, destinations, denied count) |
| `GET` | `/api/v1/clusters/{cluster}/security/flow-logs/stats` | Flow statistics per Security Group pair |
| `GET` | `/api/v1/clusters/{cluster}/security/flow-log-config` | Get current flow log backend configuration and status |

#### Query Parameters for `GET /flow-logs`

```
?verdict=DENIED
&source_security_group=web-servers
&dest_security_group=database-servers
&protocol=TCP
&dest_port=5432
&last=1h
&limit=100
&offset=0
&firewall_policy=three-tier-app
```

#### WebSocket Streaming `/ws/flow-logs/{cluster}`

```json
// Client sends filter on connect
{"type": "subscribe", "filters": {
  "verdict": "DENIED",
  "dest_security_group": "database-servers",
  "follow": true
}}

// Server streams matching flows
{"type": "flow", "data": {
  "timestamp": "2026-04-02T10:30:00.123Z",
  "verdict": "DENIED",
  "source_pod": "default/web-frontend-01",
  "source_security_group": "web-servers",
  "dest_pod": "production/db-postgres-01",
  "dest_security_group": "database-servers",
  "protocol": "TCP",
  "dest_port": 5432,
  "firewall_policy": "three-tier-app",
  "rule_name": "deny-web-to-db"
}}
```

#### Flow Summary Response

```json
{
  "time_range": {"start": "2026-04-02T09:30:00Z", "end": "2026-04-02T10:30:00Z"},
  "total_flows": 15420,
  "allowed_flows": 14890,
  "denied_flows": 530,
  "top_denied_sources": [
    {"security_group": "web-servers", "count": 312},
    {"security_group": "untrusted-zone", "count": 198}
  ],
  "top_denied_destinations": [
    {"security_group": "database-servers", "count": 425, "port": 5432},
    {"security_group": "app-servers", "count": 105, "port": 8080}
  ],
  "top_denied_rules": [
    {"policy": "three-tier-app", "rule": "deny-web-to-db", "count": 312},
    {"policy": "perimeter", "rule": "deny-untrusted", "count": 198}
  ],
  "flows_by_security_group_pair": [
    {"source": "web-servers", "destination": "app-servers", "allowed": 8500, "denied": 0},
    {"source": "web-servers", "destination": "database-servers", "allowed": 0, "denied": 312},
    {"source": "app-servers", "destination": "database-servers", "allowed": 6200, "denied": 0},
    {"source": "monitoring-servers", "destination": "web-servers", "allowed": 190, "denied": 0}
  ],
  "backend": "cilium"
}
```

### Backend Files

| File | Purpose |
|---|---|
| `backend/app/services/flow_log_service.py` | Unified FlowLogService with adapter selection |
| `backend/app/services/flow_adapters/base.py` | Abstract `FlowLogAdapter` base class |
| `backend/app/services/flow_adapters/cilium_adapter.py` | Hubble Relay gRPC client, flow streaming and querying |
| `backend/app/services/flow_adapters/calico_adapter.py` | Syslog parser, iptables LOG prefix matching, IP-to-pod resolution |
| `backend/app/services/flow_adapters/loki_adapter.py` | Loki LogQL query adapter |
| `backend/app/services/flow_adapters/elasticsearch_adapter.py` | Elasticsearch query adapter |
| `backend/app/models/flow_log.py` | Pydantic models: `FlowLogEntry`, `FlowLogQuery`, `FlowLogResponse`, `FlowSummary` |
| `backend/app/api/routes/flow_logs.py` | REST + WebSocket endpoints |
| `backend/app/ws/flow_log_proxy.py` | WebSocket proxy for real-time flow streaming |

## Flow Log Viewer — Frontend UI

### New Page: Flow Logs (`/security/flow-logs`)

This is the primary security monitoring interface — equivalent to NSX-T's "Flow Monitoring" view. It combines a real-time flow table, filter controls, and aggregated statistics.

#### Page Layout

```
┌──────────────────────────────────────────────────────────────────┐
│  TopBar: "Flow Logs"                     [Backend: Cilium ✓]    │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─── Filter Bar ──────────────────────────────────────────────┐ │
│  │ Verdict: [All ▾]  Source: [Any Group ▾]  Dest: [Any Group ▾]│ │
│  │ Protocol: [All ▾] Port: [____]  Policy: [All ▾]             │ │
│  │ Time: [Last 1h ▾]  [🔴 Live]  [Search]  [Clear]            │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  ┌─── Stats Cards ────────────────────────────────────────────┐ │
│  │ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌───────────────┐  │ │
│  │ │ Total    │ │ Allowed  │ │ Denied   │ │ Denied Rate   │  │ │
│  │ │ 15,420   │ │ 14,890   │ │ 530      │ │ 3.4%          │  │ │
│  │ │ flows    │ │ ✓ green  │ │ ✗ red    │ │ ▲ 0.2%        │  │ │
│  │ └──────────┘ └──────────┘ └──────────┘ └───────────────┘  │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  ┌─── Flow Table ─────────────────────────────────────────────┐ │
│  │ Time       │ Verdict │ Source          │ Dest            │   │ │
│  │            │         │ Pod / Group     │ Pod / Group     │   │ │
│  │            │         │                 │ Port / Protocol │   │ │
│  │────────────┼─────────┼─────────────────┼─────────────────┤   │ │
│  │ 10:30:00   │ DENIED  │ web-frontend-01 │ db-postgres-01  │   │ │
│  │            │   ✗     │ ○ web-servers   │ ○ db-servers    │   │ │
│  │            │         │                 │ TCP/5432        │   │ │
│  │────────────┼─────────┼─────────────────┼─────────────────┤   │ │
│  │ 10:29:58   │ ALLOWED │ web-frontend-01 │ app-api-03      │   │ │
│  │            │   ✓     │ ○ web-servers   │ ○ app-servers   │   │ │
│  │            │         │                 │ TCP/8080        │   │ │
│  │────────────┼─────────┼─────────────────┼─────────────────┤   │ │
│  │ 10:29:55   │ DENIED  │ 203.0.113.50   │ web-frontend-01 │   │ │
│  │            │   ✗     │ (external)      │ ○ web-servers   │   │ │
│  │            │         │                 │ TCP/22          │   │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  ┌─── Top Denied Pairs (mini chart) ─────────────────────────┐ │
│  │ web-servers → database-servers  ████████████████  312      │ │
│  │ untrusted   → web-servers       ██████████       198      │ │
│  │ web-servers → app-servers        ████            105      │ │
│  └─────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────┘
```

#### Filter Bar

| Filter | Type | Options | Description |
|---|---|---|---|
| Verdict | Dropdown | All, Allowed, Denied | Filter by flow verdict |
| Source | Dropdown | Any, (list of Security Groups) | Source Security Group |
| Destination | Dropdown | Any, (list of Security Groups) | Destination Security Group |
| Protocol | Dropdown | All, TCP, UDP, ICMP | Protocol filter |
| Port | Text input | Number or range | Destination port |
| Policy | Dropdown | All, (list of FirewallPolicies) | Filter by matching policy |
| Time | Dropdown | Last 5m, 15m, 1h, 6h, 24h, Custom | Time range |
| Live | Toggle button | On/Off | Enable real-time streaming via WebSocket |
| Search | Button | — | Execute query |
| Clear | Button | — | Reset all filters |

When **Live mode** is enabled:
- The flow table auto-updates as new flows arrive via WebSocket
- New rows animate in at the top with a highlight flash
- Stats cards update every 5 seconds
- The "Live" button pulses red with a dot indicator
- Maximum 500 rows kept in the table (older rows removed)

#### Stats Cards

Four summary cards at the top, updated every 10 seconds (or live):

| Card | Value | Style |
|---|---|---|
| Total Flows | Count in time range | Neutral |
| Allowed | Count of FORWARDED/ALLOWED | Green badge |
| Denied | Count of DROPPED/DENIED | Red badge with attention if > 0 |
| Denied Rate | (Denied / Total) percentage + trend arrow | Warning if > 5% |

#### Flow Table

Each row displays one flow event. Columns:

| Column | Content | Notes |
|---|---|---|
| Time | `HH:MM:SS.ms` | Hover shows full ISO timestamp |
| Verdict | `ALLOWED` (green checkmark) or `DENIED` (red X) | Bold colored badge |
| Source | Pod name + Security Group chip | Pod as `namespace/name`, group as colored chip. External IPs show as IP with "(external)" label |
| Destination | Pod name + Security Group chip + Port/Protocol | Same as source, plus `TCP/5432` badge |

**Row click** expands to show full flow detail:

```
┌─── Flow Detail ────────────────────────────────────────────┐
│ Timestamp:    2026-04-02T10:30:00.123Z                     │
│ Verdict:      DENIED                                        │
│ Direction:    Ingress                                       │
│                                                             │
│ Source:                                                     │
│   Pod:        default/web-frontend-01                       │
│   IP:         10.0.1.5:45678                                │
│   Labels:     security.kubevmui.io/app=web-frontend         │
│               security.kubevmui.io/env=production            │
│   Group:      web-servers                                    │
│                                                             │
│ Destination:                                                │
│   Pod:        production/db-postgres-01                     │
│   IP:         10.0.2.3:5432                                 │
│   Labels:     security.kubevmui.io/app=database             │
│   Group:      database-servers                              │
│                                                             │
│ Protocol:     TCP (SYN)                                     │
│ Node:         worker-02                                     │
│                                                             │
│ Matched Rule:                                               │
│   Policy:     three-tier-app (priority 100)                 │
│   Rule:       deny-web-to-db                                │
│   Action:     Deny                                          │
│                                                             │
│ CNI Resource: kubevmui-three-tier-app-deny-web-to-db        │
│ Backend:      cilium (Hubble)                               │
└─────────────────────────────────────────────────────────────┘
```

#### Top Denied Pairs Chart

Horizontal bar chart showing the top 5 Security Group pairs with the most denied flows. Each bar is clickable — clicking filters the flow table to that pair. Shows:
- Source Group → Destination Group label
- Bar proportional to count
- Count number

#### Backend Availability Banner

If the detected CNI doesn't support logging, or Hubble Relay is unreachable, a banner appears:

```
┌─── Warning ─────────────────────────────────────────────────┐
│ ⚠ Flow logging is limited on Calico OSS. Pod names and     │
│   labels are resolved from IP addresses and may be delayed. │
│   For full visibility, upgrade to Cilium or Calico Enterprise│
└─────────────────────────────────────────────────────────────┘
```

Or for vanilla K8s:

```
┌─── Warning ─────────────────────────────────────────────────┐
│ ⚠ Flow logging is not available with vanilla Kubernetes     │
│   NetworkPolicy. Install Calico or Cilium for flow          │
│   visibility.                                               │
└─────────────────────────────────────────────────────────────┘
```

### Integration: Firewall Policy Detail Page

Add a **"Logs" tab** to the Firewall Policy detail page showing flows matched by that specific policy:

- Pre-filtered to `firewall_policy=<policy-name>`
- Same flow table as the main flow log page but scoped
- Per-rule breakdown: collapsible sections showing flow counts per rule
- Sparkline chart showing denied flows over time for this policy

### Integration: VM Detail Page — Security Tab

Extend the existing Security tab on the VM detail page with a **"Recent Flows" section**:

- Shows last 50 flows involving this VM (as source or destination)
- Filter toggle: All / Denied Only
- Compact table format (time, verdict, peer pod, port)
- "View All" link navigates to Flow Logs page pre-filtered to this VM

### Integration: Security Groups Detail Page

Add **"Flow Activity" section** to the Security Group detail page:

- Shows flow counts between this group and other groups (last 1h)
- Mini bar chart: allowed vs denied per peer group
- Clickable to navigate to Flow Logs filtered by this group

### Navigation Update

Add "Flow Logs" to the Security section in the sidebar:

```
Security
  ├── Security Tags      (tag icon)
  ├── Security Groups    (shield icon)
  ├── Firewall Policies  (flame icon)
  └── Flow Logs          (activity icon)
```

### New Frontend Files

| File | Purpose |
|---|---|
| `frontend/src/pages/FlowLogsPage.tsx` | Main flow log viewer with filters, table, and stats |
| `frontend/src/components/security/FlowTable.tsx` | Flow log table with expandable row detail |
| `frontend/src/components/security/FlowDetailPanel.tsx` | Expanded flow detail view |
| `frontend/src/components/security/FlowStatsCards.tsx` | Summary statistics cards |
| `frontend/src/components/security/FlowFilterBar.tsx` | Filter controls bar |
| `frontend/src/components/security/DeniedPairsChart.tsx` | Top denied pairs horizontal bar chart |
| `frontend/src/components/security/BackendStatusBanner.tsx` | CNI capability warning banner |
| `frontend/src/hooks/useFlowLogs.ts` | React Query hooks for flow log queries + WebSocket streaming |

### New Hooks

| Hook | Query Key | Description |
|---|---|---|
| `useFlowLogs(query)` | `["flow-logs", cluster, ...filters]` | Query flow logs with pagination |
| `useFlowLogStream(filters)` | — | WebSocket hook for real-time flow streaming |
| `useFlowLogSummary(timeRange)` | `["flow-log-summary", cluster, timeRange]` | Aggregated flow statistics (10s refetch) |
| `useFlowLogStats()` | `["flow-log-stats", cluster]` | Per-Security Group pair flow counts |
| `useFlowLogConfig()` | `["flow-log-config", cluster]` | Backend configuration and capabilities |

## Out of Scope (Future)

- **L7 HTTP rules** — Cilium supports these natively; can extend `FirewallRule.l7Rules` field later
- **DNS-based groups** — Cilium's `toFQDNs` for allow-by-domain. Requires new SecurityGroup criterion type.
- **Time-based rules** — Schedule-aware policies (e.g., allow maintenance SSH only during change windows). No CNI supports this natively.
- **Microsegmentation visualization** — Graph/topology view showing traffic flows between Security Groups as a network map. Requires flow log data (now available via the Flow Log Viewer).
- **Policy simulation** — "What if" analysis: given a proposed policy change, show which traffic would be affected. Possible with dry-run + diff.
- **Import from NSX-T** — Parse NSX-T DFW export and generate equivalent KubeVM UI SecurityGroups + FirewallPolicies. Major migration accelerator for VMware refugees.
- **Alerting on policy violations** — Threshold-based alerts when denied flow counts exceed a configurable limit. Can leverage the FlowLogSummary data.
- **Flow log retention policies** — Configurable TTL for flow data in external log stores (Loki/Elasticsearch).
- **Grafana dashboard provisioning** — Auto-provisioned Grafana dashboards for Hubble Prometheus metrics or Loki flow queries.

## Migration Path from NSX-T

For vCenter administrators migrating from VMware:

1. **Security Tags** → Export NSX-T tags, create matching tag catalog entries, apply to VMs during migration
2. **Security Groups** → Map NSX-T groups to SecurityGroup CRDs (membership criteria are conceptually identical)
3. **DFW Rules** → Map NSX-T DFW sections to FirewallPolicies, rules to rules. Priority ordering is preserved.
4. **IP Sets** → Map to SecurityGroups with `type: cidr` criteria
5. **Flow Monitoring** → NSX-T flow monitoring maps to the Flow Log Viewer. Cilium/Hubble provides equivalent or better visibility than NSX-T's IPFIX-based flow collection.

The abstraction is intentionally close to NSX-T's model so that migration is mechanical rather than requiring a conceptual redesign.

## CNI Backend Capability Summary

| Capability | Calico OSS | Calico Enterprise | Cilium / Hubble (OSS) | Cilium Enterprise | Vanilla K8s |
|---|---|---|---|---|---|
| Explicit Allow | Yes | Yes | Yes | Yes | Yes |
| Explicit Deny | Yes | Yes | Yes | Yes | No (implicit) |
| Policy Priority/Ordering | Yes (Tier + order) | Yes | No (additive) | No (additive) | No (additive) |
| Cluster-scoped Policy | Yes (GlobalNetworkPolicy) | Yes | Yes (CiliumClusterwideNetworkPolicy) | Yes | No (per-namespace) |
| Named IP Groups | Yes (GlobalNetworkSet) | Yes | Yes (CiliumCIDRGroup) | Yes | No (inline ipBlock) |
| Per-rule Logging | Yes (`action: Log` → syslog) | Yes (aggregated flow logs) | Yes (Hubble captures all) | Yes | No |
| Pod-aware Log Metadata | No (IP only) | Yes | Yes | Yes | No |
| Policy Name in Verdict | No | Yes | Limited (drop reason) | Yes (full audit) | No |
| Real-time Flow Streaming | syslog tail | Near-real-time | Yes (gRPC) | Yes | No |
| Historical Flow Query | grep log files | Elasticsearch | No (ring buffer)* | Yes (Timescape) | No |
| Flow Export to SIEM | DIY (syslog forward) | FluentD pipeline | File export + FluentD | Managed connectors | No |
| Prometheus Flow Metrics | Basic Felix metrics | Yes | Yes (rich) | Yes | No |
| L7 Visibility (HTTP/DNS) | No | No | Yes | Yes | No |
| Performance Impact | High (per-packet) | Moderate | Very Low (<1% CPU) | Very Low | N/A |
| L7 HTTP Rules | No | No | Yes | Yes | No |
| DNS-based Rules | Limited | Limited | Yes (toFQDNs) | Yes | No |
| Host Endpoint Policies | Yes | Yes | Yes | Yes | No |

*\*Cilium OSS Hubble uses an in-memory ring buffer. For historical queries, export to Loki/Elasticsearch via Hubble file exporter.*

**Recommendation:** Use **Cilium** for the best combined policy + logging experience (eBPF native, Hubble built-in, very low overhead). Use **Calico** if policy ordering/tiers are critical and you can accept limited OSS logging (or invest in Calico Enterprise). Vanilla K8s is supported as a fallback but with no logging and limited deny support.

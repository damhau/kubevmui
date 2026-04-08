# Self-Service Portal — Design Spec

**Date:** 2026-04-03
**Status:** Draft

## Problem

KubeVM UI is currently an **administrator tool** — every user sees the full infrastructure (nodes, storage classes, networks, security policies). VMware environments have vRealize Automation (now Aria Automation) to give developers and business units a self-service portal where they can request VMs from a curated catalog without seeing or understanding the infrastructure.

Without self-service, every VM request goes through the infrastructure team, creating a bottleneck.

## Solution

Introduce a **Tenant Portal** — a simplified, role-aware view of KubeVM UI where non-admin users can:

- Browse a curated catalog of approved VM templates
- Deploy VMs within their assigned namespace(s) with resource quota enforcement
- Manage their own VMs (start/stop/restart/console/delete)
- View their own VM metrics and events
- Cannot see or modify infrastructure (nodes, storage, networks, security policies, other namespaces)

The portal is not a separate application — it's the **same React app** with a role-based view switcher. Admins see everything; tenants see only their resources.

## Key Decisions

- **Same app, different view** — No separate deployment. The frontend detects the user's role and renders the appropriate view. This simplifies deployment and avoids maintaining two codebases.
- **Namespace as tenancy boundary** — Each tenant is assigned one or more namespaces. They can only see resources in their namespaces. This aligns with Kubernetes RBAC.
- **K8s RBAC is the source of truth** — The backend does not maintain its own user/role database. It checks what the authenticated user can do via K8s `SelfSubjectAccessReview` and scopes the UI accordingly.
- **No approval workflow in v1** — Tenants can deploy anything from the approved catalog up to their quota. Approval workflows (request → admin approves → VM created) are a future enhancement.
- **Resource quotas enforced by Kubernetes** — The backend does not duplicate quota enforcement. It relies on K8s `ResourceQuota` objects in tenant namespaces. The UI surfaces quota usage and warns before exceeding.
- **Tenant config via CRD** — A `Tenant` CRD defines which namespaces, catalog entries, templates, and resource limits a tenant has access to.

## CRD: `tenants.kubevmui.io`

**Scope:** Cluster

**Group:** `kubevmui.io`

**Version:** `v1`

**Kind:** `Tenant`

**Plural:** `tenants`

**Short name:** `tn`

### Spec Schema

| Field | Type | Required | Description |
|---|---|---|---|
| `displayName` | string | yes | Human-readable tenant name |
| `description` | string | no | Optional description |
| `namespaces` | array(string) | yes | Namespaces this tenant can access |
| `users` | array | no | K8s users/groups mapped to this tenant |
| `users[].name` | string | yes | K8s username or group name |
| `users[].type` | enum | yes | `user` or `group` |
| `allowedCatalog` | array(string) | no | Allowed CatalogEntry names (empty = all) |
| `allowedTemplates` | array(string) | no | Allowed Template names (empty = all) |
| `allowedNetworks` | array(string) | no | Allowed Network CR names (empty = all) |
| `allowedStorageClasses` | array(string) | no | Allowed StorageClasses (empty = all) |
| `maxVMs` | integer | no | Maximum number of VMs across all namespaces (0 = unlimited) |
| `defaults` | object | no | Default values for VM creation |
| `defaults.storageClass` | string | no | Default StorageClass |
| `defaults.networkCR` | string | no | Default Network CR |
| `branding` | object | no | Tenant-specific branding |
| `branding.welcomeMessage` | string | no | Custom welcome message on dashboard |
| `branding.color` | string | no | Accent color override |

### Example

```yaml
apiVersion: kubevmui.io/v1
kind: Tenant
metadata:
  name: engineering
spec:
  displayName: "Engineering Team"
  description: "Development and staging VMs for the engineering department"
  namespaces:
    - eng-dev
    - eng-staging
  users:
    - name: dev-team
      type: group
    - name: john.doe@corp.com
      type: user
  allowedCatalog:
    - ubuntu-2404
    - debian-12
    - fedora-41
  allowedTemplates: []     # all templates
  allowedNetworks:
    - pod-network
    - dev-vlan200
  allowedStorageClasses:
    - longhorn
  maxVMs: 20
  defaults:
    storageClass: longhorn
    networkCR: pod-network
  branding:
    welcomeMessage: "Welcome to the Engineering VM Portal"
```

## Role Detection & View Switching

### Backend: Role Resolution

The backend determines the user's effective role on login:

```python
class UserRole(str, Enum):
    ADMIN = "admin"          # Full access to everything
    TENANT = "tenant"        # Scoped to tenant namespaces
    VIEWER = "viewer"        # Read-only across allowed namespaces


async def resolve_user_role(user: UserInfo, k8s_client: K8sClient) -> UserContext:
    """Determine user role and tenant context from K8s RBAC."""

    # 1. Check if user has cluster-admin or kubevmui-admin ClusterRoleBinding
    is_admin = await k8s_client.check_access(
        user, verb="*", resource="*", group="*"
    )
    if is_admin:
        return UserContext(role=UserRole.ADMIN, tenants=[], namespaces=["_all"])

    # 2. Check Tenant CRDs for user/group membership
    tenants = await k8s_client.list_tenants()
    user_tenants = []
    for tenant in tenants:
        for u in tenant["spec"].get("users", []):
            if u["type"] == "user" and u["name"] == user.username:
                user_tenants.append(tenant)
            elif u["type"] == "group" and u["name"] in user.groups:
                user_tenants.append(tenant)

    if user_tenants:
        # Merge namespaces from all matching tenants
        namespaces = set()
        for t in user_tenants:
            namespaces.update(t["spec"]["namespaces"])
        return UserContext(
            role=UserRole.TENANT,
            tenants=user_tenants,
            namespaces=list(namespaces),
        )

    # 3. Fallback: check if user has any namespace-level access
    accessible_ns = await k8s_client.list_accessible_namespaces(user)
    if accessible_ns:
        return UserContext(
            role=UserRole.VIEWER,
            tenants=[],
            namespaces=accessible_ns,
        )

    # 4. No access
    return UserContext(role=None, tenants=[], namespaces=[])
```

### API: User Context Endpoint

```
GET /api/v1/auth/me
```

Response:

```json
{
  "username": "john.doe@corp.com",
  "groups": ["dev-team", "system:authenticated"],
  "role": "tenant",
  "tenants": [
    {
      "name": "engineering",
      "displayName": "Engineering Team",
      "namespaces": ["eng-dev", "eng-staging"],
      "allowedCatalog": ["ubuntu-2404", "debian-12", "fedora-41"],
      "allowedNetworks": ["pod-network", "dev-vlan200"],
      "maxVMs": 20,
      "currentVMs": 12,
      "branding": {
        "welcomeMessage": "Welcome to the Engineering VM Portal"
      }
    }
  ],
  "namespaces": ["eng-dev", "eng-staging"]
}
```

### Frontend: View Switching

The `useAuth` hook is extended to store the user context:

```typescript
interface UserContext {
  username: string;
  role: 'admin' | 'tenant' | 'viewer';
  tenants: Tenant[];
  namespaces: string[];
}
```

The `AppShell` and `Sidebar` components render different navigation based on `role`:

## Navigation Comparison

### Admin View (current — unchanged)

```
Main
  ├── Dashboard
  ├── Virtual Machines
  ├── Import VMs
  ├── Console
  └── Catalog

Monitoring
  ├── Cluster Metrics
  ├── Analytics
  ├── Events
  └── Audit Log

Security
  ├── Security Tags
  ├── Security Groups
  ├── Firewall Policies
  └── Flow Logs

Infrastructure
  ├── Images
  ├── Templates
  ├── Networks
  ├── Storage
  ├── Nodes
  ├── SSH Keys
  └── KubeVirt Info
```

### Tenant View (new — simplified)

```
My VMs
  ├── Dashboard           (scoped to tenant namespaces)
  ├── Virtual Machines    (only tenant's VMs)
  └── Console

Deploy
  ├── Catalog             (filtered to allowed entries)
  └── Templates           (filtered to allowed templates)

My Resources
  ├── SSH Keys            (tenant-scoped)
  └── Events              (tenant-scoped)

Account
  └── Quota Usage         (ResourceQuota visualization)
```

No Infrastructure, Monitoring (cluster-level), Security, or Import sections visible.

## Tenant Pages

### Tenant Dashboard

Simplified dashboard showing only the tenant's resources:

```
┌─── Welcome ──────────────────────────────────────────────┐
│ Welcome to the Engineering VM Portal                      │
│ You have 12 VMs running across 2 namespaces              │
└──────────────────────────────────────────────────────────┘

┌─── My VMs ────────┐ ┌─── Quota Usage ────────────────────┐
│ Running:    8      │ │ VMs:    12 / 20     ████████░░ 60% │
│ Stopped:   4      │ │ CPU:    24 / 40     ██████░░░░ 60% │
│ Error:     0      │ │ Memory: 48 / 80 GB  ██████░░░░ 60% │
│ Total:     12     │ │ Storage: 320 / 500  ██████░░░░ 64% │
└────────────────────┘ └────────────────────────────────────┘

┌─── Quick Actions ────────────────────────────────────────┐
│ [Create VM from Catalog]  [Create VM from Template]      │
└──────────────────────────────────────────────────────────┘

┌─── Recent Activity ─────────────────────────────────────┐
│ 10:30  web-dev-01 started by john.doe                    │
│ 10:15  db-test-02 snapshot created                       │
│ 09:45  api-staging-01 created from ubuntu-2404-medium    │
└──────────────────────────────────────────────────────────┘
```

### Tenant VM List

Same VM list page but:
- Namespace selector only shows tenant namespaces
- Only shows VMs in those namespaces
- "Create VM" limited to allowed templates/catalog entries
- No clone/migrate actions (admin only)
- Start/stop/restart/console/delete available

### Tenant Catalog

Same catalog page but:
- Only shows `allowedCatalog` entries
- Namespace dropdown limited to tenant namespaces
- StorageClass dropdown limited to `allowedStorageClasses`

### Quota Usage Page

Dedicated page showing resource consumption vs limits:

```
┌─── Quota: eng-dev ───────────────────────────────────────┐
│                                                           │
│ Resource        Used     Limit     Usage                  │
│ ─────────────────────────────────────────────             │
│ VMs             8        15        ████████░░░  53%       │
│ CPU (cores)     16       30        █████░░░░░░  53%       │
│ Memory          32 GB    60 GB     █████░░░░░░  53%       │
│ Storage         200 GB   400 GB    █████░░░░░░  50%       │
│                                                           │
├─── Quota: eng-staging ───────────────────────────────────┤
│                                                           │
│ Resource        Used     Limit     Usage                  │
│ ─────────────────────────────────────────────             │
│ VMs             4        10        ████░░░░░░░  40%       │
│ CPU (cores)     8        20        ████░░░░░░░  40%       │
│ Memory          16 GB    40 GB     ████░░░░░░░  40%       │
│ Storage         120 GB   200 GB    ██████░░░░░  60%       │
└──────────────────────────────────────────────────────────┘
```

When a tenant tries to create a VM that would exceed quota, the wizard shows a clear error:

```
⚠ Cannot create this VM: would exceed memory quota in eng-dev
  (requesting 8 GB, only 4 GB remaining of 60 GB limit)
```

## Backend Architecture

### API Scoping

All existing API endpoints are automatically scoped by the user context middleware:

```python
async def get_user_context(request: Request) -> UserContext:
    """Dependency that resolves user role and accessible namespaces."""
    user = await get_current_user(request)
    context = await resolve_user_role(user, get_k8s_client())

    if context.role is None:
        raise HTTPException(403, "No access configured for this user")

    return context


# Example: VM list endpoint scoped by user context
@router.get("/clusters/{cluster}/namespaces/{namespace}/vms")
async def list_vms(
    cluster: str,
    namespace: str,
    ctx: UserContext = Depends(get_user_context),
):
    # Admins can list any namespace
    # Tenants can only list their namespaces
    if ctx.role != UserRole.ADMIN and namespace not in ctx.namespaces:
        raise HTTPException(403, f"Access denied to namespace {namespace}")

    return await vm_service.list_vms(namespace)
```

### New Files

| File | Purpose |
|---|---|
| `backend/app/models/tenant.py` | Pydantic models: `Tenant`, `TenantSpec`, `UserContext`, `QuotaUsage` |
| `backend/app/services/tenant_service.py` | Tenant CRD CRUD, user-tenant resolution, quota aggregation |
| `backend/app/api/routes/tenants.py` | Admin endpoints for tenant management |
| `backend/app/api/middleware/tenant_scope.py` | Middleware to inject UserContext into requests |
| `kubernetes/crds/tenants.kubevmui.io.yaml` | Tenant CRD definition |

### API Endpoints

| Method | Path | Description | Access |
|---|---|---|---|
| `GET` | `/api/v1/auth/me` | Get user context (role, tenants, namespaces) | All |
| `GET` | `/api/v1/clusters/{cluster}/tenants` | List all tenants | Admin |
| `GET` | `/api/v1/clusters/{cluster}/tenants/{name}` | Get tenant details | Admin |
| `POST` | `/api/v1/clusters/{cluster}/tenants` | Create tenant | Admin |
| `PUT` | `/api/v1/clusters/{cluster}/tenants/{name}` | Update tenant | Admin |
| `DELETE` | `/api/v1/clusters/{cluster}/tenants/{name}` | Delete tenant | Admin |
| `GET` | `/api/v1/clusters/{cluster}/tenants/{name}/quota` | Get quota usage | Admin + Tenant |

### Frontend Files

| File | Purpose |
|---|---|
| `frontend/src/pages/TenantDashboardPage.tsx` | Tenant-specific dashboard |
| `frontend/src/pages/QuotaUsagePage.tsx` | Quota visualization page |
| `frontend/src/pages/TenantsAdminPage.tsx` | Admin: tenant management |
| `frontend/src/pages/TenantDetailPage.tsx` | Admin: tenant detail/edit |
| `frontend/src/components/layout/TenantSidebar.tsx` | Simplified sidebar for tenant view |
| `frontend/src/components/tenant/QuotaBar.tsx` | Reusable quota usage bar |
| `frontend/src/components/tenant/QuotaWarning.tsx` | Quota exceeded warning |
| `frontend/src/hooks/useTenants.ts` | Tenant CRUD hooks |
| `frontend/src/hooks/useUserContext.ts` | User role/context hook |

## Admin Tenant Management Page

Admins get a "Tenants" page under Infrastructure to manage tenants:

```
┌─── Tenants ──────────────────────────────────────────────┐
│ [+ Create Tenant]                                        │
│                                                           │
│ Name          │ Namespaces       │ Users  │ VMs │ Quota  │
│───────────────┼──────────────────┼────────┼─────┼────────│
│ Engineering   │ eng-dev, eng-stg │ 8      │ 12  │ 60%   │
│ QA            │ qa-test          │ 3      │ 5   │ 25%   │
│ Data Science  │ ds-prod, ds-dev  │ 5      │ 18  │ 90%   │
└──────────────────────────────────────────────────────────┘
```

Tenant creation wizard:
1. Name and description
2. Assign namespaces (create new or select existing)
3. Map users/groups
4. Select allowed catalog entries, templates, networks, storage classes
5. Set quota limits
6. Review

## Out of Scope (Future)

- **Approval workflows** — Tenant requests VM, admin approves/denies. Requires a request queue and notification system.
- **Cost tracking / chargeback** — Assign cost per vCPU/GB and show tenants their consumption cost. Common in enterprise VMware environments.
- **OIDC group auto-mapping** — Automatically create/update tenants based on OIDC group membership from IdP.
- **Tenant API keys** — Service accounts per tenant for automation (Terraform, Ansible).
- **Custom catalog per tenant** — Tenants can create their own templates within their namespace (not shared globally).
- **Multi-level tenancy** — Org → Team → User hierarchy with inherited quotas.

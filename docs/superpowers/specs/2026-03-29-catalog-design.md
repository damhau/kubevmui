# Distribution Catalog Feature — Design Spec

> **Date:** 2026-03-29
> **Status:** Approved

## Overview

A distribution catalog that provides one-click provisioning of well-known Linux distributions as ready-to-use images and templates. Users browse a card grid of available distros, pick a namespace, select template sizes, and the system creates everything needed to spin up VMs immediately.

## CRD: CatalogEntry (`catalog.kubevmui.io/v1`)

**Scope:** Cluster-scoped (distros are available to all namespaces).

### Schema

```yaml
apiVersion: catalog.kubevmui.io/v1
kind: CatalogEntry
metadata:
  name: ubuntu-2404
spec:
  displayName: "Ubuntu 24.04 LTS (Noble Numbat)"
  description: "General-purpose Linux server distribution"
  category: "os"            # os | application
  osType: "linux"
  icon: "ubuntu"            # frontend maps to distro logo
  maintainer: "kubevmui"

  image:
    sourceType: "http"      # http | registry | container_disk
    sourceUrl: "https://cloud-images.ubuntu.com/noble/current/noble-server-cloudimg-amd64.img"
    defaultSizeGb: 20

  cloudInit:
    userData: |
      #cloud-config
      package_update: true
      packages: [qemu-guest-agent]
      runcmd:
        - systemctl enable --now qemu-guest-agent

  templates:
    - name: "small"
      displayName: "Small (1 vCPU / 1 GB)"
      cpuCores: 1
      memoryMb: 1024
      diskSizeGb: 20
    - name: "medium"
      displayName: "Medium (2 vCPU / 4 GB)"
      cpuCores: 2
      memoryMb: 4096
      diskSizeGb: 40
    - name: "large"
      displayName: "Large (4 vCPU / 8 GB)"
      cpuCores: 4
      memoryMb: 8192
      diskSizeGb: 80
```

### CRD Fields

| Field | Type | Required | Description |
|---|---|---|---|
| `spec.displayName` | string | yes | Human-readable name |
| `spec.description` | string | no | Short description |
| `spec.category` | enum | yes | `os` or `application` |
| `spec.osType` | string | yes | `linux` or `windows` |
| `spec.icon` | string | no | Icon key for frontend |
| `spec.maintainer` | string | no | Who maintains this entry |
| `spec.image.sourceType` | enum | yes | `http`, `registry`, or `container_disk` |
| `spec.image.sourceUrl` | string | yes | URL to fetch the image from |
| `spec.image.defaultSizeGb` | int | no | Default disk size (default: 20) |
| `spec.cloudInit.userData` | string | no | Default cloud-init user-data YAML |
| `spec.templates[]` | array | yes | At least one template variant |
| `spec.templates[].name` | string | yes | Variant slug (e.g., `small`) |
| `spec.templates[].displayName` | string | yes | Human-readable variant name |
| `spec.templates[].cpuCores` | int | yes | vCPU count |
| `spec.templates[].memoryMb` | int | yes | RAM in MB |
| `spec.templates[].diskSizeGb` | int | no | Disk size override (defaults to `image.defaultSizeGb`) |

## Provisioning Flow

When a user provisions catalog entry `ubuntu-2404` into namespace `my-ns`:

### Resources Created

1. **Image CRD** `ubuntu-2404` in `my-ns`
   - Labeled: `catalog.kubevmui.io/entry: ubuntu-2404`
   - Source type/URL from catalog entry's `image` section
   - Triggers DataVolume creation for http/registry sources

2. **Template CRDs** (one per selected variant):
   - Names: `ubuntu-2404-small`, `ubuntu-2404-medium`, `ubuntu-2404-large`
   - Labeled: `catalog.kubevmui.io/entry: ubuntu-2404`
   - Category: from catalog entry's `category`
   - OS type: from catalog entry's `osType`
   - Disk: `datavolume_clone` referencing the created image
   - Cloud-init: from catalog entry's `cloudInit`
   - Compute: from the template variant's CPU/memory

### Provisioning Logic

1. Fetch the CatalogEntry by name
2. Check if image already exists in target namespace (by label `catalog.kubevmui.io/entry`) — skip creation if so
3. Create Image via existing `ImageService.create_image()` with catalog label
4. For each selected template variant, create Template via existing `TemplateService.create_template()` with catalog label and `datavolume_clone` disk
5. Return the created resource names

### Status Tracking

Query images and templates in a namespace by label `catalog.kubevmui.io/entry={name}`:
- **Not provisioned:** no matching resources
- **Importing:** image exists, DataVolume phase is not `Succeeded`
- **Ready:** image DataVolume `Succeeded`, templates exist
- **Partial:** some but not all template variants exist

## API Endpoints

Catalog endpoints include the cluster parameter (multi-cluster support) but are NOT namespaced (cluster-scoped CRD).

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/v1/clusters/{cluster}/catalog` | List all CatalogEntry resources |
| `GET` | `/api/v1/clusters/{cluster}/catalog/{name}` | Get single catalog entry |
| `POST` | `/api/v1/clusters/{cluster}/catalog/{name}/provision` | Provision into a namespace |
| `GET` | `/api/v1/clusters/{cluster}/catalog/{name}/status?namespace={ns}` | Get provisioning status |

### Provision Request Body

```json
{
  "namespace": "my-ns",
  "storage_class": "longhorn",
  "templates": ["small", "medium", "large"]
}
```

### Status Response

```json
{
  "provisioned": true,
  "image": {
    "name": "ubuntu-2404",
    "phase": "Succeeded",
    "progress": "100%"
  },
  "templates": [
    { "name": "ubuntu-2404-small", "variant": "small", "exists": true },
    { "name": "ubuntu-2404-medium", "variant": "medium", "exists": true },
    { "name": "ubuntu-2404-large", "variant": "large", "exists": false }
  ]
}
```

## Backend Architecture

### New Files

| File | Purpose |
|---|---|
| `backend/app/models/catalog.py` | Pydantic models: `CatalogEntry`, `CatalogImage`, `CatalogTemplate`, `ProvisionRequest`, `ProvisionStatus` |
| `backend/app/services/catalog_service.py` | CRUD for CatalogEntry CRD + provisioning orchestration |
| `backend/app/api/routes/catalog.py` | REST endpoints |
| `kubernetes/crds/catalog.kubevmui.io.yaml` | CRD definition |
| `kubernetes/catalog/` | Default catalog entry YAML manifests |

### Catalog Service Responsibilities

- `list_entries()` — list all CatalogEntry CRs
- `get_entry(name)` — fetch single entry
- `provision(name, request)` — create image + templates in target namespace using existing services
- `get_status(name, namespace)` — check what's provisioned by label query
- `seed_defaults()` — create default CatalogEntries on startup if they don't exist

### Seeding Strategy

- `seed_defaults()` runs at app startup
- Checks if any CatalogEntry CRs exist; if not, creates the default set
- Each default entry is idempotent (uses `name` as key, skips if exists)
- Same entries also shipped as YAML manifests in `kubernetes/catalog/` for GitOps workflows

### K8s Client Integration

CatalogEntry uses the existing `K8sClient` custom object methods:
- Group: `catalog.kubevmui.io`
- Version: `v1`
- Plural: `catalogentries`
- Cluster-scoped: uses `list_cluster_custom_object` / `get_cluster_custom_object` / `create_cluster_custom_object`

## Frontend Architecture

### New Files

| File | Purpose |
|---|---|
| `frontend/src/pages/CatalogPage.tsx` | Main catalog page with card grid |
| `frontend/src/hooks/useCatalog.ts` | React Query hooks for catalog API |

### Navigation

New "Catalog" sidebar item, positioned **above** Templates. Icon: grid or package icon.

### Catalog Page Layout

**Top bar:** Namespace selector (controls status checks + provision target) + text search filter + category filter.

**Body:** Card grid. Each card displays:
- Distro icon (mapped from `icon` field)
- Display name + description
- OS type badge
- Template variant chips (e.g., `S` `M` `L`)
- Namespace-aware status: "Not provisioned" / "Importing (45%)" / "Ready"

### Card Interactions

**Not provisioned:** Click opens provisioning wizard.

**Provisioning wizard (2-3 steps):**
1. **Image Config** — target namespace (pre-filled), storage class dropdown, image size (pre-filled, editable)
2. **Template Selection** — checkboxes per variant (all checked by default), CPU/RAM/disk shown, inline editable
3. **Confirm** — summary of resources to create, "Provision" button

**Already provisioned:** Card shows "Ready" badge. Click goes to "View Resources" (links to image detail + template list filtered by catalog label). Dropdown offers "Re-provision" option.

### React Query Hooks

- `useCatalogEntries()` — fetches `GET /api/v1/catalog`
- `useCatalogEntry(name)` — fetches single entry
- `useCatalogStatus(name, namespace)` — fetches provision status, polls every 5s when importing
- `useProvisionCatalog()` — mutation for `POST /api/v1/catalog/{name}/provision`

## Default Catalog Entries

### Distributions (10 entries)

| Name | Display Name | Source | Default Size | Cloud-Init Package Manager |
|---|---|---|---|---|
| `ubuntu-2404` | Ubuntu 24.04 LTS (Noble Numbat) | http / cloud-images.ubuntu.com | 20 GB | apt |
| `ubuntu-2204` | Ubuntu 22.04 LTS (Jammy Jellyfish) | http / cloud-images.ubuntu.com | 20 GB | apt |
| `debian-12` | Debian 12 (Bookworm) | http / cloud.debian.org | 10 GB | apt |
| `debian-11` | Debian 11 (Bullseye) | http / cloud.debian.org | 10 GB | apt |
| `fedora-41` | Fedora 41 | http / download.fedoraproject.org | 20 GB | dnf |
| `centos-stream-9` | CentOS Stream 9 | http / cloud.centos.org | 20 GB | dnf |
| `rocky-9` | Rocky Linux 9 | http / dl.rockylinux.org | 20 GB | dnf |
| `rocky-10` | Rocky Linux 10 | http / dl.rockylinux.org | 20 GB | dnf |
| `almalinux-9` | AlmaLinux 9 | http / repo.almalinux.org | 20 GB | dnf |
| `alpine-320` | Alpine Linux 3.20 | http / dl-cdn.alpinelinux.org | 5 GB | apk |

### Template Sizes Per Family

**Standard distros** (Ubuntu, Debian, Fedora, CentOS, Rocky, AlmaLinux):
- Small: 1 vCPU / 1 GB RAM / 20 GB disk
- Medium: 2 vCPU / 4 GB RAM / 40 GB disk
- Large: 4 vCPU / 8 GB RAM / 80 GB disk

**Lightweight distros** (Alpine):
- Small: 1 vCPU / 256 MB RAM / 5 GB disk
- Medium: 1 vCPU / 512 MB RAM / 10 GB disk
- Large: 2 vCPU / 1 GB RAM / 20 GB disk

### Cloud-Init Templates

**Debian/Ubuntu family:**
```yaml
#cloud-config
package_update: true
packages: [qemu-guest-agent]
runcmd:
  - systemctl enable --now qemu-guest-agent
```

**RHEL family (Fedora/CentOS/Rocky/Alma):**
```yaml
#cloud-config
package_update: true
packages: [qemu-guest-agent]
runcmd:
  - systemctl enable --now qemu-guest-agent
```

**Alpine:**
```yaml
#cloud-config
apk_repos:
  - main
  - community
packages: [qemu-guest-agent]
runcmd:
  - rc-update add qemu-guest-agent
  - service qemu-guest-agent start
```

## Out of Scope (Future)

- User-created catalog entries via the UI (currently only via kubectl/YAML)
- Catalog entry versioning (e.g., auto-update image URLs when new releases come out)
- Application catalog entries (e.g., pre-configured WordPress, PostgreSQL VMs)
- Windows distribution entries
- Catalog sharing/import from remote registries

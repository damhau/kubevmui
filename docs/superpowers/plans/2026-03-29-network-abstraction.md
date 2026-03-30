# Network Abstraction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the pod/multus binary choice with a unified Network CRD abstraction where all networks (including pod network) are cluster-scoped custom resources, and NADs are created on-demand in target namespaces.

**Architecture:** A cluster-scoped `Network` CRD (`networks.kubevmui.io`) stores the network definition including full CNI config. The backend manages CRUD on Network CRs, seeds a default pod-network CR on startup, and creates NADs on-demand when VMs need them. The frontend shows a flat list of networks — no pod/multus distinction visible to users.

**Tech Stack:** Python FastAPI, Pydantic v2, kubernetes-client (cluster-scoped custom objects), React 19, TypeScript, React Query, Tailwind CSS

**Spec:** `docs/superpowers/specs/2026-03-29-network-abstraction-design.md`

---

## File Structure

### New Files
- `kubernetes/crds/networks.kubevmui.io.yaml` — CRD definition
- `backend/app/models/network_cr.py` — Pydantic models for Network CR
- `backend/app/services/network_cr_service.py` — Network CR CRUD + ensure_nad logic
- `backend/app/api/routes/network_crs.py` — REST endpoints for Network CRs
- `frontend/src/hooks/useNetworkCRs.ts` — React Query hooks for Network CRs

### Modified Files
- `backend/app/core/k8s_client.py` — Add cluster-scoped Network CR methods + NAD label-query methods
- `backend/app/models/common.py` — Update NetworkType enum
- `backend/app/models/vm.py` — Replace `network_profile` with `network_cr` in VMNetworkRef
- `backend/app/services/vm_service.py` — Use Network CR for manifest building + ensure_nad
- `backend/app/api/routes/vms.py` — Update interface endpoints to use Network CR names
- `backend/app/main.py` — Register new router, add Network CR seed to lifespan
- `frontend/src/components/vm/VMCreateWizard.tsx` — Replace NIC type/radio with unified network list
- `frontend/src/components/vm/AddNetworkWizard.tsx` — Replace type step with unified network list
- `frontend/src/pages/NetworksPage.tsx` — Network Profiles tab manages Network CRs
- `frontend/src/pages/TemplatesPage.tsx` — Update NIC type to use Network CR names
- `frontend/src/hooks/useNetworks.ts` — Keep for backward compat (NAD queries), no changes needed
- `frontend/src/hooks/useHotplug.ts` — Update useAddInterfaceToSpec to use Network CR name

---

## Task 1: CRD Definition

**Files:**
- Create: `kubernetes/crds/networks.kubevmui.io.yaml`

- [ ] **Step 1: Create the Network CRD YAML**

```yaml
apiVersion: apiextensions.k8s.io/v1
kind: CustomResourceDefinition
metadata:
  name: networks.networks.kubevmui.io
spec:
  group: networks.kubevmui.io
  names:
    kind: Network
    plural: networks
    singular: network
    shortNames:
      - net
  scope: Cluster
  versions:
    - name: v1
      served: true
      storage: true
      schema:
        openAPIV3Schema:
          type: object
          properties:
            spec:
              type: object
              required:
                - displayName
                - networkType
                - interfaceType
              properties:
                displayName:
                  type: string
                  description: Human-readable name for this network
                description:
                  type: string
                  default: ""
                networkType:
                  type: string
                  enum: [pod, multus]
                interfaceType:
                  type: string
                  enum: [masquerade, bridge]
                bridgeName:
                  type: string
                  description: Name of the bridge created by NNCP (bridge type only)
                vlanId:
                  type: integer
                  description: Optional VLAN ID
                dhcpEnabled:
                  type: boolean
                  default: true
                subnet:
                  type: string
                  description: CIDR notation (informational)
                gateway:
                  type: string
                  description: Gateway IP (informational)
                macSpoofCheck:
                  type: boolean
                  default: false
                cniConfig:
                  type: string
                  description: Full CNI JSON config for NAD generation
      additionalPrinterColumns:
        - name: Display Name
          type: string
          jsonPath: .spec.displayName
        - name: Type
          type: string
          jsonPath: .spec.networkType
        - name: Interface
          type: string
          jsonPath: .spec.interfaceType
        - name: Bridge
          type: string
          jsonPath: .spec.bridgeName
        - name: VLAN
          type: integer
          jsonPath: .spec.vlanId
        - name: Age
          type: date
          jsonPath: .metadata.creationTimestamp
```

- [ ] **Step 2: Apply the CRD to the cluster**

Run: `kubectl apply -f kubernetes/crds/networks.kubevmui.io.yaml`
Expected: `customresourcedefinition.apiextensions.k8s.io/networks.networks.kubevmui.io created`

- [ ] **Step 3: Verify the CRD is registered**

Run: `kubectl get crd networks.networks.kubevmui.io`
Expected: Shows the CRD with CREATED date

- [ ] **Step 4: Commit**

```bash
git add kubernetes/crds/networks.kubevmui.io.yaml
git commit -m "feat: add Network CRD definition (networks.kubevmui.io)"
```

---

## Task 2: Backend Models

**Files:**
- Create: `backend/app/models/network_cr.py`
- Modify: `backend/app/models/vm.py`

- [ ] **Step 1: Create the Network CR Pydantic models**

Create `backend/app/models/network_cr.py`:

```python
from datetime import datetime

from pydantic import BaseModel


class NetworkCR(BaseModel):
    name: str
    display_name: str
    description: str = ""
    network_type: str  # "pod" or "multus"
    interface_type: str  # "masquerade" or "bridge"
    bridge_name: str = ""
    vlan_id: int | None = None
    dhcp_enabled: bool = True
    subnet: str | None = None
    gateway: str | None = None
    mac_spoof_check: bool = False
    cni_config: str | None = None
    created_at: datetime | None = None
    raw_manifest: dict | None = None


class NetworkCRCreate(BaseModel):
    name: str
    display_name: str
    description: str = ""
    network_type: str = "multus"  # "pod" or "multus"
    bridge_name: str = ""
    vlan_id: int | None = None
    dhcp_enabled: bool = True
    subnet: str | None = None
    gateway: str | None = None
    mac_spoof_check: bool = False
    cni_config: str | None = None  # optional — auto-generated from fields if not provided


class NetworkCRUpdate(BaseModel):
    display_name: str | None = None
    description: str | None = None
    bridge_name: str | None = None
    vlan_id: int | None = None
    dhcp_enabled: bool | None = None
    subnet: str | None = None
    gateway: str | None = None
    mac_spoof_check: bool | None = None
    cni_config: str | None = None


class NetworkCRList(BaseModel):
    items: list[NetworkCR]
    total: int
```

- [ ] **Step 2: Update VMNetworkRef to use network_cr instead of network_profile**

In `backend/app/models/vm.py`, change the `VMNetworkRef` class:

```python
class VMNetworkRef(BaseModel):
    name: str
    network_cr: str  # Name of the Network CR
    ip_address: str | None = None
    mac_address: str | None = None
```

Also update `AddInterfaceToSpecRequest` to use network_cr:

```python
class AddInterfaceToSpecRequest(BaseModel):
    name: str
    network_cr: str  # Name of the Network CR
    model: str | None = None
    mac_address: str | None = None
```

Remove `autoattach_pod_interface` from `VMCreate` — it's no longer needed since pod network is just another Network CR entry.

- [ ] **Step 3: Verify models import correctly**

Run: `cd backend && uv run python -c "from app.models.network_cr import NetworkCR, NetworkCRCreate, NetworkCRUpdate, NetworkCRList; print('OK')"`
Expected: `OK`

Run: `cd backend && uv run python -c "from app.models.vm import VMNetworkRef; print(VMNetworkRef.model_fields.keys())"`
Expected: `dict_keys(['name', 'network_cr', 'ip_address', 'mac_address'])`

- [ ] **Step 4: Commit**

```bash
git add backend/app/models/network_cr.py backend/app/models/vm.py
git commit -m "feat: add Network CR models and update VMNetworkRef"
```

---

## Task 3: K8s Client Methods for Network CRs

**Files:**
- Modify: `backend/app/core/k8s_client.py`

- [ ] **Step 1: Add Network CR constants and CRUD methods**

Add constants alongside the existing ones (after line 14):

```python
    NETWORK_CR_GROUP = "networks.kubevmui.io"
    NETWORK_CR_VERSION = "v1"
```

Add these methods after the existing `delete_catalog_entry` method (after line 645):

```python
    # ── Network CRs (cluster-scoped) ─────────────────────────────

    def list_network_crs(self) -> list[dict]:
        result = self.custom_api.list_cluster_custom_object(
            group=self.NETWORK_CR_GROUP,
            version=self.NETWORK_CR_VERSION,
            plural="networks",
        )
        return result.get("items", [])

    def get_network_cr(self, name: str) -> dict | None:
        try:
            return self.custom_api.get_cluster_custom_object(
                group=self.NETWORK_CR_GROUP,
                version=self.NETWORK_CR_VERSION,
                plural="networks",
                name=name,
            )
        except ApiException as e:
            if e.status == 404:
                return None
            raise

    def create_network_cr(self, body: dict) -> dict:
        return self.custom_api.create_cluster_custom_object(
            group=self.NETWORK_CR_GROUP,
            version=self.NETWORK_CR_VERSION,
            plural="networks",
            body=body,
        )

    def patch_network_cr(self, name: str, body: dict) -> dict:
        return self.custom_api.patch_cluster_custom_object(
            group=self.NETWORK_CR_GROUP,
            version=self.NETWORK_CR_VERSION,
            plural="networks",
            name=name,
            body=body,
        )

    def delete_network_cr(self, name: str) -> None:
        self.custom_api.delete_cluster_custom_object(
            group=self.NETWORK_CR_GROUP,
            version=self.NETWORK_CR_VERSION,
            plural="networks",
            name=name,
        )

    # ── NAD operations for on-demand creation ─────────────────────

    def list_nads_by_label(self, namespace: str, label_selector: str) -> list[dict]:
        result = self.custom_api.list_namespaced_custom_object(
            group="k8s.cni.cncf.io",
            version="v1",
            namespace=namespace,
            plural="network-attachment-definitions",
            label_selector=label_selector,
        )
        return result.get("items", [])

    def list_all_nads_by_label(self, label_selector: str) -> list[dict]:
        result = self.custom_api.list_cluster_custom_object(
            group="k8s.cni.cncf.io",
            version="v1",
            plural="network-attachment-definitions",
            label_selector=label_selector,
        )
        return result.get("items", [])

    def create_nad(self, namespace: str, body: dict) -> dict:
        return self.custom_api.create_namespaced_custom_object(
            group="k8s.cni.cncf.io",
            version="v1",
            namespace=namespace,
            plural="network-attachment-definitions",
            body=body,
        )

    def delete_nad(self, namespace: str, name: str) -> None:
        self.custom_api.delete_namespaced_custom_object(
            group="k8s.cni.cncf.io",
            version="v1",
            namespace=namespace,
            plural="network-attachment-definitions",
            name=name,
        )
```

- [ ] **Step 2: Verify methods exist**

Run: `cd backend && uv run python -c "from app.core.k8s_client import KubeVirtClient; print([m for m in dir(KubeVirtClient) if 'network_cr' in m or 'nad' in m])"`
Expected: List containing `list_network_crs`, `get_network_cr`, `create_network_cr`, `patch_network_cr`, `delete_network_cr`, `list_nads_by_label`, `list_all_nads_by_label`, `create_nad`, `delete_nad`

- [ ] **Step 3: Commit**

```bash
git add backend/app/core/k8s_client.py
git commit -m "feat: add K8s client methods for Network CRs and on-demand NADs"
```

---

## Task 4: Network CR Service

**Files:**
- Create: `backend/app/services/network_cr_service.py`

- [ ] **Step 1: Create the Network CR service**

Create `backend/app/services/network_cr_service.py`:

```python
import json
import logging
from datetime import UTC, datetime

from kubernetes.client import ApiException

from app.core.k8s_client import KubeVirtClient
from app.models.network_cr import NetworkCR, NetworkCRCreate, NetworkCRUpdate

logger = logging.getLogger(__name__)

LABEL_MANAGED_BY = "app.kubernetes.io/managed-by"
LABEL_NETWORK_SOURCE = "networks.kubevmui.io/source"
ANNOTATION_DISPLAY_NAME = "kubevmui.io/display-name"


def _cr_from_raw(raw: dict) -> NetworkCR:
    metadata = raw.get("metadata", {})
    spec = raw.get("spec", {})
    created_at = None
    ts = metadata.get("creationTimestamp")
    if ts:
        try:
            created_at = datetime.fromisoformat(ts.replace("Z", "+00:00"))
        except ValueError:
            created_at = datetime.now(tz=UTC)
    return NetworkCR(
        name=metadata.get("name", ""),
        display_name=spec.get("displayName", ""),
        description=spec.get("description", ""),
        network_type=spec.get("networkType", "multus"),
        interface_type=spec.get("interfaceType", "bridge"),
        bridge_name=spec.get("bridgeName", ""),
        vlan_id=spec.get("vlanId"),
        dhcp_enabled=spec.get("dhcpEnabled", True),
        subnet=spec.get("subnet"),
        gateway=spec.get("gateway"),
        mac_spoof_check=spec.get("macSpoofCheck", False),
        cni_config=spec.get("cniConfig"),
        created_at=created_at,
        raw_manifest=raw,
    )


def _build_cni_config(request: NetworkCRCreate) -> str:
    """Build CNI config JSON from structured fields."""
    cni: dict = {
        "cniVersion": "0.3.1",
        "name": request.name,
        "type": "bridge",
    }
    if request.bridge_name:
        cni["bridge"] = request.bridge_name
    if request.vlan_id is not None:
        cni["vlan"] = request.vlan_id
    if request.dhcp_enabled:
        cni["ipam"] = {"type": "dhcp"}
    if request.mac_spoof_check:
        cni["macspoofchk"] = True
    return json.dumps(cni)


def _build_cr_body(request: NetworkCRCreate) -> dict:
    """Build the K8s manifest for a Network CR."""
    interface_type = "masquerade" if request.network_type == "pod" else "bridge"
    cni_config = request.cni_config
    if not cni_config and request.network_type == "multus":
        cni_config = _build_cni_config(request)

    spec: dict = {
        "displayName": request.display_name,
        "description": request.description,
        "networkType": request.network_type,
        "interfaceType": interface_type,
    }
    if request.bridge_name:
        spec["bridgeName"] = request.bridge_name
    if request.vlan_id is not None:
        spec["vlanId"] = request.vlan_id
    spec["dhcpEnabled"] = request.dhcp_enabled
    if request.subnet:
        spec["subnet"] = request.subnet
    if request.gateway:
        spec["gateway"] = request.gateway
    spec["macSpoofCheck"] = request.mac_spoof_check
    if cni_config:
        spec["cniConfig"] = cni_config

    return {
        "apiVersion": "networks.kubevmui.io/v1",
        "kind": "Network",
        "metadata": {"name": request.name},
        "spec": spec,
    }


class NetworkCRService:
    def __init__(self, kv: KubeVirtClient):
        self.kv = kv

    def list_networks(self) -> list[NetworkCR]:
        raw_list = self.kv.list_network_crs()
        return [_cr_from_raw(r) for r in raw_list]

    def get_network(self, name: str) -> NetworkCR | None:
        raw = self.kv.get_network_cr(name)
        if raw is None:
            return None
        return _cr_from_raw(raw)

    def preview_network(self, request: NetworkCRCreate) -> list[dict]:
        return [_build_cr_body(request)]

    def create_network(self, request: NetworkCRCreate) -> NetworkCR:
        body = _build_cr_body(request)
        raw = self.kv.create_network_cr(body)
        return _cr_from_raw(raw)

    def update_network(self, name: str, request: NetworkCRUpdate) -> NetworkCR:
        existing = self.kv.get_network_cr(name)
        if existing is None:
            raise ValueError(f"Network '{name}' not found")
        spec = existing.get("spec", {})
        if request.display_name is not None:
            spec["displayName"] = request.display_name
        if request.description is not None:
            spec["description"] = request.description
        if request.bridge_name is not None:
            spec["bridgeName"] = request.bridge_name
        if request.vlan_id is not None:
            spec["vlanId"] = request.vlan_id
        if request.dhcp_enabled is not None:
            spec["dhcpEnabled"] = request.dhcp_enabled
        if request.subnet is not None:
            spec["subnet"] = request.subnet
        if request.gateway is not None:
            spec["gateway"] = request.gateway
        if request.mac_spoof_check is not None:
            spec["macSpoofCheck"] = request.mac_spoof_check
        if request.cni_config is not None:
            spec["cniConfig"] = request.cni_config
        patch_body = {"spec": spec}
        raw = self.kv.patch_network_cr(name, patch_body)
        return _cr_from_raw(raw)

    def delete_network(self, name: str) -> None:
        # Delete all NADs sourced from this Network CR
        label_selector = f"{LABEL_NETWORK_SOURCE}={name}"
        nads = self.kv.list_all_nads_by_label(label_selector)
        for nad in nads:
            ns = nad.get("metadata", {}).get("namespace", "")
            nad_name = nad.get("metadata", {}).get("name", "")
            if ns and nad_name:
                try:
                    self.kv.delete_nad(ns, nad_name)
                except ApiException:
                    logger.warning("Failed to delete NAD %s/%s", ns, nad_name)
        # Delete the Network CR
        self.kv.delete_network_cr(name)

    def ensure_nad(self, namespace: str, network_name: str) -> str | None:
        """Ensure a NAD exists in the target namespace for the given Network CR.

        Returns the NAD name if created/exists, or None for pod networks.
        """
        network = self.kv.get_network_cr(network_name)
        if network is None:
            raise ValueError(f"Network CR '{network_name}' not found")

        spec = network.get("spec", {})
        if spec.get("networkType") == "pod":
            return None  # Pod networks don't need NADs

        # Check if NAD already exists
        label_selector = f"{LABEL_NETWORK_SOURCE}={network_name}"
        existing = self.kv.list_nads_by_label(namespace, label_selector)
        if existing:
            return existing[0].get("metadata", {}).get("name", network_name)

        # Create NAD from CR
        cni_config = spec.get("cniConfig", "{}")
        nad_body = {
            "apiVersion": "k8s.cni.cncf.io/v1",
            "kind": "NetworkAttachmentDefinition",
            "metadata": {
                "name": network_name,
                "namespace": namespace,
                "labels": {
                    LABEL_MANAGED_BY: "kubevmui",
                    LABEL_NETWORK_SOURCE: network_name,
                },
                "annotations": {
                    ANNOTATION_DISPLAY_NAME: spec.get("displayName", network_name),
                },
            },
            "spec": {"config": cni_config},
        }
        self.kv.create_nad(namespace, nad_body)
        return network_name

    def seed_pod_network(self) -> bool:
        """Create the default pod-network CR if it doesn't exist. Returns True if seeded."""
        existing = self.kv.get_network_cr("pod-network")
        if existing is not None:
            return False
        body = {
            "apiVersion": "networks.kubevmui.io/v1",
            "kind": "Network",
            "metadata": {"name": "pod-network"},
            "spec": {
                "displayName": "Pod Network (default)",
                "description": "Default Kubernetes pod network with masquerade NAT",
                "networkType": "pod",
                "interfaceType": "masquerade",
            },
        }
        self.kv.create_network_cr(body)
        return True
```

- [ ] **Step 2: Verify service imports correctly**

Run: `cd backend && uv run python -c "from app.services.network_cr_service import NetworkCRService; print('OK')"`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add backend/app/services/network_cr_service.py
git commit -m "feat: add Network CR service with CRUD and on-demand NAD creation"
```

---

## Task 5: Backend API Routes for Network CRs

**Files:**
- Create: `backend/app/api/routes/network_crs.py`
- Modify: `backend/app/main.py`

- [ ] **Step 1: Create the Network CR routes**

Create `backend/app/api/routes/network_crs.py`:

```python
from fastapi import APIRouter, Depends, HTTPException

from app.api.deps import get_cluster_manager, get_current_user
from app.core.cluster_manager import ClusterManager
from app.core.k8s_client import KubeVirtClient
from app.models.auth import UserInfo
from app.models.network_cr import NetworkCR, NetworkCRCreate, NetworkCRList, NetworkCRUpdate
from app.services.network_cr_service import NetworkCRService

router = APIRouter(
    prefix="/api/v1/clusters/{cluster}",
    tags=["network-crs"],
)


def _get_service(cluster: str, cm: ClusterManager) -> NetworkCRService:
    api_client = cm.get_api_client(cluster)
    if api_client is None:
        raise HTTPException(status_code=404, detail=f"Cluster '{cluster}' not found")
    return NetworkCRService(KubeVirtClient(api_client))


@router.get("/network-crs", response_model=NetworkCRList)
def list_network_crs(
    cluster: str,
    _user: UserInfo = Depends(get_current_user),
    cm: ClusterManager = Depends(get_cluster_manager),
):
    svc = _get_service(cluster, cm)
    items = svc.list_networks()
    return NetworkCRList(items=items, total=len(items))


@router.get("/network-crs/{name}", response_model=NetworkCR)
def get_network_cr(
    cluster: str,
    name: str,
    _user: UserInfo = Depends(get_current_user),
    cm: ClusterManager = Depends(get_cluster_manager),
):
    svc = _get_service(cluster, cm)
    cr = svc.get_network(name)
    if cr is None:
        raise HTTPException(status_code=404, detail=f"Network '{name}' not found")
    return cr


@router.post("/network-crs/preview")
def preview_network_cr(
    cluster: str,
    body: NetworkCRCreate,
    _user: UserInfo = Depends(get_current_user),
    cm: ClusterManager = Depends(get_cluster_manager),
):
    svc = _get_service(cluster, cm)
    return svc.preview_network(body)


@router.post("/network-crs", response_model=NetworkCR, status_code=201)
def create_network_cr(
    cluster: str,
    body: NetworkCRCreate,
    _user: UserInfo = Depends(get_current_user),
    cm: ClusterManager = Depends(get_cluster_manager),
):
    svc = _get_service(cluster, cm)
    return svc.create_network(body)


@router.put("/network-crs/{name}", response_model=NetworkCR)
def update_network_cr(
    cluster: str,
    name: str,
    body: NetworkCRUpdate,
    _user: UserInfo = Depends(get_current_user),
    cm: ClusterManager = Depends(get_cluster_manager),
):
    svc = _get_service(cluster, cm)
    try:
        return svc.update_network(name, body)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.delete("/network-crs/{name}", status_code=204)
def delete_network_cr(
    cluster: str,
    name: str,
    _user: UserInfo = Depends(get_current_user),
    cm: ClusterManager = Depends(get_cluster_manager),
):
    svc = _get_service(cluster, cm)
    svc.delete_network(name)
```

- [ ] **Step 2: Register the router and add pod-network seed in main.py**

In `backend/app/main.py`, add the import:

```python
from app.api.routes import (
    ...
    network_crs,
    ...
)
```

Add the router registration after the existing networks line:

```python
    application.include_router(network_crs.router)
```

Add the pod-network seed in the `lifespan` function, after the catalog seed block:

```python
    # Seed default pod-network CR
    try:
        from app.services.network_cr_service import NetworkCRService
        if api_client:
            net_svc = NetworkCRService(KubeVirtClient(api_client))
            if net_svc.seed_pod_network():
                logging.getLogger(__name__).info("Seeded default pod-network CR")
    except Exception:
        logging.getLogger(__name__).warning("Failed to seed pod-network CR", exc_info=True)
```

- [ ] **Step 3: Verify the app starts without errors**

Run: `cd backend && uv run python -c "from app.main import app; print('Routes:', len(app.routes))"`
Expected: Shows route count without import errors

- [ ] **Step 4: Commit**

```bash
git add backend/app/api/routes/network_crs.py backend/app/main.py
git commit -m "feat: add Network CR REST endpoints and pod-network seed"
```

---

## Task 6: Update VM Service for Network CR Integration

**Files:**
- Modify: `backend/app/services/vm_service.py`

- [ ] **Step 1: Update _build_manifest to accept a NetworkCRService and use Network CRs**

The `_build_manifest` function needs to:
1. Accept a `NetworkCRService` parameter
2. For each network ref, look up the Network CR to determine type
3. For multus networks, call `ensure_nad` to create the NAD on-demand
4. Build the correct VM manifest entries

Replace the network section of `_build_manifest` (lines 326-343) with:

```python
    interfaces = []
    networks = []
    for net_ref in request.networks:
        iface: dict = {"name": net_ref.name}
        if net_ref.mac_address:
            iface["macAddress"] = net_ref.mac_address

        if net_cr_svc:
            cr = net_cr_svc.kv.get_network_cr(net_ref.network_cr)
            if cr:
                spec = cr.get("spec", {})
                if spec.get("networkType") == "pod":
                    iface["masquerade"] = {}
                    networks.append({"name": net_ref.name, "pod": {}})
                else:
                    iface["bridge"] = {}
                    nad_name = net_cr_svc.ensure_nad(request.namespace, net_ref.network_cr)
                    networks.append(
                        {"name": net_ref.name, "multus": {"networkName": nad_name or net_ref.network_cr}}
                    )
            else:
                # Fallback: treat as pod network if CR not found
                iface["masquerade"] = {}
                networks.append({"name": net_ref.name, "pod": {}})
        else:
            # No service available — fallback to simple pod
            iface["masquerade"] = {}
            networks.append({"name": net_ref.name, "pod": {}})

        interfaces.append(iface)
```

Update the function signature to accept `net_cr_svc`:

```python
def _build_manifest(
    request: VMCreate,
    kv: KubeVirtClient | None = None,
    net_cr_svc: "NetworkCRService | None" = None,
) -> dict:
```

Add the import at the top of the file (use TYPE_CHECKING to avoid circular imports):

```python
from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from app.services.network_cr_service import NetworkCRService
```

- [ ] **Step 2: Update the create_vm method to pass NetworkCRService**

In the `VMService` class, update `create_vm`:

```python
    def create_vm(self, request: VMCreate, net_cr_svc: NetworkCRService | None = None) -> VM:
        manifest = _build_manifest(request, self.kv, net_cr_svc=net_cr_svc)
        raw = self.kv.create_vm(request.namespace, manifest)
        return _vm_from_raw(raw, None)
```

- [ ] **Step 3: Remove the autoattach_pod_interface logic**

In `_build_manifest`, remove the block at lines 370-371:

```python
    if not request.autoattach_pod_interface:
        domain["devices"]["autoattachPodInterface"] = False
```

This is no longer needed — pod network is handled via the Network CR like any other network.

- [ ] **Step 4: Update add_interface_to_spec to use Network CR**

Replace the `add_interface_to_spec` method:

```python
    def add_interface_to_spec(
        self,
        namespace: str,
        vm_name: str,
        iface_name: str,
        network_cr_name: str,
        net_cr_svc: "NetworkCRService | None" = None,
        model: str | None = None,
        mac_address: str | None = None,
    ) -> None:
        """Add a network interface to a stopped VM's spec via JSON merge patch."""
        vm_raw = self.kv.get_vm(namespace, vm_name)
        if not vm_raw:
            return
        spec = vm_raw.get("spec", {}).get("template", {}).get("spec", {})
        interfaces = spec.get("domain", {}).get("devices", {}).get("interfaces", [])
        networks_list = spec.get("networks", [])

        iface_entry: dict = {"name": iface_name}
        if mac_address:
            iface_entry["macAddress"] = mac_address

        # Look up the Network CR to determine type
        network_type = "pod"
        if net_cr_svc:
            cr = net_cr_svc.kv.get_network_cr(network_cr_name)
            if cr:
                network_type = cr.get("spec", {}).get("networkType", "pod")

        if network_type == "pod":
            iface_entry["masquerade"] = {}
            networks_list.append({"name": iface_name, "pod": {}})
        else:
            iface_entry["bridge"] = {}
            nad_name = network_cr_name
            if net_cr_svc:
                nad_name = net_cr_svc.ensure_nad(namespace, network_cr_name) or network_cr_name
            networks_list.append({"name": iface_name, "multus": {"networkName": nad_name}})

        if model:
            iface_entry["model"] = model
        interfaces.append(iface_entry)

        body = {
            "spec": {
                "template": {
                    "spec": {
                        "domain": {"devices": {"interfaces": interfaces}},
                        "networks": networks_list,
                    }
                }
            }
        }
        self.kv.patch_vm(namespace, vm_name, body)
```

- [ ] **Step 5: Verify the module compiles**

Run: `cd backend && uv run python -c "from app.services.vm_service import VMService; print('OK')"`
Expected: `OK`

- [ ] **Step 6: Commit**

```bash
git add backend/app/services/vm_service.py
git commit -m "feat: integrate Network CR lookup and on-demand NAD in VM service"
```

---

## Task 7: Update VM API Routes

**Files:**
- Modify: `backend/app/api/routes/vms.py`

- [ ] **Step 1: Update the create_vm route to pass NetworkCRService**

Find the `create_vm` route and update it to create a `NetworkCRService` and pass it:

```python
from app.services.network_cr_service import NetworkCRService

# In the create_vm route handler:
    net_cr_svc = NetworkCRService(kv)
    return svc.create_vm(body, net_cr_svc=net_cr_svc)
```

- [ ] **Step 2: Update add_interface_to_spec route**

Find the `add_interface_to_spec` route (line ~208) and update it to use `network_cr` field:

```python
    net_cr_svc = NetworkCRService(kv)
    svc.add_interface_to_spec(
        ns, name,
        iface_name=body.name,
        network_cr_name=body.network_cr,
        net_cr_svc=net_cr_svc,
        model=body.model,
        mac_address=body.mac_address,
    )
```

- [ ] **Step 3: Update add_interface route (hotplug for running VMs)**

For the hotplug `add_interface` route, the NAD must exist first. Update to ensure NAD before calling hotplug:

```python
    net_cr_svc = NetworkCRService(kv)
    # Ensure NAD exists in the namespace before hotplugging
    nad_name = net_cr_svc.ensure_nad(ns, body.network_attachment_definition)
    if nad_name:
        svc.add_interface(ns, name, body.name, nad_name)
```

Note: The `AddInterfaceRequest` model already has `network_attachment_definition` — update this field name to `network_cr` as well:

In `backend/app/models/vm.py`:
```python
class AddInterfaceRequest(BaseModel):
    name: str
    network_cr: str  # Name of the Network CR
```

- [ ] **Step 4: Verify the app compiles**

Run: `cd backend && uv run python -c "from app.api.routes.vms import router; print('OK')"`
Expected: `OK`

- [ ] **Step 5: Commit**

```bash
git add backend/app/api/routes/vms.py backend/app/models/vm.py
git commit -m "feat: update VM routes to use Network CR for interface operations"
```

---

## Task 8: Frontend Network CR Hooks

**Files:**
- Create: `frontend/src/hooks/useNetworkCRs.ts`

- [ ] **Step 1: Create the Network CR hooks**

Create `frontend/src/hooks/useNetworkCRs.ts`:

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import apiClient from '@/lib/api-client'
import { useUIStore } from '@/stores/ui-store'

export interface NetworkCR {
  name: string
  display_name: string
  description: string
  network_type: 'pod' | 'multus'
  interface_type: 'masquerade' | 'bridge'
  bridge_name: string
  vlan_id: number | null
  dhcp_enabled: boolean
  subnet: string | null
  gateway: string | null
  mac_spoof_check: boolean
  cni_config: string | null
  created_at: string | null
  raw_manifest: Record<string, unknown> | null
}

export interface NetworkCRCreate {
  name: string
  display_name: string
  description?: string
  network_type?: string
  bridge_name?: string
  vlan_id?: number | null
  dhcp_enabled?: boolean
  subnet?: string | null
  gateway?: string | null
  mac_spoof_check?: boolean
  cni_config?: string | null
}

export interface NetworkCRUpdate {
  display_name?: string
  description?: string
  bridge_name?: string
  vlan_id?: number | null
  dhcp_enabled?: boolean
  subnet?: string | null
  gateway?: string | null
  mac_spoof_check?: boolean
  cni_config?: string | null
}

export function useNetworkCRs() {
  const { activeCluster } = useUIStore()
  return useQuery({
    queryKey: ['network-crs', activeCluster],
    queryFn: async () => {
      const { data } = await apiClient.get(
        `/clusters/${activeCluster}/network-crs`
      )
      return data as { items: NetworkCR[]; total: number }
    },
  })
}

export function useNetworkCR(name: string) {
  const { activeCluster } = useUIStore()
  return useQuery({
    queryKey: ['network-cr', activeCluster, name],
    queryFn: async () => {
      const { data } = await apiClient.get(
        `/clusters/${activeCluster}/network-crs/${name}`
      )
      return data as NetworkCR
    },
    enabled: !!name,
  })
}

export function useCreateNetworkCR() {
  const queryClient = useQueryClient()
  const { activeCluster } = useUIStore()
  return useMutation({
    mutationFn: async (body: NetworkCRCreate) => {
      const { data } = await apiClient.post(
        `/clusters/${activeCluster}/network-crs`,
        body,
      )
      return data as NetworkCR
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['network-crs'] })
    },
  })
}

export function usePreviewNetworkCR() {
  const { activeCluster } = useUIStore()
  return useMutation({
    mutationFn: async (body: NetworkCRCreate) => {
      const { data } = await apiClient.post(
        `/clusters/${activeCluster}/network-crs/preview`,
        body,
      )
      return data
    },
  })
}

export function useUpdateNetworkCR() {
  const queryClient = useQueryClient()
  const { activeCluster } = useUIStore()
  return useMutation({
    mutationFn: async ({ name, body }: { name: string; body: NetworkCRUpdate }) => {
      const { data } = await apiClient.put(
        `/clusters/${activeCluster}/network-crs/${name}`,
        body,
      )
      return data as NetworkCR
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['network-crs'] })
    },
  })
}

export function useDeleteNetworkCR() {
  const queryClient = useQueryClient()
  const { activeCluster } = useUIStore()
  return useMutation({
    mutationFn: async (name: string) => {
      await apiClient.delete(
        `/clusters/${activeCluster}/network-crs/${name}`,
      )
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['network-crs'] })
    },
  })
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd frontend && npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors related to useNetworkCRs.ts

- [ ] **Step 3: Commit**

```bash
git add frontend/src/hooks/useNetworkCRs.ts
git commit -m "feat: add React Query hooks for Network CRs"
```

---

## Task 9: Update VM Creation Wizard Networking Step

**Files:**
- Modify: `frontend/src/components/vm/VMCreateWizard.tsx`

- [ ] **Step 1: Update the NIC interface and imports**

Replace the NIC interface (line ~41):

```typescript
interface NIC {
  name: string
  network_cr: string // Name of the Network CR
}
```

Add import:

```typescript
import { useNetworkCRs, type NetworkCR } from '@/hooks/useNetworkCRs'
```

Remove the `useAllNetworks` import if present.

- [ ] **Step 2: Update form state initialization**

In the FormData interface, replace `autoattach_pod_interface` and update nics default:

Remove `autoattach_pod_interface: boolean` from FormData.

Update the initial nics to default to pod-network:

```typescript
nics: [{ name: 'default', network_cr: 'pod-network' }],
```

Remove `autoattach_pod_interface: true` from the initial form state.

- [ ] **Step 3: Add Network CR query**

Near the other hooks, add:

```typescript
const { data: networkCRsData } = useNetworkCRs()
const networkCRs: NetworkCR[] = networkCRsData?.items || []
```

Remove the `allNetworksData` / `availableNADs` logic.

- [ ] **Step 4: Update NIC helper functions**

```typescript
const addNIC = () =>
  updateForm({
    nics: [...form.nics, { name: `nic${form.nics.length}`, network_cr: '' }],
  })

const removeNIC = (i: number) =>
  updateForm({ nics: form.nics.filter((_, idx) => idx !== i) })

const updateNIC = (i: number, patch: Partial<NIC>) =>
  updateForm({ nics: form.nics.map((n, idx) => (idx === i ? { ...n, ...patch } : n)) })
```

- [ ] **Step 5: Replace the Networking step UI (Step 5)**

Replace the entire networking step content with:

```tsx
{/* Step 5: Networking */}
{step === 5 && (
  <div>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
      <div>
        <h3 className="text-sm font-semibold text-heading">Network Interfaces</h3>
        <p className="text-xs text-secondary mt-0.5">Select networks for your VM</p>
      </div>
      <button
        onClick={addNIC}
        className="text-xs font-medium px-3 py-1.5 rounded-md"
        style={{ background: theme.accent, color: theme.button.primaryText }}
      >
        + Add Network
      </button>
    </div>

    {form.nics.length === 0 && (
      <div className="text-center py-8 text-secondary text-sm">
        No network interfaces configured. Click "Add Network" to connect your VM.
      </div>
    )}

    {form.nics.map((nic, i) => {
      const selectedCR = networkCRs.find(n => n.name === nic.network_cr)
      const isPodNetwork = selectedCR?.network_type === 'pod'
      const podAlreadySelected = form.nics.some(
        (n, idx) => idx !== i && networkCRs.find(cr => cr.name === n.network_cr)?.network_type === 'pod'
      )

      return (
        <div
          key={i}
          style={{
            border: `1px solid ${theme.main.cardBorder}`,
            borderRadius: theme.radius.lg,
            padding: 16,
            marginBottom: 12,
            background: theme.main.card,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: theme.text.heading }}>
              NIC {i + 1}
              {selectedCR && (
                <span
                  style={{
                    marginLeft: 8,
                    fontSize: 11,
                    padding: '2px 6px',
                    borderRadius: 4,
                    background: isPodNetwork ? '#dbeafe' : '#dcfce7',
                    color: isPodNetwork ? '#1e40af' : '#166534',
                  }}
                >
                  {selectedCR.interface_type}
                </span>
              )}
            </span>
            <button
              onClick={() => removeNIC(i)}
              style={{ fontSize: 12, color: theme.text.secondary, cursor: 'pointer', background: 'none', border: 'none' }}
            >
              Remove
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label className="block text-xs uppercase tracking-wide text-secondary mb-1 font-medium">
                Network
              </label>
              <select
                value={nic.network_cr}
                onChange={(e) => updateNIC(i, { network_cr: e.target.value })}
                style={{
                  width: '100%',
                  background: theme.main.inputBg,
                  border: `1px solid ${theme.main.inputBorder}`,
                  borderRadius: theme.radius.md,
                  color: theme.text.primary,
                  fontSize: 13,
                  padding: '8px 12px',
                  fontFamily: 'inherit',
                }}
              >
                <option value="">Select a network...</option>
                {networkCRs.map((cr) => {
                  const disabled = cr.network_type === 'pod' && podAlreadySelected
                  return (
                    <option key={cr.name} value={cr.name} disabled={disabled}>
                      {cr.display_name}{disabled ? ' (already selected)' : ''}
                    </option>
                  )
                })}
              </select>
            </div>
            <div>
              <label className="block text-xs uppercase tracking-wide text-secondary mb-1 font-medium">
                Interface Name
              </label>
              <input
                type="text"
                value={nic.name}
                onChange={(e) => updateNIC(i, { name: e.target.value })}
                style={{
                  width: '100%',
                  background: theme.main.inputBg,
                  border: `1px solid ${theme.main.inputBorder}`,
                  borderRadius: theme.radius.md,
                  color: theme.text.primary,
                  fontSize: 13,
                  padding: '8px 12px',
                  fontFamily: 'inherit',
                }}
              />
            </div>
          </div>

          {selectedCR && (
            <div style={{ marginTop: 8, fontSize: 12, color: theme.text.secondary }}>
              {selectedCR.description}
              {selectedCR.bridge_name && ` · Bridge: ${selectedCR.bridge_name}`}
              {selectedCR.vlan_id && ` · VLAN: ${selectedCR.vlan_id}`}
            </div>
          )}
        </div>
      )
    })}
  </div>
)}
```

- [ ] **Step 6: Update the payload submission**

Find the payload construction (line ~336) and update:

```typescript
networks: form.nics.map((n) => ({
  name: n.name,
  network_cr: n.network_cr,
})),
```

Remove the `autoattach_pod_interface` field from the payload.

- [ ] **Step 7: Verify TypeScript compiles**

Run: `cd frontend && npx tsc --noEmit --pretty 2>&1 | head -30`
Expected: No errors in VMCreateWizard.tsx

- [ ] **Step 8: Commit**

```bash
git add frontend/src/components/vm/VMCreateWizard.tsx
git commit -m "feat: replace pod/multus radio with unified network selector in VM wizard"
```

---

## Task 10: Update AddNetworkWizard (Hotplug)

**Files:**
- Modify: `frontend/src/components/vm/AddNetworkWizard.tsx`

- [ ] **Step 1: Replace imports and types**

Replace:
```typescript
import { useNetworks } from '@/hooks/useNetworks'
```
With:
```typescript
import { useNetworkCRs, type NetworkCR } from '@/hooks/useNetworkCRs'
```

Replace the `NicConfig` interface:

```typescript
interface NicConfig {
  name: string
  networkCR: string // Name of the Network CR
  model: string
  macAddress: string
}
```

Remove the `IfaceType` type.

- [ ] **Step 2: Update state and data fetching**

Replace:
```typescript
const { data: networksData } = useNetworks()
```
With:
```typescript
const { data: networkCRsData } = useNetworkCRs()
const networkCRs: NetworkCR[] = networkCRsData?.items || []
```

Update initial config:
```typescript
const [config, setConfig] = useState<NicConfig>({
  name: `net${existingNicCount + 1}`,
  networkCR: '',
  model: 'virtio',
  macAddress: '',
})
```

Remove the `nads` variable.

- [ ] **Step 3: Update validation functions**

```typescript
function canProceedStep1() {
  if (!config.networkCR) return false
  const cr = networkCRs.find(n => n.name === config.networkCR)
  // Running VMs can only hotplug bridge interfaces
  if (isRunning && cr?.network_type === 'pod') return false
  return true
}

function canProceedStep2() {
  if (!config.name.trim()) return false
  return true
}
```

- [ ] **Step 4: Update handleSubmit**

```typescript
function handleSubmit() {
  const cr = networkCRs.find(n => n.name === config.networkCR)
  if (!cr) return

  if (isRunning) {
    // Hotplug: uses the network CR name, backend handles NAD creation
    addInterface.mutate(
      {
        namespace,
        vmName,
        name: config.name.trim(),
        nadName: config.networkCR,  // Backend resolves this to a NAD
      },
      {
        onSuccess: () => {
          toast.success('Interface hotplugged successfully')
          resetAndClose()
        },
        onError: () => {
          toast.error('Failed to hotplug interface')
        },
      }
    )
  } else {
    addInterfaceToSpec.mutate(
      {
        namespace,
        vmName,
        iface: {
          name: config.name.trim(),
          network_cr: config.networkCR,
          model: config.model || undefined,
          mac_address: config.macAddress.trim() || undefined,
        },
      },
      {
        onSuccess: () => {
          toast.success('Interface added to VM spec')
          resetAndClose()
        },
        onError: () => {
          toast.error('Failed to add interface')
        },
      }
    )
  }
}
```

- [ ] **Step 5: Replace Step 1 UI (Type selection → Network selection)**

Replace the step 1 content with a unified network selector:

```tsx
{step === 1 && (
  <div>
    {isRunning && (
      <div
        style={{
          padding: '10px 14px',
          borderRadius: theme.radius.md,
          background: '#fffbeb',
          border: '1px solid #fde68a',
          color: '#92400e',
          fontSize: 13,
          marginBottom: 16,
        }}
      >
        <strong>VM is running.</strong> Only bridge interfaces can be hotplugged. Pod network requires stopping the VM.
      </div>
    )}

    <div style={{ fontSize: 13, color: theme.text.secondary, marginBottom: 16 }}>
      Select a network to attach:
    </div>

    {networkCRs.map((cr) => {
      const disabled = isRunning && cr.network_type === 'pod'
      return (
        <RadioCard
          key={cr.name}
          selected={config.networkCR === cr.name}
          disabled={disabled}
          onClick={() => setConfig({ ...config, networkCR: cr.name })}
          icon={cr.network_type === 'pod' ? '🌐' : '🔗'}
          title={cr.display_name}
          description={
            cr.description +
            (cr.bridge_name ? ` · Bridge: ${cr.bridge_name}` : '') +
            (cr.vlan_id ? ` · VLAN: ${cr.vlan_id}` : '') +
            (disabled ? ' (requires VM restart)' : '')
          }
        />
      )
    })}
  </div>
)}
```

- [ ] **Step 6: Update Step 2 — remove NAD selector, keep NIC config only**

In step 2, remove the conditional NAD selector block. Keep only: interface name, NIC model, MAC address.

- [ ] **Step 7: Update Step 3 (Review) to show Network CR info**

Replace the review items:

```typescript
const cr = networkCRs.find(n => n.name === config.networkCR)
// ...
{ label: 'Network', value: cr?.display_name || config.networkCR },
{ label: 'Type', value: cr?.interface_type || 'unknown' },
```

- [ ] **Step 8: Update resetAndClose**

```typescript
function resetAndClose() {
  setStep(1)
  setConfig({
    name: `net${existingNicCount + 1}`,
    networkCR: '',
    model: 'virtio',
    macAddress: '',
  })
  onClose()
}
```

- [ ] **Step 9: Update useAddInterfaceToSpec parameter type in useHotplug.ts**

In `frontend/src/hooks/useHotplug.ts`, update the `useAddInterfaceToSpec` mutation to send `network_cr` instead of `type` and `nad_name`:

```typescript
export function useAddInterfaceToSpec() {
  const queryClient = useQueryClient()
  const { activeCluster } = useUIStore()
  return useMutation({
    mutationFn: async ({ namespace, vmName, iface }: {
      namespace: string
      vmName: string
      iface: { name: string; network_cr: string; model?: string; mac_address?: string }
    }) => {
      const { data } = await apiClient.post(
        `/clusters/${activeCluster}/namespaces/${namespace}/vms/${vmName}/nics`,
        iface
      )
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vm'] })
      queryClient.invalidateQueries({ queryKey: ['vms'] })
    },
  })
}
```

- [ ] **Step 10: Verify TypeScript compiles**

Run: `cd frontend && npx tsc --noEmit --pretty 2>&1 | head -30`
Expected: No errors in AddNetworkWizard.tsx or useHotplug.ts

- [ ] **Step 11: Commit**

```bash
git add frontend/src/components/vm/AddNetworkWizard.tsx frontend/src/hooks/useHotplug.ts
git commit -m "feat: replace pod/multus radio with unified network selector in hotplug wizard"
```

---

## Task 11: Update NetworksPage to Manage Network CRs

**Files:**
- Modify: `frontend/src/pages/NetworksPage.tsx`

- [ ] **Step 1: Update imports and data source**

Add:
```typescript
import { useNetworkCRs, useCreateNetworkCR, useDeleteNetworkCR, usePreviewNetworkCR, type NetworkCR, type NetworkCRCreate } from '@/hooks/useNetworkCRs'
```

Replace the old `useNetworks` / `useCreateNetwork` / `useDeleteNetwork` usage in the Network Profiles tab with the new Network CR hooks:

```typescript
const { data: networkCRsData, isLoading: networkCRsLoading } = useNetworkCRs()
const createNetworkCR = useCreateNetworkCR()
const deleteNetworkCR = useDeleteNetworkCR()
const previewNetworkCR = usePreviewNetworkCR()
const networkCRs: NetworkCR[] = networkCRsData?.items || []
```

- [ ] **Step 2: Update the network creation form state**

Replace the form state for network creation:

```typescript
const [newNet, setNewNet] = useState<NetworkCRCreate>({
  name: '',
  display_name: '',
  description: '',
  network_type: 'multus',
  bridge_name: '',
  vlan_id: null,
  dhcp_enabled: true,
  subnet: null,
  gateway: null,
  mac_spoof_check: false,
  cni_config: null,
})
```

- [ ] **Step 3: Update the creation form to remove namespace selector**

Since Network CRs are cluster-scoped, remove any namespace dropdown from the creation modal. The form fields stay the same: display name, name, type, bridge, VLAN, DHCP, subnet, gateway.

Add an "Advanced" toggle that shows a raw CNI config textarea:

```tsx
<div style={{ marginTop: 12 }}>
  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 12, color: theme.text.secondary }}>
    <input
      type="checkbox"
      checked={showAdvanced}
      onChange={(e) => setShowAdvanced(e.target.checked)}
    />
    Advanced: Edit CNI config directly
  </label>
  {showAdvanced && (
    <textarea
      value={newNet.cni_config || ''}
      onChange={(e) => setNewNet({ ...newNet, cni_config: e.target.value })}
      style={{
        width: '100%',
        height: 200,
        marginTop: 8,
        background: theme.main.inputBg,
        border: `1px solid ${theme.main.inputBorder}`,
        borderRadius: theme.radius.md,
        color: theme.text.primary,
        fontSize: 12,
        fontFamily: 'monospace',
        padding: 12,
        resize: 'vertical',
      }}
      placeholder='{"cniVersion": "0.3.1", "name": "...", "type": "bridge", ...}'
    />
  )}
</div>
```

- [ ] **Step 4: Update table to show Network CRs**

Update the table to display Network CR data. Columns: Name, Type, Interface, Bridge, VLAN, DHCP, Actions.

Remove the Namespace column (cluster-scoped).

- [ ] **Step 5: Update submit handler**

```typescript
const handleCreateNetwork = () => {
  createNetworkCR.mutate(newNet, {
    onSuccess: () => {
      toast.success('Network created')
      setShowCreateModal(false)
      resetForm()
    },
    onError: () => {
      toast.error('Failed to create network')
    },
  })
}
```

- [ ] **Step 6: Update delete handler**

```typescript
const handleDeleteNetwork = (name: string) => {
  deleteNetworkCR.mutate(name, {
    onSuccess: () => toast.success('Network deleted'),
    onError: () => toast.error('Failed to delete network'),
  })
}
```

- [ ] **Step 7: Update YAML preview to use Network CR preview endpoint**

```typescript
const handlePreview = () => {
  previewNetworkCR.mutate(newNet)
}
```

- [ ] **Step 8: Verify TypeScript compiles**

Run: `cd frontend && npx tsc --noEmit --pretty 2>&1 | head -30`
Expected: No errors in NetworksPage.tsx

- [ ] **Step 9: Commit**

```bash
git add frontend/src/pages/NetworksPage.tsx
git commit -m "feat: update Networks page to manage Network CRs instead of NADs"
```

---

## Task 12: Update TemplatesPage

**Files:**
- Modify: `frontend/src/pages/TemplatesPage.tsx`

- [ ] **Step 1: Update TemplateNIC interface**

Replace:
```typescript
interface TemplateNIC {
  name: string
  type: 'pod' | 'multus'
  network_profile: string
}
```
With:
```typescript
interface TemplateNIC {
  name: string
  network_cr: string
}
```

- [ ] **Step 2: Update emptyNIC helper**

```typescript
const emptyNIC = (): TemplateNIC => ({
  name: '',
  network_cr: '',
})
```

- [ ] **Step 3: Update template loading NIC mapping**

Replace:
```typescript
nics: (tpl.networks || []).map((n: any) => ({
  name: n.name || 'default',
  type: (n.network_profile === 'pod' ? 'pod' : 'multus') as 'pod' | 'multus',
  network_profile: n.network_profile || 'pod',
})),
```
With:
```typescript
nics: (tpl.networks || []).map((n: any) => ({
  name: n.name || 'default',
  network_cr: n.network_cr || n.network_profile || 'pod-network',
})),
```

- [ ] **Step 4: Add Network CR hooks and replace UI**

Add import:
```typescript
import { useNetworkCRs, type NetworkCR } from '@/hooks/useNetworkCRs'
```

Add hook usage:
```typescript
const { data: networkCRsData } = useNetworkCRs()
const networkCRs: NetworkCR[] = networkCRsData?.items || []
```

Replace the NIC configuration UI (lines ~815-901) with a unified network selector — same pattern as the VM wizard (dropdown of Network CRs instead of pod/multus radio + NAD selector).

- [ ] **Step 5: Update payload submission**

Replace:
```typescript
networks: form.nics.map((n) => ({
  name: n.name,
  network_profile: n.network_profile,
})),
```
With:
```typescript
networks: form.nics.map((n) => ({
  name: n.name,
  network_cr: n.network_cr,
})),
```

- [ ] **Step 6: Verify TypeScript compiles**

Run: `cd frontend && npx tsc --noEmit --pretty 2>&1 | head -30`
Expected: No errors in TemplatesPage.tsx

- [ ] **Step 7: Commit**

```bash
git add frontend/src/pages/TemplatesPage.tsx
git commit -m "feat: update Templates page to use Network CR references"
```

---

## Task 13: Full Build Verification

**Files:** None (verification only)

- [ ] **Step 1: Run backend lint**

Run: `cd backend && uv run ruff check app/`
Expected: No errors

- [ ] **Step 2: Run backend format check**

Run: `cd backend && uv run ruff format --check app/`
Expected: No formatting issues (run `uv run ruff format app/` to fix if needed)

- [ ] **Step 3: Run frontend TypeScript check**

Run: `cd frontend && npx tsc --noEmit`
Expected: No TypeScript errors

- [ ] **Step 4: Run frontend lint**

Run: `cd frontend && npm run lint`
Expected: No lint errors

- [ ] **Step 5: Run frontend build**

Run: `cd frontend && npm run build`
Expected: Build succeeds

- [ ] **Step 6: Fix any issues found, then commit**

```bash
git add -A
git commit -m "fix: resolve lint and build issues from network abstraction refactor"
```

---

## Task 14: Backend Tests

**Files:**
- Create: `backend/tests/test_network_cr_service.py`

- [ ] **Step 1: Write unit tests for the Network CR service**

Create `backend/tests/test_network_cr_service.py`:

```python
from unittest.mock import MagicMock, patch

import pytest

from app.models.network_cr import NetworkCRCreate, NetworkCRUpdate
from app.services.network_cr_service import (
    NetworkCRService,
    _build_cni_config,
    _build_cr_body,
    _cr_from_raw,
)


def _raw_pod_network():
    return {
        "metadata": {"name": "pod-network", "creationTimestamp": "2026-01-01T00:00:00Z"},
        "spec": {
            "displayName": "Pod Network (default)",
            "description": "Default pod network",
            "networkType": "pod",
            "interfaceType": "masquerade",
        },
    }


def _raw_bridge_network():
    return {
        "metadata": {"name": "prod-vlan100", "creationTimestamp": "2026-01-01T00:00:00Z"},
        "spec": {
            "displayName": "Production VLAN 100",
            "description": "Prod network",
            "networkType": "multus",
            "interfaceType": "bridge",
            "bridgeName": "br-prod",
            "vlanId": 100,
            "dhcpEnabled": True,
            "cniConfig": '{"cniVersion":"0.3.1","name":"prod-vlan100","type":"bridge","bridge":"br-prod","vlan":100,"ipam":{"type":"dhcp"}}',
        },
    }


class TestCrFromRaw:
    def test_pod_network(self):
        cr = _cr_from_raw(_raw_pod_network())
        assert cr.name == "pod-network"
        assert cr.network_type == "pod"
        assert cr.interface_type == "masquerade"
        assert cr.display_name == "Pod Network (default)"

    def test_bridge_network(self):
        cr = _cr_from_raw(_raw_bridge_network())
        assert cr.name == "prod-vlan100"
        assert cr.network_type == "multus"
        assert cr.interface_type == "bridge"
        assert cr.bridge_name == "br-prod"
        assert cr.vlan_id == 100
        assert cr.cni_config is not None


class TestBuildCniConfig:
    def test_bridge_with_vlan_and_dhcp(self):
        req = NetworkCRCreate(
            name="test", display_name="Test",
            bridge_name="br0", vlan_id=100, dhcp_enabled=True,
        )
        config = _build_cni_config(req)
        import json
        parsed = json.loads(config)
        assert parsed["type"] == "bridge"
        assert parsed["bridge"] == "br0"
        assert parsed["vlan"] == 100
        assert parsed["ipam"] == {"type": "dhcp"}

    def test_bridge_no_dhcp(self):
        req = NetworkCRCreate(
            name="test", display_name="Test",
            bridge_name="br0", dhcp_enabled=False,
        )
        config = _build_cni_config(req)
        import json
        parsed = json.loads(config)
        assert "ipam" not in parsed


class TestBuildCrBody:
    def test_pod_network(self):
        req = NetworkCRCreate(name="pod-network", display_name="Pod", network_type="pod")
        body = _build_cr_body(req)
        assert body["spec"]["networkType"] == "pod"
        assert body["spec"]["interfaceType"] == "masquerade"
        assert "cniConfig" not in body["spec"]

    def test_multus_auto_generates_cni(self):
        req = NetworkCRCreate(
            name="test-bridge", display_name="Test Bridge",
            network_type="multus", bridge_name="br0",
        )
        body = _build_cr_body(req)
        assert body["spec"]["networkType"] == "multus"
        assert body["spec"]["interfaceType"] == "bridge"
        assert "cniConfig" in body["spec"]

    def test_multus_preserves_custom_cni(self):
        custom = '{"custom": true}'
        req = NetworkCRCreate(
            name="custom", display_name="Custom",
            network_type="multus", cni_config=custom,
        )
        body = _build_cr_body(req)
        assert body["spec"]["cniConfig"] == custom


class TestNetworkCRService:
    def _make_svc(self):
        kv = MagicMock()
        return NetworkCRService(kv), kv

    def test_list_networks(self):
        svc, kv = self._make_svc()
        kv.list_network_crs.return_value = [_raw_pod_network(), _raw_bridge_network()]
        result = svc.list_networks()
        assert len(result) == 2
        assert result[0].name == "pod-network"
        assert result[1].name == "prod-vlan100"

    def test_get_network_found(self):
        svc, kv = self._make_svc()
        kv.get_network_cr.return_value = _raw_pod_network()
        result = svc.get_network("pod-network")
        assert result is not None
        assert result.name == "pod-network"

    def test_get_network_not_found(self):
        svc, kv = self._make_svc()
        kv.get_network_cr.return_value = None
        result = svc.get_network("nonexistent")
        assert result is None

    def test_ensure_nad_pod_returns_none(self):
        svc, kv = self._make_svc()
        kv.get_network_cr.return_value = _raw_pod_network()
        result = svc.ensure_nad("default", "pod-network")
        assert result is None
        kv.create_nad.assert_not_called()

    def test_ensure_nad_creates_when_missing(self):
        svc, kv = self._make_svc()
        kv.get_network_cr.return_value = _raw_bridge_network()
        kv.list_nads_by_label.return_value = []
        kv.create_nad.return_value = {"metadata": {"name": "prod-vlan100"}}
        result = svc.ensure_nad("my-ns", "prod-vlan100")
        assert result == "prod-vlan100"
        kv.create_nad.assert_called_once()
        call_args = kv.create_nad.call_args
        assert call_args[0][0] == "my-ns"
        body = call_args[0][1]
        assert body["metadata"]["labels"]["networks.kubevmui.io/source"] == "prod-vlan100"

    def test_ensure_nad_skips_when_exists(self):
        svc, kv = self._make_svc()
        kv.get_network_cr.return_value = _raw_bridge_network()
        kv.list_nads_by_label.return_value = [{"metadata": {"name": "prod-vlan100"}}]
        result = svc.ensure_nad("my-ns", "prod-vlan100")
        assert result == "prod-vlan100"
        kv.create_nad.assert_not_called()

    def test_seed_pod_network_creates_when_missing(self):
        svc, kv = self._make_svc()
        kv.get_network_cr.return_value = None
        kv.create_network_cr.return_value = _raw_pod_network()
        result = svc.seed_pod_network()
        assert result is True
        kv.create_network_cr.assert_called_once()

    def test_seed_pod_network_skips_when_exists(self):
        svc, kv = self._make_svc()
        kv.get_network_cr.return_value = _raw_pod_network()
        result = svc.seed_pod_network()
        assert result is False
        kv.create_network_cr.assert_not_called()

    def test_delete_cleans_up_nads(self):
        svc, kv = self._make_svc()
        kv.list_all_nads_by_label.return_value = [
            {"metadata": {"name": "prod-vlan100", "namespace": "ns1"}},
            {"metadata": {"name": "prod-vlan100", "namespace": "ns2"}},
        ]
        svc.delete_network("prod-vlan100")
        assert kv.delete_nad.call_count == 2
        kv.delete_network_cr.assert_called_once_with("prod-vlan100")
```

- [ ] **Step 2: Run the tests**

Run: `cd backend && uv run pytest tests/test_network_cr_service.py -v`
Expected: All tests pass

- [ ] **Step 3: Commit**

```bash
git add backend/tests/test_network_cr_service.py
git commit -m "test: add unit tests for Network CR service"
```

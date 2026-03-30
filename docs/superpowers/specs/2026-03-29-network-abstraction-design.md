# Network Abstraction Design

**Date:** 2026-03-29
**Status:** Approved

## Problem

The VM creation wizard exposes KubeVirt implementation details ("Pod Network" vs "Multus") as a binary radio choice. Users shouldn't need to understand these concepts — they just want to connect a VM to a network.

## Solution

Introduce a **cluster-scoped `Network` CRD** (`networks.kubevmui.io`) that provides a unified, high-level network abstraction. All network types — including pod network — are represented as Network CRs. NADs are created on-demand in the target namespace when a VM needs them.

## Key Decisions

- **No shared namespace approach** — CR + on-demand NAD is more Kubernetes-native and less intrusive
- **Pod network is a Network CR** — same abstraction as any other network, with `networkType: pod` and `interfaceType: masquerade`
- **NAD is not the abstraction** — the Network CR is the user-facing resource; NADs are implementation details
- **SR-IOV deferred** — focus on bridge + pod network; SR-IOV can follow the same pattern later
- **Per-VM settings stay on the VM** — model, MAC, ports are not part of the Network CR
- **Full CNI config stored in CR** — enables advanced editing and verbatim NAD creation

## CRD: `networks.kubevmui.io`

**Scope:** Cluster

**Group:** `networks.kubevmui.io`

**Version:** `v1`

**Kind:** `Network`

**Plural:** `networks`

**Short name:** `net`

### Spec Schema

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `displayName` | string | yes | — | Human-readable name |
| `description` | string | no | `""` | Optional description |
| `networkType` | enum | yes | — | `pod` or `multus` |
| `interfaceType` | enum | yes | — | `masquerade` or `bridge` (derived from networkType) |
| `bridgeName` | string | no | — | NNCP-created bridge name (bridge only) |
| `vlanId` | integer | no | — | Optional VLAN ID (bridge only) |
| `dhcpEnabled` | boolean | no | `true` | IPAM DHCP configuration |
| `subnet` | string | no | — | CIDR notation, informational |
| `gateway` | string | no | — | Gateway IP, informational |
| `macSpoofCheck` | boolean | no | `false` | Enable MAC spoof protection |
| `cniConfig` | string | no | — | Full CNI JSON config for NAD generation. Not present for pod networks. |

### Example: Pod Network

```yaml
apiVersion: networks.kubevmui.io/v1
kind: Network
metadata:
  name: pod-network
spec:
  displayName: "Pod Network (default)"
  description: "Default Kubernetes pod network with masquerade NAT"
  networkType: pod
  interfaceType: masquerade
```

### Example: Bridge Network

```yaml
apiVersion: networks.kubevmui.io/v1
kind: Network
metadata:
  name: prod-vlan100
spec:
  displayName: "Production VLAN 100"
  description: "Production network on VLAN 100"
  networkType: multus
  interfaceType: bridge
  bridgeName: br-prod
  vlanId: 100
  dhcpEnabled: true
  subnet: "10.0.100.0/24"
  gateway: "10.0.100.1"
  macSpoofCheck: false
  cniConfig: |
    {
      "cniVersion": "0.3.1",
      "name": "prod-vlan100",
      "type": "bridge",
      "bridge": "br-prod",
      "vlan": 100,
      "ipam": { "type": "dhcp" }
    }
```

### Printer Columns

| Name | JSON Path | Type |
|------|-----------|------|
| Display Name | `.spec.displayName` | string |
| Type | `.spec.networkType` | string |
| Interface | `.spec.interfaceType` | string |
| Bridge | `.spec.bridgeName` | string |
| VLAN | `.spec.vlanId` | integer |
| Age | `.metadata.creationTimestamp` | date |

## On-Demand NAD Creation

When a VM is created (or a network is hotplugged) in namespace X:

1. For each selected network, read the Network CR
2. If `networkType == pod` → add `pod: {}` + `masquerade: {}` to VM manifest, no NAD needed
3. If `networkType == multus`:
   a. Check if a NAD exists in namespace X with label `networks.kubevmui.io/source: <cr-name>`
   b. If missing → create NAD:

```yaml
apiVersion: k8s.cni.cncf.io/v1
kind: NetworkAttachmentDefinition
metadata:
  name: <cr-name>
  namespace: <vm-namespace>
  labels:
    app.kubernetes.io/managed-by: kubevmui
    networks.kubevmui.io/source: <cr-name>
  annotations:
    kubevmui.io/display-name: <from CR>
spec:
  config: <cniConfig from CR, verbatim>
```

4. VM manifest references local NAD: `multus: {networkName: "<cr-name>"}` + `bridge: {}`

### NAD Cleanup

When a Network CR is deleted, the backend deletes all NADs with label `networks.kubevmui.io/source: <cr-name>` across all namespaces.

### NAD Update Policy

When a Network CR's `cniConfig` is updated, existing NADs are **not** auto-updated (avoids disrupting running VMs). New NADs created after the update get the new config. A manual "re-sync" feature can be added later.

## Backend Changes

### New Endpoints (cluster-scoped)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/v1/clusters/{cluster}/networks` | List all Network CRs |
| `GET` | `/api/v1/clusters/{cluster}/networks/{name}` | Get single Network CR |
| `POST` | `/api/v1/clusters/{cluster}/networks` | Create Network CR |
| `PUT` | `/api/v1/clusters/{cluster}/networks/{name}` | Update Network CR |
| `DELETE` | `/api/v1/clusters/{cluster}/networks/{name}` | Delete CR + cleanup NADs |

### Network Service

- `list_networks()` — list all Network CRs via custom objects API (cluster-scoped)
- `get_network(name)` — get single CR
- `create_network(request)` — validate, build `cniConfig` from form fields (if not provided), create CR
- `update_network(name, request)` — update CR spec
- `delete_network(name)` — delete CR, then delete all NADs with matching source label
- `ensure_nad(namespace, network_name)` — check/create NAD in target namespace from CR

### K8s Client Methods

New methods using `list_cluster_custom_object`, `get_cluster_custom_object`, `create_cluster_custom_object`, `delete_cluster_custom_object` (cluster-scoped variants).

### VM Service Changes

- `create_vm()` — for each network in the request, call `ensure_nad()` then build manifest
- `add_interface()` (hotplug) — same `ensure_nad()` before calling KubeVirt hotplug API
- Remove all `network_profile` / `type: 'pod' | 'multus'` logic — replaced by Network CR lookup

### Models

**NetworkCR (response):**
```
name, display_name, description, network_type, interface_type,
bridge_name, vlan_id, dhcp_enabled, subnet, gateway,
mac_spoof_check, cni_config, created_at, raw_manifest
```

**NetworkCRCreate (request):**
```
name, display_name, description, network_type,
bridge_name, vlan_id, dhcp_enabled, subnet, gateway,
mac_spoof_check, cni_config (optional — auto-generated from fields if not provided)
```

### CRD Bootstrap

On backend startup, check if `pod-network` CR exists. If not, create it with `networkType: pod`, `interfaceType: masquerade`. One-time seed operation.

## Frontend Changes

### VM Creation Wizard (Step 5: Networking)

**Before:** Radio buttons "Pod Network" / "Multus", separate NAD dropdown for multus.

**After:** Single flat list of Network CRs. User clicks "Add Network" → picks from list → done.

- Each entry shows: display name, type badge (pod/bridge), description
- Pod network entry disabled after selection (only one allowed per VM)
- No "Attach default pod network interface" checkbox — pod network CR is pre-selected by default

**Per-NIC settings** (shown after selecting a network):
- Interface name (auto-generated, editable)
- Model (virtio default, dropdown: virtio, e1000e, rtl8139)
- MAC address (optional)
- Ports (only shown for masquerade networks)

### AddNetworkWizard (Hotplug)

Same unified treatment:
- Flat list of Network CRs
- Running VMs: masquerade networks disabled with tooltip "Requires VM restart"
- Stopped VMs: all networks available
- Same per-NIC settings

### Networks Admin Page

**Network Profiles tab** now manages Network CRs instead of per-namespace NADs:
- No namespace selector (cluster-scoped)
- Creation form: name, display name, type, bridge selector, VLAN, DHCP, subnet, gateway
- **Advanced mode:** raw CNI JSON editor for `cniConfig`
- Table columns: name, display name, type, bridge, VLAN, connected VMs

### New Hooks

- `useNetworkCRs()` — list all Network CRs
- `useNetworkCR(name)` — get single CR
- `useCreateNetworkCR()` — create mutation
- `useUpdateNetworkCR()` — update mutation
- `useDeleteNetworkCR()` — delete mutation

### Template Changes

Templates currently store `networks: [{name, networkProfile}]`. Update to store `networks: [{name, networkCR}]` where `networkCR` is the Network CR name.

## Hotplug Constraints

From KubeVirt documentation:
- **Hotplug add:** bridge and sriov bindings only (virtio model)
- **Hot-unplug:** bridge only
- **Max 32 PCI slots** per VM (4 reserved for hotplug)
- Masquerade (pod network) cannot be hotplugged — requires VM restart

## Deprecated / Removed

- Per-namespace NAD creation endpoints (old `/namespaces/{ns}/networks` POST) — deprecated
- `NIC.type` field (`'pod' | 'multus'`) in frontend — replaced by Network CR reference
- `VMNetworkRef.network_profile` field — replaced by `network_cr` (Network CR name)
- "Attach default pod network interface" checkbox
- Pod/Multus radio buttons in VM wizard and hotplug wizard

## Migration

Existing VMs with manually created NADs continue to work — they just won't show up in the unified network list. New VMs use the Network CR abstraction exclusively.

Existing NADs in the Networks page can be migrated by creating corresponding Network CRs and labeling the NADs with `networks.kubevmui.io/source`.

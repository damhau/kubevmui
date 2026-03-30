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
        "apiVersion": "kubevmui.io/v1",
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

    def list_nads_for_network(self, network_name: str) -> list[dict]:
        """List all NADs created from this Network CR across all namespaces."""
        label_selector = f"{LABEL_NETWORK_SOURCE}={network_name}"
        nads = self.kv.list_all_nads_by_label(label_selector)
        result = []
        for nad in nads:
            metadata = nad.get("metadata", {})
            result.append({
                "name": metadata.get("name", ""),
                "namespace": metadata.get("namespace", ""),
                "created_at": metadata.get("creationTimestamp"),
                "raw_manifest": nad,
            })
        return result

    def delete_nad(self, namespace: str, name: str) -> None:
        """Delete a single NAD in a namespace."""
        self.kv.delete_nad(namespace, name)

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
            "apiVersion": "kubevmui.io/v1",
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

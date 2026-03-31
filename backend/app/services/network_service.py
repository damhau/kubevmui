import json
from datetime import UTC, datetime

from kubernetes import client

from app.models.common import NetworkType
from app.models.network_profile import NetworkProfile, NetworkProfileCreate

NAD_GROUP = "k8s.cni.cncf.io"
NAD_VERSION = "v1"
NAD_PLURAL = "network-attachment-definitions"

ANNOTATION_DISPLAY_NAME = "kubevmui.io/display-name"
ANNOTATION_DESCRIPTION = "kubevmui.io/description"
ANNOTATION_DHCP = "kubevmui.io/dhcp"
ANNOTATION_SUBNET = "kubevmui.io/subnet"
ANNOTATION_GATEWAY = "kubevmui.io/gateway"


def _nad_to_profile(nad: dict) -> NetworkProfile:
    metadata = nad.get("metadata", {})
    annotations = metadata.get("annotations") or {}
    spec = nad.get("spec", {})

    config_str = spec.get("config", "{}")
    try:
        config = json.loads(config_str)
    except (json.JSONDecodeError, TypeError):
        config = {}

    network_type_str = config.get("type", "bridge")
    try:
        network_type = NetworkType(network_type_str)
    except ValueError:
        network_type = NetworkType.bridge

    created_at = None
    ts = metadata.get("creationTimestamp")
    if ts:
        try:
            created_at = datetime.fromisoformat(ts.replace("Z", "+00:00"))
        except ValueError:
            created_at = datetime.now(tz=UTC)

    dhcp_val = annotations.get(ANNOTATION_DHCP, "true")
    dhcp_enabled = dhcp_val.lower() not in ("false", "0", "no")

    return NetworkProfile(
        name=metadata.get("name", ""),
        namespace=metadata.get("namespace", ""),
        created_at=created_at,
        labels=metadata.get("labels") or {},
        annotations=annotations,
        display_name=annotations.get(ANNOTATION_DISPLAY_NAME, metadata.get("name", "")),
        description=annotations.get(ANNOTATION_DESCRIPTION, ""),
        network_type=network_type,
        vlan_id=config.get("vlan"),
        dhcp_enabled=dhcp_enabled,
        subnet=annotations.get(ANNOTATION_SUBNET),
        gateway=annotations.get(ANNOTATION_GATEWAY),
        raw_manifest=nad,
    )


class NetworkService:
    def __init__(self, api_client: client.ApiClient):
        self.custom_api = client.CustomObjectsApi(api_client)

    def get_profile(self, namespace: str, name: str) -> NetworkProfile | None:
        try:
            nad = self.custom_api.get_namespaced_custom_object(
                group=NAD_GROUP,
                version=NAD_VERSION,
                namespace=namespace,
                plural=NAD_PLURAL,
                name=name,
            )
        except client.ApiException as e:
            if e.status == 404:
                return None
            raise
        return _nad_to_profile(nad)

    def list_profiles(self, namespace: str) -> list[NetworkProfile]:
        result = self.custom_api.list_namespaced_custom_object(
            group=NAD_GROUP,
            version=NAD_VERSION,
            namespace=namespace,
            plural=NAD_PLURAL,
        )
        return [_nad_to_profile(nad) for nad in result.get("items", [])]

    def preview_profile(self, request: NetworkProfileCreate) -> list[dict]:
        cni_config: dict = {
            "cniVersion": "0.3.1",
            "name": request.name,
            "type": request.network_type.value,
        }
        if request.bridge_name:
            cni_config["bridge"] = request.bridge_name
        if request.vlan_id is not None:
            cni_config["vlan"] = request.vlan_id
        if request.dhcp_enabled:
            cni_config["ipam"] = {"type": "dhcp"}
        annotations = {
            ANNOTATION_DISPLAY_NAME: request.display_name,
            ANNOTATION_DESCRIPTION: request.description,
            ANNOTATION_DHCP: str(request.dhcp_enabled).lower(),
        }
        if request.subnet:
            annotations[ANNOTATION_SUBNET] = request.subnet
        if request.gateway:
            annotations[ANNOTATION_GATEWAY] = request.gateway
        body = {
            "apiVersion": f"{NAD_GROUP}/{NAD_VERSION}",
            "kind": "NetworkAttachmentDefinition",
            "metadata": {
                "name": request.name,
                "namespace": request.namespace,
                "annotations": annotations,
            },
            "spec": {"config": json.dumps(cni_config)},
        }
        return [body]

    def create_profile(self, request: NetworkProfileCreate) -> NetworkProfile:
        cni_config: dict = {
            "cniVersion": "0.3.1",
            "name": request.name,
            "type": request.network_type.value,
        }
        if request.bridge_name:
            cni_config["bridge"] = request.bridge_name
        if request.vlan_id is not None:
            cni_config["vlan"] = request.vlan_id
        if request.dhcp_enabled:
            cni_config["ipam"] = {"type": "dhcp"}

        annotations = {
            ANNOTATION_DISPLAY_NAME: request.display_name,
            ANNOTATION_DESCRIPTION: request.description,
            ANNOTATION_DHCP: str(request.dhcp_enabled).lower(),
        }
        if request.subnet:
            annotations[ANNOTATION_SUBNET] = request.subnet
        if request.gateway:
            annotations[ANNOTATION_GATEWAY] = request.gateway

        body = {
            "apiVersion": f"{NAD_GROUP}/{NAD_VERSION}",
            "kind": "NetworkAttachmentDefinition",
            "metadata": {
                "name": request.name,
                "namespace": request.namespace,
                "annotations": annotations,
            },
            "spec": {"config": json.dumps(cni_config)},
        }
        raw = self.custom_api.create_namespaced_custom_object(
            group=NAD_GROUP,
            version=NAD_VERSION,
            namespace=request.namespace,
            plural=NAD_PLURAL,
            body=body,
        )
        return _nad_to_profile(raw)

    def delete_profile(self, namespace: str, name: str) -> None:
        self.custom_api.delete_namespaced_custom_object(
            group=NAD_GROUP,
            version=NAD_VERSION,
            namespace=namespace,
            plural=NAD_PLURAL,
            name=name,
        )

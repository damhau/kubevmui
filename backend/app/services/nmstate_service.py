from kubernetes import client

from app.models.nmstate import NNCP, NNCPCreate, NNSInterface, NodeNetworkState

NMSTATE_GROUP = "nmstate.io"
NNCP_VERSION = "v1"
NNS_VERSION = "v1beta1"
NNCE_VERSION = "v1beta1"
NNCP_PLURAL = "nodenetworkconfigurationpolicies"
NNS_PLURAL = "nodenetworkstates"
NNCE_PLURAL = "nodenetworkconfigurationenactments"


class NMStateService:
    def __init__(self, api_client: client.ApiClient):
        self.custom_api = client.CustomObjectsApi(api_client)

    def list_nncps(self) -> list[NNCP]:
        """List all NNCPs with enactment status."""
        try:
            result = self.custom_api.list_cluster_custom_object(
                group=NMSTATE_GROUP,
                version=NNCP_VERSION,
                plural=NNCP_PLURAL,
            )
        except client.ApiException:
            return []

        # Fetch enactments for status
        enactment_map: dict[str, list[dict]] = {}
        try:
            enactments = self.custom_api.list_cluster_custom_object(
                group=NMSTATE_GROUP,
                version=NNCE_VERSION,
                plural=NNCE_PLURAL,
            )
            for nnce in enactments.get("items", []):
                labels = nnce.get("metadata", {}).get("labels", {})
                policy_name = labels.get("nmstate.io/policy", "")
                if not policy_name:
                    # Fallback: parse from name "nodename.policyname"
                    name = nnce.get("metadata", {}).get("name", "")
                    parts = name.split(".", 1)
                    policy_name = parts[1] if len(parts) > 1 else ""
                if policy_name:
                    conditions = nnce.get("status", {}).get("conditions", [])
                    node_name = nnce.get("metadata", {}).get("name", "").split(".")[0]
                    status = "Unknown"
                    for c in conditions:
                        if c.get("type") == "Available" and c.get("status") == "True":
                            status = "Available"
                            break
                        if c.get("type") == "Progressing" and c.get("status") == "True":
                            status = "Progressing"
                        if c.get("type") == "Degraded" and c.get("status") == "True":
                            status = "Degraded"
                            break
                    enactment_map.setdefault(policy_name, []).append(
                        {"node": node_name, "status": status}
                    )
        except client.ApiException:
            pass

        nncps = []
        for item in result.get("items", []):
            nncp = self._parse_nncp(item)
            nncp.enactments = enactment_map.get(nncp.name, [])
            # Derive overall status from enactments
            if nncp.enactments:
                statuses = [e["status"] for e in nncp.enactments]
                if all(s == "Available" for s in statuses):
                    nncp.status = "Available"
                elif any(s == "Degraded" for s in statuses):
                    nncp.status = "Degraded"
                elif any(s == "Progressing" for s in statuses):
                    nncp.status = "Progressing"
            nncps.append(nncp)
        return nncps

    def create_nncp(self, request: NNCPCreate) -> NNCP:
        """Create a NodeNetworkConfigurationPolicy."""
        iface: dict = {
            "name": request.interface_name,
            "type": request.interface_type.value,
            "state": request.state,
        }

        if request.interface_type == "linux-bridge":
            iface["ipv4"] = {"enabled": request.ipv4_enabled}
            if request.ipv4_enabled and request.ipv4_address:
                parts = request.ipv4_address.split("/")
                prefix = int(parts[1]) if len(parts) > 1 else 24
                iface["ipv4"]["address"] = [{"ip": parts[0], "prefix-length": prefix}]
                iface["ipv4"]["dhcp"] = False
            iface["bridge"] = {
                "options": {"stp": {"enabled": False}},
                "port": [],
            }
            if request.port:
                iface["bridge"]["port"].append({"name": request.port})

        elif request.interface_type == "vlan":
            iface["vlan"] = {
                "id": request.vlan_id,
                "base-iface": request.vlan_base_iface,
            }
            iface["ipv4"] = {"enabled": request.ipv4_enabled}
            if request.ipv4_enabled and request.ipv4_address:
                parts = request.ipv4_address.split("/")
                prefix = int(parts[1]) if len(parts) > 1 else 24
                iface["ipv4"]["address"] = [{"ip": parts[0], "prefix-length": prefix}]
                iface["ipv4"]["dhcp"] = False

        spec: dict = {"desiredState": {"interfaces": [iface]}}
        if request.node_selector:
            spec["nodeSelector"] = request.node_selector

        annotations = {}
        if request.description:
            annotations["kubevmui.io/description"] = request.description

        body = {
            "apiVersion": f"{NMSTATE_GROUP}/{NNCP_VERSION}",
            "kind": "NodeNetworkConfigurationPolicy",
            "metadata": {"name": request.name, "annotations": annotations},
            "spec": spec,
        }

        raw = self.custom_api.create_cluster_custom_object(
            group=NMSTATE_GROUP,
            version=NNCP_VERSION,
            plural=NNCP_PLURAL,
            body=body,
        )
        return self._parse_nncp(raw)

    def delete_nncp(self, name: str) -> None:
        """Delete a NNCP."""
        self.custom_api.delete_cluster_custom_object(
            group=NMSTATE_GROUP,
            version=NNCP_VERSION,
            plural=NNCP_PLURAL,
            name=name,
        )

    def get_node_network_state(self, node_name: str) -> NodeNetworkState | None:
        """Get NodeNetworkState for a specific node."""
        try:
            raw = self.custom_api.get_cluster_custom_object(
                group=NMSTATE_GROUP,
                version=NNS_VERSION,
                plural=NNS_PLURAL,
                name=node_name,
            )
        except client.ApiException as e:
            if e.status == 404:
                return None
            raise

        interfaces = []
        current_state = raw.get("status", {}).get("currentState", {})
        for iface in current_state.get("interfaces", []):
            ipv4_addrs = []
            for addr in iface.get("ipv4", {}).get("address", []):
                ip = addr.get("ip", "")
                prefix = addr.get("prefix-length", "")
                if ip:
                    ipv4_addrs.append(f"{ip}/{prefix}" if prefix else ip)
            interfaces.append(
                NNSInterface(
                    name=iface.get("name", ""),
                    type=iface.get("type", "unknown"),
                    state=iface.get("state", "unknown"),
                    mac_address=iface.get("mac-address", ""),
                    mtu=iface.get("mtu", 0),
                    ipv4_addresses=ipv4_addrs,
                )
            )
        return NodeNetworkState(node_name=node_name, interfaces=interfaces)

    def list_bridges(self) -> list[dict]:
        """Discover bridges from all NodeNetworkStates."""
        bridges: dict[str, list[str]] = {}
        try:
            result = self.custom_api.list_cluster_custom_object(
                group=NMSTATE_GROUP,
                version=NNS_VERSION,
                plural=NNS_PLURAL,
            )
            for nns in result.get("items", []):
                node_name = nns.get("metadata", {}).get("name", "")
                current_state = nns.get("status", {}).get("currentState", {})
                for iface in current_state.get("interfaces", []):
                    if iface.get("type") == "linux-bridge" and iface.get("state") == "up":
                        name = iface.get("name", "")
                        if name:
                            bridges.setdefault(name, []).append(node_name)
        except client.ApiException:
            pass
        return [{"name": name, "nodes": nodes} for name, nodes in sorted(bridges.items())]

    def list_node_interfaces(self) -> list[dict]:
        """Discover all interfaces from NodeNetworkStates, grouped by type."""
        interfaces: dict[str, dict] = {}
        try:
            result = self.custom_api.list_cluster_custom_object(
                group=NMSTATE_GROUP,
                version=NNS_VERSION,
                plural=NNS_PLURAL,
            )
            for nns in result.get("items", []):
                node_name = nns.get("metadata", {}).get("name", "")
                current_state = nns.get("status", {}).get("currentState", {})
                for iface in current_state.get("interfaces", []):
                    name = iface.get("name", "")
                    iface_type = iface.get("type", "unknown")
                    state = iface.get("state", "unknown")
                    if not name or name == "lo":
                        continue
                    if name not in interfaces:
                        interfaces[name] = {
                            "name": name,
                            "type": iface_type,
                            "state": state,
                            "nodes": [],
                        }
                    interfaces[name]["nodes"].append(node_name)
        except client.ApiException:
            pass
        return sorted(interfaces.values(), key=lambda x: (x["type"], x["name"]))

    def _parse_nncp(self, item: dict) -> NNCP:
        """Parse a raw NNCP object to NNCP model."""
        metadata = item.get("metadata", {})
        annotations = metadata.get("annotations", {}) or {}
        spec = item.get("spec", {})
        desired = spec.get("desiredState", {})
        interfaces = desired.get("interfaces", [])

        iface = interfaces[0] if interfaces else {}
        iface_type = iface.get("type", "unknown")

        port = ""
        vlan_id = None
        if iface_type == "linux-bridge":
            ports = iface.get("bridge", {}).get("port", [])
            port = ports[0].get("name", "") if ports else ""
        elif iface_type == "vlan":
            vlan_id = iface.get("vlan", {}).get("id")

        ipv4 = iface.get("ipv4", {})
        ipv4_enabled = ipv4.get("enabled", False)
        ipv4_address = ""
        addrs = ipv4.get("address", [])
        if addrs:
            ip = addrs[0].get("ip", "")
            prefix = addrs[0].get("prefix-length", "")
            ipv4_address = f"{ip}/{prefix}" if ip else ""

        # Status from conditions
        conditions = item.get("status", {}).get("conditions", [])
        status = "Unknown"
        for c in conditions:
            if c.get("type") == "Available" and c.get("status") == "True":
                status = "Available"
                break
            if c.get("type") == "Degraded" and c.get("status") == "True":
                status = "Degraded"
                break
            if c.get("type") == "Progressing" and c.get("status") == "True":
                status = "Progressing"

        return NNCP(
            name=metadata.get("name", ""),
            description=annotations.get("kubevmui.io/description", ""),
            interface_name=iface.get("name", ""),
            interface_type=iface_type,
            state=iface.get("state", "up"),
            port=port,
            vlan_id=vlan_id,
            ipv4_enabled=ipv4_enabled,
            ipv4_address=ipv4_address,
            status=status,
            raw_manifest=item,
        )

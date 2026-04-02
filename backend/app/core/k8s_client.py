from kubernetes import client
from kubernetes.client import ApiException


class KubeVirtClient:
    KUBEVIRT_API_GROUP = "kubevirt.io"
    KUBEVIRT_API_VERSION = "v1"
    SUBRESOURCE_API_GROUP = "subresources.kubevirt.io"
    SNAPSHOT_API_GROUP = "snapshot.kubevirt.io"
    SNAPSHOT_API_VERSION = "v1beta1"
    CLONE_API_GROUP = "clone.kubevirt.io"
    CLONE_API_VERSION = "v1beta1"
    CDI_API_GROUP = "cdi.kubevirt.io"
    CDI_API_VERSION = "v1beta1"

    def __init__(self, api_client: client.ApiClient):
        self.api_client = api_client
        self.custom_api = client.CustomObjectsApi(api_client)
        self.core_api = client.CoreV1Api(api_client)
        self.storage_api = client.StorageV1Api(api_client)

    def list_vms(self, namespace: str) -> list[dict]:
        result = self.custom_api.list_namespaced_custom_object(
            group=self.KUBEVIRT_API_GROUP,
            version=self.KUBEVIRT_API_VERSION,
            namespace=namespace,
            plural="virtualmachines",
        )
        return result.get("items", [])

    def get_vm(self, namespace: str, name: str) -> dict | None:
        try:
            return self.custom_api.get_namespaced_custom_object(
                group=self.KUBEVIRT_API_GROUP,
                version=self.KUBEVIRT_API_VERSION,
                namespace=namespace,
                plural="virtualmachines",
                name=name,
            )
        except ApiException as e:
            if e.status == 404:
                return None
            raise

    def create_vm(self, namespace: str, body: dict) -> dict:
        return self.custom_api.create_namespaced_custom_object(
            group=self.KUBEVIRT_API_GROUP,
            version=self.KUBEVIRT_API_VERSION,
            namespace=namespace,
            plural="virtualmachines",
            body=body,
        )

    def delete_vm(self, namespace: str, name: str) -> None:
        self.custom_api.delete_namespaced_custom_object(
            group=self.KUBEVIRT_API_GROUP,
            version=self.KUBEVIRT_API_VERSION,
            namespace=namespace,
            plural="virtualmachines",
            name=name,
        )

    def patch_vm(self, namespace: str, name: str, body: dict) -> dict:
        return self.custom_api.patch_namespaced_custom_object(
            group=self.KUBEVIRT_API_GROUP,
            version=self.KUBEVIRT_API_VERSION,
            namespace=namespace,
            plural="virtualmachines",
            name=name,
            body=body,
        )

    def vm_action(self, namespace: str, name: str, action: str) -> None:
        resource_path = (
            f"/apis/{self.SUBRESOURCE_API_GROUP}/{self.KUBEVIRT_API_VERSION}"
            f"/namespaces/{namespace}/virtualmachines/{name}/{action}"
        )
        self.api_client.call_api(
            resource_path,
            "PUT",
            body={},
            response_type="object",
            _return_http_data_only=True,
        )

    def get_guest_fs_info(self, namespace: str, name: str) -> list[dict]:
        """Get filesystem usage from guest agent."""
        try:
            resource_path = (
                f"/apis/{self.SUBRESOURCE_API_GROUP}/{self.KUBEVIRT_API_VERSION}"
                f"/namespaces/{namespace}/virtualmachineinstances/{name}/guestosinfo"
            )
            result = self.api_client.call_api(
                resource_path,
                "GET",
                response_type="object",
                _return_http_data_only=True,
            )
            return result.get("fsInfo", {}).get("disks", [])
        except Exception:
            return []

    def get_guest_os_info(self, namespace: str, name: str) -> dict:
        """Get guest OS information from guest agent."""
        try:
            resource_path = (
                f"/apis/{self.SUBRESOURCE_API_GROUP}/{self.KUBEVIRT_API_VERSION}"
                f"/namespaces/{namespace}/virtualmachineinstances/{name}/guestosinfo"
            )
            result = self.api_client.call_api(
                resource_path,
                "GET",
                response_type="object",
                _return_http_data_only=True,
            )
            return {
                "hostname": result.get("hostname", ""),
                "os_name": result.get("os", {}).get("name", ""),
                "os_version": result.get("os", {}).get("version", ""),
                "os_id": result.get("os", {}).get("id", ""),
                "kernel": result.get("os", {}).get("kernelRelease", ""),
                "timezone": result.get("timezone", ""),
            }
        except Exception:
            return {}

    # --- Hotplug ---

    def add_volume(self, namespace: str, vm_name: str, body: dict) -> None:
        resource_path = (
            f"/apis/{self.SUBRESOURCE_API_GROUP}/{self.KUBEVIRT_API_VERSION}"
            f"/namespaces/{namespace}/virtualmachines/{vm_name}/addvolume"
        )
        self.api_client.call_api(
            resource_path,
            "PUT",
            body=body,
            response_type="object",
            _return_http_data_only=True,
        )

    def remove_volume(self, namespace: str, vm_name: str, body: dict) -> None:
        resource_path = (
            f"/apis/{self.SUBRESOURCE_API_GROUP}/{self.KUBEVIRT_API_VERSION}"
            f"/namespaces/{namespace}/virtualmachines/{vm_name}/removevolume"
        )
        self.api_client.call_api(
            resource_path,
            "PUT",
            body=body,
            response_type="object",
            _return_http_data_only=True,
        )

    def add_interface(self, namespace: str, vm_name: str, body: dict) -> None:
        resource_path = (
            f"/apis/{self.SUBRESOURCE_API_GROUP}/{self.KUBEVIRT_API_VERSION}"
            f"/namespaces/{namespace}/virtualmachines/{vm_name}/addinterface"
        )
        self.api_client.call_api(
            resource_path,
            "PUT",
            body=body,
            response_type="object",
            _return_http_data_only=True,
        )

    def remove_interface(self, namespace: str, vm_name: str, body: dict) -> None:
        resource_path = (
            f"/apis/{self.SUBRESOURCE_API_GROUP}/{self.KUBEVIRT_API_VERSION}"
            f"/namespaces/{namespace}/virtualmachines/{vm_name}/removeinterface"
        )
        self.api_client.call_api(
            resource_path,
            "PUT",
            body=body,
            response_type="object",
            _return_http_data_only=True,
        )

    def get_vmi(self, namespace: str, name: str) -> dict | None:
        try:
            return self.custom_api.get_namespaced_custom_object(
                group=self.KUBEVIRT_API_GROUP,
                version=self.KUBEVIRT_API_VERSION,
                namespace=namespace,
                plural="virtualmachineinstances",
                name=name,
            )
        except ApiException as e:
            if e.status == 404:
                return None
            raise

    def list_vmis(self, namespace: str) -> list[dict]:
        result = self.custom_api.list_namespaced_custom_object(
            group=self.KUBEVIRT_API_GROUP,
            version=self.KUBEVIRT_API_VERSION,
            namespace=namespace,
            plural="virtualmachineinstances",
        )
        return result.get("items", [])

    def list_namespaces(self) -> list[str]:
        result = self.core_api.list_namespace()
        return [ns.metadata.name for ns in result.items]

    def list_all_events(self, field_selector: str = "") -> list[dict]:
        result = self.core_api.list_event_for_all_namespaces(field_selector=field_selector)
        return self._parse_events(result.items)

    def list_events(self, namespace: str, field_selector: str = "") -> list[dict]:
        result = self.core_api.list_namespaced_event(
            namespace=namespace,
            field_selector=field_selector,
        )
        return self._parse_events(result.items)

    @staticmethod
    def _parse_events(items) -> list[dict]:
        events = []
        for e in items:
            involved = e.involved_object
            events.append(
                {
                    "timestamp": (
                        e.last_timestamp or e.event_time or e.metadata.creation_timestamp or ""
                    ).isoformat()
                    if hasattr(
                        e.last_timestamp or e.event_time or e.metadata.creation_timestamp,
                        "isoformat",
                    )
                    else str(e.last_timestamp or e.event_time or ""),
                    "type": e.type or "",
                    "reason": e.reason or "",
                    "message": e.message or "",
                    "namespace": e.metadata.namespace or "",
                    "involved_object_name": involved.name if involved else "",
                    "involved_object_kind": involved.kind if involved else "",
                }
            )
        return sorted(events, key=lambda x: x["timestamp"], reverse=True)

    def list_nodes(self) -> list[dict]:
        result = self.core_api.list_node()
        nodes = []
        for node in result.items:
            nodes.append(
                {
                    "name": node.metadata.name,
                    "status": "Ready"
                    if any(
                        c.type == "Ready" and c.status == "True"
                        for c in node.status.conditions or []
                    )
                    else "NotReady",
                    "roles": [
                        k.replace("node-role.kubernetes.io/", "")
                        for k in (node.metadata.labels or {})
                        if k.startswith("node-role.kubernetes.io/")
                    ],
                    "cpu_capacity": node.status.capacity.get("cpu", "0"),
                    "memory_capacity": node.status.capacity.get("memory", "0"),
                    "cpu_allocatable": node.status.allocatable.get("cpu", "0"),
                    "memory_allocatable": node.status.allocatable.get("memory", "0"),
                }
            )
        return nodes

    def get_node_raw(self, name: str) -> dict | None:
        try:
            node = self.core_api.read_node(name)
            return self.core_api.api_client.sanitize_for_serialization(node)
        except ApiException as e:
            if e.status == 404:
                return None
            raise

    # --- DataVolumes (CDI) ---

    def list_datavolumes(self, namespace: str) -> list[dict]:
        result = self.custom_api.list_namespaced_custom_object(
            group=self.CDI_API_GROUP,
            version=self.CDI_API_VERSION,
            namespace=namespace,
            plural="datavolumes",
        )
        return result.get("items", [])

    def get_datavolume(self, namespace: str, name: str) -> dict | None:
        try:
            return self.custom_api.get_namespaced_custom_object(
                group=self.CDI_API_GROUP,
                version=self.CDI_API_VERSION,
                namespace=namespace,
                plural="datavolumes",
                name=name,
            )
        except ApiException as e:
            if e.status == 404:
                return None
            raise

    def create_datavolume(self, namespace: str, body: dict) -> dict:
        return self.custom_api.create_namespaced_custom_object(
            group=self.CDI_API_GROUP,
            version=self.CDI_API_VERSION,
            namespace=namespace,
            plural="datavolumes",
            body=body,
        )

    def delete_datavolume(self, namespace: str, name: str) -> None:
        self.custom_api.delete_namespaced_custom_object(
            group=self.CDI_API_GROUP,
            version=self.CDI_API_VERSION,
            namespace=namespace,
            plural="datavolumes",
            name=name,
        )

    # --- Storage Classes ---

    def list_storage_classes(self) -> list[dict]:
        result = self.storage_api.list_storage_class()
        classes = []
        for sc in result.items:
            annotations = sc.metadata.annotations or {}
            is_default = (
                annotations.get("storageclass.kubernetes.io/is-default-class", "false") == "true"
            )
            classes.append(
                {
                    "name": sc.metadata.name,
                    "provisioner": sc.provisioner,
                    "is_default": is_default,
                }
            )
        return classes

    # --- Clone ---

    def create_clone(self, namespace: str, body: dict) -> dict:
        return self.custom_api.create_namespaced_custom_object(
            group=self.CLONE_API_GROUP,
            version=self.CLONE_API_VERSION,
            namespace=namespace,
            plural="virtualmachineclones",
            body=body,
        )

    # --- Snapshots ---

    def list_snapshots(self, namespace: str) -> list[dict]:
        result = self.custom_api.list_namespaced_custom_object(
            group=self.SNAPSHOT_API_GROUP,
            version=self.SNAPSHOT_API_VERSION,
            namespace=namespace,
            plural="virtualmachinesnapshots",
        )
        return result.get("items", [])

    def get_snapshot(self, namespace: str, name: str) -> dict | None:
        try:
            return self.custom_api.get_namespaced_custom_object(
                group=self.SNAPSHOT_API_GROUP,
                version=self.SNAPSHOT_API_VERSION,
                namespace=namespace,
                plural="virtualmachinesnapshots",
                name=name,
            )
        except ApiException as e:
            if e.status == 404:
                return None
            raise

    def create_snapshot(self, namespace: str, body: dict) -> dict:
        return self.custom_api.create_namespaced_custom_object(
            group=self.SNAPSHOT_API_GROUP,
            version=self.SNAPSHOT_API_VERSION,
            namespace=namespace,
            plural="virtualmachinesnapshots",
            body=body,
        )

    def delete_snapshot(self, namespace: str, name: str) -> None:
        self.custom_api.delete_namespaced_custom_object(
            group=self.SNAPSHOT_API_GROUP,
            version=self.SNAPSHOT_API_VERSION,
            namespace=namespace,
            plural="virtualmachinesnapshots",
            name=name,
        )

    def create_restore(self, namespace: str, body: dict) -> dict:
        return self.custom_api.create_namespaced_custom_object(
            group=self.SNAPSHOT_API_GROUP,
            version=self.SNAPSHOT_API_VERSION,
            namespace=namespace,
            plural="virtualmachinerestores",
            body=body,
        )

    def get_restore(self, namespace: str, name: str) -> dict | None:
        try:
            return self.custom_api.get_namespaced_custom_object(
                group=self.SNAPSHOT_API_GROUP,
                version=self.SNAPSHOT_API_VERSION,
                namespace=namespace,
                plural="virtualmachinerestores",
                name=name,
            )
        except ApiException as e:
            if e.status == 404:
                return None
            raise

    def delete_restore(self, namespace: str, name: str) -> None:
        self.custom_api.delete_namespaced_custom_object(
            group=self.SNAPSHOT_API_GROUP,
            version=self.SNAPSHOT_API_VERSION,
            namespace=namespace,
            plural="virtualmachinerestores",
            name=name,
        )

    def list_restores(self, namespace: str) -> list[dict]:
        result = self.custom_api.list_namespaced_custom_object(
            group=self.SNAPSHOT_API_GROUP,
            version=self.SNAPSHOT_API_VERSION,
            namespace=namespace,
            plural="virtualmachinerestores",
        )
        return result.get("items", [])

    # --- Migrations ---

    def list_migrations(self, namespace: str) -> list[dict]:
        result = self.custom_api.list_namespaced_custom_object(
            group=self.KUBEVIRT_API_GROUP,
            version=self.KUBEVIRT_API_VERSION,
            namespace=namespace,
            plural="virtualmachineinstancemigrations",
        )
        return result.get("items", [])

    def get_migration(self, namespace: str, name: str) -> dict | None:
        try:
            return self.custom_api.get_namespaced_custom_object(
                group=self.KUBEVIRT_API_GROUP,
                version=self.KUBEVIRT_API_VERSION,
                namespace=namespace,
                plural="virtualmachineinstancemigrations",
                name=name,
            )
        except ApiException as e:
            if e.status == 404:
                return None
            raise

    def create_migration(self, namespace: str, body: dict) -> dict:
        return self.custom_api.create_namespaced_custom_object(
            group=self.KUBEVIRT_API_GROUP,
            version=self.KUBEVIRT_API_VERSION,
            namespace=namespace,
            plural="virtualmachineinstancemigrations",
            body=body,
        )

    def delete_migration(self, namespace: str, name: str) -> None:
        self.custom_api.delete_namespaced_custom_object(
            group=self.KUBEVIRT_API_GROUP,
            version=self.KUBEVIRT_API_VERSION,
            namespace=namespace,
            plural="virtualmachineinstancemigrations",
            name=name,
        )

    # --- SSH Keys ---

    def list_ssh_keys(self, namespace: str) -> list[dict]:
        result = self.core_api.list_namespaced_secret(
            namespace=namespace,
            label_selector="kubevmui.io/type=sshkey",
        )
        return [self._secret_to_dict(s) for s in result.items]

    def get_ssh_key(self, namespace: str, name: str) -> dict | None:
        try:
            s = self.core_api.read_namespaced_secret(name=name, namespace=namespace)
            return self._secret_to_dict(s)
        except ApiException as e:
            if e.status == 404:
                return None
            raise

    def create_ssh_key(self, namespace: str, name: str, public_key: str) -> dict:
        import base64

        secret = client.V1Secret(
            metadata=client.V1ObjectMeta(
                name=name,
                namespace=namespace,
                labels={"kubevmui.io/type": "sshkey"},
            ),
            data={"key": base64.b64encode(public_key.encode()).decode()},
            type="Opaque",
        )
        result = self.core_api.create_namespaced_secret(namespace=namespace, body=secret)
        return self._secret_to_dict(result)

    def delete_ssh_key(self, namespace: str, name: str) -> None:
        self.core_api.delete_namespaced_secret(name=name, namespace=namespace)

    # --- Images (ConfigMap-backed registry) ---

    # --- Images (kubevmui.io CRD) ---

    KUBEVMUI_GROUP = "kubevmui.io"
    KUBEVMUI_VERSION = "v1"

    # --- Images (kubevmui.io CRD, cluster-scoped) ---

    def list_images(self) -> list[dict]:
        result = self.custom_api.list_cluster_custom_object(
            group=self.KUBEVMUI_GROUP,
            version=self.KUBEVMUI_VERSION,
            plural="images",
        )
        return result.get("items", [])

    def get_image(self, name: str) -> dict | None:
        try:
            return self.custom_api.get_cluster_custom_object(
                group=self.KUBEVMUI_GROUP,
                version=self.KUBEVMUI_VERSION,
                plural="images",
                name=name,
            )
        except ApiException as e:
            if e.status == 404:
                return None
            raise

    def create_image(self, body: dict) -> dict:
        return self.custom_api.create_cluster_custom_object(
            group=self.KUBEVMUI_GROUP,
            version=self.KUBEVMUI_VERSION,
            plural="images",
            body=body,
        )

    def delete_image(self, name: str) -> None:
        self.custom_api.delete_cluster_custom_object(
            group=self.KUBEVMUI_GROUP,
            version=self.KUBEVMUI_VERSION,
            plural="images",
            name=name,
        )

    # --- Templates (kubevmui.io CRD, cluster-scoped) ---

    def list_templates(self) -> list[dict]:
        result = self.custom_api.list_cluster_custom_object(
            group=self.KUBEVMUI_GROUP,
            version=self.KUBEVMUI_VERSION,
            plural="templates",
        )
        return result.get("items", [])

    def get_template(self, name: str) -> dict | None:
        try:
            return self.custom_api.get_cluster_custom_object(
                group=self.KUBEVMUI_GROUP,
                version=self.KUBEVMUI_VERSION,
                plural="templates",
                name=name,
            )
        except ApiException as e:
            if e.status == 404:
                return None
            raise

    def create_template(self, body: dict) -> dict:
        return self.custom_api.create_cluster_custom_object(
            group=self.KUBEVMUI_GROUP,
            version=self.KUBEVMUI_VERSION,
            plural="templates",
            body=body,
        )

    def delete_template(self, name: str) -> None:
        self.custom_api.delete_cluster_custom_object(
            group=self.KUBEVMUI_GROUP,
            version=self.KUBEVMUI_VERSION,
            plural="templates",
            name=name,
        )

    # ── Catalog (cluster-scoped) ──────────────────────────────────

    def list_kubevirts(self) -> list[dict]:
        result = self.custom_api.list_cluster_custom_object(
            group=self.KUBEVIRT_API_GROUP,
            version=self.KUBEVIRT_API_VERSION,
            plural="kubevirts",
        )
        return result.get("items", [])

    def list_catalog_entries(self) -> list[dict]:
        result = self.custom_api.list_cluster_custom_object(
            group=self.KUBEVMUI_GROUP,
            version=self.KUBEVMUI_VERSION,
            plural="catalogentries",
        )
        return result.get("items", [])

    def get_catalog_entry(self, name: str) -> dict | None:
        try:
            return self.custom_api.get_cluster_custom_object(
                group=self.KUBEVMUI_GROUP,
                version=self.KUBEVMUI_VERSION,
                plural="catalogentries",
                name=name,
            )
        except ApiException as e:
            if e.status == 404:
                return None
            raise

    def create_catalog_entry(self, body: dict) -> dict:
        return self.custom_api.create_cluster_custom_object(
            group=self.KUBEVMUI_GROUP,
            version=self.KUBEVMUI_VERSION,
            plural="catalogentries",
            body=body,
        )

    def delete_catalog_entry(self, name: str) -> None:
        self.custom_api.delete_cluster_custom_object(
            group=self.KUBEVMUI_GROUP,
            version=self.KUBEVMUI_VERSION,
            plural="catalogentries",
            name=name,
        )

    # ── Network CRs (cluster-scoped) ─────────────────────────────

    def list_network_crs(self) -> list[dict]:
        result = self.custom_api.list_cluster_custom_object(
            group=self.KUBEVMUI_GROUP,
            version=self.KUBEVMUI_VERSION,
            plural="networks",
        )
        return result.get("items", [])

    def get_network_cr(self, name: str) -> dict | None:
        try:
            return self.custom_api.get_cluster_custom_object(
                group=self.KUBEVMUI_GROUP,
                version=self.KUBEVMUI_VERSION,
                plural="networks",
                name=name,
            )
        except ApiException as e:
            if e.status == 404:
                return None
            raise

    def create_network_cr(self, body: dict) -> dict:
        return self.custom_api.create_cluster_custom_object(
            group=self.KUBEVMUI_GROUP,
            version=self.KUBEVMUI_VERSION,
            plural="networks",
            body=body,
        )

    def patch_network_cr(self, name: str, body: dict) -> dict:
        return self.custom_api.patch_cluster_custom_object(
            group=self.KUBEVMUI_GROUP,
            version=self.KUBEVMUI_VERSION,
            plural="networks",
            name=name,
            body=body,
        )

    def delete_network_cr(self, name: str) -> None:
        self.custom_api.delete_cluster_custom_object(
            group=self.KUBEVMUI_GROUP,
            version=self.KUBEVMUI_VERSION,
            plural="networks",
            name=name,
        )

    # ── NAD operations for on-demand creation ─────────────────────

    NAD_GROUP = "k8s.cni.cncf.io"
    NAD_VERSION = "v1"
    NAD_PLURAL = "network-attachment-definitions"

    def list_nads_by_label(self, namespace: str, label_selector: str) -> list[dict]:
        result = self.custom_api.list_namespaced_custom_object(
            group=self.NAD_GROUP,
            version=self.NAD_VERSION,
            namespace=namespace,
            plural=self.NAD_PLURAL,
            label_selector=label_selector,
        )
        return result.get("items", [])

    def list_all_nads_by_label(self, label_selector: str) -> list[dict]:
        result = self.custom_api.list_cluster_custom_object(
            group=self.NAD_GROUP,
            version=self.NAD_VERSION,
            plural=self.NAD_PLURAL,
            label_selector=label_selector,
        )
        return result.get("items", [])

    def create_nad(self, namespace: str, body: dict) -> dict:
        return self.custom_api.create_namespaced_custom_object(
            group=self.NAD_GROUP,
            version=self.NAD_VERSION,
            namespace=namespace,
            plural=self.NAD_PLURAL,
            body=body,
        )

    def delete_nad(self, namespace: str, name: str) -> None:
        self.custom_api.delete_namespaced_custom_object(
            group=self.NAD_GROUP,
            version=self.NAD_VERSION,
            namespace=namespace,
            plural=self.NAD_PLURAL,
            name=name,
        )

    # ── PVC helpers ───────────────────────────────────────────────

    def get_pvc(self, namespace: str, name: str):
        try:
            return self.core_api.read_namespaced_persistent_volume_claim(name, namespace)
        except ApiException as e:
            if e.status == 404:
                return None
            raise

    def list_pvcs_by_label(self, namespace: str, label_selector: str) -> list:
        result = self.core_api.list_namespaced_persistent_volume_claim(
            namespace, label_selector=label_selector
        )
        return result.items

    def delete_pvc(self, namespace: str, name: str) -> None:
        self.core_api.delete_namespaced_persistent_volume_claim(name, namespace)

    # ── Label-filtered queries ────────────────────────────────────

    def list_images_by_label(self, label_selector: str) -> list[dict]:
        result = self.custom_api.list_cluster_custom_object(
            group=self.KUBEVMUI_GROUP,
            version=self.KUBEVMUI_VERSION,
            plural="images",
            label_selector=label_selector,
        )
        return result.get("items", [])

    def list_templates_by_label(self, label_selector: str) -> list[dict]:
        result = self.custom_api.list_cluster_custom_object(
            group=self.KUBEVMUI_GROUP,
            version=self.KUBEVMUI_VERSION,
            plural="templates",
            label_selector=label_selector,
        )
        return result.get("items", [])

    @staticmethod
    def _secret_to_dict(secret) -> dict:
        import base64

        data = secret.data or {}
        public_key = ""
        if "key" in data:
            public_key = base64.b64decode(data["key"]).decode()
        return {
            "metadata": {
                "name": secret.metadata.name,
                "namespace": secret.metadata.namespace,
                "creationTimestamp": secret.metadata.creation_timestamp.isoformat()
                if secret.metadata.creation_timestamp
                else None,
            },
            "public_key": public_key,
        }

from kubernetes import client
from kubernetes.client import ApiException


class KubeVirtClient:
    KUBEVIRT_API_GROUP = "kubevirt.io"
    KUBEVIRT_API_VERSION = "v1"
    SUBRESOURCE_API_GROUP = "subresources.kubevirt.io"
    SNAPSHOT_API_GROUP = "snapshot.kubevirt.io"
    SNAPSHOT_API_VERSION = "v1beta1"

    def __init__(self, api_client: client.ApiClient):
        self.api_client = api_client
        self.custom_api = client.CustomObjectsApi(api_client)
        self.core_api = client.CoreV1Api(api_client)

    def list_vms(self, namespace: str) -> list[dict]:
        result = self.custom_api.list_namespaced_custom_object(
            group=self.KUBEVIRT_API_GROUP, version=self.KUBEVIRT_API_VERSION,
            namespace=namespace, plural="virtualmachines",
        )
        return result.get("items", [])

    def get_vm(self, namespace: str, name: str) -> dict | None:
        try:
            return self.custom_api.get_namespaced_custom_object(
                group=self.KUBEVIRT_API_GROUP, version=self.KUBEVIRT_API_VERSION,
                namespace=namespace, plural="virtualmachines", name=name,
            )
        except ApiException as e:
            if e.status == 404:
                return None
            raise

    def create_vm(self, namespace: str, body: dict) -> dict:
        return self.custom_api.create_namespaced_custom_object(
            group=self.KUBEVIRT_API_GROUP, version=self.KUBEVIRT_API_VERSION,
            namespace=namespace, plural="virtualmachines", body=body,
        )

    def delete_vm(self, namespace: str, name: str) -> None:
        self.custom_api.delete_namespaced_custom_object(
            group=self.KUBEVIRT_API_GROUP, version=self.KUBEVIRT_API_VERSION,
            namespace=namespace, plural="virtualmachines", name=name,
        )

    def patch_vm(self, namespace: str, name: str, body: dict) -> dict:
        return self.custom_api.patch_namespaced_custom_object(
            group=self.KUBEVIRT_API_GROUP, version=self.KUBEVIRT_API_VERSION,
            namespace=namespace, plural="virtualmachines", name=name, body=body,
        )

    def vm_action(self, namespace: str, name: str, action: str) -> None:
        resource_path = (
            f"/apis/{self.SUBRESOURCE_API_GROUP}/{self.KUBEVIRT_API_VERSION}"
            f"/namespaces/{namespace}/virtualmachines/{name}/{action}"
        )
        self.api_client.call_api(
            resource_path, "PUT", body={}, response_type="object",
            _return_http_data_only=True,
        )

    def get_vmi(self, namespace: str, name: str) -> dict | None:
        try:
            return self.custom_api.get_namespaced_custom_object(
                group=self.KUBEVIRT_API_GROUP, version=self.KUBEVIRT_API_VERSION,
                namespace=namespace, plural="virtualmachineinstances", name=name,
            )
        except ApiException as e:
            if e.status == 404:
                return None
            raise

    def list_vmis(self, namespace: str) -> list[dict]:
        result = self.custom_api.list_namespaced_custom_object(
            group=self.KUBEVIRT_API_GROUP, version=self.KUBEVIRT_API_VERSION,
            namespace=namespace, plural="virtualmachineinstances",
        )
        return result.get("items", [])

    def list_namespaces(self) -> list[str]:
        result = self.core_api.list_namespace()
        return [ns.metadata.name for ns in result.items]

    def list_nodes(self) -> list[dict]:
        result = self.core_api.list_node()
        nodes = []
        for node in result.items:
            nodes.append({
                "name": node.metadata.name,
                "status": "Ready" if any(
                    c.type == "Ready" and c.status == "True"
                    for c in node.status.conditions or []
                ) else "NotReady",
                "roles": [
                    k.replace("node-role.kubernetes.io/", "")
                    for k in (node.metadata.labels or {})
                    if k.startswith("node-role.kubernetes.io/")
                ],
                "cpu_capacity": node.status.capacity.get("cpu", "0"),
                "memory_capacity": node.status.capacity.get("memory", "0"),
                "cpu_allocatable": node.status.allocatable.get("cpu", "0"),
                "memory_allocatable": node.status.allocatable.get("memory", "0"),
            })
        return nodes

    # --- Snapshots ---

    def list_snapshots(self, namespace: str) -> list[dict]:
        result = self.custom_api.list_namespaced_custom_object(
            group=self.SNAPSHOT_API_GROUP, version=self.SNAPSHOT_API_VERSION,
            namespace=namespace, plural="virtualmachinesnapshots",
        )
        return result.get("items", [])

    def get_snapshot(self, namespace: str, name: str) -> dict | None:
        try:
            return self.custom_api.get_namespaced_custom_object(
                group=self.SNAPSHOT_API_GROUP, version=self.SNAPSHOT_API_VERSION,
                namespace=namespace, plural="virtualmachinesnapshots", name=name,
            )
        except ApiException as e:
            if e.status == 404:
                return None
            raise

    def create_snapshot(self, namespace: str, body: dict) -> dict:
        return self.custom_api.create_namespaced_custom_object(
            group=self.SNAPSHOT_API_GROUP, version=self.SNAPSHOT_API_VERSION,
            namespace=namespace, plural="virtualmachinesnapshots", body=body,
        )

    def delete_snapshot(self, namespace: str, name: str) -> None:
        self.custom_api.delete_namespaced_custom_object(
            group=self.SNAPSHOT_API_GROUP, version=self.SNAPSHOT_API_VERSION,
            namespace=namespace, plural="virtualmachinesnapshots", name=name,
        )

    def create_restore(self, namespace: str, body: dict) -> dict:
        return self.custom_api.create_namespaced_custom_object(
            group=self.SNAPSHOT_API_GROUP, version=self.SNAPSHOT_API_VERSION,
            namespace=namespace, plural="virtualmachinerestores", body=body,
        )

    def list_restores(self, namespace: str) -> list[dict]:
        result = self.custom_api.list_namespaced_custom_object(
            group=self.SNAPSHOT_API_GROUP, version=self.SNAPSHOT_API_VERSION,
            namespace=namespace, plural="virtualmachinerestores",
        )
        return result.get("items", [])

    # --- Migrations ---

    def list_migrations(self, namespace: str) -> list[dict]:
        result = self.custom_api.list_namespaced_custom_object(
            group=self.KUBEVIRT_API_GROUP, version=self.KUBEVIRT_API_VERSION,
            namespace=namespace, plural="virtualmachineinstancemigrations",
        )
        return result.get("items", [])

    def get_migration(self, namespace: str, name: str) -> dict | None:
        try:
            return self.custom_api.get_namespaced_custom_object(
                group=self.KUBEVIRT_API_GROUP, version=self.KUBEVIRT_API_VERSION,
                namespace=namespace, plural="virtualmachineinstancemigrations", name=name,
            )
        except ApiException as e:
            if e.status == 404:
                return None
            raise

    def create_migration(self, namespace: str, body: dict) -> dict:
        return self.custom_api.create_namespaced_custom_object(
            group=self.KUBEVIRT_API_GROUP, version=self.KUBEVIRT_API_VERSION,
            namespace=namespace, plural="virtualmachineinstancemigrations", body=body,
        )

    def delete_migration(self, namespace: str, name: str) -> None:
        self.custom_api.delete_namespaced_custom_object(
            group=self.KUBEVIRT_API_GROUP, version=self.KUBEVIRT_API_VERSION,
            namespace=namespace, plural="virtualmachineinstancemigrations", name=name,
        )

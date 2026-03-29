from datetime import UTC, datetime

from app.core.k8s_client import KubeVirtClient
from app.models.template import Template, TemplateCreate
from app.models.vm import VMCompute


def _cr_to_template(raw: dict) -> Template:
    """Deserialize a kubevmui.io/v1 Template CR to our Template model."""
    metadata = raw.get("metadata", {})
    spec = raw.get("spec", {})

    created_at = None
    ts = metadata.get("creationTimestamp")
    if ts:
        try:
            created_at = (
                datetime.fromisoformat(str(ts).replace("Z", "+00:00"))
                if isinstance(ts, str)
                else ts
            )
        except (ValueError, TypeError):
            created_at = datetime.now(tz=UTC)

    compute_data = spec.get("compute", {})
    compute = VMCompute(
        cpu_cores=compute_data.get("cpuCores", 1),
        memory_mb=compute_data.get("memoryMb", 512),
        cpu_model=compute_data.get("cpuModel"),
        sockets=compute_data.get("sockets", 1),
        cores_per_socket=compute_data.get("coresPerSocket"),
        threads_per_core=compute_data.get("threadsPerCore", 1),
    )

    cloud_init = spec.get("cloudInit", {})

    # Map CRD disk fields (camelCase) to our model (snake_case)
    disks = []
    for d in spec.get("disks", []):
        disks.append({
            "name": d.get("name", ""),
            "size_gb": d.get("sizeGb", 0),
            "bus": d.get("bus", "virtio"),
            "source_type": d.get("sourceType", ""),
            "image": d.get("image", ""),
            "clone_source": d.get("cloneSource", ""),
            "clone_namespace": d.get("cloneNamespace", ""),
            "storage_class": d.get("storageClass", ""),
        })

    networks = []
    for n in spec.get("networks", []):
        networks.append({
            "name": n.get("name", ""),
            "network_profile": n.get("networkProfile", ""),
        })

    return Template(
        name=metadata.get("name", ""),
        namespace=metadata.get("namespace", ""),
        created_at=created_at,
        labels=metadata.get("labels", {}),
        annotations=metadata.get("annotations", {}),
        display_name=spec.get("displayName", metadata.get("name", "")),
        description=spec.get("description", ""),
        category=spec.get("category", "custom"),
        os_type=spec.get("osType"),
        compute=compute,
        disks=disks,
        networks=networks,
        cloud_init_user_data=cloud_init.get("userData"),
        cloud_init_network_data=cloud_init.get("networkData"),
        autoattach_pod_interface=spec.get("autoattachPodInterface", True),
        is_global=spec.get("global", False),
    )


class TemplateService:
    def __init__(self, kv: KubeVirtClient):
        self.kv = kv

    def get_template(self, namespace: str, name: str) -> Template | None:
        raw = self.kv.get_template(namespace, name)
        if raw is None:
            return None
        tpl = _cr_to_template(raw)
        tpl.raw_manifest = raw
        return tpl

    def list_templates(self, namespace: str) -> list[Template]:
        templates = [_cr_to_template(item) for item in self.kv.list_templates(namespace)]
        # Merge global templates from other namespaces
        seen = {t.name for t in templates}
        for ns in self.kv.list_namespaces():
            if ns == namespace:
                continue
            try:
                for raw in self.kv.list_templates(ns):
                    spec = raw.get("spec", {})
                    if spec.get("global", False):
                        tpl = _cr_to_template(raw)
                        if tpl.name not in seen:
                            templates.append(tpl)
                            seen.add(tpl.name)
            except Exception:
                continue
        return templates

    def preview_template(self, request: TemplateCreate) -> list[dict]:
        compute = request.compute.model_dump()
        disks = [d.model_dump() for d in request.disks]
        networks = [n.model_dump() for n in request.networks]
        body = {
            "apiVersion": "kubevmui.io/v1",
            "kind": "Template",
            "metadata": {"name": request.name, "namespace": request.namespace},
            "spec": {
                "displayName": request.display_name,
                "description": request.description,
                "category": request.category,
                "osType": request.os_type,
                "compute": {
                    "cpuCores": compute.get("cpu_cores", 1),
                    "memoryMb": compute.get("memory_mb", 512),
                    "cpuModel": compute.get("cpu_model"),
                    "sockets": compute.get("sockets", 1),
                    "coresPerSocket": compute.get("cores_per_socket"),
                    "threadsPerCore": compute.get("threads_per_core", 1),
                },
                "disks": [
                    {
                        "name": d.get("name", ""),
                        "sizeGb": d.get("size_gb", 0),
                        "bus": d.get("bus", "virtio"),
                        "sourceType": d.get("source_type", ""),
                        "image": d.get("image", ""),
                        "cloneSource": d.get("clone_source", ""),
                        "cloneNamespace": d.get("clone_namespace", ""),
                        "storageClass": d.get("storage_class", ""),
                    }
                    for d in disks
                ],
                "networks": [
                    {"name": n.get("name", ""), "networkProfile": n.get("network_profile", "")}
                    for n in networks
                ],
                "cloudInit": {
                    "userData": request.cloud_init_user_data,
                    "networkData": request.cloud_init_network_data,
                },
                "autoattachPodInterface": request.autoattach_pod_interface,
                "global": request.is_global,
            },
        }
        return [body]

    def create_template(self, request: TemplateCreate) -> Template:
        compute = request.compute.model_dump()
        disks = [d.model_dump() for d in request.disks]
        networks = [n.model_dump() for n in request.networks]

        body = {
            "apiVersion": "kubevmui.io/v1",
            "kind": "Template",
            "metadata": {
                "name": request.name,
                "namespace": request.namespace,
            },
            "spec": {
                "displayName": request.display_name,
                "description": request.description,
                "category": request.category,
                "osType": request.os_type,
                "compute": {
                    "cpuCores": compute.get("cpu_cores", 1),
                    "memoryMb": compute.get("memory_mb", 512),
                    "cpuModel": compute.get("cpu_model"),
                    "sockets": compute.get("sockets", 1),
                    "coresPerSocket": compute.get("cores_per_socket"),
                    "threadsPerCore": compute.get("threads_per_core", 1),
                },
                "disks": [
                    {
                        "name": d.get("name", ""),
                        "sizeGb": d.get("size_gb", 0),
                        "bus": d.get("bus", "virtio"),
                        "sourceType": d.get("source_type", ""),
                        "image": d.get("image", ""),
                        "cloneSource": d.get("clone_source", ""),
                        "cloneNamespace": d.get("clone_namespace", ""),
                        "storageClass": d.get("storage_class", ""),
                    }
                    for d in disks
                ],
                "networks": [
                    {
                        "name": n.get("name", ""),
                        "networkProfile": n.get("network_profile", ""),
                    }
                    for n in networks
                ],
                "cloudInit": {
                    "userData": request.cloud_init_user_data,
                    "networkData": request.cloud_init_network_data,
                },
                "autoattachPodInterface": request.autoattach_pod_interface,
                "global": request.is_global,
            },
        }
        raw = self.kv.create_template(request.namespace, body)
        return _cr_to_template(raw)

    def delete_template(self, namespace: str, name: str) -> None:
        self.kv.delete_template(namespace, name)

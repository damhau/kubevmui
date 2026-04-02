import logging
from datetime import UTC, datetime

from app.core.k8s_client import KubeVirtClient
from app.models.template import Template, TemplateCreate
from app.models.vm import VMCompute

logger = logging.getLogger(__name__)


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
        disks.append(
            {
                "name": d.get("name", ""),
                "size_gb": d.get("sizeGb", 0),
                "bus": d.get("bus", "virtio"),
                "source_type": d.get("sourceType", ""),
                "image": d.get("image", ""),
                "clone_source": d.get("cloneSource", ""),
                "clone_namespace": d.get("cloneNamespace", ""),
                "storage_class": d.get("storageClass", ""),
            }
        )

    networks = []
    for n in spec.get("networks", []):
        # Read networkCR first, fall back to networkProfile for backward compat
        network_cr = n.get("networkCR", "")
        if not network_cr:
            # Migrate legacy: networkProfile "pod" -> "pod-network", others stay as-is
            legacy = n.get("networkProfile", "")
            network_cr = "pod-network" if legacy == "pod" else legacy
        networks.append(
            {
                "name": n.get("name", ""),
                "network_cr": network_cr,
                "network_profile": network_cr,  # keep for backward compat
            }
        )

    return Template(
        name=metadata.get("name", ""),
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
    )


def _merge_disk_readiness(template: Template, kv: KubeVirtClient) -> Template:
    """Check DataVolume status for clone-source disks and set template readiness."""
    clone_disks = [
        d for d in template.disks if d.source_type == "datavolume_clone" and d.clone_source
    ]
    if not clone_disks:
        return template

    worst_status = "Ready"
    messages: list[str] = []

    for disk in clone_disks:
        # Look up the image to find its storage namespace
        ns = disk.clone_namespace
        if not ns:
            img_raw = kv.get_image(disk.clone_source)
            if img_raw:
                ns = img_raw.get("spec", {}).get("storage", {}).get("namespace", "default")
            else:
                ns = "default"
        dv = kv.get_datavolume(ns, disk.clone_source)
        if dv is None:
            continue

        status = dv.get("status", {})
        phase = status.get("phase", "")
        progress = status.get("progress", "")

        if phase == "Failed":
            worst_status = "Failed"
            messages.append(f"Image {disk.clone_source} failed")
        elif phase == "Succeeded":
            pass  # Ready
        elif phase:
            if worst_status != "Failed":
                worst_status = "Importing"
            label = "Importing" if "InProgress" in phase else "Pending"
            detail = f" ({progress})" if progress and progress != "N/A" else ""
            messages.append(f"Image {disk.clone_source}: {label}{detail}")

    template.status = worst_status
    template.status_message = "; ".join(messages)
    return template


class TemplateService:
    def __init__(self, kv: KubeVirtClient):
        self.kv = kv

    def get_template(self, name: str) -> Template | None:
        raw = self.kv.get_template(name)
        if raw is None:
            return None
        tpl = _cr_to_template(raw)
        tpl.raw_manifest = raw
        _merge_disk_readiness(tpl, self.kv)
        return tpl

    def list_templates(self) -> list[Template]:
        templates = [_cr_to_template(item) for item in self.kv.list_templates()]
        for tpl in templates:
            _merge_disk_readiness(tpl, self.kv)
        return templates

    def preview_template(self, request: TemplateCreate) -> list[dict]:
        compute = request.compute.model_dump()
        disks = [d.model_dump() for d in request.disks]
        networks = [n.model_dump() for n in request.networks]
        body = {
            "apiVersion": "kubevmui.io/v1",
            "kind": "Template",
            "metadata": {"name": request.name},
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
                    {"name": n.get("name", ""), "networkCR": n.get("network_cr", "")}
                    for n in networks
                ],
                "cloudInit": {
                    "userData": request.cloud_init_user_data,
                    "networkData": request.cloud_init_network_data,
                },
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
                        "networkCR": n.get("network_cr", ""),
                    }
                    for n in networks
                ],
                "cloudInit": {
                    "userData": request.cloud_init_user_data,
                    "networkData": request.cloud_init_network_data,
                },
            },
        }
        raw = self.kv.create_template(body)
        return _cr_to_template(raw)

    def delete_template(self, name: str) -> None:
        self.kv.delete_template(name)

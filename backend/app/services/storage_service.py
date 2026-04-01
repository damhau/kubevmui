from datetime import UTC, datetime

from kubernetes import client

from app.models.disk import Disk, DiskCreate

TIER_ANNOTATION = "kubevmui.io/tier-label"


def _parse_size(size_str: str) -> int:
    """Parse Kubernetes storage size string to GiB integer."""
    if not size_str:
        return 0
    size_str = size_str.strip()
    if size_str.endswith("Ti"):
        return int(float(size_str[:-2]) * 1024)
    if size_str.endswith("Gi"):
        return int(float(size_str[:-2]))
    if size_str.endswith("Mi"):
        return max(1, int(float(size_str[:-2]) // 1024))
    if size_str.endswith("Ki"):
        return max(1, int(float(size_str[:-2]) // (1024 * 1024)))
    try:
        return int(size_str) // (1024**3)
    except ValueError:
        return 0


def _pvc_to_disk(pvc) -> Disk:
    """Convert a kubernetes PVC object to our Disk model."""
    metadata = pvc.metadata
    spec = pvc.spec
    status = pvc.status

    storage_class = spec.storage_class_name or ""
    access_modes = spec.access_modes or ["ReadWriteOnce"]
    volume_mode = spec.volume_mode or "Filesystem"

    size_str = ""
    if spec.resources and spec.resources.requests:
        size_str = spec.resources.requests.get("storage", "0Gi")

    phase = status.phase if status else "Pending"
    disk_status = "Available" if phase == "Bound" else phase or "Pending"

    created_at = None
    if metadata.creation_timestamp:
        ts = metadata.creation_timestamp
        if hasattr(ts, "isoformat"):
            created_at = ts.replace(tzinfo=UTC) if ts.tzinfo is None else ts
        else:
            try:
                created_at = datetime.fromisoformat(str(ts).replace("Z", "+00:00"))
            except ValueError:
                created_at = datetime.now(tz=UTC)

    labels = metadata.labels or {}
    annotations = metadata.annotations or {}
    performance_tier = labels.get(TIER_ANNOTATION, storage_class)

    attached_vm = labels.get("kubevmui.io/attached-vm")

    return Disk(
        name=metadata.name,
        namespace=metadata.namespace,
        created_at=created_at,
        labels=labels,
        annotations=annotations,
        size_gb=_parse_size(size_str),
        performance_tier=performance_tier,
        storage_class=storage_class,
        access_mode=access_modes[0] if access_modes else "ReadWriteOnce",
        volume_mode=volume_mode,
        status=disk_status,
        attached_vm=attached_vm,
        is_image=labels.get("kubevmui.io/type") == "image",
    )


def _find_attached_vm(custom_api, namespace: str, pvc_name: str) -> str | None:
    """Find which VM references this PVC via dataVolume or persistentVolumeClaim."""
    try:
        result = custom_api.list_namespaced_custom_object(
            group="kubevirt.io",
            version="v1",
            namespace=namespace,
            plural="virtualmachines",
        )
        for vm in result.get("items", []):
            volumes = vm.get("spec", {}).get("template", {}).get("spec", {}).get("volumes", [])
            for vol in volumes:
                dv = vol.get("dataVolume", {})
                pvc = vol.get("persistentVolumeClaim", {})
                if dv.get("name") == pvc_name or pvc.get("claimName") == pvc_name:
                    return vm.get("metadata", {}).get("name")
    except Exception:
        pass
    return None


class StorageService:
    def __init__(self, api_client: client.ApiClient):
        self.core_api = client.CoreV1Api(api_client)
        self.storage_api = client.StorageV1Api(api_client)
        self.custom_api = client.CustomObjectsApi(api_client)

    def _get_storage_class_tier(self, sc_name: str) -> str:
        """Fetch performance tier from StorageClass annotations."""
        try:
            sc = self.storage_api.read_storage_class(sc_name)
            annotations = sc.metadata.annotations or {}
            return annotations.get(TIER_ANNOTATION, sc_name)
        except Exception:
            return sc_name

    def _merge_dv_status(self, disk: Disk) -> None:
        """Merge DataVolume phase/progress into a Disk when available."""
        try:
            dv = self.custom_api.get_namespaced_custom_object(
                group="cdi.kubevirt.io",
                version="v1beta1",
                namespace=disk.namespace,
                plural="datavolumes",
                name=disk.name,
            )
            status = dv.get("status", {})
            disk.dv_phase = status.get("phase", "")
            disk.dv_progress = status.get("progress", "")
        except Exception:
            pass

    def get_disk(self, namespace: str, name: str) -> Disk | None:
        try:
            pvc = self.core_api.read_namespaced_persistent_volume_claim(name, namespace)
            disk = _pvc_to_disk(pvc)
            if disk.storage_class and disk.performance_tier == disk.storage_class:
                disk.performance_tier = self._get_storage_class_tier(disk.storage_class)
            disk.attached_vm = _find_attached_vm(self.custom_api, namespace, name)
            self._merge_dv_status(disk)
            disk.raw_manifest = self.core_api.api_client.sanitize_for_serialization(pvc)
            return disk
        except client.ApiException as e:
            if e.status == 404:
                return None
            raise

    def list_disks(self, namespace: str) -> list[Disk]:
        result = self.core_api.list_namespaced_persistent_volume_claim(namespace)
        # Build VM→PVC mapping once for the whole namespace
        vm_pvc_map: dict[str, str] = {}
        try:
            vms = self.custom_api.list_namespaced_custom_object(
                group="kubevirt.io",
                version="v1",
                namespace=namespace,
                plural="virtualmachines",
            )
            for vm in vms.get("items", []):
                vm_name = vm.get("metadata", {}).get("name", "")
                volumes = vm.get("spec", {}).get("template", {}).get("spec", {}).get("volumes", [])
                for vol in volumes:
                    dv_name = vol.get("dataVolume", {}).get("name")
                    pvc_name = vol.get("persistentVolumeClaim", {}).get("claimName")
                    if dv_name:
                        vm_pvc_map[dv_name] = vm_name
                    if pvc_name:
                        vm_pvc_map[pvc_name] = vm_name
        except Exception:
            pass
        # Build DV status map for progress tracking
        dv_status_map: dict[str, dict] = {}
        try:
            dvs = self.custom_api.list_namespaced_custom_object(
                group="cdi.kubevirt.io",
                version="v1beta1",
                namespace=namespace,
                plural="datavolumes",
            )
            for dv in dvs.get("items", []):
                dv_name = dv.get("metadata", {}).get("name", "")
                dv_status_map[dv_name] = dv.get("status", {})
        except Exception:
            pass
        disks = []
        for pvc in result.items:
            labels = pvc.metadata.labels or {}
            name = pvc.metadata.name
            # Only show VM-related PVCs: CDI-managed, kubevmui images, or referenced by a VM
            is_cdi = labels.get("app.kubernetes.io/managed-by") == "cdi-controller"
            is_image = labels.get("kubevmui.io/type") == "image"
            is_vm_disk = name in vm_pvc_map
            if not (is_cdi or is_image or is_vm_disk):
                continue
            disk = _pvc_to_disk(pvc)
            if disk.storage_class and disk.performance_tier == disk.storage_class:
                disk.performance_tier = self._get_storage_class_tier(disk.storage_class)
            disk.attached_vm = vm_pvc_map.get(disk.name)
            if name in dv_status_map:
                disk.dv_phase = dv_status_map[name].get("phase", "")
                disk.dv_progress = dv_status_map[name].get("progress", "")
            disks.append(disk)
        return disks

    def preview_disk(self, request: DiskCreate) -> list[dict]:
        try:
            sc_name = self._resolve_storage_class(request.performance_tier)
        except Exception:
            sc_name = request.performance_tier
        labels = {**request.labels, TIER_ANNOTATION: request.performance_tier}
        body = {
            "apiVersion": "v1",
            "kind": "PersistentVolumeClaim",
            "metadata": {
                "name": request.name,
                "namespace": request.namespace,
                "labels": labels,
            },
            "spec": {
                "accessModes": ["ReadWriteOnce"],
                "storageClassName": sc_name,
                "resources": {"requests": {"storage": f"{request.size_gb}Gi"}},
            },
        }
        return [body]

    def create_disk(self, request: DiskCreate) -> Disk:
        sc_name = self._resolve_storage_class(request.performance_tier)
        labels = {**request.labels, TIER_ANNOTATION: request.performance_tier}

        pvc = client.V1PersistentVolumeClaim(
            api_version="v1",
            kind="PersistentVolumeClaim",
            metadata=client.V1ObjectMeta(
                name=request.name,
                namespace=request.namespace,
                labels=labels,
            ),
            spec=client.V1PersistentVolumeClaimSpec(
                access_modes=["ReadWriteOnce"],
                storage_class_name=sc_name,
                resources=client.V1VolumeResourceRequirements(
                    requests={"storage": f"{request.size_gb}Gi"},
                ),
            ),
        )
        created = self.core_api.create_namespaced_persistent_volume_claim(
            request.namespace,
            pvc,
        )
        return _pvc_to_disk(created)

    def _resolve_storage_class(self, performance_tier: str) -> str:
        """Try to find a StorageClass matching the performance tier annotation."""
        try:
            sc_list = self.storage_api.list_storage_class()
            for sc in sc_list.items:
                annotations = sc.metadata.annotations or {}
                if annotations.get(TIER_ANNOTATION) == performance_tier:
                    return sc.metadata.name
        except Exception:
            pass
        return performance_tier

    def resize_disk(self, namespace: str, name: str, new_size_gb: int) -> Disk | None:
        """Resize a PVC to the new size. Only expansion is allowed."""
        try:
            self.core_api.read_namespaced_persistent_volume_claim(name, namespace)
        except client.ApiException as e:
            if e.status == 404:
                return None
            raise

        # Patch the PVC with new size
        body = {"spec": {"resources": {"requests": {"storage": f"{new_size_gb}Gi"}}}}
        patched = self.core_api.patch_namespaced_persistent_volume_claim(name, namespace, body)
        disk = _pvc_to_disk(patched)
        if disk.storage_class and disk.performance_tier == disk.storage_class:
            disk.performance_tier = self._get_storage_class_tier(disk.storage_class)
        disk.attached_vm = _find_attached_vm(self.custom_api, namespace, name)
        return disk

    def delete_disk(self, namespace: str, name: str) -> None:
        self.core_api.delete_namespaced_persistent_volume_claim(name, namespace)

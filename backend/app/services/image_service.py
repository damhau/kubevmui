import contextlib
import logging
from datetime import UTC, datetime

from kubernetes.client import ApiException

from app.core.k8s_client import KubeVirtClient
from app.models.image import Image, ImageCreate
from app.services import cdi_upload

logger = logging.getLogger(__name__)

LABEL_MANAGED_BY = "app.kubernetes.io/managed-by"
LABEL_ISO_SOURCE = "images.kubevmui.io/source"
LABEL_ISO_SOURCE_NS = "images.kubevmui.io/source-namespace"
LABEL_ISO_TYPE = "images.kubevmui.io/type"


def _image_from_raw(raw: dict) -> Image:
    metadata = raw.get("metadata", {})
    spec = raw.get("spec", {})
    source = spec.get("source", {})
    storage = spec.get("storage", {})
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
    return Image(
        name=metadata.get("name", ""),
        display_name=spec.get("displayName", metadata.get("name", "")),
        description=spec.get("description", ""),
        os_type=spec.get("osType", ""),
        media_type=spec.get("mediaType", "disk"),
        source_type=source.get("type", ""),
        source_url=source.get("url", ""),
        size_gb=int(storage.get("sizeGb", 20)),
        storage_class=storage.get("storageClass", ""),
        storage_namespace=storage.get("namespace", "default"),
        created_at=created_at,
    )


def _merge_dv_status(image: Image, kv: KubeVirtClient) -> Image:
    """Merge live DataVolume or PVC status into an Image object."""
    if image.source_type == "container_disk":
        return image

    dv = kv.get_datavolume(image.storage_namespace, image.name)
    if dv is None:
        return image
    status = dv.get("status", {})
    image.dv_phase = status.get("phase", "")
    image.dv_progress = status.get("progress", "")
    return image


class ImageService:
    def __init__(self, kv: KubeVirtClient):
        self.kv = kv

    def list_images(self) -> list[Image]:
        images = [_image_from_raw(i) for i in self.kv.list_images()]
        for img in images:
            _merge_dv_status(img, self.kv)
        return images

    def get_image(self, name: str) -> Image | None:
        raw = self.kv.get_image(name)
        if raw is None:
            return None
        img = _image_from_raw(raw)
        img.raw_manifest = raw
        dv = self.kv.get_datavolume(img.storage_namespace, img.name)
        if dv:
            status = dv.get("status", {})
            img.dv_phase = status.get("phase", "")
            img.dv_progress = status.get("progress", "")
            img.raw_dv_manifest = dv
        return img

    def preview_image(self, request: ImageCreate) -> list[dict]:
        storage_ns = request.storage_namespace
        body = {
            "apiVersion": "kubevmui.io/v1",
            "kind": "Image",
            "metadata": {"name": request.name},
            "spec": {
                "displayName": request.display_name,
                "description": request.description,
                "osType": request.os_type,
                "mediaType": request.media_type,
                "source": {"type": request.source_type, "url": request.source_url},
                "storage": {
                    "namespace": storage_ns,
                    "sizeGb": request.size_gb,
                    "storageClass": request.storage_class,
                },
            },
        }
        manifests = [body]
        if request.source_type in ("registry", "http", "upload"):
            if request.source_type == "registry":
                source_spec = {"registry": {"url": request.source_url}}
            elif request.source_type == "upload":
                source_spec = {"upload": {}}
            else:
                source_spec = {"http": {"url": request.source_url}}
            pvc_spec: dict = {
                "accessModes": ["ReadWriteOnce"],
                "resources": {"requests": {"storage": f"{request.size_gb}Gi"}},
            }
            if request.storage_class:
                pvc_spec["storageClassName"] = request.storage_class
            dv_manifest = {
                "apiVersion": "cdi.kubevirt.io/v1beta1",
                "kind": "DataVolume",
                "metadata": {
                    "name": request.name,
                    "namespace": storage_ns,
                    "labels": {"kubevmui.io/type": "image"},
                },
                "spec": {"source": source_spec, "pvc": pvc_spec},
            }
            manifests.append(dv_manifest)
        return manifests

    def create_image(self, request: ImageCreate) -> Image:
        storage_ns = request.storage_namespace
        body = {
            "apiVersion": "kubevmui.io/v1",
            "kind": "Image",
            "metadata": {"name": request.name},
            "spec": {
                "displayName": request.display_name,
                "description": request.description,
                "osType": request.os_type,
                "mediaType": request.media_type,
                "source": {
                    "type": "pvc" if request.source_type == "pvc_clone" else request.source_type,
                    "url": request.source_url,
                },
                "storage": {
                    "namespace": storage_ns,
                    "sizeGb": request.size_gb,
                    "storageClass": request.storage_class,
                },
            },
        }
        raw = self.kv.create_image(body)

        # Create backing storage for the image
        if request.source_type == "upload":
            pvc_spec: dict = {
                "accessModes": ["ReadWriteOnce"],
                "resources": {"requests": {"storage": f"{request.size_gb}Gi"}},
            }
            if request.storage_class:
                pvc_spec["storageClassName"] = request.storage_class

            dv_manifest = {
                "apiVersion": "cdi.kubevirt.io/v1beta1",
                "kind": "DataVolume",
                "metadata": {
                    "name": request.name,
                    "namespace": storage_ns,
                    "labels": {"kubevmui.io/type": "image"},
                },
                "spec": {
                    "source": {"upload": {}},
                    "pvc": pvc_spec,
                },
            }
            self.kv.create_datavolume(storage_ns, dv_manifest)

        elif request.source_type in ("registry", "http"):
            if request.source_type == "registry":
                source_spec = {"registry": {"url": request.source_url}}
            else:
                source_spec = {"http": {"url": request.source_url}}

            pvc_spec: dict = {
                "accessModes": ["ReadWriteOnce"],
                "resources": {"requests": {"storage": f"{request.size_gb}Gi"}},
            }
            if request.storage_class:
                pvc_spec["storageClassName"] = request.storage_class

            dv_manifest = {
                "apiVersion": "cdi.kubevirt.io/v1beta1",
                "kind": "DataVolume",
                "metadata": {
                    "name": request.name,
                    "namespace": storage_ns,
                    "labels": {"kubevmui.io/type": "image"},
                },
                "spec": {
                    "source": source_spec,
                    "pvc": pvc_spec,
                },
            }
            self.kv.create_datavolume(storage_ns, dv_manifest)

        elif request.source_type == "pvc_clone":
            pvc_spec: dict = {
                "accessModes": ["ReadWriteOnce"],
                "resources": {"requests": {"storage": f"{request.size_gb}Gi"}},
            }
            if request.storage_class:
                pvc_spec["storageClassName"] = request.storage_class

            dv_manifest = {
                "apiVersion": "cdi.kubevirt.io/v1beta1",
                "kind": "DataVolume",
                "metadata": {
                    "name": request.name,
                    "namespace": storage_ns,
                    "labels": {"kubevmui.io/type": "image"},
                },
                "spec": {
                    "source": {
                        "pvc": {
                            "name": request.source_pvc_name,
                            "namespace": request.source_pvc_namespace or storage_ns,
                        },
                    },
                    "pvc": pvc_spec,
                },
            }
            self.kv.create_datavolume(storage_ns, dv_manifest)

        img = _image_from_raw(raw)
        _merge_dv_status(img, self.kv)
        return img

    def upload_image_stream(
        self, storage_namespace: str, name: str, file_stream, content_length: int = 0
    ) -> None:
        """Stream file data to CDI upload proxy via the shared helper."""
        logger.info(
            "upload_image_stream: starting upload for %s (storage_ns=%s, size=%d)",
            name,
            storage_namespace,
            content_length,
        )
        cdi_upload.upload_stream(self.kv, storage_namespace, name, file_stream, content_length)
        logger.info("upload_image_stream: upload completed for %s", name)

    def delete_image(self, name: str) -> None:
        # Look up the image first to find its storage namespace
        raw = self.kv.get_image(name)
        storage_ns = "default"
        if raw:
            storage_ns = raw.get("spec", {}).get("storage", {}).get("namespace", "default")
        self.kv.delete_image(name)
        try:
            self.kv.delete_datavolume(storage_ns, name)
        except ApiException as exc:
            if exc.status != 404:
                raise
        try:
            self.kv.delete_pvc(storage_ns, name)
        except ApiException as exc:
            if exc.status != 404:
                raise

    # ── ISO PVC ensure / cleanup (mirrors network_cr_service.ensure_nad) ──

    def ensure_iso_pvc(self, namespace: str, image_name: str) -> str | None:
        """Ensure an ISO PVC exists in the target namespace for the given Image.

        If the image is a container_disk, returns None (no PVC needed).
        If the source PVC is already in the target namespace, returns its name.
        Otherwise clones the PVC via CDI DataVolume and returns the clone name.
        """
        raw = self.kv.get_image(image_name)
        if raw is None:
            raise ValueError(f"Image '{image_name}' not found")

        spec = raw.get("spec", {})
        source_type = spec.get("source", {}).get("type", "")
        if source_type == "container_disk":
            return None

        source_ns = spec.get("storage", {}).get("namespace", "default")

        # Source PVC is already in target namespace — use directly
        if source_ns == namespace:
            return image_name

        # Check if a clone already exists in target namespace
        label_selector = f"{LABEL_ISO_SOURCE}={image_name},{LABEL_ISO_TYPE}=iso-clone"
        existing = self.kv.list_pvcs_by_label(namespace, label_selector)
        if existing:
            return existing[0].metadata.name

        # Clone via CDI DataVolume
        size_gb = spec.get("storage", {}).get("sizeGb", 2)
        storage_class = spec.get("storage", {}).get("storageClass", "") or None
        dv_body: dict = {
            "apiVersion": "cdi.kubevirt.io/v1beta1",
            "kind": "DataVolume",
            "metadata": {
                "name": image_name,
                "namespace": namespace,
                "labels": {
                    LABEL_MANAGED_BY: "kubevmui",
                    LABEL_ISO_SOURCE: image_name,
                    LABEL_ISO_SOURCE_NS: source_ns,
                    LABEL_ISO_TYPE: "iso-clone",
                },
            },
            "spec": {
                "source": {
                    "pvc": {"name": image_name, "namespace": source_ns},
                },
                "pvc": {
                    "accessModes": ["ReadWriteOnce"],
                    "resources": {"requests": {"storage": f"{size_gb}Gi"}},
                },
            },
        }
        if storage_class:
            dv_body["spec"]["pvc"]["storageClassName"] = storage_class
        self.kv.create_datavolume(namespace, dv_body)
        logger.info("Cloned ISO PVC %s from %s to %s", image_name, source_ns, namespace)
        return image_name

    def cleanup_iso_pvc(self, namespace: str, pvc_name: str) -> None:
        """Delete an ISO clone PVC if no VM in the namespace still references it."""
        pvc = self.kv.get_pvc(namespace, pvc_name)
        if pvc is None:
            return
        labels = pvc.metadata.labels or {}
        if labels.get(LABEL_ISO_TYPE) != "iso-clone":
            return  # Not a managed ISO clone — leave it alone

        # Check if any VM still references this PVC
        for vm in self.kv.list_vms(namespace):
            spec = vm.get("spec", {}).get("template", {}).get("spec", {})
            for vol in spec.get("volumes", []):
                if vol.get("persistentVolumeClaim", {}).get("claimName") == pvc_name:
                    return  # Still in use
                if vol.get("dataVolume", {}).get("name") == pvc_name:
                    return  # Still in use

        # Orphaned — delete
        try:
            self.kv.delete_pvc(namespace, pvc_name)
            logger.info("Cleaned up orphaned ISO clone PVC %s/%s", namespace, pvc_name)
        except ApiException as exc:
            if exc.status != 404:
                logger.warning("Failed to delete ISO clone PVC %s/%s: %s", namespace, pvc_name, exc)
        with contextlib.suppress(ApiException):
            self.kv.delete_datavolume(namespace, pvc_name)

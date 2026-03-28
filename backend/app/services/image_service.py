from datetime import UTC, datetime

from kubernetes.client import ApiException

from app.core.k8s_client import KubeVirtClient
from app.models.image import Image, ImageCreate


def _image_from_raw(raw: dict) -> Image:
    metadata = raw.get("metadata", {})
    data = raw.get("data", {})
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
        namespace=metadata.get("namespace", ""),
        display_name=data.get("display_name", metadata.get("name", "")),
        description=data.get("description", ""),
        os_type=data.get("os_type", ""),
        source_type=data.get("source_type", ""),
        source_url=data.get("source_url", ""),
        size_gb=int(data.get("size_gb", 20)),
        storage_class=data.get("storage_class", ""),
        created_at=created_at,
    )


def _merge_dv_status(image: Image, kv: KubeVirtClient) -> Image:
    """Merge live DataVolume status into an Image object."""
    if image.source_type == "container_disk":
        return image
    dv = kv.get_datavolume(image.namespace, image.name)
    if dv is None:
        return image
    status = dv.get("status", {})
    image.dv_phase = status.get("phase", "")
    image.dv_progress = status.get("progress", "")
    return image


class ImageService:
    def __init__(self, kv: KubeVirtClient):
        self.kv = kv

    def list_images(self, namespace: str) -> list[Image]:
        images = [_image_from_raw(i) for i in self.kv.list_images(namespace)]
        for img in images:
            _merge_dv_status(img, self.kv)
        return images

    def get_image(self, namespace: str, name: str) -> Image | None:
        raw = self.kv.get_image(namespace, name)
        if raw is None:
            return None
        img = _image_from_raw(raw)
        _merge_dv_status(img, self.kv)
        return img

    def create_image(self, namespace: str, request: ImageCreate) -> Image:
        data = {
            "display_name": request.display_name,
            "description": request.description,
            "os_type": request.os_type,
            "source_type": request.source_type,
            "source_url": request.source_url,
            "size_gb": str(request.size_gb),
            "storage_class": request.storage_class,
        }
        raw = self.kv.create_image(namespace, request.name, data)

        # Create a DataVolume for registry / http sources
        if request.source_type in ("registry", "http"):
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
                    "namespace": namespace,
                    "labels": {"kubevmui.io/type": "image"},
                },
                "spec": {
                    "source": source_spec,
                    "pvc": pvc_spec,
                },
            }
            self.kv.create_datavolume(namespace, dv_manifest)

        img = _image_from_raw(raw)
        _merge_dv_status(img, self.kv)
        return img

    def delete_image(self, namespace: str, name: str) -> None:
        self.kv.delete_image(namespace, name)
        try:
            self.kv.delete_datavolume(namespace, name)
        except ApiException as exc:
            if exc.status != 404:
                raise

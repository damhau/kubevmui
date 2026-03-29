from datetime import UTC, datetime

from kubernetes.client import ApiException

from app.core.k8s_client import KubeVirtClient
from app.models.image import Image, ImageCreate


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
        namespace=metadata.get("namespace", ""),
        display_name=spec.get("displayName", metadata.get("name", "")),
        description=spec.get("description", ""),
        os_type=spec.get("osType", ""),
        source_type=source.get("type", ""),
        source_url=source.get("url", ""),
        size_gb=int(storage.get("sizeGb", 20)),
        storage_class=storage.get("storageClass", ""),
        is_global=spec.get("global", False),
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
        # Merge global images from other namespaces
        seen = {img.name for img in images}
        for ns in self.kv.list_namespaces():
            if ns == namespace:
                continue
            try:
                for raw in self.kv.list_images(ns):
                    spec = raw.get("spec", {})
                    if spec.get("global", False):
                        img = _image_from_raw(raw)
                        if img.name not in seen:
                            images.append(img)
                            seen.add(img.name)
            except Exception:
                continue
        for img in images:
            _merge_dv_status(img, self.kv)
        return images

    def get_image(self, namespace: str, name: str) -> Image | None:
        raw = self.kv.get_image(namespace, name)
        if raw is None:
            return None
        img = _image_from_raw(raw)
        img.raw_manifest = raw
        dv = self.kv.get_datavolume(img.namespace, img.name)
        if dv:
            status = dv.get("status", {})
            img.dv_phase = status.get("phase", "")
            img.dv_progress = status.get("progress", "")
            img.raw_dv_manifest = dv
        return img

    def create_image(self, namespace: str, request: ImageCreate) -> Image:
        body = {
            "apiVersion": "kubevmui.io/v1",
            "kind": "Image",
            "metadata": {"name": request.name, "namespace": namespace},
            "spec": {
                "displayName": request.display_name,
                "description": request.description,
                "global": request.is_global,
                "osType": request.os_type,
                "source": {
                    "type": request.source_type,
                    "url": request.source_url,
                },
                "storage": {
                    "sizeGb": request.size_gb,
                    "storageClass": request.storage_class,
                },
            },
        }
        raw = self.kv.create_image(namespace, body)

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

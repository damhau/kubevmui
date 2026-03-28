from datetime import UTC, datetime

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
        created_at=created_at,
    )


class ImageService:
    def __init__(self, kv: KubeVirtClient):
        self.kv = kv

    def list_images(self, namespace: str) -> list[Image]:
        return [_image_from_raw(i) for i in self.kv.list_images(namespace)]

    def create_image(self, namespace: str, request: ImageCreate) -> Image:
        data = {
            "display_name": request.display_name,
            "description": request.description,
            "os_type": request.os_type,
            "source_type": request.source_type,
            "source_url": request.source_url,
        }
        raw = self.kv.create_image(namespace, request.name, data)
        return _image_from_raw(raw)

    def delete_image(self, namespace: str, name: str) -> None:
        self.kv.delete_image(namespace, name)

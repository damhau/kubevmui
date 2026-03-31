import contextlib
import logging
from datetime import UTC, datetime

from kubernetes.client import ApiException

from app.core.k8s_client import KubeVirtClient
from app.models.image import Image, ImageCreate

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
        namespace=metadata.get("namespace", ""),
        display_name=spec.get("displayName", metadata.get("name", "")),
        description=spec.get("description", ""),
        os_type=spec.get("osType", ""),
        media_type=spec.get("mediaType", "disk"),
        source_type=source.get("type", ""),
        source_url=source.get("url", ""),
        size_gb=int(storage.get("sizeGb", 20)),
        storage_class=storage.get("storageClass", ""),
        is_global=spec.get("global", False),
        created_at=created_at,
    )


def _merge_dv_status(image: Image, kv: KubeVirtClient) -> Image:
    """Merge live DataVolume or PVC status into an Image object."""
    if image.source_type == "container_disk":
        return image

    # For upload images: check PVC status directly (no DataVolume)
    if image.source_type == "upload":
        try:
            pvc = kv.core_api.read_namespaced_persistent_volume_claim(image.name, image.namespace)
            phase = pvc.status.phase if pvc.status else "Pending"
            if phase == "Bound":
                image.dv_phase = "Succeeded"
                image.dv_progress = "100%"
            else:
                image.dv_phase = phase
        except Exception:
            pass
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

    def preview_image(self, namespace: str, request: ImageCreate) -> list[dict]:
        body = {
            "apiVersion": "kubevmui.io/v1",
            "kind": "Image",
            "metadata": {"name": request.name, "namespace": namespace},
            "spec": {
                "displayName": request.display_name,
                "description": request.description,
                "global": request.is_global,
                "osType": request.os_type,
                "mediaType": request.media_type,
                "source": {"type": request.source_type, "url": request.source_url},
                "storage": {"sizeGb": request.size_gb, "storageClass": request.storage_class},
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
                    "namespace": namespace,
                    "labels": {"kubevmui.io/type": "image"},
                },
                "spec": {"source": source_spec, "pvc": pvc_spec},
            }
            manifests.append(dv_manifest)
        return manifests

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
                "mediaType": request.media_type,
                "source": {
                    "type": "pvc" if request.source_type == "pvc_clone" else request.source_type,
                    "url": request.source_url,
                },
                "storage": {
                    "sizeGb": request.size_gb,
                    "storageClass": request.storage_class,
                },
            },
        }
        raw = self.kv.create_image(namespace, body)

        # Create backing storage for the image
        if request.source_type == "upload":
            # ISO/upload: create a plain PVC (like virtctl image-upload does)
            # CDI upload proxy writes raw bytes directly — no conversion
            from kubernetes import client as k8s_client

            pvc = k8s_client.V1PersistentVolumeClaim(
                api_version="v1",
                kind="PersistentVolumeClaim",
                metadata=k8s_client.V1ObjectMeta(
                    name=request.name,
                    namespace=namespace,
                    labels={"kubevmui.io/type": "image"},
                    annotations={
                        "cdi.kubevirt.io/storage.upload.target": "",
                    },
                ),
                spec=k8s_client.V1PersistentVolumeClaimSpec(
                    access_modes=["ReadWriteOnce"],
                    storage_class_name=request.storage_class or None,
                    resources=k8s_client.V1VolumeResourceRequirements(
                        requests={"storage": f"{request.size_gb}Gi"},
                    ),
                ),
            )
            self.kv.core_api.create_namespaced_persistent_volume_claim(namespace, pvc)

        elif request.source_type in ("registry", "http"):
            # Disk images: create DataVolume (CDI imports and converts)
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

        elif request.source_type == "pvc_clone":
            # Clone from an existing PVC via CDI DataVolume
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
                    "source": {
                        "pvc": {
                            "name": request.source_pvc_name,
                            "namespace": request.source_pvc_namespace or namespace,
                        },
                    },
                    "pvc": pvc_spec,
                },
            }
            self.kv.create_datavolume(namespace, dv_manifest)

        img = _image_from_raw(raw)
        _merge_dv_status(img, self.kv)
        return img

    def upload_image_stream(self, namespace: str, name: str, file_stream) -> None:
        """Stream file data to CDI upload proxy via kubectl port-forward."""
        import subprocess
        import time

        import requests

        dv_name = name

        # Create upload token
        token_body = {
            "apiVersion": "upload.cdi.kubevirt.io/v1beta1",
            "kind": "UploadTokenRequest",
            "metadata": {"name": dv_name, "namespace": namespace},
            "spec": {"pvcName": dv_name},
        }
        token_result = self.kv.custom_api.create_namespaced_custom_object(
            group="upload.cdi.kubevirt.io",
            version="v1beta1",
            namespace=namespace,
            plural="uploadtokenrequests",
            body=token_body,
        )
        token = token_result.get("status", {}).get("token", "")
        if not token:
            raise RuntimeError("Failed to get CDI upload token")

        # Start port-forward to CDI upload proxy
        from app.core.config import settings

        kubeconfig_args = []
        if settings.kubeconfig_path:
            kubeconfig_args = ["--kubeconfig", settings.kubeconfig_path]

        port_forward = subprocess.Popen(
            [
                "kubectl",
                *kubeconfig_args,
                "port-forward",
                "-n",
                "cdi",
                "svc/cdi-uploadproxy",
                "0:443",
            ],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )

        # Wait for port-forward to be ready and parse the local port
        local_port = None
        for _ in range(30):
            line = port_forward.stdout.readline().decode()
            if "Forwarding from" in line:
                # e.g. "Forwarding from 127.0.0.1:12345 -> 443"
                local_port = line.split(":")[1].split(" ")[0]
                break
            time.sleep(0.2)

        if not local_port:
            port_forward.kill()
            raise RuntimeError("Failed to start port-forward to CDI upload proxy")

        try:
            # Upload directly to CDI via port-forward (no K8s API proxy)
            upload_url = f"https://127.0.0.1:{local_port}/v1beta1/upload"
            response = requests.post(
                upload_url,
                data=file_stream,
                headers={
                    "Authorization": f"Bearer {token}",
                    "Content-Type": "application/octet-stream",
                },
                verify=False,
            )
            if response.status_code >= 400:
                raise RuntimeError(
                    f"CDI upload failed ({response.status_code}): {response.text[:500]}"
                )
        finally:
            port_forward.kill()
            port_forward.wait()

    def delete_image(self, namespace: str, name: str) -> None:
        self.kv.delete_image(namespace, name)
        try:
            self.kv.delete_datavolume(namespace, name)
        except ApiException as exc:
            if exc.status != 404:
                raise

    # ── ISO PVC ensure / cleanup (mirrors network_cr_service.ensure_nad) ──

    def _find_image(self, image_name: str) -> dict | None:
        """Find an Image CR by name across all namespaces."""
        for ns in self.kv.list_namespaces():
            img = self.kv.get_image(ns, image_name)
            if img:
                return img
        return None

    def ensure_iso_pvc(self, namespace: str, image_name: str) -> str | None:
        """Ensure an ISO PVC exists in the target namespace for the given Image.

        If the image is a container_disk, returns None (no PVC needed).
        If the source PVC is already in the target namespace, returns its name.
        Otherwise clones the PVC via CDI DataVolume and returns the clone name.
        """
        raw = self._find_image(image_name)
        if raw is None:
            raise ValueError(f"Image '{image_name}' not found")

        spec = raw.get("spec", {})
        source_type = spec.get("source", {}).get("type", "")
        if source_type == "container_disk":
            return None

        source_ns = raw.get("metadata", {}).get("namespace", "")

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

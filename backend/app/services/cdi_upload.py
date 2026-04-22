"""Shared helpers for uploading qcow2 images to CDI's upload proxy.

Extracted from ``image_service.py`` so both the Images registry and the VM
import pipeline use the same code path.
"""

from __future__ import annotations

import logging
import time
from pathlib import Path
from typing import IO

import httpx

from app.core.config import settings
from app.core.k8s_client import KubeVirtClient

logger = logging.getLogger(__name__)


def get_upload_proxy_url(kv: KubeVirtClient) -> str:
    """Discover the CDI upload proxy URL from the CDIConfig resource (like virtctl)."""

    cdi_config = kv.custom_api.get_cluster_custom_object(
        group="cdi.kubevirt.io",
        version="v1beta1",
        plural="cdiconfigs",
        name="config",
    )
    override = (cdi_config.get("spec", {}).get("uploadProxyURLOverride") or "").strip()
    if override:
        return override
    status_url = (cdi_config.get("status", {}).get("uploadProxyURL") or "").strip()
    if status_url:
        return status_url
    raise RuntimeError(
        f"CDI upload proxy URL not configured. "
        f"Set spec.uploadProxyURLOverride on CDIConfig in namespace '{settings.cdi_namespace}'."
    )


def request_upload_token(kv: KubeVirtClient, namespace: str, pvc_name: str) -> str:
    """Create an UploadTokenRequest and return the bearer token."""

    token_body = {
        "apiVersion": "upload.cdi.kubevirt.io/v1beta1",
        "kind": "UploadTokenRequest",
        "metadata": {"name": pvc_name, "namespace": namespace},
        "spec": {"pvcName": pvc_name},
    }
    result = kv.custom_api.create_namespaced_custom_object(
        group="upload.cdi.kubevirt.io",
        version="v1beta1",
        namespace=namespace,
        plural="uploadtokenrequests",
        body=token_body,
    )
    token = result.get("status", {}).get("token", "")
    if not token:
        raise RuntimeError("Failed to get CDI upload token")
    return token


def upload_stream(
    kv: KubeVirtClient,
    namespace: str,
    pvc_name: str,
    stream: IO[bytes],
    content_length: int = 0,
) -> None:
    """Stream bytes from ``stream`` to the CDI upload proxy for ``pvc_name``.

    Retries the POST up to 12 times on 502/503 (CDI upload pod starting up).
    """

    token = request_upload_token(kv, namespace, pvc_name)
    proxy_url = get_upload_proxy_url(kv)
    upload_url = f"{proxy_url.rstrip('/')}/v1beta1/upload-async"
    logger.info(
        "cdi_upload: POST %s (namespace=%s, pvc=%s, size=%d)",
        upload_url,
        namespace,
        pvc_name,
        content_length,
    )

    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/octet-stream",
    }
    if content_length > 0:
        headers["Content-Length"] = str(content_length)

    timeout = httpx.Timeout(connect=30.0, read=3600.0, write=3600.0, pool=3600.0)
    max_retries = 12
    response: httpx.Response | None = None
    with httpx.Client(verify=False, timeout=timeout) as client:
        for attempt in range(max_retries):
            response = client.post(upload_url, content=stream, headers=headers)
            if response.status_code in (502, 503) and attempt < max_retries - 1:
                logger.warning(
                    "cdi_upload: attempt %d got %d (%s), retrying in 5s...",
                    attempt + 1,
                    response.status_code,
                    response.text[:100],
                )
                time.sleep(5)
                # Reset stream position if the wrapper supports it
                inner = getattr(stream, "_stream", None)
                progress = getattr(stream, "_progress", None)
                if inner is not None and hasattr(inner, "seek"):
                    inner.seek(0)
                    if progress is not None and hasattr(progress, "uploaded_bytes"):
                        progress.uploaded_bytes = 0
                continue
            break

    if response is None:
        raise RuntimeError("CDI upload: no response received")
    if response.status_code >= 400:
        raise RuntimeError(f"CDI upload failed ({response.status_code}): {response.text[:500]}")
    logger.info("cdi_upload: upload completed for %s/%s", namespace, pvc_name)


def upload_file(
    kv: KubeVirtClient,
    namespace: str,
    pvc_name: str,
    path: Path | str,
) -> None:
    """Upload a file on disk to CDI. Thin wrapper around ``upload_stream``."""

    p = Path(path)
    size = p.stat().st_size
    with p.open("rb") as f:
        upload_stream(kv, namespace, pvc_name, f, size)


def wait_for_dv_bound(
    kv: KubeVirtClient,
    namespace: str,
    name: str,
    timeout_s: int = 1800,
    poll_s: float = 2.0,
    progress_cb=None,
) -> dict:
    """Poll the DataVolume until its phase is Succeeded, ImportSucceeded, or UploadReady.

    Returns the final DV manifest. Raises on timeout or Failed phase.
    """

    deadline = time.monotonic() + timeout_s
    last_progress = ""
    while time.monotonic() < deadline:
        dv = kv.get_datavolume(namespace, name)
        if dv is not None:
            status = dv.get("status", {})
            phase = status.get("phase", "")
            progress = status.get("progress", "")
            if progress and progress != last_progress:
                last_progress = progress
                if progress_cb:
                    try:
                        progress_cb(progress)
                    except Exception:
                        logger.exception("progress_cb raised")
            if phase in ("Succeeded",):
                return dv
            if phase == "Failed":
                reason = status.get("conditions", [{}])
                raise RuntimeError(f"DataVolume {namespace}/{name} entered Failed phase: {reason}")
        time.sleep(poll_s)
    raise TimeoutError(f"Timed out waiting for DataVolume {namespace}/{name}")

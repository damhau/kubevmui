import asyncio
import logging

import websockets
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from starlette.websockets import WebSocketState

from app.core.cluster_manager import ClusterManager

logger = logging.getLogger(__name__)

router = APIRouter(tags=["websocket"])


def _get_cluster_manager(websocket: WebSocket) -> ClusterManager:
    return websocket.app.state.cluster_manager


def _build_upstream_url(api_client, namespace: str, vm: str) -> str:
    """Build the KubeVirt serial console subresource WebSocket URL."""
    config = api_client.configuration
    host = config.host.rstrip("/")
    host = host.replace("https://", "wss://").replace("http://", "ws://")
    return (
        f"{host}/apis/subresources.kubevirt.io/v1"
        f"/namespaces/{namespace}/virtualmachineinstances/{vm}/console"
    )


async def _relay_ws_to_client(upstream, client_ws: WebSocket, label: str):
    """Relay messages from upstream WS to client WebSocket."""
    try:
        while True:
            message = await upstream.recv()
            if client_ws.client_state != WebSocketState.CONNECTED:
                break
            if isinstance(message, bytes):
                await client_ws.send_bytes(message)
            else:
                await client_ws.send_text(message)
    except Exception as exc:
        logger.debug("Relay %s ended: %s", label, exc)


async def _relay_client_to_ws(client_ws: WebSocket, upstream, label: str):
    """Relay messages from client WebSocket to upstream WS."""
    try:
        while True:
            if client_ws.client_state != WebSocketState.CONNECTED:
                break
            data = await client_ws.receive()
            if "bytes" in data and data["bytes"] is not None:
                await upstream.send(data["bytes"])
            elif "text" in data and data["text"] is not None:
                await upstream.send(data["text"])
            else:
                break
    except WebSocketDisconnect:
        logger.debug("Client disconnected in relay %s", label)
    except Exception as exc:
        logger.debug("Relay %s ended: %s", label, exc)


@router.websocket("/ws/console/{cluster}/{namespace}/{vm}")
async def serial_proxy(websocket: WebSocket, cluster: str, namespace: str, vm: str):
    await websocket.accept()

    cm = _get_cluster_manager(websocket)
    api_client = cm.get_api_client(cluster)

    if api_client is None:
        await websocket.close(code=4404, reason=f"Cluster '{cluster}' not found")
        return

    upstream_url = _build_upstream_url(api_client, namespace, vm)
    config = api_client.configuration

    extra_headers = {}
    if config.api_key and "authorization" in config.api_key:
        extra_headers["Authorization"] = config.api_key["authorization"]
    elif config.api_key and "BearerToken" in config.api_key:
        extra_headers["Authorization"] = f"Bearer {config.api_key['BearerToken']}"

    ssl_context = None
    try:
        import ssl
        if config.ssl_ca_cert:
            ssl_context = ssl.create_default_context(cafile=config.ssl_ca_cert)
        elif not config.verify_ssl:
            ssl_context = ssl.create_default_context()
            ssl_context.check_hostname = False
            ssl_context.verify_mode = ssl.CERT_NONE
        if ssl_context and config.cert_file and config.key_file:
            ssl_context.load_cert_chain(certfile=config.cert_file, keyfile=config.key_file)
    except Exception:
        pass

    try:
        connect_kwargs: dict = {"additional_headers": extra_headers}
        if ssl_context is not None:
            connect_kwargs["ssl"] = ssl_context

        async with websockets.connect(upstream_url, **connect_kwargs) as upstream:
            await asyncio.gather(
                _relay_ws_to_client(upstream, websocket, "upstream->client"),
                _relay_client_to_ws(websocket, upstream, "client->upstream"),
                return_exceptions=True,
            )
    except WebSocketDisconnect:
        logger.debug("Serial client disconnected for %s/%s", namespace, vm)
    except Exception as exc:
        logger.warning("Serial proxy error for %s/%s: %s", namespace, vm, exc)
        if websocket.client_state == WebSocketState.CONNECTED:
            await websocket.close(code=1011, reason="Upstream connection failed")

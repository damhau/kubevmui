import json
import logging

from fastapi import Request
from fastapi.responses import JSONResponse
from kubernetes.client import ApiException

logger = logging.getLogger(__name__)


async def k8s_api_exception_handler(request: Request, exc: ApiException) -> JSONResponse:
    try:
        body = json.loads(exc.body)
        detail = body.get("message", exc.reason or str(exc))
    except (json.JSONDecodeError, TypeError):
        detail = exc.reason or str(exc)
    logger.warning("K8s API error %s: %s", exc.status, detail)
    return JSONResponse(status_code=exc.status, content={"detail": detail})


async def value_error_handler(request: Request, exc: ValueError) -> JSONResponse:
    return JSONResponse(status_code=400, content={"detail": str(exc)})

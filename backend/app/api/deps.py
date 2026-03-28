from fastapi import HTTPException, Request

from app.core.cluster_manager import ClusterManager
from app.models.auth import UserInfo


def get_cluster_manager(request: Request) -> ClusterManager:
    return request.app.state.cluster_manager


async def get_current_user(request: Request) -> UserInfo:
    token = None
    auth_header = request.headers.get("Authorization")
    if auth_header and auth_header.startswith("Bearer "):
        token = auth_header[7:]
    cookie_token = request.cookies.get("kubevmui_token")
    if not token and cookie_token:
        token = cookie_token
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    from app.auth.k8s_token import validate_k8s_token
    cm: ClusterManager = request.app.state.cluster_manager
    api_client = cm.get_api_client("local")
    user = await validate_k8s_token(token, api_client)
    if not user.authenticated:
        raise HTTPException(status_code=401, detail="Invalid token")
    return user

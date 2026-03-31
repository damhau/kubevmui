from fastapi import APIRouter, HTTPException, Request, Response

from app.auth.k8s_token import validate_k8s_token
from app.core.cluster_manager import ClusterManager
from app.models.auth import TokenLoginRequest, TokenLoginResponse

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])


@router.post("/login", response_model=TokenLoginResponse)
async def login(request: TokenLoginRequest, req: Request, response: Response):
    cm: ClusterManager = req.app.state.cluster_manager
    api_client = cm.get_api_client("local")
    user = await validate_k8s_token(request.token, api_client)
    if not user.authenticated:
        raise HTTPException(status_code=401, detail="Invalid token")
    response.set_cookie(
        key="kubevmui_token",
        value=request.token,
        httponly=True,
        samesite="strict",
        max_age=3600,
    )
    return TokenLoginResponse(username=user.username, groups=user.groups)


@router.post("/logout")
async def logout(response: Response):
    response.delete_cookie("kubevmui_token")
    return {"status": "ok"}

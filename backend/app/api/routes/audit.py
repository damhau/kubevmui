from fastapi import APIRouter, Depends, Query

from app.api.deps import get_current_user
from app.audit.models import AuditLog
from app.audit.service import AuditService
from app.models.auth import UserInfo

router = APIRouter(
    prefix="/api/v1",
    tags=["audit"],
)

_audit_service: AuditService | None = None


def get_audit_service() -> AuditService:
    global _audit_service
    if _audit_service is None:
        _audit_service = AuditService()
    return _audit_service


@router.get("/audit/events", response_model=AuditLog)
def list_audit_events(
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    resource_type: str | None = Query(None),
    action: str | None = Query(None),
    _user: UserInfo = Depends(get_current_user),
):
    svc = get_audit_service()
    items, total = svc.list_entries(limit, offset, resource_type, action)
    return AuditLog(items=items, total=total)

from collections import deque
from datetime import UTC, datetime

from app.audit.models import AuditEntry


class AuditService:
    """In-memory audit log using a ring buffer."""

    def __init__(self, max_entries: int = 5000):
        self._entries: deque[AuditEntry] = deque(maxlen=max_entries)

    def record(
        self,
        username: str,
        action: str,
        resource_type: str,
        resource_name: str,
        namespace: str,
        details: str = "",
    ) -> None:
        entry = AuditEntry(
            timestamp=datetime.now(tz=UTC).isoformat(),
            username=username,
            action=action,
            resource_type=resource_type,
            resource_name=resource_name,
            namespace=namespace,
            details=details,
        )
        self._entries.appendleft(entry)

    def list_entries(
        self,
        limit: int = 50,
        offset: int = 0,
        resource_type: str | None = None,
        action: str | None = None,
    ) -> tuple[list[AuditEntry], int]:
        filtered = list(self._entries)
        if resource_type:
            filtered = [e for e in filtered if e.resource_type == resource_type]
        if action:
            filtered = [e for e in filtered if e.action == action]
        total = len(filtered)
        return filtered[offset : offset + limit], total

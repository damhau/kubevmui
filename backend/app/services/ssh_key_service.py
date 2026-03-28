from datetime import UTC, datetime

from app.core.k8s_client import KubeVirtClient
from app.models.ssh_key import SSHKey, SSHKeyCreate


def _ssh_key_from_raw(raw: dict) -> SSHKey:
    metadata = raw.get("metadata", {})
    created_at = None
    ts = metadata.get("creationTimestamp")
    if ts:
        try:
            created_at = datetime.fromisoformat(str(ts).replace("Z", "+00:00")) if isinstance(ts, str) else ts
        except (ValueError, TypeError):
            created_at = datetime.now(tz=UTC)
    return SSHKey(
        name=metadata.get("name", ""),
        namespace=metadata.get("namespace", ""),
        public_key=raw.get("public_key", ""),
        created_at=created_at,
    )


class SSHKeyService:
    def __init__(self, kv: KubeVirtClient):
        self.kv = kv

    def list_ssh_keys(self, namespace: str) -> list[SSHKey]:
        return [_ssh_key_from_raw(s) for s in self.kv.list_ssh_keys(namespace)]

    def get_ssh_key(self, namespace: str, name: str) -> SSHKey | None:
        raw = self.kv.get_ssh_key(namespace, name)
        if raw is None:
            return None
        return _ssh_key_from_raw(raw)

    def create_ssh_key(self, namespace: str, request: SSHKeyCreate) -> SSHKey:
        raw = self.kv.create_ssh_key(namespace, request.name, request.public_key)
        return _ssh_key_from_raw(raw)

    def delete_ssh_key(self, namespace: str, name: str) -> None:
        self.kv.delete_ssh_key(namespace, name)

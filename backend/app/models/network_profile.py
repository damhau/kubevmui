from pydantic import BaseModel

from app.models.common import NetworkType, ResourceMeta


class NetworkProfile(ResourceMeta):
    display_name: str
    description: str = ""
    network_type: NetworkType
    vlan_id: int | None = None
    dhcp_enabled: bool = True
    subnet: str | None = None
    gateway: str | None = None
    connected_vm_count: int = 0
    raw_manifest: dict | None = None


class NetworkProfileCreate(BaseModel):
    name: str
    namespace: str = ""
    display_name: str
    description: str = ""
    network_type: NetworkType
    bridge_name: str = ""
    vlan_id: int | None = None
    dhcp_enabled: bool = True
    subnet: str | None = None
    gateway: str | None = None


class NetworkProfileList(BaseModel):
    items: list[NetworkProfile]
    total: int

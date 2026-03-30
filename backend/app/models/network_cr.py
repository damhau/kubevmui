from datetime import datetime

from pydantic import BaseModel


class NetworkCR(BaseModel):
    name: str
    display_name: str
    description: str = ""
    network_type: str  # "pod" or "multus"
    interface_type: str  # "masquerade" or "bridge"
    bridge_name: str = ""
    vlan_id: int | None = None
    dhcp_enabled: bool = True
    subnet: str | None = None
    gateway: str | None = None
    mac_spoof_check: bool = False
    cni_config: str | None = None
    created_at: datetime | None = None
    raw_manifest: dict | None = None


class NetworkCRCreate(BaseModel):
    name: str
    display_name: str
    description: str = ""
    network_type: str = "multus"  # "pod" or "multus"
    bridge_name: str = ""
    vlan_id: int | None = None
    dhcp_enabled: bool = True
    subnet: str | None = None
    gateway: str | None = None
    mac_spoof_check: bool = False
    cni_config: str | None = None  # optional — auto-generated from fields if not provided


class NetworkCRUpdate(BaseModel):
    display_name: str | None = None
    description: str | None = None
    bridge_name: str | None = None
    vlan_id: int | None = None
    dhcp_enabled: bool | None = None
    subnet: str | None = None
    gateway: str | None = None
    mac_spoof_check: bool | None = None
    cni_config: str | None = None


class NetworkCRList(BaseModel):
    items: list[NetworkCR]
    total: int

from enum import StrEnum

from pydantic import BaseModel


class InterfaceType(StrEnum):
    linux_bridge = "linux-bridge"
    vlan = "vlan"


class NNCPCreate(BaseModel):
    name: str
    description: str = ""
    interface_name: str
    interface_type: InterfaceType
    state: str = "up"
    port: str = ""
    vlan_id: int | None = None
    vlan_base_iface: str = ""
    ipv4_enabled: bool = False
    ipv4_address: str = ""
    node_selector: dict[str, str] = {}


class NNCP(BaseModel):
    name: str
    description: str = ""
    interface_name: str
    interface_type: str
    state: str = "up"
    port: str = ""
    vlan_id: int | None = None
    ipv4_enabled: bool = False
    ipv4_address: str = ""
    status: str = "Unknown"
    enactments: list[dict] = []
    raw_manifest: dict | None = None


class NNCPList(BaseModel):
    items: list[NNCP]
    total: int


class NNSInterface(BaseModel):
    name: str
    type: str
    state: str
    mac_address: str = ""
    mtu: int = 0
    ipv4_addresses: list[str] = []


class NodeNetworkState(BaseModel):
    node_name: str
    interfaces: list[NNSInterface]

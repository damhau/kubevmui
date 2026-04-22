"""OVA/OVF parser.

An OVA is a tar archive containing an OVF XML descriptor plus one or more disk
files (typically VMDK). We parse the XML to extract VM metadata and surface
each disk with enough info to feed into the migration pipeline.

Spec: https://www.dmtf.org/standards/ovf
"""

from __future__ import annotations

import logging
import tarfile
from dataclasses import dataclass, field
from pathlib import Path
from xml.etree import ElementTree as ET

logger = logging.getLogger(__name__)

# Common OVF/CIM namespaces
_OVF_NS = "http://schemas.dmtf.org/ovf/envelope/1"
_RASD_NS = "http://schemas.dmtf.org/wbem/wscim/1/cim-schema/2/CIM_ResourceAllocationSettingData"
_VSSD_NS = "http://schemas.dmtf.org/wbem/wscim/1/cim-schema/2/CIM_VirtualSystemSettingData"

_NS = {
    "ovf": _OVF_NS,
    "rasd": _RASD_NS,
    "vssd": _VSSD_NS,
}

# CIM ResourceType codes we care about
_RT_PROCESSOR = "3"
_RT_MEMORY = "4"
_RT_ETHERNET = "10"
_RT_DISK = "17"


@dataclass
class OVADisk:
    """One disk referenced by the OVF descriptor and present in the tar."""

    disk_id: str  # ovf:diskId (logical)
    file_id: str  # ovf:fileRef (from <File>)
    href: str  # filename inside the tar
    capacity_bytes: int = 0
    format: str = "vmdk"  # detected from ovf:format or extension


@dataclass
class OVANetwork:
    name: str  # network name in OVF (e.g. "VM Network")


@dataclass
class OVAMetadata:
    vm_name: str = ""
    description: str = ""
    os_type: str = ""
    firmware: str = "bios"  # derived heuristically; many OVFs don't set it
    cpu_cores: int = 0
    memory_mb: int = 0
    disks: list[OVADisk] = field(default_factory=list)
    networks: list[OVANetwork] = field(default_factory=list)
    ovf_path_in_tar: str = ""


class OVAParseError(RuntimeError):
    pass


def parse_ova(path: Path | str) -> OVAMetadata:
    """Parse an OVA file and return structured metadata.

    Does NOT extract the disk blobs — call ``extract_disk`` later for that.
    """

    ova_path = Path(path)
    if not ova_path.exists():
        raise OVAParseError(f"OVA file not found: {ova_path}")

    try:
        with tarfile.open(ova_path, "r") as tar:
            ovf_member = _find_ovf_member(tar)
            if ovf_member is None:
                raise OVAParseError(f"No .ovf descriptor found in {ova_path}")
            fileobj = tar.extractfile(ovf_member)
            if fileobj is None:
                raise OVAParseError(f"Failed to read OVF descriptor {ovf_member.name}")
            ovf_bytes = fileobj.read()
    except tarfile.TarError as exc:
        raise OVAParseError(f"Not a valid tar archive: {exc}") from exc

    try:
        root = ET.fromstring(ovf_bytes)
    except ET.ParseError as exc:
        raise OVAParseError(f"Invalid OVF XML: {exc}") from exc

    meta = _parse_ovf_root(root)
    meta.ovf_path_in_tar = ovf_member.name
    return meta


def extract_disk(ova_path: Path | str, disk_href: str, dest: Path | str) -> Path:
    """Extract a single disk blob from the OVA into ``dest``.

    ``dest`` may be a directory (file keeps its original name) or a full file
    path. Returns the written file path.
    """

    ova = Path(ova_path)
    dest_path = Path(dest)
    with tarfile.open(ova, "r") as tar:
        member = _find_member(tar, disk_href)
        if member is None:
            raise OVAParseError(f"Disk '{disk_href}' not found in {ova}")
        out = dest_path / Path(disk_href).name if dest_path.is_dir() else dest_path
        out.parent.mkdir(parents=True, exist_ok=True)
        fileobj = tar.extractfile(member)
        if fileobj is None:
            raise OVAParseError(f"Failed to read {disk_href} from {ova}")
        with out.open("wb") as f:
            while True:
                chunk = fileobj.read(1024 * 1024)  # 1 MiB
                if not chunk:
                    break
                f.write(chunk)
        return out


# --- internals ---


def _find_ovf_member(tar: tarfile.TarFile) -> tarfile.TarInfo | None:
    for member in tar.getmembers():
        if member.isfile() and member.name.lower().endswith(".ovf"):
            return member
    return None


def _find_member(tar: tarfile.TarFile, href: str) -> tarfile.TarInfo | None:
    target = Path(href).name.lower()
    for member in tar.getmembers():
        if member.isfile() and Path(member.name).name.lower() == target:
            return member
    return None


def _parse_ovf_root(root: ET.Element) -> OVAMetadata:
    meta = OVAMetadata()

    # Files (map fileRef → href + size)
    files: dict[str, dict] = {}
    references = root.find("ovf:References", _NS)
    if references is not None:
        for f in references.findall("ovf:File", _NS):
            fid = _ovf_attr(f, "id")
            href = _ovf_attr(f, "href")
            if fid and href:
                files[fid] = {"href": href}

    # Disks (disk_id → file_id, capacity, format)
    disks_section = root.find("ovf:DiskSection", _NS)
    disk_specs: dict[str, dict] = {}
    if disks_section is not None:
        for disk in disks_section.findall("ovf:Disk", _NS):
            did = _ovf_attr(disk, "diskId")
            file_ref = _ovf_attr(disk, "fileRef")
            capacity = _ovf_attr(disk, "capacity")
            capacity_units = _ovf_attr(disk, "capacityAllocationUnits") or "byte"
            fmt = _ovf_attr(disk, "format") or ""
            if did:
                disk_specs[did] = {
                    "file_id": file_ref,
                    "capacity": _parse_capacity(capacity, capacity_units),
                    "format": _format_from_url(fmt),
                }

    for did, spec in disk_specs.items():
        file_id = spec["file_id"]
        href = files.get(file_id, {}).get("href", "")
        if not href:
            continue
        meta.disks.append(
            OVADisk(
                disk_id=did,
                file_id=file_id,
                href=href,
                capacity_bytes=spec["capacity"],
                format=spec["format"] or _format_from_extension(href),
            )
        )

    # Networks
    network_section = root.find("ovf:NetworkSection", _NS)
    if network_section is not None:
        for net in network_section.findall("ovf:Network", _NS):
            name = _ovf_attr(net, "name") or ""
            if name:
                meta.networks.append(OVANetwork(name=name))

    # VirtualSystem → VM name, OS, compute
    vsys = root.find("ovf:VirtualSystem", _NS)
    if vsys is not None:
        meta.vm_name = _ovf_attr(vsys, "id") or ""
        name_el = vsys.find("ovf:Name", _NS)
        if name_el is not None and name_el.text:
            meta.vm_name = name_el.text.strip()
        info_el = vsys.find("ovf:OperatingSystemSection/ovf:Description", _NS)
        if info_el is not None and info_el.text:
            meta.os_type = _normalise_os(info_el.text)

        # VirtualHardwareSection → CPU, memory
        hw = vsys.find("ovf:VirtualHardwareSection", _NS)
        if hw is not None:
            for item in hw.findall("ovf:Item", _NS):
                rt = _text(item, "rasd:ResourceType")
                qty = _text(item, "rasd:VirtualQuantity")
                if rt == _RT_PROCESSOR and qty:
                    meta.cpu_cores = _safe_int(qty)
                elif rt == _RT_MEMORY and qty:
                    # VirtualQuantity is in the unit given by AllocationUnits (often "MB")
                    units = _text(item, "rasd:AllocationUnits") or "MB"
                    meta.memory_mb = _mem_to_mb(_safe_int(qty), units)

    # Heuristic firmware detection: look for "efi" in firmware config
    firmware_value = _firmware_from_config(root)
    if firmware_value:
        meta.firmware = firmware_value

    return meta


def _ovf_attr(el: ET.Element, local_name: str) -> str:
    """Get an attribute regardless of namespace prefix."""

    prefixed = f"{{{_OVF_NS}}}{local_name}"
    if prefixed in el.attrib:
        return el.attrib[prefixed]
    return el.attrib.get(local_name, "")


def _text(el: ET.Element, path: str) -> str:
    target = el.find(path, _NS)
    if target is None or target.text is None:
        return ""
    return target.text.strip()


def _safe_int(value: str) -> int:
    try:
        return int(float(value))
    except (ValueError, TypeError):
        return 0


def _mem_to_mb(qty: int, units: str) -> int:
    u = units.lower()
    if "byte * 2^30" in u or "gib" in u or u == "gb":
        return qty * 1024
    if "byte * 2^20" in u or "mib" in u or u == "mb":
        return qty
    if "byte * 2^10" in u or "kib" in u or u == "kb":
        return qty // 1024
    # Unknown unit — assume MB
    return qty


def _parse_capacity(capacity: str, units: str) -> int:
    if not capacity:
        return 0
    qty = _safe_int(capacity)
    u = (units or "byte").lower()
    if "byte * 2^40" in u or "tib" in u:
        return qty * 1024**4
    if "byte * 2^30" in u or "gib" in u:
        return qty * 1024**3
    if "byte * 2^20" in u or "mib" in u:
        return qty * 1024**2
    if "byte * 2^10" in u or "kib" in u:
        return qty * 1024
    return qty  # plain bytes


def _format_from_url(fmt: str) -> str:
    if not fmt:
        return ""
    f = fmt.lower()
    if "vmdk" in f:
        return "vmdk"
    if "vhdx" in f:
        return "vhdx"
    if "vhd" in f:
        return "vhd"
    if "qcow" in f:
        return "qcow2"
    if "raw" in f:
        return "raw"
    return ""


def _format_from_extension(href: str) -> str:
    ext = Path(href).suffix.lower().lstrip(".")
    if ext in {"vmdk", "vhdx", "vhd", "qcow2", "raw"}:
        return ext
    return "vmdk"


def _normalise_os(description: str) -> str:
    d = description.lower()
    if "windows" in d:
        return "windows"
    if "linux" in d or "ubuntu" in d or "centos" in d or "rhel" in d or "debian" in d:
        return "linux"
    return ""


def _firmware_from_config(root: ET.Element) -> str:
    """Best-effort firmware detection from vendor-specific OVF extensions."""

    # VMware extension: vmw:ExtraConfig key="firmware" value="efi"
    for extra in root.iter():
        if extra.tag.endswith("ExtraConfig"):
            key = extra.attrib.get("{http://www.vmware.com/schema/ovf}key") or extra.attrib.get(
                "key", ""
            )
            value = extra.attrib.get("{http://www.vmware.com/schema/ovf}value") or extra.attrib.get(
                "value", ""
            )
            if key.lower() == "firmware" and value.lower() == "efi":
                return "uefi"
    return ""

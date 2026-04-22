"""Unit tests for the OVA/OVF parser."""

from __future__ import annotations

import tarfile
from pathlib import Path

import pytest

from app.services.ova_parser import OVAParseError, extract_disk, parse_ova

_SAMPLE_OVF = b"""<?xml version="1.0" encoding="UTF-8"?>
<Envelope xmlns="http://schemas.dmtf.org/ovf/envelope/1"
          xmlns:ovf="http://schemas.dmtf.org/ovf/envelope/1"
          xmlns:rasd="http://schemas.dmtf.org/wbem/wscim/1/cim-schema/2/CIM_ResourceAllocationSettingData">
  <References>
    <File ovf:id="file1" ovf:href="disk0.vmdk" ovf:size="1024"/>
  </References>
  <DiskSection>
    <Disk ovf:diskId="vmdisk1"
          ovf:fileRef="file1"
          ovf:capacity="10"
          ovf:capacityAllocationUnits="byte * 2^30"
          ovf:format="http://www.vmware.com/interfaces/specifications/vmdk.html#streamOptimized"/>
  </DiskSection>
  <NetworkSection>
    <Network ovf:name="VM Network">
      <Description>Default</Description>
    </Network>
  </NetworkSection>
  <VirtualSystem ovf:id="web-frontend-01">
    <Name>web-frontend-01</Name>
    <OperatingSystemSection>
      <Description>Ubuntu Linux (64-bit)</Description>
    </OperatingSystemSection>
    <VirtualHardwareSection>
      <Item>
        <rasd:ResourceType>3</rasd:ResourceType>
        <rasd:VirtualQuantity>4</rasd:VirtualQuantity>
      </Item>
      <Item>
        <rasd:ResourceType>4</rasd:ResourceType>
        <rasd:VirtualQuantity>2048</rasd:VirtualQuantity>
        <rasd:AllocationUnits>byte * 2^20</rasd:AllocationUnits>
      </Item>
    </VirtualHardwareSection>
  </VirtualSystem>
</Envelope>
"""

_DISK_CONTENT = b"\x00" * 4096  # 4 KiB of zeros, enough for parse tests


def _build_ova(path: Path) -> None:
    ovf_path = path.parent / "descriptor.ovf"
    disk_path = path.parent / "disk0.vmdk"
    ovf_path.write_bytes(_SAMPLE_OVF)
    disk_path.write_bytes(_DISK_CONTENT)
    with tarfile.open(path, "w") as tar:
        tar.add(ovf_path, arcname="descriptor.ovf")
        tar.add(disk_path, arcname="disk0.vmdk")


@pytest.fixture
def sample_ova(tmp_path: Path) -> Path:
    ova = tmp_path / "sample.ova"
    _build_ova(ova)
    return ova


def test_parse_ova_extracts_metadata(sample_ova: Path):
    meta = parse_ova(sample_ova)
    assert meta.vm_name == "web-frontend-01"
    assert meta.os_type == "linux"
    assert meta.cpu_cores == 4
    assert meta.memory_mb == 2048
    assert len(meta.disks) == 1
    assert meta.disks[0].href == "disk0.vmdk"
    assert meta.disks[0].format == "vmdk"
    assert meta.disks[0].capacity_bytes == 10 * (1024**3)
    assert len(meta.networks) == 1
    assert meta.networks[0].name == "VM Network"


def test_parse_ova_missing_file(tmp_path: Path):
    with pytest.raises(OVAParseError):
        parse_ova(tmp_path / "nope.ova")


def test_parse_ova_rejects_non_tar(tmp_path: Path):
    bad = tmp_path / "bogus.ova"
    bad.write_bytes(b"not a tar archive")
    with pytest.raises(OVAParseError):
        parse_ova(bad)


def test_extract_disk_writes_content(sample_ova: Path, tmp_path: Path):
    dest = tmp_path / "out"
    dest.mkdir()
    result = extract_disk(sample_ova, "disk0.vmdk", dest)
    assert result.exists()
    assert result.read_bytes() == _DISK_CONTENT


def test_extract_disk_missing_href(sample_ova: Path, tmp_path: Path):
    with pytest.raises(OVAParseError):
        extract_disk(sample_ova, "missing.vmdk", tmp_path)

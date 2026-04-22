"""Unit tests for the qemu-img wrapper."""

from __future__ import annotations

from pathlib import Path
from unittest.mock import AsyncMock, patch

import pytest

from app.services.disk_converter import (
    ConversionError,
    _map_format,
    _parse_progress,
    convert_to_qcow2,
)


def test_map_format_vhd_to_vpc():
    assert _map_format("vhd") == "vpc"
    assert _map_format("VHD") == "vpc"


def test_map_format_preserves_known():
    for f in ("vhdx", "vmdk", "raw", "qcow2"):
        assert _map_format(f) == f


def test_map_format_empty_defaults_to_raw():
    assert _map_format("") == "raw"
    assert _map_format("auto") == "raw"


def test_parse_progress_percentage():
    assert _parse_progress("    (65.5/100%)") == 65
    assert _parse_progress("12.34%") == 12
    assert _parse_progress("random text without percent") is None


@pytest.mark.asyncio
async def test_convert_qcow2_passthrough_copies(tmp_path: Path):
    src = tmp_path / "src.qcow2"
    dst = tmp_path / "dst.qcow2"
    src.write_bytes(b"\x00" * 1024)

    cb = AsyncMock()
    result = await convert_to_qcow2(src, dst, "qcow2", progress_cb=cb)
    assert result == dst
    assert dst.read_bytes() == src.read_bytes()
    cb.assert_awaited_with(100)


@pytest.mark.asyncio
async def test_convert_runs_qemu_img(tmp_path: Path):
    src = tmp_path / "src.vmdk"
    dst = tmp_path / "dst.qcow2"
    src.write_bytes(b"\x00" * 1024)

    class _FakeProc:
        stdout = None
        stderr = None

        async def wait(self):
            return 0

    async def _fake_create(*_args, **_kwargs):
        proc = _FakeProc()

        # Simulate empty stdout/stderr pipes
        class _Empty:
            async def read(self, _n):
                return b""

            async def readline(self):
                return b""

        proc.stdout = _Empty()
        proc.stderr = _Empty()
        return proc

    with (
        patch("app.services.disk_converter.qemu_img_available", return_value=True),
        patch("asyncio.create_subprocess_exec", side_effect=_fake_create),
    ):
        # Create the output file so nothing downstream complains
        dst.write_bytes(b"")
        result = await convert_to_qcow2(src, dst, "vmdk")
    assert result == dst


@pytest.mark.asyncio
async def test_convert_raises_when_qemu_img_missing(tmp_path: Path):
    src = tmp_path / "src.vmdk"
    src.write_bytes(b"")
    with (
        patch("app.services.disk_converter.qemu_img_available", return_value=False),
        pytest.raises(ConversionError),
    ):
        await convert_to_qcow2(src, tmp_path / "out.qcow2", "vmdk")

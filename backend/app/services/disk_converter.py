"""qemu-img wrapper for converting source disks (VHD/VHDX/VMDK/raw) to qcow2.

Runs qemu-img as an async subprocess. The subprocess is started with
``-p`` so qemu-img writes progress percentages to stdout; we parse those and
yield them via an optional callback.
"""

from __future__ import annotations

import asyncio
import logging
import re
import shutil
from collections.abc import Awaitable, Callable
from pathlib import Path

logger = logging.getLogger(__name__)

_PROGRESS_RE = re.compile(r"\(([\d.]+)\s*/\s*100%\)|([\d.]+)\s*%")


class ConversionError(RuntimeError):
    pass


def qemu_img_available() -> bool:
    return shutil.which("qemu-img") is not None


async def convert_to_qcow2(
    input_path: Path | str,
    output_path: Path | str,
    src_format: str,
    progress_cb: Callable[[int], Awaitable[None]] | None = None,
) -> Path:
    """Convert ``input_path`` (format ``src_format``) to qcow2 at ``output_path``.

    ``src_format`` is the qemu-img input format — NOT the source file extension.
    Mapping from our OVA parser:

    - ``vhd``  → qemu-img ``vpc``
    - ``vhdx`` → qemu-img ``vhdx``
    - ``vmdk`` → qemu-img ``vmdk``
    - ``raw``  → qemu-img ``raw``
    - ``qcow2`` (already target) → file is copied as-is

    If ``progress_cb`` is given, it is awaited with an integer percentage
    whenever qemu-img emits a progress line.
    """

    src = Path(input_path)
    dst = Path(output_path)
    if not src.exists():
        raise ConversionError(f"Input file not found: {src}")
    dst.parent.mkdir(parents=True, exist_ok=True)

    qemu_format = _map_format(src_format)

    if qemu_format == "qcow2":
        # Already qcow2 — just copy (no qemu-img needed)
        if src != dst:
            shutil.copyfile(src, dst)
        if progress_cb:
            await progress_cb(100)
        return dst

    if not qemu_img_available():
        raise ConversionError("qemu-img is not available on PATH (install qemu-utils)")

    cmd = [
        "qemu-img",
        "convert",
        "-p",  # print progress
        "-f",
        qemu_format,
        "-O",
        "qcow2",
        str(src),
        str(dst),
    ]
    logger.info("Running qemu-img: %s", " ".join(cmd))

    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )

    last_pct = -1
    stderr_tail: list[str] = []

    async def _consume_stdout() -> None:
        nonlocal last_pct
        assert proc.stdout is not None
        buf = b""
        while True:
            chunk = await proc.stdout.read(128)
            if not chunk:
                break
            buf += chunk
            # qemu-img prints progress lines terminated by \r
            while b"\r" in buf or b"\n" in buf:
                sep_idx = min(
                    (buf.index(sep) for sep in (b"\r", b"\n") if sep in buf),
                    default=None,
                )
                if sep_idx is None:
                    break
                line = buf[:sep_idx].decode("utf-8", errors="replace")
                buf = buf[sep_idx + 1 :]
                pct = _parse_progress(line)
                if pct is not None and pct != last_pct:
                    last_pct = pct
                    if progress_cb:
                        try:
                            await progress_cb(pct)
                        except Exception:
                            logger.exception("progress callback raised")

    async def _consume_stderr() -> None:
        assert proc.stderr is not None
        while True:
            line_bytes = await proc.stderr.readline()
            if not line_bytes:
                break
            line = line_bytes.decode("utf-8", errors="replace").rstrip()
            if line:
                stderr_tail.append(line)
                if len(stderr_tail) > 50:
                    stderr_tail.pop(0)

    await asyncio.gather(_consume_stdout(), _consume_stderr())
    rc = await proc.wait()

    if rc != 0:
        msg = "\n".join(stderr_tail) or f"qemu-img exited with code {rc}"
        raise ConversionError(f"qemu-img conversion failed: {msg}")

    if progress_cb and last_pct != 100:
        await progress_cb(100)

    return dst


def _map_format(src_format: str) -> str:
    f = src_format.strip().lower()
    if f in {"", "auto"}:
        return "raw"
    if f == "vhd":
        return "vpc"  # Microsoft VHD → qemu-img calls it "vpc" (Virtual PC)
    return f


def _parse_progress(line: str) -> int | None:
    """qemu-img prints e.g. "    (12.34/100%)" or "12.34%"."""

    match = _PROGRESS_RE.search(line)
    if not match:
        return None
    pct_str = match.group(1) or match.group(2)
    if not pct_str:
        return None
    try:
        return int(float(pct_str))
    except ValueError:
        return None

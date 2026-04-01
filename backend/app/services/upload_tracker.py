import threading
import time
from dataclasses import dataclass, field


@dataclass
class UploadProgress:
    total_bytes: int = 0
    uploaded_bytes: int = 0
    phase: str = "uploading"  # uploading | writing | done | failed
    error: str = ""
    started_at: float = field(default_factory=time.time)

    @property
    def percent(self) -> int:
        if self.total_bytes <= 0:
            return 0
        return min(100, int(self.uploaded_bytes * 100 / self.total_bytes))


class ProgressStream:
    """Wraps a file-like object to track read progress. Iterable for httpx streaming."""

    CHUNK_SIZE = 64 * 1024  # 64KB chunks

    def __init__(self, stream, progress: UploadProgress):
        self._stream = stream
        self._progress = progress

    def read(self, size: int = -1) -> bytes:
        data = self._stream.read(size)
        if data:
            self._progress.uploaded_bytes += len(data)
        return data

    def __iter__(self):
        return self

    def __next__(self) -> bytes:
        data = self._stream.read(self.CHUNK_SIZE)
        if not data:
            raise StopIteration
        self._progress.uploaded_bytes += len(data)
        return data


class UploadTracker:
    """In-memory singleton tracking active uploads."""

    _instance: "UploadTracker | None" = None
    _lock = threading.Lock()

    def __new__(cls) -> "UploadTracker":
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = super().__new__(cls)
                    cls._instance._uploads: dict[str, UploadProgress] = {}
        return cls._instance

    def start(self, key: str, total_bytes: int) -> UploadProgress:
        progress = UploadProgress(total_bytes=total_bytes)
        self._uploads[key] = progress
        return progress

    def get(self, key: str) -> UploadProgress | None:
        return self._uploads.get(key)

    def complete(self, key: str) -> None:
        if p := self._uploads.get(key):
            p.phase = "done"

    def fail(self, key: str, error: str) -> None:
        if p := self._uploads.get(key):
            p.phase = "failed"
            p.error = error

    def remove(self, key: str) -> None:
        self._uploads.pop(key, None)

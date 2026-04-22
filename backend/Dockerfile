# --- Build stage: install dependencies with uv ---
FROM python:3.12-slim AS builder

WORKDIR /app

# Install uv
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /usr/local/bin/

# Copy project metadata for dependency resolution
COPY pyproject.toml .

# Install production dependencies into /app/.venv
RUN uv sync --no-dev --no-install-project

# --- Runtime stage ---
FROM python:3.12-slim AS runtime

WORKDIR /app

# qemu-utils provides qemu-img, used by the VM Import pipeline to convert
# VHD/VHDX/VMDK source disks to qcow2 before uploading to CDI.
RUN apt-get update \
    && apt-get install -y --no-install-recommends qemu-utils \
    && rm -rf /var/lib/apt/lists/*

# Copy uv binary for runtime use
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/

# Copy the pre-built virtualenv
COPY --from=builder /app/.venv /app/.venv

# Copy application source
COPY app ./app
COPY pyproject.toml .

ENV PATH="/app/.venv/bin:$PATH"
ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]

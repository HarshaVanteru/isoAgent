# syntax=docker/dockerfile:1

# ---- builder: Python dependencies in an isolated virtualenv ----
FROM python:3.12-slim AS builder

ENV PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PATH=/opt/venv/bin:$PATH

RUN python -m venv /opt/venv
WORKDIR /build
COPY pyproject.toml ./

# CPU-only torch/torchvision (published for amd64 and arm64) must be installed first,
# otherwise Docling and sentence-transformers pull mismatched CUDA builds from PyPI.
RUN pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu

# Runtime dependencies come straight from pyproject.toml (no dev extras, no editable install).
RUN python -c "import tomllib; print('\n'.join(tomllib.load(open('pyproject.toml', 'rb'))['project']['dependencies']))" \
        > requirements.runtime.txt \
    && pip install -r requirements.runtime.txt

# ---- runtime: LibreOffice for legacy formats + the application ----
FROM python:3.12-slim AS runtime

ARG GIT_SHA=unknown
LABEL org.opencontainers.image.title="iso-agent-backend" \
      org.opencontainers.image.description="ISO Knowledge Assistant API" \
      org.opencontainers.image.source="https://github.com/HarshaVanteru/isoAgent" \
      org.opencontainers.image.revision="${GIT_SHA}"

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        libreoffice-writer libreoffice-calc libreoffice-impress libreoffice-draw \
        fonts-dejavu-core libgl1 libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --create-home --uid 10001 app

ENV PATH=/opt/venv/bin:$PATH \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    GIT_SHA=${GIT_SHA} \
    DATA_DIR=/app/data \
    DOCUMENT_DIR=/app/documents \
    HF_HOME=/app/.cache/huggingface \
    MODEL_CACHE_DIR=/app/.cache/huggingface/hub

WORKDIR /app
COPY --from=builder /opt/venv /opt/venv
# app/ lands in /app/app, so settings resolve BACKEND_DIR to /app.
COPY app ./app
# Pre-create volume mount points so named volumes inherit the non-root owner.
RUN mkdir -p data documents .cache/huggingface && chown -R app:app /app

USER app
EXPOSE 8000

HEALTHCHECK --interval=15s --timeout=5s --start-period=60s --retries=3 \
    CMD ["python", "-c", "import sys, urllib.request; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=4).status == 200 else 1)"]

# One worker: conversation checkpoints (SQLite) and ingestion locks are in-process.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--http", "h11", "--ws", "none"]

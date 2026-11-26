ARG PYTHON_BASE_IMAGE=python:3.12-slim

FROM ${PYTHON_BASE_IMAGE}

ARG PYPI_INDEX_URL=https://pypi.org/simple

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_INDEX_URL=${PYPI_INDEX_URL} \
    UV_DEFAULT_INDEX=${PYPI_INDEX_URL} \
    PATH="/app/.venv/bin:${PATH}"

WORKDIR /app

RUN pip install uv==0.13.4

COPY pyproject.toml uv.lock ./
RUN python -m venv .venv \
    && uv export --frozen --no-dev --format requirements-txt > /tmp/requirements.txt \
    && .venv/bin/pip install --no-cache-dir --require-hashes -r /tmp/requirements.txt \
    && rm /tmp/requirements.txt

RUN groupadd --gid 10001 app \
    && useradd \
        --uid 10001 \
        --gid app \
        --create-home \
        --shell /usr/sbin/nologin \
        app

COPY --chown=app:app alembic.ini ./
COPY --chown=app:app alembic ./alembic
COPY --chown=app:app docker ./docker
COPY --chown=app:app app ./app

USER app

EXPOSE 8000

HEALTHCHECK \
    --interval=10s \
    --timeout=3s \
    --start-period=15s \
    --retries=3 \
    CMD ["python", "docker/healthcheck.py"]

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers", "--forwarded-allow-ips=*"]

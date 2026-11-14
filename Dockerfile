# Optional: run MIND in a container with Tesseract (OCR for scanned PDFs).
#
#   docker build -t mind .
#   docker run --rm -p 127.0.0.1:8000:8000 -v mind-data:/data mind
#
# Publish the port on 127.0.0.1 only: the API has no authentication.

FROM python:3.12-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends tesseract-ocr tesseract-ocr-por tesseract-ocr-eng \
    && rm -rf /var/lib/apt/lists/*

COPY --from=ghcr.io/astral-sh/uv:0.5 /uv /usr/local/bin/uv

WORKDIR /app
COPY pyproject.toml uv.lock README.md LICENSE .python-version ./
COPY src ./src
RUN uv sync --frozen --no-dev

ENV PATH="/app/.venv/bin:$PATH" \
    MIND_DATA_DIR=/data \
    MIND_HOST=0.0.0.0

VOLUME /data
EXPOSE 8000
CMD ["mind"]

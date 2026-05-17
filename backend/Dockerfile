FROM python:3.11-slim-bookworm

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# System deps for building some Python wheels (e.g., cryptography)
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
       build-essential \
       libssl-dev \
       libffi-dev \
       pkg-config \
    && rm -rf /var/lib/apt/lists/*

# Install Python deps first (better layer caching)
COPY requirements.txt ./
RUN pip install -r requirements.txt

# Copy application source
COPY . .

RUN chmod +x /app/entrypoint.sh

EXPOSE 8000

# Entrypoint запускает миграции, затем передаёт управление CMD
ENTRYPOINT ["/app/entrypoint.sh"]

# CMD задан в docker-compose: uvicorn main:app

#!/usr/bin/env sh
set -e

echo "[entrypoint] Applying database migrations..."
alembic upgrade head
echo "[entrypoint] Migrations applied. Starting application..."

exec "$@"

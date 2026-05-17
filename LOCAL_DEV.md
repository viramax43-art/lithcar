# Локальный запуск (full local)

## 1) Backend

1. Перейди в `backend` и создай `.env` из примера:
   - `cp .env.example .env`
2. Проверь ключевые значения:
   - `CHIEF_ADMIN_KEY` — ключ главного админа (для входа в админку и создания других ключей)
   - `ALLOW_TEST_TELEGRAM_INIT_DATA=true` — тестовый режим Telegram initData
   - `ADMIN_SESSION_COOKIE_SECURE=false` — для `http://localhost`
3. Запусти backend:
   - `uvicorn main:app --reload --host 0.0.0.0 --port 8000`

## 2) Frontend

1. Перейди в `frontend` и создай `.env.local` из примера:
   - `cp .env.local.example .env.local`
2. Выбери режим API через один флаг:
   - `VITE_API_TARGET=local` — фронт ходит в локальный backend (`VITE_API_BASE_URL_LOCAL`)
   - `VITE_API_TARGET=remote` — фронт ходит в реальный сервер (`VITE_API_BASE_URL_REMOTE`)
3. Укажи оба URL один раз:
   - `VITE_API_BASE_URL_LOCAL=http://localhost:8000`
   - `VITE_API_BASE_URL_REMOTE=https://api.example.com`
4. Для локальной разработки:
   - `VITE_ENABLE_BROWSER_TEST_AUTH=true`
5. Запусти frontend:
   - `npm run dev`

### Docker режим (https://localhost)

- `docker compose` использует `frontend/.env` (не `.env.local`).
- Для локального docker-профиля уже выставлено:
  - `VITE_API_TARGET=remote`
  - `VITE_API_BASE_URL_REMOTE=https://localhost`
- Это заставляет фронт ходить на тот же origin через caddy (`https://localhost/api/...`) и убирает CORS-проблемы.

## 3) Как тестировать

- Пассажирский режим в обычном браузере:
  - фронт автоматически симулирует Telegram initData пользователя:
    - id: `7370074938`
    - first name: `hrd`
    - username: `hrdlean`
- Админка:
  - открой `/admin`
  - введи `CHIEF_ADMIN_KEY` из backend `.env`
  - после входа можно создавать/отзывать ключи для `admin` и `moderator`
  - в разделе водителей фото теперь загружается файлом в локальный MinIO S3

### MinIO для фото водителей

- В docker-режиме MinIO поднимается автоматически:
  - S3 API: `http://localhost:9000`
  - Console: `http://localhost:9001`
- Bucket `driver-photos` создаётся сервисом `minio-init`.
- В backend `.env` уже есть переменные `S3_*` для локального MinIO.

### Кабинет водителя

- После создания водителя админ получает ключ `ride_driver_...` (показывается один раз).
- Водитель входит в браузере через `/driver` по этому ключу.

## 4) Для production

Отключи тестовый режим:

- Backend: `ALLOW_TEST_TELEGRAM_INIT_DATA=false`
- Frontend: `VITE_API_TARGET=remote` и `VITE_ENABLE_BROWSER_TEST_AUTH=false`

И включи secure cookie:

- Backend: `ADMIN_SESSION_COOKIE_SECURE=true` (при HTTPS)

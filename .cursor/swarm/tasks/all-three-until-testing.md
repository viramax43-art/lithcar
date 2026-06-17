# Задачи 1–3 до тестирования — ОДИН ПРОГОН РОЯ

> Одна команда. Architect: сначала аудит кода, потом только пробелы.

---

## Задача 1: Фьючеры водителей — ✅ СДЕЛАНО (только verify)

**Не переписывать.** Прогон `driver-futures-complete` завершён GREEN (142 pytest).

Проверить acceptance criteria из `.cursor/swarm/tasks/driver-futures-complete.md`:
- offer CRUD, матчинг, ±2km, Match кнопки, Telegram, места, несколько офферов

Если regression — починить минимальным diff. Иначе **0 изменений**.

---

## Задача 2: Рейтинг обеих сторон — ✅ УЖЕ В КОДЕ (только verify + polish)

**Уже реализовано** (не из последнего роя, но в репе):

| Компонент | Файлы |
|-----------|-------|
| Модель `ride_ratings` | `backend/app/models/ride_rating.py`, миграция `20260528_0018` |
| Сервис | `backend/app/services/rating_service.py` |
| Passenger rate driver | `POST /api/ride-requests/{id}/rate` — `ride_requests.py` |
| Driver rate passenger | `POST /api/driver/cabinet/rides/{id}/rate` — `driver_portal.py` |
| UI пассажир | `RequestDetail.tsx`, `Profile.tsx`, `MyRequests.tsx` |
| UI водитель | `RideRatingSheet.tsx`, `DriverCabinet.tsx`, `DriverSideMenu.tsx` |
| Агрегаты | `driver.rating`, `user.rating` + `ratingCount` в cabinet/session |
| Тесты | `backend/tests/test_ratings.py` — **7 тестов** |

**Scope для этого прогона (только если пробел):**
- Показать `passengerRating` на карточках matching у водителя (`DriverOffersList`) если API уже отдаёт — иначе добавить
- Показать рейтинг пассажира в offer cards если нет
- i18n lt/pl/en/ru для любых новых label
- **Не дублировать** модели/API если уже есть

---

## Задача 3: Чёрный список — ❌ РЕАЛИЗОВАТЬ ПОЛНОСТЬЮ

### Продуктовое описание

- **Водитель** может заблокировать **пассажира**
- **Пассажир** может заблокировать **водителя**
- Заблокированные:
  - не видят offers/requests друг друга в списках и matching
  - не могут забронировать offer / claim request
  - не попадают в match suggestions
- UI: кнопка «Заблокировать» после поездки или в sheet; раздел «Заблокированные» в Profile (обе стороны)
- Разблокировка из Profile

### Backend (новое)

**Модель `user_blocks`:**
```
id UUID PK
blocker_user_id FK users  — кто блокирует
blocked_user_id FK users  — кого (user_id пассажира или user_id водителя)
created_at
UNIQUE(blocker_user_id, blocked_user_id)
CHECK blocker_user_id != blocked_user_id
```

Миграция: `20260617_0033_user_blocks.py` (после последней в chain)

**Сервис `block_service.py`:**
- `block_user(blocker_id, blocked_id)` — идемпотентно
- `unblock_user(blocker_id, blocked_id)`
- `list_blocked_users(blocker_id)` → список с username, name
- `is_blocked(blocker_id, blocked_id)` / `are_users_blocked(a, b)` — mutual check

**API:**

| Method | Path | Auth | Описание |
|--------|------|------|----------|
| POST | `/api/users/me/blocks` | bearer | body `{ userId }` — заблокировать |
| DELETE | `/api/users/me/blocks/{userId}` | bearer | разблокировать |
| GET | `/api/users/me/blocks` | bearer | список заблокированных |

Для водителя без passenger user_id в UI — резолвить через `ride_request.passenger_id` или `driver.user_id`.

**Интеграция фильтров (обязательно):**
- `list_open_offers_for_passengers` — скрыть offers от заблокированных водителей
- `list_matching_offers` / `offer_matching_service` — exclude blocked pairs
- `list_matching_requests_for_offer` — exclude blocked passengers
- `book_offer_seat` — 403 `blocked` если mutual block
- `claim_request_with_offer` / `claim_ride_by_driver` — 403 если block
- `list_unassigned_rides` (driver cabinet map) — exclude blocked passengers
- Passenger `list_ride_requests` / cabinet — не показывать rides с blocked driver (optional minimal: hide in matching only)

**Ошибки:** `403` с `{ code: "blocked", message: "..." }`

### Frontend

**Types + API:** `passengerApi.ts`, `driverApi.ts` или shared `blockApi.ts`

**UI точки:**
- `RequestDetail.tsx` — после completed: «Заблокировать водителя»
- `DriverCabinet.tsx` / ride sheet — «Заблокировать пассажира»
- `OfferMapSheet.tsx` — опционально block driver (если уже была поездка) или только из completed ride
- `Profile.tsx` — секция «Заблокированные» + unblock
- Driver Profile/Settings в `DriverSideMenu` или cabinet — аналогично

**i18n:** lt, pl, en, ru — block, unblock, blockedList, blockedError, confirmBlock

### Тесты `backend/tests/test_user_blocks.py`

- block → offer list excludes driver
- block → book returns 403
- block → matching excludes pair
- unblock restores visibility
- cannot block self
- mutual: A blocks B, B blocks A — symmetric deny

---

## Порядок реализации

1. Audit tasks 1–2 (no changes if green)
2. `user_blocks` migration + model + service
3. API endpoints
4. Filters in offer/matching/booking/claim services
5. Frontend UI + i18n
6. Tests until green

---

## Acceptance criteria (все 3 задачи)

### Task 1
- [ ] Existing driver futures flows work (no regression)

### Task 2
- [ ] `pytest tests/test_ratings.py` green
- [ ] Passenger + driver can rate after completed
- [ ] Ratings visible in profile/session/cards

### Task 3
- [ ] Block/unblock/list API works
- [ ] Blocked users hidden from matching/offers/booking/claim
- [ ] UI block from completed ride + manage in Profile
- [ ] `pytest tests/test_user_blocks.py` green

### Global
- [ ] Full `docker compose -f docker-compose.test.yml` pytest green
- [ ] `npm run build` green

---

## Out of scope

- Admin moderation of blocks
- In-app chat
- Auto-block on low rating

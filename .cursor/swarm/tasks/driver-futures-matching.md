# Задача: матчинг и доработка фьючеров водителя (driver ride offers v2)

## Контекст

**Уже реализовано (не переписывать с нуля):**
- Сущность `driver_ride_offers` + `ride_requests.offer_id`
- Driver CRUD: форма (A, B, datetime, totalSeats), список, отмена
- Passenger: список `/offers`, бронирование, offers на карте `NewRequest` + `OfferMapSheet`
- Бронирование → `RideRequest` assigned с фиксированным маршрутом оффера
- Несколько офферов у водителя; несколько заявок у пассажира
- API уже отдаёт `totalSeats`, `seatsAvailable`, `bookedByMe`, `driver.carModel` и т.д.
- Self-assign водителя из unassigned requests (`DriverCabinet`) — **без связи с офферами**
- Admin group suggestions между `ride_requests` — **не для пользователей**

**Продуктовое описание (целевое поведение):**

Фьючер водителя = 4 вводных: **откуда, куда, когда, места** (например «Mercedes Sprinter, 5 мест свободно из 8 — 3 занято»).

Подбор попутчиков тремя способами:
1. Водитель подбирает из заявок (в контексте своего оффера)
2. Пассажир подбирает из предложений (уже есть + фильтр по маршруту)
3. Система предлагает обеим сторонам — **динамическая кнопка «Совпадение / Match»**

На карте показывать релевантные офферы/заявки в радиусе **±2 км** от точки выезда (и по направлению B).

Когда пассажир или водитель указывает A и B — показывать **ближайшие и подходящие** offers/requests в обоих направлениях.

Любая сторона может **написать в ЛС** (Telegram — мы в группе/мини-апп).

---

## Scope (реализовать в этой задаче)

### 1. UX мест: «X занято · Y свободно из Z»

**Backend:** без изменений (данные есть).

**Frontend (passenger):**
- `DriverOffers.tsx`, `OfferMapSheet.tsx` — показывать `seatsBooked = totalSeats - seatsAvailable` + `totalSeats`
- Формат i18n: lt, pl, en, ru — «3 занято · 5 свободно из 8» / аналоги

**Frontend (driver):**
- `DriverOffersList.tsx` — vehicle line: `carModel`, `seatsAvailable/totalSeats`, bookings count (если ещё не полно)

### 2. Геофильтр ±2 км от точки выезда

**Backend** — расширить `list_open_offers_for_passengers` и API `GET /api/ride-offers`:
- Query params (optional): `fromLat`, `fromLng`, `radiusKm` (default **2**, max 10)
- Фильтр: haversine от `(fromLat, fromLng)` до `offer.from_lat/lng` ≤ radiusKm
- Если coords не переданы — текущее поведение (все open в зонах)

**Frontend:**
- `usePassengerRideOffersOnMap.ts` — передавать coords точки A пассажира когда A задана; иначе центр карты / все offers
- `NewRequest.tsx` — на карте только offers в радиусе (когда A известна)
- `DriverOffers.tsx` — optional filter если есть draft A в session/local state (минимум: query param или state из NewRequest navigation)

### 3. Матчинг offers ↔ requests по маршруту A/B

**Backend** — новый сервис `backend/app/services/offer_matching_service.py`:
- Переиспользовать `haversine_km`, паттерны из `suggestion_service.py` / admin `similarTrips`
- Константы (настраиваемые в коде): `PICKUP_RADIUS_KM = 2`, `DROPOFF_RADIUS_KM = 2`, `DATETIME_WINDOW_HOURS = 2`
- `score_offer_for_passenger_route(offer, from, to, date_time?)` → 0–100 + breakdown (pickupDist, dropoffDist, timeDelta)
- `score_request_for_offer(offer, request)` → аналогично
- Порог показа Match UI: **score ≥ 60** (как в suggestion_service)

**API:**

| Method | Path | Auth | Описание |
|--------|------|------|----------|
| GET | `/api/ride-offers/matches` | passenger/driver bearer | Query: `fromLat, fromLng, toLat, toLng, dateTime?` → ranked open offers с `matchScore`, `matchReason` |
| GET | `/api/driver/offers/{id}/matches` | driver session | Matching pending/unassigned `ride_requests` для оффера с `matchScore`, `matchReason` |

Response fields (добавить к существующим DTO или отдельный `MatchSummary`):
```ts
matchScore: number      // 0-100
matchReason?: string     // human-readable
pickupDistanceKm?: number
dropoffDistanceKm?: number
```

**Frontend passenger:**
- В `NewRequest` bottom panel: когда **A и B заданы** — секция «Подходящие поездки водителей» (top 3–5) с Match badge + tap → select offer / open sheet
- Кнопка Match динамическая: показывать только если `matchScore >= 60`
- Фильтровать offers на карте: только matches (или matches + в радиусе 2km от A — architect уточнит приоритет)

**Frontend driver:**
- В `DriverOffersList` или detail sheet для open offer: секция «Подходящие заявки» с Match badge
- Кнопка **«Забрать заявку»** → existing `claim_ride_by_driver` + опционально связать `offer_id` на созданной/assigned заявке если architect решит (минимум: claim + decrement seats if booking path exists)
- Альтернатива MVP: кнопка «Забрать» вызывает существующий claim API; seats offer decrement только через explicit book flow — **architect выберет минимально рабочий путь**

### 4. Системные подсказки + кнопка Match

- Не admin-only: переиспользовать scoring из п.3
- Passenger: chip «Совпадение 85%» на карточке offer / sheet
- Driver: chip на карточке request в matching list
- При tap на Match — primary CTA: «Забронировать» (passenger) / «Забрать» (driver)

### 5. Telegram «Написать»

**Backend:**
- Добавить в `OfferDriverSummary` optional `telegramUsername: str | null` (из `users.username` водителя)
- Для reverse direction (driver → passenger): в matching requests out добавить `passengerTelegramUsername`

**Frontend:**
- `OfferMapSheet`, matching cards — кнопка «Написать» → `openExternalLink('https://t.me/{username}')` если username есть; иначе скрыть
- Driver matching list — аналогично для пассажира

**Out of scope:** in-app chat, group chat integration

### 6. Тесты

`backend/tests/test_offer_matching.py` (новый) + расширить `test_driver_ride_offers.py`:
- offers filtered by 2km radius
- match scoring: close route → score high, far → low
- API `/ride-offers/matches` returns sorted results
- driver `/offers/{id}/matches` returns pending requests

Frontend: vitest для pure scoring helpers если вынесены в `lib/offerMatching.ts`

---

## Out of scope (явно не делать)

- Рейтинг водителя/пассажира (отдельная задача)
- Чёрный список (отдельная задача)
- In-app / group chat (только Telegram deep link)
- Пассажир выбирает промежуточные точки вдоль маршрута
- Редактирование offer после публикации
- Админ-модерация offers
- OSRM matrix для MVP матчинга (haversine достаточно; OSRM optional enhancement)

---

## Технические указания

- Миграции БД **не обязательны** если scoring вычисляется on-the-fly
- i18n: lt, pl, en, ru в `frontend/src/i18n/resources.ts`
- UI: следовать `.cursor/rules/app-style-consistency.mdc`, паттерны `DriverAvailableRideSheet`, `OfferMapSheet`, chips/badges
- Карта: offers routes always semi-transparent; selected/highlighted on tap (уже так)
- Не ломать существующие flows бронирования и self-assign

---

## Порядок реализации (для implementer)

1. `offer_matching_service.py` + unit tests scoring
2. Extend ride-offers API (radius filter + matches endpoint)
3. Driver offers matches API
4. Frontend types + API clients
5. Passenger NewRequest matching section + map filter
6. Driver matching section in offers UI
7. Telegram write buttons
8. Seats UX copy
9. i18n + ux-polisher pass

---

## Критерии готовности

- [ ] Пассажир с A+B видит ranked matching offers с % Match и может забронировать
- [ ] Offers на карте фильтруются по ±2 км от A (когда A задана)
- [ ] Водитель видит matching requests для своего open offer и может забрать заявку
- [ ] Отображаются места «занято/свободно из total»
- [ ] Кнопка «Написать» открывает Telegram при наличии username
- [ ] Backend pytest green для новых тестов

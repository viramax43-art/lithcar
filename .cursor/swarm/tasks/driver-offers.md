# Задача: предложения поездок от водителя (driver ride offers)

## Продуктовое описание

Водитель в личном кабинете может опубликовать **поездку на будущее**:
- маршрут: откуда → куда (карта + адрес, как у пассажира)
- дата и время отправления
- количество свободных мест (сколько пассажиров сможет отвезти)

Пассажир в приложении видит список таких предложений и может **забронировать место** (1 пассажир = 1 место). Когда места закончились — предложение недоступно для бронирования.

## Рекомендуемая архитектура (база для feature-architect)

### Новая сущность `driver_ride_offers`

| Поле | Тип | Описание |
|------|-----|----------|
| id | UUID PK | |
| driver_id | FK drivers | автор |
| from_address, from_lat, from_lng | | точка A |
| to_address, to_lat, to_lng | | точка B |
| date_time | timestamptz | время отправления |
| total_seats | int 1–12 | изначальное число мест |
| seats_available | int | уменьшается при бронировании |
| status | enum | `open` / `full` / `cancelled` / `completed` |
| created_at, updated_at | | |

### Связь с существующими заявками

Добавить `ride_requests.offer_id` (nullable FK).

При бронировании пассажиром:
1. Атомарно `seats_available -= 1` (если > 0)
2. Создать `RideRequest` с тем же from/to/datetime, `driver_id` = автор offer, `offer_id` = offer.id, `status = assigned`
3. Списать points через существующий `ride_booking_service`
4. Если `seats_available == 0` → `status = full`

### MVP scope

**В scope:**
- Driver: форма создания offer + список своих offers + отмена
- Passenger: экран/секция «Поездки водителей» — список open offers, кнопка «Забронировать»
- Fixed route: пассажир берёт **тот же маршрут** A→B что указал водитель (без кастомных точек)
- Backend API + миграция + тесты
- Уведомление водителю о новом бронировании (если инфраструктура позволяет без большого diff)

**Out of scope (MVP):**
- Пассажир выбирает промежуточные точки вдоль маршрута
- Админ-модерация offers
- Автоматическое объединение с group_id
- Редактирование offer после публикации

### Точки интеграции

**Backend (новое/изменения):**
- `backend/app/models/driver_ride_offer.py`
- `backend/app/services/driver_offer_service.py`
- `backend/app/api/driver_offers.py` (driver CRUD)
- `backend/app/api/ride_offers.py` (passenger list + book)
- Расширить `driver_portal.py` map data — опционально показывать свои offers
- Миграция `20260612_0031_driver_ride_offers.py` (следующий после `20260610_0030`)

**Frontend:**
- Driver: `DriverOfferForm.tsx`, `DriverOffersList.tsx` — вход из `DriverSideMenu`
- Passenger: `DriverOffers.tsx` или секция + маршрут `/offers` + пункт в `BottomNav`
- Types + `driverApi.ts` + `passengerApi.ts`

**Переиспользовать:**
- `validate_ride_datetime`, zone checks
- `book_ride_with_points` / pricing quote
- Driver status flow после assigned
- Map patterns из `NewRequest` / `DriverCabinet`
- `AdminModalShell` / sheet patterns для форм

### API (черновик)

| Method | Path | Auth | Описание |
|--------|------|------|----------|
| POST | `/api/driver/offers` | driver session | создать offer |
| GET | `/api/driver/offers` | driver session | мои offers |
| DELETE | `/api/driver/offers/{id}` | driver session | отменить (если нет in_progress bookings) |
| GET | `/api/ride-offers` | passenger bearer | список open offers (фильтр date, zones) |
| GET | `/api/ride-offers/{id}` | passenger bearer | детали |
| POST | `/api/ride-offers/{id}/book` | passenger bearer | забронировать место |

### Тесты

- create offer, book seat, seats_available decrement
- book when full → 409
- cancel offer with active bookings → правило (запрет или soft cancel)
- zone validation
- integration: book creates RideRequest with driver_id + offer_id

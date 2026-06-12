# Задача: поездки водителей на карте пассажира

## Контекст

Фича driver ride offers уже реализована:
- API: `GET /api/ride-offers` возвращает `fromPoint`/`toPoint` с lat/lng
- UI: список `/offers` (`DriverOffers.tsx`) — **без карты**
- Главная карта пассажира: `NewRequest.tsx` — показывает public map marks, но **не offers**

## Цель

Пассажир на **главной карте** (`/`, `NewRequest.tsx`) видит открытые предложения водителей:
- маркер(ы) на карте (точка отправления offer — pickup)
- пунктир A→B для выбранного/наведённого offer (как у собственного маршрута)
- popup/sheet с краткой инфо: водитель, время, места, цена → кнопка «Забронировать»

## Требования UX/UI

- Следовать `.cursor/rules/app-style-consistency.mdc` и паттернам `NewRequest.tsx`
- Цвета: точка A — `point-a` (красная), B — `point-b`; пунктир между A и B
- Offers не должны мешать выбору своих точек A/B (режим pin picking)
- Когда пассажир выбирает точки (`isPinLive`) — offers видны, но полупрозрачные или меньше; tap на offer открывает sheet, не сдвигает pin
- Переиспользовать `listRideOffers` из `passengerApi.ts` — **новый backend endpoint не нужен**, если хватает lat/lng в ответе
- i18n: lt, pl, en, ru (ключи `passenger.offers.map*`)

## Реализация (рекомендация)

### 1. Данные
- В `useNewRequestController` или отдельном хуке `usePassengerRideOffersOnMap`:
  - загрузка `listRideOffers({ limit: 50 })` при mount + refresh при focus (опционально polling 60s)
  - state: `rideOffers`, `selectedOfferId`, `isOfferSheetOpen`

### 2. Карта (`NewRequest.tsx`)
- Для каждого open offer (seatsAvailable > 0):
  - `Marker` на `from.latlng` — иконка отличная от A/B (например Car, зелёный/чёрный pill, как amber у driver available)
  - При `selectedOfferId === offer.id`: показать `Marker` B + `Polyline` пунктир (как existing from/to polyline)
- `Popup` или tap → bottom sheet (паттерн `DriverAvailableRideSheet` / существующие sheets)

### 3. Sheet бронирования
- Переиспользовать логику book из `DriverOffers.tsx` (`bookRideOffer`, confirm, navigate to request detail)
- Можно вынести `OfferBookSheet.tsx` и использовать и в `/offers`, и на карте (DRY — опционально, не обязательно в MVP)

### 4. Навигация
- Сохранить пункт меню «Поездки водителей» → `/offers` (список остаётся)
- На карте — badge/legend «N поездок» опционально

### 5. Edge cases
- Пустой список — ничего на карте
- Offer вне viewport — не проблема
- Не ломать `publicMapMarks`, `MapBinder`, pan/pin flow
- Не ломать geocode fix (`useMemo` activeZones, `armPinFromMapCenterRef`)

### 6. Тесты
- Backend: скорее не нужны (API есть)
- Frontend: опционально unit для mapper/filter; `npm run build` + vitest must pass

## Out of scope
- Clustering маркеров
- Фильтр по дате на карте
- Admin map view offers

## Файлы для изменения (ожидаемо)

- `frontend/src/pages/passenger/NewRequest.tsx`
- `frontend/src/pages/passenger/new-request/useNewRequestController.ts` (или новый хук)
- `frontend/src/pages/passenger/components/OfferMapSheet.tsx` (новый)
- `frontend/src/lib/mapMarkIcons.ts` или локальная иконка offer
- `frontend/src/i18n/resources.ts`

# Задача 1/3: Фьючеры водителей — ПОЛНЫЙ SCOPE (один прогон роя)

> **Задачи 2 (рейтинг) и 3 (чёрный список) — отдельные файлы, НЕ делать в этом прогоне.**

## Продуктовое описание (источник истины)

Фьючер водителя — 4 вводных: **откуда, куда, когда, сколько мест в наличии** (например из 8 трёх уже занято → показываем «3 занято · 5 свободно из 8»).

Пример карточки:
```
Mercedes Sprinter
5 мест свободно из 8
Выезжаю от (карта + адрес)
Еду до (карта + адрес)
```

Подбор попутчиков тремя способами:
1. **Водитель** подбирает из заявок (в контексте своего оффера)
2. **Попутчик** подбирает из предложений
3. **Система** предлагает обеим сторонам — **динамическая кнопка совпадения (Match)**

На карте: offers/заявки в радиусе **±2 км** от точки выезда.

Когда пассажир или водитель указывает **A и B** — показывать максимально близкие и подходящие offers/requests **в обоих направлениях**.

Любая сторона может **сделать предложение** (бронь / claim) и **написать в ЛС** (Telegram).

Водитель и пассажир могут ставить **несколько фьючеров**.

---

## Уже реализовано — НЕ переписывать, только дополнять пробелы

Проверь код и **не ломай** работающее:

| Фича | Статус | Ключевые файлы |
|------|--------|----------------|
| CRUD офферов (A,B,datetime,totalSeats) | ✅ | `driver_offer_service.py`, `DriverOfferForm.tsx`, `useDriverOfferFormController.ts` |
| Бронь пассажиром → assigned RideRequest | ✅ | `book_offer_seat`, `DriverOffers.tsx`, `OfferMapSheet.tsx` |
| Offers на карте пассажира | ✅ | `NewRequest.tsx`, `usePassengerRideOffersOnMap.ts` |
| Geofilter ±2km backend + frontend | ✅ | `driver_offer_service.py`, `ride_offers.py`, `GEO_RADIUS_KM=2` |
| Match scoring API | ✅ | `offer_matching_service.py`, `/ride-offers/matches`, `/driver/offers/{id}/matches` |
| Claim с offerId + decrement seats | ✅ | `claim_request_with_offer`, `DriverOffersList.tsx` |
| Seats display «X занято · Y свободно из Z» | ✅ | `offerSeats.ts`, `DriverOffers.tsx`, `OfferMapSheet.tsx`, `DriverOffersList.tsx` |
| Telegram «Написать» | ✅ | `OfferMapSheet.tsx`, `DriverOffers.tsx`, `DriverOffersList.tsx` |
| Match chip ≥60% | ✅ | `MatchScoreChip.tsx` |
| Несколько офферов / несколько броней | ✅ | без лимита offers; `already_booked` на тот же offer |
| Backend tests | ✅ | `test_offer_matching.py`, `test_driver_ride_offers.py` — 141 passed |

---

## Реализовать / дополировать в ЭТОМ прогоне (пробелы до полного spec)

### A. Карточка оффера = Mercedes + места + маршрут (UI polish)

**Driver `DriverOffersList.tsx`:**
- Строка авто: `{carBrand} {carModel}` или `carModel` (как в passenger cards) — **сейчас нет carModel в списке водителя**
- Если API driver offers не отдаёт carModel — расширить backend DTO + mapper (минимальный diff)

**Passenger match-карточки `NewRequest.tsx` (секция matching):**
- Показать: `carModel`, seats summary, datetime, driver name
- Сейчас только адреса + имя + points — **обогатить до эталона `DriverOffers.tsx` / `OfferMapSheet.tsx`**

**Passenger `/offers` list + `OfferMapSheet`:** сверить с эталоном spec — если уже OK, не трогать.

### B. Динамическая кнопка Match (не только chip)

Spec: «Кнопка — соответствия динамические».

**Passenger:**
- При `matchScore >= 60`: primary-кнопка **«Совпадение N%»** / «Match N%» на match-карточке и в `OfferMapSheet` (chip можно оставить, но нужна явная CTA-кнопка Match → открывает sheet / confirm book)
- CTA текст меняется по score (60–79 «Возможное совпадение», 80+ «Отличное совпадение») — i18n lt/pl/en/ru

**Driver `DriverOffersList.tsx`:**
- На строке open offer: badge **«N совпадений»** (prefetch count или top match score) без обязательного ручного expand
- В matching list: primary **«Match N% — Забрать»** когда score ≥ 60 (не только chip + отдельная кнопка Claim)

### C. Matching «в обе стороны» — UX довести до spec

**Passenger (A+B заданы):**
- ✅ секция matching + карта — проверить что offers на карте = только matches ≥60 после A+B
- Добавить tap на Match-карточку → highlight route на карте + open sheet (частично есть — проверить end-to-end)

**Driver:**
- Auto-load matching count для open offers при открытии списка (debounced, limit 10)
- Expand matching section по умолчанию если есть matches ≥60 (optional auto-expand first offer with matches)

### D. Карта ±2 km — проверить edge cases

- Только A (без B): карта показывает offers в pickup radius 2km — **уже есть, проверить**
- A+B: full route match, не только pickup filter — **уже есть через `/matches`, проверить merge logic в `usePassengerRideOffersOnMap.ts`**

Если найдёшь баг — почини. Если работает — не рефактори.

### E. «Предложение» обеим сторонам

- Passenger propose = book offer ✅
- Driver propose = claim with offerId ✅
- Убедиться что после claim seats decrement и offer_id проставлен — regression test если нужен

### F. Telegram ЛС

- ✅ уже есть — проверить что username показывается когда есть; кнопка скрыта когда null

---

## Out of scope (этот прогон)

- ❌ Рейтинг (задача 2)
- ❌ Чёрный список (задача 3)
- ❌ In-app chat
- ❌ Ввод «занято мест» вручную при создании offer (занято = bookings, total = totalSeats — так и оставить)
- ❌ Редактирование offer после публикации
- ❌ OSRM для матчинга

---

## Acceptance criteria (все должны быть ✅)

- [ ] Водитель создаёт offer: A, B, when, totalSeats на карте
- [ ] Карточка водителя показывает модель авто + «X занято · Y свободно из Z»
- [ ] Пассажир видит offers ±2km от A на карте
- [ ] Пассажир с A+B видит ranked matches + **кнопку Match N%** + book flow
- [ ] Водитель видит matching requests с **Match N% + Забрать** (prefetch/count на списке)
- [ ] Telegram «Написать» работает
- [ ] Несколько офферов у водителя
- [ ] `docker compose -f docker-compose.test.yml` → pytest green
- [ ] `npm run build` green

---

## Порядок работы

1. Прочитай `.cursor/swarm/artifacts/ux-context.md` (или собери заново если пусто)
2. Architect: gap analysis → `feature-spec.md` (только пробелы A–F)
3. Implementer: минимальный diff
4. UX polisher: карточки как `DriverOffers.tsx` / `OfferMapSheet`
5. Test-runner: green

## Переиспользовать

- `MatchScoreChip`, `offerSeats.ts`, `offer_matching_service.py`
- Паттерны: `DriverAvailableRideSheet`, `OfferMapSheet`, chips/pills
- i18n: `frontend/src/i18n/resources.ts` (lt, pl, en, ru)

# Задача: чёрный список — ОТДЕЛЬНЫЙ ЗАПУСК РОЯ

> Запускать **после** ratings-both-sides.md (или параллельно если не пересекаются)

## Продуктовое описание (черновик — дополнить перед запуском)

- Водитель может заблокировать пассажира и наоборот
- Заблокированные не видят offers/requests друг друга, не могут бронировать/claim
- UI: кнопка «Заблокировать» в карточке поездки / sheet + управление в Profile

## Scope TBD

feature-architect: модель `user_blocks`, API block/unblock/list, фильтры в matching/booking/claim.

## Out of scope

- Admin moderation queue

from __future__ import annotations

from app.models.user import UserLanguage

SUPPORTED_LANGUAGES = {
    UserLanguage.LT,
    UserLanguage.PL,
    UserLanguage.EN,
    UserLanguage.RU,
}


TRANSLATIONS: dict[str, dict[str, str]] = {
    "lang.pick": {
        "lt": "Pasirinkite kalba:",
        "pl": "Wybierz jezyk:",
        "en": "Choose language:",
        "ru": "Выберите язык:",
    },
    "lang.changed": {
        "lt": "Kalba atnaujinta.",
        "pl": "Jezyk zaktualizowany.",
        "en": "Language updated.",
        "ru": "Язык обновлен.",
    },
    "menu.welcome": {
        "lt": (
            "Sveiki atvyke i Ride! 🚗\n\n"
            "Greitos grupines keliones ir apmokejimas taskais.\n\n"
            "Pasirinkite patogu uzsakymo buda:"
        ),
        "pl": (
            "Witamy w Ride! 🚗\n\n"
            "Szybkie przejazdy grupowe i platnosc punktami.\n\n"
            "Wybierz wygodny sposob zamowienia:"
        ),
        "en": (
            "Welcome to Ride! 🚗\n\n"
            "Comfortable group rides paid with points.\n\n"
            "Choose a convenient booking method:"
        ),
        "ru": (
            "Добро пожаловать в Ride! 🚗\n\n"
            "Удобные групповые поездки с оплатой поинтами.\n\n"
            "Выберите удобный способ оформления поездки:"
        ),
    },
    "menu.cancelled": {
        "lt": "Uzsakymas atsauktas.",
        "pl": "Zamowienie anulowano.",
        "en": "Booking cancelled.",
        "ru": "Оформление отменено.",
    },
    "menu.open_mini_app": {
        "lt": "📱 Atidaryti Mini App",
        "pl": "📱 Otworz Mini App",
        "en": "📱 Open Mini App",
        "ru": "📱 Открыть Mini App",
    },
    "menu.book_in_bot": {
        "lt": "🤖 Uzsakyti per bota",
        "pl": "🤖 Zamow przez bota",
        "en": "🤖 Book in bot",
        "ru": "🤖 Оформить через бота",
    },
    "menu.change_language": {
        "lt": "🌐 Pakeisti kalba",
        "pl": "🌐 Zmien jezyk",
        "en": "🌐 Change language",
        "ru": "🌐 Сменить язык",
    },
    "menu.confirm_ride": {
        "lt": "Patvirtinti kelione",
        "pl": "Potwierdz przejazd",
        "en": "Confirm ride",
        "ru": "Подтвердить поездку",
    },
    "menu.edit": {
        "lt": "Redaguoti",
        "pl": "Edytuj",
        "en": "Edit",
        "ru": "Изменить",
    },
    "menu.cancel": {
        "lt": "Atsaukti",
        "pl": "Anuluj",
        "en": "Cancel",
        "ru": "Отмена",
    },
    "menu.back_to_confirm": {
        "lt": "Atgal i patvirtinima",
        "pl": "Powrot do potwierdzenia",
        "en": "Back to confirmation",
        "ru": "Назад к подтверждению",
    },
    "pickup.confirm_button": {
        "lt": "✅ Patvirtinti paemimo taska",
        "pl": "✅ Potwierdz punkt odbioru",
        "en": "✅ Confirm pickup point",
        "ru": "✅ Подтвердить точку посадки",
    },
    "pickup.not_found": {
        "lt": "Kelione nerasta.",
        "pl": "Nie znaleziono przejazdu.",
        "en": "Ride not found.",
        "ru": "Поездка не найдена.",
    },
    "pickup.address": {
        "lt": "Adresas",
        "pl": "Adres",
        "en": "Address",
        "ru": "Адрес",
    },
    "pickup.thanks": {
        "lt": "Aciu! Vairuotojas jau informuotas.",
        "pl": "Dziekujemy! Kierowca juz wie.",
        "en": "Thanks! Driver is already informed.",
        "ru": "Спасибо! Водитель уже знает.",
    },
    "pickup.confirmed": {
        "lt": "Taskas patvirtintas!",
        "pl": "Punkt potwierdzony!",
        "en": "Pickup point confirmed!",
        "ru": "Точка подтверждена!",
    },
    "booking.confirm.title": {
        "lt": "Patikrinkite keliones detales:",
        "pl": "Sprawdz szczegoly przejazdu:",
        "en": "Review ride details:",
        "ru": "Проверьте детали поездки:",
    },
    "booking.pointA": {"lt": "Taskas A", "pl": "Punkt A", "en": "Point A", "ru": "Точка A"},
    "booking.pointB": {"lt": "Taskas B", "pl": "Punkt B", "en": "Point B", "ru": "Точка B"},
    "booking.datetime_date": {"lt": "Data", "pl": "Data", "en": "Date", "ru": "Дата"},
    "booking.datetime_time": {"lt": "Laikas", "pl": "Czas", "en": "Time", "ru": "Время"},
    "booking.datetime": {"lt": "Data ir laikas", "pl": "Data i czas", "en": "Date and time", "ru": "Дата и время"},
    "booking.cost": {"lt": "Kaina taskais", "pl": "Koszt w punktach", "en": "Cost in points", "ru": "Стоимость"},
    "booking.balance": {"lt": "Jusu balansas", "pl": "Twoje saldo", "en": "Your balance", "ru": "Ваш баланс"},
    "booking.ask_point_a": {
        "lt": "Atsiuskite tasko A geolokacija.",
        "pl": "Wyslij geolokalizacje punktu A.",
        "en": "Send pickup point A location.",
        "ru": "Отправьте геопозицию точки A (откуда вас забрать).",
    },
    "booking.ask_point_a_retry": {
        "lt": "Reikalinga geolokacija taskui A.",
        "pl": "Potrzebna geolokalizacja punktu A.",
        "en": "Please send location for point A.",
        "ru": "Нужна именно геопозиция. Отправьте точку A через вложение локации в Telegram.",
    },
    "booking.ask_point_b": {
        "lt": "Puiku. Dabar atsiuskite tasko B geolokacija.",
        "pl": "Swietnie. Teraz wyslij geolokalizacje punktu B.",
        "en": "Great. Now send point B location.",
        "ru": "Отлично. Теперь отправьте геопозицию точки B (куда поедем).",
    },
    "booking.ask_point_b_retry": {
        "lt": "Reikalinga geolokacija taskui B.",
        "pl": "Potrzebna geolokalizacja punktu B.",
        "en": "Please send location for point B.",
        "ru": "Нужна геопозиция точки B. Отправьте локацию сообщением.",
    },
    "booking.ask_date": {
        "lt": "Iveskite data formatu DD.MM.YYYY.",
        "pl": "Wpisz date w formacie DD.MM.YYYY.",
        "en": "Enter date in DD.MM.YYYY format.",
        "ru": "Введите дату поездки в формате ДД.ММ.ГГГГ.",
    },
    "booking.ask_date_retry": {
        "lt": "Neteisinga data. Pvz: 21.05.2026",
        "pl": "Niepoprawna data. Przyklad: 21.05.2026",
        "en": "Invalid date. Example: 21.05.2026",
        "ru": "Не понял дату. Пример: 21.05.2026",
    },
    "booking.date_in_past": {
        "lt": "Data negali buti praeityje.",
        "pl": "Data nie moze byc w przeszlosci.",
        "en": "Date cannot be in the past.",
        "ru": "Дата не может быть в прошлом.",
    },
    "booking.ask_time": {
        "lt": "Data issaugota. Dabar iveskite laika HH:MM.",
        "pl": "Data zapisana. Teraz wpisz czas HH:MM.",
        "en": "Date saved. Now enter time HH:MM.",
        "ru": "Дата сохранена. Теперь введите время в формате ЧЧ:ММ.",
    },
    "booking.ask_time_retry": {
        "lt": "Neteisingas laikas. Pvz: 19:30",
        "pl": "Niepoprawny czas. Przyklad: 19:30",
        "en": "Invalid time. Example: 19:30",
        "ru": "Неверный формат времени. Пример: 19:30",
    },
    "booking.edit_prompt": {
        "lt": "Ka norite redaguoti?",
        "pl": "Co chcesz zmienic?",
        "en": "What do you want to edit?",
        "ru": "Что хотите изменить?",
    },
    "booking.back_to_confirm": {
        "lt": "Grazinu patvirtinima.",
        "pl": "Wracam do potwierdzenia.",
        "en": "Back to confirmation.",
        "ru": "Возвращаю подтверждение.",
    },
    "booking.ask_point_a_new": {
        "lt": "Atsiuskite nauja tasko A geolokacija.",
        "pl": "Wyslij nowa geolokalizacje punktu A.",
        "en": "Send new point A location.",
        "ru": "Отправьте новую геопозицию точки A.",
    },
    "booking.ask_point_b_new": {
        "lt": "Atsiuskite nauja tasko B geolokacija.",
        "pl": "Wyslij nowa geolokalizacje punktu B.",
        "en": "Send new point B location.",
        "ru": "Отправьте новую геопозицию точки B.",
    },
    "booking.ask_date_new": {
        "lt": "Iveskite nauja data DD.MM.YYYY.",
        "pl": "Wpisz nowa date DD.MM.YYYY.",
        "en": "Enter new date DD.MM.YYYY.",
        "ru": "Введите новую дату в формате ДД.ММ.ГГГГ.",
    },
    "booking.ask_time_new": {
        "lt": "Iveskite nauja laika HH:MM.",
        "pl": "Wpisz nowy czas HH:MM.",
        "en": "Enter new time HH:MM.",
        "ru": "Введите новое время в формате ЧЧ:ММ.",
    },
    "booking.already_submitting": {
        "lt": "Uzsakymas jau apdorojamas.",
        "pl": "Zamowienie jest juz przetwarzane.",
        "en": "Request is already being processed.",
        "ru": "Заявка уже обрабатывается.",
    },
    "booking.insufficient_points": {
        "lt": "Nepakanka tasku uzsakymui.",
        "pl": "Za malo punktow na zamowienie.",
        "en": "Not enough points for booking.",
        "ru": "Недостаточно поинтов для оформления.",
    },
    "booking.required": {"lt": "Reikia", "pl": "Wymagane", "en": "Required", "ru": "Нужно"},
    "booking.current": {"lt": "Turite", "pl": "Masz", "en": "Current", "ru": "у вас"},
    "booking.failed": {
        "lt": "Nepavyko sukurti keliones",
        "pl": "Nie udalo sie utworzyc przejazdu",
        "en": "Failed to create ride",
        "ru": "Не удалось оформить поездку",
    },
    "booking.invalid_datetime": {
        "lt": "Nepavyko sukurti keliones. Patikrinkite data ir laika.",
        "pl": "Nie udalo sie utworzyc przejazdu. Sprawdz date i czas.",
        "en": "Failed to create ride. Check date and time.",
        "ru": "Не удалось оформить поездку. Проверьте дату и время.",
    },
    "booking.created": {
        "lt": "Kelione sukurta.",
        "pl": "Przejazd utworzony.",
        "en": "Ride created.",
        "ru": "Поездка оформлена.",
    },
    "booking.debited": {"lt": "Nurasyta", "pl": "Pobrano", "en": "Debited", "ru": "Списано"},
    "booking.remaining": {"lt": "Likutis", "pl": "Pozostalo", "en": "Remaining", "ru": "Остаток"},
    "common.done": {"lt": "Atlikta", "pl": "Gotowe", "en": "Done", "ru": "Готово"},
    "booking.already_processed": {
        "lt": "Si uzklausa jau apdorota.",
        "pl": "To zamowienie zostalo juz przetworzone.",
        "en": "This request has already been processed.",
        "ru": "Эта заявка уже обработана.",
    },
    "notif.assigned": {
        "lt": "✅ Jusu kelionei paskirtas vairuotojas!",
        "pl": "✅ Do Twojego przejazdu przypisano kierowce!",
        "en": "✅ A driver has been assigned to your ride!",
        "ru": "✅ Для вашей поездки назначен водитель!",
    },
    "notif.pickup": {
        "lt": "Paemimas",
        "pl": "Odbior",
        "en": "Pickup",
        "ru": "Подача",
    },
    "notif.date": {
        "lt": "Data",
        "pl": "Data",
        "en": "Date",
        "ru": "Дата",
    },
    "notif.time": {
        "lt": "Laikas",
        "pl": "Czas",
        "en": "Time",
        "ru": "Время",
    },
    "notif.en_route": {
        "lt": "🚗 Vairuotojas jau vaziuoja pas jus!\n\nLaukite salia paemimo tasko.",
        "pl": "🚗 Kierowca juz jedzie do Ciebie!\n\nPozostan blisko punktu odbioru.",
        "en": "🚗 Your driver is on the way!\n\nPlease stay near pickup point.",
        "ru": "🚗 Водитель уже едет к вам!\n\nОставайтесь рядом с точкой подачи.",
    },
    "notif.awaiting": {
        "lt": "📍 Vairuotojas jau atvyko ir jusu laukia.",
        "pl": "📍 Kierowca juz czeka na miejscu.",
        "en": "📍 Driver has arrived and is waiting for you.",
        "ru": "📍 Водитель приехал на место и ждёт вас.",
    },
    "notif.in_progress": {
        "lt": "▶️ Kelione prasidejo. Geros keliones!",
        "pl": "▶️ Przejazd sie rozpoczal. Szerokiej drogi!",
        "en": "▶️ Ride has started. Have a safe trip!",
        "ru": "▶️ Поездка началась. Приятной дороги!",
    },
    "notif.completed": {
        "lt": "🏁 Kelione baigta.",
        "pl": "🏁 Przejazd zakonczony.",
        "en": "🏁 Ride completed.",
        "ru": "🏁 Поездка завершена.",
    },
    "notif.route": {
        "lt": "Marsrutas",
        "pl": "Trasa",
        "en": "Route",
        "ru": "Маршрут",
    },
    "notif.thanks": {
        "lt": "Aciu, kad naudojates Ride!",
        "pl": "Dziekujemy za korzystanie z Ride!",
        "en": "Thanks for using Ride!",
        "ru": "Спасибо, что воспользовались Ride!",
    },
    "notif.pickup_changed": {
        "lt": "📍 Vairuotojas pakeite paemimo taska!",
        "pl": "📍 Kierowca zmienil punkt odbioru!",
        "en": "📍 Driver changed your pickup point!",
        "ru": "📍 Водитель изменил точку подачи!",
    },
    "notif.new_pickup": {
        "lt": "Naujas taskas",
        "pl": "Nowy punkt",
        "en": "New point",
        "ru": "Новая точка",
    },
    "notif.pickup_confirm_prompt": {
        "lt": "Patvirtinkite nauja paemimo taska mygtuku zemiau.",
        "pl": "Potwierdz nowy punkt odbioru przyciskiem ponizej.",
        "en": "Please confirm the new pickup point using the button below.",
        "ru": "Пожалуйста, подтвердите новую точку посадки кнопкой ниже.",
    },
    "notif.dropoff": {
        "lt": "Paskirtis",
        "pl": "Cel",
        "en": "Destination",
        "ru": "Назначение",
    },
    "notif.dropoff_changed": {
        "lt": "📍 Vairuotojas pakeite paskirties taska!",
        "pl": "📍 Kierowca zmienil punkt docelowy!",
        "en": "📍 Driver changed your destination!",
        "ru": "📍 Водитель изменил точку назначения!",
    },
    "notif.admin_pickup_changed": {
        "lt": "📍 Administratorius pakeite A taska (paemima)",
        "pl": "📍 Administrator zmienil punkt A (odbior)",
        "en": "📍 Administrator changed point A (pickup)",
        "ru": "📍 Администратор изменил точку A (подачу)",
    },
    "notif.admin_dropoff_changed": {
        "lt": "📍 Administratorius pakeite B taska (paskirtis)",
        "pl": "📍 Administrator zmienil punkt B (cel)",
        "en": "📍 Administrator changed point B (destination)",
        "ru": "📍 Администратор изменил точку B (назначение)",
    },
    "notif.passenger_pickup_changed": {
        "lt": "📍 Keleivis pakeite A taska (paemima)",
        "pl": "📍 Pasazer zmienil punkt A (odbior)",
        "en": "📍 Passenger changed point A (pickup)",
        "ru": "📍 Пассажир изменил точку A (подачу)",
    },
    "notif.passenger_dropoff_changed": {
        "lt": "📍 Keleivis pakeite B taska (paskirtis)",
        "pl": "📍 Pasazer zmienil punkt B (cel)",
        "en": "📍 Passenger changed point B (destination)",
        "ru": "📍 Пассажир изменил точку B (назначение)",
    },
    "notif.route_changed_by_admin": {
        "lt": "📍 Administratorius pakeite marsruto taska",
        "pl": "📍 Administrator zmienil punkt trasy",
        "en": "📍 Administrator changed a route point",
        "ru": "📍 Администратор изменил точку маршрута",
    },
    "notif.route_changed_by_passenger": {
        "lt": "📍 Keleivis pakeite marsruto taska",
        "pl": "📍 Pasazer zmienil punkt trasy",
        "en": "📍 Passenger changed a route point",
        "ru": "📍 Пассажир изменил точку маршрута",
    },
    "notif.admin.driver_application_new.title": {
        "lt": "Nauja vairuotojo paraiška",
        "pl": "Nowe zgloszenie kierowcy",
        "en": "New driver application",
        "ru": "Новая заявка водителя",
    },
    "notif.admin.driver_application_new.body": {
        "lt": "Gauta nauja vairuotojo paraiška nuo {applicant_name}. Perziurekite ir patvirtinkite arba atminkite.",
        "pl": "Otrzymano nowe zgloszenie kierowcy od {applicant_name}. Sprawdz i zatwierdz lub odrzuc.",
        "en": "A new driver application from {applicant_name} was received. Review and approve or reject.",
        "ru": "Получена новая заявка водителя от {applicant_name}. Рассмотрите и одобрите или отклоните.",
    },
    "driver.application.submitted": {
        "lt": "✅ Jusu vairuotojo paraiška gauta ir perduota perziurai.",
        "pl": "✅ Twoje zgloszenie kierowcy zostalo przyjete i przekazane do weryfikacji.",
        "en": "✅ Your driver application has been received and sent for review.",
        "ru": "✅ Ваша заявка водителя получена и отправлена на проверку.",
    },
    "driver.application.approved": {
        "lt": "🎉 Sveikiname! Jusu paraiška patvirtinta.\n\nAtidarykite vairuotojo kabineta — prisijungimas bus automatinis:\n{enter_url}",
        "pl": "🎉 Gratulacje! Twoje zgloszenie zostalo zatwierdzone.\n\nOtworz panel kierowcy — logowanie bedzie automatyczne:\n{enter_url}",
        "en": "🎉 Congratulations! Your application has been approved.\n\nOpen the driver cabinet — you will be signed in automatically:\n{enter_url}",
        "ru": "🎉 Поздравляем! Ваша заявка одобрена.\n\nОткройте кабинет водителя — вход будет автоматическим:\n{enter_url}",
    },
    "driver.application.open_cabinet": {
        "lt": "🚗 Vairuotojo kabinetas",
        "pl": "🚗 Panel kierowcy",
        "en": "🚗 Driver cabinet",
        "ru": "🚗 Кабинет водителя",
    },
    "driver.application.rejected": {
        "lt": "❌ Jusu vairuotojo paraiška atmesta.\n\nPriezastis: {reason}",
        "pl": "❌ Twoje zgloszenie kierowcy zostalo odrzucone.\n\nPowod: {reason}",
        "en": "❌ Your driver application was rejected.\n\nReason: {reason}",
        "ru": "❌ Ваша заявка водителя отклонена.\n\nПричина: {reason}",
    },
    "driver.application.rejected_no_reason": {
        "lt": "Nenurodyta",
        "pl": "Nie podano",
        "en": "Not specified",
        "ru": "Не указана",
    },
}


def normalize_lang(language: str | None) -> str:
    value = (language or "").strip().lower()
    if value in SUPPORTED_LANGUAGES:
        return value
    return UserLanguage.LT


def t(key: str, lang: str | None) -> str:
    normalized = normalize_lang(lang)
    table = TRANSLATIONS.get(key, {})
    return table.get(normalized) or table.get(UserLanguage.RU) or key

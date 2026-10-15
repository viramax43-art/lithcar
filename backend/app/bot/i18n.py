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
    "booking.open_map_picker": {
        "lt": "🗺 Atidaryti zemelapi",
        "pl": "🗺 Otworz mape",
        "en": "🗺 Open map",
        "ru": "🗺 Выбрать на карте",
    },
    "booking.ask_point_a": {
        "lt": "Pasirinkite taska A zemelapyje arba atsiuskite geolokacija.",
        "pl": "Wybierz punkt A na mapie albo wyslij geolokalizacje.",
        "en": "Pick point A on the map or send your location.",
        "ru": "Выберите точку A на карте или отправьте геопозицию.",
    },
    "booking.ask_point_a_retry": {
        "lt": "Atidarykite zemelapi arba atsiuskite geolokacija taskui A.",
        "pl": "Otworz mape albo wyslij geolokalizacje punktu A.",
        "en": "Open the map or send location for point A.",
        "ru": "Откройте карту кнопкой ниже или отправьте геопозицию точки A.",
    },
    "booking.ask_point_b": {
        "lt": "Puiku. Dabar pasirinkite taska B zemelapyje arba atsiuskite geolokacija.",
        "pl": "Swietnie. Teraz wybierz punkt B na mapie albo wyslij geolokalizacje.",
        "en": "Great. Now pick point B on the map or send location.",
        "ru": "Отлично. Теперь выберите точку B на карте или отправьте геопозицию.",
    },
    "booking.ask_point_b_retry": {
        "lt": "Atidarykite zemelapi arba atsiuskite geolokacija taskui B.",
        "pl": "Otworz mape albo wyslij geolokalizacje punktu B.",
        "en": "Open the map or send location for point B.",
        "ru": "Откройте карту кнопкой ниже или отправьте геопозицию точки B.",
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
        "lt": "Pasirinkite nauja taska A zemelapyje arba atsiuskite geolokacija.",
        "pl": "Wybierz nowy punkt A na mapie albo wyslij geolokalizacje.",
        "en": "Pick a new point A on the map or send location.",
        "ru": "Выберите новую точку A на карте или отправьте геопозицию.",
    },
    "booking.ask_point_b_new": {
        "lt": "Pasirinkite nauja taska B zemelapyje arba atsiuskite geolokacija.",
        "pl": "Wybierz nowy punkt B na mapie albo wyslij geolokalizacje.",
        "en": "Pick a new point B on the map or send location.",
        "ru": "Выберите новую точку B на карте или отправьте геопозицию.",
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
    "booking.payment.choose": {
        "lt": "Pasirinkite mokejimo buda:",
        "pl": "Wybierz sposob platnosci:",
        "en": "Choose a payment method:",
        "ru": "Выберите способ оплаты:",
    },
    "booking.payment.summary": {
        "lt": "Mokejimas",
        "pl": "Platnosc",
        "en": "Payment",
        "ru": "Оплата",
    },
    "booking.payment.edit": {
        "lt": "Mokejimo budas",
        "pl": "Sposob platnosci",
        "en": "Payment method",
        "ru": "Способ оплаты",
    },
    "booking.payment.points": {
        "lt": "Taskai (nuo balanso)",
        "pl": "Punkty (z salda)",
        "en": "Points (from balance)",
        "ru": "Поинты (с баланса)",
    },
    "booking.payment.driver_cash": {
        "lt": "Grynais vairuotojui po keliones",
        "pl": "Gotowka kierowcy po przejezdzie",
        "en": "Cash to driver after the ride",
        "ru": "Наличными водителю по факту",
    },
    "booking.payment.driver_card": {
        "lt": "Kortele vairuotojui po keliones",
        "pl": "Karta u kierowcy po przejezdzie",
        "en": "Card to driver after the ride",
        "ru": "Картой водителю по факту",
    },
    "booking.payment.driver_cash_terms": {
        "lt": (
            "Testinis tekstas: mokate grynais vairuotojui keliones pabaigoje. "
            "Taskai nuo balanso nenuwrite. Sumokate orientacine kaina, rodoma uzsakyme. "
            "Pasiruoškite tikslią sumą arba apvalią sumą."
        ),
        "pl": (
            "Tekst testowy: placisz gotowka kierowcy po zakonczeniu przejazdu. "
            "Punkty z salda nie sa pobierane. Placisz orientacyjna cene z zamowienia. "
            "Przygotuj dokladna lub zaokraglona kwote."
        ),
        "en": (
            "Test text: you pay the driver in cash at the end of the ride. "
            "No points are deducted from your balance. You pay the estimated price shown in the booking. "
            "Please have the exact or rounded amount ready."
        ),
        "ru": (
            "Тестовый текст: оплата наличными водителю по завершении поездки. "
            "Поинты с баланса не списываются. Сумма — ориентировочная, как в заявке. "
            "Подготовьте точную или округлённую сумму."
        ),
    },
    "booking.payment.driver_card_terms": {
        "lt": (
            "Testinis tekstas: mokate kortele vairuotojui keliones pabaigoje. "
            "Taskai nuo balanso nenuwrite. Vairuotojas gali priimti bekontakti arba per terminala. "
            "Orientacine suma rodoma uzsakyme."
        ),
        "pl": (
            "Tekst testowy: placisz karta u kierowcy po zakonczeniu przejazdu. "
            "Punkty z salda nie sa pobierane. Kierowca moze przyjac platnosc zblieniowa lub terminalem. "
            "Orientacyjna cena jest widoczna w zamowieniu."
        ),
        "en": (
            "Test text: you pay the driver by card at the end of the ride. "
            "No points are deducted from your balance. The driver may accept contactless or terminal payment. "
            "The estimated price is shown in the booking."
        ),
        "ru": (
            "Тестовый текст: оплата картой водителю по завершении поездки. "
            "Поинты с баланса не списываются. Водитель может принять бесконтактную оплату или через терминал. "
            "Ориентировочная сумма указана в заявке."
        ),
    },
    "booking.payment.estimated_price": {
        "lt": "Numatoma kaina",
        "pl": "Szacunkowa cena",
        "en": "Estimated price",
        "ru": "Ориентировочная стоимость",
    },
    "booking.payment.invalid": {
        "lt": "Pasirinkite mokejimo buda is saraso.",
        "pl": "Wybierz sposob platnosci z listy.",
        "en": "Choose a payment method from the list.",
        "ru": "Выберите способ оплаты из списка.",
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
    "driver.offer.booked": {
        "lt": "🎫 Nauja rezervacija: {passenger_name}\n{from_address} → {to_address}\n{date_time}\nLiko vietų: {seats_available}",
        "pl": "🎫 Nowa rezerwacja: {passenger_name}\n{from_address} → {to_address}\n{date_time}\nWolne miejsca: {seats_available}",
        "en": "🎫 New booking: {passenger_name}\n{from_address} → {to_address}\n{date_time}\nSeats left: {seats_available}",
        "ru": "🎫 Новое бронирование: {passenger_name}\n{from_address} → {to_address}\n{date_time}\nСвободных мест: {seats_available}",
    },
    "driver.ride.assigned": {
        "lt": "🚕 Jums paskirta kelione №{ride_number}\n👤 {passenger_name}\n📍 {from_address} → {to_address}\n📅 {date}\n🕐 {time}",
        "pl": "🚕 Przypisano Ci przejazd №{ride_number}\n👤 {passenger_name}\n📍 {from_address} → {to_address}\n📅 {date}\n🕐 {time}",
        "en": "🚕 A ride was assigned to you №{ride_number}\n👤 {passenger_name}\n📍 {from_address} → {to_address}\n📅 {date}\n🕐 {time}",
        "ru": "🚕 Вам назначена поездка №{ride_number}\n👤 {passenger_name}\n📍 {from_address} → {to_address}\n📅 {date}\n🕐 {time}",
    },
    "driver.ride.open_cabinet": {
        "lt": "🚗 Atidaryti vairuotojo kabineta",
        "pl": "🚗 Otworz panel kierowcy",
        "en": "🚗 Open driver cabinet",
        "ru": "🚗 Открыть кабинет водителя",
    },
    "notif.status.pending": {
        "lt": "Laukiama vairuotojo",
        "pl": "Oczekuje na kierowce",
        "en": "Waiting for driver",
        "ru": "Ожидает водителя",
    },
    "notif.status.grouped": {
        "lt": "Sugrupuota",
        "pl": "Zgrupowane",
        "en": "Grouped",
        "ru": "Сгруппирована",
    },
    "notif.status.assigned": {
        "lt": "Vairuotojas paskirtas",
        "pl": "Kierowca przypisany",
        "en": "Driver assigned",
        "ru": "Водитель назначен",
    },
    "notif.status.en_route_to_pickup": {
        "lt": "Vaziuoja pas jus",
        "pl": "Jedzie do Ciebie",
        "en": "On the way to you",
        "ru": "Едет к вам",
    },
    "notif.status.awaiting_passenger": {
        "lt": "Laukia keleivio",
        "pl": "Czeka na pasazera",
        "en": "Waiting for passenger",
        "ru": "Ожидает пассажира",
    },
    "notif.status.in_progress": {
        "lt": "Kelione vyksta",
        "pl": "Przejazd w toku",
        "en": "Ride in progress",
        "ru": "Поездка идёт",
    },
    "notif.status.completed": {
        "lt": "Baigta",
        "pl": "Zakonczone",
        "en": "Completed",
        "ru": "Завершена",
    },
    "notif.status.cancelled": {
        "lt": "Atsaukta",
        "pl": "Anulowane",
        "en": "Cancelled",
        "ru": "Отменена",
    },
    "notif.ride.cancel_reason.passenger_cancelled": {
        "lt": "Keleivis atsauke kelione.",
        "pl": "Pasazer anulowal przejazd.",
        "en": "The passenger cancelled the ride.",
        "ru": "Пассажир отменил поездку.",
    },
    "notif.ride.cancel_reason.passenger_late_cancelled": {
        "lt": "Keleivis atsauke kelione, kai vairuotojas jau buvo pakeliui.",
        "pl": "Pasazer anulowal przejazd, gdy kierowca byl juz w drodze.",
        "en": "The passenger cancelled the ride while the driver was already on the way.",
        "ru": "Пассажир отменил поездку, когда водитель уже был в пути.",
    },
    "notif.ride.cancel_reason.driver_cancelled": {
        "lt": "Vairuotojas atsauke kelione. Paskirkime kita vairuotoja.",
        "pl": "Kierowca anulowal przejazd. Przypiszemy innego kierowce.",
        "en": "The driver cancelled the ride. We will assign another driver.",
        "ru": "Водитель отменил поездку. Назначим другого водителя.",
    },
    "notif.ride.cancel_reason.driver_no_show": {
        "lt": "Vairuotojas palauke nurodyta laika ir nebegalejo laukti toliau.",
        "pl": "Kierowca odczekal ustalony czas i nie mogl czekac dluzej.",
        "en": "The driver waited the required time and could not wait any longer.",
        "ru": "Водитель прождал установленное время и не смог ждать дальше.",
    },
    "notif.ride.cancel_reason.admin_cancelled": {
        "lt": "Kelione atsauke administracija.",
        "pl": "Przejazd anulowala administracja.",
        "en": "The ride was cancelled by the administration.",
        "ru": "Поездку отменила администрация.",
    },
    "notif.ride.passenger.assigned.title": {
        "lt": "✅ Paskirtas vairuotojas",
        "pl": "✅ Kierowca przypisany",
        "en": "✅ Driver assigned",
        "ru": "✅ Водитель назначен",
    },
    "notif.ride.passenger.assigned.body": {
        "lt": "🚕 {driver_name} {driver_car}\n📍 Paemimas: {from_address}\n📅 {date} · {time}",
        "pl": "🚕 {driver_name} {driver_car}\n📍 Odbior: {from_address}\n📅 {date} · {time}",
        "en": "🚕 {driver_name} {driver_car}\n📍 Pickup: {from_address}\n📅 {date} · {time}",
        "ru": "🚕 {driver_name} {driver_car}\n📍 Подача: {from_address}\n📅 {date} · {time}",
    },
    "notif.ride.passenger.en_route.title": {
        "lt": "🚗 Vairuotojas vaziuoja pas jus",
        "pl": "🚗 Kierowca jedzie do Ciebie",
        "en": "🚗 Your driver is on the way",
        "ru": "🚗 Водитель едет к вам",
    },
    "notif.ride.passenger.en_route.body": {
        "lt": "{driver_name} jau pakeliui i: {from_address}\n\nBūkite salia paemimo tasko.",
        "pl": "{driver_name} jest w drodze do: {from_address}\n\nBadz blisko punktu odbioru.",
        "en": "{driver_name} is on the way to: {from_address}\n\nPlease stay near the pickup point.",
        "ru": "{driver_name} уже едет к: {from_address}\n\nОставайтесь рядом с точкой подачи.",
    },
    "notif.ride.passenger.arrived.title": {
        "lt": "📍 Vairuotojas atvyko",
        "pl": "📍 Kierowca na miejscu",
        "en": "📍 Your driver has arrived",
        "ru": "📍 Водитель на месте",
    },
    "notif.ride.passenger.arrived.body": {
        "lt": "Vairuotojas {driver_name} laukia jusu: {from_address}\n\nPraome prieiti prie automobilio.",
        "pl": "Kierowca {driver_name} czeka na Ciebie: {from_address}\n\nPodejdz do samochodu.",
        "en": "Driver {driver_name} is waiting for you: {from_address}\n\nPlease come to the car.",
        "ru": "Водитель {driver_name} ждёт вас: {from_address}\n\nПожалуйста, подойдите к машине.",
    },
    "notif.ride.passenger.started.title": {
        "lt": "▶️ Kelione prasidejo",
        "pl": "▶️ Przejazd sie rozpoczal",
        "en": "▶️ Ride started",
        "ru": "▶️ Поездка началась",
    },
    "notif.ride.passenger.started.body": {
        "lt": "{from_address} → {to_address}\nGeros keliones!",
        "pl": "{from_address} → {to_address}\nSzerokiej drogi!",
        "en": "{from_address} → {to_address}\nHave a safe trip!",
        "ru": "{from_address} → {to_address}\nПриятной дороги!",
    },
    "notif.ride.passenger.completed.title": {
        "lt": "🏁 Kelione baigta",
        "pl": "🏁 Przejazd zakonczony",
        "en": "🏁 Ride completed",
        "ru": "🏁 Поездка завершена",
    },
    "notif.ride.passenger.completed.body": {
        "lt": "{from_address} → {to_address}\nAciu, kad naudojates Ride!",
        "pl": "{from_address} → {to_address}\nDziekujemy za korzystanie z Ride!",
        "en": "{from_address} → {to_address}\nThanks for using Ride!",
        "ru": "{from_address} → {to_address}\nСпасибо, что воспользовались Ride!",
    },
    "notif.ride.passenger.cancelled.title": {
        "lt": "❌ Kelione atsaukta",
        "pl": "❌ Przejazd anulowany",
        "en": "❌ Ride cancelled",
        "ru": "❌ Поездка отменена",
    },
    "notif.ride.passenger.cancelled.body": {
        "lt": "{reason}\n\nUzsakymo numeris: {ride_number}",
        "pl": "{reason}\n\nNumer przejazdu: {ride_number}",
        "en": "{reason}\n\nRide number: {ride_number}",
        "ru": "{reason}\n\nНомер поездки: {ride_number}",
    },
    "notif.ride.passenger.no_show.title": {
        "lt": "❌ Kelione atsaukta",
        "pl": "❌ Przejazd anulowany",
        "en": "❌ Ride cancelled",
        "ru": "❌ Поездка отменена",
    },
    "notif.ride.passenger.no_show.body": {
        "lt": "{reason}",
        "pl": "{reason}",
        "en": "{reason}",
        "ru": "{reason}",
    },
    "notif.ride.passenger.status_undo.title": {
        "lt": "ℹ️ Vairuotojas patikslino busena",
        "pl": "ℹ️ Kierowca poprawil status",
        "en": "ℹ️ Driver corrected the status",
        "ru": "ℹ️ Водитель поправил статус",
    },
    "notif.ride.passenger.status_undo.body": {
        "lt": "Vairuotojas patikslino keliones №{ride_number} busena. Aktualu: {corrected_status}.",
        "pl": "Kierowca poprawil status przejazdu №{ride_number}. Aktualnie: {corrected_status}.",
        "en": "The driver corrected the status of ride №{ride_number}. Now: {corrected_status}.",
        "ru": "Водитель скорректировал статус поездки №{ride_number}. Сейчас: {corrected_status}.",
    },
    "notif.ride.passenger.wait_reminder.title": {
        "lt": "⏱ Vairuotojas jusu laukia",
        "pl": "⏱ Kierowca na Ciebie czeka",
        "en": "⏱ Your driver is waiting",
        "ru": "⏱ Водитель вас ждёт",
    },
    "notif.ride.passenger.wait_reminder.body": {
        "lt": "Vairuotojas laukia jau {minutes} min: {from_address}\n\nJei neprieisite, vairuotojas gales uzfiksuoti neatvykima.",
        "pl": "Kierowca czeka juz {minutes} min: {from_address}\n\nJesli nie podejdziesz, kierowca moze zglosic niestawienie sie.",
        "en": "The driver has been waiting for {minutes} min: {from_address}\n\nIf you do not arrive, the driver may report a no-show.",
        "ru": "Водитель ждёт уже {minutes} мин: {from_address}\n\nЕсли вы не подойдёте, водитель может оформить неявку.",
    },
    "notif.ride.driver.assigned.title": {
        "lt": "🚕 Paskirta nauja kelione",
        "pl": "🚕 Przypisano nowy przejazd",
        "en": "🚕 New ride assigned",
        "ru": "🚕 Назначена новая поездка",
    },
    "notif.ride.driver.assigned.body": {
        "lt": "№{ride_number} · {passenger_name}\n📍 {from_address} → {to_address}\n📅 {date} · {time}",
        "pl": "№{ride_number} · {passenger_name}\n📍 {from_address} → {to_address}\n📅 {date} · {time}",
        "en": "№{ride_number} · {passenger_name}\n📍 {from_address} → {to_address}\n📅 {date} · {time}",
        "ru": "№{ride_number} · {passenger_name}\n📍 {from_address} → {to_address}\n📅 {date} · {time}",
    },
    "notif.ride.driver.cancelled.title": {
        "lt": "❌ Keleivis atsauke kelione",
        "pl": "❌ Pasazer anulowal przejazd",
        "en": "❌ Passenger cancelled the ride",
        "ru": "❌ Пассажир отменил поездку",
    },
    "notif.ride.driver.cancelled.body": {
        "lt": "№{ride_number} · {passenger_name}{late_note}",
        "pl": "№{ride_number} · {passenger_name}{late_note}",
        "en": "№{ride_number} · {passenger_name}{late_note}",
        "ru": "№{ride_number} · {passenger_name}{late_note}",
    },
    "notif.ride.driver.cancelled.late_note": {
        "lt": "\n⏱ Atsaukta, kai jau buvote pakeliui — veltui praleistas laikas.",
        "pl": "\n⏱ Anulowano, gdy byles juz w drodze — czas stracony.",
        "en": "\n⏱ Cancelled while you were already on the way — time lost.",
        "ru": "\n⏱ Отменили, когда вы уже были в пути — потерянное время.",
    },
    "notif.ride.driver.passenger_ready.title": {
        "lt": "🙋 Keleivis vietoje",
        "pl": "🙋 Pasazer na miejscu",
        "en": "🙋 Passenger is at the pickup point",
        "ru": "🙋 Пассажир на месте",
    },
    "notif.ride.driver.passenger_ready.body": {
        "lt": "{passenger_name} jau laukia paemimo taske: {from_address}",
        "pl": "{passenger_name} czeka na punkcie odbioru: {from_address}",
        "en": "{passenger_name} is waiting at the pickup point: {from_address}",
        "ru": "{passenger_name} уже ждёт на точке подачи: {from_address}",
    },
    "notif.ride.driver.passenger_nudge.title": {
        "lt": "⏱ Keleivis klausia, kur esate",
        "pl": "⏱ Pasazer pyta, gdzie jestes",
        "en": "⏱ Passenger asks where you are",
        "ru": "⏱ Пассажир спрашивает, где вы",
    },
    "notif.ride.driver.passenger_nudge.body": {
        "lt": "{passenger_name} laukia: {from_address}\n\nPraneskite busena arba parasykite pokalbyje.",
        "pl": "{passenger_name} czeka: {from_address}\n\nZaktualizuj status lub napisz na czacie.",
        "en": "{passenger_name} is waiting: {from_address}\n\nUpdate your status or send a chat message.",
        "ru": "{passenger_name} ждёт: {from_address}\n\nОтметьте статус или напишите в чате.",
    },
    "notif.ride.driver.chat_message.title": {
        "lt": "💬 Nauja zinute pokalbyje",
        "pl": "💬 Nowa wiadomosc na czacie",
        "en": "💬 New chat message",
        "ru": "💬 Новое сообщение в чате",
    },
    "notif.ride.driver.chat_message.body": {
        "lt": "{sender_name}: {text}",
        "pl": "{sender_name}: {text}",
        "en": "{sender_name}: {text}",
        "ru": "{sender_name}: {text}",
    },
    "notif.ride.driver.no_show_available.title": {
        "lt": "⌛ Galima fiksuoti neatvykima",
        "pl": "⌛ Mozna zglosic niestawienie sie",
        "en": "⌛ No-show can be reported",
        "ru": "⌛ Можно оформить неявку",
    },
    "notif.ride.driver.no_show_available.body": {
        "lt": "Laukiate keleivio {min_wait_minutes} min. Jei keleivis neprieina, spauskite «Keleivis neatvyko» keliones korteleje.",
        "pl": "Czekasz na pasazera {min_wait_minutes} min. Jesli nie podchodzi, nacisnij «Pasazer nie przyszedl» na karcie przejazdu.",
        "en": "You have been waiting {min_wait_minutes} min. If the passenger does not come, tap «Passenger no-show» on the ride card.",
        "ru": "Вы ждёте пассажира {min_wait_minutes} мин. Если он не выходит, нажмите «Пассажир не вышел» в карточке поездки.",
    },
    "notif.ride.driver.driver_late.title": {
        "lt": "🚗 Laikas isvykti",
        "pl": "🚗 Czas wyjechac",
        "en": "🚗 Time to leave",
        "ru": "🚗 Пора выезжать",
    },
    "notif.ride.driver.driver_late.body": {
        "lt": "Kelione №{ride_number} {date} {time}: laikas jau praejes. Spauskite «Vaziuoju i paemimo vieta» arba parasykite keleiviui.",
        "pl": "Przejazd №{ride_number} {date} {time}: czas minal. Nacisnij «Jade do punktu odbioru» lub napisz do pasazera.",
        "en": "Ride №{ride_number} {date} {time}: the pickup time has passed. Tap «On my way» or message the passenger.",
        "ru": "Поездка №{ride_number} {date} {time}: время подачи уже прошло. Нажмите «Еду на точку» или напишите пассажиру.",
    },
    "notif.ride.driver.en_route_stuck.title": {
        "lt": "⏱ Statusas «vaziuoju» per ilgas",
        "pl": "⏱ Status «jade» zbyt dlugo",
        "en": "⏱ «On the way» status is too long",
        "ru": "⏱ Статус «Еду на точку» слишком долгий",
    },
    "notif.ride.driver.en_route_stuck.body": {
        "lt": "Kelione №{ride_number} ilgai yra busenoje «vaziuoju pas keleivi». Atnaujinkite busena arba parasykite keleiviui.",
        "pl": "Przejazd №{ride_number} dlugo pozostaje w statusie «jade do pasazera». Zaktualizuj status lub napisz na czacie.",
        "en": "Ride №{ride_number} has been in «on the way» for too long. Update the status or message the passenger.",
        "ru": "Поездка №{ride_number} долго в статусе «Еду на точку». Обновите статус или напишите пассажиру.",
    },
    "notif.ride.driver.ride_stuck.title": {
        "lt": "⏱ Kelione uztruko per ilgai",
        "pl": "⏱ Przejazd trwa zbyt dlugo",
        "en": "⏱ Ride is taking too long",
        "ru": "⏱ Поездка длится слишком долго",
    },
    "notif.ride.driver.ride_stuck.body": {
        "lt": "Kelione №{ride_number} vyksta per ilgai. Uzbaigkite ja arba susisiekite su administracija.",
        "pl": "Przejazd №{ride_number} trwa zbyt dlugo. Zakoncz go lub skontaktuj sie z administracja.",
        "en": "Ride №{ride_number} has been running too long. Complete it or contact the administrator.",
        "ru": "Поездка №{ride_number} идёт слишком долго. Завершите её или свяжитесь с администратором.",
    },
    "notif.ride.chat.title": {
        "lt": "💬 Zinute nuo {sender_name}",
        "pl": "💬 Wiadomosc od {sender_name}",
        "en": "💬 Message from {sender_name}",
        "ru": "💬 Сообщение от {sender_name}",
    },
    "notif.ride.chat.body": {
        "lt": "{text}",
        "pl": "{text}",
        "en": "{text}",
        "ru": "{text}",
    },
    "notif.ride.admin.attention.title": {
        "lt": "⚠️ Kelione reikalauja demesio",
        "pl": "⚠️ Przejazd wymaga uwagi",
        "en": "⚠️ Ride requires attention",
        "ru": "⚠️ Поездка требует внимания",
    },
    "notif.ride.admin.attention.body": {
        "lt": "№{ride_number}: {reason}\n{from_address} → {to_address}",
        "pl": "№{ride_number}: {reason}\n{from_address} → {to_address}",
        "en": "№{ride_number}: {reason}\n{from_address} → {to_address}",
        "ru": "№{ride_number}: {reason}\n{from_address} → {to_address}",
    },
    "notif.ride.attention_reason.driver_late": {
        "lt": "vairuotojas neisvyko laiku",
        "pl": "kierowca nie wyjechal na czas",
        "en": "driver did not leave on time",
        "ru": "водитель не выехал вовремя",
    },
    "notif.ride.attention_reason.en_route_too_long": {
        "lt": "statusas «vaziuoju» per ilgas",
        "pl": "status «jade» trwa zbyt dlugo",
        "en": "«on the way» status is too long",
        "ru": "статус «Еду на точку» длится слишком долго",
    },
    "notif.ride.attention_reason.waiting_too_long": {
        "lt": "vairuotojas ilgai laukia keleivio",
        "pl": "kierowca dlugo czeka na pasazera",
        "en": "driver has been waiting too long",
        "ru": "водитель слишком долго ждёт пассажира",
    },
    "notif.ride.attention_reason.ride_too_long": {
        "lt": "kelione vyksta per ilgai",
        "pl": "przejazd trwa zbyt dlugo",
        "en": "ride has been running too long",
        "ru": "поездка идёт слишком долго",
    },
    "notif.ride.attention_reason.no_show": {
        "lt": "uzfiksuotas keleivio neatvykimas",
        "pl": "zgloszono niestawienie sie pasazera",
        "en": "passenger no-show reported",
        "ru": "зафиксирована неявка пассажира",
    },
    "notif.ride.attention_reason.arrival_far_from_pickup": {
        "lt": "vairuotojas pazymejo atvykima toli nuo paemimo tasko",
        "pl": "kierowca oznaczył przyjazd daleko od punktu odbioru",
        "en": "driver marked arrival far from the pickup point",
        "ru": "водитель отметил прибытие далеко от точки подачи",
    },
    "notif.ride.system.en_route": {
        "lt": "🚗 Vairuotojas isvyko i paemimo vieta.",
        "pl": "🚗 Kierowca wyjechal do punktu odbioru.",
        "en": "🚗 The driver has left for the pickup point.",
        "ru": "🚗 Водитель выехал к точке подачи.",
    },
    "notif.ride.system.arrived": {
        "lt": "📍 Vairuotojas atvyko ir laukia keleivio.",
        "pl": "📍 Kierowca przyjechal i czeka na pasazera.",
        "en": "📍 The driver has arrived and is waiting.",
        "ru": "📍 Водитель прибыл и ждёт пассажира.",
    },
    "notif.ride.system.started": {
        "lt": "▶️ Kelione prasidejo.",
        "pl": "▶️ Przejazd sie rozpoczal.",
        "en": "▶️ The ride has started.",
        "ru": "▶️ Поездка началась.",
    },
    "notif.ride.system.completed": {
        "lt": "🏁 Kelione baigta.",
        "pl": "🏁 Przejazd zakonczony.",
        "en": "🏁 The ride is completed.",
        "ru": "🏁 Поездка завершена.",
    },
    "notif.ride.system.cancelled": {
        "lt": "❌ Kelione atsaukta.",
        "pl": "❌ Przejazd anulowany.",
        "en": "❌ The ride is cancelled.",
        "ru": "❌ Поездка отменена.",
    },
    "notif.ride.system.no_show": {
        "lt": "⌛ Keleivis neatvyko — kelione atsaukta.",
        "pl": "⌛ Pasazer sie nie stawil — przejazd anulowany.",
        "en": "⌛ Passenger no-show — the ride is cancelled.",
        "ru": "⌛ Пассажир не вышел — поездка отменена.",
    },
    "notif.ride.system.undo": {
        "lt": "ℹ️ Vairuotojas patikslino busena: {status}.",
        "pl": "ℹ️ Kierowca poprawil status: {status}.",
        "en": "ℹ️ The driver corrected the status: {status}.",
        "ru": "ℹ️ Водитель скорректировал статус: {status}.",
    },
    "notif.ride.system.ready": {
        "lt": "🙋 Keleivis vietoje.",
        "pl": "🙋 Pasazer na miejscu.",
        "en": "🙋 Passenger is at the pickup point.",
        "ru": "🙋 Пассажир на месте.",
    },
    "notif.ride.system.nudge": {
        "lt": "⏱ Keleivis klausia: kur esate?",
        "pl": "⏱ Pasazer pyta: gdzie jestes?",
        "en": "⏱ Passenger asks: where are you?",
        "ru": "⏱ Пассажир спрашивает: где вы?",
    },
    "notif.ride.system.completion_check": {
        "lt": "ℹ️ Tikriname, ar kelione ivyko: keleiviui issiustas klausimas su mygtukais.",
        "pl": "ℹ️ Sprawdzamy, czy przejazd sie odbyl: pasazer otrzymal pytanie z przyciskami.",
        "en": "ℹ️ Checking whether the ride happened: the passenger got a question with buttons.",
        "ru": "ℹ️ Проверяем, состоялась ли поездка: пассажиру отправлен вопрос с кнопками.",
    },
    "notif.ride.system.completion_declined": {
        "lt": "ℹ️ Keleivis pranese, kad kelione neivyko. Situacija perduota administratoriui.",
        "pl": "ℹ️ Pasazer zglosil, ze przejazd sie nie odbyl. Sprawa przekazana administratorowi.",
        "en": "ℹ️ The passenger reported the ride did not happen. The case is with an administrator.",
        "ru": "ℹ️ Пассажир сообщил, что поездка не состоялась. Ситуация передана администратору.",
    },
    "notif.ride.system.wait_reminder": {
        "lt": "⏱ Vairuotojas laukia jau {minutes} min.",
        "pl": "⏱ Kierowca czeka juz {minutes} min.",
        "en": "⏱ The driver has been waiting {minutes} min.",
        "ru": "⏱ Водитель ждёт уже {minutes} мин.",
    },
    "notif.ride.passenger.completion_check.title": {
        "lt": "❓ Ar kelione ivyko?",
        "pl": "❓ Czy przejazd sie odbyl?",
        "en": "❓ Did the ride happen?",
        "ru": "❓ Поездка состоялась?",
    },
    "notif.ride.passenger.completion_check.body": {
        "lt": "Kelione №{ride_number}: {from_address} → {to_address}\n\nNuo keliones pradzios praejo {elapsed_minutes} min, taciau vairuotojas jos neuzbaige. Atsakykite: kelione ivyko?",
        "pl": "Przejazd №{ride_number}: {from_address} → {to_address}\n\nOd rozpoczecia minelo {elapsed_minutes} min, ale kierowca nie zakonczyl przejazdu. Odpowiedz: czy przejazd sie odbyl?",
        "en": "Ride №{ride_number}: {from_address} → {to_address}\n\n{elapsed_minutes} min have passed since the start, but the driver did not finish the ride. Please answer: did the ride happen?",
        "ru": "Поездка №{ride_number}: {from_address} → {to_address}\n\nС начала поездки прошло {elapsed_minutes} мин, но водитель её не завершил. Ответьте: поездка состоялась?",
    },
    "notif.ride.driver.completion_declined.title": {
        "lt": "⚠️ Keleivis nurode, kad kelione neivyko",
        "pl": "⚠️ Pasazer zglosil, ze przejazd sie nie odbyl",
        "en": "⚠️ The passenger says the ride did not happen",
        "ru": "⚠️ Пассажир сообщил, что поездка не состоялась",
    },
    "notif.ride.driver.completion_declined.body": {
        "lt": "Kelione №{ride_number} ({from_address} → {to_address}) dar neužbaigta, bet keleivis atsakė, kad kelione neivyko. Susisieks administratorius.",
        "pl": "Przejazd №{ride_number} ({from_address} → {to_address}) nie jest zakonczony, ale pasazer odpowiedzial, ze przejazd sie nie odbyl. Skontaktuje sie administrator.",
        "en": "Ride №{ride_number} ({from_address} → {to_address}) is not finished, but the passenger answered that the ride did not happen. An administrator will contact you.",
        "ru": "Поездка №{ride_number} ({from_address} → {to_address}) не завершена, но пассажир ответил, что поездка не состоялась. С вами свяжется администратор.",
    },
    "notif.ride.driver.completed.title": {
        "lt": "🏁 Kelione uždaryta",
        "pl": "🏁 Przejazd zamkniety",
        "en": "🏁 The ride is closed",
        "ru": "🏁 Поездка закрыта",
    },
    "notif.ride.driver.completed.body": {
        "lt": "Kelione №{ride_number} ({from_address} → {to_address}) uždaryta: keleivis patvirtino, kad kelione ivyko.",
        "pl": "Przejazd №{ride_number} ({from_address} → {to_address}) zamkniety: pasazer potwierdzil, ze przejazd sie odbyl.",
        "en": "Ride №{ride_number} ({from_address} → {to_address}) is closed: the passenger confirmed the ride happened.",
        "ru": "Поездка №{ride_number} ({from_address} → {to_address}) закрыта: пассажир подтвердил, что поездка состоялась.",
    },
    "notif.ride.attention_reason.passenger_not_completed": {
        "lt": "keleivis nurode, kad kelione neivyko",
        "pl": "pasazer zglosil, ze przejazd sie nie odbyl",
        "en": "passenger reported the ride did not happen",
        "ru": "пассажир сообщил, что поездка не состоялась",
    },
    "notif.ride.attention_reason.completion_unconfirmed": {
        "lt": "keleivis neatsake, ar kelione ivyko",
        "pl": "pasazer nie odpowiedzial, czy przejazd sie odbyl",
        "en": "the passenger did not answer whether the ride happened",
        "ru": "пассажир не ответил, состоялась ли поездка",
    },
    "ride_completion.yes": {
        "lt": "Taip, ivyko",
        "pl": "Tak, odbyl sie",
        "en": "Yes, it happened",
        "ru": "Да, состоялась",
    },
    "ride_completion.no": {
        "lt": "Ne, neivyko",
        "pl": "Nie, nie odbyl sie",
        "en": "No, it did not happen",
        "ru": "Нет, не состоялась",
    },
    "ride_completion.confirmed": {
        "lt": "✅ Aciu! Kelione uždaryta.",
        "pl": "✅ Dziekujemy! Przejazd zamkniety.",
        "en": "✅ Thank you! The ride is closed.",
        "ru": "✅ Спасибо! Поездка закрыта.",
    },
    "ride_completion.declined": {
        "lt": "ℹ️ Aciu uz atsakyma. Situacija perduota administratoriui — su jumis susisieks.",
        "pl": "ℹ️ Dziekujemy za odpowiedz. Sprawa przekazana administratorowi — skontaktujemy sie.",
        "en": "ℹ️ Thanks for your answer. The case is with an administrator — we will contact you.",
        "ru": "ℹ️ Спасибо за ответ. Ситуация передана администратору — с вами свяжутся.",
    },
    "ride_completion.already": {
        "lt": "Atsakymas jau gautas. Aciu!",
        "pl": "Odpowiedz juz otrzymana. Dziekujemy!",
        "en": "Your answer has already been received. Thank you!",
        "ru": "Ответ уже получен. Спасибо!",
    },
    "ride_completion.not_found": {
        "lt": "Kelione nerasta. Atidarykite kelione programeleje.",
        "pl": "Nie znaleziono przejazdu. Otworz przejazd w aplikacji.",
        "en": "Ride not found. Open the ride in the app.",
        "ru": "Поездка не найдена. Откройте поездку в приложении.",
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

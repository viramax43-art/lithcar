from sqlalchemy.orm import declarative_base

# Определяем Base первым
Base = declarative_base()

# Импортируем модели ПОСЛЕ определения Base, чтобы избежать циклического импорта
from app.models.user import User
from app.models.driver import Driver
from app.models.ride_request import RideRequest
from app.models.service_zone import ServiceZone
from app.models.pricing_settings import PricingSettings
from app.models.admin_api_key import AdminApiKey
from app.models.points_transaction import PointsTransaction
from app.models.driver_qr_sale import DriverQrSale
from app.models.admin_audit_event import AdminAuditEvent
from app.models.map_drawing import MapDrawing
from app.models.map_mark import MapMark
from app.models.ride_rating import RideRating
from app.models.driver_registration_settings import DriverRegistrationSettings
from app.models.driver_application import DriverApplication
from app.models.driver_login_token import DriverLoginToken
from app.models.notification import Notification


__all__ = [
    "User",
    "Driver",
    "RideRequest",
    "ServiceZone",
    "PricingSettings",
    "AdminApiKey",
    "PointsTransaction",
    "DriverQrSale",
    "AdminAuditEvent",
    "MapDrawing",
    "MapMark",
    "RideRating",
    "DriverRegistrationSettings",
    "DriverApplication",
    "DriverLoginToken",
    "Notification",
]

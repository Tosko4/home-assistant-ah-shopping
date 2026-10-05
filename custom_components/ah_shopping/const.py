"""Constants for AH Shopping."""
from datetime import timedelta
from homeassistant.const import Platform

DOMAIN = "ah_shopping"
NAME = "AH Shopping"
PLATFORMS = [Platform.SENSOR, Platform.TODO]

API_BASE_URL = "https://api.ah.nl"
LOGIN_BASE_URL = "https://login.ah.nl"
CLIENT_ID = "appie-ios"
CLIENT_VERSION = "9.28"
USER_AGENT = "Appie/9.28 (iPhone17,3; iPhone; CPU OS 26_1 like Mac OS X)"
APPLICATION = "AHWEBSHOP"

CONF_ACCESS_TOKEN = "access_token"
CONF_REFRESH_TOKEN = "refresh_token"
CONF_EXPIRES_AT = "expires_at"
CONF_MEMBER_ID = "member_id"

TOKEN_REFRESH_MARGIN = timedelta(minutes=5)
UPDATE_INTERVAL = timedelta(minutes=5)

FRONTEND_URL_BASE = "/ah_shopping"
FRONTEND_MODULE_URL = f"{FRONTEND_URL_BASE}/ah-shopping-card.js"

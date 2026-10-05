"""Constants for Albert Heijn Shopping."""
from datetime import timedelta

from homeassistant.const import Platform

DOMAIN = "ah_shopping"
NAME = "Albert Heijn Shopping"
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

# This is deliberately the exact same proven authentication validation query
# used by Albert Heijn Delivery. Shopping-list availability is validated later
# by the coordinator and is not part of the login flow.
BASE_FULFILLMENTS_QUERY = """
query OrderFulfillments {
  orderFulfillments(status: OPEN) {
    result {
      orderId
      statusCode
      statusDescription
      shoppingType
      transactionCompleted
      modifiable
      delivery {
        status
        method
        slot {
          date
          dateDisplay
          timeDisplay
          startTime
          endTime
        }
      }
    }
  }
}
"""

# AH "Mijn lijst" is a single account-wide shopping-list v2 resource.
# Confirmed by current implementations against the live API in 2026.
SHOPPINGLIST_ITEMS_PATH = "/mobile-services/shoppinglist/v2/items"

FRONTEND_URL_BASE = "/ah_shopping"
FRONTEND_MODULE_URL = f"{FRONTEND_URL_BASE}/ah-shopping-card.js"

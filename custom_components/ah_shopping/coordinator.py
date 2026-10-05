"""Coordinator for AH Shopping."""
from __future__ import annotations
import logging
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import ConfigEntryAuthFailed
from homeassistant.helpers.update_coordinator import DataUpdateCoordinator, UpdateFailed
from .api import AhShoppingApiClient
from .const import NAME, UPDATE_INTERVAL
from .exceptions import AhAuthError, AhShoppingError
from .models import ShoppingListData

_LOGGER = logging.getLogger(__name__)

class AhShoppingCoordinator(DataUpdateCoordinator[ShoppingListData]):
    """Keep AH shopping data fresh."""
    def __init__(self, hass: HomeAssistant, entry: ConfigEntry, client: AhShoppingApiClient) -> None:
        super().__init__(hass, _LOGGER, name=NAME, update_interval=UPDATE_INTERVAL, config_entry=entry)
        self.client = client

    async def _async_update_data(self) -> ShoppingListData:
        try:
            return await self.client.async_get_shopping_data()
        except AhAuthError as err:
            raise ConfigEntryAuthFailed(str(err)) from err
        except AhShoppingError as err:
            raise UpdateFailed(str(err)) from err

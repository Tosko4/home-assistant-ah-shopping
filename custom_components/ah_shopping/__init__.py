"""AH Shopping integration."""
from __future__ import annotations
from dataclasses import dataclass
from typing import Any
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from .api import AhShoppingApiClient
from .const import CONF_ACCESS_TOKEN, CONF_EXPIRES_AT, CONF_MEMBER_ID, CONF_REFRESH_TOKEN, DOMAIN, PLATFORMS
from .coordinator import AhShoppingCoordinator
from .frontend import async_register_frontend
from .services import async_setup_services, async_unload_services

@dataclass(slots=True)
class AhShoppingRuntimeData:
    client: AhShoppingApiClient
    coordinator: AhShoppingCoordinator

type AhShoppingConfigEntry = ConfigEntry[AhShoppingRuntimeData]

async def _async_reload_entry(hass: HomeAssistant, entry: AhShoppingConfigEntry) -> None:
    await hass.config_entries.async_reload(entry.entry_id)

async def async_setup_entry(hass:HomeAssistant,entry:AhShoppingConfigEntry)->bool:
    async def save_tokens(token_data:dict[str,Any])->None:
        hass.config_entries.async_update_entry(entry,data={**entry.data,**token_data})
    client=AhShoppingApiClient(async_get_clientsession(hass), access_token=str(entry.data.get(CONF_ACCESS_TOKEN,"")), refresh_token=str(entry.data.get(CONF_REFRESH_TOKEN,"")), expires_at=float(entry.data.get(CONF_EXPIRES_AT,0) or 0), member_id=str(entry.data.get(CONF_MEMBER_ID,"")), token_update_callback=save_tokens)
    coordinator=AhShoppingCoordinator(hass,entry,client)
    await coordinator.async_config_entry_first_refresh()
    entry.runtime_data=AhShoppingRuntimeData(client,coordinator)
    entry.async_on_unload(entry.add_update_listener(_async_reload_entry))
    await async_setup_services(hass)
    await async_register_frontend(hass)
    await hass.config_entries.async_forward_entry_setups(entry,PLATFORMS)
    return True

async def async_unload_entry(hass:HomeAssistant,entry:AhShoppingConfigEntry)->bool:
    ok=await hass.config_entries.async_unload_platforms(entry,PLATFORMS)
    if ok:
        other=[e for e in hass.config_entries.async_entries(DOMAIN) if e.entry_id!=entry.entry_id and getattr(e,"runtime_data",None)]
        if not other:
            await async_unload_services(hass)
    return ok

"""Serve and register the bundled Lovelace card."""
from pathlib import Path
from homeassistant.components.frontend import add_extra_js_url
from homeassistant.components.http import StaticPathConfig
from homeassistant.core import HomeAssistant
from .const import DOMAIN, FRONTEND_MODULE_URL, FRONTEND_URL_BASE

async def async_register_frontend(hass: HomeAssistant) -> None:
    data=hass.data.setdefault(DOMAIN,{})
    if data.get("frontend_registered"):
        return
    frontend_dir=Path(__file__).parent / "frontend"
    await hass.http.async_register_static_paths([
        StaticPathConfig(FRONTEND_URL_BASE, str(frontend_dir), cache_headers=False)
    ])
    add_extra_js_url(hass, FRONTEND_MODULE_URL)
    data["frontend_registered"] = True

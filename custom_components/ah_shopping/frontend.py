"""Serve the card and load it with the dashboard's resources."""
import logging
from pathlib import Path
from urllib.parse import urlsplit

from homeassistant.components.frontend import add_extra_js_url
from homeassistant.components.http import StaticPathConfig
from homeassistant.components.lovelace.const import LOVELACE_DATA
from homeassistant.core import HomeAssistant
from .const import DOMAIN, FRONTEND_MODULE_URL, FRONTEND_URL_BASE

_LOGGER = logging.getLogger(__name__)


async def async_register_frontend(hass: HomeAssistant) -> None:
    data = hass.data.setdefault(DOMAIN, {})
    if data.get("frontend_registered"):
        return
    if not data.get("frontend_static_registered"):
        frontend_dir = Path(__file__).parent / "frontend"
        await hass.http.async_register_static_paths([
            StaticPathConfig(FRONTEND_URL_BASE, str(frontend_dir), cache_headers=False)
        ])
        data["frontend_static_registered"] = True

    lovelace = hass.data.get(LOVELACE_DATA)
    resources = getattr(lovelace, "resources", None)
    if resources is not None and hasattr(resources, "async_create_item"):
        # Older HA versions do not lazy-load before mutations. This call does,
        # preventing registration from replacing resources already on disk.
        await resources.async_get_info()
        path = urlsplit(FRONTEND_MODULE_URL).path
        matches = [item for item in resources.async_items()
                   if urlsplit(item.get("url", "")).path == path]
        if matches:
            for item in matches:
                if item.get("url") != FRONTEND_MODULE_URL or item.get("type") != "module":
                    await resources.async_update_item(item["id"], {
                        "url": FRONTEND_MODULE_URL, "res_type": "module",
                    })
        else:
            await resources.async_create_item({
                "url": FRONTEND_MODULE_URL, "res_type": "module",
            })
        data["frontend_load_method"] = "dashboard_resource"
    else:
        # YAML resource configuration belongs to the user. Keep the automatic
        # frontend fallback; explicitly listing this module is recommended.
        add_extra_js_url(hass, FRONTEND_MODULE_URL)
        data["frontend_load_method"] = "extra_module_url"
        _LOGGER.info("AH card uses frontend fallback; YAML dashboard resources can list %s as module", FRONTEND_MODULE_URL)
    data["frontend_registered"] = True

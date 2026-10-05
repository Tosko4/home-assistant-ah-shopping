"""Base entity for AH Shopping."""
from __future__ import annotations
from homeassistant.helpers.device_registry import DeviceInfo
from homeassistant.helpers.update_coordinator import CoordinatorEntity
from .const import DOMAIN
from .coordinator import AhShoppingCoordinator

class AhShoppingEntity(CoordinatorEntity[AhShoppingCoordinator]):
    _attr_has_entity_name = False
    def __init__(self, coordinator: AhShoppingCoordinator) -> None:
        super().__init__(coordinator)
        entry = coordinator.config_entry
        self._attr_device_info = DeviceInfo(
            identifiers={(DOMAIN, entry.entry_id)},
            name="AH Shopping",
            manufacturer="Albert Heijn",
            model="Shopping list",
        )

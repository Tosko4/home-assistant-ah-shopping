"""Sensors for AH Shopping."""
from __future__ import annotations
from typing import Any
from homeassistant.components.sensor import SensorDeviceClass, SensorEntity
from homeassistant.const import CURRENCY_EURO
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddConfigEntryEntitiesCallback
from . import AhShoppingConfigEntry
from .entity import AhShoppingEntity

async def async_setup_entry(hass:HomeAssistant,entry:AhShoppingConfigEntry,async_add_entities:AddConfigEntryEntitiesCallback)->None:
    coordinator=entry.runtime_data.coordinator
    async_add_entities([AhShoppingListSensor(coordinator),AhShoppingTotalSensor(coordinator)])

class AhShoppingListSensor(AhShoppingEntity,SensorEntity):
    _attr_name="AH Shopping List";_attr_icon="mdi:cart-outline"
    def __init__(self,coordinator):
        super().__init__(coordinator);self._attr_unique_id=f"{coordinator.config_entry.entry_id}_shopping_list"
    @property
    def native_value(self)->int:return self.coordinator.data.total_quantity
    @property
    def extra_state_attributes(self)->dict[str,Any]:
        data=self.coordinator.data.as_dict();data["ah_shopping_list"]=True;data["total_note"]="Estimated; multi-buy promotions may not be fully reflected";return data

class AhShoppingTotalSensor(AhShoppingEntity,SensorEntity):
    _attr_name="AH Shopping Estimated Total";_attr_icon="mdi:currency-eur";_attr_device_class=SensorDeviceClass.MONETARY;_attr_native_unit_of_measurement=CURRENCY_EURO;_attr_suggested_display_precision=2
    def __init__(self,coordinator):
        super().__init__(coordinator);self._attr_unique_id=f"{coordinator.config_entry.entry_id}_estimated_total"
    @property
    def native_value(self)->float:return self.coordinator.data.estimated_total

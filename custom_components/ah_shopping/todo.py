"""Read-only native To-do representation for Albert Heijn Shopping MVP."""
from __future__ import annotations
from homeassistant.components.todo import TodoItem, TodoItemStatus, TodoListEntity
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddConfigEntryEntitiesCallback
from . import AhShoppingConfigEntry
from .entity import AhShoppingEntity

async def async_setup_entry(hass: HomeAssistant, entry: AhShoppingConfigEntry, async_add_entities: AddConfigEntryEntitiesCallback) -> None:
    async_add_entities([AhShoppingTodo(entry.runtime_data.coordinator)])

class AhShoppingTodo(AhShoppingEntity, TodoListEntity):
    """Expose the AH list to native HA views; mutations use the richer card in v0.1."""
    _attr_name = "Albert Heijn Shopping List"
    _attr_icon = "mdi:cart-check"
    def __init__(self, coordinator):
        super().__init__(coordinator)
        self._attr_unique_id = f"{coordinator.config_entry.entry_id}_todo"
    @property
    def todo_items(self) -> list[TodoItem]:
        result=[]
        for item in self.coordinator.data.items:
            p=item.product
            details=[f"Aantal: {item.quantity}"]
            if p and p.price_now:
                details.append(f"Prijs: €{p.price_now:.2f}")
            if p and p.is_bonus:
                details.append(f"Bonus: {p.bonus_mechanism or 'ja'}")
            result.append(TodoItem(uid=item.item_id, summary=item.title, description=" · ".join(details), status=TodoItemStatus.NEEDS_ACTION))
        return result

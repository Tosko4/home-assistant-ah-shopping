"""Native Home Assistant To-do representation of the AH shopping list."""
from __future__ import annotations

from homeassistant.components.todo import (
    TodoItem,
    TodoItemStatus,
    TodoListEntity,
    TodoListEntityFeature,
)
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers.entity_platform import AddConfigEntryEntitiesCallback

from . import AhShoppingConfigEntry
from .entity import AhShoppingEntity
from .exceptions import AhShoppingError


async def async_setup_entry(
    hass: HomeAssistant,
    entry: AhShoppingConfigEntry,
    async_add_entities: AddConfigEntryEntitiesCallback,
) -> None:
    async_add_entities([AhShoppingTodo(entry.runtime_data.coordinator)])


class AhShoppingTodo(AhShoppingEntity, TodoListEntity):
    """Expose AH Mijn lijst as a writable native Home Assistant To-do list."""

    _attr_name = "Albert Heijn Shopping List"
    _attr_icon = "mdi:cart-check"
    _attr_supported_features = (
        TodoListEntityFeature.CREATE_TODO_ITEM
        | TodoListEntityFeature.UPDATE_TODO_ITEM
        | TodoListEntityFeature.DELETE_TODO_ITEM
    )

    def __init__(self, coordinator):
        super().__init__(coordinator)
        self._attr_unique_id = f"{coordinator.config_entry.entry_id}_todo"

    @property
    def todo_items(self) -> list[TodoItem]:
        result = []
        for item in self.coordinator.data.items:
            p = item.product
            details = [f"Aantal: {item.quantity}"]
            if p and p.price_now:
                details.append(f"Prijs: €{p.price_now:.2f}")
            if p and p.is_bonus:
                details.append(f"Bonus: {p.bonus_mechanism or 'ja'}")
            result.append(
                TodoItem(
                    uid=item.item_id,
                    summary=item.title,
                    description=" · ".join(details),
                    status=(
                        TodoItemStatus.COMPLETED
                        if item.checked
                        else TodoItemStatus.NEEDS_ACTION
                    ),
                )
            )
        return result

    async def async_create_todo_item(self, item: TodoItem) -> None:
        """Add a free-text item to AH Mijn lijst."""
        summary = (item.summary or "").strip()
        if not summary:
            raise HomeAssistantError("Item name cannot be empty")
        try:
            await self.coordinator.client.async_add_free_text_item(summary)
            await self.coordinator.async_request_refresh()
        except AhShoppingError as err:
            raise HomeAssistantError(str(err)) from err

    async def async_update_todo_item(self, item: TodoItem) -> None:
        """Update checked state; renaming is intentionally not supported."""
        current = next(
            (value for value in self.coordinator.data.items if value.item_id == item.uid),
            None,
        )
        if current is None:
            raise HomeAssistantError("Shopping-list item no longer exists")
        if item.summary is not None and item.summary != current.title:
            raise HomeAssistantError(
                "Renaming AH shopping-list items is not supported; delete and add it again"
            )
        checked = item.status == TodoItemStatus.COMPLETED
        try:
            await self.coordinator.client.async_set_item_checked(current, checked)
            self.coordinator.note_checked(current, checked)
        except AhShoppingError as err:
            raise HomeAssistantError(str(err)) from err

    async def async_delete_todo_items(self, uids: list[str]) -> None:
        """Delete items from AH Mijn lijst."""
        items = [
            item
            for item in self.coordinator.data.items
            if item.item_id in set(uids)
        ]
        try:
            for item in items:
                await self.coordinator.client.async_delete_list_item(item)
            await self.coordinator.async_request_refresh()
        except AhShoppingError as err:
            raise HomeAssistantError(str(err)) from err

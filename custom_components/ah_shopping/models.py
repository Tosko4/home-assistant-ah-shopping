"""Data models for Albert Heijn Shopping."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


def _int(value: Any, default: int = 0) -> int:
    try:
        return int(value) if value is not None else default
    except (TypeError, ValueError):
        return default


def _float(value: Any, default: float = 0.0) -> float:
    """Normalise AH money values.

    AH currently returns prices both as plain numbers and as nested money
    objects such as {"amount": 1.10} (and, in some APIs,
    {"amount": {"amount": 1.10}}).
    """
    while isinstance(value, dict):
        if "amount" not in value:
            return default
        value = value.get("amount")
    try:
        return float(value) if value is not None else default
    except (TypeError, ValueError):
        return default


@dataclass(slots=True, frozen=True)
class Product:
    id: int
    title: str
    brand: str = ""
    unit_size: str = ""
    price_now: float = 0.0
    price_was: float = 0.0
    is_bonus: bool = False
    bonus_mechanism: str = ""
    image_url: str = ""

    @classmethod
    def from_api(cls, payload: dict[str, Any]) -> "Product":
        data = payload.get("productCard") if isinstance(payload.get("productCard"), dict) else payload
        images = data.get("images") or []
        best_image = ""
        if isinstance(images, list):
            valid = [i for i in images if isinstance(i, dict) and i.get("url")]
            if valid:
                best = max(valid, key=lambda i: _int(i.get("width")))
                best_image = str(best.get("url", ""))
        price_now = _float(data.get("currentPrice"))
        price_was = _float(data.get("priceBeforeBonus"))
        if price_now <= 0:
            price_now = price_was
        return cls(
            id=_int(data.get("webshopId") or data.get("id") or payload.get("productId")),
            title=str(data.get("title", "")),
            brand=str(data.get("brand", "")),
            unit_size=str(data.get("salesUnitSize", "")),
            price_now=price_now,
            price_was=price_was,
            is_bonus=bool(data.get("isBonus")),
            bonus_mechanism=str(data.get("bonusMechanism", "")),
            image_url=best_image,
        )

    def as_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "title": self.title,
            "brand": self.brand,
            "unit_size": self.unit_size,
            "price_now": round(self.price_now, 2),
            "price_was": round(self.price_was, 2),
            "is_bonus": self.is_bonus,
            "bonus_mechanism": self.bonus_mechanism,
            "image_url": self.image_url,
        }


@dataclass(slots=True, frozen=True)
class ShoppingItem:
    item_id: str
    product_id: int
    quantity: int
    description: str = ""
    product: Product | None = None

    @property
    def is_product(self) -> bool:
        return self.product_id > 0

    @property
    def title(self) -> str:
        if self.product and self.product.title:
            return self.product.title
        if self.description:
            return self.description
        return f"Product {self.product_id}" if self.product_id else "Boodschap"

    @property
    def line_total(self) -> float:
        return (self.product.price_now if self.product else 0.0) * self.quantity

    def as_dict(self) -> dict[str, Any]:
        result: dict[str, Any] = {
            "item_id": self.item_id,
            "product_id": self.product_id,
            "quantity": self.quantity,
            "title": self.title,
            "description": self.description,
            "is_product": self.is_product,
            "line_total": round(self.line_total, 2),
        }
        if self.product:
            result.update(self.product.as_dict())
            result["product_id"] = self.product_id
            result["is_product"] = True
        return result


@dataclass(slots=True, frozen=True)
class ShoppingListData:
    list_id: str
    name: str
    items: tuple[ShoppingItem, ...] = field(default_factory=tuple)

    @property
    def total_quantity(self) -> int:
        return sum(max(item.quantity, 0) for item in self.items)

    @property
    def estimated_total(self) -> float:
        return round(sum(item.line_total for item in self.items), 2)

    def quantity_for_product(self, product_id: int) -> int:
        item = self.item_for_product(product_id)
        return item.quantity if item else 0

    def item_for_product(self, product_id: int) -> ShoppingItem | None:
        return next((item for item in self.items if item.product_id == product_id), None)

    def as_dict(self) -> dict[str, Any]:
        return {
            "list_id": self.list_id,
            "name": self.name,
            "total_quantity": self.total_quantity,
            "unique_items": len(self.items),
            "estimated_total": self.estimated_total,
            "items": [item.as_dict() for item in self.items],
        }

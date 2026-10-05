from custom_components.ah_shopping.models import Product, ShoppingItem, ShoppingListData


def test_product_parse_and_total():
    p = Product.from_api({
        "webshopId": 123,
        "title": "Melk",
        "currentPrice": 1.49,
        "priceBeforeBonus": 1.79,
        "isBonus": True,
        "bonusMechanism": "25% korting",
        "images": [{"url": "small", "width": 80}, {"url": "large", "width": 400}],
    })
    assert p.id == 123 and p.image_url == "large" and p.is_bonus
    data = ShoppingListData(
        "abc",
        "Boodschappen",
        (ShoppingItem("i1", 123, 2, "Melk", p),),
    )
    assert data.total_quantity == 2
    assert data.estimated_total == 2.98
    assert data.quantity_for_product(123) == 2


def test_missing_price_is_safe():
    p = Product.from_api({"webshopId": 5, "title": "X"})
    assert p.price_now == 0


def test_free_text_item_keeps_description():
    item = ShoppingItem("text-1-bananen", 0, 2, "bananen", None)
    assert item.title == "bananen"
    assert item.is_product is False
    assert item.line_total == 0
    assert item.as_dict()["description"] == "bananen"


def test_nested_money_amount_is_parsed():
    p = Product.from_api({
        "webshopId": 110,
        "title": "Testproduct",
        "currentPrice": {"amount": 1.10},
        "priceBeforeBonus": {"amount": {"amount": 1.39}},
    })
    assert p.price_now == 1.10
    assert p.price_was == 1.39


def test_nested_money_amount_contributes_to_list_total():
    p = Product.from_api({
        "webshopId": 110,
        "title": "Testproduct",
        "currentPrice": {"amount": 1.10},
    })
    data = ShoppingListData(
        "abc",
        "Boodschappen",
        (ShoppingItem("i1", 110, 1, "Testproduct", p),),
    )
    assert data.estimated_total == 1.10


def test_second_half_price_bonus_four_items():
    p = Product(
        id=602290,
        title="AH Zaanlander Belegen 48+ plakken",
        price_now=2.89,
        price_was=2.89,
        is_bonus=True,
        bonus_mechanism="2e HALVE PRIJS",
    )
    item = ShoppingItem("x", p.id, 4, p.title, p)
    assert item.line_total == 11.56
    assert item.bonus_savings == 2.89
    assert item.line_total_after_bonus == 8.67


def test_user_example_total_matches_ah_app():
    mimo = Product(id=575439, title="MIMO Cookie dough", price_now=3.99)
    cheese = Product(
        id=602290,
        title="AH Zaanlander",
        price_now=2.89,
        price_was=2.89,
        is_bonus=True,
        bonus_mechanism="2e HALVE PRIJS",
    )
    other = Product(id=999999, title="Other items", price_now=16.47)
    data = ShoppingListData(
        "abc",
        "Boodschappen",
        (
            ShoppingItem("mimo", mimo.id, 1, mimo.title, mimo),
            ShoppingItem("cheese", cheese.id, 4, cheese.title, cheese),
            ShoppingItem("other", other.id, 1, other.title, other),
        ),
    )
    assert data.subtotal == 32.02
    assert data.bonus_savings == 2.89
    assert data.estimated_total == 29.13


def test_optimistic_quantity_update():
    p = Product(id=10, title="Melk", price_now=2.0)
    data = ShoppingListData(
        "abc",
        "Boodschappen",
        (ShoppingItem("x", 10, 1, "Melk", p),),
    )
    changed = data.with_product_quantity(10, 4)
    assert data.items[0].quantity == 1
    assert changed.items[0].quantity == 4
    assert changed.estimated_total == 8.0


def test_optimistic_quantity_zero_removes_product():
    p = Product(id=10, title="Melk", price_now=2.0)
    data = ShoppingListData(
        "abc",
        "Boodschappen",
        (ShoppingItem("x", 10, 1, "Melk", p),),
    )
    changed = data.with_product_quantity(10, 0)
    assert changed.items == ()
    assert changed.total_quantity == 0


def test_optimistic_insert_scanned_product():
    p = Product(id=123, title="Scanproduct", price_now=2.49)
    data = ShoppingListData("abc", "Boodschappen", ())
    changed = data.with_product(p, 1)
    assert len(changed.items) == 1
    assert changed.items[0].product_id == 123
    assert changed.items[0].quantity == 1
    assert changed.items[0].product == p
    assert changed.estimated_total == 2.49


def test_optimistic_scanned_product_updates_existing_item():
    old = Product(id=123, title="Oud", price_now=2.00)
    new = Product(id=123, title="Nieuw", price_now=2.49)
    data = ShoppingListData(
        "abc",
        "Boodschappen",
        (ShoppingItem("product-123", 123, 1, "Oud", old),),
    )
    changed = data.with_product(new, 3)
    assert len(changed.items) == 1
    assert changed.items[0].quantity == 3
    assert changed.items[0].title == "Nieuw"
    assert changed.estimated_total == 7.47


def test_checked_item_serializes():
    p = Product(id=1, title="Kaas", price_now=2.5)
    item = ShoppingItem("x", 1, 1, "Kaas", p, True)
    assert item.as_dict()["checked"] is True


def test_checked_state_update_keeps_quantity_and_product():
    p = Product(id=1, title="Kaas", price_now=2.5)
    data = ShoppingListData(
        "abc",
        "Boodschappen",
        (ShoppingItem("x", 1, 3, "Kaas", p, False),),
    )
    changed = data.with_item_checked(1, "Kaas", True)
    assert changed.items[0].checked is True
    assert changed.items[0].quantity == 3
    assert changed.items[0].product == p


def test_next_order_totals():
    from custom_components.ah_shopping.models import NextOrderData, NextOrderItem

    order = NextOrderData(
        order_id=1,
        items=(
            NextOrderItem(10, "A", 2, price_now=1.50),
            NextOrderItem(11, "B", 3, price_now=2.00),
        ),
    )
    assert order.unique_items == 2
    assert order.total_quantity == 5
    assert order.as_dict()["items"][0]["line_total"] == 3.00


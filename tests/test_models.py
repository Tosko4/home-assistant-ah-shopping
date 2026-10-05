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

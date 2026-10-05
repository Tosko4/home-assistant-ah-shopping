import asyncio

import pytest

from custom_components.ah_shopping.api import AhShoppingApiClient
from custom_components.ah_shopping.const import (
    SHOPPINGLIST_ITEMS_PATH,
    SHOPPINGLIST_ITEMS_READ_PATH,
)
from custom_components.ah_shopping.exceptions import AhAuthError, AhRequestError


def test_extract_code_plain():
    assert AhShoppingApiClient.extract_authorization_code("abc") == "abc"


def test_extract_code_callback():
    assert AhShoppingApiClient.extract_authorization_code(
        "appie://login-exit?code=hello%201"
    ) == "hello 1"


def test_rejected_authorization_code_is_auth_error():
    class RejectingClient(AhShoppingApiClient):
        async def _raw_request(self, *args, **kwargs):
            raise AhRequestError("rejected", 400)

    client = RejectingClient(None)
    with pytest.raises(AhAuthError):
        asyncio.run(client.exchange_authorization_code("one-time-code"))


def test_connection_validation_matches_delivery_graphql_path():
    class ValidationClient(AhShoppingApiClient):
        query = None

        async def _graphql(self, query, variables=None):
            self.query = query
            return {"orderFulfillments": {"result": []}}

        async def async_get_list_payload(self):
            raise AssertionError("login validation must not call shopping-list API")

    client = ValidationClient(None, access_token="token")
    asyncio.run(client.async_validate_connection())
    assert "orderFulfillments(status: OPEN)" in client.query


def test_shopping_list_reads_current_v2_items_endpoint():
    class ListClient(AhShoppingApiClient):
        request = None

        async def _raw_request(self, method, path, **kwargs):
            self.request = (method, path, kwargs)
            return {"id": "list-1", "items": []}

    client = ListClient(None, access_token="token")
    data = asyncio.run(client.async_get_list_payload())
    assert data["id"] == "list-1"
    assert client.request[0:2] == ("GET", SHOPPINGLIST_ITEMS_READ_PATH)


def test_quantity_update_uses_v2_patch_and_zero_deletes():
    class ListClient(AhShoppingApiClient):
        request = None

        async def _raw_request(self, method, path, **kwargs):
            self.request = (method, path, kwargs)
            return {}

    client = ListClient(None, access_token="token")
    asyncio.run(client.async_set_product_quantity("ignored", 12345, 0))
    method, path, kwargs = client.request
    assert method == "PATCH"
    assert path == SHOPPINGLIST_ITEMS_PATH
    item = kwargs["json_body"]["items"][0]
    assert item["productId"] == 12345
    assert item["quantity"] == 0
    assert item["type"] == "SHOPPABLE"
    assert item["originCode"] == "PRD"


def test_current_list_shape_reads_nested_product_and_text_item():
    class ListClient(AhShoppingApiClient):
        async def async_get_list_payload(self):
            return {
                "id": "my-list",
                "items": [
                    {
                        "listItemId": 41,
                        "quantity": 2,
                        "description": "",
                        "productDetails": {
                            "product": {"webshopId": 482500, "title": "AH Woksaus"}
                        },
                    },
                    {
                        "listItemId": 0,
                        "quantity": 1,
                        "description": "bananen",
                        "position": 9,
                    },
                ],
            }

        async def async_get_products(self, product_ids):
            assert product_ids == [482500]
            return []

    data = asyncio.run(ListClient(None, access_token="token").async_get_shopping_data())
    assert len(data.items) == 2
    assert data.total_quantity == 3
    assert data.items[0].product_id == 482500
    assert data.items[0].title == "AH Woksaus"
    assert data.items[1].product_id == 0
    assert data.items[1].title == "bananen"


def test_missing_bulk_product_uses_detail_price_fallback():
    class ListClient(AhShoppingApiClient):
        async def async_get_list_payload(self):
            return {
                "id": "my-list",
                "items": [
                    {
                        "quantity": 1,
                        "productDetails": {
                            "product": {
                                "webshopId": 575439,
                                "title": "MIMO Cookie dough classic chocolate chip",
                            }
                        },
                    }
                ],
            }

        async def async_get_products(self, product_ids):
            assert product_ids == [575439]
            return []

        async def async_get_product_detail(self, product_id):
            assert product_id == 575439
            from custom_components.ah_shopping.models import Product
            return Product(
                id=575439,
                title="MIMO Cookie dough classic chocolate chip",
                price_now=3.99,
            )

    data = asyncio.run(ListClient(None, access_token="token").async_get_shopping_data())
    assert data.items[0].product.price_now == 3.99
    assert data.items[0].line_total == 3.99

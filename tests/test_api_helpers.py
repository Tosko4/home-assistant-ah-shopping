import asyncio

import pytest

from custom_components.ah_shopping.api import AhShoppingApiClient
from custom_components.ah_shopping.const import SHOPPINGLIST_ITEMS_PATH
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


def test_shopping_list_reads_v2_items_endpoint():
    class ListClient(AhShoppingApiClient):
        request = None

        async def _raw_request(self, method, path, **kwargs):
            self.request = (method, path, kwargs)
            return {"id": "list-1", "items": []}

    client = ListClient(None, access_token="token")
    data = asyncio.run(client.async_get_list_payload())
    assert data["id"] == "list-1"
    assert client.request[0:2] == ("GET", SHOPPINGLIST_ITEMS_PATH)


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

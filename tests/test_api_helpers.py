import asyncio

import pytest

from custom_components.ah_shopping.api import AhShoppingApiClient
from custom_components.ah_shopping.exceptions import AhAuthError, AhRequestError


def test_extract_code_plain():
    assert AhShoppingApiClient.extract_authorization_code("abc") == "abc"


def test_extract_code_callback():
    assert AhShoppingApiClient.extract_authorization_code("appie://login-exit?code=hello%201") == "hello 1"


def test_rejected_authorization_code_is_auth_error():
    class RejectingClient(AhShoppingApiClient):
        async def _raw_request(self, *args, **kwargs):
            raise AhRequestError("rejected", 400)

    client = RejectingClient(None)
    with pytest.raises(AhAuthError):
        asyncio.run(client.exchange_authorization_code("one-time-code"))


def test_connection_validation_only_uses_shopping_lists():
    class ValidationClient(AhShoppingApiClient):
        called = False

        async def async_get_lists(self):
            self.called = True
            return []

        async def _graphql(self, *args, **kwargs):
            raise AssertionError("setup validation must not use GraphQL")

    client = ValidationClient(None, access_token="token")
    asyncio.run(client.async_validate_connection())
    assert client.called

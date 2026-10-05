"""Async client for the unofficial Albert Heijn mobile API."""
from __future__ import annotations

import asyncio
from collections.abc import Awaitable, Callable
from datetime import datetime, timezone
import json
from typing import Any
from urllib.parse import parse_qs, quote, urlencode, urlparse

from aiohttp import ClientError, ClientResponse, ClientSession

from .const import (
    API_BASE_URL, APPLICATION, BASE_FULFILLMENTS_QUERY, CLIENT_ID,
    CLIENT_VERSION, LOGIN_BASE_URL, SHOPPINGLIST_ITEMS_PATH,
    SHOPPINGLIST_ITEMS_READ_PATH,
    TOKEN_REFRESH_MARGIN, USER_AGENT,
)
from .exceptions import AhAuthError, AhNotFoundError, AhRequestError, AhTransientError
from .models import Product, ShoppingItem, ShoppingListData

TokenUpdateCallback = Callable[[dict[str, Any]], Awaitable[None]]


class AhShoppingApiClient:
    """Minimal authenticated AH shopping client."""

    def __init__(
        self,
        session: ClientSession,
        *,
        access_token: str = "",
        refresh_token: str = "",
        expires_at: float = 0,
        member_id: str = "",
        token_update_callback: TokenUpdateCallback | None = None,
        base_url: str = API_BASE_URL,
    ) -> None:
        self._session = session
        self._access_token = access_token
        self._refresh_token = refresh_token
        self._expires_at = expires_at
        self._member_id = member_id
        self._token_update_callback = token_update_callback
        self._base_url = base_url.rstrip("/")
        self._refresh_lock = asyncio.Lock()

    @staticmethod
    def login_url() -> str:
        return (
            f"{LOGIN_BASE_URL}/login?client_id={CLIENT_ID}"
            "&response_type=code&redirect_uri=appie%3A%2F%2Flogin-exit"
        )

    @staticmethod
    def extract_authorization_code(value: str) -> str:
        raw = value.strip()
        if not raw:
            raise ValueError("Authorization code is empty")
        if "code=" not in raw:
            return raw
        parsed = urlparse(raw)
        code = parse_qs(parsed.query).get("code", [""])[0]
        if not code:
            raise ValueError("No authorization code found in URL")
        return code

    def token_data(self) -> dict[str, Any]:
        return {
            "access_token": self._access_token,
            "refresh_token": self._refresh_token,
            "expires_at": self._expires_at,
            "member_id": self._member_id,
        }

    def _headers(self, authenticated: bool = True) -> dict[str, str]:
        headers = {
            "User-Agent": USER_AGENT,
            "x-client-name": CLIENT_ID,
            "x-client-version": CLIENT_VERSION,
            "x-application": APPLICATION,
            "Accept": "application/json",
            "Content-Type": "application/json",
        }
        if authenticated and self._access_token:
            headers["Authorization"] = f"Bearer {self._access_token}"
        return headers

    def _token_is_fresh(self) -> bool:
        if not self._access_token:
            return False
        if not self._expires_at:
            return True
        return (
            datetime.now(timezone.utc).timestamp()
            + TOKEN_REFRESH_MARGIN.total_seconds()
            < self._expires_at
        )

    async def _accept_token_payload(self, payload: dict[str, Any]) -> None:
        access = payload.get("access_token") or payload.get("accessToken")
        refresh = payload.get("refresh_token") or payload.get("refreshToken")
        if not access or not refresh:
            raise AhAuthError("AH token response did not contain usable tokens")
        expires = payload.get("expires_in") or payload.get("expiresIn") or 0
        try:
            seconds = max(0, int(expires))
        except (TypeError, ValueError):
            seconds = 0
        self._access_token = str(access)
        self._refresh_token = str(refresh)
        self._expires_at = datetime.now(timezone.utc).timestamp() + seconds if seconds else 0
        member = payload.get("member_id") or payload.get("memberId")
        if member:
            self._member_id = str(member)
        if self._token_update_callback:
            await self._token_update_callback(self.token_data())

    async def exchange_authorization_code(self, value: str) -> dict[str, Any]:
        code = self.extract_authorization_code(value)
        try:
            payload = await self._raw_request(
                "POST", "/mobile-auth/v1/auth/token",
                json_body={"clientId": CLIENT_ID, "code": code},
                authenticated=False,
            )
        except AhRequestError as err:
            raise AhAuthError(
                f"Albert Heijn rejected the authorization code: {err}"
            ) from err
        if not isinstance(payload, dict):
            raise AhAuthError("Unexpected token response")
        await self._accept_token_payload(payload)
        return self.token_data()

    async def async_refresh_access_token(self) -> None:
        if not self._refresh_token:
            raise AhAuthError("No refresh token is available")
        async with self._refresh_lock:
            if self._token_is_fresh():
                return
            try:
                payload = await self._raw_request(
                    "POST", "/mobile-auth/v1/auth/token/refresh",
                    json_body={"clientId": CLIENT_ID, "refreshToken": self._refresh_token},
                    authenticated=False,
                    allow_refresh=False,
                )
            except AhRequestError as err:
                raise AhAuthError(
                    f"Albert Heijn rejected the refresh token: {err}"
                ) from err
            if not isinstance(payload, dict):
                raise AhAuthError("Unexpected refresh response")
            await self._accept_token_payload(payload)

    async def _ensure_token(self) -> None:
        if self._token_is_fresh():
            return
        await self.async_refresh_access_token()

    async def _raw_request(
        self,
        method: str,
        path: str,
        *,
        json_body: dict[str, Any] | None = None,
        authenticated: bool = True,
        allow_refresh: bool = True,
    ) -> Any:
        if authenticated:
            await self._ensure_token()
        try:
            response = await self._session.request(
                method,
                f"{self._base_url}{path}",
                headers=self._headers(authenticated),
                json=json_body,
                timeout=20,
            )
        except (ClientError, TimeoutError, asyncio.TimeoutError) as err:
            raise AhTransientError(f"Could not reach Albert Heijn: {err}") from err
        if response.status == 401 and authenticated and allow_refresh and self._refresh_token:
            response.release()
            self._expires_at = 1
            await self.async_refresh_access_token()
            return await self._raw_request(
                method, path, json_body=json_body, authenticated=True, allow_refresh=False
            )
        return await self._decode_response(response)

    async def _decode_response(self, response: ClientResponse) -> Any:
        try:
            text = await response.text()
        finally:
            response.release()
        if response.status in (401, 403):
            raise AhAuthError(f"Albert Heijn rejected authentication (HTTP {response.status})")
        if response.status == 404:
            raise AhNotFoundError("Albert Heijn resource not found")
        if response.status == 429 or response.status >= 500:
            raise AhTransientError(f"Albert Heijn temporarily unavailable (HTTP {response.status})")
        if response.status >= 400:
            raise AhRequestError(f"Albert Heijn rejected the request (HTTP {response.status})", response.status)
        if not text:
            return {}
        try:
            return json.loads(text)
        except json.JSONDecodeError as err:
            raise AhTransientError("Albert Heijn returned invalid JSON") from err

    async def _graphql(self, query: str, variables: dict[str, Any] | None = None) -> dict[str, Any]:
        payload = await self._raw_request(
            "POST", "/graphql", json_body={"query": query, "variables": variables or {}}
        )
        if not isinstance(payload, dict):
            raise AhTransientError("Unexpected GraphQL response")
        if payload.get("errors"):
            message = "; ".join(
                str(e.get("message", e)) if isinstance(e, dict) else str(e)
                for e in payload["errors"]
            )
            raise AhRequestError(message)
        data = payload.get("data")
        if not isinstance(data, dict):
            raise AhTransientError("GraphQL response has no data object")
        return data

    async def async_validate_connection(self) -> None:
        # Deliberately identical to Albert Heijn Delivery's login validation.
        await self._graphql(BASE_FULFILLMENTS_QUERY)

    async def async_get_list_payload(self) -> dict[str, Any]:
        data = await self._raw_request("GET", SHOPPINGLIST_ITEMS_READ_PATH)
        if not isinstance(data, dict):
            raise AhTransientError("Unexpected AH shopping-list response")
        return data

    async def async_get_list_items(self, list_id: str = "") -> list[dict[str, Any]]:
        del list_id
        data = await self.async_get_list_payload()
        items = data.get("items") or []
        return items if isinstance(items, list) else []

    async def async_get_products(self, product_ids: list[int]) -> list[Product]:
        if not product_ids:
            return []
        params = [("ids", str(i)) for i in product_ids]
        params.append(("sortOn", "INPUT_PRODUCT_IDS"))
        raw = await self._raw_request(
            "GET", f"/mobile-services/product/search/v2/products?{urlencode(params)}"
        )
        if not isinstance(raw, list):
            return []
        return [Product.from_api(p) for p in raw if isinstance(p, dict)]

    async def async_get_product_detail(self, product_id: int) -> Product:
        raw = await self._raw_request(
            "GET", f"/mobile-services/product/detail/v4/fir/{int(product_id)}"
        )
        if not isinstance(raw, dict):
            raise AhNotFoundError("No AH product details found")
        product = Product.from_api(raw)
        if product.id <= 0:
            raise AhNotFoundError("No AH product details found")
        return product

    async def async_search_products(self, query: str, limit: int = 8) -> list[Product]:
        params = urlencode({"query": query, "page": 0, "size": max(1, min(limit, 20)), "sortOn": "RELEVANCE"})
        raw = await self._raw_request("GET", f"/mobile-services/product/search/v2?{params}")
        if not isinstance(raw, dict):
            return []
        return [Product.from_api(p) for p in raw.get("products") or [] if isinstance(p, dict)]

    async def async_lookup_barcode(self, barcode: str) -> Product:
        code = "".join(ch for ch in barcode if ch.isdigit())
        if len(code) not in (8, 12, 13, 14):
            raise AhRequestError("Barcode must be EAN-8, UPC-A, EAN-13 or GTIN-14")
        raw = await self._raw_request(
            "GET", f"/mobile-services/product/search/v1/gtin/{quote(code, safe='')}"
        )
        if not isinstance(raw, dict):
            raise AhNotFoundError("No AH product found for this barcode")
        product = Product.from_api(raw)
        if product.id <= 0:
            raise AhNotFoundError("No AH product found for this barcode")
        return product

    async def async_set_product_quantity(
        self, list_id: str, product_id: int, quantity: int
    ) -> None:
        # "Mijn lijst" is account-wide in shoppinglist v2; list_id is kept in the
        # public method signature so the rest of the integration remains stable.
        del list_id
        item = {
            "description": "",
            "productId": int(product_id),
            "quantity": max(0, int(quantity)),
            "type": "SHOPPABLE",
            "originCode": "PRD",
            "searchTerm": "",
            "strikeThrough": False,
        }
        await self._raw_request(
            "PATCH", SHOPPINGLIST_ITEMS_PATH, json_body={"items": [item]}
        )

    async def async_get_shopping_data(self) -> ShoppingListData:
        data = await self.async_get_list_payload()
        raw_items = data.get("items") or []
        if not isinstance(raw_items, list):
            raw_items = []

        def product_id_from_item(raw: dict[str, Any]) -> int:
            direct = int(raw.get("productId") or 0)
            if direct > 0:
                return direct
            details = raw.get("productDetails")
            if not isinstance(details, dict):
                return 0
            nested = details.get("product")
            if not isinstance(nested, dict):
                return 0
            return int(nested.get("webshopId") or nested.get("id") or 0)

        def description_from_item(raw: dict[str, Any]) -> str:
            description = str(raw.get("description") or "").strip()
            if description:
                return description
            details = raw.get("productDetails")
            if isinstance(details, dict):
                nested = details.get("product")
                if isinstance(nested, dict):
                    return str(nested.get("title") or "").strip()
            return ""

        product_ids = [
            product_id_from_item(item)
            for item in raw_items
            if isinstance(item, dict) and product_id_from_item(item) > 0
        ]
        products = {
            product.id: product
            for product in await self.async_get_products(
                list(dict.fromkeys(product_ids))
            )
        }

        def product_from_list_item(
            raw: dict[str, Any], product_id: int
        ) -> Product | None:
            details = raw.get("productDetails")
            if not isinstance(details, dict):
                return None
            nested = details.get("product")
            if not isinstance(nested, dict):
                return None
            fallback = Product.from_api(nested)
            return fallback if fallback.id == product_id and fallback.id > 0 else None

        parsed_items: list[ShoppingItem] = []
        for position, raw in enumerate(raw_items):
            if not isinstance(raw, dict):
                continue
            product_id = product_id_from_item(raw)
            description = description_from_item(raw)
            quantity = max(1, int(raw.get("quantity") or 1))
            raw_id = raw.get("listItemId")
            if raw_id not in (None, 0, "0"):
                item_id = str(raw_id)
            elif product_id > 0:
                item_id = f"product-{product_id}"
            else:
                item_id = f"text-{raw.get('position', position)}-{description}"

            product = products.get(product_id)
            if product_id > 0 and (product is None or product.price_now <= 0):
                # Products that are no longer orderable can be omitted from the
                # bulk endpoint. First use the data embedded in the user's list.
                list_product = product_from_list_item(raw, product_id)
                if list_product is not None and list_product.price_now > 0:
                    product = list_product
                else:
                    # As a final fallback, ask the product-detail endpoint. This
                    # keeps discontinued/unorderable list items from becoming €0.
                    try:
                        detail_product = await self.async_get_product_detail(product_id)
                    except (AhNotFoundError, AhRequestError, AhTransientError):
                        detail_product = None
                    if detail_product is not None and detail_product.price_now > 0:
                        product = detail_product
                    elif product is None:
                        product = list_product

            parsed_items.append(
                ShoppingItem(
                    item_id=item_id,
                    product_id=product_id,
                    quantity=quantity,
                    description=description,
                    product=product,
                )
            )

        items = tuple(parsed_items)

        return ShoppingListData(
            list_id=str(data.get("id") or "my-list"),
            name="Boodschappenlijst",
            items=items,
        )

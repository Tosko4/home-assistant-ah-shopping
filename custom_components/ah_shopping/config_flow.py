"""Config flow for Albert Heijn Shopping."""
from __future__ import annotations

import hashlib
import logging
from typing import Any, Mapping

import voluptuous as vol
from homeassistant import config_entries
from homeassistant.config_entries import ConfigFlowResult
from homeassistant.helpers.aiohttp_client import async_get_clientsession

from .api import AhShoppingApiClient
from .const import (
    CLIENT_ID,
    CONF_ACCESS_TOKEN,
    CONF_EXPIRES_AT,
    CONF_MEMBER_ID,
    CONF_REFRESH_TOKEN,
    DOMAIN,
    NAME,
)
from .exceptions import AhAuthError, AhShoppingError, AhTransientError

CONF_AUTHORIZATION_CODE = "authorization_code"
_LOGGER = logging.getLogger(__name__)


def _schema() -> vol.Schema:
    return vol.Schema({vol.Required(CONF_AUTHORIZATION_CODE): str})


def _entry_data(tokens: dict[str, Any]) -> dict[str, Any]:
    return {
        CONF_ACCESS_TOKEN: tokens.get(CONF_ACCESS_TOKEN, ""),
        CONF_REFRESH_TOKEN: tokens.get(CONF_REFRESH_TOKEN, ""),
        CONF_EXPIRES_AT: tokens.get(CONF_EXPIRES_AT, 0),
        CONF_MEMBER_ID: tokens.get(CONF_MEMBER_ID, ""),
        "client_id": CLIENT_ID,
    }


class AhShoppingConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    """Handle the Albert Heijn Shopping config flow."""

    VERSION = 1

    async def _exchange(self, value: str) -> dict[str, Any]:
        client = AhShoppingApiClient(async_get_clientsession(self.hass))
        tokens = await client.exchange_authorization_code(value)
        # Validate only the proven shopping-list endpoint. An unrelated GraphQL
        # schema rejection must never make a valid AH login look broken.
        await client.async_validate_connection()
        return tokens

    async def async_step_user(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        errors: dict[str, str] = {}
        if user_input is not None:
            try:
                tokens = await self._exchange(user_input[CONF_AUTHORIZATION_CODE])
            except (AhAuthError, ValueError) as err:
                _LOGGER.warning("Albert Heijn authorization failed during setup: %s", err)
                errors["base"] = "invalid_auth"
            except AhTransientError as err:
                _LOGGER.warning("Albert Heijn is temporarily unavailable during setup: %s", err)
                errors["base"] = "cannot_connect"
            except AhShoppingError as err:
                _LOGGER.warning("Albert Heijn shopping-list validation failed during setup: %s", err)
                errors["base"] = "cannot_connect"
            else:
                source = str(tokens.get(CONF_MEMBER_ID) or tokens.get(CONF_REFRESH_TOKEN) or "")
                unique = hashlib.sha256(source.encode()).hexdigest()[:24]
                await self.async_set_unique_id(unique)
                self._abort_if_unique_id_configured()
                return self.async_create_entry(title=NAME, data=_entry_data(tokens))

        return self.async_show_form(
            step_id="user",
            data_schema=_schema(),
            errors=errors,
            description_placeholders={"login_url": AhShoppingApiClient.login_url()},
        )

    async def async_step_reauth(self, entry_data: Mapping[str, Any]) -> ConfigFlowResult:
        return await self.async_step_reauth_confirm()

    async def async_step_reauth_confirm(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        errors: dict[str, str] = {}
        if user_input is not None:
            try:
                tokens = await self._exchange(user_input[CONF_AUTHORIZATION_CODE])
            except (AhAuthError, ValueError) as err:
                _LOGGER.warning("Albert Heijn authorization failed during reauthentication: %s", err)
                errors["base"] = "invalid_auth"
            except AhTransientError as err:
                _LOGGER.warning("Albert Heijn is temporarily unavailable during reauthentication: %s", err)
                errors["base"] = "cannot_connect"
            except AhShoppingError as err:
                _LOGGER.warning("Albert Heijn shopping-list validation failed during reauthentication: %s", err)
                errors["base"] = "cannot_connect"
            else:
                entry = self._get_reauth_entry()
                return self.async_update_reload_and_abort(entry, data_updates=_entry_data(tokens))

        return self.async_show_form(
            step_id="reauth_confirm",
            data_schema=_schema(),
            errors=errors,
            description_placeholders={"login_url": AhShoppingApiClient.login_url()},
        )

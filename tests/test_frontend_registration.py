from custom_components.ah_shopping.const import FRONTEND_MODULE_URL
import asyncio
from pathlib import Path
from types import ModuleType, SimpleNamespace


def load_registration(monkeypatch, extra):
    modules = {
        "homeassistant.components.frontend": {"add_extra_js_url": lambda hass, url: extra.append(url)},
        "homeassistant.components.http": {"StaticPathConfig": lambda *args, **kwargs: args},
        "homeassistant.components.lovelace.const": {"LOVELACE_DATA": "lovelace"},
        "homeassistant.core": {"HomeAssistant": object},
    }
    for name, values in modules.items():
        module = ModuleType(name)
        module.__dict__.update(values)
        monkeypatch.setitem(__import__('sys').modules, name, module)
    scope = {"__name__": "custom_components.ah_shopping.frontend", "__package__": "custom_components.ah_shopping", "__file__": str(Path(__file__).parent.parent / 'custom_components/ah_shopping/frontend.py')}
    exec(compile(Path(scope['__file__']).read_text(), scope['__file__'], 'exec'), scope)
    return scope['async_register_frontend']


class Resources:
    def __init__(self, saved):
        self.saved = saved
        self.items = []
        self.loaded = False

    async def async_get_info(self):
        if not self.loaded:
            self.items = [dict(item) for item in self.saved]
            self.loaded = True

    def async_items(self):
        assert self.loaded
        return self.items

    async def async_create_item(self, data):
        assert self.loaded
        self.items.append({"id": "new", "url": data['url'], "type": data['res_type']})

    async def async_update_item(self, item_id, data):
        assert self.loaded
        item = next(item for item in self.items if item['id'] == item_id)
        item.update(url=data['url'], type=data['res_type'])


def hass_with(resources):
    paths = []
    async def register(paths_arg):
        paths.extend(paths_arg)
    return SimpleNamespace(data={'lovelace': SimpleNamespace(resources=resources)}, http=SimpleNamespace(async_register_static_paths=register)), paths


def test_register_loads_saved_resources_and_is_idempotent(monkeypatch):
    extra = []
    register = load_registration(monkeypatch, extra)
    resources = Resources([{'id': 'other', 'url': '/local/other.js', 'type': 'module'}])
    hass, paths = hass_with(resources)
    asyncio.run(register(hass))
    asyncio.run(register(hass))
    assert len(paths) == 1
    assert len(resources.items) == 2
    assert resources.items[0]['url'] == '/local/other.js'
    assert resources.items[1]['type'] == 'module'
    assert extra == []


def test_register_updates_only_card_resource(monkeypatch):
    register = load_registration(monkeypatch, [])
    resources = Resources([{'id': 'card', 'url': '/ah_shopping/ah-shopping-card.js?v=old', 'type': 'module'}])
    hass, _ = hass_with(resources)
    asyncio.run(register(hass))
    assert len(resources.items) == 1
    assert resources.items[0]['id'] == 'card'
    assert resources.items[0]['url'] == FRONTEND_MODULE_URL


def test_yaml_keeps_automatic_fallback_without_writing_resources(monkeypatch):
    extra = []
    register = load_registration(monkeypatch, extra)
    hass, _ = hass_with(SimpleNamespace(data=[]))
    asyncio.run(register(hass))
    assert len(extra) == 1
    assert hass.data['ah_shopping']['frontend_load_method'] == 'extra_module_url'

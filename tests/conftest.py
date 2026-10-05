import sys
import types
from pathlib import Path

ROOT = Path(__file__).parent.parent
PKG = ROOT / "custom_components" / "ah_shopping"
sys.path.insert(0, str(ROOT))

custom_components = types.ModuleType("custom_components")
custom_components.__path__ = [str(ROOT / "custom_components")]
sys.modules.setdefault("custom_components", custom_components)
package = types.ModuleType("custom_components.ah_shopping")
package.__path__ = [str(PKG)]
sys.modules.setdefault("custom_components.ah_shopping", package)

ha = types.ModuleType("homeassistant")
ha.__path__ = []
ha_const = types.ModuleType("homeassistant.const")
class Platform:
    SENSOR = "sensor"
    TODO = "todo"
ha_const.Platform = Platform
sys.modules.setdefault("homeassistant", ha)
sys.modules.setdefault("homeassistant.const", ha_const)

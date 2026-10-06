"""Keep published documentation and local Markdown links consistent."""
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]


def test_local_markdown_links_exist():
    files = [ROOT / name for name in (
        "README.md", "CONTRIBUTING.md", "SECURITY.md", "THIRD_PARTY_NOTICES.md",
    )] + list((ROOT / "docs").rglob("*.md"))
    for file in files:
        for target in re.findall(r"\]\(([^)]+)\)", file.read_text()):
            if target.startswith(("https://", "http://", "#", "mailto:")):
                continue
            destination = target.split("#", 1)[0]
            assert (file.parent / destination).exists(), (file, destination)


def test_card_settings_are_documented():
    card = (ROOT / "custom_components/ah_shopping/frontend/ah-shopping-card.js").read_text()
    schema = card.split("static getConfigForm()", 1)[1].split("setConfig(config)", 1)[0]
    readme = (ROOT / "README.md").read_text()
    for setting in re.findall(r"name:'([^']+)'", schema):
        assert f"`{setting}`" in readme, setting


def test_historical_report_is_not_presented_as_current():
    assert not (ROOT / "TEST_REPORT.md").exists()
    assert (ROOT / "docs/archive/test-report-0.1.8.md").exists()

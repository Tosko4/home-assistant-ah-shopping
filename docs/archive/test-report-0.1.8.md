# Historical test report

Archived from the repository root; **not** a report for the current release. See [CONTRIBUTING.md](../../CONTRIBUTING.md) and the validation workflow for current tests.

# AH Shopping 0.1.8 – test report

Verified locally on the MVP source tree:

- `python -m compileall -q custom_components/ah_shopping` — PASS
- `pytest -q` — PASS (`12 passed`)
- JavaScript syntax check for `frontend/ean-decoder.js` — PASS
- JavaScript syntax check for `frontend/ah-shopping-card.js` — PASS
- JSON parse check for manifest, HACS metadata, strings and translations — PASS
- YAML parse check for services and GitHub Actions workflows — PASS
- EAN-13 decoder module test with `4006381333931` — PASS
- Synthetic rendered EAN-13 image decode — PASS
- EAN-8 decoder module test with `96385074` — PASS
- Archive layout check — PASS

Not claimed as tested yet:

- Physical camera behavior in Fully Kiosk on the Lenovo Tab M10
- Physical camera behavior in the iPhone Home Assistant app/Safari

Those need the first installation on real Home Assistant hardware/account and are the intended next MVP validation step.

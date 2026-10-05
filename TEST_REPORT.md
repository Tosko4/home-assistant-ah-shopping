# AH Shopping 0.1.6 – test report

Verified locally on the MVP source tree:

- `python -m compileall -q custom_components/ah_shopping` — PASS
- `pytest -q` — PASS (`10 passed`)
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
- Exact checkout-equivalent total for multi-buy Bonus promotions

Those need the first installation on real Home Assistant hardware/account and are the intended next MVP validation step.

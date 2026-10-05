# Albert Heijn Shopping

<p align="center"><img src="brand/logo.png" width="128" alt="Albert Heijn logo"></p>

Home Assistant custom integration for managing the **Albert Heijn shopping list** from Home Assistant, including a bundled camera barcode-scanner card.

> Unofficial integration. Not affiliated with Albert Heijn or Ahold Delhaize. The private mobile API can change without notice.

## 0.2.0

- Authenticated connection to your AH account
- Reads the first/default AH shopping list
- Rich list overview in Home Assistant
- Search AH products and add them
- Increase, decrease and remove quantities
- Shows current price, old price, product image and Bonus text
- Estimated list total
- Camera barcode scanner directly inside the dashboard
- Front/rear camera switch
- Local EAN-13/EAN-8 decoding; UPC-A is handled as EAN-13 with a leading zero
- Native writable `todo` entity: add free-text items, check/uncheck and delete

## Installation

Add `https://github.com/digital-IMEI/home-assistant-ah-shopping` as a HACS custom repository, category **Integration**, install **Albert Heijn Shopping**, restart Home Assistant, then add the integration under **Settings → Devices & services**.

The setup flow is intentionally identical to Albert Heijn Delivery: it opens the AH login page, exchanges the one-time `appie://...code=...` authorization code, and validates authentication with the same proven GraphQL query. The shopping list itself is read separately from `/mobile-services/shoppinglist/v2/items`.

## Dashboard card

The card JS is registered automatically by the integration; no separate Lovelace resource is required.

```yaml
type: custom:ah-shopping-card
title: Boodschappen
```

Optionally specify the list sensor explicitly:

```yaml
type: custom:ah-shopping-card
entity: sensor.albert_heijn_shopping_list
title: Boodschappen
```

### Fixed-height list with scrolling

Set `height` in pixels. The header and search controls stay visible while the shopping list itself scrolls.

```yaml
type: custom:ah-shopping-card
entity: sensor.albert_heijn_shopping_list
title: Boodschappen
height: 500
```

### Scan button only

Use `mode: scan_only` for a compact card that only opens the barcode scanner.

```yaml
type: custom:ah-shopping-card
mode: scan_only
scan_label: Scan product
```

### Test barcode

For a quick camera test, use EAN-13 `8710400169468` (AH Biologisch Halfvolle melk 1 l at the time of writing).

### Camera requirements

Camera access uses `navigator.mediaDevices.getUserMedia()` on the device displaying the dashboard. HTTPS is strongly recommended and may be required by the browser/WebView. On Android/Fully Kiosk, allow camera permission for Fully Kiosk. On iPhone/iPad, allow camera permission for the browser/Home Assistant WebView.

The scanner supports grocery-style **EAN-13, EAN-8, UPC-A and UPC-E**. It uses the browser's native BarcodeDetector when available, then ZXing 0.23.0 as the main fallback, and finally the bundled lightweight EAN decoder as a last-resort fallback.

## Entities

- `sensor.ah_shopping_list` — total item quantity; rich `items` attribute for the card
- `sensor.ah_shopping_estimated_total` — estimated EUR total
- `todo.ah_shopping_list` — read-only native HA view of the list in v0.1

## Services

- `ah_shopping.search_products`
- `ah_shopping.lookup_barcode`
- `ah_shopping.add_product`
- `ah_shopping.add_barcode`
- `ah_shopping.set_quantity`
- `ah_shopping.remove_product`
- `ah_shopping.refresh`

## Synchronisation and conflicts

The full AH list is polled every **5 minutes by default**. The interval is configurable from the integration's **Configure** screen between 1 and 60 minutes.

Writes do not wait for the next poll. After a successful AH write, Home Assistant updates immediately and schedules a reconciliation pull after about 1 second. Recent local quantity/check changes are protected for up to 20 seconds from an eventually-consistent/stale AH response. As soon as AH returns the requested value, the pending change is confirmed and cleared. If AH continues to disagree after that protection window, the AH server becomes authoritative again.

Writes for the same product are serialized inside the integration. Explicit absolute quantity changes are last-successful-write-wins when multiple clients edit the same product concurrently.

## Known limitations

- AH exposes one account-wide "Mijn lijst"; multiple favorites lists are not handled by this integration.
- Rename through the native HA To-do entity is not supported; delete and recreate the item instead.
- Bonus totals are calculated for the supported promotion formats; unknown future AH promotion wording can still make the displayed total an estimate.
- Barcode reliability still depends on camera focus, light and barcode size.

## Next likely steps

1. Continuous scanning and duplicate-scan feedback.
2. Multiple AH lists.
3. Better exact Bonus total calculation.
4. Native todo mutations and checked/picked state.
5. Wider barcode support (Code 128 / Data Matrix) if real-world products require it.

### 0.1.6

- Fixes empty AH list parsing for the current shoppinglist v2 response.
- Reads product IDs from nested `productDetails.product.webshopId`.
- Keeps free-text AH list items visible instead of dropping them.
- Uses the current `orderBy=userInput&orderByParam=0` list read URL.


### 0.1.7

- Fixes list totals when AH returns prices as nested money objects such as `{"amount": 1.10}`.
- Supports doubly nested money values used by some AH API responses.


### 0.1.8

- Uses the shopping-list product payload and product-detail endpoint as fallbacks when AH omits unavailable products from bulk product lookup.
- Calculates supported multi-buy Bonus savings, including `2e halve prijs`.
- Adds a Bonus savings sensor.
- Regression-tested against a real list where €32.02 subtotal minus €2.89 Bonus equals the AH app total of €29.13.


### 0.1.9

- Uses the browser/WebView native `BarcodeDetector` for EAN/UPC scanning when available.
- Falls back to the bundled local EAN decoder when native detection is unavailable.
- Shows live scanner diagnostics including decoder mode and scanned frame count.
- Requests a higher camera resolution for improved barcode recognition.
- Adds a frontend cache-buster so Fully Kiosk/Home Assistant does not keep an older scanner script after updating.


### 0.1.10

- Adds `mode: scan_only` for a compact scanner-only dashboard card.
- Adds configurable `height` in pixels for the full card.
- When a fixed height is configured, the product list scrolls internally while the header/search controls remain visible.
- Adds optional `scan_label` for the scanner-only button.


### 0.1.11

- Quantity changes no longer wait for the full shopping-list/product refresh.
- After a successful AH PATCH, Home Assistant updates the local coordinator immediately and refreshes the complete list in the background.
- The dashboard card keeps a per-product pending quantity and serialises rapid +/- clicks, so repeated taps are not ignored while a previous write is in flight.


### 0.1.12

- Adds ZXing 0.23.0 as the primary barcode fallback for browsers without native BarcodeDetector, including Microsoft Edge contexts where BarcodeDetector is unavailable.
- Scanner order is now: native BarcodeDetector → ZXing → bundled lightweight EAN fallback.
- ZXing reuses the already-open camera feed; it does not request a second camera session.
- Scanner status shows whether native, ZXing or local fallback is active and counts processed frames.
- Prevents duplicate custom-element registration if Home Assistant loads the card module twice.


### 0.1.13

- Plays a short locally generated checkout-scanner beep after a barcode has been resolved and successfully added to the AH list.
- Keeps the scanner open after a successful scan and shows product image, name, current price, unit size and Bonus label.
- Adds +/- quantity controls directly to the scan result.
- Adds "Scan volgende" and "Klaar" actions instead of auto-closing the scanner after one second.
- Newly scanned products are inserted into the Home Assistant coordinator immediately, before the background AH refresh completes.
- Keeps an active scanner modal open while Home Assistant entity updates arrive, preventing scan-result UI from disappearing mid-flow.


### 0.2.0

- Preserves the internal list scroll position across quantity/state updates, so +/- on a bottom item no longer jumps the card back to the top.
- Fixes product search for both AH `products` and `data` response shapes and normalises alternate title/price/unit/image fields.
- Adds visible search states: searching, no results and errors.
- Adds an in-card manual refresh button and shows pending sync changes.
- Adds checked/completed state to list items and a checkbox in the custom card.
- Makes the native Home Assistant To-do entity writable: create free-text items, check/uncheck and delete.
- Quantity writes now preserve item description and checked state.
- Adds conflict-safe reconciliation: local successful writes are protected against stale immediate reads, then reconciled back to AH.
- Serializes writes for the same product.
- Adds configurable full polling interval (1–60 minutes, default 5).
- Adds list diagnostics attributes: `last_synced`, `pending_changes`, and `update_interval_seconds`.

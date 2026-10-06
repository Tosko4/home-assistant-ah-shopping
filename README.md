# Albert Heijn Shopping

<p align="center"><img src="brand/logo.png" width="128" alt="Albert Heijn logo"></p>

Home Assistant custom integration for managing Albert Heijn **Mijn lijst** as a practical shopping cart in Home Assistant, including a bundled camera barcode-scanner card and read-only visibility of the next scheduled order.

> Unofficial integration. Not affiliated with Albert Heijn or Ahold Delhaize. The private mobile API can change without notice.

## 0.2.15

- Authenticated connection to your AH account
- Reads AH "Mijn lijst", presented in the card as **Winkelmandje**
- Rich cart overview in Home Assistant
- Reads the next scheduled AH order and its products
- Search AH products and add them
- Increase, decrease and remove quantities
- Shows current price, old price, product image and Bonus text
- Estimated list total
- Inline camera barcode scanner directly inside the dashboard
- On-demand and permanent scanner modes
- Front/rear camera selection and configurable 1×–4× zoom (2× default)
- Local EAN-13/EAN-8 decoding; UPC-A is handled as EAN-13 with a leading zero
- Native read-only `todo` entity for standard Home Assistant list views

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

### Card sections

The card has three independently configurable sections:

```yaml
type: custom:ah-shopping-card
title: Winkelmandje
show_header: true
show_scan: true
show_products: true
product_source: shopping_list
scan_label: Scan product
```

- `show_header`: title, item count and total amount.
- `show_scan`: full-width barcode scan button.
- `show_products`: product rows.
- `product_source`: which product set the card displays.

Card height is **not configured in pixels**. The card implements Home Assistant's grid sizing API and follows the size selected in the dashboard **Layout** panel. When the available height is smaller than the product list, the products scroll inside the card. The card only enforces a small minimum height.

Available product sources:

```yaml
product_source: shopping_list            # Winkelmandje (AH Mijn lijst), editable
product_source: next_order               # eerstvolgende ingeplande bestelling, read-only
product_source: shopping_list_and_order  # Winkelmandje + volgende bestelling
```

The combined view merges identical products by product id but keeps the two source quantities separate. The displayed quantity is the combined total. The **Bestelling** quantity is a hard read-only minimum: minus only removes extra Winkelmandje quantity and disappears when the total reaches the ordered quantity. Plus is always available for product rows and adds one to Winkelmandje, including products that currently exist only in the scheduled order. The scheduled order is never modified.

AH exposes the order cut-off directly through the fulfillment fields `isAfterCutOff` and `closingDateTime`. As soon as `isAfterCutOff` becomes true, the scheduled order is no longer included in **Winkelmandje + volgende bestelling**: its product rows, quantities, delivery slot and order total are all removed from the combined card. The separate **Volgende bestelling** source remains available as a read-only overview after cut-off.

For backwards compatibility, old `product_source: cart` cards automatically map to `shopping_list`, and old `cart_and_order` cards map to `shopping_list_and_order`.

For a scanner-only card:

```yaml
type: custom:ah-shopping-card
show_header: false
show_scan: true
show_products: false
scan_label: Scan product
```

Existing cards using `mode: scan_only` remain compatible.

### Scanner modes

The scanner is part of the same `custom:ah-shopping-card`.

Default/on-demand mode keeps the normal shopping card visible. Pressing **Scan product** replaces the product list with the live camera feed until the scanner is closed:

```yaml
type: custom:ah-shopping-card
product_source: shopping_list_and_order
scanner_mode: button
scan_camera: front
scan_zoom: 2
scan_decoder: auto
```

Use `scanner_mode: button_auto` (**Via scan button — start active**) to open the camera when the card loads, then return to the list after scanning. Both button modes close after 60 seconds without a scan, or 10 seconds after the last successful scan. Use the scan button to start another session. The permanent feed does not auto-close.

For a dedicated scanner card next to a separate shopping-list card, use permanent mode:

```yaml
type: custom:ah-shopping-card
scanner_mode: permanent
scan_camera: front
scan_zoom: 2
scan_decoder: auto
show_header: false
```

The permanent feed only runs while the card is actually visible: the browser/app must be in the foreground, the dashboard view must be active and the card must intersect the visible viewport. Leaving the view, hiding the app or scrolling the card fully out of view stops the camera stream; returning restarts it.

The feed always fills the Home Assistant-assigned card size and stays centered using a cover-style crop, without imposing its own aspect ratio. `scan_zoom` supports 1× to 4× and defaults to 2×. Hardware camera zoom is used when exposed by the browser/WebView; any remaining zoom is applied as a centered digital crop. `scan_camera` can be `front` or `rear`.

Up to five recently scanned products are shown as rows over the video feed. The newest row is fully opaque; older rows fade to 80%, 60%, 40% and 20%. Scanning the same product again updates its quantity and moves that product back to the top instead of creating a duplicate row. The overlay quantity controls write to Winkelmandje and can reduce an item all the way to zero.

### Test barcode

For a quick camera test, use EAN-13 `8710400169468` (AH Biologisch Halfvolle melk 1 l at the time of writing).

### Camera requirements

Camera access uses `navigator.mediaDevices.getUserMedia()` on the device displaying the dashboard. HTTPS is strongly recommended and may be required by the browser/WebView. On Android/Fully Kiosk, allow camera permission for Fully Kiosk. On iPhone/iPad, allow camera permission for the browser/Home Assistant WebView.

The scanner supports grocery-style **EAN-13, EAN-8, UPC-A and UPC-E**. `scan_decoder` can be set to `auto` (default/recommended), `zxing`, `native` or `local`. Auto uses ZXing as the primary decoder, keeps Native BarcodeDetector available as a sampled fallback when supported, and uses the bundled lightweight EAN decoder as the final fallback. Explicit decoder selections stay on the selected engine so users can compare what works best for their camera/browser. If a forced decoder is unavailable, the card shows a clear error instead of silently switching engines.

## Entities

- AH **Winkelmandje** sensor — the existing shopping-list entity (existing installations can keep `sensor.albert_heijn_shopping_list`); state is total quantity and attributes contain all products
- `sensor.albert_heijn_shopping_estimated_total` — estimated EUR total for Winkelmandje
- `sensor.albert_heijn_shopping_bonus_savings` — calculated supported Bonus savings
- `sensor.albert_heijn_next_order` — total quantity in the next scheduled AH order; attributes include order id, delivery date/time, total price, unique item count and all ordered product lines
- native read-only To-do entity for Winkelmandje

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

Writes do not wait for the next poll. After a successful AH write, Home Assistant updates immediately and schedules a reconciliation pull after about 1 second. Recent local quantity changes are protected for up to 20 seconds from an eventually-consistent/stale AH response. As soon as AH returns the requested value, the pending change is confirmed and cleared. If AH continues to disagree after that protection window, the AH server becomes authoritative again.

Writes for the same product are serialized inside the integration. Explicit absolute quantity changes are last-successful-write-wins when multiple clients edit the same product concurrently.

## Known limitations

- The editable **Winkelmandje** in this integration is AH's account-wide "Mijn lijst". Multiple favorites lists are not handled.
- Bonus totals are calculated for the supported promotion formats; unknown future AH promotion wording can still make the displayed total an estimate.
- Barcode reliability still depends on camera focus, light and barcode size.

## Next likely steps

1. Multiple AH lists.
2. Better exact Bonus total calculation.
3. Optional native todo mutations if there is a clear use case.
4. Wider barcode support (Code 128 / Data Matrix) if real-world products require it.

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


### 0.2.1

- Reverts the writable native To-do/checkbox functionality; the native To-do entity is read-only again.
- Scanner is now a continuous session: up to 60 seconds before the first successful scan.
- After a successful scan, the camera remains active for 5 seconds; every subsequent successful scan resets that 5-second window.
- Keeps the camera running while barcode lookups and list writes are processed.
- Prevents the same barcode from being selected repeatedly while it remains in view. To scan the same product again, move it out of frame briefly and present it again.
- Shows the latest successfully scanned product in a panel to the right of the camera, including image, product name, price, Bonus information, current list quantity and +/- controls.
- On narrow screens the scanned-product panel moves below the camera.


### 0.2.2

- Removes the product-search bar from the dashboard card.
- Makes the scan button full width.
- Adds independent card options `show_header`, `show_scan` and `show_products`.
- Keeps legacy `mode: scan_only` cards working.
- Adds `sensor.albert_heijn_next_order` for the earliest open scheduled AH fulfillment.
- The next-order sensor exposes total quantity, unique product count, delivery slot, total order price, modifiable status and all product lines with quantity/price/Bonus/category details.


### 0.2.3

- Adds an active AH shopping-cart sensor using `/mobile-services/order/v1/summaries/active?sortBy=DEFAULT`.
- Adds dashboard `product_source` choices for shopping list, active cart, next scheduled order, or cart + order combined.
- Combined cart/order view merges identical products and sums their quantities.
- Cart/order product views are intentionally read-only; +/- remains limited to the shopping list.
- The scanner continues to add products to the shopping list regardless of the displayed product source.
- Card title defaults to the selected product source unless a custom title is configured.


### 0.2.4

- Makes `product_source: cart` editable from the dashboard card.
- Adds +/- quantity controls and remove for active cart products.
- Writes cart changes through `PUT /mobile-services/order/v1/items?sortBy=DEFAULT`.
- Applies successful cart changes immediately in Home Assistant and reconciles with AH after about 1 second.
- Protects recent cart writes from stale AH responses for up to 20 seconds, matching the shopping-list conflict strategy.
- Adds `ah_shopping.set_cart_quantity` and `ah_shopping.remove_cart_product` services.
- Keeps `product_source: next_order` and `product_source: cart_and_order` read-only.
- Cart total price remains the last AH-calculated total while a quantity write is pending; AH recalculates it on the reconciliation refresh.


### 0.2.5

- Removes the separate active-order cart source introduced in 0.2.3/0.2.4.
- Renames AH "Mijn lijst" to **Winkelmandje** in the dashboard/UI while keeping its existing underlying integration data and unique IDs compatible.
- Product sources are now only: Winkelmandje, Next order, and Winkelmandje + Next order.
- Adds a combined Winkelmandje + Next order view that merges identical products and sums quantities.
- All scanning and editable product actions continue to write to AH "Mijn lijst" (now presented as Winkelmandje).
- Keeps the next scheduled order read-only.
- Removes the pixel `height` option from the card editor.
- Implements Home Assistant `getGridOptions()` so card height is controlled from the dashboard Layout panel.
- The product list scrolls inside the Home Assistant-assigned card height.
- Legacy `product_source: cart` and `cart_and_order` configs are migrated in the frontend to the new source names.


### 0.2.6

- Replaces the standalone scan action with Home Assistant's native `ha-button` component and fixes its spacing/alignment.
- Adds a subtle auto-close countdown overlay inside the camera field.
- Countdown starts at 1:00 when the scanner opens and resets to 0:05 after every successful scan.
- Makes the combined Winkelmandje + bestelling view partially editable: only the Winkelmandje quantity can be changed; order quantity remains read-only.
- Combined rows now retain separate Winkelmandje and Bestelling quantities even when the same product exists in both.
- Makes combined-list rows more compact with smaller images, reduced spacing and compact source labels.


### 0.2.7

- Treats the scheduled-order quantity as the hard minimum in the combined list.
- Combined rows now display the total quantity: ordered + Winkelmandje.
- Minus only decreases the Winkelmandje quantity and disappears when the total reaches the ordered quantity.
- Plus remains available at the order minimum and adds the product to Winkelmandje.
- Removes the combined-row delete button so an order quantity can never be confused with an editable quantity.
- Shows a compact breakdown such as `2 besteld · 1 extra`.
- Allows setting a positive Winkelmandje quantity for a product that exists only in the order by resolving its product details first.
- Aligns the scanned-product panel to the top of the scanner and uses the same compact row styling as the normal product list.


### 0.2.8

- Adds a bright white fill-light panel on the left side of the screen while the **front camera** is active.
- The fill light covers the middle third of the screen height to illuminate packaging close to the tablet camera.
- Reduces the visible barcode guide to about 60% of the camera width and 20% of its height, encouraging a larger camera-to-product distance for better focus.
- Aligns the bundled local decoder crop with the smaller scan guide.


### 0.2.9

- Uses the **front camera by default** when opening the barcode scanner.
- The front/back camera switch remains available.


### 0.2.10

- Optimises barcode scanning for Android/Fully Kiosk tablets.
- Uses **ZXing as the primary decoder on Android** instead of relying on the slower native BarcodeDetector first.
- Scans only the small barcode guide area instead of processing the complete camera frame.
- Downscales the scan crop before decoding to reduce CPU load and latency.
- Uses cropped Native BarcodeDetector as a secondary fallback and the bundled local EAN decoder as the final fallback.
- Requests a lower-latency 1280×720 / 30 fps camera stream instead of processing 1920×1080 frames.
- Applies continuous autofocus, exposure and white-balance constraints when the Android camera/WebView exposes those capabilities.
- Reduces the scan loop delay from 140 ms to 90 ms.


### 0.2.11

- Removes the experimental white front-camera fill-light panel.
- Keeps the visible product order stable while quantities are changed and Home Assistant/AH state refreshes arrive.
- Restores reliable internal product-list scrolling, including touch scrolling in Android/Fully Kiosk.
- Simplifies the combined-view header: the source label is no longer shown next to the delivery slot.
- Shows the delivery date/time on the left below the title.
- Shows Bonus savings and the article count below the total amount on the right.


### 0.2.12

- Replaces the old full-screen scanner dialog with an **inline scanner** inside the existing shopping card.
- Adds two scanner modes: **Via scan button** replaces the product list temporarily, while **Permanent camera feed** turns a card into a dedicated scanner for side-by-side dashboard layouts.
- Stops the camera whenever the card is not actually visible: backgrounded browser/app, another Home Assistant route/view, or fully outside the viewport.
- Clears the recent-scan overlay when leaving the dashboard view so returning starts a fresh scanning session.
- Makes scanner lifecycle safe across card rerenders and configuration changes so detached video elements cannot keep a camera stream running.
- Adds **Front / Rear** camera selection in the card editor.
- Adds configurable **1×–4× zoom**, default **2×**. Hardware zoom is used when available; otherwise the remaining zoom is applied as a centred digital crop.
- Maps the decoder crop back to the exact visible scan guide, including Home Assistant card aspect ratio, `object-fit: cover` cropping and digital zoom.
- Keeps ZXing as the fast Android/Fully Kiosk primary decoder and samples the heavier local/native fallbacks only after misses instead of on every frame.
- Shows up to five recently scanned products over the camera feed at 100%, 80%, 60%, 40% and 20% opacity.
- Re-scanning the same product updates its quantity and moves it back to the top rather than creating a duplicate overlay row.
- Uses the same shared product-row renderer for the shopping list and scanner overlay to keep both layouts consistent.
- Scanner overlay quantity controls can reduce a product all the way to **0**, removing it from Winkelmandje, with `+` available to add it again.
- Keeps the shopping-list product order stable when quantities change and retains reliable internal/touch scrolling from 0.2.11.


### 0.2.13

- Restores the non-permanent scanner auto-close timer: 1:00 initially and 0:05 after a successful scan.
- Keeps product-list scroll position anchored to the visible product while quantities update.
- Expands the barcode guide to 90% of the camera width.
- Removes always-visible scanner/zoom diagnostics; only actionable errors remain visible.
- Shows the most recently scanned products first in Winkelmandje during the current dashboard session.
- Registers the dashboard card earlier and makes its frontend bundle self-contained to reduce intermittent `Custom element doesn't exist` load races.
- Aligns the card header into fixed rows so title/total and subtitle/meta line up consistently.
- Uses the same compact product-row layout across Winkelmandje, Volgende bestelling, combined view and scanner overlay.
- Improves desktop/laptop scanning by using ZXing as the primary decoder, requesting up to 1920×1080, retrying a central barcode band and sampling native detection more often.
- Adds explicit scanner feedback when a barcode was decoded correctly but Albert Heijn has no matching product.
- Keeps the permanent scanner header synchronized with live Home Assistant entity data instead of remaining at initial placeholder totals.


### 0.2.14

- Reads AH fulfillment `reopenable`, `modifiable`, `isAfterCutOff`, `closingDateTime` and transaction state for the next scheduled order.
- Stops merging scheduled-order products into **Winkelmandje + volgende bestelling** as soon as AH reports `isAfterCutOff: true`.
- Removes the cut-off order's quantity, price and delivery information from the combined card while keeping the separate **Volgende bestelling** source available as a read-only overview.
- Adds a card-level barcode decoder selector: **Auto (recommended)**, **ZXing**, **Native BarcodeDetector** or **Local EAN**.
- Forced decoder modes stay on the selected engine, making it possible to compare scanner performance per device/browser.
- Shows a clear error when a forced decoder is unavailable instead of silently falling back.

### 0.2.15

- Extends the post-scan auto-close window to 10 seconds.
- Adds button mode with an initially active camera (`button_auto`).
- Aligns both header subtitles on the same baseline and prevents long notes from wrapping into the product list.

- Shows estimated Bonus savings for ordered products, including reduced unit prices and supported same-product multibuy offers. Combined view adds the separate cart and order savings; it does not apply promotions across the two sources. AH's order total is never reduced again. The ≈ marker distinguishes the order estimate from an authoritative AH discount total; mix-and-match and unrecognized promotions may be missing.
- Ignores malformed or unavailable item arrays when rendering the card.

- Uses a short, fixed-pitch synthesized checkout beep after a successful scan (not an official AH audio recording).

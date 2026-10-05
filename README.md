# Albert Heijn Shopping

<p align="center"><img src="brand/logo.png" width="128" alt="Albert Heijn logo"></p>

Home Assistant custom integration for managing the **Albert Heijn shopping list** from Home Assistant, including a bundled camera barcode-scanner card.

> Unofficial integration. Not affiliated with Albert Heijn or Ahold Delhaize. The private mobile API can change without notice.

## MVP 0.1.7

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
- Native read-only `todo` entity for standard HA list views

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
entity: sensor.ah_shopping_list
title: Boodschappen
```

### Test barcode

For a quick camera test, use EAN-13 `8710400169468` (AH Biologisch Halfvolle melk 1 l at the time of writing).

### Camera requirements

Camera access uses `navigator.mediaDevices.getUserMedia()` on the device displaying the dashboard. HTTPS is strongly recommended and may be required by the browser/WebView. On Android/Fully Kiosk, allow camera permission for Fully Kiosk. On iPhone/iPad, allow camera permission for the browser/Home Assistant WebView.

The MVP scanner intentionally supports grocery-style **EAN-13 and EAN-8** only. This keeps the integration self-contained with no external barcode JavaScript runtime.

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

## Known MVP limitations

- Only the first/default AH list is used.
- Free-text/non-product list entries are not shown yet.
- The total is an estimate: multi-buy promotions such as `1+1 gratis` may not be mathematically reflected even though the Bonus label is shown.
- Native `todo` editing is planned after the richer product model is proven stable.
- Barcode scan reliability depends on focus, light and barcode size. Hold the barcode horizontally inside the on-screen frame.

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

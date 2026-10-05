# AH Shopping

Home Assistant custom integration for managing the **Albert Heijn shopping list** from Home Assistant, including a bundled camera barcode-scanner card.

> Unofficial integration. Not affiliated with Albert Heijn or Ahold Delhaize. The private mobile API can change without notice.

## MVP 0.1.0

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

Add `https://github.com/digital-IMEI/home-assistant-ah-shopping` as a HACS custom repository, category **Integration**, install **AH Shopping**, restart Home Assistant, then add the integration under **Settings → Devices & services**.

The setup flow opens the AH login page. Sign in and paste the returned `appie://...code=...` URL (or just the code) into Home Assistant.

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

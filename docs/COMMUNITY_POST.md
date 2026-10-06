# Albert Heijn Shopping for Home Assistant — scan groceries from your dashboard

Hi everyone!

I’ve built an unofficial Albert Heijn integration that lets you scan groceries straight into **AH Mijn lijst** from a Home Assistant dashboard — useful on a phone, laptop or wall-mounted tablet.

It includes a dashboard card with product images, prices, Bonus savings and quantity controls, plus a read-only overview of your next scheduled order. You can also combine the list and order in one view: ordered quantities stay read-only, while extra products remain editable.

The camera scanner supports on-demand, start-active and permanent modes. Barcode decoding runs locally using bundled ZXing-C++/WebAssembly. Scanned products appear briefly over the camera feed, where you can adjust quantities without leaving the scanner.

There are also sensors and actions for automations, and a read-only native To-do view.

**Installation:** add the repository to HACS as a custom repository, type **Integration**. The dashboard card is included.

https://github.com/digital-IMEI/home-assistant-ah-shopping

This is for **Albert Heijn Netherlands**. It uses private AH APIs and is not affiliated with AH. It edits Mijn lijst, not confirmed orders, and calculated totals may differ from final checkout charges or unsupported promotions.

Feedback and testing on different cameras, browsers and tablets would be very welcome!

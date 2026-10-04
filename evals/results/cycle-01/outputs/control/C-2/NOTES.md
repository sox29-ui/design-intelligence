# دكّان القهوة — design notes

- **RTL by construction.** `lang="ar" dir="rtl"`; CSS uses only logical properties, so nothing is hand-mirrored. Directional icons (arrows, chevrons, cart, truck, return) flip; search, clock, stars and checkmarks don't. Menu drawer opens from the right, cart from the left; the brew carousel starts at the right and "next" scrolls left.
- **Numerals: Western digits (0–9) everywhere** (prices, weights, ratings, times, phone, CR). They're the norm on Saudi stores, mada/Apple Pay/Tabby receipts and phone keyboards, easing cross-site price comparison. Search also accepts Arabic-Indic digits.
- **Mixed text.** Latin terms (V60, Natural, Tabby) sit in isolated `lang="en"` spans so adjacent numbers keep their order; no-break spaces keep numbers with units.
- **Thumb-first shopping.** 2-column grid, 44px targets, add-to-cart becomes a stepper, and a sticky bottom bar shows the total plus progress to free delivery (199 ر.س).
- **Trust early.** Riyadh same-day vs. 2–4 days elsewhere sits under the promo; payments, returns and service hours follow the brew guide.
- **Identity.** Najdi parapet triangles, Reem Kufi with IBM Plex Sans Arabic, earthy palette, inline-SVG products (~260 KB total including fonts).
- English toggle intentionally omitted; Arabic plurals, normalised Arabic search and VAT-inclusive pricing included.

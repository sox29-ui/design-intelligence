# دكّان القهوة — design notes

**Idea: the roaster's price ledger.** Social-link shoppers see the harvest, delivery promise and categories first, then compare ruled product rows with prices in one fixed position, and add in one tap.

- **Order at 390:** Guji promo + full-width CTA → Riyadh vs other cities → 2×2 category router → products by category → trust → brew guide.
- **Type:** Reem Kufi (Kufic geometry, local voice) for display; IBM Plex Sans Arabic for text, its Latin matching "Natural", "V60". Body 18 px, secondary 16 px, Arabic line-height 1.7, no tracking.
- **Colour:** paper and roast-ink UI; coffee-cherry red only for the harvest and offers; product art coded by origin and tasting notes.
- **Numerals:** Western digits (0–9) everywhere, including JS (`Intl`, `nu-latn`). Saudi stores and mada/Apple Pay/Tabby show prices this way, so comparison stays easy, and digits sit naturally beside V60. Unicode bidi places "89 ر.س" and "15%"; codes are isolated.
- **RTL:** `lang`/`dir` on `<html>`, logical CSS only (checked by flipping to LTR), only directional icons mirror, free-delivery meter fills right to left.
- **Interaction:** add → quantity stepper, cart sheet, spelling-tolerant search (جوجي/غوجي), notify-me. No carousels; every product stays visible.
- Optional English toggle omitted.

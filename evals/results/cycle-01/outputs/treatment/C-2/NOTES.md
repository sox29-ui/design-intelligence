# دكّان القهوة — key design decisions

**Direction: the shop's price board.** Enthusiasts compare origin, process, weight and price, so phones get label-like rows with one aligned price column and a one-tap add that becomes a quantity stepper; from 700 px they become cards. Category tiles filter in place; search runs client-side.

**Numerals: Western digits (0–9) everywhere** — prices, ratings, counts, hours, CR number. Saudi checkouts (mada, Apple Pay, Tabby) and competing stores quote Western digits, so comparison stays effortless, and they sit naturally beside Latin terms (V60, Natural). Arabic-Indic digits typed into search are normalised.

**RTL:** `lang="ar" dir="rtl"` on `<html>`; logical CSS only (flipping to LTR mirrors every box); Latin runs isolated with `<bdi>`; only directional icons mirror; the carousel starts right; meters fill from the right.

**Identity:** Kufam headings, IBM Plex Sans Arabic text (17 px, 1.7 leading, no tracking). Paper-and-ink UI; terracotta (mud-brick, ripe cherry) only for the season and offers; product tiles tinted by tasting notes; a Najdi crenellation as logo mark and footer edge.

**Trust:** free-delivery strip, Riyadh vs other cities beside the CTA, live free-delivery meter.

**Scope:** optional English toggle omitted. No raster images; ~300 KB with fonts.

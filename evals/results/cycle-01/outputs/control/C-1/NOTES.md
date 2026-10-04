# Dukkan Al-Qahwa — design notes

**Concept.** A modern Najdi coffee house: cream and espresso with highland-green, saffron and clay accents; Najdi parapet triangles as the motif. Reem Kufi for display, IBM Plex Sans Arabic for UI (its Latin matches), 1.7 line-height.

**Numerals.** Western digits (0–9) everywhere. Saudi marketplaces, mada receipts and Apple Pay all use them, so prices compare directly; they also sit cleanly beside Latin terms (V60, 250 غ). JS pins `ar-SA-u-nu-latn`, because plain `ar-SA` outputs ٠١٢.

**RTL.** Logical CSS only. Arrows, chevrons, truck and return icons mirror; search, basket and stars don't. Carousel prev/next are logical (RTL `scrollLeft` is negative); meters fill from the right; menu opens from the start edge, cart from the end. Latin terms carry `lang="en"`, phone and CR numbers are LTR-isolated, ranges use words ("من 2 إلى 4") to avoid bidi reversal, and counts use Arabic plurals (منتجان، 3 منتجات، 12 منتجًا).

**Commerce.** Two-column grid, 44 px targets, Add buttons that become steppers, sticky mini-cart with free-shipping progress, Riyadh vs other-city times and fees up front, Arabic-normalised search.

**Access & weight.** Native dialogs, visible focus, ≥4.5:1 contrast, live announcements; English toggle flips `lang`/`dir`. ~36 KB gzipped + 131 KB fonts.

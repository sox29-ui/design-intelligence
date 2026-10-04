# Tidewrack — design notes

**Idea: the sea as a score.** The page is engraved like printed music: one stylised tide (124 six-minute readings) drawn as notation. Height → pitch, water speed → density (half notes → beamed quavers/semiquavers), slack water → rests. The concept lands before any reading.

**Hierarchy.** Title and line → red "Reserve a free timed entry" (header at every width, hero, inside the first phone viewport) → the score. Each low-tide session shows its own excerpt around predicted low water and pre-fills the booking form.

**Type and colour.** Newsreader (display, text, italic score markings) plus DM Mono for tide data. Paper and engraving ink; one red-pencil accent reserved for the ask and for "now". The sessions sit in a dark evening band. Dark mode supported.

**Motion.** Notes are written once on load (~1.5 s). "Listen" plays a one-minute Web Audio sketch with a playhead, only on request. Reduced motion: static score, no smooth scroll.

**Responsive.** The score re-engraves into 3 or 2 systems instead of shrinking. Staff lines bleed past the grid.

**Weight.** No images, two font families, ~170 KB total.

**Assumptions.** The tide curve is illustrative. The form hands off to a placeholder ticketing URL. Entry slots: every 30 minutes, 1–4 people.

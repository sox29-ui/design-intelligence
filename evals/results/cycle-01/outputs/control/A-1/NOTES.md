# Tidewrack: design notes

**The page is a score.** The hero is a canvas staff on which the tide writes notes: height → pitch, speed → density (beamed chords), slack water → a rest under a fermata. The same notation runs through the legend, the speaker cross-section and the session diagrams.

**Palette and type.** Dark like the dim room, with staff-line hairlines. Instrument Serif (one Google family) carries the voice; system sans carries the facts. Amber appears only on ticket actions and the "now" marker, so the CTA is always the warm thing on screen.

**Conversion.** The CTA sits in the header, above the fold, in a floating dock and in a skip link. Session rows pre-select their evening. The form uses native radios, inline errors and focus management; the confirmation is labelled as a prototype and offers an .ics file.

**Motion and sound.** Motion only shows the tide. It is off under `prefers-reduced-motion`, with visible Pause controls. The Web Audio sketch plays only on request and can be stopped from anywhere.

**Weight.** No images. Works without JS; fallback fonts are size-matched to avoid layout shift.

**Assumptions.** Hourly slots and the 1–4 visitor limit are placeholders.

# Tidewrack: design notes

**The page is a score.** The hero is a score's title page: instrumentation ("for forty suspended speakers and the Tagus estuary"), composer top right, title centre stage. Below it a canvas stave plays a modelled tide at 300× speed using the brief's mapping: height → pitch, speed → chord density, slack water → rests under fermatas. The title carries a waterline that follows the same tide; letters below it refract. An opt-in "Listen" button sonifies the same score.

**Phones first, CTA always near.** The reserve button sits above the fold from 320px wide, stays in the sticky header and appears on every low-tide session (which preselects that evening). An inline form offers a Tuesday–Sunday calendar, entry slots, party size and email, with accessible errors and an .ics export.

**Calm, legible, inclusive.** Night palette (estuary black, salt text, sodium-amber actions); Instrument Serif, Fragment Mono, system sans. All text passes WCAG AA. Reduced motion stops animation, and a pause control covers WCAG 2.2.2.

**Light.** About 30 KB gzipped plus 46 KB of fonts, loaded without blocking, with metric-matched fallbacks. No images.

**Assumptions:** half-hourly slots, last entry 18:30, up to four per booking. Availability and confirmation are mocked.

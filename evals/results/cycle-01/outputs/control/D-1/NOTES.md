# The Lighthouse Review — Issue 14: Shade

- **Sun and shade palette.** Warm limestone paper and a cool skylight-blue shadow (shadows under strong sun are lit by the sky), plus terracotta and canopy green. All text passes WCAG AA, and there is a dark scheme.
- **Cover as sundial.** "Shade" is real `h1` text. A decorative copy, masked by light through an arcade, inverts the letters. `script.js` casts the arches for the reader's local time (fallback 14:00). Nothing animates.
- **Type for long reading.** Newsreader (optical sizes, one weight, roman and italic) for text and display; Instrument Sans for labels. Body text is 18–21px with 1.6 leading on a ~66-character measure, with indents, a drop cap, and a margin sidenote on wide screens.
- **Authored, not a portal.** Contents with print page numbers, hand-drawn SVG plates, a section-drawing figure, and past issues that reuse the cover system.
- **Accessible.** Landmarks, a logical heading outline, skip links, visible focus, and announced form errors. The pull quote is hidden from assistive tech because it repeats the text. axe-core reports 0 violations.
- **Light.** No frameworks, 4 KB of JS, ~240 KB including fonts.

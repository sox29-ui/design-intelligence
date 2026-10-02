This file holds no rules of its own. Each pattern below is one way to implement rules compiled in other references; the rule ID in brackets is the authority (its WHEN / AVOID WHEN still decide whether to apply it). Snippets are generic starting points written for DI, not code taken from any reference site. Adapt values to the brief's tokens.

## Direction, language and mixed runs [`rtl.root-direction`, `rtl.isolate-mixed-runs`, `rtl.mirror-direction-not-identity`]

```html
<html lang="ar" dir="rtl">            <!-- base direction on the root, never via CSS -->
<p>رقم الطلب <bdi>A-1042</bdi> قيد الشحن</p>   <!-- embedded Latin/code isolated -->
<input type="email" dir="ltr" autocomplete="email">  <!-- LTR data inside RTL UI -->
```

```css
/* Mirror only what expresses direction; never logos, media controls, checkmarks or digits. */
[dir="rtl"] .icon-directional { transform: scaleX(-1); }
```

## Logical properties [`rtl.logical-properties`]

```css
.card   { padding-inline: var(--space-4); border-inline-start: 2px solid var(--rule); text-align: start; }
.badge  { inset-inline-end: var(--space-2); }
.media  { margin-inline-start: auto; }
```

Physical `left/right` only for things that must not mirror (e.g. a progress bar tied to time, a map).

## Display type that steps, then caps [`typography.display-steps-then-caps`, `typography.extreme-scale-needs-a-reason`]

Linear growth from MIN at 390 px to MAX at 1440 px, held above:

```css
/* slope = (MAX − MIN) / (1440 − 390); intercept = MIN − slope × 390 */
--display: clamp(2.5rem, 1.943rem + 2.286vw, 4rem);   /* 40 px → 64 px */
```

Type-as-image pages may instead re-orient or re-break at 390 (see the rule); never let `vw` alone drive size without a `clamp()` maximum.

## Reading text, measure, leading [`typography.reading-text-16-to-20`, `typography.reading-measure`, `rtl.arabic-needs-more-leading`, `rtl.no-tracking-no-case-arabic`]

```css
body        { font-size: 1.125rem; line-height: 1.6; }   /* constant across viewports */
.prose      { max-inline-size: 66ch; }
:lang(ar)   { line-height: 1.75; letter-spacing: 0; text-transform: none; }
:lang(ar) h1, :lang(ar) h2 { line-height: 1.3; }
.kicker     { letter-spacing: .08em; text-transform: uppercase; }
:lang(ar) .kicker { letter-spacing: 0; text-transform: none; font-weight: 600; }  /* form by script */
```

## Numerals [`rtl.numerals-one-system`]

```js
const price = new Intl.NumberFormat('ar-SA', { style: 'currency', currency: 'SAR', numberingSystem: 'latn' });
// pick 'latn' or 'arab' once for the whole product; never mix on one page
```

Tables and changing figures: `font-variant-numeric: tabular-nums;`.

## Motion that respects the user [`motion.honour-reduced-motion`, `motion.duration-by-purpose`, `motion.warn-before-intense-motion`]

```css
@media (prefers-reduced-motion: no-preference) {
  .reveal { transition: opacity 240ms ease-out, transform 240ms ease-out; }
}
```

```js
const reduce = matchMedia('(prefers-reduced-motion: reduce)');
const sync = () => (reduce.matches ? stopDecorativeMotion() : startDecorativeMotion());
reduce.addEventListener('change', sync); sync();
```

Content must be fully visible with no animation ever having run (no `opacity: 0` waiting for a script).

## Focus and skeleton [`accessibility.visible-focus`, `accessibility.semantic-skeleton`]

```css
:focus-visible { outline: 3px solid var(--focus); outline-offset: 2px; }
html { scroll-padding-block-start: calc(var(--header-h) + 1rem); }  /* sticky header never hides focused or targeted elements */
```

```html
<a class="skip" href="#main">Skip to content</a>
<header>…<nav aria-label="Primary">…</nav></header>
<main id="main"><h1>…</h1>…</main>
<footer>…</footer>
```

## Mobile menu [`components.mobile-menu-sheet`, `components.persistent-primary-action`]

```html
<button class="menu-toggle" aria-expanded="false" aria-controls="site-menu">Menu</button>
<nav id="site-menu" hidden> … <a class="cta" href="#reserve">Reserve</a></nav>
```

```js
toggle.addEventListener('click', () => setOpen(toggle.getAttribute('aria-expanded') !== 'true'));
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && isOpen()) { setOpen(false); toggle.focus(); } });
// setOpen(v): toggle.ariaExpanded = String(v); menu.hidden = !v; lock body scroll only while a modal sheet is open
```

## Banners and consent without layout shift [`antipattern.late-injected-banners`, `components.consent-with-real-choice`]

Overlay late UI (`position: fixed; inset-block-end: 0`) or reserve its space in the first render; give "reject" the same visual weight as "accept".

## Weight [`performance.weight-follows-goal`, `antipattern.content-gating-preloader`]

Request only the font weights actually used, with `display=swap` (Google Fonts already splits scripts into `unicode-range` subsets — choose a family that covers Arabic for Arabic text); `loading="lazy"` and explicit `width`/`height` on below-the-fold media; no preloader that hides content the page could already show.

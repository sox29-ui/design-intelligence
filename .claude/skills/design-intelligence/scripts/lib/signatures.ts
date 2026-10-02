// Generic AI-design signature detection from DI probe metrics.
// Presence ≠ defect: a signature is a defect only when the brief does not justify it.
// Thresholds are DI heuristics (EXPERIMENTAL), documented in references/anti-patterns.md.

export type SignatureHit = { id: string; present: boolean; evidence: Record<string, unknown> };

const num = (v: unknown, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);

function hexToHsl(hex: string) {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex || '');
  if (!m) return null;
  const [r, g, b] = [m[1], m[2], m[3]].map((x) => parseInt(x, 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: h * 60, s, l };
}

/** metrics = probe output at desktop width (1440); extras optional (instrumentation is inside metrics). */
export function scanSignatures(metrics: any): SignatureHit[] {
  const m = metrics ?? {};
  const disp = m.displayText ?? {};
  const body = num(m.typography?.dominantBodySize, 16);
  const effects = m.effects ?? {};
  const header = m.components?.header ?? {};
  const cards = m.components?.cardGroups?.items ?? [];
  const instr = m.implementation?.instrumentation ?? {};
  const palette: Array<{ color: string; areaShare: number }> = m.color?.backgroundPalette ?? [];
  const buttons: Array<{ color: string }> = m.color?.buttonBackgrounds ?? [];
  const neon = [...palette.map((p) => p.color), ...buttons.map((b) => b.color)]
    .map((c) => ({ c, hsl: hexToHsl(c) }))
    .filter((x) => x.hsl && x.hsl.s >= 0.8 && x.hsl.l >= 0.45 && x.hsl.l <= 0.75);
  const gradientColors: string[] = m.color?.gradientColors ?? [];
  const purpleBlue = [...palette.filter((p) => p.areaShare >= 0.05).map((p) => p.color), ...gradientColors].filter((c) => {
    const h = hexToHsl(c);
    return h && h.h >= 225 && h.h <= 290 && h.s >= 0.35;
  });
  const roundedCardGroups = cards.filter((g: any) => num(g.radius) >= 16 && (g.shadow || g.border || g.filled));
  return [
    { id: 'giant-hero-type', present: num(disp.sizeVw) >= 6 && num(disp.size) / body >= 4, evidence: { sizeVw: disp.sizeVw, size: disp.size, body } },
    { id: 'gradient-backgrounds', present: num(m.color?.gradientAreaRatio) >= 0.15, evidence: { gradientAreaRatio: m.color?.gradientAreaRatio } },
    { id: 'glow-accents', present: num(effects.coloredGlowShadows) >= 2, evidence: { coloredGlowShadows: effects.coloredGlowShadows } },
    { id: 'glassmorphism', present: num(effects.backdropBlurElements) >= 1, evidence: { backdropBlurElements: effects.backdropBlurElements } },
    { id: 'rounded-card-grid', present: roundedCardGroups.length >= 2, evidence: { roundedCardGroups: roundedCardGroups.length } },
    { id: 'floating-nav', present: ['fixed', 'sticky'].includes(header.position) && !!header.insetFromEdges && (num(header.borderRadius) >= 12 || !!header.backdropFilter), evidence: { position: header.position, inset: header.insetFromEdges, radius: header.borderRadius, backdrop: header.backdropFilter } },
    { id: 'scroll-reveal', present: num(effects.opacityZeroElements) >= 5 && num(instr.intersectionObservers) >= 1, evidence: { opacityZeroElements: effects.opacityZeroElements, intersectionObservers: instr.intersectionObservers } },
    { id: 'excessive-blur', present: num(effects.filterBlurElements) >= 3, evidence: { filterBlurElements: effects.filterBlurElements } },
    { id: 'decorative-motion', present: num(m.motion?.animations?.infinite) >= 2, evidence: { infiniteAnimations: m.motion?.animations?.infinite } },
    { id: 'dark-neon-default', present: m.color?.scheme === 'dark' && neon.length > 0, evidence: { scheme: m.color?.scheme, neon: neon.map((x) => x.c) } },
    { id: 'purple-blue-gradient-palette', present: num(m.color?.gradientAreaRatio) >= 0.05 && purpleBlue.length > 0, evidence: { purpleBlue } },
  ];
}

export function signatureCount(hits: SignatureHit[]) {
  return hits.filter((h) => h.present).length;
}

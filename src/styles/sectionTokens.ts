/**
 * Section gradient tokens, mirrored by `src/styles/globals.css` (`--section-gradient` on `:root` and on each
 * `[data-section]`, `--section-on-gradient` on `:root`). The CSS is the one the browser reads; this module exists
 * so tests can pin the stops and check their contrast with a WCAG formula (jsdom resolves no gradients).
 * `sectionTokens.test.ts` fails when the two drift apart.
 *
 * The label on the gradient is a fixed dark ink (`SECTION_GRADIENT_INK`), identical on the dark and light themes:
 * the gradients are brand hues that no theme flips, and white never reaches AA on the VLife green/yellow or the
 * VFun pink end, so the primary button keeps the bright gradient and darkens the label instead. Every stop of
 * every section must stay at >= 4.5:1 against the ink (`WCAG_AA_TEXT`).
 */

export type GradientSection = 'fit' | 'fun' | 'life';

/** Three stops at 0% / 50% / 100% of a 135deg linear gradient, hex, uppercase. */
export const SECTION_GRADIENT_STOPS: Record<GradientSection, readonly [string, string, string]> = {
  // VFit: the cyan primary, a lifted blue and a lifted violet. #0066FF / #7B61FF (the secondary and accent
  // tokens) sit at 3.5:1 / 4.0:1 against the ink, so the gradient uses brighter shades of the same hues.
  fit: ['#00C9FF', '#2D8CFF', '#8F7CFF'],
  fun: ['#B461FF', '#FF00E5', '#FF6B9D'],
  life: ['#00E676', '#76FF03', '#FFD600'],
};

/** Colour of text and icons placed on `bg-section-gradient` (Tailwind `text-section-on-gradient`). */
export const SECTION_GRADIENT_INK = '#1A1D29';

/** Minimum contrast ratio for normal text (WCAG 2.1 AA, 1.4.3). */
export const WCAG_AA_TEXT = 4.5;

/** The `--section-gradient` value the CSS must declare for a section. */
export function sectionGradientCss(section: GradientSection): string {
  const [start, middle, end] = SECTION_GRADIENT_STOPS[section];
  return `linear-gradient(135deg, ${start} 0%, ${middle} 50%, ${end} 100%)`;
}

function channel(hex: string, offset: number): number {
  const value = parseInt(hex.slice(offset, offset + 2), 16) / 255;
  return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

/** WCAG 2.1 relative luminance of a `#RRGGBB` colour. */
export function relativeLuminance(hex: string): number {
  const h = hex.replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(h)) throw new Error(`Not a #RRGGBB colour: ${hex}`);
  return 0.2126 * channel(h, 0) + 0.7152 * channel(h, 2) + 0.0722 * channel(h, 4);
}

/** WCAG 2.1 contrast ratio between two `#RRGGBB` colours (1 to 21). */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

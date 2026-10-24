import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  SECTION_GRADIENT_INK,
  SECTION_GRADIENT_STOPS,
  WCAG_AA_TEXT,
  contrastRatio,
  relativeLuminance,
  sectionGradientCss,
  type GradientSection,
} from './sectionTokens';

const SECTIONS: GradientSection[] = ['fit', 'fun', 'life'];
const THEMES = ['dark', 'light'] as const;

/**
 * Every `--section-gradient` / `--section-on-gradient` declaration in globals.css with the selector of the block
 * it sits in. A line scan (not a CSS parser): the file nests `@theme` / `@layer` blocks, and the variables of
 * interest are declared one per line directly under a plain selector.
 */
function declarations(css: string, name: string): Map<string, string> {
  const found = new Map<string, string>();
  let selector = '';
  for (const line of css.split('\n')) {
    const open = line.match(/^\s*([^\s{][^{]*?)\s*\{\s*$/);
    if (open) selector = open[1];
    const decl = line.match(new RegExp(`^\\s*${name}:\\s*([^;]+);`));
    if (decl) {
      expect(found.has(selector), `${name} declared twice under ${selector}`).toBe(false);
      found.set(selector, decl[1].trim());
    }
  }
  return found;
}

const css = readFileSync(join(__dirname, 'globals.css'), 'utf8');

describe('section gradient tokens', () => {
  it('computes WCAG luminance and contrast (black on white is 21:1)', () => {
    expect(relativeLuminance('#FFFFFF')).toBeCloseTo(1, 5);
    expect(relativeLuminance('#000000')).toBe(0);
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 5);
    expect(contrastRatio('#FFFFFF', '#000000')).toBeCloseTo(21, 5);
  });

  it('globals.css declares exactly the gradients of this module, for the default and each section', () => {
    const gradients = declarations(css, '--section-gradient');
    expect([...gradients.keys()].sort()).toEqual(
      [':root', ...SECTIONS.map((s) => `[data-section='${s}']`)].sort(),
    );
    expect(gradients.get(':root')).toBe(sectionGradientCss('fit'));
    for (const section of SECTIONS) {
      expect(gradients.get(`[data-section='${section}']`), section).toBe(sectionGradientCss(section));
    }
  });

  it('globals.css declares the on-gradient ink once, on :root, so no theme or section overrides it', () => {
    const inks = declarations(css, '--section-on-gradient');
    expect([...inks.entries()]).toEqual([[':root', SECTION_GRADIENT_INK]]);
    expect(css).toMatch(/--color-section-on-gradient:\s*var\(--section-on-gradient\)/);
  });

  it('the light theme redefines neither the gradients nor the ink', () => {
    const light = css.slice(css.indexOf("[data-theme='light'] {"));
    const block = light.slice(0, light.indexOf('\n}'));
    expect(block).not.toContain('--section-gradient');
    expect(block).not.toContain('--section-on-gradient');
  });

  describe.each(THEMES)('on the %s theme', (theme) => {
    // The gradients and the ink are theme-independent (asserted above), so both themes resolve the same colours.
    it.each(SECTIONS)('every %s gradient stop is AA (>= 4.5:1) under the ink', (section) => {
      for (const stop of SECTION_GRADIENT_STOPS[section]) {
        const ratio = contrastRatio(stop, SECTION_GRADIENT_INK);
        expect(ratio, `${theme}/${section} ${stop} on ${SECTION_GRADIENT_INK}: ${ratio.toFixed(2)}:1`)
          .toBeGreaterThanOrEqual(WCAG_AA_TEXT);
      }
    });
  });

  it('documents why white was not kept: white fails AA on at least one stop of every section', () => {
    for (const section of SECTIONS) {
      const worst = Math.min(...SECTION_GRADIENT_STOPS[section].map((stop) => contrastRatio(stop, '#FFFFFF')));
      expect(worst, section).toBeLessThan(WCAG_AA_TEXT);
    }
  });
});

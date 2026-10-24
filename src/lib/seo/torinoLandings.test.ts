import { describe, expect, it } from 'vitest';
import { TORINO_LANDINGS, findTorinoLanding, requireTorinoLanding } from './torinoLandings';

describe('Torino landing page data', () => {
  it('uses unique, keyword-bearing slugs', () => {
    const slugs = TORINO_LANDINGS.map((page) => page.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    slugs.forEach((slug) => expect(slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/));
  });

  it('gives every page its own title, description and intro', () => {
    const titles = TORINO_LANDINGS.map((page) => page.title);
    const descriptions = TORINO_LANDINGS.map((page) => page.description);
    const intros = TORINO_LANDINGS.map((page) => page.intro);

    expect(new Set(titles).size).toBe(titles.length);
    expect(new Set(descriptions).size).toBe(descriptions.length);
    expect(new Set(intros).size).toBe(intros.length);
  });

  it('keeps titles and meta descriptions within the lengths Google shows', () => {
    TORINO_LANDINGS.forEach((page) => {
      // The root template appends " | Vfitfunlife" (13 characters).
      expect(page.title.length + 13).toBeLessThanOrEqual(65);
      expect(page.description.length).toBeGreaterThanOrEqual(110);
      expect(page.description.length).toBeLessThanOrEqual(175);
    });
  });

  it('targets Torino in the heading and the keywords', () => {
    TORINO_LANDINGS.forEach((page) => {
      expect(page.h1).toContain('Torino');
      expect(page.keywords.some((keyword) => keyword.toLowerCase().includes('torino'))).toBe(true);
    });
  });

  it('links only to sibling pages that exist', () => {
    TORINO_LANDINGS.forEach((page) => {
      page.related.forEach((slug) => {
        expect(slug).not.toBe(page.slug);
        expect(findTorinoLanding(slug)).toBeDefined();
      });
    });
  });

  it('throws for an unknown slug at build time', () => {
    expect(() => requireTorinoLanding('palestre-milano')).toThrow(/Unknown Torino landing page/);
  });
});

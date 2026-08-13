import { describe, it, expect } from 'vitest';
import { SERVICE_CATEGORY_TREE, GROUP_IDS } from './serviceCategories';
import { SERVICE_CATEGORY_TREE as SERVER_TREE, withAncestors, buildLabelIndex, foldLabel } from '../../functions/src/categories/tree';
import { SUPPORTED_LOCALES } from '@/types/locale';

/**
 * The taxonomy is duplicated across the src/ and functions/ TypeScript projects, which have
 * no shared module. Both halves are import-free so this can load them side by side. If they
 * drift, the backfill starts mapping to categories the client cannot render.
 */
describe('taxonomy parity', () => {
  it('is identical on both sides of the src/functions boundary', () => {
    expect(Object.keys(SERVICE_CATEGORY_TREE).sort()).toEqual(Object.keys(SERVER_TREE).sort());
    for (const [id, client] of Object.entries(SERVICE_CATEGORY_TREE)) {
      const server = SERVER_TREE[id];
      expect(server, `missing on server: ${id}`).toBeDefined();
      expect(server.parentId, `parentId differs: ${id}`).toBe(client.parentId);
      expect(server.names, `names differ: ${id}`).toEqual(client.names);
      expect(server.sections, `sections differ: ${id}`).toEqual(client.sections);
      expect(server.order, `order differs: ${id}`).toBe(client.order);
    }
  });
});

describe('tree shape', () => {
  it('has 8 groups and 21 leaves', () => {
    const entries = Object.values(SERVICE_CATEGORY_TREE);
    expect(entries.filter((c) => c.parentId === null)).toHaveLength(8);
    expect(entries.filter((c) => c.parentId !== null)).toHaveLength(21);
  });

  it('is exactly two levels — every leaf points at a group, never at another leaf', () => {
    for (const [id, c] of Object.entries(SERVICE_CATEGORY_TREE)) {
      if (c.parentId === null) continue;
      const parent = SERVICE_CATEGORY_TREE[c.parentId];
      expect(parent, `${id} has a dangling parent ${c.parentId}`).toBeDefined();
      expect(parent.parentId, `${id} is three levels deep`).toBeNull();
    }
  });

  it('gives every category a label in all five locales', () => {
    for (const [id, c] of Object.entries(SERVICE_CATEGORY_TREE)) {
      for (const loc of SUPPORTED_LOCALES) {
        expect((c.names as Record<string, string>)[loc], `${id} missing ${loc}`).toBeTruthy();
      }
    }
  });

  it('orders groups', () => {
    expect(GROUP_IDS[0]).toBe('strength_conditioning');
    expect(GROUP_IDS).toHaveLength(8);
  });

  it('keeps the ids of the six categories that already exist in production', () => {
    // Reusing them means those live documents gain a parent and labels rather than being
    // shadowed by duplicates.
    for (const id of ['personal_training', 'yoga', 'pilates', 'massage', 'nutrition', 'physio']) {
      expect(SERVICE_CATEGORY_TREE[id], `lost existing id ${id}`).toBeDefined();
    }
  });
});

describe('legacy specialty strings resolve', () => {
  const index = buildLabelIndex();
  const resolve = (s: string) => index.get(foldLabel(s));

  // Every distinct value observed in a 100-document sample of production instructors.
  const IN_PRODUCTION: [string, string][] = [
    ['Personal Training', 'personal_training'],
    ['Boxe', 'boxing'],
    ['Cardio', 'cardio'],
    ['CrossFit', 'crossfit'],
    ['Yoga', 'yoga'],
    ['Nutrizione', 'nutrition'],
    ['HIIT', 'hiit'],
    ['Pilates', 'pilates'],
    ['Strength Training', 'strength_training'],
    ['Functional Training', 'functional_training'],
    ['Fisioterapia', 'physio'],
    ['Yoga Therapy', 'yoga_therapy'],
    ['Psicologia', 'psychology'],
    ['Massaggio', 'massage'],
    ['Mental Coaching', 'mental_coaching'],
    ['Osteopatia', 'osteopathy'],
  ];

  it.each(IN_PRODUCTION)('maps %s', (label, expected) => {
    expect(resolve(label)).toBe(expected);
  });

  it('covers the three values that exist only in seeded data', () => {
    // These appear in NO list in the codebase. A migration built from the source alone
    // would have stranded the 18 providers carrying them.
    expect(resolve('Yoga Therapy')).toBe('yoga_therapy');
    expect(resolve('Psicologia')).toBe('psychology');
    expect(resolve('Osteopatia')).toBe('osteopathy');
  });

  it('folds case and accents', () => {
    expect(resolve('  fisioterapia ')).toBe('physio');
    expect(resolve('NUTRIZIONE')).toBe('nutrition');
  });

  it('returns nothing for an unknown label rather than guessing', () => {
    expect(resolve('Fitboxing')).toBeUndefined();
  });
});

describe('withAncestors', () => {
  it('returns the leaf and its group', () => {
    expect(withAncestors('boxing')).toEqual(['boxing', 'combat']);
  });

  it('returns a group as itself', () => {
    expect(withAncestors('combat')).toEqual(['combat']);
  });

  it('returns an unknown id unchanged rather than throwing', () => {
    expect(withAncestors('nope')).toEqual(['nope']);
  });
});

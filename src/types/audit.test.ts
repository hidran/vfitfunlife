import { describe, it, expect } from 'vitest';
import { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } from './audit';
import {
  AUDIT_ACTIONS as SERVER_ACTIONS,
  AUDIT_ENTITY_TYPES as SERVER_ENTITY_TYPES,
} from '../../functions/src/lib/auditEntityTypes';

/**
 * `src/` and `functions/` both describe the same `audit_logs` documents but are separate
 * TypeScript projects, so nothing structural stops them drifting — and they already had:
 * the client knew `service_category`, the server knew `migration` / `ai_settings` /
 * `ai_plan` / `recipe`, and each could write values the other's type rejected.
 *
 * Importing both halves is only safe because neither file imports anything itself. Keep
 * them that way, or this test starts dragging firebase-admin into the web test run.
 */
describe('audit vocabulary', () => {
  it('is identical on both sides of the src/functions boundary', () => {
    expect([...AUDIT_ENTITY_TYPES]).toEqual([...SERVER_ENTITY_TYPES]);
    expect([...AUDIT_ACTIONS]).toEqual([...SERVER_ACTIONS]);
  });

  it('still carries the values each side had introduced independently', () => {
    // Regression guard: reconciling the two lists must not have dropped either side's
    // additions, which are all in live use.
    for (const t of ['service_category', 'migration', 'ai_settings', 'ai_plan', 'recipe']) {
      expect(AUDIT_ENTITY_TYPES).toContain(t);
    }
  });

  it('has no duplicates', () => {
    expect(new Set(AUDIT_ENTITY_TYPES).size).toBe(AUDIT_ENTITY_TYPES.length);
    expect(new Set(AUDIT_ACTIONS).size).toBe(AUDIT_ACTIONS.length);
  });
});

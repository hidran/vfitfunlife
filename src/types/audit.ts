/**
 * The `audit_logs` vocabulary — client half.
 *
 * This file is duplicated as `functions/src/lib/auditEntityTypes.ts` because `src/` and
 * `functions/` are separate TypeScript projects with no shared module. Both halves are
 * deliberately import-free so a test can load them side by side, and
 * `src/types/audit.test.ts` fails if they ever diverge again.
 *
 * They had already drifted once: the client carried `service_category` while the server
 * carried `migration`, `ai_settings`, `ai_plan` and `recipe`, so either side could write a
 * value the other's type said was impossible.
 *
 * Keep the two arrays character-identical.
 */

export const AUDIT_ACTIONS = [
  'create',
  'update',
  'delete',
  'refund',
  'verify',
  'suspend',
  'activate',
  'role_change',
] as const;

export const AUDIT_ENTITY_TYPES = [
  'user',
  'provider',
  'venue',
  'booking',
  'payment',
  'user_type',
  'service_category',
  'migration',
  'ai_settings',
  'ai_plan',
  'recipe',
  'feature_flag',
  'platform_settings',
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];
export type AuditEntityType = (typeof AUDIT_ENTITY_TYPES)[number];

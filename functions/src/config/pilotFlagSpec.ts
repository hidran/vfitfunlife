/**
 * The pilot flag whitelist and its pure validation/encoding rules.
 *
 * Separated from the callables so it can be tested without firebase-admin, and so the
 * whitelist reads as data rather than as control flow buried in a handler.
 *
 * Spec: docs/superpowers/specs/2026-08-13-pilot-flags-admin-design.md §4
 */

export const PILOT_FLAGS = {
  pilot_mode: {
    valueType: "BOOLEAN" as const,
    defaultValue: "true",
    description:
      "Torino pilot is fitness-only. When true, VFun/VLife are hidden and their routes redirect to /home.",
  },
  show_vfun: {
    valueType: "BOOLEAN" as const,
    defaultValue: "false",
    description: "Show the VFun section. Independent of pilot_mode.",
  },
  show_vlife: {
    valueType: "BOOLEAN" as const,
    defaultValue: "false",
    description: "Show the VLife section. Independent of pilot_mode.",
  },
  pilot_city: {
    valueType: "STRING" as const,
    defaultValue: "Torino",
    description: "Default and only city filter while pilot_mode is on.",
  },
} as const;

export type PilotFlagKey = keyof typeof PILOT_FLAGS;
export const PILOT_FLAG_KEYS = Object.keys(PILOT_FLAGS) as PilotFlagKey[];

export interface PilotFlagValues {
  pilot_mode: boolean;
  show_vfun: boolean;
  show_vlife: boolean;
  pilot_city: string;
}

/** Thrown for anything the caller could fix by sending a different request. */
export class PilotFlagValidationError extends Error {}

/**
 * Validates an update payload and returns the keys to write.
 *
 * The whitelist check is the load-bearing part: without it the panel is a raw Remote
 * Config editor able to overwrite any parameter in the project.
 */
export function validateFlagUpdates(
  updates: Partial<PilotFlagValues>,
): PilotFlagKey[] {
  const keys = Object.keys(updates ?? {}) as PilotFlagKey[];
  if (keys.length === 0) {
    throw new PilotFlagValidationError("No flags supplied");
  }
  for (const key of keys) {
    if (!PILOT_FLAG_KEYS.includes(key)) {
      throw new PilotFlagValidationError(`Unknown flag: ${key}`);
    }
    const expected = PILOT_FLAGS[key].valueType === "BOOLEAN" ? "boolean" : "string";
    if (typeof updates[key] !== expected) {
      throw new PilotFlagValidationError(`Flag ${key} must be a ${expected}`);
    }
  }
  if (typeof updates.pilot_city === "string" && !updates.pilot_city.trim()) {
    throw new PilotFlagValidationError("pilot_city cannot be empty");
  }
  return keys;
}

/**
 * Remote Config stores every value as a string, whatever its declared valueType —
 * writing a real boolean produces an invalid template.
 */
export function encodeFlagValue(value: boolean | string): string {
  return typeof value === "boolean" ? String(value) : String(value).trim();
}

/** The parameter object to write, including the description used to recreate a deleted key. */
export function flagParameter(key: PilotFlagKey, value: boolean | string) {
  const spec = PILOT_FLAGS[key];
  return {
    defaultValue: { value: encodeFlagValue(value) },
    valueType: spec.valueType,
    description: spec.description,
  };
}

/** Maps an Admin SDK failure to a stable reason the callable can turn into an error code. */
export function classifyRemoteConfigError(
  err: unknown,
): "permission" | "conflict" | "unknown" {
  const message = err instanceof Error ? err.message : String(err);
  if (/permission|PERMISSION_DENIED|403/i.test(message)) return "permission";
  if (/ETAG|VERSION_MISMATCH|409|conflict/i.test(message)) return "conflict";
  return "unknown";
}

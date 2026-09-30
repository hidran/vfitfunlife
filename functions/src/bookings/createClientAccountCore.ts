/**
 * createClientAccount — the pure parts (no firebase-admin), so they are unit-testable.
 *
 * After addClientByEmail answered `not_found`, the trainer may create the account themselves:
 * name + email (+ optional phone). See ./createClientAccount.ts for the flow.
 */

import { HttpsError } from "firebase-functions/v2/https";
import { appBaseUrl, normalizeClientEmail } from "./addClientByEmailCore";

export const MIN_NAME_LENGTH = 2;
export const MAX_NAME_LENGTH = 80;

/** Trimmed, inner whitespace collapsed; null unless 2..80 characters. */
export function normalizeFullName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const name = raw.trim().replace(/\s+/g, " ");
  return name.length >= MIN_NAME_LENGTH && name.length <= MAX_NAME_LENGTH ? name : null;
}

/**
 * Loose E.164-ish: separators (spaces, dashes, dots, parentheses) dropped, an optional leading
 * "+" (or "00", rewritten to "+"), then 6..15 digits. Returns:
 * - `null` for an absent/blank phone (it is optional),
 * - the normalized number,
 * - `undefined` when something was given but is not a phone number.
 */
export function normalizePhone(raw: unknown): string | null | undefined {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== "string") return undefined;
  const compact = raw.trim().replace(/[\s\-.()]/g, "");
  if (compact === "") return null;
  const withPlus = compact.startsWith("00") ? `+${compact.slice(2)}` : compact;
  return /^\+?\d{6,15}$/.test(withPlus) ? withPlus : undefined;
}

export interface CreateClientAccountRequest {
  email: string;
  fullName: string;
  phone: string | null;
}

/** Validates the callable payload; throws invalid-argument invalid_email / invalid_name / invalid_phone. */
export function validateCreateClientAccountRequest(data: unknown): CreateClientAccountRequest {
  const obj = data && typeof data === "object" && !Array.isArray(data) ?
    (data as Record<string, unknown>) :
    {};
  const email = normalizeClientEmail(obj.email);
  if (!email) throw new HttpsError("invalid-argument", "invalid_email");
  const fullName = normalizeFullName(obj.fullName);
  if (!fullName) throw new HttpsError("invalid-argument", "invalid_name");
  const phone = normalizePhone(obj.phone);
  if (phone === undefined) throw new HttpsError("invalid-argument", "invalid_phone");
  return { email, fullName, phone };
}

/** resendClientAccountEmail payload: the client's users/{uid} id. */
export function validateResendRequest(data: unknown): { userId: string } {
  const raw = data && typeof data === "object" && !Array.isArray(data) ?
    (data as { userId?: unknown }).userId :
    undefined;
  if (typeof raw !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(raw)) {
    throw new HttpsError("invalid-argument", "invalid_user");
  }
  return { userId: raw };
}

/**
 * Where the password-setting page sends the person afterwards (the reset link's continueUrl).
 * Its host must be an authorized domain of the Auth project.
 */
export function accountConfirmContinueUrl(env: NodeJS.ProcessEnv = process.env): string {
  return `${appBaseUrl(env)}/auth/login`;
}

/** The staging allowlist note for an address a trainer created an account for. */
export function stagingAllowlistNote(trainerName: string | null, trainerId: string): string {
  const who = trainerName?.trim() ? `${trainerName.trim()} (${trainerId})` : trainerId;
  return `added by trainer ${who}`.slice(0, 200);
}

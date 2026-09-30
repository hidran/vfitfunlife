/**
 * addClientByEmail — the pure parts (no firebase-admin), so they are unit-testable.
 *
 * A trainer adds someone to their roster by email ("+ Nuovo cliente" on /provider/schedule and
 * /provider/clients). An existing account gets a roster doc (same shape the booking trigger
 * writes — see clientRosterCore.planRosterSync with `ensure`); for an unknown address the
 * trainer may then choose to send an invitation (inviteClientToPlatform). Because the answer
 * ("added" vs "not_found") reveals whether an address has an account, both callables share one
 * per-trainer rate limit.
 */

import { HttpsError } from "firebase-functions/v2/https";

/** Max addClientByEmail + inviteClientToPlatform calls (together) per trainer per rolling window. */
export const ADD_CLIENT_MAX_CALLS = 20;
export const RATE_LIMIT_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Marks roster docs a trainer created by hand, as opposed to derived from a booking. */
export const MANUAL_ROSTER_SOURCE = "trainer";

/** Server-only doc holding one trainer's counter (firestore.rules has no rule → denied). */
export function addClientRateLimitDocId(uid: string): string {
  return `addClient_${uid}`;
}

const EMAIL_RE = /^[^\s@/]+@[^\s@/]+\.[^\s@/]+$/;
const MAX_EMAIL_LENGTH = 254;

/** Trimmed + lowercased address, or null when it is not a plausible email. */
export function normalizeClientEmail(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const email = raw.trim().toLowerCase();
  if (email.length === 0 || email.length > MAX_EMAIL_LENGTH) return null;
  return EMAIL_RE.test(email) ? email : null;
}

/** Validates the callable payload; throws invalid-argument "invalid_email" otherwise. */
export function validateAddClientRequest(data: unknown): { email: string } {
  const raw = data && typeof data === "object" && !Array.isArray(data) ?
    (data as { email?: unknown }).email :
    undefined;
  const email = normalizeClientEmail(raw);
  if (!email) throw new HttpsError("invalid-argument", "invalid_email");
  return { email };
}

export interface RateLimitDecision {
  allowed: boolean;
  /** The call timestamps (ms) to store: pruned to the window, plus now when allowed. */
  calls: number[];
  /** When allowed is false: ms until the oldest call leaves the window. */
  retryAfterMs: number;
}

/**
 * Rolling-window limiter over the stored call timestamps. Stored garbage (a non-array, non-
 * numbers, future timestamps from a skewed clock) is dropped rather than trusted.
 */
export function decideRateLimit(
  stored: unknown,
  nowMs: number,
  max: number = ADD_CLIENT_MAX_CALLS,
  windowMs: number = RATE_LIMIT_WINDOW_MS,
): RateLimitDecision {
  const since = nowMs - windowMs;
  const recent = (Array.isArray(stored) ? stored : [])
    .filter((t): t is number => typeof t === "number" && Number.isFinite(t) && t > since && t <= nowMs)
    .sort((a, b) => a - b);
  if (recent.length >= max) {
    return { allowed: false, calls: recent, retryAfterMs: recent[recent.length - max] + windowMs - nowMs };
  }
  return { allowed: true, calls: [...recent, nowMs], retryAfterMs: 0 };
}

/**
 * Base URL of the web app for links in emails: APP_URL when configured (functions .env),
 * otherwise the project's default Hosting site.
 */
export function appBaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  const configured = env.APP_URL?.trim();
  if (configured) return configured.replace(/\/+$/, "");
  const project = env.GCLOUD_PROJECT || env.GCP_PROJECT || "vfit-funlife";
  return `https://${project}.web.app`;
}

export function registerUrl(env: NodeJS.ProcessEnv = process.env): string {
  return `${appBaseUrl(env)}/auth/register`;
}

/** What the dropdown needs about the newly added client. */
export interface AddedClient {
  id: string;
  userId: string;
  name: string;
  email: string;
}

export function addedClientFrom(id: string, data: Record<string, unknown>): AddedClient {
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  return { id, userId: str(data.userId), name: str(data.name), email: str(data.email) };
}

/**
 * Whether the platform takes money through Stripe, and whether it sells subscriptions.
 *
 * Pure module: the document path, the defaults and the merge, with no firebase-admin import,
 * so what an absent or half-written settings document means is testable on its own.
 *
 * The first release takes no money at all: bookings are paid to the trainer directly (see
 * ../bookings/payments.ts) and VIP is not on sale. The Stripe code stays deployed, and these
 * two switches are how a superadmin turns it on later without a release.
 */

export const PAYMENT_SETTINGS_DOC = "systemSettings/payments";

export interface PaymentSettings {
  /** Stripe card payments, customers and wallet top-ups. */
  stripePaymentsEnabled: boolean;
  /**
   * Selling VIP subscriptions. Only takes effect while `stripePaymentsEnabled` is also on —
   * a subscription is a Stripe charge — so it is stored as chosen and combined on read.
   */
  subscriptionsEnabled: boolean;
}

export const DEFAULT_PAYMENT_SETTINGS: PaymentSettings = {
  stripePaymentsEnabled: false,
  subscriptionsEnabled: false,
};

const KEYS = Object.keys(DEFAULT_PAYMENT_SETTINGS) as (keyof PaymentSettings)[];

/**
 * Merge a stored document over the defaults.
 *
 * Anything that is not an explicit boolean falls back to the default, which is off: taking
 * money has to be a deliberate act that shows in the data, never the result of a missing or
 * malformed document.
 */
export function mergePaymentSettings(
  stored: Partial<PaymentSettings> | undefined | null
): PaymentSettings {
  const merged = { ...DEFAULT_PAYMENT_SETTINGS };
  for (const key of KEYS) {
    if (typeof stored?.[key] === "boolean") merged[key] = stored[key] as boolean;
  }
  return merged;
}

/** Subscriptions can only be sold while Stripe payments are on. */
export function subscriptionsActive(settings: PaymentSettings): boolean {
  return settings.stripePaymentsEnabled && settings.subscriptionsEnabled;
}

/** Thrown for a payload the caller could fix by sending something else. */
export class PaymentSettingsValidationError extends Error {}

/** The settings patch to store, rejecting unknown keys and non-boolean values. */
export function validatePaymentSettingsUpdate(
  updates: Partial<PaymentSettings> | undefined
): Partial<PaymentSettings> {
  const keys = Object.keys(updates ?? {});
  if (keys.length === 0) {
    throw new PaymentSettingsValidationError("No settings supplied");
  }
  const patch: Partial<PaymentSettings> = {};
  for (const key of keys) {
    if (!KEYS.includes(key as keyof PaymentSettings)) {
      throw new PaymentSettingsValidationError(`Unknown setting: ${key}`);
    }
    const value = (updates as Record<string, unknown>)[key];
    if (typeof value !== "boolean") {
      throw new PaymentSettingsValidationError(`${key} must be a boolean`);
    }
    patch[key as keyof PaymentSettings] = value;
  }
  return patch;
}

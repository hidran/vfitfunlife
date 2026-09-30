import { describe, it, expect } from "vitest";
import {
  DEFAULT_PAYMENT_SETTINGS,
  PaymentSettingsValidationError,
  mergePaymentSettings,
  subscriptionsActive,
  validatePaymentSettingsUpdate,
} from "./paymentSettings";

describe("mergePaymentSettings", () => {
  it("defaults everything off when nothing is stored", () => {
    expect(mergePaymentSettings(undefined)).toEqual(DEFAULT_PAYMENT_SETTINGS);
    expect(mergePaymentSettings(null)).toEqual({
      stripePaymentsEnabled: false,
      subscriptionsEnabled: false,
    });
  });

  it("keeps explicit booleans", () => {
    expect(mergePaymentSettings({ stripePaymentsEnabled: true })).toEqual({
      stripePaymentsEnabled: true,
      subscriptionsEnabled: false,
    });
  });

  it("treats a value of the wrong type as off, not on", () => {
    const stored = { stripePaymentsEnabled: "true", subscriptionsEnabled: 1 } as never;
    expect(mergePaymentSettings(stored)).toEqual(DEFAULT_PAYMENT_SETTINGS);
  });
});

describe("subscriptionsActive", () => {
  it("needs both switches on", () => {
    expect(subscriptionsActive({ stripePaymentsEnabled: true, subscriptionsEnabled: true })).toBe(true);
    expect(subscriptionsActive({ stripePaymentsEnabled: false, subscriptionsEnabled: true })).toBe(false);
    expect(subscriptionsActive({ stripePaymentsEnabled: true, subscriptionsEnabled: false })).toBe(false);
  });
});

describe("validatePaymentSettingsUpdate", () => {
  it("accepts a partial boolean patch", () => {
    expect(validatePaymentSettingsUpdate({ subscriptionsEnabled: true })).toEqual({
      subscriptionsEnabled: true,
    });
  });

  it("rejects an empty payload", () => {
    expect(() => validatePaymentSettingsUpdate({})).toThrow(PaymentSettingsValidationError);
    expect(() => validatePaymentSettingsUpdate(undefined)).toThrow(PaymentSettingsValidationError);
  });

  it("rejects unknown keys and non-booleans", () => {
    expect(() => validatePaymentSettingsUpdate({ commission: true } as never)).toThrow(/Unknown setting/);
    expect(() => validatePaymentSettingsUpdate({ stripePaymentsEnabled: "yes" } as never)).toThrow(/boolean/);
  });
});

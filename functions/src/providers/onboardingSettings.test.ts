import { describe, it, expect } from "vitest";
import {
  DEFAULT_PROVIDER_ONBOARDING,
  ProviderOnboardingValidationError,
  mergeProviderOnboarding,
  shouldAutoApprove,
  validateProviderOnboardingUpdate,
} from "./onboardingSettings";

describe("mergeProviderOnboarding", () => {
  it("auto-approves by default, so an unconfigured project behaves like the shipped one", () => {
    expect(DEFAULT_PROVIDER_ONBOARDING.autoApprove).toBe(true);
    expect(mergeProviderOnboarding(undefined).autoApprove).toBe(true);
    expect(mergeProviderOnboarding(null).autoApprove).toBe(true);
    expect(mergeProviderOnboarding({}).autoApprove).toBe(true);
  });

  it("honours an explicit choice in either direction", () => {
    expect(mergeProviderOnboarding({ autoApprove: false }).autoApprove).toBe(false);
    expect(mergeProviderOnboarding({ autoApprove: true }).autoApprove).toBe(true);
  });

  it("falls back to the default for a value of the wrong type, never to false", () => {
    // The failure that matters: a malformed document silently switching every signup into a
    // review queue nobody is watching. Defaulting to `false` here would do exactly that.
    for (const bad of ["false", "true", 0, 1, null, [], {}]) {
      expect(
        mergeProviderOnboarding({ autoApprove: bad as unknown as boolean }).autoApprove
      ).toBe(true);
    }
  });
});

describe("validateProviderOnboardingUpdate", () => {
  it("accepts either boolean", () => {
    expect(validateProviderOnboardingUpdate({ autoApprove: false })).toEqual({ autoApprove: false });
    expect(validateProviderOnboardingUpdate({ autoApprove: true })).toEqual({ autoApprove: true });
  });

  it("refuses an empty payload rather than writing nothing and reporting success", () => {
    expect(() => validateProviderOnboardingUpdate({})).toThrow(ProviderOnboardingValidationError);
    expect(() => validateProviderOnboardingUpdate(undefined)).toThrow(ProviderOnboardingValidationError);
  });

  it("refuses unknown keys, so the callable cannot be used to write arbitrary settings", () => {
    expect(() =>
      validateProviderOnboardingUpdate({ autoApprove: true, role: "superadmin" } as never)
    ).toThrow(/Unknown setting: role/);
  });

  it("refuses a non-boolean, including the strings a form might send", () => {
    expect(() => validateProviderOnboardingUpdate({ autoApprove: "false" } as never)).toThrow(
      /must be a boolean/
    );
  });
});

describe("shouldAutoApprove", () => {
  it("follows the setting for an individual, exactly as before business accounts", () => {
    expect(shouldAutoApprove({ autoApprove: true }, "individual")).toBe(true);
    expect(shouldAutoApprove({ autoApprove: false }, "individual")).toBe(false);
  });

  it("never auto-approves a business, even with auto-approval ON (decision D2)", () => {
    // Someone has to check the P.IVA before a company is listed publicly.
    expect(shouldAutoApprove({ autoApprove: true }, "business")).toBe(false);
    expect(shouldAutoApprove({ autoApprove: false }, "business")).toBe(false);
  });
});
